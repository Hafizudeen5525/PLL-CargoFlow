import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { CargoProfile, PnLBucket, EmptyCargoProfile } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { detectUnit, recalculateProfile, getGroupName } from '../services/calculationService';
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

const COLUMN_WIDTH = 140;

// Helper to structure dates for hierarchy
interface DateHierarchy {
    [year: string]: {
        [month: string]: string[]; // Array of full date strings
    };
}

export const CargoList: React.FC<CargoListProps> = ({ 
    profiles, onEdit, onDelete, onActualize, onBulkDelete, onBulkUpdate, onBulkImport 
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isImportingJarvis, setIsImportingJarvis] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof CargoProfile | null; direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });
  
  // Per-column filter states
  const [activeFilters, setActiveFilters] = useState<Record<string, Set<any>>>({});
  const [openFilterMenu, setOpenFilterMenu] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState('');
  
  // Track expanded nodes in date hierarchy
  const [expandedDateNodes, setExpandedDateNodes] = useState<Set<string>>(new Set());

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
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute unique values and hierarchies for filters
  const filterData = useMemo(() => {
    const uniques: Record<string, any[]> = {};
    const hierarchies: Record<string, DateHierarchy> = {};
    
    // Explicit list of filterable columns
    const columns = ['strategyName', 'buyer', 'source', 'deliveryDate', 'loadingDate', 'pnlBucket'];
    
    columns.forEach(col => {
      const isDateCol = col === 'deliveryDate' || col === 'loadingDate';
      
      if (isDateCol) {
          const hierarchy: DateHierarchy = {};
          profiles.forEach(p => {
              const dateStr = (p as any)[col];
              if (!dateStr || dateStr === '') return;
              const parts = dateStr.split('-');
              if (parts.length < 2) return;
              const y = parts[0];
              const m = parts[1];
              if (!hierarchy[y]) hierarchy[y] = {};
              if (!hierarchy[y][m]) hierarchy[y][m] = [];
              if (!hierarchy[y][m].includes(dateStr)) hierarchy[y][m].push(dateStr);
          });
          Object.keys(hierarchy).forEach(y => {
              Object.keys(hierarchy[y]).forEach(m => hierarchy[y][m].sort());
          });
          hierarchies[col] = hierarchy;
      } else {
          uniques[col] = Array.from(new Set(profiles.map(p => (p as any)[col]))).sort();
      }
    });

    return { uniques, hierarchies };
  }, [profiles]);

  const processedProfiles = useMemo(() => {
    let result = profiles.map(p => ({ ...p }));
    
    // Global search
    if (debouncedSearch) {
      const lower = debouncedSearch.toLowerCase();
      result = result.filter(p => Object.values(p).some(v => String(v || '').toLowerCase().includes(lower)));
    }
    
    // Per-column filters
    (Object.entries(activeFilters) as [string, Set<any>][]).forEach(([column, selectedValues]) => {
      if (selectedValues.size > 0) {
        result = result.filter(p => selectedValues.has((p as any)[column]));
      }
    });
    
    // Sorting
    if (sortConfig.key) {
      const { key, direction } = sortConfig;
      result.sort((a, b) => {
        const aVal = (a as any)[key!];
        const bVal = (b as any)[key!];
        if (aVal === bVal) return 0;
        if (aVal === undefined || aVal === null) return 1;
        if (bVal === undefined || bVal === null) return -1;
        if (typeof aVal === 'number' && typeof bVal === 'number') return direction === 'asc' ? aVal - bVal : bVal - aVal;
        return direction === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
      });
    }
    return result;
  }, [profiles, debouncedSearch, activeFilters, sortConfig]);

  const toggleValueFilter = (column: string, value: any) => {
    setActiveFilters(prev => {
      const next = { ...prev };
      const currentSet = new Set(next[column] || []);
      if (currentSet.has(value)) currentSet.delete(value);
      else currentSet.add(value);
      if (currentSet.size === 0) delete next[column];
      else next[column] = currentSet;
      return next;
    });
  };

  const bulkToggleDates = (column: string, dates: string[], shouldSelect: boolean) => {
    setActiveFilters(prev => {
        const next = { ...prev };
        const currentSet = new Set(next[column] || []);
        dates.forEach(d => {
            if (shouldSelect) currentSet.add(d);
            else currentSet.delete(d);
        });
        if (currentSet.size === 0) delete next[column];
        else next[column] = currentSet;
        return next;
    });
  };

  const toggleDateNode = (nodeId: string) => {
    setExpandedDateNodes(prev => {
        const next = new Set(prev);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return next;
    });
  };

  const handleSort = (key: keyof CargoProfile) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
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
                const lookupName = cleanStratName.replace(/t(\(|$)/, '$1');

                if (!mergedData[lookupName]) mergedData[lookupName] = { ...EmptyCargoProfile, strategyName: lookupName };
                if (isTier2Leg) mergedData[lookupName].isTieredPricing = true;

                Object.entries(mapping).forEach(([excelHeader, profileKey]) => {
                    const idx = headers.indexOf(excelHeader.toLowerCase().trim());
                    if (idx !== -1 && row[idx] !== undefined && row[idx] !== '') {
                        const rawVal = row[idx];
                        const isStringData = 
                            profileKey.toLowerCase().includes('index') || 
                            profileKey.toLowerCase().includes('monthdef') ||
                            profileKey.toLowerCase().includes('formula') ||
                            ['source', 'buyer', 'strategyName', 'deliveryDate', 'loadingDate', 'incoterms'].includes(profileKey);

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

        const purchaseMap: Record<string, string> = { 'Source': 'source', 'No.': 'jarvisNo', 'Buyer': 'buyer', 'Optimized': 'optimized', 'Loading Date': 'loadingDate', 'Loaded Volume': 'loadedVolume', 'Buy Formula': 'buyFormula', 'Buy Price Overall Constant': 'buyPriceOverallConstant' };
        for (let i = 1; i <= 3; i++) {
            purchaseMap[`Buy Price ${i} Weightage`] = `buyPrice${i}Weightage`;
            purchaseMap[`Buy Price ${i} slope`] = `buyPrice${i}Slope`;
            purchaseMap[`Buy Price Index ${i}`] = `buyPriceIndex${i}`;
            purchaseMap[`Buy Price ${i} Month Definition`] = `buyPrice${i}MonthDef`;
            purchaseMap[`Buy Price ${i} constant`] = `buyPrice${i}Constant`;
        }
        extractSheetData('Purchase', purchaseMap);

        const salesMap: Record<string, string> = { 'Buyer': 'buyer', 'Delivery Date': 'deliveryDate', 'Delivered Volume': 'deliveredVolume', 'Sell Formula': 'sellFormula', 'Sell Price Overall Constant': 'sellPriceOverallConstant' };
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
        toast.success(`Imported ${finalProfiles.length} combined strategies`, { id: loadingToast });
      } catch (err) {
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
        const getTier2SN = (name: string) => name.replace(/(\d+)(\([^)]*\))?$/, "$1t$2");
        const buildRow = (type: 'Buy' | 'Sell', tier: 1 | 2) => {
            const prefix = tier === 1 ? (type === 'Buy' ? 'buyPrice' : 'sellPrice') : (type === 'Buy' ? 'tier2BuyPrice' : 'tier2SellPrice');
            const volKey = tier === 1 ? (type === 'Buy' ? 'loadedVolume' : 'deliveredVolume') : (type === 'Buy' ? 'tier2LoadedVolume' : 'tier2DeliveredVolume');
            const formulaKey = tier === 1 ? (type === 'Buy' ? 'buyFormula' : 'sellFormula') : (type === 'Buy' ? 'tier2BuyFormula' : 'tier2SellFormula');
            const row: any = { 'Strategy Name': tier === 1 ? p.strategyName : getTier2SN(p.strategyName) };
            if (type === 'Buy') {
                row['Source'] = p.source; row['No.'] = p.jarvisNo; row['Buyer'] = p.buyer; row['Optimized'] = p.optimized ? 'Yes' : 'No'; row['Loading Date'] = p.loadingDate;
                row['Loaded Volume'] = (p as any)[volKey]; row['Buy Formula'] = (p as any)[formulaKey];
            } else {
                row['Buyer'] = p.buyer; row['Delivery Date'] = p.deliveryDate;
                row['Delivered Volume'] = (p as any)[volKey]; row['Sell Formula'] = (p as any)[formulaKey];
            }
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
            const t2SN = getTier2SN(p.strategyName);
            purchaseRows.push(buildRow('Buy', 2)); purchaseRows.push(buildRow('Sell', 2));
            costRows.push({ 'Strategy Name': t2SN, 'Incoterm': p.incoterms, 'SRC': '' });
        }
    });

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(purchaseRows), 'Purchase');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(salesRows), 'Sales');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(costRows), 'Cost');
    XLSX.writeFile(workbook, `Jarvis_Export_${new Date().toISOString().split('T')[0]}.xlsm`, { bookType: 'xlsm' });
  };

  const formatCurrency = (val: number, decimals: number = 0) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(val);

  // New Table Column Definitions
  const columns = [
    { id: 'strategyName', label: 'STRATEGY', width: 220 },
    { id: 'buyer', label: 'BUYER', width: 140 },
    { id: 'source', label: 'SOURCE', width: 140 },
    { id: 'deliveryDate', label: 'DEL DATE', width: 120 },
    { id: 'loadingDate', label: 'LOAD DATE', width: 120 },
    { id: 'absoluteBuyPrice', label: 'BUY PRICE', width: 100, align: 'right' },
    { id: 'absoluteSellPrice', label: 'SELL PRICE', width: 100, align: 'right' },
    { id: 'loadedVolume', label: 'BUY VOL', width: 100, align: 'right' },
    { id: 'deliveredVolume', label: 'SELL VOL', width: 100, align: 'right' },
    { id: 'reconciledPurchaseCost', label: 'PURCHASE VAL', width: 130, align: 'right' },
    { id: 'salesRevenue', label: 'SALES VAL', width: 130, align: 'right' },
    { id: 'reconciledSrcCost', label: 'SRC', width: 100, align: 'right' },
    { id: 'finalTotalPnL', label: 'NET P&L', width: 130, align: 'right' },
    { id: 'pnlBucket', label: 'STATUS', width: 110, align: 'center' }
  ];

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
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                Import Jarvis
            </button>
            <button onClick={handleJarvisExport} className="text-xs font-bold text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-2 shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
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
                            {columns.map((col) => {
                                const field = col.id;
                                const hasActiveFilter = (activeFilters[field] as Set<any> | undefined)?.size ?? 0 > 0;
                                const isSorted = sortConfig.key === field;
                                const isDateCol = field === 'deliveryDate' || field === 'loadingDate';

                                return (
                                    <div key={field} className={`px-4 py-3 bg-slate-50 border-r border-slate-100 flex items-center justify-between gap-2 relative shrink-0 ${col.align === 'right' ? 'flex-row-reverse' : ''}`} style={{ width: col.width }}>
                                        <span className={`font-bold truncate uppercase tracking-tight text-[10px] ${isSorted ? 'text-indigo-600' : 'text-slate-600'}`}>{col.label}</span>
                                        <div className="flex items-center gap-1">
                                          {filterData.uniques[field] || filterData.hierarchies[field] ? (
                                            <button 
                                              onClick={() => setOpenFilterMenu(field === openFilterMenu ? null : field)}
                                              className={`p-1 rounded transition-colors ${hasActiveFilter ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:bg-slate-200 opacity-50'}`}
                                            >
                                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                                            </button>
                                          ) : (
                                            <button onClick={() => handleSort(field as any)} className={`p-1 rounded ${isSorted ? 'text-indigo-600' : 'text-slate-300'}`}>
                                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
                                            </button>
                                          )}
                                        </div>

                                        <AnimatePresence>
                                          {openFilterMenu === field && (
                                            <motion.div ref={filterMenuRef} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} className="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 shadow-2xl rounded-xl p-3 z-50 text-slate-700 font-normal normal-case">
                                              <div className="space-y-3">
                                                <div className="flex border-b border-slate-100 pb-2">
                                                  <button onClick={() => handleSort(field as any)} className={`flex-1 flex items-center justify-center gap-2 text-[10px] font-bold py-1 hover:text-indigo-600 ${sortConfig.key === field && sortConfig.direction === 'asc' ? 'text-indigo-600' : 'text-slate-500'}`}>Sort Asc</button>
                                                  <button onClick={() => handleSort(field as any)} className={`flex-1 flex items-center justify-center gap-2 text-[10px] font-bold py-1 hover:text-indigo-600 ${sortConfig.key === field && sortConfig.direction === 'desc' ? 'text-indigo-600' : 'text-slate-500'}`}>Sort Desc</button>
                                                </div>
                                                <input autoFocus type="text" placeholder="Search..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} className="w-full text-[10px] px-2 py-1.5 border border-slate-200 rounded bg-slate-50 focus:ring-1 focus:ring-indigo-500" />
                                                <div className="max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                                  {isDateCol ? (
                                                    <div className="space-y-1">
                                                        {Object.keys(filterData.hierarchies[field] || {}).sort().reverse().map(year => {
                                                            const monthsInYear = filterData.hierarchies[field][year];
                                                            const allDatesInYear = Object.values(monthsInYear).flat() as string[];
                                                            const isYearExpanded = expandedDateNodes.has(`${field}-${year}`);
                                                            const currentSet = activeFilters[field] || new Set();
                                                            const allYearSelected = allDatesInYear.every(d => currentSet.has(d));
                                                            const someYearSelected = allDatesInYear.some(d => currentSet.has(d));
                                                            return (
                                                                <div key={year} className="text-[10px]">
                                                                    <div className="flex items-center gap-2 px-1 py-1 hover:bg-slate-50 rounded group">
                                                                        <button onClick={() => toggleDateNode(`${field}-${year}`)} className="p-0.5 hover:bg-slate-200 rounded text-slate-400">
                                                                            <svg className={`w-3 h-3 transition-transform ${isYearExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                                        </button>
                                                                        <input type="checkbox" checked={allYearSelected} ref={el => el && (el.indeterminate = someYearSelected && !allYearSelected)} onChange={() => bulkToggleDates(field, allDatesInYear, !allYearSelected)} className="rounded border-slate-300 text-indigo-600 w-3 h-3" />
                                                                        <span className="font-bold cursor-pointer" onClick={() => toggleDateNode(`${field}-${year}`)}>{year}</span>
                                                                    </div>
                                                                    {isYearExpanded && (
                                                                        <div className="ml-4 border-l border-slate-200 pl-2">
                                                                            {Object.keys(monthsInYear).sort().map(month => {
                                                                                const datesInMonth = monthsInYear[month] as string[];
                                                                                const isMonthExpanded = expandedDateNodes.has(`${field}-${year}-${month}`);
                                                                                const allMonthSelected = datesInMonth.every(d => currentSet.has(d));
                                                                                const someMonthSelected = datesInMonth.some(d => currentSet.has(d));
                                                                                const monthName = new Date(parseInt(year), parseInt(month)-1, 1).toLocaleString('default', { month: 'short' });
                                                                                return (
                                                                                    <div key={month}>
                                                                                        <div className="flex items-center gap-2 px-1 py-1 hover:bg-slate-50 rounded group">
                                                                                            <button onClick={() => toggleDateNode(`${field}-${year}-${month}`)} className="p-0.5 hover:bg-slate-200 rounded text-slate-400">
                                                                                                <svg className={`w-2.5 h-2.5 transition-transform ${isMonthExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                                                            </button>
                                                                                            <input type="checkbox" checked={allMonthSelected} ref={el => el && (el.indeterminate = someMonthSelected && !allMonthSelected)} onChange={() => bulkToggleDates(field, datesInMonth, !allMonthSelected)} className="rounded border-slate-300 text-indigo-600 w-3 h-3" />
                                                                                            <span className="cursor-pointer" onClick={() => toggleDateNode(`${field}-${year}-${month}`)}>{monthName}</span>
                                                                                        </div>
                                                                                        {isMonthExpanded && (
                                                                                            <div className="ml-4 border-l border-slate-100 pl-2">
                                                                                                {datesInMonth.map(date => (
                                                                                                    <label key={date} className="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer">
                                                                                                        <input type="checkbox" checked={currentSet.has(date)} onChange={() => toggleValueFilter(field, date)} className="rounded border-slate-300 text-indigo-600 w-2.5 h-2.5" />
                                                                                                        <span className="text-slate-500">{date.split('-')[2]}</span>
                                                                                                    </label>
                                                                                                ))}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                  ) : (
                                                    filterData.uniques[field]
                                                      ?.filter(v => String(v).toLowerCase().includes(filterSearch.toLowerCase()))
                                                      .map(v => (
                                                        <label key={v} className="flex items-center gap-2 px-1 py-1 hover:bg-slate-50 rounded cursor-pointer">
                                                          <input type="checkbox" checked={(activeFilters[field] as Set<any> | undefined)?.has(v)} onChange={() => toggleValueFilter(field, v)} className="rounded border-slate-300 text-indigo-600 w-3 h-3" />
                                                          <span className="text-[10px] truncate">{String(v ?? '(Blank)')}</span>
                                                        </label>
                                                      ))
                                                  )}
                                                </div>
                                                <div className="pt-2 border-t border-slate-100 flex justify-end">
                                                  <button onClick={() => { setOpenFilterMenu(null); setFilterSearch(''); }} className="text-[10px] font-bold text-indigo-600 px-3 py-1 bg-indigo-50 rounded-lg hover:bg-indigo-100">Apply</button>
                                                </div>
                                              </div>
                                            </motion.div>
                                          )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}
                            <div className="px-4 py-3 bg-slate-100 border-l border-slate-200 sticky right-0 z-50 w-24 shrink-0 font-bold text-[10px] text-slate-600 uppercase text-center">Actions</div>
                        </div>
                        <div className="bg-white">
                            {processedProfiles.map((p) => (
                                <div key={p.id} className="flex border-b border-slate-100 transition-colors hover:bg-indigo-50/30 group">
                                    <div className="px-4 py-3 border-r border-slate-100 w-12 shrink-0 flex items-center bg-white"><input type="checkbox" className="rounded border-slate-300 text-indigo-600" /></div>
                                    
                                    <div className="px-4 py-3 shrink-0 text-[11px] font-bold text-slate-900 border-r border-slate-50 whitespace-normal break-words" style={{ width: 220 }}>
                                        {p.strategyName}
                                        {p.isTieredPricing && <span className="ml-2 px-1 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[9px]">2 TIER</span>}
                                    </div>
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50" style={{ width: 140 }}>{p.buyer}</div>
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50" style={{ width: 140 }}>{p.source}</div>
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-500 font-mono border-r border-slate-50" style={{ width: 120 }}>{p.deliveryDate || '-'}</div>
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-500 font-mono border-r border-slate-50" style={{ width: 120 }}>{p.loadingDate || '-'}</div>
                                    
                                    {/* Financial Columns */}
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-700 font-mono border-r border-slate-50 text-right" style={{ width: 100 }}>{p.absoluteBuyPrice ? p.absoluteBuyPrice.toFixed(3) : '-'}</div>
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-700 font-mono border-r border-slate-50 text-right" style={{ width: 100 }}>{p.absoluteSellPrice ? p.absoluteSellPrice.toFixed(3) : '-'}</div>
                                    
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 font-mono border-r border-slate-50 text-right" style={{ width: 100 }}>{(p.loadedVolume || 0).toLocaleString()}</div>
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 font-mono border-r border-slate-50 text-right" style={{ width: 100 }}>{(p.deliveredVolume || 0).toLocaleString()}</div>
                                    
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-900 font-mono border-r border-slate-50 text-right font-medium" style={{ width: 130 }}>{formatCurrency(p.reconciledPurchaseCost || ((p.loadedVolume||0)*(p.absoluteBuyPrice||0)))}</div>
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-indigo-700 font-mono border-r border-slate-50 text-right font-medium" style={{ width: 130 }}>{formatCurrency(p.salesRevenue || ((p.deliveredVolume||0)*(p.absoluteSellPrice||0)))}</div>
                                    
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-amber-700 font-mono border-r border-slate-50 text-right" style={{ width: 100 }}>{p.reconciledSrcCost ? formatCurrency(p.reconciledSrcCost) : '-'}</div>

                                    <div className={`px-4 py-3 shrink-0 truncate text-[11px] font-bold border-r border-slate-50 text-right ${p.finalTotalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`} style={{ width: 130 }}>{formatCurrency(p.finalTotalPnL)}</div>
                                    
                                    <div className="px-4 py-3 shrink-0 text-center border-r border-slate-50" style={{ width: 110 }}>
                                        <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase ${p.pnlBucket === PnLBucket.Realized ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {p.pnlBucket}
                                        </span>
                                    </div>

                                    <div className="px-4 py-3 border-l border-slate-100 sticky right-0 z-20 bg-white group-hover:bg-slate-50 w-24 shrink-0 flex items-center justify-center gap-1">
                                        <button onClick={() => onEdit(p)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Edit"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                        <button onClick={() => onDelete(p.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded" title="Delete"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
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
