import React, { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AutoScalingText } from './AutoScalingText';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { CargoProfile, PnLBucket, ForwardCurveData, ForwardCurve, ForwardCurvePoint } from '../types';
import { getGroupName, GROUPS } from '../services/calculationService';

export interface TRMSCommodityLeg {
    price: number;
    vol: number;
    buySell: string;
    startDate: string;
    endDate: string;
    priceStatus: string;
    settlementType: string;
    valueUSD: number;
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
        loadingDate: string;
        deliveryDate: string;
        volumeType: string;
        priceStatus: string;
    };
    trms: {
        buyLegs: TRMSCommodityLeg[];
        sellLegs: TRMSCommodityLeg[];
        src: number;
        srcLegs: TRMSSrcLeg[]; 
        loadingDate: string;
        deliveryDate: string;
        volumeType: string;
        priceStatus: string;
        commodityValue: number;
        trmsRealized: boolean;
    };
    discrepancies: Set<string>;
}

export interface TRMSAggregation {
    [strategyName: string]: {
        commodityLegs: TRMSCommodityLeg[];
        srcValue: number;
        srcLegs: TRMSSrcLeg[];
        hedgingPnL: number;
        hedgingTrades: number;
        hedgingIndices: string[];
        loadingDate: string;
        deliveryDate: string;
        volumeType: string;
        priceStatus: string;
        commodityValue: number;
    }
}

export interface ReconciliationData {
    src: any[];
    hedging: any[];
    paper: any[];
    trmsAgg: TRMSAggregation;
    forwardCurves: ForwardCurveData[];
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

type TRMSTab = 'reconcile' | 'src' | 'hedging' | 'paper' | 'curves';

const ROW_HEIGHT = 140; 
const VISIBLE_ROWS = 40; 
const BUFFER_ROWS = 10;
const DEFAULT_COLUMN_WIDTH = 200;

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
  'LNG_Parcel_Type', 'BU_L1', 'BU_L2', 'BU_L3', 'Trader', 'External Legal Entity', 'Reference'
];

const PRIORITY_COLUMNS = [
  'Strategy Name',
  'Deal Status',
  'Volume Type',
  'Cflow Type',
  'Buy_Sell',
  'Price',
  'Volume',
  'Base_Total_Value_USD',
  'Start Date',
  'End Date',
  'External Legal Entity',
  'Reference'
];

interface StrategyHierarchy {
    [group: string]: string[];
}

interface DateHierarchy {
    [year: string]: {
        [month: string]: string[];
    };
}

