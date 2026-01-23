
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
const STRATEGY_CATEGORIES = ['PL9SB', 'PFLNG1', 'PFLNG2', 'Cheniere', 'LNGC', 'Spot', 'GLNG', 'CSPA'];

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
  const [openFilterMenu, setOpenFilterMenu] = useState<string | null>(null);
  const [menuSearch, setMenuSearch] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenFilterMenu(null);
        setMenuSearch('');
        setExpandedNodes(new Set());
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        
        const extractSheetData = (sheetName: string, mapping: Record<string, string>) => {
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) return;
            const json: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            if (json.length === 0) return;
            
            let headerRowIndex = -1;
            for (let i = 0; i < Math.min(json.length, 100); i++) {
                if (json[i].some(cell => String(cell || '').toLowerCase().trim() === 'strategy name')) {
                    headerRowIndex = i;
                    break;
                }
            }
            if (headerRowIndex === -1) return;
            const headers = json[headerRowIndex].map(h => String(h || '').toLowerCase().trim());
            const dataRows = json.slice(headerRowIndex + 1);

            const seenInSheet = new Set<string>();

            dataRows.forEach(row => {
                const stratIdx = headers.indexOf('strategy name');
                const stratName = row[stratIdx];
                if (!stratName || String(stratName).trim() === '') return;
                
                let cleanStratName = String(stratName).trim();
                let isTier2Leg = false;
                
                if (cleanStratName.includes('t(')) {
                    isTier2Leg = true;
                    cleanStratName = cleanStratName.replace('t(', '(');
                } else if (cleanStratName.endsWith('t')) {
                    isTier2Leg = true;
                    cleanStratName = cleanStratName.slice(0, -1);
                }

                if (seenInSheet.has(cleanStratName) && (sheetName === 'Sales')) {
                    isTier2Leg = true;
                }
                seenInSheet.add(cleanStratName);

                if (!mergedData[cleanStratName]) mergedData[cleanStratName] = { ...EmptyCargoProfile, strategyName: cleanStratName };
                
                if (isTier2Leg) {
                    mergedData[cleanStratName].isTieredPricing = true;
                }

                Object.entries(mapping).forEach(([excelHeader, profileKey]) => {
                    const idx = headers.indexOf(excelHeader.toLowerCase().trim());
                    if (idx !== -1 && row[idx] !== undefined && row[idx] !== '') {
                        const val = row[idx];
                        
                        // Handle Tier 2 Mapping
                        if (isTier2Leg) {
                             if (profileKey === 'deliveredVolume') {
                                 mergedData[cleanStratName].tier2DeliveredVolume = (mergedData[cleanStratName].tier2DeliveredVolume || 0) + (typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, '')));
                             } else if (profileKey === 'sellFormula') {
                                 mergedData[cleanStratName].tier2SellFormula = String(val);
                             } else if (profileKey.startsWith('sellPrice')) {
                                 const tier2Key = profileKey.replace('sellPrice', 'tier2SellPrice');
                                 if (typeof (EmptyCargoProfile as any)[tier2Key] !== 'undefined') {
                                     (mergedData[cleanStratName] as any)[tier2Key] = val;
                                 }
                             }
                             return; 
                        }

                        // Handle Combined Numerical Aggregation for non-Sales sheets
                        if (sheetName !== 'Sales' && (profileKey === 'reconciledSrcCost' || profileKey === 'loadedVolume')) {
                            const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
                            (mergedData[cleanStratName] as any)[profileKey] = ((mergedData[cleanStratName] as any)[profileKey] || 0) + num;
                        } else if (val instanceof Date) {
                             const y = val.getFullYear();
                             const m = String(val.getMonth() + 1).padStart(2, '0');
                             const d = String(val.getDate()).padStart(2, '0');
                             (mergedData[cleanStratName] as any)[profileKey] = `${y}-${m}-${d}`;
                        } else if (profileKey === 'optimized') {
                             mergedData[cleanStratName][profileKey] = String(val).toLowerCase().includes('yes') || val === true;
                        } else {
                             (mergedData[cleanStratName] as any)[profileKey] = val;
                        }
                    }
                });
            });
        };

        // Purchase Mapping
        extractSheetData('Purchase', {
            'Source': 'source', 'No.': 'jarvisNo', 'Buyer': 'buyer', 'Optimized': 'optimized', 'Loading Date': 'loadingDate', 'Loaded Volume': 'loadedVolume', 'Buy Price 1 Weightage': 'buyPrice1Weightage', 'Buy Price 1 slope': 'buyPrice1Slope', 'Buy Price Index 1': 'buyPriceIndex1', 'Buy Price 1 Month Definition': 'buyPrice1MonthDef', 'Buy Price 1 constant': 'buyPrice1Constant', 'Buy Price 2 Weightage': 'buyPrice2Weightage', 'Buy Price 2 slope': 'buyPrice2Slope', 'Buy Price Index 2': 'buyPriceIndex2', 'Buy Price 2 Month Definition': 'buyPrice2MonthDef', 'Buy Price 2 constant': 'buyPrice2Constant', 'Buy Price 3 Weightage': 'buyPrice3Weightage', 'Buy Price 3 slope': 'buyPrice3Slope', 'Buy Price Index 3': 'buyPriceIndex3', 'Buy Price 3 Month Definition': 'buyPrice3MonthDef', 'Buy Price 3 constant': 'buyPrice3Constant', 'Buy Price Overall Constant': 'buyPriceOverallConstant'
        });

        // Sales Mapping
        extractSheetData('Sales', {
            'Buyer': 'buyer', 'Delivery Date': 'deliveryDate', 'Delivered Volume': 'deliveredVolume', 'Sell Formula': 'sellFormula', 'Sell Price 1 Weightage': 'sellPrice1Weightage', 'Sell Price 1 slope': 'sellPrice1Slope', 'Sell Price Index 1': 'sellPriceIndex1', 'Sell Price 1 Month Definition': 'sellPrice1MonthDef', 'Sell Price 1 constant': 'sellPrice1Constant', 'Sell Price 2 Weightage': 'sellPrice2Weightage', 'Sell Price 2 slope': 'sellPrice2Slope', 'Sell Price Index 2': 'sellPriceIndex2', 'Sell Price 2 Month Definition': 'sellPrice2MonthDef', 'Sell Price 2 constant': 'sellPrice2Constant', 'Sell Price 3 Weightage': 'sellPrice3Weightage', 'Sell Price 3 slope': 'sellPrice3Slope', 'Sell Price Index 3': 'sellPriceIndex3', 'Sell Price 3 Month Definition': 'sellPrice3MonthDef', 'Sell Price 3 constant': 'sellPrice3Constant', 'Sell Price Overall Constant': 'sellPriceOverallConstant'
        });

        // Cost Sheet Mapping
        extractSheetData('Cost', {
            'Incoterm': 'incoterms',
            'SRC': 'reconciledSrcCost'
        });

        const finalProfiles = Object.values(mergedData).map(p => {
            const existing = profiles.find(ep => ep.strategyName === p.strategyName);
            const fullProfile = { ...p, id: existing?.id || Math.random().toString(36).substr(2, 9) } as CargoProfile;
            return recalculateProfile(fullProfile) as CargoProfile;
        });

        if (onBulkImport) onBulkImport(finalProfiles);
        toast.success(`Parsed ${finalProfiles.length} combined strategies`, { id: loadingToast });
      } catch (err) {
        console.error(err);
        toast.error('Failed to process Jarvis Macro workbook', { id: loadingToast });
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
        const pRow = {
            'Source': p.source || '', 'No.': p.jarvisNo || '', 'Strategy Name': p.strategyName || '', 'Buyer': p.buyer || '', 'Optimized': p.optimized ? 'Yes' : 'No', 'Loading Date': p.loadingDate || '', 'Loaded Volume': p.loadedVolume || 0, 'Buy Price 1 Weightage': p.buyPrice1Weightage ?? '', 'Buy Price 1 slope': p.buyPrice1Slope ?? '', 'Buy Price Index 1': p.buyPriceIndex1 ?? '', 'Buy Price 1 Month Definition': p.buyPrice1MonthDef ?? '', 'Buy Price 1 constant': p.buyPrice1Constant ?? '', 'Buy Price Overall Constant': p.buyPriceOverallConstant ?? ''
        };
        purchaseRows.push(pRow);

        const sRow = {
            'Strategy Name': p.strategyName || '', 'Buyer': p.buyer || '', 'Delivery Date': p.deliveryDate || '', 'Delivered Volume': p.deliveredVolume || 0, 'Sell Formula': p.sellFormula || '', 'Sell Price 1 Weightage': p.sellPrice1Weightage ?? '', 'Sell Price 1 slope': p.sellPrice1Slope ?? '', 'Sell Price Index 1': p.sellPriceIndex1 ?? '', 'Sell Price 1 Month Definition': p.sellPrice1MonthDef ?? '', 'Sell Price 1 constant': p.sellPrice1Constant ?? '', 'Sell Price Overall Constant': p.sellPriceOverallConstant ?? ''
        };
        salesRows.push(sRow);

        const cRow = {
            'Strategy Name': p.strategyName || '', 'Incoterm': p.incoterms || '', 'SRC': p.reconciledSrcCost || 0
        };
        costRows.push(cRow);

        if (p.isTieredPricing) {
            const tSalesRow = {
                'Strategy Name': p.strategyName || '', 
                'Buyer': p.buyer || '', 
                'Delivery Date': p.deliveryDate || '',
                'Delivered Volume': p.tier2DeliveredVolume || 0,
                'Sell Formula': p.tier2SellFormula || '',
                'Sell Price 1 Weightage': p.tier2SellPrice1Weightage ?? '',
                'Sell Price 1 slope': p.tier2SellPrice1Slope ?? '',
                'Sell Price Index 1': p.tier2SellPriceIndex1 ?? '',
                'Sell Price 1 Month Definition': p.tier2SellPrice1MonthDef ?? '',
                'Sell Price 1 constant': p.tier2SellPrice1Constant ?? '',
                'Sell Price Overall Constant': p.tier2SellPriceOverallConstant ?? '',
                'Sell Price Overall Constant Weightage': 1
            };
            salesRows.push(tSalesRow);
        }
    });

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(purchaseRows), 'Purchase');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(salesRows), 'Sales');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(costRows), 'Cost');
    XLSX.writeFile(workbook, `Jarvis_Export_${new Date().toISOString().split('T')[0]}.xlsm`, { bookType: 'xlsm' });
  };

  const handleSort = (key: keyof CargoProfile) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
    setOpenFilterMenu(null);
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
                            {['strategyName', 'manualGroup', 'buyer', 'source', 'deliveryDate', 'loadingDate', 'finalTotalPnL', 'pnlBucket'].map((key) => (
                                <div key={key} className="px-4 py-3 bg-slate-50 border-r border-slate-100 flex items-center justify-between gap-2 relative shrink-0" style={{ width: key === 'finalTotalPnL' ? 140 : key === 'pnlBucket' ? 120 : COLUMN_WIDTH }}>
                                    <span className="font-bold truncate uppercase tracking-tight text-[10px] text-slate-600">{key}</span>
                                    <button onClick={() => handleSort(key as any)} className="p-1 rounded hover:bg-slate-200">
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
