
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { CargoProfile, PnLBucket, EmptyCargoProfile } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { detectUnit, recalculateProfile } from '../services/calculationService';
import { WorldMap } from './WorldMap';
import { CalendarView } from './CalendarView';
import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';

interface CargoListProps {
  profiles: CargoProfile[];
  onEdit: (profile: CargoProfile) => void;
  onDelete: (id: string) => void;
  onActualize: (profile: CargoProfile) => void;
  onBulkDelete: (ids: Set<string>) => void;
  onBulkUpdate?: (ids: Set<string>, updates: Partial<CargoProfile>) => void;
  onBulkImport?: (profiles: CargoProfile[]) => void;
}

type ViewMode = 'table' | 'map' | 'calendar';

const COLUMN_WIDTH = 180;

export const CargoList: React.FC<CargoListProps> = ({ 
    profiles, onEdit, onDelete, onActualize, onBulkDelete, onBulkUpdate, onBulkImport 
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isImportingJarvis, setIsImportingJarvis] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof CargoProfile | null; direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });
  const [activeFilters, setActiveFilters] = useState<Record<string, Set<any>>>({});
  
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const processedProfiles = useMemo(() => {
    let result = [...profiles];
    if (debouncedSearch) {
      const lower = debouncedSearch.toLowerCase();
      result = result.filter(p => Object.values(p).some(v => String(v || '').toLowerCase().includes(lower)));
    }
    Object.entries(activeFilters).forEach(([column, selectedValues]) => {
      const values = selectedValues as Set<any>;
      if (values.size > 0) {
        result = result.filter(p => values.has((p as any)[column]));
      }
    });
    if (sortConfig.key) {
      const { key, direction } = sortConfig;
      result.sort((a, b) => {
        const aVal = a[key!];
        const bVal = b[key!];
        if (aVal === bVal) return 0;
        if (aVal === undefined || aVal === null) return 1;
        if (bVal === undefined || bVal === null) return -1;
        if (typeof aVal === 'number' && typeof bVal === 'number') return direction === 'asc' ? aVal - bVal : bVal - aVal;
        return direction === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
      });
    }
    return result;
  }, [profiles, debouncedSearch, activeFilters, sortConfig]);

  const handleJarvisImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImportingJarvis(true);
    const loadingToast = toast.loading('Extracting Jarvis Workbook (.xlsm)...');
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const mergedData: Record<string, Partial<CargoProfile>> = {};
        
        const cleanNumeric = (val: any): number => {
            if (val === undefined || val === null || val === '' || val === '-' || String(val).trim() === '-') return 0;
            if (typeof val === 'number') return val;
            const str = String(val).replace(/,/g, '').trim();
            if (str.endsWith('%')) return parseFloat(str.slice(0, -1)) / 100;
            const num = parseFloat(str);
            return isNaN(num) ? 0 : num;
        };

        const extractSheetData = (sheetName: string, mapping: Record<string, string>) => {
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) return;
            const json: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            if (json.length === 0) return;
            
            let headerRowIndex = -1;
            for (let i = 0; i < Math.min(json.length, 100); i++) {
                const row = json[i];
                if (row.some(cell => String(cell || '').toLowerCase().trim() === 'strategy name')) {
                    headerRowIndex = i;
                    break;
                }
            }
            if (headerRowIndex === -1) return;
            const headers = json[headerRowIndex].map(h => String(h || '').toLowerCase().trim());
            const dataRows = json.slice(headerRowIndex + 1);

            const seenInSheetCount = new Map<string, number>();

            dataRows.forEach(row => {
                const stratIdx = headers.indexOf('strategy name');
                const stratName = row[stratIdx];
                if (!stratName || String(stratName).trim() === '') return;
                
                let cleanStratName = String(stratName).trim();
                const count = (seenInSheetCount.get(cleanStratName) || 0) + 1;
                seenInSheetCount.set(cleanStratName, count);

                let isTier2Leg = count > 1 || cleanStratName.includes('t(') || cleanStratName.endsWith('t');
                const lookupName = cleanStratName.replace('t(', '(').replace(/t$/, '');

                if (!mergedData[lookupName]) mergedData[lookupName] = { ...EmptyCargoProfile, strategyName: lookupName };
                
                if (isTier2Leg) {
                    mergedData[lookupName].isTieredPricing = true;
                }

                Object.entries(mapping).forEach(([excelHeader, profileKey]) => {
                    const idx = headers.indexOf(excelHeader.toLowerCase().trim());
                    if (idx !== -1 && row[idx] !== undefined && row[idx] !== '') {
                        const rawVal = row[idx];
                        
                        const isStringData = 
                            profileKey.toLowerCase().includes('index') || 
                            profileKey.toLowerCase().includes('monthdef') ||
                            profileKey.toLowerCase().includes('formula') ||
                            ['source', 'buyer', 'strategyName', 'manualGroup', 'deliveryDate', 'loadingDate', 'incoterms'].includes(profileKey);

                        const val = isStringData ? String(rawVal).trim() : cleanNumeric(rawVal);

                        if (isTier2Leg && (sheetName === 'Purchase' || sheetName === 'Sales')) {
                             if (profileKey === 'deliveredVolume') {
                                 mergedData[lookupName].tier2DeliveredVolume = val as number;
                             } else if (profileKey === 'loadedVolume') {
                                 mergedData[lookupName].tier2LoadedVolume = val as number;
                             } else if (profileKey === 'sellFormula') {
                                 mergedData[lookupName].tier2SellFormula = val as string;
                             } else if (profileKey === 'buyFormula') {
                                 mergedData[lookupName].tier2BuyFormula = val as string;
                             } else if (profileKey.startsWith('sellPrice') || profileKey.startsWith('buyPrice')) {
                                 const tier2Key = profileKey.replace('sellPrice', 'tier2SellPrice').replace('buyPrice', 'tier2BuyPrice');
                                 (mergedData[lookupName] as any)[tier2Key] = val;
                             }
                        } else {
                             if (sheetName === 'Cost' && profileKey === 'reconciledSrcCost') {
                                (mergedData[lookupName] as any)[profileKey] = ((mergedData[lookupName] as any)[profileKey] || 0) + (val as number);
                             } else if (rawVal instanceof Date) {
                                 // CRITICAL FIX: Add 12 hours to shift date into the middle of the intended day 
                                 // before UTC extraction. This bypasses timezone-induced shifts (e.g. for KL UTC+8).
                                 const adjustedDate = new Date(rawVal.getTime() + (12 * 60 * 60 * 1000));
                                 const y = adjustedDate.getUTCFullYear();
                                 const m = String(adjustedDate.getUTCMonth() + 1).padStart(2, '0');
                                 const d = String(adjustedDate.getUTCDate()).padStart(2, '0');
                                 (mergedData[lookupName] as any)[profileKey] = `${y}-${m}-${d}`;
                             } else if (profileKey === 'optimized') {
                                 mergedData[lookupName].optimized = String(rawVal).toLowerCase().includes('yes') || rawVal === true;
                             } else {
                                 (mergedData[lookupName] as any)[profileKey] = val;
                             }
                        }
                    }
                });
            });
        };

        const purchaseMap: Record<string, string> = {
            'Source': 'source', 'No.': 'jarvisNo', 'Buyer': 'buyer', 'Optimized': 'optimized', 'Loading Date': 'loadingDate', 'Loaded Volume': 'loadedVolume', 'Buy Formula': 'buyFormula', 'Buy Price Overall Constant': 'buyPriceOverallConstant'
        };
        for (let i = 1; i <= 3; i++) {
            purchaseMap[`Buy Price ${i} Weightage`] = `buyPrice${i}Weightage`;
            purchaseMap[`Buy Price ${i} slope`] = `buyPrice${i}Slope`;
            purchaseMap[`Buy Price Index ${i}`] = `buyPriceIndex${i}`;
            purchaseMap[`Buy Price ${i} Month Definition`] = `buyPrice${i}MonthDef`;
            purchaseMap[`Buy Price ${i} constant`] = `buyPrice${i}Constant`;
        }
        extractSheetData('Purchase', purchaseMap);

        const salesMap: Record<string, string> = {
            'Buyer': 'buyer', 'Delivery Date': 'deliveryDate', 'Delivered Volume': 'deliveredVolume', 'Sell Formula': 'sellFormula', 'Sell Price Overall Constant': 'sellPriceOverallConstant'
        };
        for (let i = 1; i <= 3; i++) {
            salesMap[`Sell Price ${i} Weightage`] = `sellPrice${i}Weightage`;
            salesMap[`Sell Price ${i} slope`] = `sellPrice${i}Slope`;
            salesMap[`Sell Price Index ${i}`] = `sellPriceIndex${i}`;
            salesMap[`Sell Price ${i} Month Definition`] = `sellPrice${i}MonthDef`;
            salesMap[`Sell Price ${i} constant`] = `sellPrice${i}Constant`;
        }
        extractSheetData('Sales', salesMap);

        extractSheetData('Cost', { 'Incoterm': 'incoterms', 'SRC': 'reconciledSrcCost' });

        const finalProfiles = Object.values(mergedData).map(p => {
            const existing = profiles.find(ep => ep.strategyName === p.strategyName);
            const fullProfile = { ...p, id: existing?.id || Math.random().toString(36).substr(2, 9) } as CargoProfile;
            return recalculateProfile(fullProfile) as CargoProfile;
        });

        if (onBulkImport) onBulkImport(finalProfiles);
        toast.success(`Imported ${finalProfiles.length} combined strategies with components`, { id: loadingToast });
      } catch (err) {
        console.error(err);
        toast.error('Failed to parse Jarvis Macro workbook', { id: loadingToast });
      } finally {
        setIsImportingJarvis(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleJarvisExport = () => {
    if (profiles.length === 0) return toast.error("No data to export");
    const workbook = XLSX.utils.book_new();
    const purchaseRows: any[] = [];
    const salesRows: any[] = [];
    const costRows: any[] = [];

    processedProfiles.forEach(p => {
        const buildRow = (type: 'Buy' | 'Sell', tier: 1 | 2) => {
            const prefix = tier === 1 ? (type === 'Buy' ? 'buyPrice' : 'sellPrice') : (type === 'Buy' ? 'tier2BuyPrice' : 'tier2SellPrice');
            const volKey = tier === 1 ? (type === 'Buy' ? 'loadedVolume' : 'deliveredVolume') : (type === 'Buy' ? 'tier2LoadedVolume' : 'tier2DeliveredVolume');
            const formulaKey = tier === 1 ? (type === 'Buy' ? 'buyFormula' : 'sellFormula') : (type === 'Buy' ? 'tier2BuyFormula' : 'tier2SellFormula');
            
            const row: any = { 'Strategy Name': p.strategyName + (tier === 2 ? 't' : '') };
            if (type === 'Buy') {
                row['Source'] = p.source; row['No.'] = p.jarvisNo; row['Buyer'] = p.buyer; row['Optimized'] = p.optimized ? 'Yes' : 'No'; row['Loading Date'] = p.loadingDate;
            } else {
                row['Buyer'] = p.buyer; row['Delivery Date'] = p.deliveryDate;
            }
            row[`${type} Volume`] = (p as any)[volKey];
            row[`${type} Formula`] = (p as any)[formulaKey];
            for (let i = 1; i <= 3; i++) {
                row[`${type} Price ${i} Weightage`] = (p as any)[`${prefix}${i}Weightage`];
                row[`${type} Price ${i} slope`] = (p as any)[`${prefix}${i}Slope`];
                row[`${type} Price Index ${i}`] = (p as any)[`${prefix}Index${i}`];
                row[`${type} Price ${i} Month Definition`] = (p as any)[`${prefix}${i}MonthDef`];
                row[`${type} Price ${i} constant`] = (p as any)[`${prefix}${i}Constant`];
            }
            row[`${type} Price Overall Constant`] = (p as any)[`${prefix}OverallConstant`];
            return row;
        };

        purchaseRows.push(buildRow('Buy', 1));
        salesRows.push(buildRow('Sell', 1));
        costRows.push({ 'Strategy Name': p.strategyName, 'Incoterm': p.incoterms, 'SRC': p.reconciledSrcCost });
        
        if (p.isTieredPricing) {
            purchaseRows.push(buildRow('Buy', 2));
            salesRows.push(buildRow('Sell', 2));
        }
    });

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(purchaseRows), 'Purchase');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(salesRows), 'Sales');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(costRows), 'Cost');
    XLSX.writeFile(workbook, `Jarvis_Export_${new Date().toISOString().split('T')[0]}.xlsm`, { bookType: 'xlsm' });
  };

  const handleSort = (key: keyof CargoProfile) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
      <div className="px-6 py-3 border-b border-slate-200 flex justify-between items-center bg-white">
        <div className="flex items-center gap-4">
            <div className="flex bg-slate-100 p-1 rounded-lg">
                {(['table', 'map', 'calendar'] as ViewMode[]).map(mode => (
                    <button key={mode} onClick={() => setViewMode(mode)} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all capitalize ${viewMode === mode ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{mode}</button>
                ))}
            </div>
            <div className="relative w-64">
                <input type="text" placeholder="Search cargo..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20" />
                <svg className="absolute left-3 top-2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
        </div>
        <div className="flex items-center gap-2">
            <input type="file" ref={fileInputRef} accept=".xlsm, .xlsx" onChange={handleJarvisImport} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-colors flex items-center gap-2 shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                Import Jarvis
            </button>
            <button onClick={handleJarvisExport} className="text-xs font-bold text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-2 shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Export Jarvis
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative bg-slate-50/30">
        <AnimatePresence mode="wait">
            {viewMode === 'table' ? (
                <div className="h-full overflow-auto custom-scrollbar">
                    <div className="min-w-max relative h-full">
                        <div className="sticky top-0 bg-white z-40 border-b-2 border-slate-200 flex">
                            <div className="px-4 py-3 bg-slate-50 border-r border-slate-200 flex items-center w-12 shrink-0">
                                <input type="checkbox" className="rounded border-slate-300 text-indigo-600" />
                            </div>
                            {['strategyName', 'manualGroup', 'buyer', 'source', 'deliveryDate', 'loadingDate', 'finalTotalPnL', 'pnlBucket'].map((field) => (
                                <div key={field} className="px-4 py-3 bg-slate-50 border-r border-slate-100 flex items-center justify-between gap-2 relative shrink-0" style={{ width: field === 'finalTotalPnL' ? 140 : field === 'pnlBucket' ? 120 : COLUMN_WIDTH }}>
                                    <span className="font-bold truncate uppercase tracking-tight text-[10px] text-slate-600">{field}</span>
                                    <button onClick={() => handleSort(field as any)} className="p-1 rounded hover:bg-slate-200">
                                        <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </button>
                                </div>
                            ))}
                            <div className="px-4 py-3 bg-slate-100 border-l border-slate-200 sticky right-0 z-50 w-32 shrink-0 font-bold text-[10px] text-slate-600 uppercase text-center">Actions</div>
                        </div>
                        <div className="bg-white">
                            {processedProfiles.map((p) => (
                                <div key={p.id} className="flex border-b border-slate-100 transition-colors hover:bg-indigo-50/30 group">
                                    <div className="px-4 py-3 border-r border-slate-100 w-12 shrink-0 flex items-center bg-white"><input type="checkbox" className="rounded border-slate-300 text-indigo-600" /></div>
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] font-bold text-slate-900 border-r border-slate-50" style={{ width: COLUMN_WIDTH }}>
                                        {p.strategyName}
                                        {p.isTieredPricing && <span className="ml-2 px-1 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[9px]">2 TIER</span>}
                                    </div>
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50" style={{ width: COLUMN_WIDTH }}>{p.manualGroup || '-'}</div>
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50" style={{ width: COLUMN_WIDTH }}>{p.buyer}</div>
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50" style={{ width: COLUMN_WIDTH }}>{p.source}</div>
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50" style={{ width: COLUMN_WIDTH }}>{p.deliveryDate}</div>
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50" style={{ width: COLUMN_WIDTH }}>{p.loadingDate}</div>
                                    <div className={`px-4 py-3 shrink-0 truncate text-[11px] font-bold border-r border-slate-50 text-right ${p.finalTotalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`} style={{ width: 140 }}>{formatCurrency(p.finalTotalPnL)}</div>
                                    <div className="px-4 py-3 shrink-0 text-center border-r border-slate-50" style={{ width: 120 }}><span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase ${p.pnlBucket === PnLBucket.Realized ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{p.pnlBucket}</span></div>
                                    <div className="px-4 py-3 border-l border-slate-100 sticky right-0 z-20 bg-white group-hover:bg-slate-50 w-32 shrink-0 flex items-center justify-center gap-1">
                                        <button onClick={() => onEdit(p)} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                        <button onClick={() => onDelete(p.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : viewMode === 'map' ? (
                <WorldMap profiles={processedProfiles} height="100%" />
            ) : (
                <CalendarView profiles={processedProfiles} />
            )}
        </AnimatePresence>
      </div>
    </div>
  );
};
