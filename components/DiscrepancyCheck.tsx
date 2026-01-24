
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { CargoProfile } from '../types';
import { getGroupName, GROUPS } from '../services/calculationService';

export interface TRMSCommodityLeg {
    price: number;
    vol: number;
    buySell: string;
}

export interface TRMSSrcLeg {
    value: number;
    description: string;
}

export interface ReconciliationRow {
    strategyName: string;
    foundInTrms: boolean;
    profileId: string;
    app: {
        buyPrice: number;
        sellPrice: number;
        buyVol: number;
        sellVol: number;
        src: number;
    };
    trms: {
        buyLegs: TRMSCommodityLeg[];
        sellLegs: TRMSCommodityLeg[];
        src: number;
        srcLegs: TRMSSrcLeg[]; // New: support for multiple SRC components
    };
    discrepancies: Set<string>;
}

export interface TRMSAggregation {
    [strategyName: string]: {
        commodityLegs: TRMSCommodityLeg[];
        srcValue: number;
        srcLegs: TRMSSrcLeg[]; // New: support for multiple SRC components
    }
}

export interface ReconciliationData {
    src: any[];
    hedging: any[];
    paper: any[];
    trmsAgg: TRMSAggregation;
    uniqueValues: Record<string, Record<string, any[]>>;
    summary: {
        total: number;
        src: number;
        hedging: number;
        paper: number;
    };
}

interface DiscrepancyCheckProps {
  profiles: CargoProfile[];
  trmsData: ReconciliationData;
  onTrmsUpload: (data: ReconciliationData) => void;
  onEditProfile?: (profile: CargoProfile) => void;
}

type SortConfig = {
  key: string | null;
  direction: 'asc' | 'desc';
};

type TRMSTab = 'reconcile' | 'src' | 'hedging' | 'paper';

const ROW_HEIGHT = 120;
const VISIBLE_ROWS = 8;
const BUFFER_ROWS = 4;
const COLUMN_WIDTH = 180;

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
  'Cflow Type',
  'Buy_Sell',
  'Price',
  'Volume',
  'Base_Total_Value_USD',
  'Start Date',
  'End Date'
];

interface StrategyHierarchy {
    [group: string]: string[];
}

