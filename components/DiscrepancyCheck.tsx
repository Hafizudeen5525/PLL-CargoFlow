
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { CargoProfile } from '../types';

export interface TRMSCommodityLeg {
    price: number;
    vol: number;
    buySell: string;
}

export interface ReconciliationRow {
    strategyName: string;
    foundInTrms: boolean;
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
    };
    discrepancies: Set<string>;
}

export interface TRMSAggregation {
    [strategyName: string]: {
        commodityLegs: TRMSCommodityLeg[];
        srcValue: number;
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
}

type SortConfig = {
  key: string | null;
  direction: 'asc' | 'desc';
};

type TRMSTab = 'reconcile' | 'src' | 'hedging' | 'paper';

const ROW_HEIGHT = 120; // Ensure visibility for multiple individual line items
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

export const DiscrepancyCheck: React.FC<DiscrepancyCheckProps> = ({ profiles, trmsData, onTrmsUpload }) => {
  const [activeTab, setActiveTab] = useState<TRMSTab>('reconcile');
  const [isParsing, setIsParsing] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });
  
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

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

        const srcRows: any[] = [];
        const hedgingRows: any[] = [];
        const paperRows: any[] = [];
        
        const trmsAgg: TRMSAggregation = {};

        rawData.forEach((row: any) => {
          const rawYear = row['Plsb Year Bucket'];
          let plsbYear = 0;
          if (typeof rawYear === 'number') plsbYear = rawYear;
          else if (typeof rawYear === 'string') plsbYear = parseInt(rawYear.replace(/[^0-9]/g, ''));
          
          if (isNaN(plsbYear) || plsbYear < 2025) return;

          const strategyName = String(row['Strategy Name'] || '').trim();
          if (!strategyName) return;

          const isExcluded = strategyName.includes("GLNG") || strategyName.includes("CSPA");
          if (isExcluded) return;

          const cflowType = String(row['Cflow Type'] || '').trim();
          const internalPortfolio = String(row['Internal Portfolio'] || '').trim();
          const buySell = String(row['Buy_Sell'] || '').trim();
          const volume = Math.abs(Number(row['Volume'] || 0));
          const price = Number(row['Price'] || 0);
          const totalValue = Math.abs(Number(row['Base_Total_Value_USD'] || 0));

          if (!trmsAgg[strategyName]) {
            trmsAgg[strategyName] = { commodityLegs: [], srcValue: 0 };
          }

          if (cflowType === "SRC- Shipping Related Cost") {
            trmsAgg[strategyName].srcValue += totalValue;
          } else if (cflowType === "Commodity") {
            trmsAgg[strategyName].commodityLegs.push({ price, vol: volume, buySell });
          }

          const cleanRow: any = {};
          WHITELIST_COLUMNS.forEach(col => {
            if (row[col] !== undefined) {
              if (row[col] instanceof Date) {
                  const dObj = row[col];
                  cleanRow[col] = `${dObj.getUTCFullYear()}-${String(dObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dObj.getUTCDate()).padStart(2, '0')}`;
              } else {
                  cleanRow[col] = row[col];
              }
            }
          });

          if (cflowType === "SRC- Shipping Related Cost") srcRows.push(cleanRow);
          if (internalPortfolio === "Hedging LNG") hedgingRows.push(cleanRow);
          if (internalPortfolio === "DH LNG" || internalPortfolio === "DFT LNG") paperRows.push(cleanRow);
        });

        onTrmsUpload({
          src: srcRows,
          hedging: hedgingRows,
          paper: paperRows,
          trmsAgg,
          uniqueValues: {},
          summary: { 
            total: rawData.length, 
            src: srcRows.length, 
            hedging: hedgingRows.length, 
            paper: paperRows.length
          }
        });

        toast.success(`TRMS Data Filtered (>= 2025).`, { id: loadingToast });
      } catch (err) {
        console.error(err);
        toast.error('Excel Parsing Failed', { id: loadingToast });
      } finally {
        setIsParsing(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const reconciliationData = useMemo(() => {
    return profiles.map(p => {
        const trms = trmsData.trmsAgg[p.strategyName];
        
        const row: ReconciliationRow = {
            strategyName: p.strategyName,
            foundInTrms: !!trms,
            app: {
                buyPrice: p.absoluteBuyPrice || 0,
                sellPrice: p.absoluteSellPrice || 0,
                buyVol: p.loadedVolume || 0,
                sellVol: p.deliveredVolume || 0,
                src: p.reconciledSrcCost || 0,
            },
            trms: {
                buyLegs: trms?.commodityLegs.filter(l => l.buySell === 'Buy') || [],
                sellLegs: trms?.commodityLegs.filter(l => l.buySell === 'Sell') || [],
                src: trms?.srcValue || 0,
            },
            discrepancies: new Set()
        };

        if (trms) {
            const PRICE_TOL = 0.0051;
            const VOL_TOL = 1.1;

            const hasBuyMatch = row.trms.buyLegs.some(l => Math.abs(l.price - row.app.buyPrice) < PRICE_TOL);
            const hasSellMatch = row.trms.sellLegs.some(l => Math.abs(l.price - row.app.sellPrice) < PRICE_TOL);
            const hasBuyVolMatch = row.trms.buyLegs.some(l => Math.abs(l.vol - row.app.buyVol) < VOL_TOL);
            const hasSellVolMatch = row.trms.sellLegs.some(l => Math.abs(l.vol - row.app.sellVol) < VOL_TOL);

            if (!hasBuyMatch && row.app.buyPrice > 0) row.discrepancies.add('Buy Price');
            if (!hasSellMatch && row.app.sellPrice > 0) row.discrepancies.add('Sell Price');
            if (!hasBuyVolMatch && row.app.buyVol > 0) row.discrepancies.add('Buy Vol');
            if (!hasSellVolMatch && row.app.sellVol > 0) row.discrepancies.add('Sell Vol');
            if (Math.abs(row.app.src - row.trms.src) > 100) row.discrepancies.add('SRC Cost');
        } else {
            row.discrepancies.add('Missing in TRMS');
        }

        return row;
    });
  }, [profiles, trmsData.trmsAgg]);

  const currentRawData = useMemo(() => {
    if (activeTab === 'reconcile') return reconciliationData;
    return trmsData[activeTab];
  }, [activeTab, trmsData, reconciliationData]);

  const headers = useMemo(() => {
    if (activeTab === 'reconcile') return [
        'Strategy Name', 
        'Purchase Price', 
        'Purchase Volume', 
        'Sales Price', 
        'Sales Volume', 
        'SRC Check', 
        'PnL Sync'
    ];
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
  }, [currentRawData, activeTab]);

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const processedData = useMemo(() => {
    let result = [...currentRawData];
    if (debouncedSearch) {
      const lower = debouncedSearch.toLowerCase();
      result = result.filter(row => Object.values(row).some(v => String(v).toLowerCase().includes(lower)));
    }
    
    if (sortConfig.key) {
      const { key, direction } = sortConfig;
      result.sort((a, b) => {
        let aVal = (a as any)[key!];
        let bVal = (b as any)[key!];
        if (aVal === bVal) return 0;
        const isNum = typeof aVal === 'number' && typeof bVal === 'number';
        if (isNum) return direction === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        return direction === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
      });
    }
    return result;
  }, [currentRawData, debouncedSearch, sortConfig, activeTab]);

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
  const endIndex = Math.min(processedData.length, Math.ceil((scrollTop + (VISIBLE_ROWS * ROW_HEIGHT)) / ROW_HEIGHT) + BUFFER_ROWS);
  const visibleItems = processedData.slice(startIndex, endIndex);
  const totalHeight = processedData.length * ROW_HEIGHT;
  const offsetY = startIndex * ROW_HEIGHT;

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const formatCurrency = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            TRMS Data Reconciliation
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Compare App vs <b>Individual TRMS Line Items</b>. Prices and volumes align horizontally per leg.
          </p>
        </div>
        <div className="relative group shrink-0">
          <input type="file" accept=".xlsx, .xlsm" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" disabled={isParsing} />
          <button className={`px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-100 flex items-center gap-2 transition-all ${isParsing ? 'opacity-50' : 'hover:bg-indigo-700 active:scale-95'}`}>
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
          <div className="text-[10px] text-slate-400 uppercase font-bold flex gap-4">
            <span>* Comparison excludes PLSB &lt; 2025</span>
          </div>
        </div>
        
        <div ref={containerRef} onScroll={onScroll} className="flex-1 overflow-auto custom-scrollbar relative bg-slate-50/20">
          {processedData.length > 0 ? (
            <div className="min-w-max relative" style={{ height: totalHeight + 40 }}>
              <div className="sticky top-0 bg-white z-40 border-b-2 border-slate-200 flex">
                {headers.map((header, idx) => {
                  const isSorted = sortConfig.key === header;
                  const isFirst = idx === 0;
                  return (
                    <div 
                      key={header} 
                      onClick={() => handleSort(header)}
                      className={`px-4 py-3 bg-slate-50 border-r border-slate-100 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-100 shrink-0 ${isFirst ? 'sticky left-0 z-50 bg-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.05)]' : ''}`}
                      style={{ width: isFirst ? 280 : COLUMN_WIDTH }}
                    >
                      <span className={`font-bold truncate uppercase tracking-tight text-[10px] ${isSorted ? 'text-indigo-600' : 'text-slate-600'}`}>{header}</span>
                      <svg className={`w-3 h-3 text-slate-300 transition-transform ${isSorted && sortConfig.direction === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  );
                })}
              </div>

              <div className="absolute left-0 w-full" style={{ top: 40 + offsetY }}>
                {visibleItems.map((row: any, i) => {
                  const r = row as ReconciliationRow;
                  return (
                    <div key={startIndex + i} className={`flex border-b border-slate-100 transition-colors hover:bg-indigo-50/20 bg-white group ${activeTab === 'reconcile' && !r.foundInTrms ? 'bg-slate-50' : ''}`} style={{ height: ROW_HEIGHT }}>
                      {activeTab === 'reconcile' ? (
                        <>
                          <div className={`px-4 py-2 shrink-0 sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.05)] border-r border-slate-50 flex items-center transition-colors group-hover:bg-indigo-50/20 ${!r.foundInTrms ? 'bg-slate-100' : 'bg-white'}`} style={{ width: 280 }}>
                              <div className="min-w-0">
                                  <div className="text-[11px] font-bold text-slate-800 truncate">{r.strategyName}</div>
                                  <div className={`text-[9px] font-bold uppercase tracking-wider ${r.foundInTrms ? 'text-emerald-500' : 'text-slate-400'}`}>
                                      {r.foundInTrms ? 'Matched in TRMS' : 'Missing from TRMS'}
                                  </div>
                              </div>
                          </div>
                          
                          <AlignedSplitCell type="price" appVal={r.app.buyPrice} trmsLegs={r.trms.buyLegs} found={r.foundInTrms} />
                          <AlignedSplitCell type="vol" appVal={r.app.buyVol} trmsLegs={r.trms.buyLegs} found={r.foundInTrms} />
                          <AlignedSplitCell type="price" appVal={r.app.sellPrice} trmsLegs={r.trms.sellLegs} found={r.foundInTrms} />
                          <AlignedSplitCell type="vol" appVal={r.app.sellVol} trmsLegs={r.trms.sellLegs} found={r.foundInTrms} />

                          <div className="px-4 py-2 shrink-0 flex flex-col justify-center border-r border-slate-50" style={{ width: COLUMN_WIDTH }}>
                                <div className="flex justify-between text-[10px]">
                                    <span className="text-slate-400 font-bold">APP:</span>
                                    <span className="font-mono font-bold text-slate-700">{formatCurrency(r.app.src)}</span>
                                </div>
                                <div className="flex justify-between text-[10px] mt-1">
                                    <span className="text-slate-400 font-bold">TRMS:</span>
                                    <span className={`font-mono font-bold ${Math.abs(r.app.src - r.trms.src) > 100 ? 'text-rose-600' : 'text-slate-500'}`}>{r.foundInTrms ? formatCurrency(r.trms.src) : '-'}</span>
                                </div>
                          </div>
                          
                          <div className="px-4 py-2 shrink-0 flex items-center justify-center border-r border-slate-50" style={{ width: COLUMN_WIDTH }}>
                              {r.discrepancies.size > 0 ? (
                                <div className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${r.foundInTrms ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-500'}`}>
                                    {r.foundInTrms ? `${r.discrepancies.size} Differences` : 'Not Found'}
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 text-emerald-600">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                    <span className="text-[10px] font-bold uppercase">Perfect Sync</span>
                                </div>
                              )}
                          </div>
                        </>
                      ) : (
                        headers.map((header, idx) => (
                          <div key={header} className={`px-4 py-3 text-slate-600 whitespace-nowrap shrink-0 truncate text-[11px] border-r border-slate-50 ${idx === 0 ? 'sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.05)] bg-white group-hover:bg-indigo-50/20' : ''}`} style={{ width: COLUMN_WIDTH }}>
                            {String(row[header] ?? '-')}
                          </div>
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
                <p className="font-bold text-slate-600">No TRMS Data Found</p>
                <p className="text-xs">Upload a TRMS extract (PLSB >= 2025) to begin reconciliation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AlignedSplitCell = ({ type, appVal, trmsLegs, found }: { type: 'price' | 'vol', appVal: number, trmsLegs: TRMSCommodityLeg[], found: boolean }) => {
    return (
        <div className="px-4 py-2 shrink-0 flex flex-col justify-center border-r border-slate-50 overflow-hidden" style={{ width: COLUMN_WIDTH }}>
            <div className="flex flex-col mb-2 pb-1 border-b border-slate-50">
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">App {type === 'price' ? 'Price' : 'Vol'}</span>
                <span className="text-[10px] font-bold text-slate-700 font-mono">
                    {type === 'price' ? `$${appVal.toFixed(3)}` : appVal.toLocaleString()}
                </span>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col space-y-1">
                {!found ? (
                    <span className="text-[10px] text-slate-300 italic">Not found</span>
                ) : trmsLegs.length === 0 ? (
                    <span className="text-[10px] text-rose-500 italic">No Commodity Data</span>
                ) : (
                    trmsLegs.map((leg, idx) => {
                        const valToComp = type === 'price' ? leg.price : leg.vol;
                        const isMatch = type === 'price' 
                            ? Math.abs(valToComp - appVal) < 0.0051 
                            : Math.abs(valToComp - appVal) < 1.1;

                        return (
                            <div 
                                key={idx} 
                                className={`h-5 flex items-center px-1.5 rounded font-mono text-[9px] border ${isMatch ? 'bg-emerald-50 text-emerald-700 font-bold border-emerald-100 shadow-sm' : 'text-slate-500 opacity-80 border-transparent'}`}
                            >
                                {type === 'price' ? leg.price.toFixed(3) : leg.vol.toLocaleString()}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

const TabButton = ({ active, onClick, label, count, color }: { active: boolean, onClick: () => void, label: string, count: number, color: string }) => {
    const colorClasses = {
        indigo: 'text-indigo-600 border-indigo-500 bg-indigo-50',
        emerald: 'text-emerald-600 border-emerald-500 bg-emerald-50',
        amber: 'text-amber-600 border-amber-500 bg-amber-50',
        rose: 'text-rose-600 border-rose-500 bg-rose-50'
    }[color as 'indigo' | 'emerald' | 'amber' | 'rose'];

    return (
        <button onClick={onClick} className={`px-4 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${active ? colorClasses : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            {label}
            {count > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${active ? 'bg-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>{count.toLocaleString()}</span>}
        </button>
    );
};
