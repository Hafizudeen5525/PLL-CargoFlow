
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { CargoProfile } from '../types';

interface DiscrepancyCheckProps {
  profiles: CargoProfile[];
}

type SortConfig = {
  key: string | null;
  direction: 'asc' | 'desc';
};

type TRMSTab = 'src' | 'hedging' | 'paper';

const ROW_HEIGHT = 42;
const VISIBLE_ROWS = 15;
const BUFFER_ROWS = 5;
const COLUMN_WIDTH = 200;

const WHITELIST_COLUMNS = [
  'EOD_Date', 'Deal Status', 'Internal Legal Entity', 'Internal Business Unit', 'Internal Portfolio',
  'Trade Date', 'Start Date', 'End Date', 'Deal Type', 'Toolset', 'Buy_Sell', 'Price', 'Strike', 
  'Payment Currency', 'Base_Total_Value_USD', 'Yest_Base_Total_Value_USD', 'Change_in_Total_PnL', 
  'Payment Date', 'Rate Determination Date', 'Plsb Year Bucket', 'Optimization Level', 
  'Optimization Leg Num', 'Comm Window Start Date', 'Comm Window End Date', 'Cargo Id', 'Cargo Name', 
  'Volume', 'Unit', 'Activity Type', 'Strategy Name', 'Fin Strategy SSMT', 'Ins Type', 'Event Source', 
  'Settlement Type', 'Cflow Type', 'Volume Type', 'Price Status', 'Strategy_Bucket_level_1', 
  'Strategy_Bucket_level_2', 'Strategy_Pnl_Bucket_level_3', 'Parcel_Pnl_Bucket_level_3', 
  'Is_Strategy_Priced', 'Is_Strategy_Actualized', 'Is_Strategy_Hedged', 'Payment', 'Incoterm', 
  'LNG_Parcel_Type', 'BU_L1', 'BU_L2', 'BU_L3', 'Trader'
];

const PRIORITY_COLUMNS = [
  'Strategy Name',
  'Deal Status',
  'Start Date',
  'End Date',
  'Buy_Sell',
  'Price',
  'Strike',
  'Payment Currency',
  'Volume',
  'Unit',
  'Base_Total_Value_USD',
  'Yest_Base_Total_Value_USD',
  'Change_in_Total_PnL'
];