export const DiscrepancyCheck: React.FC<DiscrepancyCheckProps> = ({ profiles, trmsData, onTrmsUpload, onEditProfile }) => {
  const [activeTab, setActiveTab] = useState<TRMSTab>('reconcile');
  const [isParsing, setIsParsing] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });
  
  const [activeFilters, setActiveFilters] = useState<Record<string, Set<any>>>({});
  const [openFilterMenu, setOpenFilterMenu] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState('');
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    setActiveFilters({});
    setOpenFilterMenu(null);
    setFilterSearch('');
  }, [activeTab]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsParsing(true);
    const loadingToast = toast.loading('Extracting TRMS Data...');
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws);
        const srcRows: any[] = [], hedgingRows: any[] = [], paperRows: any[] = [], trmsAgg: TRMSAggregation = {};
        
        rawData.forEach((row: any) => {
          const rawY = row['Plsb Year Bucket'];
          let y = typeof rawY === 'number' ? rawY : parseInt(String(rawY || '').replace(/[^0-9]/g, ''));
          if (isNaN(y) || y < 2025) return;
          
          const sName = String(row['Strategy Name'] || '').trim();
          if (!sName || sName.includes("GLNG") || sName.includes("CSPA")) return;
          
          if (!trmsAgg[sName]) {
              trmsAgg[sName] = { commodityLegs: [], srcValue: 0, srcLegs: [] };
          }
          
          const cType = String(row['Cflow Type'] || '').trim();
          const iPort = String(row['Internal Portfolio'] || '').trim();
          const valUSD = Number(row['Base_Total_Value_USD'] || 0);
          
          // Logic for pulling individual SRC values
          if (cType === "SRC- Shipping Related Cost") {
              const absVal = Math.abs(valUSD);
              trmsAgg[sName].srcValue += absVal;
              trmsAgg[sName].srcLegs.push({ 
                  value: absVal, 
                  description: String(row['Cflow Type'] || 'SRC') 
              });
          } else if (cType === "Commodity") {
              trmsAgg[sName].commodityLegs.push({ 
                  price: Number(row['Price'] || 0), 
                  vol: Math.abs(Number(row['Volume'] || 0)), 
                  buySell: String(row['Buy_Sell'] || '').trim() 
              });
          }
          
          const cleanRow: any = {};
          WHITELIST_COLUMNS.forEach(col => {
            if (row[col] !== undefined) {
              if (row[col] instanceof Date) { 
                  const d = row[col]; 
                  cleanRow[col] = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`; 
              } else cleanRow[col] = row[col];
            }
          });
          
          if (cType === "SRC- Shipping Related Cost") srcRows.push(cleanRow);
          if (iPort === "Hedging LNG") hedgingRows.push(cleanRow);
          if (iPort === "DH LNG" || iPort === "DFT LNG") paperRows.push(cleanRow);
        });
        
        onTrmsUpload({ src: srcRows, hedging: hedgingRows, paper: paperRows, trmsAgg, uniqueValues: {}, summary: { total: rawData.length, src: srcRows.length, hedging: hedgingRows.length, paper: paperRows.length } });
        toast.success(`TRMS Data Filtered.`, { id: loadingToast });
      } catch { toast.error('Excel Parsing Failed', { id: loadingToast }); }
      finally { setIsParsing(false); }
    };
    reader.readAsBinaryString(file);
  };

  const reconciliationData = useMemo(() => {
    return profiles.map(p => {
        const trms = trmsData.trmsAgg[p.strategyName];
        const row: ReconciliationRow = {
            strategyName: p.strategyName, foundInTrms: !!trms, profileId: p.id,
            app: { buyPrice: p.absoluteBuyPrice || 0, sellPrice: p.absoluteSellPrice || 0, buyVol: p.loadedVolume || 0, sellVol: p.deliveredVolume || 0, src: p.reconciledSrcCost || 0 },
            trms: { 
                buyLegs: trms?.commodityLegs.filter(l => l.buySell === 'Buy') || [], 
                sellLegs: trms?.commodityLegs.filter(l => l.buySell === 'Sell') || [], 
                src: trms?.srcValue || 0,
                srcLegs: trms?.srcLegs || [] // Multiple SRC legs captured here
            },
            discrepancies: new Set()
        };
        if (trms) {
            const hasBP = row.trms.buyLegs.some(l => Math.abs(l.price - row.app.buyPrice) < 0.0051);
            const hasSP = row.trms.sellLegs.some(l => Math.abs(l.price - row.app.sellPrice) < 0.0051);
            const hasBV = row.trms.buyLegs.some(l => Math.abs(l.vol - row.app.buyVol) < 1.1);
            const hasSV = row.trms.sellLegs.some(l => Math.abs(l.vol - row.app.sellVol) < 1.1);
            if (!hasBP && row.app.buyPrice > 0) row.discrepancies.add('Buy Price');
            if (!hasSP && row.app.sellPrice > 0) row.discrepancies.add('Sell Price');
            if (!hasBV && row.app.buyVol > 0) row.discrepancies.add('Buy Vol');
            if (!hasSV && row.app.sellVol > 0) row.discrepancies.add('Sell Vol');
            if (Math.abs(row.app.src - row.trms.src) > 100) row.discrepancies.add('SRC Cost');
        } else row.discrepancies.add('Missing in TRMS');
        return row;
    });
  }, [profiles, trmsData.trmsAgg]);

  const currentRawData = useMemo(() => activeTab === 'reconcile' ? reconciliationData : trmsData[activeTab], [activeTab, trmsData, reconciliationData]);

  const headers = useMemo(() => {
    if (activeTab === 'reconcile') return ['Strategy Name', 'Purchase Price', 'Purchase Volume', 'Sales Price', 'Sales Volume', 'SRC Components', 'PnL Sync'];
    if (currentRawData.length === 0) return [];
    return Object.keys(currentRawData[0]).sort((a, b) => {
        const iA = PRIORITY_COLUMNS.indexOf(a), iB = PRIORITY_COLUMNS.indexOf(b);
        if (iA !== -1 && iB !== -1) return iA - iB;
        if (iA !== -1) return -1; if (iB !== -1) return 1;
        return a.localeCompare(b);
    });
  }, [currentRawData, activeTab]);

  const filterData = useMemo(() => {
    const values: Record<string, any[]> = {};
    const strategyHierarchies: Record<string, StrategyHierarchy> = {};

    headers.forEach(header => {
      const isStrategy = header === 'Strategy Name';
      if (isStrategy) {
          const hierarchy: StrategyHierarchy = {};
          currentRawData.forEach((r: any) => {
              const name = activeTab === 'reconcile' ? r.strategyName : r['Strategy Name'];
              if (!name) return;
              const group = getGroupName(name);
              if (!hierarchy[group]) hierarchy[group] = [];
              if (!hierarchy[group].includes(name)) hierarchy[group].push(name);
          });
          Object.keys(hierarchy).forEach(g => hierarchy[g].sort());
          strategyHierarchies[header] = hierarchy;
      } else {
          const uniqueSet = new Set(currentRawData.map((r: any) => {
              if (activeTab === 'reconcile') {
                  if (header === 'Purchase Price') return r.app.buyPrice;
                  if (header === 'Purchase Volume') return r.app.buyVol;
                  if (header === 'Sales Price') return r.app.sellPrice;
                  if (header === 'Sales Volume') return r.app.sellVol;
                  if (header === 'SRC Components') return r.trms.src;
                  if (header === 'PnL Sync') return r.discrepancies.size > 0 ? `${r.discrepancies.size} Differences` : 'Perfect Sync';
              }
              return r[header];
          }));
          values[header] = Array.from(uniqueSet).sort();
      }
    });
    return { values, strategyHierarchies };
  }, [headers, activeTab, currentRawData]);

  const processedData = useMemo(() => {
    let result = [...currentRawData];
    if (debouncedSearch) {
      const lower = debouncedSearch.toLowerCase();
      result = result.filter(row => Object.values(row).some(v => String(v).toLowerCase().includes(lower)));
    }
    Object.entries(activeFilters).forEach(([header, selectedValues]) => {
      const vals = selectedValues as Set<any>;
      if (vals.size > 0) {
        result = result.filter(row => {
          let val: any;
          if (activeTab === 'reconcile') {
            const r = row as ReconciliationRow;
            if (header === 'Strategy Name') val = r.strategyName;
            else if (header === 'Purchase Price') val = r.app.buyPrice;
            else if (header === 'Purchase Volume') val = r.app.buyVol;
            else if (header === 'Sales Price') val = r.app.sellPrice;
            else if (header === 'Sales Volume') val = r.app.sellVol;
            else if (header === 'SRC Components') val = r.trms.src;
            else if (header === 'PnL Sync') val = r.discrepancies.size > 0 ? `${r.discrepancies.size} Differences` : 'Perfect Sync';
          } else val = row[header];
          return vals.has(val);
        });
      }
    });
    if (sortConfig.key) {
      const { key, direction } = sortConfig;
      result.sort((a, b) => {
        let aVal: any, bVal: any;
        if (activeTab === 'reconcile') {
          const ar = a as ReconciliationRow, br = b as ReconciliationRow;
          const getM = (r: ReconciliationRow) => {
            if (key === 'Strategy Name') return r.strategyName;
            if (key === 'Purchase Price') return r.app.buyPrice;
            if (key === 'Purchase Volume') return r.app.buyVol;
            if (key === 'Sales Price') return r.app.sellPrice;
            if (key === 'Sales Volume') return r.app.sellVol;
            if (key === 'SRC Components') return r.trms.src;
            if (key === 'PnL Sync') return r.discrepancies.size;
            return null;
          };
          aVal = getM(ar); bVal = getM(br);
        } else { aVal = a[key!]; bVal = b[key!]; }
        if (aVal === bVal) return 0; if (aVal == null) return 1; if (bVal == null) return -1;
        return direction === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal > bVal ? -1 : 1);
      });
    }
    return result;
  }, [currentRawData, debouncedSearch, activeFilters, sortConfig, activeTab, reconciliationData]);

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

  const handleRowEdit = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (profile && onEditProfile) {
        onEditProfile(profile);
    }
  };

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
  const endIndex = Math.min(processedData.length, Math.ceil((scrollTop + (VISIBLE_ROWS * ROW_HEIGHT)) / ROW_HEIGHT) + BUFFER_ROWS);
  const visibleItems = processedData.slice(startIndex, endIndex);
  const totalHeight = processedData.length * ROW_HEIGHT, offsetY = startIndex * ROW_HEIGHT;

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => setScrollTop(e.currentTarget.scrollTop), []);

  const formatUSD = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 002-2M9 5a2 2 0 012 2h2a2 2 0 012 2" /></svg>
            TRMS Data Reconciliation
          </h2>
          <p className="text-sm text-slate-500 mt-1">Compare App vs Individual TRMS Line Items. Multiple SRC and Commodity legs are broken down for verification.</p>
        </div>
        <div className="relative group shrink-0">
          <input type="file" accept=".xlsx, .xlsm" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" disabled={isParsing} />
          <button className={`px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-100 flex items-center gap-2 transition-all ${isParsing ? 'opacity-50' : 'hover:bg-indigo-700'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            {isParsing ? 'Extracting...' : 'Upload TRMS Export'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
          <TabButton active={activeTab === 'reconcile'} onClick={() => setActiveTab('reconcile')} label="App vs TRMS Reconciliation" count={reconciliationData.filter(r => r.discrepancies.size > 0).length} color="rose" />
          <TabButton active={activeTab === 'src'} onClick={() => setActiveTab('src')} label="SRC Raw Lines" count={trmsData.summary.src} color="indigo" />
          <TabButton active={activeTab === 'hedging'} onClick={() => setActiveTab('hedging')} label="Hedging Lines" count={trmsData.summary.hedging} color="emerald" />
          <TabButton active={activeTab === 'paper'} onClick={() => setActiveTab('paper')} label="DH/DFT Lines" count={trmsData.summary.paper} color="amber" />
      </div>

      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-0">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="relative w-full md:w-80">
            <input type="text" placeholder={`Search strategy...`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500/20" />
            <svg className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <div className="text-[10px] text-slate-400 uppercase font-bold flex gap-4"><span>* Comparison excludes PLSB &lt; 2025</span></div>
        </div>
        
        <div ref={containerRef} onScroll={onScroll} className="flex-1 overflow-auto custom-scrollbar relative bg-slate-50/20">
          {processedData.length > 0 ? (
            <div className="min-w-max relative" style={{ height: totalHeight + 40 }}>
              <div className="sticky top-0 bg-white z-40 border-b-2 border-slate-200 flex">
                {headers.map((header, idx) => {
                  const isSorted = sortConfig.key === header, isFirst = idx === 0, isStrat = header === 'Strategy Name';
                  const hasActiveFilter = ((activeFilters[header] as any)?.size ?? 0) > 0;
                  return (
                    <div key={header} className={`px-4 py-3 bg-slate-50 border-r border-slate-100 flex items-center justify-between gap-2 relative shrink-0 ${isFirst ? 'sticky left-0 z-50 bg-slate-100' : ''}`} style={{ width: isFirst ? 280 : COLUMN_WIDTH }}>
                      <span className={`font-bold truncate uppercase tracking-tight text-[10px] ${isSorted ? 'text-indigo-600' : 'text-slate-600'}`}>{header}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setOpenFilterMenu(header === openFilterMenu ? null : header)} className={`p-1 rounded ${hasActiveFilter ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:bg-slate-200 opacity-50'}`}><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg></button>
                        <button onClick={() => setSortConfig({ key: header, direction: isSorted && sortConfig.direction === 'asc' ? 'desc' : 'asc' })} className={`p-1 rounded ${isSorted ? 'text-indigo-600' : 'text-slate-300'}`}><svg className={`w-3 h-3 transition-transform ${isSorted && sortConfig.direction === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></button>
                      </div>
                      <AnimatePresence>
                        {openFilterMenu === header && (
                          <motion.div ref={filterMenuRef} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} className="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 shadow-2xl rounded-xl p-3 z-50 text-slate-700 font-normal normal-case">
                            <div className="space-y-3">
                              <input autoFocus type="text" placeholder="Search values..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} className="w-full text-[10px] px-2 py-1.5 border border-slate-200 rounded bg-slate-50 focus:ring-1 focus:ring-indigo-500" />
                              <div className="max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                {isStrat ? (
                                    <div className="space-y-1">
                                        {Object.keys(filterData.strategyHierarchies[header] || {}).sort().map(group => {
                                            const strats = filterData.strategyHierarchies[header][group], isExp = expandedNodes.has(`trms-${activeTab}-${header}-${group}`), currentSet = activeFilters[header] || new Set();
                                            const allSel = strats.every(s => currentSet.has(s)), someSel = strats.some(s => currentSet.has(s));
                                            return (
                                                <div key={group} className="text-[10px]">
                                                    <div className="flex items-center gap-2 px-1 py-1 hover:bg-slate-50 rounded">
                                                        <button onClick={() => setExpandedNodes(prev => { const n = new Set(prev); if (n.has(`trms-${activeTab}-${header}-${group}`)) n.delete(`trms-${activeTab}-${header}-${group}`); else n.add(`trms-${activeTab}-${header}-${group}`); return n; })} className="p-0.5 hover:bg-slate-200 rounded text-slate-400">
                                                            <svg className={`w-3 h-3 transition-transform ${isExp ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                        </button>
                                                        <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = someSel && !allSel; }} onChange={() => bulkToggle(header, strats, !allSel)} className="rounded border-slate-300 text-indigo-600 w-3 h-3" />
                                                        <span className="font-bold cursor-pointer" onClick={() => setExpandedNodes(prev => { const n = new Set(prev); if (n.has(`trms-${activeTab}-${header}-${group}`)) n.delete(`trms-${activeTab}-${header}-${group}`); else n.add(`trms-${activeTab}-${header}-${group}`); return n; })}>{group}</span>
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
                                ) : (
                                    filterData.values[header]?.filter(v => String(v).toLowerCase().includes(filterSearch.toLowerCase())).map(v => (
                                        <label key={String(v)} className="flex items-center gap-2 px-1 py-1 hover:bg-slate-50 rounded cursor-pointer">
                                            <input type="checkbox" checked={(activeFilters[header] as Set<any> | undefined)?.has(v)} onChange={() => toggleValueFilter(header, v)} className="rounded border-slate-300 text-indigo-600 w-3 h-3" />
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
                {activeTab === 'reconcile' && (
                  <div className="sticky right-0 px-4 py-3 bg-slate-50 border-l border-slate-200 z-50 w-20 shrink-0 font-bold text-[10px] text-slate-600 uppercase text-center">Actions</div>
                )}
              </div>
              <div className="absolute left-0 w-full" style={{ top: 40 + offsetY }}>
                {visibleItems.map((row: any, i) => {
                  const r = row as ReconciliationRow;
                  return (
                    <div key={startIndex + i} className={`flex border-b border-slate-100 transition-colors hover:bg-indigo-50/20 bg-white group ${activeTab === 'reconcile' && !r.foundInTrms ? 'bg-slate-50' : ''}`} style={{ height: ROW_HEIGHT }}>
                      {activeTab === 'reconcile' ? (
                        <>
                          <div className={`px-4 py-2 shrink-0 sticky left-0 z-20 border-r border-slate-50 flex items-center transition-colors group-hover:bg-indigo-50/20 ${!r.foundInTrms ? 'bg-slate-100' : 'bg-white'}`} style={{ width: 280 }}>
                              <div className="min-w-0">
                                  <div className="text-[11px] font-bold text-slate-800 truncate">{r.strategyName}</div>
                                  <div className={`text-[9px] font-bold uppercase tracking-wider ${r.foundInTrms ? 'text-emerald-500' : 'text-slate-400'}`}>{r.foundInTrms ? 'Matched in TRMS' : 'Missing from TRMS'}</div>
                              </div>
                          </div>
                          <AlignedSplitCell type="price" appVal={r.app.buyPrice} trmsLegs={r.trms.buyLegs} found={r.foundInTrms} />
                          <AlignedSplitCell type="vol" appVal={r.app.buyVol} trmsLegs={r.trms.buyLegs} found={r.foundInTrms} />
                          <AlignedSplitCell type="price" appVal={r.app.sellPrice} trmsLegs={r.trms.sellLegs} found={r.foundInTrms} />
                          <AlignedSplitCell type="vol" appVal={r.app.sellVol} trmsLegs={r.trms.sellLegs} found={r.foundInTrms} />
                          
                          {/* New: Advanced SRC Reconcile Cell with Breakdown */}
                          <div className="px-4 py-2 shrink-0 flex flex-col justify-center border-r border-slate-50 overflow-hidden" style={{ width: COLUMN_WIDTH }}>
                                <div className="flex flex-col mb-2 pb-1 border-b border-slate-50">
                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">App Reconciled SRC</span>
                                    <span className="text-[10px] font-bold text-slate-700 font-mono">{formatUSD(r.app.src)}</span>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col space-y-1">
                                    {!r.foundInTrms ? <span className="text-[10px] text-slate-300 italic">Not found</span> : r.trms.srcLegs.length === 0 ? <span className="text-[10px] text-rose-500 italic">No SRC Data</span> : (
                                        <>
                                            <div className="text-[8px] font-bold text-slate-300 uppercase mb-0.5">TRMS Breakdown (Sum: {formatUSD(r.trms.src)})</div>
                                            {r.trms.srcLegs.map((leg, idx) => {
                                                const isM = Math.abs(r.trms.src - r.app.src) < 100;
                                                return (
                                                    <div key={idx} className={`h-5 flex items-center justify-between px-1.5 rounded font-mono text-[9px] border ${isM ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                                                        <span className="truncate pr-1">LEG {idx + 1}</span>
                                                        <span className="font-bold">{formatUSD(leg.value)}</span>
                                                    </div>
                                                );
                                            })}
                                        </>
                                    )}
                                </div>
                          </div>

                          <div className="px-4 py-2 shrink-0 flex items-center justify-center border-r border-slate-50" style={{ width: COLUMN_WIDTH }}>
                              {r.discrepancies.size > 0 ? (
                                <div className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${r.foundInTrms ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-500'}`}>{r.foundInTrms ? `${r.discrepancies.size} Differences` : 'Not Found'}</div>
                              ) : (
                                <div className="flex items-center gap-1.5 text-emerald-600"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg><span className="text-[10px] font-bold uppercase">Perfect Sync</span></div>
                              )}
                          </div>
                          <div className="px-4 py-2 shrink-0 sticky right-0 z-30 bg-white group-hover:bg-indigo-50 border-l border-slate-100 flex items-center justify-center" style={{ width: 80 }}>
                                <button 
                                    onClick={() => handleRowEdit(r.profileId)}
                                    className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-full transition-colors"
                                    title="Edit Cargo in List"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                </button>
                          </div>
                        </>
                      ) : (
                        headers.map((header, idx) => (
                          <div key={header} className={`px-4 py-3 text-slate-600 whitespace-nowrap shrink-0 truncate text-[11px] border-r border-slate-50 ${idx === 0 ? 'sticky left-0 z-20 bg-white group-hover:bg-indigo-50/20 font-bold' : ''}`} style={{ width: idx === 0 ? 280 : COLUMN_WIDTH }}>{String(row[header] ?? '-')}</div>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-20 text-slate-400">
                <svg className="w-12 h-12 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 2v-6m-9-9H5a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012 2h2a2 2 0 002-2M9 5a2 2 0 012 2h2a2 2 0 012 2" /></svg>
                <p className="font-bold text-slate-600">No TRMS Data Found</p><p className="text-xs">Upload a TRMS extract (PLSB &ge; 2025) to begin reconciliation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AlignedSplitCell = ({ type, appVal, trmsLegs, found }: { type: 'price' | 'vol', appVal: number, trmsLegs: TRMSCommodityLeg[], found: boolean }) => (
    <div className="px-4 py-2 shrink-0 flex flex-col justify-center border-r border-slate-50 overflow-hidden" style={{ width: COLUMN_WIDTH }}>
        <div className="flex flex-col mb-2 pb-1 border-b border-slate-50">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">App {type === 'price' ? 'Price' : 'Vol'}</span>
            <span className="text-[10px] font-bold text-slate-700 font-mono">{type === 'price' ? `$${appVal.toFixed(3)}` : appVal.toLocaleString()}</span>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col space-y-1">
            {!found ? <span className="text-[10px] text-slate-300 italic">Not found</span> : trmsLegs.length === 0 ? <span className="text-[10px] text-rose-500 italic">No Commodity Data</span> : (
                trmsLegs.map((leg, idx) => {
                    const val = type === 'price' ? leg.price : leg.vol, isM = type === 'price' ? Math.abs(val - appVal) < 0.0051 : Math.abs(val - appVal) < 1.1;
                    return <div key={idx} className={`h-5 flex items-center px-1.5 rounded font-mono text-[9px] border ${isM ? 'bg-emerald-50 text-emerald-700 font-bold border-emerald-100' : 'text-slate-500 opacity-80 border-transparent'}`}>{type === 'price' ? val.toFixed(3) : val.toLocaleString()}</div>;
                })
            )}
        </div>
    </div>
);

const TabButton = ({ active, onClick, label, count, color }: { active: boolean, onClick: () => void, label: string, count: number, color: string }) => {
    const cls = { indigo: 'text-indigo-600 border-indigo-500 bg-indigo-50', emerald: 'text-emerald-600 border-emerald-500 bg-emerald-50', amber: 'text-amber-600 border-amber-500 bg-amber-50', rose: 'text-rose-600 border-rose-500 bg-rose-50' }[color as 'indigo'|'emerald'|'amber'|'rose'];
    return (
        <button onClick={onClick} className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 ${active ? cls : 'border-transparent text-slate-400 hover:text-slate-600'}`}>{label} {count > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${active ? 'bg-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>{count.toLocaleString()}</span>}</button>
    );
};
