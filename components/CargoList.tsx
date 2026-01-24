
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { CargoProfile, PnLBucket, EmptyCargoProfile } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { detectUnit, recalculateProfile, getGroupName, GROUPS } from '../services/calculationService';
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

interface DateHierarchy {
    [year: string]: {
        [month: string]: string[];
    };
}

interface StrategyHierarchy {
    [group: string]: string[];
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
  
  const [activeFilters, setActiveFilters] = useState<Record<string, Set<any>>>({});
  const [openFilterMenu, setOpenFilterMenu] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState('');
  
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

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

  const filterData = useMemo(() => {
    const uniques: Record<string, any[]> = {};
    const dateHierarchies: Record<string, DateHierarchy> = {};
    const strategyHierarchy: StrategyHierarchy = {};
    
    const columns = ['strategyName', 'buyer', 'source', 'deliveryDate', 'loadingDate', 'pnlBucket'];
    
    columns.forEach(col => {
      if (col === 'deliveryDate' || col === 'loadingDate') {
          const hierarchy: DateHierarchy = {};
          profiles.forEach(p => {
              const val = (p as any)[col];
              if (!val) return;
              const dateStr = typeof val === 'string' ? val : new Date(val).toISOString().split('T')[0];
              const parts = dateStr.split('-');
              if (parts.length < 2) return;
              const y = parts[0], m = parts[1];
              if (!hierarchy[y]) hierarchy[y] = {};
              if (!hierarchy[y][m]) hierarchy[y][m] = [];
              if (!hierarchy[y][m].includes(dateStr)) hierarchy[y][m].push(dateStr);
          });
          dateHierarchies[col] = hierarchy;
      } else if (col === 'strategyName') {
          profiles.forEach(p => {
              const group = getGroupName(p.strategyName);
              if (!strategyHierarchy[group]) strategyHierarchy[group] = [];
              if (!strategyHierarchy[group].includes(p.strategyName)) strategyHierarchy[group].push(p.strategyName);
          });
          Object.keys(strategyHierarchy).forEach(g => strategyHierarchy[g].sort());
      } else {
          uniques[col] = Array.from(new Set(profiles.map(p => (p as any)[col]))).sort();
      }
    });

    return { uniques, dateHierarchies, strategyHierarchy };
  }, [profiles]);

  const processedProfiles = useMemo(() => {
    let result = profiles.map(p => ({ ...p }));
    if (debouncedSearch) {
      const lower = debouncedSearch.toLowerCase();
      result = result.filter(p => Object.values(p).some(v => String(v || '').toLowerCase().includes(lower)));
    }
    Object.entries(activeFilters).forEach(([column, selectedValues]) => {
      const vals = selectedValues as Set<any>;
      if (vals.size > 0) {
        result = result.filter(p => vals.has((p as any)[column]));
      }
    });
    if (sortConfig.key) {
      const { key, direction } = sortConfig;
      result.sort((a, b) => {
        const aVal = (a as any)[key!], bVal = (b as any)[key!];
        if (aVal === bVal) return 0;
        if (aVal === undefined || aVal === null) return 1;
        if (bVal === undefined || bVal === null) return -1;
        return direction === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal > bVal ? -1 : 1);
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

  const bulkToggle = (column: string, values: any[], shouldSelect: boolean) => {
    setActiveFilters(prev => {
        const next = { ...prev };
        const currentSet = new Set(next[column] || []);
        values.forEach(v => {
            if (shouldSelect) currentSet.add(v);
            else currentSet.delete(v);
        });
        if (currentSet.size === 0) delete next[column];
        else next[column] = currentSet;
        return next;
    });
  };

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
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
    const loadingToast = toast.loading('Extracting Jarvis Workbook...');
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
                let headerIdx = -1;
                for (let i = 0; i < Math.min(json.length, 100); i++) {
                    if (json[i].some(c => String(c || '').toLowerCase().trim() === 'strategy name')) { headerIdx = i; break; }
                }
                if (headerIdx === -1) return;
                const headers = json[headerIdx].map(h => String(h || '').toLowerCase().trim());
                const rows = json.slice(headerIdx + 1);
                rows.forEach(row => {
                    const strat = row[headers.indexOf('strategy name')];
                    if (!strat) return;
                    let name = String(strat).trim();
                    if (!mergedData[name]) mergedData[name] = { ...EmptyCargoProfile, strategyName: name };
                    Object.entries(mapping).forEach(([exH, prK]) => {
                        const idx = headers.indexOf(exH.toLowerCase());
                        if (idx !== -1 && row[idx] !== '') {
                            const raw = row[idx];
                            // CRITICAL FIX: React Error #31 - Avoid rendering Date objects
                            if (raw instanceof Date) {
                                (mergedData[name] as any)[prK] = raw.toISOString().split('T')[0];
                            } else {
                                (mergedData[name] as any)[prK] = (typeof raw === 'string') ? raw.trim() : raw;
                            }
                        }
                    });
                });
            };
            extractSheetData('Purchase', { 'Source': 'source', 'Loading Date': 'loadingDate', 'Loaded Volume': 'loadedVolume', 'Buy Formula': 'buyFormula' });
            extractSheetData('Sales', { 'Buyer': 'buyer', 'Delivery Date': 'deliveryDate', 'Delivered Volume': 'deliveredVolume', 'Sell Formula': 'sellFormula' });
            extractSheetData('Cost', { 'Incoterm': 'incoterms', 'SRC': 'reconciledSrcCost' });
            const finals = Object.values(mergedData).map(p => recalculateProfile({ ...p, id: profiles.find(ep => ep.strategyName === p.strategyName)?.id || Math.random().toString(36).substr(2, 9) } as CargoProfile) as CargoProfile);
            if (onBulkImport) onBulkImport(finals);
            toast.success(`Imported ${finals.length} strategies`, { id: loadingToast });
        } catch { toast.error('Parse failed', { id: loadingToast }); }
        finally { setIsImportingJarvis(false); }
    };
    reader.readAsBinaryString(file);
  };

