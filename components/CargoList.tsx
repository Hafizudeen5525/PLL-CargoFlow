
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { CargoProfile, PnLBucket, EmptyCargoProfile } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { detectUnit, recalculateProfile, getGroupName, GROUPS, getPortfolioYear } from '../services/calculationService';
import { WorldMap } from './WorldMap';
import { CalendarView } from './CalendarView';
import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';
import { ReconciliationData } from './DiscrepancyCheck';

interface CargoListProps {
  profiles: CargoProfile[];
  onEdit: (profile: CargoProfile) => void;
  onDelete: (id: string) => void;
  onActualize: (profile: CargoProfile) => void;
  onBulkDelete: (ids: Set<string>) => void;
  onBulkUpdate?: (ids: Set<string>, updates: Partial<CargoProfile>) => void;
  onBulkImport?: (profiles: CargoProfile[]) => void;
  trmsData?: ReconciliationData;
}

type ViewMode = 'table' | 'map' | 'calendar';

const COLUMN_WIDTH = 180;
const STRATEGY_COL_WIDTH = 210;

export const CargoList: React.FC<CargoListProps> = ({ 
    profiles, onEdit, onDelete, onActualize, onBulkDelete, onBulkUpdate, onBulkImport, trmsData 
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isImportingJarvis, setIsImportingJarvis] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const exportPopoverRef = useRef<HTMLDivElement>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string | null; direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });
  
  // Advanced Filtering State
  const [activeFilters, setActiveFilters] = useState<Record<string, Set<any>>>({});
  const [openFilterMenu, setOpenFilterMenu] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Export Configuration State
  const [isExportPopoverOpen, setIsExportPopoverOpen] = useState(false);
  const [exportYear, setExportYear] = useState<string>('All');
  const [exportGroup, setExportGroup] = useState<string>('All');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setOpenFilterMenu(null);
        setFilterSearch('');
      }
      if (exportPopoverRef.current && !exportPopoverRef.current.contains(event.target as Node)) {
        setIsExportPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const headerKeys = [
    'strategyName', 'buyer', 'source', 'deliveryDate', 'loadingDate', 
    'absoluteBuyPrice', 'loadedVolume', 'purchaseCost', 
    'absoluteSellPrice', 'deliveredVolume', 'salesRevenue', 
    'reconciledSrcCost', 'trmsHedging', 'finalTotalPnL', 'pnlBucket'
  ];

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
        let aVal = (a as any)[key!];
        let bVal = (b as any)[key!];
        
        if (key === 'purchaseCost') {
            aVal = (a.absoluteBuyPrice * a.loadedVolume) + (a.isTieredPricing ? (a.absoluteTier2BuyPrice! * a.tier2LoadedVolume!) : 0);
            bVal = (b.absoluteBuyPrice * b.loadedVolume) + (b.isTieredPricing ? (b.absoluteTier2BuyPrice! * b.tier2LoadedVolume!) : 0);
        }

        if (aVal === bVal) return 0;
        if (aVal === undefined || aVal === null) return 1;
        if (bVal === undefined || bVal === null) return -1;
        if (typeof aVal === 'number' && typeof bVal === 'number') return direction === 'asc' ? aVal - bVal : bVal - aVal;
        return direction === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
      });
    }
    return result;
  }, [profiles, debouncedSearch, activeFilters, sortConfig]);

  const filterData = useMemo(() => {
    const values: Record<string, any[]> = {};
    const strategyHierarchy: Record<string, string[]> = {};
    const dateHierarchies: Record<string, any> = {};

    headerKeys.forEach(header => {
      if (header === 'strategyName') {
        profiles.forEach(p => {
          const group = getGroupName(p.strategyName);
          if (!strategyHierarchy[group]) strategyHierarchy[group] = [];
          if (!strategyHierarchy[group].includes(p.strategyName)) strategyHierarchy[group].push(p.strategyName);
        });
        Object.keys(strategyHierarchy).forEach(g => strategyHierarchy[g].sort());
      } else if (header === 'deliveryDate' || header === 'loadingDate') {
        const hierarchy: any = {};
        profiles.forEach(p => {
          const dStr = (p as any)[header] as string;
          if (!dStr) return;
          const [y, m, d] = dStr.split('-');
          const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleString('default', { month: 'long' });
          if (!hierarchy[y]) hierarchy[y] = {};
          if (!hierarchy[y][monthName]) hierarchy[y][monthName] = new Set();
          hierarchy[y][monthName].add(dStr);
        });
        dateHierarchies[header] = hierarchy;
      } else if (!['purchaseCost', 'salesRevenue', 'trmsHedging'].includes(header)) {
        const uniqueSet = new Set(profiles.map(p => (p as any)[header]));
        values[header] = Array.from(uniqueSet).sort();
      }
    });
    return { values, strategyHierarchy, dateHierarchies };
  }, [profiles, headerKeys]);

  const availableExportYears = useMemo(() => {
    const years = new Set<string>();
    profiles.forEach(p => years.add(getPortfolioYear(p).toString()));
    return ['All', ...Array.from(years).sort().reverse()];
  }, [profiles]);

  const availableExportGroups = useMemo(() => {
    return ['All', ...GROUPS, 'Others'];
  }, []);

  const toggleValueFilter = (header: string, value: any) => {
    setActiveFilters(prev => {
      const next = { ...prev };
      const currentSet = new Set(next[header] || []);
      if (currentSet.has(value)) currentSet.delete(value); else currentSet.add(value);
      if (currentSet.size === 0) delete next[header]; else next[header] = currentSet;
      return next;
    });
  };

  const bulkToggle = (column: string, values: any[], shouldSelect: boolean) => {
    setActiveFilters(prev => {
        const next = { ...prev };
        const currentSet = new Set(next[column] || []);
        values.forEach(v => { if (shouldSelect) currentSet.add(v); else currentSet.delete(v); });
        if (currentSet.size === 0) delete next[column]; else next[column] = currentSet;
        return next;
    });
  };

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
            const headersArr = json[headerRowIndex].map(h => String(h || '').toLowerCase().trim());
            const dataRows = json.slice(headerRowIndex + 1);

            const seenInSheetCount = new Map<string, number>();

            dataRows.forEach(row => {
                const stratIdx = headersArr.indexOf('strategy name');
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
                    const idx = headersArr.indexOf(excelHeader.toLowerCase().trim());
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

        const finalProfilesArr = Object.values(mergedData).map(p => {
            const existing = profiles.find(ep => ep.strategyName === p.strategyName);
            const fullProfile = { ...p, id: existing?.id || Math.random().toString(36).substr(2, 9) } as CargoProfile;
            return recalculateProfile(fullProfile) as CargoProfile;
        });

        if (onBulkImport) onBulkImport(finalProfilesArr);
        toast.success(`Imported ${finalProfilesArr.length} combined strategies`, { id: loadingToast });
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

  const formatTieredName = (name: string): string => {
      const match = name.match(/^(.*\d)(.*)$/);
      if (match) {
          return match[1] + 't' + match[2];
      }
      return name + 't';
  };

  const handleJarvisExport = () => {
    let exportProfiles = profiles;
    if (exportYear !== 'All') exportProfiles = exportProfiles.filter(p => getPortfolioYear(p).toString() === exportYear);
    if (exportGroup !== 'All') exportProfiles = exportProfiles.filter(p => getGroupName(p.strategyName) === exportGroup);

    if (exportProfiles.length === 0) return toast.error("No data found for the selected export filters");

    const workbook = XLSX.utils.book_new();
    const purchaseRows: any[] = [];
    const salesRows: any[] = [];
    const costRows: any[] = [];

    exportProfiles.forEach(p => {
        const buildRow = (type: 'Buy' | 'Sell', tier: 1 | 2) => {
            const prefix = tier === 1 ? (type === 'Buy' ? 'buyPrice' : 'sellPrice') : (type === 'Buy' ? 'tier2BuyPrice' : (type === 'Sell' ? 'tier2SellPrice' : 'sellPrice'));
            const volKey = tier === 1 ? (type === 'Buy' ? 'loadedVolume' : 'deliveredVolume') : (type === 'Buy' ? 'tier2LoadedVolume' : 'tier2DeliveredVolume');
            const formulaKey = tier === 1 ? (type === 'Buy' ? 'buyFormula' : 'sellFormula') : (type === 'Buy' ? 'tier2BuyFormula' : 'tier2SellFormula');
            
            const strategyName = tier === 1 ? p.strategyName : formatTieredName(p.strategyName);
            const row: any = { 'Strategy Name': strategyName };
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
        costRows.push({ 'Strategy Name': p.strategyName, 'Incoterm': p.incoterms, 'SRC': p.reconciledSrcCost || 0 });
        
        if (p.isTieredPricing) {
            purchaseRows.push(buildRow('Buy', 2));
            salesRows.push(buildRow('Sell', 2));
            costRows.push({ 'Strategy Name': formatTieredName(p.strategyName), 'Incoterm': p.incoterms, 'SRC': 0 });
        }
    });

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(purchaseRows), 'Purchase');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(salesRows), 'Sales');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(costRows), 'Cost');
    
    const fileName = `Jarvis_Export_${exportYear}_${exportGroup}_${new Date().toISOString().split('T')[0]}.xlsm`;
    XLSX.writeFile(workbook, fileName, { bookType: 'xlsm' });
    setIsExportPopoverOpen(false);
    toast.success(`Exported ${exportProfiles.length} strategies to ${fileName}`);
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const toggleSelectAll = useCallback(() => {
    const allVisibleSelected = processedProfiles.every(p => selectedIds.has(p.id));
    if (allVisibleSelected && processedProfiles.length > 0) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        processedProfiles.forEach(p => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        processedProfiles.forEach(p => next.add(p.id));
        return next;
      });
    }
  }, [processedProfiles, selectedIds]);

  const isAllVisibleSelected = processedProfiles.length > 0 && processedProfiles.every(p => selectedIds.has(p.id));
  const isSomeVisibleSelected = processedProfiles.some(p => selectedIds.has(p.id)) && !isAllVisibleSelected;

  // Fix: Removed duplicate maximumFractionDigits property
  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  const formatPrice = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(val);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
      <div className="px-4 lg:px-6 py-3 border-b border-slate-200 flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <div className="flex bg-slate-100 p-1 rounded-lg">
                {(['table', 'map', 'calendar'] as ViewMode[]).map(mode => (
                    <button key={mode} onClick={() => setViewMode(mode)} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold rounded-md transition-all capitalize ${viewMode === mode ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{mode}</button>
                ))}
            </div>
            <div className="relative flex-1 sm:w-64">
                <input type="text" placeholder="Search cargo..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20" />
                <svg className="absolute left-3 top-2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 w-full lg:w-auto custom-scrollbar">
            <input type="file" accept=".xlsm, .xlsx" onChange={handleJarvisImport} className="hidden" ref={fileInputRef} />
            <button onClick={() => fileInputRef.current?.click()} className="whitespace-nowrap text-[10px] sm:text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-colors flex items-center gap-2 shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                Import Jarvis
            </button>
            <div className="relative">
                <button 
                    onClick={() => setIsExportPopoverOpen(!isExportPopoverOpen)} 
                    className={`whitespace-nowrap text-[10px] sm:text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-2 shadow-sm ${isExportPopoverOpen ? 'bg-indigo-600 text-white border-indigo-600' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'}`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Export Jarvis
                </button>

                <AnimatePresence>
                    {isExportPopoverOpen && (
                        <motion.div 
                            ref={exportPopoverRef}
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 shadow-2xl rounded-xl p-5 z-[100] text-slate-700"
                        >
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Export Configuration</h4>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Portfolio Year</label>
                                    <select value={exportYear} onChange={(e) => setExportYear(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium p-2 focus:ring-2 focus:ring-indigo-500/20">
                                        {availableExportYears.map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Portfolio Group</label>
                                    <select value={exportGroup} onChange={(e) => setExportGroup(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium p-2 focus:ring-2 focus:ring-indigo-500/20">
                                        {availableExportGroups.map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>
                                <div className="pt-2">
                                    <button onClick={handleJarvisExport} className="w-full py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                        Generate XLSM
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative bg-slate-50/30">
        <AnimatePresence mode="wait">
            {viewMode === 'table' ? (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden lg:block h-full overflow-auto custom-scrollbar">
                      <div className="min-w-max relative h-full">
                          <div className="sticky top-0 bg-white z-40 border-b-2 border-slate-200 flex shadow-sm">
                              <div className="px-4 py-3 bg-slate-50 border-r border-slate-200 flex items-center w-12 shrink-0">
                                  <input type="checkbox" className="rounded border-slate-300 text-indigo-600 cursor-pointer" checked={isAllVisibleSelected} ref={el => { if (el) el.indeterminate = isSomeVisibleSelected; }} onChange={toggleSelectAll} />
                              </div>
                              {headerKeys.map((header, idx) => {
                                  const isStrat = header === 'strategyName';
                                  const isSorted = sortConfig.key === header;
                                  const hasActiveFilter = (activeFilters[header]?.size ?? 0) > 0;
                                  return (
                                      <div key={header} className={`px-4 py-3 bg-slate-50 border-r border-slate-100 flex items-center justify-between gap-2 relative shrink-0 ${isStrat ? 'sticky left-12 z-50 bg-slate-100 border-r-2 border-slate-200' : ''}`} style={{ width: isStrat ? STRATEGY_COL_WIDTH : COLUMN_WIDTH }}>
                                          <span className={`font-bold truncate uppercase tracking-tight text-[10px] ${isSorted ? 'text-indigo-600' : 'text-slate-600'}`}>
                                              {header === 'trmsHedging' ? 'TRMS Hedging' : (header === 'finalTotalPnL' ? 'Physical P&L' : header.replace(/([A-Z])/g, ' $1').trim())}
                                          </span>
                                          {!['purchaseCost', 'salesRevenue', 'trmsHedging'].includes(header) && (
                                              <div className="flex items-center gap-1">
                                                  <button onClick={() => setOpenFilterMenu(header === openFilterMenu ? null : header)} className={`p-1 rounded ${hasActiveFilter ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:bg-slate-200'}`}><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg></button>
                                                  <button onClick={() => handleSort(header)} className={`p-1 rounded ${isSorted ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`}><svg className={`w-3 h-3 transition-transform ${isSorted && sortConfig.direction === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></button>
                                              </div>
                                          )}
                                          <AnimatePresence>
                                              {openFilterMenu === header && (
                                                  <motion.div ref={filterMenuRef} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} className="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 shadow-2xl rounded-xl p-3 z-[100] text-slate-700 font-normal normal-case">
                                                      <div className="space-y-3">
                                                          <input autoFocus type="text" placeholder="Search..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} className="w-full text-[10px] px-2 py-1.5 border border-slate-200 rounded bg-slate-50 focus:ring-1 focus:ring-indigo-500" />
                                                          <div className="max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                                              {isStrat ? (
                                                                  <div className="space-y-1">
                                                                      {Object.keys(filterData.strategyHierarchy).sort().map(group => {
                                                                          const strats = filterData.strategyHierarchy[group].filter(s => s.toLowerCase().includes(filterSearch.toLowerCase()));
                                                                          if (strats.length === 0) return null;
                                                                          const isExp = expandedNodes.has(`filter-strat-${group}`);
                                                                          const currentSet = activeFilters[header] || new Set();
                                                                          const allSel = strats.every(s => currentSet.has(s));
                                                                          const someSel = strats.some(s => currentSet.has(s));
                                                                          return (
                                                                              <div key={group} className="text-[10px]">
                                                                                  <div className="flex items-center gap-2 px-1 py-1 hover:bg-slate-50 rounded">
                                                                                      <button onClick={() => setExpandedNodes(prev => { const n = new Set(prev); if (n.has(`filter-strat-${group}`)) n.delete(`filter-strat-${group}`); else n.add(`filter-strat-${group}`); return n; })} className="p-0.5 hover:bg-slate-200 rounded text-slate-400"><svg className={`w-3 h-3 transition-transform ${isExp ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                                                                                      <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = someSel && !allSel; }} onChange={() => bulkToggle(header, strats, !allSel)} className="rounded border-slate-300 text-indigo-600 w-3 h-3" />
                                                                                      <span className="font-bold cursor-pointer">{group}</span>
                                                                                  </div>
                                                                                  {isExp && (
                                                                                      <div className="ml-4 border-l border-slate-200 pl-2">
                                                                                          {strats.map(s => (
                                                                                              <label key={s} className="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer">
                                                                                                  <input type="checkbox" checked={currentSet.has(s)} onChange={() => toggleValueFilter(header, s)} className="rounded border-slate-300 text-indigo-600 w-2.5 h-2.5" />
                                                                                                  <span className="text-slate-500 truncate">{s}</span>
                                                                                              </label>
                                                                                          ))}
                                                                                      </div>
                                                                                  )}
                                                                              </div>
                                                                          );
                                                                      })}
                                                                  </div>
                                                              ) : (header === 'deliveryDate' || header === 'loadingDate') ? (
                                                                  <div className="space-y-1">
                                                                      {Object.keys(filterData.dateHierarchies[header]).sort().map(year => {
                                                                          const monthsObj = filterData.dateHierarchies[header][year];
                                                                          const isExpYear = expandedNodes.has(`filter-${header}-${year}`);
                                                                          return (
                                                                              <div key={year} className="text-[10px]">
                                                                                  <div className="flex items-center gap-2 px-1 py-1 hover:bg-slate-50 rounded">
                                                                                      <button onClick={() => setExpandedNodes(prev => { const n = new Set(prev); if (n.has(`filter-${header}-${year}`)) n.delete(`filter-${header}-${year}`); else n.add(`filter-${header}-${year}`); return n; })} className="p-0.5 hover:bg-slate-200 rounded text-slate-400"><svg className={`w-3 h-3 transition-transform ${isExpYear ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                                                                                      <span className="font-bold">{year}</span>
                                                                                  </div>
                                                                                  {isExpYear && (
                                                                                      <div className="ml-4 border-l border-slate-200 pl-2">
                                                                                          {Object.keys(monthsObj).sort((a,b) => new Date(`${a} 1, 2025`).getMonth() - new Date(`${b} 1, 2025`).getMonth()).map(month => {
                                                                                              const days = Array.from(monthsObj[month] as Set<string>).sort();
                                                                                              const isExpMonth = expandedNodes.has(`filter-${header}-${year}-${month}`);
                                                                                              const currentSet = activeFilters[header] || new Set();
                                                                                              const allSel = days.every(d => currentSet.has(d));
                                                                                              const someSel = days.some(d => currentSet.has(d));
                                                                                              return (
                                                                                                  <div key={month} className="mt-1">
                                                                                                      <div className="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-50 rounded">
                                                                                                          <button onClick={() => setExpandedNodes(prev => { const n = new Set(prev); if (n.has(`filter-${header}-${year}-${month}`)) n.delete(`filter-${header}-${year}-${month}`); else n.add(`filter-${header}-${year}-${month}`); return n; })} className="p-0.5 hover:bg-slate-200 rounded text-slate-400"><svg className={`w-3 h-3 transition-transform ${isExpMonth ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                                                                                                          <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = someSel && !allSel; }} onChange={() => bulkToggle(header, days, !allSel)} className="rounded border-slate-300 text-indigo-600 w-2.5 h-2.5" />
                                                                                                          <span className="text-slate-600">{month}</span>
                                                                                                      </div>
                                                                                                      {isExpMonth && (
                                                                                                          <div className="ml-4 border-l border-slate-200 pl-2 flex flex-col gap-1 mt-1">
                                                                                                              {days.map(dStr => (
                                                                                                                  <label key={dStr} className="flex items-center gap-2 px-1 hover:bg-slate-50 rounded cursor-pointer"><input type="checkbox" checked={currentSet.has(dStr)} onChange={() => toggleValueFilter(header, dStr)} className="rounded border-slate-300 text-indigo-600 w-2 h-2" /><span className="text-slate-500 font-mono">{dStr.split('-')[2]}</span></label>
                                                                                                              ))}
                                                                                                          </div>
                                                                                                      )}
                                                                                                  </div>
                                                                                              )
                                                                                          })}
                                                                                      </div>
                                                                                  )}
                                                                              </div>
                                                                          );
                                                                      })}
                                                                  </div>
                                                              ) : (
                                                                  filterData.values[header]?.filter(v => String(v).toLowerCase().includes(filterSearch.toLowerCase())).map(v => (
                                                                      <label key={String(v)} className="flex items-center gap-2 px-1 py-1 hover:bg-slate-50 rounded cursor-pointer"><input type="checkbox" checked={(activeFilters[header] as Set<any> | undefined)?.has(v)} onChange={() => toggleValueFilter(header, v)} className="rounded border-slate-300 text-indigo-600 w-3 h-3" /><span className="text-[10px] truncate">{String(v ?? '(Blank)')}</span></label>
                                                                  ))
                                                              )}
                                                          </div>
                                                          <div className="pt-2 border-t border-slate-100 flex justify-end">
                                                              <button onClick={() => { setOpenFilterMenu(null); setFilterSearch(''); }} className="text-[10px] font-bold text-indigo-600 px-3 py-1 bg-indigo-50 rounded-lg hover:bg-indigo-100">Close</button>
                                                          </div>
                                                      </div>
                                                  </motion.div>
                                              )}
                                          </AnimatePresence>
                                      </div>
                                  );
                              })}
                              <div className="px-4 py-3 bg-slate-100 border-l border-slate-200 sticky right-0 z-[60] w-32 shrink-0 font-bold text-[10px] text-slate-600 uppercase text-center shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">Actions</div>
                          </div>
                          <div className="bg-white">
                              {processedProfiles.map((p) => {
                                  const purchaseT1 = p.absoluteBuyPrice * p.loadedVolume;
                                  const purchaseT2 = p.isTieredPricing ? (p.absoluteTier2BuyPrice! * p.tier2LoadedVolume!) : 0;
                                  const totalPurchase = purchaseT1 + purchaseT2;

                                  const salesT1 = p.absoluteSellPrice * p.deliveredVolume;
                                  const salesT2 = p.isTieredPricing ? (p.absoluteTier2SellPrice! * p.tier2DeliveredVolume!) : 0;
                                  const totalSales = salesT1 + salesT2;

                                  const srcVal = p.reconciledSrcCost || 0;
                                  
                                  const trmsAgg = trmsData?.trmsAgg[p.strategyName];

                                  return (
                                      <div key={p.id} className="flex border-b border-slate-100 transition-colors hover:bg-indigo-50/30 group">
                                          <div className="px-4 py-3 border-r border-slate-100 w-12 shrink-0 flex items-center bg-white">
                                              <input type="checkbox" checked={selectedIds.has(p.id)} onChange={(e) => {
                                                  const next = new Set(selectedIds);
                                                  if (e.target.checked) next.add(p.id); else next.delete(p.id);
                                                  setSelectedIds(next);
                                              }} className="rounded border-slate-300 text-indigo-600 cursor-pointer" />
                                          </div>
                                          
                                          <div className="px-4 py-3 shrink-0 truncate text-[11px] font-bold text-slate-900 border-r-2 border-slate-200 sticky left-12 bg-white group-hover:bg-indigo-50/30 z-30" style={{ width: STRATEGY_COL_WIDTH }}>
                                              {p.strategyName}
                                              {p.isTieredPricing && <span className="ml-2 px-1 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[9px]">2 TIER</span>}
                                          </div>

                                          <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50" style={{ width: COLUMN_WIDTH }}>{p.buyer || '-'}</div>
                                          <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50" style={{ width: COLUMN_WIDTH }}>{p.source || '-'}</div>
                                          <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50" style={{ width: COLUMN_WIDTH }}>{p.deliveryDate || '-'}</div>
                                          <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50" style={{ width: COLUMN_WIDTH }}>{p.loadingDate || '-'}</div>
                                          
                                          <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50 text-right font-mono" style={{ width: COLUMN_WIDTH }}>{formatPrice(p.absoluteBuyPrice)}</div>
                                          <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50 text-right font-mono" style={{ width: COLUMN_WIDTH }}>{p.loadedVolume?.toLocaleString()}</div>
                                          
                                          <div className="px-4 py-3 shrink-0 border-r border-slate-50 text-right font-mono flex flex-col justify-center" style={{ width: COLUMN_WIDTH }}>
                                              {p.isTieredPricing && (
                                                  <div className="text-[9px] text-slate-400 font-bold flex flex-col -space-y-1">
                                                      <span>T1: {formatCurrency(purchaseT1)}</span>
                                                      <span>T2: {formatCurrency(purchaseT2)}</span>
                                                  </div>
                                              )}
                                              <span className="text-[11px] font-bold text-slate-700">{formatCurrency(totalPurchase)}</span>
                                          </div>

                                          <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50 text-right font-mono" style={{ width: COLUMN_WIDTH }}>{formatPrice(p.absoluteSellPrice)}</div>
                                          <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50 text-right font-mono" style={{ width: COLUMN_WIDTH }}>{p.deliveredVolume?.toLocaleString()}</div>
                                          
                                          <div className="px-4 py-3 shrink-0 border-r border-slate-50 text-right font-mono flex flex-col justify-center" style={{ width: COLUMN_WIDTH }}>
                                              {p.isTieredPricing && (
                                                  <div className="text-[9px] text-slate-400 font-bold flex flex-col -space-y-1">
                                                      <span>T1: {formatCurrency(salesT1)}</span>
                                                      <span>T2: {formatCurrency(salesT2)}</span>
                                                  </div>
                                              )}
                                              <span className="text-[11px] font-bold text-slate-700">{formatCurrency(totalSales)}</span>
                                          </div>

                                          <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50 text-right font-mono" style={{ width: COLUMN_WIDTH }}>
                                              {formatCurrency(srcVal)}
                                          </div>

                                          {/* TRMS Hedging Column - Now labeled for awareness but noted as excluded from Total */}
                                          <div className="px-4 py-3 shrink-0 border-r border-slate-50 flex flex-col justify-center" style={{ width: COLUMN_WIDTH }}>
                                              {trmsAgg && trmsAgg.hedgingTrades > 0 ? (
                                                  <div className="flex flex-col text-right">
                                                      <span className={`text-[10px] font-bold font-mono ${trmsAgg.hedgingPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(trmsAgg.hedgingPnL)}</span>
                                                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                                                          {trmsAgg.hedgingTrades} Hedges • Non-Additive
                                                      </span>
                                                  </div>
                                              ) : (
                                                  <div className="text-right text-[10px] text-slate-300 italic">No Hedges</div>
                                              )}
                                          </div>

                                          <div className={`px-4 py-3 shrink-0 truncate text-[11px] font-bold border-r border-slate-50 text-right ${p.finalTotalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`} style={{ width: COLUMN_WIDTH }}>{formatCurrency(p.finalTotalPnL)}</div>
                                          <div className="px-4 py-3 shrink-0 text-center border-r border-slate-50" style={{ width: COLUMN_WIDTH }}><span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase ${p.pnlBucket === PnLBucket.Realized ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{p.pnlBucket}</span></div>
                                          
                                          <div className="px-4 py-3 border-l border-slate-100 sticky right-0 z-40 bg-white group-hover:bg-slate-50 w-32 shrink-0 flex items-center justify-center gap-1 shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">
                                              <button onClick={() => onEdit(p)} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                              <button onClick={() => onDelete(p.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                          </div>
                                      </div>
                                  );
                              })}
                          </div>
                      </div>
                  </div>

                  {/* Mobile Card View */}
                  <div className="lg:hidden h-full overflow-y-auto p-2 space-y-3 bg-slate-50">
                    {processedProfiles.map((p) => (
                      <motion.div 
                        key={p.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={() => onEdit(p)}
                        className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3 active:bg-slate-50 transition-colors"
                      >
                        <div className="flex justify-between items-start">
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-slate-800 truncate">{p.strategyName}</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight truncate">{p.source} → {p.buyer}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[8px] uppercase ${p.pnlBucket === PnLBucket.Realized ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                            {p.pnlBucket}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[8px] font-black text-slate-400 uppercase">Volume</p>
                            <p className="text-xs font-mono text-slate-700 font-bold">{p.deliveredVolume?.toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[8px] font-black text-slate-400 uppercase">Physical P&L</p>
                            <p className={`text-sm font-black font-mono ${p.finalTotalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {formatCurrency(p.finalTotalPnL)}
                            </p>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-[10px]">
                          <span className="text-slate-400 font-medium">ETA: {p.deliveryDate || '-'}</span>
                          <div className="flex gap-4">
                            <button onClick={(e) => { e.stopPropagation(); onDelete(p.id); }} className="text-rose-500 font-bold uppercase">Delete</button>
                            <button className="text-blue-600 font-bold uppercase">Edit</button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    {processedProfiles.length === 0 && (
                      <div className="py-20 text-center text-slate-400 text-sm">No cargo matches found.</div>
                    )}
                  </div>
                </>
            ) : viewMode === 'map' ? (
                <WorldMap profiles={processedProfiles} height="100%" />
            ) : (
                <CalendarView profiles={processedProfiles} onCargoClick={onEdit} />
            )}
        </AnimatePresence>
      </div>
    </div>
  );
};