const extractIndexFromRef = (ref: string): string => {
    const r = String(ref || '').toUpperCase();
    if (r.includes('HH')) return 'HH';
    if (r.includes('NBP')) return 'NBP';
    if (r.includes('TTF')) return 'TTF';
    if (r.includes('JKM')) return 'JKM';
    if (r.includes('BRENT')) return 'Brent';
    return 'Other';
};

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
  
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  const handleTableMouseDown = (e: React.MouseEvent) => {
    // Check for right click (button 2)
    if (e.button === 2) {
      isDraggingRef.current = true;
      dragMovedRef.current = false;
      const container = tableContainerRef.current;
      if (container) {
        startPosRef.current = {
          x: e.pageX,
          y: e.pageY,
          scrollLeft: container.scrollLeft,
          scrollTop: container.scrollTop
        };
        container.style.cursor = 'grabbing';
        container.style.userSelect = 'none';
      }
    }
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const container = tableContainerRef.current;
      if (container) {
        const dx = e.pageX - startPosRef.current.x;
        const dy = e.pageY - startPosRef.current.y;
        
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          dragMovedRef.current = true;
        }

        if (dragMovedRef.current) {
          container.scrollLeft = startPosRef.current.scrollLeft - dx;
          container.scrollTop = startPosRef.current.scrollTop - dy;
        }
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        const container = tableContainerRef.current;
        if (container) {
          container.style.cursor = '';
          container.style.userSelect = '';
        }
      }
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  const [scrollTop, setScrollTop] = useState(0);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
    handleSyncScroll('bottom');
  };

  const handleSyncScroll = (source: 'top' | 'bottom') => {
    const top = topScrollRef.current;
    const bottom = tableContainerRef.current;
    if (!top || !bottom) return;

    if (source === 'top') {
      bottom.scrollLeft = top.scrollLeft;
    } else {
      top.scrollLeft = bottom.scrollLeft;
    }
  };

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    'Strategy Name': 280,
    'Loading Date': 200,
    'Delivery Date': 200,
    'Volume Type': 200,
    'Price Status': 200,
    'Purchase Price': 200,
    'Purchase Volume': 200,
    'Sales Price': 200,
    'Sales Volume': 200,
    'SRC Components': 200,
    'PnL Sync': 200,
    'Value Sync': 200
  });

  const handleResize = (header: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.pageX;
    const startWidth = columnWidths[header] || DEFAULT_COLUMN_WIDTH;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(100, startWidth + (moveEvent.pageX - startX));
      setColumnWidths(prev => ({ ...prev, [header]: newWidth }));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

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
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsParsing(true);
    const loadingToast = toast.loading(`Extracting TRMS & Jarvis Data from ${files.length} file(s)...`);
    
    let processedFiles = 0;
    const aggregatedData: ReconciliationData = {
      src: [],
      hedging: [],
      paper: [],
      trmsAgg: {},
      forwardCurves: [],
      uniqueValues: {},
      summary: { total: 0, src: 0, hedging: 0, paper: 0 }
    };

    const processFile = (file: File) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const worker = new Worker(new URL('../services/excelWorker.ts', import.meta.url), { type: 'module' });
        
        worker.onmessage = (e) => {
          const result = e.data;
          if (result.success) {
            // Aggregate data
            aggregatedData.src.push(...result.src);
            aggregatedData.hedging.push(...result.hedging);
            aggregatedData.paper.push(...result.paper);
            
            // Merge trmsAgg
            Object.entries(result.trmsAgg).forEach(([key, value]) => {
              const incoming = value as any;
              if (!aggregatedData.trmsAgg[key]) {
                aggregatedData.trmsAgg[key] = incoming;
              } else {
                const existing = aggregatedData.trmsAgg[key];
                existing.commodityLegs.push(...incoming.commodityLegs);
                existing.srcLegs.push(...incoming.srcLegs);
                existing.srcValue += incoming.srcValue;
                existing.hedgingPnL += incoming.hedgingPnL;
                existing.hedgingTrades += incoming.hedgingTrades;
                incoming.hedgingIndices.forEach((idx: string) => {
                  if (!existing.hedgingIndices.includes(idx)) {
                    existing.hedgingIndices.push(idx);
                  }
                });
                existing.commodityValue += incoming.commodityValue;
                if (incoming.volumeType === 'Actual') existing.volumeType = 'Actual';
                if (incoming.priceStatus === 'Fixed') existing.priceStatus = 'Fixed';
              }
            });

            if (result.forwardCurve) {
              aggregatedData.forwardCurves.push({
                ...result.forwardCurve,
                fileName: file.name
              });
            }

            aggregatedData.summary.total += result.summary.total;
            aggregatedData.summary.src += result.summary.src;
            aggregatedData.summary.hedging += result.summary.hedging;
            aggregatedData.summary.paper += result.summary.paper;
          }

          processedFiles++;
          worker.terminate();

          if (processedFiles === files.length) {
            onTrmsUpload(aggregatedData);
            toast.success(`Data from ${files.length} file(s) aggregated.`, { id: loadingToast });
            setIsParsing(false);
          }
        };

        worker.onerror = (err) => {
          console.error('Worker error:', err);
          processedFiles++;
          if (processedFiles === files.length) {
            onTrmsUpload(aggregatedData);
            setIsParsing(false);
          }
          worker.terminate();
        };

        worker.postMessage({ 
          data: bstr, 
          whitelistColumns: WHITELIST_COLUMNS,
          priorityColumns: PRIORITY_COLUMNS
        });
      };
      reader.readAsBinaryString(file);
    };

    Array.from(files).forEach(processFile);
  };

  const reconciliationData = useMemo(() => {
    return profiles.map(p => {
        const trms = trmsData.trmsAgg[p.strategyName];
        let buyLegs = trms?.commodityLegs?.filter(l => l.buySell === 'Buy') || [];
        let sellLegs = trms?.commodityLegs?.filter(l => l.buySell === 'Sell') || [];

        // If SN has both Buy and Sell legs, drop Physical Settlement rows
        if (buyLegs.length > 0 && sellLegs.length > 0) {
            buyLegs = buyLegs.filter(l => l.settlementType !== 'Physical Settlement');
            sellLegs = sellLegs.filter(l => l.settlementType !== 'Physical Settlement');
        }

        const isAppRealized = p.pnlBucket === PnLBucket.Realized;
        const trmsVolType = trms?.volumeType || 'N/A';
        const trmsPriceStatus = trms?.priceStatus || 'N/A';
        
        // Recalculate commodity value if filtered
        const trmsCommodityValue = trms ? [...buyLegs, ...sellLegs].reduce((acc, l) => acc + l.valueUSD, 0) : 0;

        const row: ReconciliationRow = {
            strategyName: p.strategyName, foundInTrms: !!trms, profileId: p.id,
            app: { 
                buyPrice: p.absoluteBuyPrice || 0, 
                sellPrice: p.absoluteSellPrice || 0, 
                buyVol: p.loadedVolume || 0, 
                sellVol: p.deliveredVolume || 0, 
                src: p.reconciledSrcCost || 0,
                loadingDate: p.loadingDate || '',
                deliveryDate: p.deliveryDate || '',
                volumeType: isAppRealized ? 'Actual' : 'Estimate',
                priceStatus: isAppRealized ? 'Fixed' : 'Estimate'
            },
            trms: { 
                buyLegs, 
                sellLegs, 
                src: trms?.srcValue || 0,
                srcLegs: trms?.srcLegs || [],
                loadingDate: trms?.loadingDate || '',
                deliveryDate: trms?.deliveryDate || '',
                volumeType: trmsVolType,
                priceStatus: trmsPriceStatus,
                commodityValue: trmsCommodityValue,
                trmsRealized: trms ? (sellLegs.some(l => l.priceStatus === 'Fixed') && trmsVolType === 'Actual') : false
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
            if (row.app.loadingDate !== row.trms.loadingDate && row.trms.loadingDate) row.discrepancies.add('Loading Date');
            if (row.app.deliveryDate !== row.trms.deliveryDate && row.trms.deliveryDate) row.discrepancies.add('Delivery Date');
            
            // Realization Check
            if (row.trms.trmsRealized && p.pnlBucket !== PnLBucket.Realized) {
                row.discrepancies.add('Should be Realized');
            }
        } else row.discrepancies.add('Missing in TRMS');
        return row;
    });
  }, [profiles, trmsData.trmsAgg]);

  const currentRawData = useMemo(() => {
    if (activeTab === 'reconcile') return reconciliationData;
    if (activeTab === 'curves') return trmsData.forwardCurves;
    return trmsData[activeTab as keyof ReconciliationData] as any[];
  }, [activeTab, trmsData, reconciliationData]);

  const headers = useMemo(() => {
    if (activeTab === 'reconcile') {
        return [
            'Strategy Name', 'Loading Date', 'Delivery Date', 'Volume Type', 'Price Status', 'Purchase Price', 
            'Purchase Volume', 'Sales Price', 'Sales Volume', 'SRC Components', 'PnL Sync', 'Value Sync'
        ];
    }
    if (activeTab === 'curves') {
        const baseHeaders = ['File Name', 'As Of Date', 'Month'];
        const curveIndexes = new Set<string>();
        trmsData.forwardCurves?.forEach((fc: ForwardCurveData) => fc.curves?.forEach((c: ForwardCurve) => curveIndexes.add(c.index)));
        return [...baseHeaders, ...Array.from(curveIndexes)];
    }
    if (!currentRawData || currentRawData.length === 0) return [];
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
    const dateHierarchies: Record<string, DateHierarchy> = {};

    headers.forEach(header => {
      const isStrategy = header === 'Strategy Name';
      const isDate = header.toLowerCase().includes('date');

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
      } else if (isDate) {
          const hierarchy: DateHierarchy = {};
          currentRawData.forEach((r: any) => {
              let val: any;
              if (activeTab === 'reconcile') {
                  const rec = r as ReconciliationRow;
                  if (header === 'Loading Date') val = rec.app.loadingDate;
                  else if (header === 'Delivery Date') val = rec.app.deliveryDate;
              } else val = r[header];

              if (!val) return;
              const d = new Date(val);
              if (isNaN(d.getTime())) return;

              const year = d.getFullYear().toString();
              const month = d.toLocaleString('default', { month: 'long' });
              const day = val; // Keep original string as the leaf value

              if (!hierarchy[year]) hierarchy[year] = {};
              if (!hierarchy[year][month]) hierarchy[year][month] = [];
              if (!hierarchy[year][month].includes(day)) hierarchy[year][month].push(day);
          });
          
          // Sort years descending, months by calendar order, days ascending
          const sortedHierarchy: DateHierarchy = {};
          const monthOrder = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          
          Object.keys(hierarchy).sort((a, b) => b.localeCompare(a)).forEach(y => {
              sortedHierarchy[y] = {};
              Object.keys(hierarchy[y]).sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b)).forEach(m => {
                  sortedHierarchy[y][m] = hierarchy[y][m].sort();
              });
          });
          dateHierarchies[header] = sortedHierarchy;
      } else {
          const uniqueSet = new Set(currentRawData.map((r: any) => {
              if (activeTab === 'reconcile') {
                  const rec = r as ReconciliationRow;
                  if (header === 'Purchase Price') return rec.app.buyPrice;
                  if (header === 'Purchase Volume') return rec.app.buyVol;
                  if (header === 'Sales Price') return rec.app.sellPrice;
                  if (header === 'Sales Volume') return rec.app.sellVol;
                  if (header === 'Loading Date') return rec.app.loadingDate;
                  if (header === 'Delivery Date') return rec.app.deliveryDate;
                  if (header === 'Volume Type') return rec.trms.volumeType;
                  if (header === 'SRC Components') return rec.trms.src;
                  if (header === 'PnL Sync') return rec.discrepancies.size > 0 ? `${rec.discrepancies.size} Differences` : 'Perfect Sync';
              }
              return r[header];
          }));
          values[header] = Array.from(uniqueSet).sort();
      }
    });
    return { values, strategyHierarchies, dateHierarchies };
  }, [headers, activeTab, currentRawData]);

  const processedData = useMemo(() => {
    if (activeTab === 'curves') {
        const rows: any[] = [];
        trmsData.forwardCurves?.forEach((fc: ForwardCurveData) => {
            // Get all unique months across all curves in this file
            const months = new Set<string>();
            fc.curves?.forEach((c: ForwardCurve) => c.points?.forEach((p: ForwardCurvePoint) => months.add(p.month)));
            const sortedMonths = Array.from(months).sort();

            sortedMonths.forEach(month => {
                const row: any = {
                    'File Name': fc.fileName,
                    'As Of Date': fc.asOfDate,
                    'Month': month
                };
                fc.curves?.forEach((c: ForwardCurve) => {
                    const point = c.points?.find((p: ForwardCurvePoint) => p.month === month);
                    row[c.index] = point ? point.value : null;
                });
                rows.push(row);
            });
        });

        let result = rows;
        if (debouncedSearch) {
            const lower = debouncedSearch.toLowerCase();
            result = result.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(lower)));
        }
        // Apply filters if any (though curves might not need complex filtering yet)
        return result;
    }

    let result = [...currentRawData];
    if (debouncedSearch) {
      const lower = debouncedSearch.toLowerCase();
      result = result.filter(row => {
        if (activeTab === 'reconcile') {
          const r = row as ReconciliationRow;
          return r.strategyName.toLowerCase().includes(lower) || 
                 r.app.loadingDate.toLowerCase().includes(lower) ||
                 r.app.deliveryDate.toLowerCase().includes(lower) ||
                 r.trms.volumeType.toLowerCase().includes(lower);
        }
        return Object.values(row).some(v => String(v).toLowerCase().includes(lower));
      });
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
            else if (header === 'Loading Date') val = r.app.loadingDate;
            else if (header === 'Delivery Date') val = r.app.deliveryDate;
            else if (header === 'Volume Type') val = r.trms.volumeType;
            else if (header === 'Price Status') val = r.trms.sellLegs.map(l => l.priceStatus).join(', ');
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
            if (key === 'Loading Date') return r.app.loadingDate;
            if (key === 'Delivery Date') return r.app.deliveryDate;
            if (key === 'Volume Type') return r.trms.volumeType;
            if (key === 'Price Status') return r.trms.sellLegs.map(l => l.priceStatus).join(', ');
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

  const handleDownloadReport = () => {
    if (processedData.length === 0) {
      toast.error("No data available to download.");
      return;
    }

    const reportData = processedData.map((row: any) => {
      if (activeTab === 'reconcile') {
        const r = row as ReconciliationRow;
        return {
          'Strategy Name': r.strategyName,
          'Matched in TRMS': r.foundInTrms ? 'Yes' : 'No',
          'App Loading Date': r.app.loadingDate,
          'TRMS Loading Date': r.trms.loadingDate,
          'App Delivery Date': r.app.deliveryDate,
          'TRMS Delivery Date': r.trms.deliveryDate,
          'App Volume Type': r.app.volumeType,
          'TRMS Volume Type': r.trms.volumeType,
          'App Price Status': r.app.priceStatus,
          'TRMS Price Status': r.trms.priceStatus,
          'App Purchase Price': r.app.buyPrice,
          'TRMS Purchase Price': r.trms.buyLegs.reduce((acc, l) => acc + l.price, 0) / (r.trms.buyLegs.length || 1),
          'App Purchase Volume': r.app.buyVol,
          'TRMS Purchase Volume': r.trms.buyLegs.reduce((acc, l) => acc + l.vol, 0),
          'App Sales Price': r.app.sellPrice,
          'TRMS Sales Price': r.trms.sellLegs.reduce((acc, l) => acc + l.price, 0) / (r.trms.sellLegs.length || 1),
          'App Sales Volume': r.app.sellVol,
          'TRMS Sales Volume': r.trms.sellLegs.reduce((acc, l) => acc + l.vol, 0),
          'App SRC Cost': r.app.src,
          'TRMS SRC Cost': r.trms.src,
          'App Physical P&L': r.app.sellPrice * r.app.sellVol - r.app.buyPrice * r.app.buyVol - r.app.src,
          'TRMS Base Value': r.trms.commodityValue,
          'Discrepancies': Array.from(r.discrepancies).join(', ') || 'None'
        };
      }
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(reportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reconciliation Report");
    XLSX.writeFile(wb, `TRMS_Reconciliation_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Report downloaded successfully.");
  };

  const formatUSD = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  const stats = useMemo(() => {
    const totalDiscrepancies = reconciliationData.reduce((acc, r) => acc + r.discrepancies.size, 0);
    const matchedCount = reconciliationData.filter(r => r.foundInTrms && r.discrepancies.size === 0).length;
    const totalSrcValue = Object.values(trmsData.trmsAgg).reduce((acc, curr) => acc + curr.srcValue, 0);
    const totalHedgingPnL = Object.values(trmsData.trmsAgg).reduce((acc, curr) => acc + curr.hedgingPnL, 0);
    return { totalDiscrepancies, matchedCount, totalSrcValue, totalHedgingPnL };
  }, [reconciliationData, trmsData.trmsAgg]);

  return (
    <div className="flex flex-col space-y-4 p-4 lg:p-6">
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-3 flex-shrink-0">
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
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            {isParsing ? 'Extracting...' : 'Upload TRMS Export'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 flex-shrink-0">
          <TabButton active={activeTab === 'reconcile'} onClick={() => setActiveTab('reconcile')} label="App vs TRMS Reconciliation" count={reconciliationData.filter(r => r.discrepancies.size > 0).length} color="rose" />
          <TabButton active={activeTab === 'src'} onClick={() => setActiveTab('src')} label="SRC Raw Lines" count={trmsData.summary.src} color="indigo" />
          <TabButton active={activeTab === 'hedging'} onClick={() => setActiveTab('hedging')} label="Hedging Lines" count={trmsData.summary.hedging} color="emerald" />
          <TabButton active={activeTab === 'paper'} onClick={() => setActiveTab('paper')} label="DH/DFT Lines" count={trmsData.summary.paper} color="amber" />
          <TabButton active={activeTab === 'curves'} onClick={() => setActiveTab('curves')} label="Forward Curves (Jarvis)" count={trmsData.forwardCurves?.length || 0} color="indigo" />
      </div>

      <div className="h-[2000px] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative w-full md:w-80">
              <input type="text" placeholder={`Search strategy...`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500/20" />
              <svg className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <button 
              onClick={handleDownloadReport}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-2 shadow-sm"
            >
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Download Report
            </button>
          </div>
          <div className="text-[10px] text-slate-400 uppercase font-bold flex gap-4"><span>* Comparison excludes PLSB &lt; 2025</span></div>
        </div>
        
        {/* Top Horizontal Scrollbar */}
        {processedData.length > 0 && (
          <div 
            ref={topScrollRef}
            onScroll={() => handleSyncScroll('top')}
            className="overflow-x-auto overflow-y-hidden h-3 custom-scrollbar bg-slate-50 border-b border-slate-100 flex-shrink-0"
          >
            <div style={{ width: headers.reduce((acc, h) => acc + (columnWidths[h] || DEFAULT_COLUMN_WIDTH), 0) }} className="h-full" />
          </div>
        )}
        
        <div 
          ref={tableContainerRef}
          onScroll={handleScroll}
          onMouseDown={handleTableMouseDown}
          onContextMenu={(e) => { if (dragMovedRef.current) e.preventDefault(); }}
          className="flex-1 overflow-auto custom-scrollbar relative bg-slate-50/20"
        >
          {processedData.length > 0 ? (
            <div className="min-w-max relative">
              <div className="sticky top-0 bg-white z-40 border-b-2 border-slate-200 flex shadow-sm">
                {headers.map((header, idx) => {
                  const isSorted = sortConfig.key === header, isFirst = idx === 0, isStrat = header === 'Strategy Name';
                  const hasActiveFilter = ((activeFilters[header] as any)?.size ?? 0) > 0;
                  const width = columnWidths[header] || DEFAULT_COLUMN_WIDTH;
                  return (
                    <div key={header} className={`px-4 py-3 bg-slate-50 border-r border-slate-100 flex items-center justify-between gap-2 relative shrink-0 ${isFirst ? 'sticky left-0 z-50 bg-slate-100' : ''}`} style={{ width }}>
                      <span className={`font-bold truncate uppercase tracking-tight text-[10px] ${isSorted ? 'text-indigo-600' : 'text-slate-600'}`}>{header}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setOpenFilterMenu(header === openFilterMenu ? null : header)} className={`p-1 rounded ${hasActiveFilter ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:bg-slate-200 opacity-50'}`}><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg></button>
                        <button onClick={() => setSortConfig({ key: header, direction: isSorted && sortConfig.direction === 'asc' ? 'desc' : 'asc' })} className={`p-1 rounded ${isSorted ? 'text-indigo-600' : 'text-slate-300'}`}><svg className={`w-3 h-3 transition-transform ${isSorted && sortConfig.direction === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></button>
                      </div>
                      
                      {/* Resize Handle */}
                      <div 
                        onMouseDown={(e) => handleResize(header, e)}
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-400 z-10"
                      />

                      <AnimatePresence>
                        {openFilterMenu === header && (
                          <motion.div ref={filterMenuRef} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} className="absolute top-full left-0 mt-1 w-72 bg-white border border-slate-200 shadow-2xl rounded-xl p-4 z-[100] text-slate-700 font-normal normal-case">
                            <div className="space-y-3">
                              <input autoFocus type="text" placeholder="Search values..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} className="w-full text-[11px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
                               <div className="max-h-[350px] overflow-y-auto custom-scrollbar pr-1">
                                {isStrat ? (
                                    <div className="space-y-1">
                                        {Object.keys(filterData.strategyHierarchies[header] || {}).sort().map(group => {
                                            const strats = filterData.strategyHierarchies[header][group], isExp = expandedNodes.has(`trms-${activeTab}-${header}-${group}`), currentSet = activeFilters[header] || new Set();
                                            const allSel = strats.every(s => currentSet.has(s)), someSel = strats.some(s => currentSet.has(s));
                                            return (
                                                <div key={group} className="text-[11px]">
                                                    <div className="flex items-center gap-2 px-1 py-1 hover:bg-slate-50 rounded group/grouphead">
                                                        <button onClick={() => setExpandedNodes(prev => { const n = new Set(prev); if (n.has(`trms-${activeTab}-${header}-${group}`)) n.delete(`trms-${activeTab}-${header}-${group}`); else n.add(`trms-${activeTab}-${header}-${group}`); return n; })} className="p-1 hover:bg-slate-200 rounded text-slate-400">
                                                            <svg className={`w-3.5 h-3.5 transition-transform ${isExp ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                        </button>
                                                        <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = someSel && !allSel; }} onChange={() => bulkToggle(header, strats, !allSel)} className="rounded border-slate-300 text-indigo-600 w-3.5 h-3.5 cursor-pointer" />
                                                        <span className="font-bold cursor-pointer flex-1 truncate" onClick={() => setExpandedNodes(prev => { const n = new Set(prev); if (n.has(`trms-${activeTab}-${header}-${group}`)) n.delete(`trms-${activeTab}-${header}-${group}`); else n.add(`trms-${activeTab}-${header}-${group}`); return n; })}>{group}</span>
                                                    </div>
                                                    {isExp && (
                                                        <div className="ml-5 border-l-2 border-indigo-50 pl-3 space-y-0.5 mt-1">
                                                            {strats.map(s => (
                                                                <label key={s} className="flex items-center gap-2 px-2 py-1 hover:bg-indigo-50 rounded cursor-pointer transition-colors">
                                                                    <input type="checkbox" checked={currentSet.has(s)} onChange={() => toggleValueFilter(header, s)} className="rounded border-slate-300 text-indigo-600 w-3 h-3" />
                                                                    <span className="text-slate-500 truncate text-[10px]">{s}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : filterData.dateHierarchies[header] ? (
                                    <div className="space-y-1">
                                        {Object.keys(filterData.dateHierarchies[header]).map(year => {
                                            const months = filterData.dateHierarchies[header][year];
                                            const allDaysInYear = Object.values(months).flat();
                                            const isYearExp = expandedNodes.has(`trms-${activeTab}-${header}-${year}`);
                                            const currentSet = activeFilters[header] || new Set();
                                            const yearAllSel = allDaysInYear.every(d => currentSet.has(d));
                                            const yearSomeSel = allDaysInYear.some(d => currentSet.has(d));

                                            return (
                                                <div key={year} className="text-[11px]">
                                                    <div className="flex items-center gap-2 px-1 py-1 hover:bg-slate-50 rounded">
                                                        <button onClick={() => setExpandedNodes(prev => { const n = new Set(prev); if (n.has(`trms-${activeTab}-${header}-${year}`)) n.delete(`trms-${activeTab}-${header}-${year}`); else n.add(`trms-${activeTab}-${header}-${year}`); return n; })} className="p-1 hover:bg-slate-200 rounded text-slate-400">
                                                            <svg className={`w-3.5 h-3.5 transition-transform ${isYearExp ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                        </button>
                                                        <input type="checkbox" checked={yearAllSel} ref={el => { if (el) el.indeterminate = yearSomeSel && !yearAllSel; }} onChange={() => bulkToggle(header, allDaysInYear, !yearAllSel)} className="rounded border-slate-300 text-indigo-600 w-3.5 h-3.5 cursor-pointer" />
                                                        <span className="font-bold cursor-pointer flex-1" onClick={() => setExpandedNodes(prev => { const n = new Set(prev); if (n.has(`trms-${activeTab}-${header}-${year}`)) n.delete(`trms-${activeTab}-${header}-${year}`); else n.add(`trms-${activeTab}-${header}-${year}`); return n; })}>{year}</span>
                                                    </div>
                                                    {isYearExp && (
                                                        <div className="ml-4 border-l-2 border-slate-100 pl-2 space-y-1 mt-1">
                                                            {Object.keys(months).map(month => {
                                                                const days = months[month];
                                                                const isMonthExp = expandedNodes.has(`trms-${activeTab}-${header}-${year}-${month}`);
                                                                const monthAllSel = days.every(d => currentSet.has(d));
                                                                const monthSomeSel = days.some(d => currentSet.has(d));

                                                                return (
                                                                    <div key={month}>
                                                                        <div className="flex items-center gap-2 px-1 py-1 hover:bg-slate-50 rounded">
                                                                            <button onClick={() => setExpandedNodes(prev => { const n = new Set(prev); if (n.has(`trms-${activeTab}-${header}-${year}-${month}`)) n.delete(`trms-${activeTab}-${header}-${year}-${month}`); else n.add(`trms-${activeTab}-${header}-${year}-${month}`); return n; })} className="p-1 hover:bg-slate-200 rounded text-slate-400">
                                                                                <svg className={`w-3 h-3 transition-transform ${isMonthExp ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                                            </button>
                                                                            <input type="checkbox" checked={monthAllSel} ref={el => { if (el) el.indeterminate = monthSomeSel && !monthAllSel; }} onChange={() => bulkToggle(header, days, !monthAllSel)} className="rounded border-slate-300 text-indigo-600 w-3 h-3 cursor-pointer" />
                                                                            <span className="cursor-pointer flex-1" onClick={() => setExpandedNodes(prev => { const n = new Set(prev); if (n.has(`trms-${activeTab}-${header}-${year}-${month}`)) n.delete(`trms-${activeTab}-${header}-${year}-${month}`); else n.add(`trms-${activeTab}-${header}-${year}-${month}`); return n; })}>{month}</span>
                                                                        </div>
                                                                        {isMonthExp && (
                                                                            <div className="ml-4 border-l-2 border-indigo-50 pl-2 space-y-0.5 mt-1">
                                                                                {days.map(day => (
                                                                                    <label key={day} className="flex items-center gap-2 px-2 py-1 hover:bg-indigo-50 rounded cursor-pointer transition-colors">
                                                                                        <input type="checkbox" checked={currentSet.has(day)} onChange={() => toggleValueFilter(header, day)} className="rounded border-slate-300 text-indigo-600 w-3 h-3" />
                                                                                        <span className="text-slate-500 font-mono text-[10px]">{day}</span>
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
                                    filterData.values[header]?.filter(v => String(v).toLowerCase().includes(filterSearch.toLowerCase())).map(v => (
                                        <label key={String(v)} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer transition-colors">
                                            <input type="checkbox" checked={(activeFilters[header] as Set<any> | undefined)?.has(v)} onChange={() => toggleValueFilter(header, v)} className="rounded border-slate-300 text-indigo-600 w-3.5 h-3.5" />
                                            <span className="text-[11px] truncate">{String(v ?? '(Blank)')}</span>
                                        </label>
                                    ))
                                )}
                              </div>
                              <div className="pt-3 border-t border-slate-100 flex justify-end">
                                <button onClick={() => { setOpenFilterMenu(null); setFilterSearch(''); }} className="text-xs font-bold text-white px-4 py-2 bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm transition-all">Apply Filters</button>
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
              <div className="flex flex-col">
                {(() => {
                  const currentRowHeight = activeTab === 'reconcile' ? 140 : 48;
                  const startIndex = Math.max(0, Math.floor(scrollTop / currentRowHeight) - BUFFER_ROWS);
                  const endIndex = Math.min(processedData.length, Math.ceil((scrollTop + 2000) / currentRowHeight) + BUFFER_ROWS);
                  
                  const paddingTop = startIndex * currentRowHeight;
                  const paddingBottom = (processedData.length - endIndex) * currentRowHeight;

                  return (
                    <>
                      {paddingTop > 0 && <div style={{ height: paddingTop }} />}
                      {processedData.slice(startIndex, endIndex).map((row: any, i) => (
                        <ReconciliationRowItem 
                          key={startIndex + i}
                          row={row}
                          activeTab={activeTab}
                          columnWidths={columnWidths}
                          handleRowEdit={handleRowEdit}
                          formatUSD={formatUSD}
                          headers={headers}
                          rowHeight={currentRowHeight}
                        />
                      ))}
                      {paddingBottom > 0 && <div style={{ height: paddingBottom }} />}
                    </>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-20 text-slate-400">
                <svg className="w-12 h-12 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 2v-6m-9-9H5a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012 2h2a2 2 0 002-2M9 5a2 2 0 012 2h2a2 2 0 012 2" /></svg>
                <p className="font-bold text-slate-600">
                    {activeTab === 'reconcile' && profiles.length === 0 
                        ? 'No Profiles in App' 
                        : 'No TRMS Data Found'}
                </p>
                <p className="text-xs text-center max-w-xs">
                    {activeTab === 'reconcile' && profiles.length === 0 
                        ? 'Add cargoes to the Cargo List first to compare them with TRMS data.' 
                        : 'Upload a TRMS extract (PLSB \u2265 2025) to begin reconciliation.'}
                </p>
                {debouncedSearch && <p className="text-[10px] mt-4 text-indigo-400">Try clearing your search: "{debouncedSearch}"</p>}
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards moved below table */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 flex-shrink-0">
          <motion.div whileHover={{ scale: 1.02 }} className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between overflow-hidden relative group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity">
                  <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <div className="relative z-10">
                  <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest block mb-1">Total Discrepancies</span>
                  <h3 className="text-3xl font-black text-white font-mono">{stats.totalDiscrepancies}</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mt-2">Points requiring attention</p>
              </div>
          </motion.div>
          
          <motion.div whileHover={{ scale: 1.02 }} className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between overflow-hidden relative group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity">
                  <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div className="relative z-10">
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block mb-1">Perfect Matches</span>
                  <h3 className="text-3xl font-black text-white font-mono">{stats.matchedCount}</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mt-2">Strategies in sync</p>
              </div>
          </motion.div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Total TRMS SRC Value</span>
                  <div className="flex items-baseline gap-2">
                       <h3 className="text-3xl font-black text-indigo-600">{formatUSD(stats.totalSrcValue)}</h3>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-tighter">Aggregated shipping costs</p>
              </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Hedging P&L Impact</span>
                  <div className="flex flex-col gap-1">
                       <h3 className={`text-3xl font-black ${stats.totalHedgingPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatUSD(stats.totalHedgingPnL)}
                      </h3>
                      <div className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-700 w-max">
                          TRMS Portfolio View
                      </div>
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

const AlignedSplitCell = ({ type, appVal, trmsLegs, found, width }: { type: 'price' | 'vol', appVal: number, trmsLegs: TRMSCommodityLeg[], found: boolean, width: number }) => (
    <div className="px-4 py-2 shrink-0 flex flex-col justify-center border-r border-slate-50 overflow-hidden" style={{ width }}>
        <div className="flex flex-col mb-2 pb-1 border-b border-slate-50">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">App {type === 'price' ? 'Price' : 'Vol'}</span>
            <AutoScalingText maxFontSize={10} minFontSize={7} className="font-bold text-slate-700 font-mono">
                {type === 'price' ? `$${appVal.toFixed(3)}` : appVal.toLocaleString()}
            </AutoScalingText>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col space-y-1">
            {!found ? <span className="text-[10px] text-slate-300 italic">Not found</span> : trmsLegs.length === 0 ? <span className="text-[10px] text-rose-500 italic">No Commodity Data</span> : (
                trmsLegs.map((leg, idx) => {
                    const val = type === 'price' ? leg.price : leg.vol, isM = type === 'price' ? Math.abs(val - appVal) < 0.0051 : Math.abs(val - appVal) < 1.1;
                    const diffPct = appVal !== 0 ? ((val - appVal) / Math.abs(appVal)) * 100 : 0;
                    return (
                        <div key={idx} className={`h-5 flex items-center justify-between px-1.5 rounded font-mono text-[9px] border ${isM ? 'bg-emerald-50 text-emerald-700 font-bold border-emerald-100' : 'text-slate-500 opacity-80 border-transparent'}`}>
                            <span>{type === 'price' ? val.toFixed(3) : val.toLocaleString()}</span>
                            {!isM && Math.abs(diffPct) > 0.1 && (
                                <span className={`text-[7px] font-black ${Math.abs(diffPct) > 5 ? 'text-rose-500' : 'text-amber-500'}`}>
                                    {diffPct > 0 ? '+' : ''}{diffPct.toFixed(1)}%
                                </span>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    </div>
);

const ReconciliationRowItem = memo(({ row, activeTab, columnWidths, handleRowEdit, formatUSD, headers, rowHeight }: { 
  row: any, 
  activeTab: string, 
  columnWidths: Record<string, number>, 
  handleRowEdit: (id: string) => void, 
  formatUSD: (val: number) => string,
  headers: string[],
  rowHeight: number
}) => {
  const r = row as ReconciliationRow;
  return (
    <div className={`flex border-b border-slate-100 transition-colors hover:bg-indigo-50/20 bg-white group ${activeTab === 'reconcile' && !r.foundInTrms ? 'bg-slate-50' : ''}`} style={{ height: rowHeight, contentVisibility: 'auto', containIntrinsicSize: `auto ${rowHeight}px` }}>
      {activeTab === 'reconcile' ? (
        <>
          <div className={`px-4 py-2 shrink-0 sticky left-0 z-20 border-r border-slate-50 flex items-center transition-colors group-hover:bg-indigo-50/20 ${!r.foundInTrms ? 'bg-slate-100' : 'bg-white'}`} style={{ width: columnWidths['Strategy Name'] || 280 }}>
              <div className="min-w-0">
                  <div className="text-[11px] font-bold text-slate-800 truncate">{r.strategyName}</div>
                  <div className={`text-[9px] font-bold uppercase tracking-wider ${r.foundInTrms ? 'text-emerald-500' : 'text-slate-400'}`}>{r.foundInTrms ? 'Matched in TRMS' : 'Missing from TRMS'}</div>
              </div>
          </div>
          
          <div className="px-4 py-2 shrink-0 flex flex-col justify-center border-r border-slate-50 overflow-hidden" style={{ width: columnWidths['Loading Date'] || DEFAULT_COLUMN_WIDTH }}>
              <div className="flex flex-col mb-1 pb-1 border-b border-slate-50">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">App Loading</span>
                  <span className="text-[10px] font-bold text-slate-700 font-mono">{r.app.loadingDate || '-'}</span>
              </div>
              <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">TRMS Window</span>
                  <span className={`text-[10px] font-bold font-mono ${r.foundInTrms && r.app.loadingDate !== r.trms.loadingDate ? 'text-rose-500' : 'text-slate-500'}`}>{r.trms.loadingDate || 'N/A'}</span>
              </div>
          </div>

          <div className="px-4 py-2 shrink-0 flex flex-col justify-center border-r border-slate-50 overflow-hidden" style={{ width: columnWidths['Delivery Date'] || DEFAULT_COLUMN_WIDTH }}>
              <div className="flex flex-col mb-1 pb-1 border-b border-slate-50">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">App Delivery</span>
                  <span className="text-[10px] font-bold text-slate-700 font-mono">{r.app.deliveryDate || '-'}</span>
              </div>
              <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">TRMS Window</span>
                  <span className={`text-[10px] font-bold font-mono ${r.foundInTrms && r.app.deliveryDate !== r.trms.deliveryDate ? 'text-rose-500' : 'text-slate-500'}`}>{r.trms.deliveryDate || 'N/A'}</span>
              </div>
          </div>

          <div className="px-4 py-2 shrink-0 flex flex-col justify-center border-r border-slate-50 overflow-hidden" style={{ width: columnWidths['Volume Type'] || DEFAULT_COLUMN_WIDTH }}>
              <div className="flex flex-col mb-1 pb-1 border-b border-slate-50">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">App Status</span>
                  <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase w-fit ${r.app.volumeType === 'Actual' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {r.app.volumeType}
                  </div>
              </div>
              <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">TRMS Status</span>
                  {!r.foundInTrms ? <span className="text-[10px] text-slate-300 italic">N/A</span> : (
                      <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase w-fit ${r.trms.volumeType === 'Actual' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                          {r.trms.volumeType}
                      </div>
                  )}
              </div>
          </div>

          <div className="px-4 py-2 shrink-0 flex flex-col justify-center border-r border-slate-50 overflow-hidden" style={{ width: columnWidths['Price Status'] || DEFAULT_COLUMN_WIDTH }}>
              <div className="flex flex-col mb-1 pb-1 border-b border-slate-50">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">App Status</span>
                  <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase w-fit ${r.app.priceStatus === 'Fixed' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {r.app.priceStatus}
                  </div>
              </div>
              <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">TRMS Status</span>
                  {!r.foundInTrms ? <span className="text-[10px] text-slate-300 italic">N/A</span> : (
                      <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase w-fit ${r.trms.priceStatus === 'Fixed' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                          {r.trms.priceStatus}
                      </div>
                  )}
              </div>
          </div>

          <AlignedSplitCell type="price" appVal={r.app.buyPrice} trmsLegs={r.trms.buyLegs} found={r.foundInTrms} width={columnWidths['Purchase Price'] || DEFAULT_COLUMN_WIDTH} />
          <AlignedSplitCell type="vol" appVal={r.app.buyVol} trmsLegs={r.trms.buyLegs} found={r.foundInTrms} width={columnWidths['Purchase Volume'] || DEFAULT_COLUMN_WIDTH} />
          <AlignedSplitCell type="price" appVal={r.app.sellPrice} trmsLegs={r.trms.sellLegs} found={r.foundInTrms} width={columnWidths['Sales Price'] || DEFAULT_COLUMN_WIDTH} />
          <AlignedSplitCell type="vol" appVal={r.app.sellVol} trmsLegs={r.trms.sellLegs} found={r.foundInTrms} width={columnWidths['Sales Volume'] || DEFAULT_COLUMN_WIDTH} />
          
          <div className="px-4 py-2 shrink-0 flex flex-col justify-center border-r border-slate-50 overflow-hidden" style={{ width: columnWidths['SRC Components'] || DEFAULT_COLUMN_WIDTH }}>
                <div className="flex flex-col mb-2 pb-1 border-b border-slate-50">
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">App Reconciled SRC</span>
                    <AutoScalingText maxFontSize={10} minFontSize={7} className="font-bold text-slate-700 font-mono">
                        {formatUSD(r.app.src)}
                    </AutoScalingText>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col space-y-1">
                    {!r.foundInTrms ? <span className="text-[10px] text-slate-300 italic">Not found</span> : r.trms.srcLegs.length === 0 ? <span className="text-[10px] text-rose-500 italic">No SRC Data</span> : (
                        <>
                            <div className="text-[8px] font-bold text-slate-300 uppercase mb-0.5 flex justify-between items-center">
                                <span>TRMS Breakdown (Sum: {formatUSD(r.trms.src)})</span>
                                {r.app.src !== 0 && Math.abs((r.trms.src - r.app.src) / r.app.src) > 0.001 && (
                                    <span className={`text-[8px] font-black ${Math.abs((r.trms.src - r.app.src) / r.app.src) > 0.05 ? 'text-rose-500' : 'text-amber-500'}`}>
                                        {((r.trms.src - r.app.src) / r.app.src * 100).toFixed(1)}%
                                    </span>
                                )}
                            </div>
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

           <div className="px-4 py-2 shrink-0 flex items-center justify-center border-r border-slate-50" style={{ width: columnWidths['PnL Sync'] || DEFAULT_COLUMN_WIDTH }}>
              {r.discrepancies.size > 0 ? (
                <div className="flex flex-col gap-1 items-center">
                    <div className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${r.foundInTrms ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-500'}`}>{r.foundInTrms ? `${r.discrepancies.size} Differences` : 'Not Found'}</div>
                    {r.discrepancies.has('Should be Realized') && (
                        <div className="px-2 py-0.5 bg-rose-600 text-white text-[8px] font-black uppercase rounded animate-pulse">
                            Should be Realized
                        </div>
                    )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-emerald-600"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg><span className="text-[10px] font-bold uppercase">Perfect Sync</span></div>
              )}
          </div>

          <div className="px-4 py-2 shrink-0 flex flex-col justify-center border-r border-slate-50 overflow-hidden" style={{ width: columnWidths['Value Sync'] || DEFAULT_COLUMN_WIDTH }}>
              <div className="flex flex-col mb-1 pb-1 border-b border-slate-50">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">App Physical P&L</span>
                  <AutoScalingText maxFontSize={10} minFontSize={7} className="font-bold text-slate-700 font-mono">
                      {formatUSD(r.app.sellPrice * r.app.sellVol - r.app.buyPrice * r.app.buyVol - r.app.src)}
                  </AutoScalingText>
              </div>
              <div className="flex flex-col">
                  <div className="flex justify-between items-center">
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">TRMS Base Value</span>
                      {r.foundInTrms && (r.app.sellPrice * r.app.sellVol - r.app.buyPrice * r.app.buyVol - r.app.src) !== 0 && (
                          <span className={`text-[8px] font-black ${Math.abs((r.trms.commodityValue - (r.app.sellPrice * r.app.sellVol - r.app.buyPrice * r.app.buyVol - r.app.src)) / (r.app.sellPrice * r.app.sellVol - r.app.buyPrice * r.app.buyVol - r.app.src)) > 0.05 ? 'text-rose-500' : 'text-amber-500'}`}>
                              {((r.trms.commodityValue - (r.app.sellPrice * r.app.sellVol - r.app.buyPrice * r.app.buyVol - r.app.src)) / Math.abs(r.app.sellPrice * r.app.sellVol - r.app.buyPrice * r.app.buyVol - r.app.src) * 100).toFixed(1)}%
                          </span>
                      )}
                  </div>
                  <AutoScalingText maxFontSize={10} minFontSize={7} className={`font-bold font-mono ${r.foundInTrms && Math.abs((r.app.sellPrice * r.app.sellVol - r.app.buyPrice * r.app.buyVol - r.app.src) - r.trms.commodityValue) > 100 ? 'text-rose-500' : 'text-slate-500'}`}>
                      {r.foundInTrms ? formatUSD(r.trms.commodityValue) : 'N/A'}
                  </AutoScalingText>
              </div>
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
        headers.map((header, idx) => {
          const width = columnWidths[header] || DEFAULT_COLUMN_WIDTH;
          return (
            <div key={header} className={`px-4 py-3 text-slate-600 whitespace-nowrap shrink-0 truncate text-[11px] border-r border-slate-50 ${idx === 0 ? 'sticky left-0 z-20 bg-white group-hover:bg-indigo-50/20 font-bold' : ''}`} style={{ width }}>{String(row[header] ?? '-')}</div>
          );
        })
      )}
    </div>
  );
});

const TabButton = ({ active, onClick, label, count, color }: { active: boolean, onClick: () => void, label: string, count: number, color: string }) => {
    const cls = { indigo: 'text-indigo-600 border-indigo-500 bg-indigo-50', emerald: 'text-emerald-600 border-emerald-500 bg-emerald-50', amber: 'text-amber-600 border-amber-500 bg-amber-50', rose: 'text-rose-600 border-rose-500 bg-rose-50' }[color as 'indigo'|'emerald'|'amber'|'rose'];
    return (
        <button onClick={onClick} className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 ${active ? cls : 'border-transparent text-slate-400 hover:text-slate-600'}`}>{label} {count > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${active ? 'bg-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>{count.toLocaleString()}</span>}</button>
    );
};