export const DiscrepancyCheck: React.FC<DiscrepancyCheckProps> = ({ profiles }) => {
  const [dataSets, setDataSets] = useState<{
    src: any[];
    hedging: any[];
    paper: any[];
    uniqueValues: Record<string, Record<string, any[]>>;
  }>({
    src: [],
    hedging: [],
    paper: [],
    uniqueValues: { src: {}, hedging: {}, paper: {} }
  });
  
  const [activeTab, setActiveTab] = useState<TRMSTab>('src');
  const [isParsing, setIsParsing] = useState(false);
  const [summary, setSummary] = useState({ total: 0, src: 0, hedging: 0, paper: 0 });
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });
  const [activeFilters, setActiveFilters] = useState<Record<string, Set<any>>>({});
  const [openFilterMenu, setOpenFilterMenu] = useState<string | null>(null);
  const [menuSearch, setMenuSearch] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    const loadingToast = toast.loading('Processing TRMS Extract...');

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws);

        const src: any[] = [];
        const hedging: any[] = [];
        const paper: any[] = [];

        rawData.forEach((row: any) => {
          const cleanRow: any = {};
          WHITELIST_COLUMNS.forEach(col => {
            if (row[col] !== undefined) {
                 if (row[col] instanceof Date) {
                     // CRITICAL FIX: Add 12 hours to shift date into the middle of the intended day 
                     // before UTC extraction. This bypasses timezone-induced shifts.
                     const dObj = row[col];
                     const adjustedDate = new Date(dObj.getTime() + (12 * 60 * 60 * 1000));
                     const y = adjustedDate.getUTCFullYear();
                     const m = String(adjustedDate.getUTCMonth() + 1).padStart(2, '0');
                     const d = String(adjustedDate.getUTCDate()).padStart(2, '0');
                     cleanRow[col] = `${y}-${m}-${d}`;
                 } else {
                     cleanRow[col] = row[col];
                 }
            }
          });

          const cflowType = String(row['Cflow Type'] || '').trim();
          const strategyName = String(row['Strategy Name'] || '').trim();
          const internalPortfolio = String(row['Internal Portfolio'] || '').trim();

          const matchesCflow = cflowType === "SRC- Shipping Related Cost";
          const startsWithYear = strategyName.startsWith("2026") || strategyName.startsWith("2027");
          const hasExclusions = strategyName.includes("GLNG") || strategyName.includes("CSPA");
          
          if (matchesCflow && startsWithYear && !hasExclusions) src.push(cleanRow);
          if (internalPortfolio === "Hedging LNG") hedging.push(cleanRow);
          if (internalPortfolio === "DH LNG" || internalPortfolio === "DFT LNG") paper.push(cleanRow);
        });

        const extractUniques = (data: any[]) => {
          if (data.length === 0) return {};
          const keys = Object.keys(data[0]);
          const uniques: Record<string, any[]> = {};
          keys.forEach(k => {
            uniques[k] = Array.from(new Set(data.map(r => r[k]))).sort();
          });
          return uniques;
        };

        setDataSets({
          src,
          hedging,
          paper,
          uniqueValues: {
            src: extractUniques(src),
            hedging: extractUniques(hedging),
            paper: extractUniques(paper)
          }
        });

        setSummary({ total: rawData.length, src: src.length, hedging: hedging.length, paper: paper.length });
        setActiveFilters({});
        setSearchTerm('');
        setDebouncedSearch('');
        setSortConfig({ key: null, direction: 'asc' });
        setScrollTop(0);
        if (containerRef.current) containerRef.current.scrollTop = 0;

        toast.success(`Extracted: ${src.length} SRC, ${hedging.length} Hedging, ${paper.length} Paper`, { id: loadingToast });
      } catch (err) {
        console.error(err);
        toast.error('Failed to parse Excel file', { id: loadingToast });
      } finally {
        setIsParsing(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const currentRawData = useMemo(() => dataSets[activeTab], [activeTab, dataSets]);

  const headers = useMemo(() => {
    if (currentRawData.length === 0) return [];
    const availableKeys = Object.keys(currentRawData[0]);
    return availableKeys.sort((a, b) => {
        const indexA = PRIORITY_COLUMNS.indexOf(a);
        const indexB = PRIORITY_COLUMNS.indexOf(b);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.localeCompare(b);
    });
  }, [currentRawData]);

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
        const next = new Set(prev);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return next;
    });
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
    setOpenFilterMenu(null);
  };

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

  const bulkToggleGroup = (column: string, values: any[]) => {
    setActiveFilters(prev => {
        const next = { ...prev };
        const currentSet = new Set(next[column] || []);
        const allSelected = values.every(v => currentSet.has(v));
        if (allSelected) values.forEach(v => currentSet.delete(v));
        else values.forEach(v => currentSet.add(v));
        if (currentSet.size === 0) delete next[column];
        else next[column] = currentSet;
        return next;
    });
  };

  const clearAllFilters = () => {
    setActiveFilters({});
    setSearchTerm('');
    setDebouncedSearch('');
    setSortConfig({ key: null, direction: 'asc' });
    toast.success('Filters cleared');
  };

  const processedData = useMemo(() => {
    let result = [...currentRawData];
    if (debouncedSearch) {
      const lower = debouncedSearch.toLowerCase();
      result = result.filter(row => Object.values(row).some(v => String(v).toLowerCase().includes(lower)));
    }
    (Object.entries(activeFilters) as [string, Set<any>][]).forEach(([column, selectedValues]) => {
      if (selectedValues.size > 0) {
        result = result.filter(row => selectedValues.has(row[column]));
      }
    });
    if (sortConfig.key) {
      const { key, direction } = sortConfig;
      result.sort((a, b) => {
        const aVal = a[key!];
        const bVal = b[key!];
        if (aVal === bVal) return 0;
        const isNum = typeof aVal === 'number' && typeof bVal === 'number';
        if (isNum) return direction === 'asc' ? aVal - bVal : bVal - aVal;
        return direction === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
      });
    }
    return result;
  }, [currentRawData, debouncedSearch, activeFilters, sortConfig]);

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
  const endIndex = Math.min(processedData.length, Math.ceil((scrollTop + VISIBLE_ROWS * ROW_HEIGHT) / ROW_HEIGHT) + BUFFER_ROWS);
  const visibleItems = processedData.slice(startIndex, endIndex);
  const totalHeight = processedData.length * ROW_HEIGHT;
  const offsetY = startIndex * ROW_HEIGHT;

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const menuValues = useMemo(() => {
    if (!openFilterMenu) return [];
    const uniques = dataSets.uniqueValues[activeTab][openFilterMenu] || [];
    if (!menuSearch) return uniques;
    const lower = menuSearch.toLowerCase();
    return uniques.filter(v => String(v).toLowerCase().includes(lower));
  }, [openFilterMenu, activeTab, dataSets, menuSearch]);

  const isAnyFilterActive = Object.keys(activeFilters).length > 0 || searchTerm !== '';

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
          <div className="max-w-xl">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              TRMS Multi-Extract Reconciliation
            </h2>
            <p className="text-sm text-slate-500 mt-1">Analyze TRMS portfolios with prioritized columns and hierarchical filtering.</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
             {isAnyFilterActive && (
               <button onClick={clearAllFilters} className="px-3 py-1.5 text-rose-600 hover:bg-rose-50 text-xs font-bold rounded-lg transition-colors flex items-center gap-2">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                 Clear Filters
               </button>
             )}
             <div className="relative group">
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" disabled={isParsing} />
                <button className={`px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-100 flex items-center gap-2 transition-all ${isParsing ? 'opacity-50' : 'hover:bg-indigo-700 active:scale-95'}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  {isParsing ? 'Parsing...' : 'Upload Extract'}
                </button>
             </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-0.5">
            <TabButton active={activeTab === 'src'} onClick={() => { setActiveTab('src'); setScrollTop(0); }} label="SRC Active Extract" count={summary.src} color="indigo" />
            <TabButton active={activeTab === 'hedging'} onClick={() => { setActiveTab('hedging'); setScrollTop(0); }} label="Physical Hedging" count={summary.hedging} color="emerald" />
            <TabButton active={activeTab === 'paper'} onClick={() => { setActiveTab('paper'); setScrollTop(0); }} label="Paper Portfolio (DH/DFT)" count={summary.paper} color="amber" />
        </div>
      </div>

      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-0">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-center gap-4">
          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em] flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${activeTab === 'src' ? 'bg-indigo-500' : activeTab === 'hedging' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            {activeTab === 'src' ? 'SRC Costs (2026/27)' : activeTab === 'hedging' ? 'Hedging LNG' : 'DH & DFT LNG Portfolios'}
          </h3>
          <div className="relative w-full md:w-80">
            <input
              type="text"
              placeholder={`Search ${activeTab} data...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500/20"
            />
            <svg className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>
        
        <div ref={containerRef} onScroll={onScroll} className="flex-1 overflow-auto custom-scrollbar relative bg-slate-50/20">
          {processedData.length > 0 ? (
            <div className="min-w-max relative" style={{ height: totalHeight + ROW_HEIGHT }}>
              <div className="sticky top-0 bg-white z-50 border-b-2 border-slate-200 flex">
                {headers.map((header, idx) => {
                  const hasActiveFilter = (activeFilters[header] as Set<any> | undefined)?.size ?? 0 > 0;
                  const isSorted = sortConfig.key === header;
                  const isFirst = idx === 0;

                  return (
                    <div 
                      key={header} 
                      className={`px-4 py-3 bg-slate-50 border-r border-slate-100 last:border-r-0 flex items-center justify-between gap-2 relative group shrink-0 ${isFirst ? 'sticky left-0 z-50 bg-slate-100 shadow-[2px_0_5_rgba(0,0,0,0.05)]' : ''}`}
                      style={{ width: COLUMN_WIDTH }}
                    >
                      <span className={`font-bold truncate uppercase tracking-tight text-[10px] ${isSorted ? 'text-indigo-600' : 'text-slate-600'}`}>{header}</span>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => {
                            setOpenFilterMenu(header === openFilterMenu ? null : header);
                            setExpandedNodes(new Set());
                          }}
                          className={`p-1 rounded transition-colors ${hasActiveFilter ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:bg-slate-200 opacity-50 group-hover:opacity-100'}`}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                        </button>
                      </div>

                      <AnimatePresence>
                        {openFilterMenu === header && (
                          <motion.div ref={menuRef} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} className="absolute top-full left-0 mt-1 w-72 bg-white border border-slate-200 shadow-2xl rounded-xl p-4 z-50 text-slate-700 font-normal normal-case">
                            <div className="space-y-4">
                              <div className="flex border-b border-slate-100 pb-2">
                                <button onClick={() => handleSort(header)} className={`flex-1 flex items-center gap-2 text-[10px] font-bold py-1 hover:text-indigo-600 ${sortConfig.key === header && sortConfig.direction === 'asc' ? 'text-indigo-600' : 'text-slate-500'}`}>Sort Asc</button>
                                <button onClick={() => handleSort(header)} className={`flex-1 flex items-center gap-2 text-[10px] font-bold py-1 hover:text-indigo-600 ${sortConfig.key === header && sortConfig.direction === 'desc' ? 'text-indigo-600' : 'text-slate-500'}`}>Sort Desc</button>
                              </div>

                              <input autoFocus type="text" placeholder="Search values..." value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} className="w-full text-[10px] px-2 py-1.5 border border-slate-200 rounded bg-slate-50 focus:ring-1 focus:ring-indigo-500" />
                              
                              <div className="max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                                {menuValues.map(v => (
                                    <label key={v} className="flex items-center gap-2 px-1 py-1 hover:bg-slate-50 rounded cursor-pointer">
                                      <input type="checkbox" checked={(activeFilters[header] as Set<any> | undefined)?.has(v)} onChange={() => toggleValueFilter(header, v)} className="rounded border-slate-300 text-indigo-600 w-3 h-3" />
                                      <span className="text-[10px] truncate">{String(v ?? '(Blank)')}</span>
                                    </label>
                                  ))}
                              </div>
                              <div className="pt-2 border-t border-slate-100 flex justify-end items-center">
                                <button onClick={() => setOpenFilterMenu(null)} className="text-[10px] font-bold text-indigo-600 px-3 py-1 bg-indigo-50 rounded-lg hover:bg-indigo-100">Apply Filters</button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              <div className="absolute left-0 w-full" style={{ top: ROW_HEIGHT + offsetY }}>
                {visibleItems.map((row, i) => {
                  return (
                    <div 
                      key={startIndex + i} 
                      className="flex border-b border-slate-100 transition-colors hover:bg-indigo-50/20 bg-white" 
                      style={{ height: ROW_HEIGHT }}
                    >
                      {headers.map((header, idx) => {
                        const isFirst = idx === 0;
                        return (
                          <div 
                            key={header} 
                            className={`px-4 py-3 text-slate-600 whitespace-nowrap shrink-0 truncate text-[11px] border-r border-slate-50 last:border-r-0 ${isFirst ? 'sticky left-0 z-20 shadow-[2px_0_5_rgba(0,0,0,0.05)] bg-white' : ''}`} 
                            style={{ width: COLUMN_WIDTH }}
                          >
                            {String(row[header] ?? '-')}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-20 text-slate-400">
              {currentRawData.length > 0 ? (
                <div className="text-center">
                  <p className="font-bold text-slate-500">No records match current filters</p>
                  <button onClick={clearAllFilters} className="mt-2 text-indigo-600 text-xs font-bold underline">Reset View</button>
                </div>
              ) : (
                <div className="text-center max-w-xs">
                   <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                      <svg className="w-8 h-8 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 2v-6m-9-9H5a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 022 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                   </div>
                   <p className="font-bold text-slate-600">Dataset Empty</p>
                   <p className="text-xs mt-1">Upload a TRMS extract to populate these tables with prioritized columns.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const TabButton = ({ active, onClick, label, count, color }: { active: boolean, onClick: () => void, label: string, count: number, color: string }) => {
    const colorClasses = {
        indigo: 'text-indigo-600 border-indigo-500 bg-indigo-50',
        emerald: 'text-emerald-600 border-emerald-500 bg-emerald-50',
        amber: 'text-amber-600 border-amber-500 bg-amber-50'
    }[color as 'indigo' | 'emerald' | 'amber'];

    return (
        <button 
            onClick={onClick}
            className={`px-4 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${active ? colorClasses : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
            {label}
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${active ? 'bg-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
                {count.toLocaleString()}
            </span>
        </button>
    );
};