  const handleJarvisExport = () => {
    const workbook = XLSX.utils.book_new();
    const rows = processedProfiles.map(p => ({ 'Strategy Name': p.strategyName, 'Source': p.source, 'Buyer': p.buyer, 'Delivered Vol': p.deliveredVolume, 'PnL': p.finalTotalPnL }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Export');
    XLSX.writeFile(workbook, `CargoFlow_Export.xlsx`);
  };

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

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

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
                                const isStrategyCol = field === 'strategyName';

                                return (
                                    <div key={field} className={`px-4 py-3 bg-slate-50 border-r border-slate-100 flex items-center justify-between gap-2 relative shrink-0 ${col.align === 'right' ? 'flex-row-reverse' : ''}`} style={{ width: col.width }}>
                                        <span className={`font-bold truncate uppercase tracking-tight text-[10px] ${isSorted ? 'text-indigo-600' : 'text-slate-600'}`}>{col.label}</span>
                                        <div className="flex items-center gap-1">
                                          {(filterData.uniques[field] || filterData.dateHierarchies[field] || (isStrategyCol && filterData.strategyHierarchy)) && (
                                            <button 
                                              onClick={() => setOpenFilterMenu(field === openFilterMenu ? null : field)}
                                              className={`p-1 rounded transition-colors ${hasActiveFilter ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:bg-slate-200 opacity-50'}`}
                                            >
                                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
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
                                                        {Object.keys(filterData.dateHierarchies[field] || {}).sort().reverse().map(year => {
                                                            const months = filterData.dateHierarchies[field][year];
                                                            const allDates = Object.values(months).flat();
                                                            const isExp = expandedNodes.has(`${field}-${year}`);
                                                            const currentSet = activeFilters[field] || new Set();
                                                            const allSel = allDates.every(d => currentSet.has(d));
                                                            const someSel = allDates.some(d => currentSet.has(d));
                                                            return (
                                                                <div key={year} className="text-[10px]">
                                                                    <div className="flex items-center gap-2 px-1 py-1 hover:bg-slate-50 rounded">
                                                                        <button onClick={() => toggleNode(`${field}-${year}`)} className="p-0.5 hover:bg-slate-200 rounded text-slate-400">
                                                                            <svg className={`w-3 h-3 transition-transform ${isExp ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                                        </button>
                                                                        {/* Fix: Ref callback return type error */}
                                                                        <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = someSel && !allSel; }} onChange={() => bulkToggle(field, allDates, !allSel)} className="rounded border-slate-300 text-indigo-600 w-3 h-3" />
                                                                        <span className="font-bold cursor-pointer" onClick={() => toggleNode(`${field}-${year}`)}>{year}</span>
                                                                    </div>
                                                                    {isExp && (
                                                                        <div className="ml-4 border-l border-slate-200 pl-2">
                                                                            {Object.keys(months).sort().map(month => {
                                                                                const dates = months[month], isMonExp = expandedNodes.has(`${field}-${year}-${month}`), allMonSel = dates.every(d => currentSet.has(d)), someMonSel = dates.some(d => currentSet.has(d));
                                                                                return (
                                                                                    <div key={month}>
                                                                                        <div className="flex items-center gap-2 px-1 py-1 hover:bg-slate-50 rounded">
                                                                                            <button onClick={() => toggleNode(`${field}-${year}-${month}`)} className="p-0.5 hover:bg-slate-200 rounded text-slate-400"><svg className={`w-2.5 h-2.5 transition-transform ${isMonExp ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                                                                                            {/* Fix: Ref callback return type error */}
                                                                                            <input type="checkbox" checked={allMonSel} ref={el => { if (el) el.indeterminate = someMonSel && !allMonSel; }} onChange={() => bulkToggle(field, dates, !allMonSel)} className="rounded border-slate-300 text-indigo-600 w-3 h-3" />
                                                                                            <span className="cursor-pointer" onClick={() => toggleNode(`${field}-${year}-${month}`)}>{new Date(2000, parseInt(month)-1).toLocaleString('default', { month: 'short' })}</span>
                                                                                        </div>
                                                                                        {isMonExp && (
                                                                                            <div className="ml-4 border-l border-slate-100 pl-2">
                                                                                                {dates.map(d => (
                                                                                                    <label key={d} className="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer">
                                                                                                        <input type="checkbox" checked={currentSet.has(d)} onChange={() => toggleValueFilter(field, d)} className="rounded border-slate-300 text-indigo-600 w-2.5 h-2.5" />
                                                                                                        <span className="text-slate-500">{d.split('-')[2]}</span>
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
                                                  ) : isStrategyCol ? (
                                                    <div className="space-y-1">
                                                        {Object.keys(filterData.strategyHierarchy).sort().map(group => {
                                                            const strats = filterData.strategyHierarchy[group];
                                                            const isExp = expandedNodes.has(`${field}-${group}`);
                                                            const currentSet = activeFilters[field] || new Set();
                                                            const allSel = strats.every(s => currentSet.has(s));
                                                            const someSel = strats.some(s => currentSet.has(s));
                                                            return (
                                                                <div key={group} className="text-[10px]">
                                                                    <div className="flex items-center gap-2 px-1 py-1 hover:bg-slate-50 rounded">
                                                                        <button onClick={() => toggleNode(`${field}-${group}`)} className="p-0.5 hover:bg-slate-200 rounded text-slate-400">
                                                                            <svg className={`w-3 h-3 transition-transform ${isExp ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                                        </button>
                                                                        {/* Fix: Ref callback return type error */}
                                                                        <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = someSel && !allSel; }} onChange={() => bulkToggle(field, strats, !allSel)} className="rounded border-slate-300 text-indigo-600 w-3 h-3" />
                                                                        <span className="font-bold cursor-pointer" onClick={() => toggleNode(`${field}-${group}`)}>{group}</span>
                                                                    </div>
                                                                    {isExp && (
                                                                        <div className="ml-4 border-l border-slate-200 pl-2 max-h-40 overflow-y-auto custom-scrollbar">
                                                                            {strats.map(s => (
                                                                                <label key={s} className="flex items-center gap-2 px-1 py-1 hover:bg-slate-50 rounded cursor-pointer">
                                                                                    <input type="checkbox" checked={currentSet.has(s)} onChange={() => toggleValueFilter(field, s)} className="rounded border-slate-300 text-indigo-600 w-2.5 h-2.5" />
                                                                                    <span className="text-slate-500 truncate">{s}</span>
                                                                                </label>
                                                                            ))}
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
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-500 font-mono border-r border-slate-50" style={{ width: 120 }}>{String(p.deliveryDate || '-')}</div>
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-500 font-mono border-r border-slate-50" style={{ width: 120 }}>{String(p.loadingDate || '-')}</div>
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-700 font-mono border-r border-slate-50 text-right" style={{ width: 100 }}>{p.absoluteBuyPrice?.toFixed(3) || '-'}</div>
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-700 font-mono border-r border-slate-50 text-right" style={{ width: 100 }}>{p.absoluteSellPrice?.toFixed(3) || '-'}</div>
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 font-mono border-r border-slate-50 text-right" style={{ width: 100 }}>{(p.loadedVolume || 0).toLocaleString()}</div>
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 font-mono border-r border-slate-50 text-right" style={{ width: 100 }}>{(p.deliveredVolume || 0).toLocaleString()}</div>
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-900 font-mono border-r border-slate-50 text-right font-medium" style={{ width: 130 }}>{formatCurrency(p.reconciledPurchaseCost || ((p.loadedVolume||0)*(p.absoluteBuyPrice||0)))}</div>
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-indigo-700 font-mono border-r border-slate-50 text-right font-medium" style={{ width: 130 }}>{formatCurrency(p.salesRevenue || ((p.deliveredVolume||0)*(p.absoluteSellPrice||0)))}</div>
                                    <div className="px-4 py-3 shrink-0 truncate text-[11px] text-amber-700 font-mono border-r border-slate-50 text-right" style={{ width: 100 }}>{p.reconciledSrcCost ? formatCurrency(p.reconciledSrcCost) : '-'}</div>
                                    <div className={`px-4 py-3 shrink-0 truncate text-[11px] font-bold border-r border-slate-50 text-right ${p.finalTotalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`} style={{ width: 130 }}>{formatCurrency(p.finalTotalPnL)}</div>
                                    <div className="px-4 py-3 shrink-0 text-center border-r border-slate-50" style={{ width: 110 }}>
                                        <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase ${p.pnlBucket === PnLBucket.Realized ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{p.pnlBucket}</span>
                                    </div>
                                    <div className="px-4 py-3 border-l border-slate-100 sticky right-0 z-20 bg-white group-hover:bg-slate-50 w-24 shrink-0 flex items-center justify-center gap-1">
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
