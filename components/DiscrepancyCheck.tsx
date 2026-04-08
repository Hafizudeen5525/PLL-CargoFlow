import React, { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AutoScalingText } from './AutoScalingText';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { CargoProfile, PnLBucket, ForwardCurveData, ForwardCurve, ForwardCurvePoint } from '../types';
import { getGroupName, GROUPS, saveForwardCurve, ForwardCurveRow } from '../services/calculationService';

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
        reconciledPurchaseCost: number;
        reconciledSalesRevenue: number;
        // Tiered Support
        isTiered?: boolean;
        tier1BuyPrice?: number;
        tier1BuyVol?: number;
        tier2BuyPrice?: number;
        tier2BuyVol?: number;
        tier1SellPrice?: number;
        tier1SellVol?: number;
        tier2SellPrice?: number;
        tier2SellVol?: number;
        effectiveBuyPrice?: number;
        effectiveSellPrice?: number;
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
        trmsPurchaseValue: number;
        trmsSalesValue: number;
        reconciledPurchaseCost: number;
        reconciledSalesRevenue: number;
        trmsRealized: boolean;
        commWindowEndDate: string;
        rawRows?: any[];
    };
    discrepancies: Set<string>;
    errorPcts: {
        buyPrice: number;
        sellPrice: number;
        buyVol: number;
        sellVol: number;
        src: number;
        loadingDate: number;
        deliveryDate: number;
        purchaseCost: number;
        salesRevenue: number;
    };
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
        trmsPurchaseValue: number;
        trmsSalesValue: number;
        reconciledPurchaseCost: number;
        reconciledSalesRevenue: number;
        commWindowEndDate: string;
        rawRows?: any[];
    }
}

export interface ReconciliationData {
    src: any[];
    hedging: any[];
    paper: any[];
    trmsAgg: TRMSAggregation;
    forwardCurves: ForwardCurveData[];
    uniqueValues: Record<string, Record<string, any[]>>;
    portfolioName?: string;
    portfolioYear?: string;
    summary: {
        total: number;
        src: number;
        hedging: number;
        paper: number;
    };
    fileNames?: string[];
    syncOptions?: {
        syncReconciled: boolean;
        syncPrices: boolean;
        overwriteManual: boolean;
    };
}

interface DiscrepancyCheckProps {
  profiles: CargoProfile[];
  trmsData: ReconciliationData;
  onTrmsUpload: (data: ReconciliationData) => void;
  onEditProfile?: (profile: CargoProfile) => void;
  onForwardCurveUpdate?: () => void;
}

type SortConfig = {
  key: string | null;
  direction: 'asc' | 'desc';
};

type TRMSTab = 'reconcile' | 'src' | 'hedging' | 'paper';

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

const getMonth = (dStr: string) => {
    if (!dStr) return null;
    const d = new Date(dStr);
    return isNaN(d.getTime()) ? null : `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
};

const getMonthStr = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const DiscrepancyCheck: React.FC<DiscrepancyCheckProps> = ({ 
  profiles, 
  trmsData, 
  onTrmsUpload, 
  onEditProfile,
  onForwardCurveUpdate
}) => {
  const [activeTab, setActiveTab] = useState<TRMSTab>('reconcile');
  const [isParsing, setIsParsing] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [pendingData, setPendingData] = useState<ReconciliationData | null>(null);
  const [syncOptions, setSyncOptions] = useState({
    syncReconciled: true,
    syncPrices: false,
    overwriteManual: false,
    syncForwardCurves: false
  });
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });
  
  const [activeFilters, setActiveFilters] = useState<Record<string, Set<any>>>({});
  const [openFilterMenu, setOpenFilterMenu] = useState<string | null>(null);
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [viewingRawData, setViewingRawData] = useState<any[] | null>(null);
  const [viewingSN, setViewingSN] = useState<string>('');
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
    'Loading Month': 200,
    'Delivery Month': 200,
    'Volume Type': 200,
    'Price Status': 200,
    'Purchase Price': 200,
    'Purchase Volume': 200,
    'Sales Price': 200,
    'Sales Volume': 200,
    'SRC Components': 200,
    'Purchase Cost': 200,
    'Sales Revenue': 200,
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
      portfolioName: 'Unknown',
      portfolioYear: 'Unknown',
      summary: { total: 0, src: 0, hedging: 0, paper: 0 },
      fileNames: Array.from(files).map(f => f.name)
    };

    const processFile = (file: File) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const arrayBuffer = evt.target?.result;
        const worker = new Worker(new URL('../services/excelWorker.ts', import.meta.url), { type: 'module' });
        
        worker.onmessage = (e) => {
          const result = e.data;
          if (result.debugInfo) {
            console.log('Excel Worker Debug Info:', result.debugInfo);
          }
          if (result.success) {
            if (result.portfolioName && result.portfolioName !== 'Unknown') {
              aggregatedData.portfolioName = result.portfolioName;
            }
            if (result.portfolioYear && result.portfolioYear !== 'Unknown') {
              aggregatedData.portfolioYear = result.portfolioYear;
            }
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
                if (incoming.reconciledPurchaseCost > 0) existing.reconciledPurchaseCost = incoming.reconciledPurchaseCost;
                if (incoming.reconciledSalesRevenue > 0) existing.reconciledSalesRevenue = incoming.reconciledSalesRevenue;
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
            setPendingData(aggregatedData);
            setShowSyncModal(true);
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
          data: arrayBuffer, 
          whitelistColumns: WHITELIST_COLUMNS,
          priorityColumns: PRIORITY_COLUMNS
        });
      };
      reader.readAsArrayBuffer(file);
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

        const totalBuyVol = (p.loadedVolume || 0) + (p.tier2LoadedVolume || 0);
        const totalSellVol = (p.deliveredVolume || 0) + (p.tier2DeliveredVolume || 0);
        
        const effectiveBuyPrice = totalBuyVol > 0 
            ? ((p.absoluteBuyPrice || 0) * (p.loadedVolume || 0) + (p.absoluteTier2BuyPrice || 0) * (p.tier2LoadedVolume || 0)) / totalBuyVol
            : (p.absoluteBuyPrice || 0);
            
        const effectiveSellPrice = totalSellVol > 0
            ? ((p.absoluteSellPrice || 0) * (p.deliveredVolume || 0) + (p.absoluteTier2SellPrice || 0) * (p.tier2DeliveredVolume || 0)) / totalSellVol
            : (p.absoluteSellPrice || 0);
        
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
                priceStatus: isAppRealized ? 'Fixed' : 'Estimate',
                reconciledPurchaseCost: p.reconciledPurchaseCost || 0,
                reconciledSalesRevenue: p.reconciledSalesRevenue || 0,
                isTiered: p.isTieredPricing,
                tier1BuyPrice: p.absoluteBuyPrice || 0,
                tier1BuyVol: p.loadedVolume || 0,
                tier2BuyPrice: p.absoluteTier2BuyPrice || 0,
                tier2BuyVol: p.tier2LoadedVolume || 0,
                tier1SellPrice: p.absoluteSellPrice || 0,
                tier1SellVol: p.deliveredVolume || 0,
                tier2SellPrice: p.absoluteTier2SellPrice || 0,
                tier2SellVol: p.tier2DeliveredVolume || 0,
                effectiveBuyPrice,
                effectiveSellPrice
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
                trmsPurchaseValue: trms?.trmsPurchaseValue || 0,
                trmsSalesValue: trms?.trmsSalesValue || 0,
                reconciledPurchaseCost: trms?.reconciledPurchaseCost || 0,
                reconciledSalesRevenue: trms?.reconciledSalesRevenue || 0,
                trmsRealized: trms ? (
                    buyLegs.length > 0 && sellLegs.length > 0 &&
                    buyLegs.every(l => l.priceStatus === 'Fixed') &&
                    sellLegs.every(l => l.priceStatus === 'Fixed') &&
                    trmsVolType === 'Actual'
                ) : false,
                commWindowEndDate: trms?.commWindowEndDate || '',
                rawRows: trms?.rawRows || []
            },
            discrepancies: new Set(),
            errorPcts: {
                buyPrice: 100, sellPrice: 100, buyVol: 100, sellVol: 100, src: 100,
                loadingDate: 100, deliveryDate: 100, purchaseCost: 100, salesRevenue: 100
            }
        };

        const calcError = (app: number, trmsVals: number[]) => {
            if (trmsVals.length === 0) return 100;
            if (app === 0) {
                const best = trmsVals.reduce((prev, curr) => Math.abs(curr) < Math.abs(prev) ? curr : prev);
                return best === 0 ? 0 : 100;
            }
            const best = trmsVals.reduce((prev, curr) => Math.abs(curr - app) < Math.abs(prev - app) ? curr : prev);
            return (Math.abs(app - best) / Math.abs(app)) * 100;
        };

        if (trms) {
            // Price/Vol Errors
            row.errorPcts.buyPrice = calcError(row.app.buyPrice, row.trms.buyLegs.map(l => l.price));
            row.errorPcts.sellPrice = calcError(row.app.sellPrice, row.trms.sellLegs.map(l => l.price));
            row.errorPcts.buyVol = calcError(row.app.buyVol, row.trms.buyLegs.map(l => l.vol));
            row.errorPcts.sellVol = calcError(row.app.sellVol, row.trms.sellLegs.map(l => l.vol));
            
            // Cost/Revenue Errors
            const appPurc = row.app.reconciledPurchaseCost > 0 ? row.app.reconciledPurchaseCost : row.app.buyPrice * row.app.buyVol;
            const appSales = row.app.reconciledSalesRevenue > 0 ? row.app.reconciledSalesRevenue : row.app.sellPrice * row.app.sellVol;
            row.errorPcts.purchaseCost = calcError(appPurc, row.trms.buyLegs.map(l => Math.abs(l.valueUSD)));
            row.errorPcts.salesRevenue = calcError(appSales, row.trms.sellLegs.map(l => Math.abs(l.valueUSD)));

            // SRC Error
            if (row.trms.srcLegs.length === 0) {
                row.errorPcts.src = row.app.src === 0 ? 0 : 100;
            } else {
                row.errorPcts.src = calcError(row.app.src, row.trms.srcLegs.map(l => l.value));
            }

            // Date Errors
            const trmsMonth = getMonth(row.trms.commWindowEndDate);
            
            const appLMonth = getMonth(row.app.loadingDate);
            row.errorPcts.loadingDate = (trmsMonth && appLMonth && trmsMonth === appLMonth) ? 0 : 100;

            const appDMonth = getMonth(row.app.deliveryDate);
            row.errorPcts.deliveryDate = (trmsMonth && appDMonth && trmsMonth === appDMonth) ? 0 : 100;

            // Discrepancies based on error thresholds
            if (row.errorPcts.buyPrice > 0.01 && row.app.buyPrice > 0) row.discrepancies.add('Buy Price');
            if (row.errorPcts.sellPrice > 0.01 && row.app.sellPrice > 0) row.discrepancies.add('Sell Price');
            if (row.errorPcts.buyVol > 0.1 && row.app.buyVol > 0) row.discrepancies.add('Buy Vol');
            if (row.errorPcts.sellVol > 0.1 && row.app.sellVol > 0) row.discrepancies.add('Sell Vol');
            if (row.errorPcts.src > 0.1 && (row.app.src > 0 || row.trms.src > 0)) row.discrepancies.add('SRC Cost');
            if (row.errorPcts.loadingDate > 0) row.discrepancies.add('Loading Month');
            if (row.errorPcts.deliveryDate > 0) row.discrepancies.add('Delivery Month');
            
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
    return trmsData[activeTab as keyof ReconciliationData] as any[];
  }, [activeTab, trmsData, reconciliationData]);

  const headers = useMemo(() => {
    if (activeTab === 'reconcile') {
        return [
            'Strategy Name', 'Loading Month', 'Delivery Month', 'Volume Type', 'Price Status', 
            'Purchase Price', 'Purchase Volume', 'Purchase Cost', 
            'Sales Price', 'Sales Volume', 'Sales Revenue', 
            'SRC Components', 'Value Sync'
        ];
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
                  if (header === 'Loading Month') val = rec.app.loadingDate;
                  else if (header === 'Delivery Month') val = rec.app.deliveryDate;
              } else val = r[header];

              if (!val) return;
              const d = new Date(val);
              if (isNaN(d.getTime())) return;

              const year = d.getUTCFullYear().toString();
              const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
              const month = monthNames[d.getUTCMonth()];
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
                  if (header === 'Purchase Cost') return rec.trms.trmsPurchaseValue;
                  if (header === 'Sales Revenue') return rec.trms.trmsSalesValue;
                  if (header === 'Loading Month') return rec.app.loadingDate;
                  if (header === 'Delivery Month') return rec.app.deliveryDate;
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
            else if (header === 'Purchase Cost') val = r.trms.trmsPurchaseValue;
            else if (header === 'Sales Revenue') val = r.trms.trmsSalesValue;
            else if (header === 'Loading Month') val = r.app.loadingDate;
            else if (header === 'Delivery Month') val = r.app.deliveryDate;
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
            if (key === 'Purchase Cost') return r.trms.trmsPurchaseValue;
            if (key === 'Sales Revenue') return r.trms.trmsSalesValue;
            if (key === 'Loading Month') return r.app.loadingDate;
            if (key === 'Delivery Month') return r.app.deliveryDate;
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
  }, [currentRawData, debouncedSearch, activeFilters, sortConfig, activeTab]);

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
    setShowReportPreview(true);
  };

  const generateReportHTML = () => {
    const tableHeaders = headers.map(h => `<th style="border: 1px solid #e2e8f0; padding: 12px 16px; background: #f8fafc; font-size: 10px; text-transform: uppercase; font-family: sans-serif; color: #475569; font-weight: 800; letter-spacing: 0.5px; text-align: left;">${h}</th>`).join('');
    
    const tableRows = processedData.map((row: any) => {
        if (activeTab === 'reconcile') {
            const r = row as ReconciliationRow;
            const loadingMatch = r.errorPcts.loadingDate === 0;
            const deliveryMatch = r.errorPcts.deliveryDate === 0;
            
            const getErrorColor = (pct: number) => pct > 5 ? '#ef4444' : pct > 0.1 ? '#f59e0b' : '#10b981';
            const getBgColor = (pct: number) => pct > 5 ? '#fef2f2' : pct > 0.1 ? '#fffbeb' : '#f0fdf4';

            const renderLegs = (legs: TRMSCommodityLeg[]) => {
                if (legs.length === 0) return '<div style="color: #94a3b8; font-style: italic; font-size: 9px;">No legs found</div>';
                return legs.map((l, i) => `
                    <div style="font-size: 9px; padding: 4px; border: 1px solid #e2e8f0; border-radius: 4px; margin-top: 4px; background: #f8fafc;">
                        <div style="display: flex; justify-between; font-weight: bold; color: ${l.buySell === 'Buy' ? '#2563eb' : '#db2777'};">
                            <span>LEG ${i+1} (${l.buySell})</span>
                            <span style="margin-left: auto;">$${l.price.toFixed(3)} | ${l.vol.toLocaleString()}</span>
                        </div>
                        <div style="font-size: 8px; color: #64748b; margin-top: 2px;">${l.startDate} to ${l.endDate} | ${l.settlementType}</div>
                    </div>
                `).join('');
            };

            const renderSrcLegs = (legs: TRMSSrcLeg[]) => {
                if (legs.length === 0) return '<div style="color: #94a3b8; font-style: italic; font-size: 9px;">No SRC legs</div>';
                return legs.map((l, i) => `
                    <div style="font-size: 9px; padding: 4px; border: 1px solid #e2e8f0; border-radius: 4px; margin-top: 4px; background: #f8fafc; display: flex; justify-content: space-between;">
                        <span>${l.description}</span>
                        <span style="font-weight: bold;">${formatUSD(l.value)}</span>
                    </div>
                `).join('');
            };

            const getMonthName = (dStr: string) => {
                if (!dStr) return '-';
                const d = new Date(dStr);
                if (isNaN(d.getTime())) return '-';
                return d.toLocaleString('default', { month: 'short', year: 'numeric' });
            };

            return `
                <tr style="font-family: monospace; background: ${!r.foundInTrms ? '#f8fafc' : 'white'};">
                    <td style="border: 1px solid #e2e8f0; padding: 12px 16px; font-size: 11px; font-weight: bold; color: #1e293b;">
                        ${r.strategyName}
                        <div style="font-size: 9px; margin-top: 4px; color: ${r.foundInTrms ? '#10b981' : '#94a3b8'}; font-weight: 900; text-transform: uppercase;">
                            ${r.foundInTrms ? '● Matched' : '○ Missing'}
                        </div>
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 12px 16px; font-size: 10px; background: ${r.foundInTrms ? (loadingMatch ? '#f0fdf4' : '#fef2f2') : 'transparent'};">
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">App Month</div>
                        <div style="font-weight: bold; color: #1e293b;">${getMonthName(r.app.loadingDate)}</div>
                        <div style="margin-top: 8px; color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">TRMS Month</div>
                        <div style="font-weight: bold; color: #475569;">${getMonthName(r.trms.commWindowEndDate)}</div>
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 12px 16px; font-size: 10px; background: ${r.foundInTrms ? (deliveryMatch ? '#f0fdf4' : '#fef2f2') : 'transparent'};">
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">App Month</div>
                        <div style="font-weight: bold; color: #1e293b;">${getMonthName(r.app.deliveryDate)}</div>
                        <div style="margin-top: 8px; color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">TRMS Month</div>
                        <div style="font-weight: bold; color: #475569;">${getMonthName(r.trms.commWindowEndDate)}</div>
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 12px 16px; font-size: 10px;">
                        <div style="display: inline-block; padding: 2px 6px; border-radius: 4px; background: ${r.app.volumeType === 'Actual' ? '#2563eb' : '#f1f5f9'}; color: ${r.app.volumeType === 'Actual' ? 'white' : '#64748b'}; font-size: 9px; font-weight: bold;">${r.app.volumeType}</div>
                        <div style="margin-top: 4px; font-size: 9px; color: #94a3b8;">TRMS: ${r.trms.volumeType}</div>
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 12px 16px; font-size: 10px;">
                        <div style="display: inline-block; padding: 2px 6px; border-radius: 4px; background: ${r.app.priceStatus === 'Fixed' ? '#059669' : '#f1f5f9'}; color: ${r.app.priceStatus === 'Fixed' ? 'white' : '#64748b'}; font-size: 9px; font-weight: bold;">${r.app.priceStatus}</div>
                        <div style="margin-top: 4px; font-size: 9px; color: #94a3b8;">TRMS: ${r.trms.priceStatus}</div>
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 12px 16px; font-size: 10px; background: ${getBgColor(r.errorPcts.buyPrice)};">
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">App Purchase Price</div>
                        ${r.app.isTiered ? `
                            <div style="font-size: 9px; color: #1e293b;">T1: $${r.app.tier1BuyPrice?.toFixed(3)}</div>
                            <div style="font-size: 9px; color: #1e293b;">T2: $${r.app.tier2BuyPrice?.toFixed(3)}</div>
                            <div style="font-weight: bold; color: #6366f1; margin-top: 2px;">Eff: $${r.app.effectiveBuyPrice?.toFixed(3)}</div>
                        ` : `
                            <div style="font-weight: bold; color: #1e293b;">$${r.app.buyPrice.toFixed(3)}</div>
                        `}
                        <div style="margin-top: 4px; font-size: 9px; color: ${getErrorColor(r.errorPcts.buyPrice)}; font-weight: bold;">Err: ${r.errorPcts.buyPrice.toFixed(2)}%</div>
                        <div style="margin-top: 8px; color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">TRMS Legs</div>
                        ${renderLegs(r.trms.buyLegs)}
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 12px 16px; font-size: 10px; background: ${getBgColor(r.errorPcts.buyVol)};">
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">App Purchase Vol</div>
                        ${r.app.isTiered ? `
                            <div style="font-size: 9px; color: #1e293b;">T1: ${r.app.tier1BuyVol?.toLocaleString()}</div>
                            <div style="font-size: 9px; color: #1e293b;">T2: ${r.app.tier2BuyVol?.toLocaleString()}</div>
                            <div style="font-weight: bold; color: #6366f1; margin-top: 2px;">Total: ${(r.app.buyVol + (r.app.tier2BuyVol || 0)).toLocaleString()}</div>
                        ` : `
                            <div style="font-weight: bold; color: #1e293b;">${r.app.buyVol.toLocaleString()}</div>
                        `}
                        <div style="margin-top: 4px; font-size: 9px; color: ${getErrorColor(r.errorPcts.buyVol)}; font-weight: bold;">Err: ${r.errorPcts.buyVol.toFixed(2)}%</div>
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 12px 16px; font-size: 10px; background: ${getBgColor(r.errorPcts.purchaseCost)};">
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">Purchase Cost</div>
                        <div style="font-weight: bold; color: #1e293b;">${formatUSD(r.app.reconciledPurchaseCost || r.app.buyPrice * r.app.buyVol)}</div>
                        <div style="margin-top: 4px; font-size: 9px; color: ${getErrorColor(r.errorPcts.purchaseCost)}; font-weight: bold;">Err: ${r.errorPcts.purchaseCost.toFixed(2)}%</div>
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 12px 16px; font-size: 10px; background: ${getBgColor(r.errorPcts.sellPrice)};">
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">App Sales Price</div>
                        ${r.app.isTiered ? `
                            <div style="font-size: 9px; color: #1e293b;">T1: $${r.app.tier1SellPrice?.toFixed(3)}</div>
                            <div style="font-size: 9px; color: #1e293b;">T2: $${r.app.tier2SellPrice?.toFixed(3)}</div>
                            <div style="font-weight: bold; color: #6366f1; margin-top: 2px;">Eff: $${r.app.effectiveSellPrice?.toFixed(3)}</div>
                        ` : `
                            <div style="font-weight: bold; color: #1e293b;">$${r.app.sellPrice.toFixed(3)}</div>
                        `}
                        <div style="margin-top: 4px; font-size: 9px; color: ${getErrorColor(r.errorPcts.sellPrice)}; font-weight: bold;">Err: ${r.errorPcts.sellPrice.toFixed(2)}%</div>
                        <div style="margin-top: 8px; color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">TRMS Legs</div>
                        ${renderLegs(r.trms.sellLegs)}
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 12px 16px; font-size: 10px; background: ${getBgColor(r.errorPcts.sellVol)};">
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">App Sales Vol</div>
                        ${r.app.isTiered ? `
                            <div style="font-size: 9px; color: #1e293b;">T1: ${r.app.tier1SellVol?.toLocaleString()}</div>
                            <div style="font-size: 9px; color: #1e293b;">T2: ${r.app.tier2SellVol?.toLocaleString()}</div>
                            <div style="font-weight: bold; color: #6366f1; margin-top: 2px;">Total: ${(r.app.sellVol + (r.app.tier2SellVol || 0)).toLocaleString()}</div>
                        ` : `
                            <div style="font-weight: bold; color: #1e293b;">${r.app.sellVol.toLocaleString()}</div>
                        `}
                        <div style="margin-top: 4px; font-size: 9px; color: ${getErrorColor(r.errorPcts.sellVol)}; font-weight: bold;">Err: ${r.errorPcts.sellVol.toFixed(2)}%</div>
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 12px 16px; font-size: 10px; background: ${getBgColor(r.errorPcts.salesRevenue)};">
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">Sales Revenue</div>
                        <div style="font-weight: bold; color: #1e293b;">${formatUSD(r.app.reconciledSalesRevenue || r.app.sellPrice * r.app.sellVol)}</div>
                        <div style="margin-top: 4px; font-size: 9px; color: ${getErrorColor(r.errorPcts.salesRevenue)}; font-weight: bold;">Err: ${r.errorPcts.salesRevenue.toFixed(2)}%</div>
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 12px 16px; font-size: 10px; background: ${getBgColor(r.errorPcts.src)};">
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">App SRC</div>
                        <div style="font-weight: bold; color: #1e293b;">${formatUSD(r.app.src)}</div>
                        <div style="margin-top: 4px; font-size: 9px; color: ${getErrorColor(r.errorPcts.src)}; font-weight: bold;">Err: ${r.errorPcts.src.toFixed(2)}%</div>
                        <div style="margin-top: 8px; color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">TRMS Breakdown</div>
                        ${renderSrcLegs(r.trms.srcLegs)}
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 12px 16px; font-size: 10px;">
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">App P&L</div>
                        <div style="font-weight: bold; color: #1e293b;">${formatUSD((r.app.reconciledSalesRevenue || r.app.sellPrice * r.app.sellVol) - (r.app.reconciledPurchaseCost || r.app.buyPrice * r.app.buyVol) - r.app.src)}</div>
                        <div style="margin-top: 8px; color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">TRMS Base Value</div>
                        <div style="font-weight: bold; color: #475569;">${formatUSD(r.trms.commodityValue)}</div>
                        <div style="margin-top: 8px; color: #ef4444; font-size: 9px; font-weight: bold;">${Array.from(r.discrepancies).join(', ') || ''}</div>
                    </td>
                </tr>
            `;
        }
        return '';
    }).join('');

    const summaryCards = `
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; font-family: sans-serif;">
            <div style="background: #0f172a; color: white; padding: 20px; border-radius: 16px; border: 1px solid #1e293b; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                <div style="font-size: 10px; text-transform: uppercase; color: #fb7185; font-weight: 900; letter-spacing: 1px; margin-bottom: 8px;">Total Discrepancies</div>
                <div style="font-size: 32px; font-weight: 900; font-family: monospace;">${stats.totalDiscrepancies}</div>
                <div style="font-size: 10px; color: #64748b; margin-top: 8px; font-weight: bold;">POINTS REQUIRING ATTENTION</div>
            </div>
            <div style="background: white; border: 1px solid #e2e8f0; padding: 20px; border-radius: 16px; grid-column: span 3; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="font-size: 10px; text-transform: uppercase; color: #94a3b8; font-weight: 900; letter-spacing: 1px; margin-bottom: 15px;">Error Report by Column</div>
                <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 15px;">
                    <div><div style="font-size: 8px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">Purc Price</div><div style="font-size: 14px; font-weight: 900; font-family: monospace; color: ${stats.errorCounts.buyPrice > 0 ? '#ef4444' : '#10b981'}">${stats.errorCounts.buyPrice}</div></div>
                    <div><div style="font-size: 8px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">Purc Vol</div><div style="font-size: 14px; font-weight: 900; font-family: monospace; color: ${stats.errorCounts.buyVol > 0 ? '#ef4444' : '#10b981'}">${stats.errorCounts.buyVol}</div></div>
                    <div><div style="font-size: 8px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">Sales Price</div><div style="font-size: 14px; font-weight: 900; font-family: monospace; color: ${stats.errorCounts.sellPrice > 0 ? '#ef4444' : '#10b981'}">${stats.errorCounts.sellPrice}</div></div>
                    <div><div style="font-size: 8px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">Sales Vol</div><div style="font-size: 14px; font-weight: 900; font-family: monospace; color: ${stats.errorCounts.sellVol > 0 ? '#ef4444' : '#10b981'}">${stats.errorCounts.sellVol}</div></div>
                    <div><div style="font-size: 8px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">SRC Cost</div><div style="font-size: 14px; font-weight: 900; font-family: monospace; color: ${stats.errorCounts.src > 0 ? '#ef4444' : '#10b981'}">${stats.errorCounts.src}</div></div>
                    <div><div style="font-size: 8px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">Purc Cost</div><div style="font-size: 14px; font-weight: 900; font-family: monospace; color: ${stats.errorCounts.purchaseCost > 0 ? '#ef4444' : '#10b981'}">${stats.errorCounts.purchaseCost}</div></div>
                    <div><div style="font-size: 8px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">Sales Rev</div><div style="font-size: 14px; font-weight: 900; font-family: monospace; color: ${stats.errorCounts.salesRevenue > 0 ? '#ef4444' : '#10b981'}">${stats.errorCounts.salesRevenue}</div></div>
                    <div><div style="font-size: 8px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">Load Month</div><div style="font-size: 14px; font-weight: 900; font-family: monospace; color: ${stats.errorCounts.loadingMonth > 0 ? '#ef4444' : '#10b981'}">${stats.errorCounts.loadingMonth}</div></div>
                    <div><div style="font-size: 8px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">Deliv Month</div><div style="font-size: 14px; font-weight: 900; font-family: monospace; color: ${stats.errorCounts.deliveryMonth > 0 ? '#ef4444' : '#10b981'}">${stats.errorCounts.deliveryMonth}</div></div>
                    <div><div style="font-size: 8px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">Critical</div><div style="font-size: 14px; font-weight: 900; font-family: monospace; color: ${stats.criticalErrorsCount > 0 ? '#ef4444' : '#10b981'}">${stats.criticalErrorsCount}</div></div>
                </div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; font-family: sans-serif;">
            <div style="background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0;">
                <div style="font-size: 9px; color: #64748b; font-weight: bold; text-transform: uppercase; margin-bottom: 4px;">Total Volume Alignment</div>
                <div style="font-size: 16px; font-weight: 900;">App: ${stats.totals.appVol.toLocaleString()}</div>
                <div style="font-size: 12px; color: #94a3b8;">TRMS: ${stats.totals.trmsVol.toLocaleString()}</div>
                <div style="font-size: 10px; color: ${Math.abs(stats.totals.appVol - stats.totals.trmsVol) > 1000 ? '#ef4444' : '#10b981'}; font-weight: bold; margin-top: 4px;">Diff: ${(stats.totals.appVol - stats.totals.trmsVol).toLocaleString()}</div>
            </div>
            <div style="background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0;">
                <div style="font-size: 9px; color: #64748b; font-weight: bold; text-transform: uppercase; margin-bottom: 4px;">Total Purchase Cost</div>
                <div style="font-size: 16px; font-weight: 900;">App: ${formatUSD(stats.totals.appCost)}</div>
                <div style="font-size: 12px; color: #94a3b8;">TRMS: ${formatUSD(stats.totals.trmsCost)}</div>
                <div style="font-size: 10px; color: ${Math.abs(stats.totals.appCost - stats.totals.trmsCost) > 10000 ? '#ef4444' : '#10b981'}; font-weight: bold; margin-top: 4px;">Diff: ${formatUSD(stats.totals.appCost - stats.totals.trmsCost)}</div>
            </div>
            <div style="background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0;">
                <div style="font-size: 9px; color: #64748b; font-weight: bold; text-transform: uppercase; margin-bottom: 4px;">Total Sales Revenue</div>
                <div style="font-size: 16px; font-weight: 900;">App: ${formatUSD(stats.totals.appRev)}</div>
                <div style="font-size: 12px; color: #94a3b8;">TRMS: ${formatUSD(stats.totals.trmsRev)}</div>
                <div style="font-size: 10px; color: ${Math.abs(stats.totals.appRev - stats.totals.trmsRev) > 10000 ? '#ef4444' : '#10b981'}; font-weight: bold; margin-top: 4px;">Diff: ${formatUSD(stats.totals.appRev - stats.totals.trmsRev)}</div>
            </div>
            <div style="background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0;">
                <div style="font-size: 9px; color: #64748b; font-weight: bold; text-transform: uppercase; margin-bottom: 4px;">Total SRC Alignment</div>
                <div style="font-size: 16px; font-weight: 900;">App: ${formatUSD(stats.totals.appSrc)}</div>
                <div style="font-size: 12px; color: #94a3b8;">TRMS: ${formatUSD(stats.totals.trmsSrc)}</div>
                <div style="font-size: 10px; color: ${Math.abs(stats.totals.appSrc - stats.totals.trmsSrc) > 1000 ? '#ef4444' : '#10b981'}; font-weight: bold; margin-top: 4px;">Diff: ${formatUSD(stats.totals.appSrc - stats.totals.trmsSrc)}</div>
            </div>
        </div>
    `;

    return `
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset="UTF-8">
                <title>TRMS Reconciliation Report</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; background-color: #f1f5f9; color: #0f172a; line-height: 1.5; }
                    .container { max-width: 1600px; margin: 0 auto; background: white; padding: 50px; border-radius: 32px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.15); border: 1px solid #e2e8f0; }
                    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 2px solid #f1f5f9; padding-bottom: 30px; }
                    .title-area h1 { font-size: 36px; font-weight: 900; letter-spacing: -1.5px; margin: 0; color: #0f172a; }
                    .portfolio-info { margin-top: 10px; display: flex; gap: 20px; }
                    .info-pill { background: #f1f5f9; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
                    .meta { font-size: 11px; color: #94a3b8; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
                    table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 20px; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                    th { text-align: left; background-color: #f8fafc; padding: 14px 16px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; border-bottom: 2px solid #e2e8f0; }
                    td { padding: 14px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
                    tr:last-child td { border-bottom: none; }
                    tr:hover { background-color: #f8fafc; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="title-area">
                            <h1>TRMS Reconciliation Report</h1>
                            <div class="portfolio-info">
                                <span class="info-pill">Portfolio: ${trmsData.portfolioName || 'N/A'}</span>
                                <span class="info-pill">Year: ${trmsData.portfolioYear || 'N/A'}</span>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div class="meta">Generated on ${new Date().toLocaleString()}</div>
                            <div style="font-size: 10px; color: #6366f1; font-weight: 900; margin-top: 5px; text-transform: uppercase;">App Version 2.5 • Verified</div>
                        </div>
                    </div>
                    
                    ${summaryCards}
                    
                    <table>
                        <thead><tr>${tableHeaders}</tr></thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                    
                    <div style="margin-top: 50px; padding: 30px; background: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0; text-align: center;">
                        <div style="font-size: 11px; color: #94a3b8; font-weight: 900; text-transform: uppercase; letter-spacing: 3px;">
                            End of Reconciliation Report • Confidential Data
                        </div>
                        <div style="font-size: 9px; color: #cbd5e1; margin-top: 10px;">
                            This report was generated automatically by the TRMS Reconciliation Engine.
                        </div>
                    </div>
                </div>
            </body>
        </html>
    `;
  };

  const handleDownloadHTML = () => {
    const html = generateReportHTML();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TRMS_Reconciliation_Report_${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("HTML report downloaded successfully.");
  };

  const handleDownloadExcel = () => {
    const reportData = processedData.map((row: any) => {
      if (activeTab === 'reconcile') {
        const r = row as ReconciliationRow;
        return {
          'Strategy Name': r.strategyName,
          'Matched in TRMS': r.foundInTrms ? 'Yes' : 'No',
          'App Loading Month': getMonthStr(r.app.loadingDate),
          'TRMS Loading Month': getMonthStr(r.trms.commWindowEndDate),
          'Loading Month Error %': r.errorPcts.loadingDate,
          'App Delivery Month': getMonthStr(r.app.deliveryDate),
          'TRMS Delivery Month': getMonthStr(r.trms.commWindowEndDate),
          'Delivery Month Error %': r.errorPcts.deliveryDate,
          'App Volume Type': r.app.volumeType,
          'TRMS Volume Type': r.trms.volumeType,
          'App Price Status': r.app.priceStatus,
          'TRMS Price Status': r.trms.priceStatus,
          'App Purchase Price': r.app.buyPrice,
          'App Purchase Price Tier 2': r.app.tier2BuyPrice || 0,
          'App Effective Purchase Price': r.app.effectiveBuyPrice || r.app.buyPrice,
          'TRMS Purchase Price (Best Match)': r.trms.buyLegs.length > 0 ? r.trms.buyLegs.reduce((prev, curr) => Math.abs(curr.price - r.app.buyPrice) < Math.abs(prev.price - r.app.buyPrice) ? curr : prev).price : 0,
          'Purchase Price Error %': r.errorPcts.buyPrice,
          'App Purchase Volume': r.app.buyVol,
          'App Purchase Volume Tier 2': r.app.tier2BuyVol || 0,
          'App Total Purchase Volume': r.app.buyVol + (r.app.tier2BuyVol || 0),
          'TRMS Purchase Volume (Best Match)': r.trms.buyLegs.length > 0 ? r.trms.buyLegs.reduce((prev, curr) => Math.abs(curr.vol - r.app.buyVol) < Math.abs(prev.vol - r.app.buyVol) ? curr : prev).vol : 0,
          'Purchase Volume Error %': r.errorPcts.buyVol,
          'App Purchase Cost': r.app.reconciledPurchaseCost > 0 ? r.app.reconciledPurchaseCost : r.app.buyPrice * r.app.buyVol,
          'TRMS Purchase Value (Best Match)': r.trms.buyLegs.length > 0 ? r.trms.buyLegs.reduce((prev, curr) => Math.abs(Math.abs(curr.valueUSD) - (r.app.reconciledPurchaseCost > 0 ? r.app.reconciledPurchaseCost : r.app.buyPrice * r.app.buyVol)) < Math.abs(Math.abs(prev.valueUSD) - (r.app.reconciledPurchaseCost > 0 ? r.app.reconciledPurchaseCost : r.app.buyPrice * r.app.buyVol)) ? curr : prev).valueUSD : 0,
          'Purchase Cost Error %': r.errorPcts.purchaseCost,
          'App Sales Price': r.app.sellPrice,
          'App Sales Price Tier 2': r.app.tier2SellPrice || 0,
          'App Effective Sales Price': r.app.effectiveSellPrice || r.app.sellPrice,
          'TRMS Sales Price (Best Match)': r.trms.sellLegs.length > 0 ? r.trms.sellLegs.reduce((prev, curr) => Math.abs(curr.price - r.app.sellPrice) < Math.abs(prev.price - r.app.sellPrice) ? curr : prev).price : 0,
          'Sales Price Error %': r.errorPcts.sellPrice,
          'App Sales Volume': r.app.sellVol,
          'App Sales Volume Tier 2': r.app.tier2SellVol || 0,
          'App Total Sales Volume': r.app.sellVol + (r.app.tier2SellVol || 0),
          'TRMS Sales Volume (Best Match)': r.trms.sellLegs.length > 0 ? r.trms.sellLegs.reduce((prev, curr) => Math.abs(curr.vol - r.app.sellVol) < Math.abs(prev.vol - r.app.sellVol) ? curr : prev).vol : 0,
          'Sales Volume Error %': r.errorPcts.sellVol,
          'App Sales Revenue': r.app.reconciledSalesRevenue > 0 ? r.app.reconciledSalesRevenue : r.app.sellPrice * r.app.sellVol,
          'TRMS Sales Value (Best Match)': r.trms.sellLegs.length > 0 ? r.trms.sellLegs.reduce((prev, curr) => Math.abs(Math.abs(curr.valueUSD) - (r.app.reconciledSalesRevenue > 0 ? r.app.reconciledSalesRevenue : r.app.sellPrice * r.app.sellVol)) < Math.abs(Math.abs(prev.valueUSD) - (r.app.reconciledSalesRevenue > 0 ? r.app.reconciledSalesRevenue : r.app.sellPrice * r.app.sellVol)) ? curr : prev).valueUSD : 0,
          'Sales Revenue Error %': r.errorPcts.salesRevenue,
          'App SRC Cost': r.app.src,
          'TRMS SRC Cost (Best Match)': r.trms.srcLegs.length > 0 ? r.trms.srcLegs.reduce((prev, curr) => Math.abs(curr.value - r.app.src) < Math.abs(prev.value - r.app.src) ? curr : prev).value : 0,
          'SRC Cost Error %': r.errorPcts.src,
          'App Physical P&L': (r.app.reconciledSalesRevenue > 0 ? r.app.reconciledSalesRevenue : r.app.sellPrice * r.app.sellVol) - (r.app.reconciledPurchaseCost > 0 ? r.app.reconciledPurchaseCost : r.app.buyPrice * r.app.buyVol) - r.app.src,
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
    toast.success("Excel report downloaded successfully.");
  };

  const formatUSD = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  const stats = useMemo(() => {
    const totalDiscrepancies = reconciliationData.reduce((acc, r) => acc + r.discrepancies.size, 0);
    const totalSrcValue = Object.values(trmsData.trmsAgg).reduce((acc, curr) => acc + curr.srcValue, 0);
    const totalHedgingPnL = Object.values(trmsData.trmsAgg).reduce((acc, curr) => acc + curr.hedgingPnL, 0);

    const foundRows = reconciliationData.filter(r => r.foundInTrms);
    
    const totals = {
        appVol: reconciliationData.reduce((acc, r) => acc + r.app.buyVol + r.app.sellVol, 0),
        trmsVol: reconciliationData.reduce((acc, r) => acc + r.trms.buyLegs.reduce((sum, l) => sum + l.vol, 0) + r.trms.sellLegs.reduce((sum, l) => sum + l.vol, 0), 0),
        appCost: reconciliationData.reduce((acc, r) => acc + (r.app.reconciledPurchaseCost || r.app.buyPrice * r.app.buyVol), 0),
        trmsCost: reconciliationData.reduce((acc, r) => acc + r.trms.buyLegs.reduce((sum, l) => sum + Math.abs(l.valueUSD), 0), 0),
        appRev: reconciliationData.reduce((acc, r) => acc + (r.app.reconciledSalesRevenue || r.app.sellPrice * r.app.sellVol), 0),
        trmsRev: reconciliationData.reduce((acc, r) => acc + r.trms.sellLegs.reduce((sum, l) => sum + Math.abs(l.valueUSD), 0), 0),
        appSrc: reconciliationData.reduce((acc, r) => acc + r.app.src, 0),
        trmsSrc: reconciliationData.reduce((acc, r) => acc + r.trms.src, 0),
    };

    const avgErrors = {
        buyPrice: foundRows.length ? foundRows.reduce((acc, r) => acc + r.errorPcts.buyPrice, 0) / foundRows.length : 0,
        sellPrice: foundRows.length ? foundRows.reduce((acc, r) => acc + r.errorPcts.sellPrice, 0) / foundRows.length : 0,
        buyVol: foundRows.length ? foundRows.reduce((acc, r) => acc + r.errorPcts.buyVol, 0) / foundRows.length : 0,
        sellVol: foundRows.length ? foundRows.reduce((acc, r) => acc + r.errorPcts.sellVol, 0) / foundRows.length : 0,
        src: foundRows.length ? foundRows.reduce((acc, r) => acc + r.errorPcts.src, 0) / foundRows.length : 0,
        purchaseCost: foundRows.length ? foundRows.reduce((acc, r) => acc + r.errorPcts.purchaseCost, 0) / foundRows.length : 0,
        salesRevenue: foundRows.length ? foundRows.reduce((acc, r) => acc + r.errorPcts.salesRevenue, 0) / foundRows.length : 0,
    };

    const errorCounts = {
        buyPrice: foundRows.filter(r => r.errorPcts.buyPrice > 0.1).length,
        sellPrice: foundRows.filter(r => r.errorPcts.sellPrice > 0.1).length,
        buyVol: foundRows.filter(r => r.errorPcts.buyVol > 0.1).length,
        sellVol: foundRows.filter(r => r.errorPcts.sellVol > 0.1).length,
        src: foundRows.filter(r => r.errorPcts.src > 0.1).length,
        loadingMonth: foundRows.filter(r => r.errorPcts.loadingDate > 0).length,
        deliveryMonth: foundRows.filter(r => r.errorPcts.deliveryDate > 0).length,
        purchaseCost: foundRows.filter(r => r.errorPcts.purchaseCost > 0.1).length,
        salesRevenue: foundRows.filter(r => r.errorPcts.salesRevenue > 0.1).length,
    };

    const criticalErrorsCount = foundRows.filter(r => 
        r.errorPcts.buyPrice > 5 || r.errorPcts.sellPrice > 5 || 
        r.errorPcts.buyVol > 5 || r.errorPcts.sellVol > 5 || 
        r.errorPcts.src > 5 || r.errorPcts.purchaseCost > 5 || 
        r.errorPcts.salesRevenue > 5
    ).length;

    return { totalDiscrepancies, totalSrcValue, totalHedgingPnL, avgErrors, totals, criticalErrorsCount, errorCounts };
  }, [reconciliationData, trmsData.trmsAgg]);

  const handleConfirmSync = () => {
    if (pendingData) {
      if (syncOptions.syncForwardCurves && pendingData.forwardCurves && pendingData.forwardCurves.length > 0) {
        pendingData.forwardCurves.forEach(fc => {
          const monthToPrices: Record<string, Record<string, number>> = {};
          fc.curves.forEach(curve => {
            curve.points.forEach(point => {
              if (!monthToPrices[point.month]) monthToPrices[point.month] = {};
              monthToPrices[point.month][curve.index] = point.value;
            });
          });

          const rows: ForwardCurveRow[] = Object.entries(monthToPrices).map(([month, prices]) => ({
            month,
            prices
          })).sort((a, b) => a.month.localeCompare(b.month));

          if (rows.length > 0) {
            saveForwardCurve(fc.asOfDate, rows);
            toast.success(`Forward curve for ${fc.asOfDate} imported.`);
            if (onForwardCurveUpdate) onForwardCurveUpdate();
          }
        });
      }

      onTrmsUpload({
        ...pendingData,
        syncOptions
      });
      setPendingData(null);
      setShowSyncModal(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 relative">
      {/* Sync Options Modal */}
      <AnimatePresence>
        {showSyncModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="p-6 border-b border-slate-100 bg-slate-50">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  Jarvis Sync Options
                </h3>
                <div className="mt-2 flex flex-wrap gap-1">
                  {pendingData?.fileNames?.map(name => (
                    <span key={name} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded-full border border-indigo-100 truncate max-w-[150px]">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      checked={syncOptions.syncReconciled}
                      onChange={e => setSyncOptions(prev => ({ ...prev, syncReconciled: e.target.checked }))}
                      className="mt-1 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="block text-sm font-bold text-slate-700 group-hover:text-indigo-600 transition-colors">Sync Reconciled Values</span>
                      <span className="block text-xs text-slate-500">Import official Finance Revenue and Cost from Master Sheet. This will override market calculations.</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      checked={syncOptions.syncPrices}
                      onChange={e => setSyncOptions(prev => ({ ...prev, syncPrices: e.target.checked }))}
                      className="mt-1 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="block text-sm font-bold text-slate-700 group-hover:text-indigo-600 transition-colors">Sync Absolute Prices</span>
                      <span className="block text-xs text-slate-500">Import Buy/Sell prices directly from Jarvis. Useful for matching TRMS exactly.</span>
                    </div>
                  </label>

                  {syncOptions.syncPrices && (
                    <motion.label 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-start gap-3 cursor-pointer group ml-7 p-3 bg-amber-50 rounded-lg border border-amber-100"
                    >
                      <input 
                        type="checkbox" 
                        checked={syncOptions.overwriteManual}
                        onChange={e => setSyncOptions(prev => ({ ...prev, overwriteManual: e.target.checked }))}
                        className="mt-1 w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500"
                      />
                      <div>
                        <span className="block text-sm font-bold text-amber-800">Overwrite Manual Prices</span>
                        <span className="block text-xs text-amber-600">If checked, this will replace prices even if you have manually locked them in the form.</span>
                      </div>
                    </motion.label>
                  )}

                  {pendingData?.forwardCurves && pendingData.forwardCurves.length > 0 && (
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={syncOptions.syncForwardCurves}
                        onChange={e => setSyncOptions(prev => ({ ...prev, syncForwardCurves: e.target.checked }))}
                        className="mt-1 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="block text-sm font-bold text-slate-700 group-hover:text-indigo-600 transition-colors">
                          Import Forward Curves ({pendingData.forwardCurves.length})
                        </span>
                        <span className="block text-xs text-slate-500">Extract and save forward curve data from the "Forward Curve" sheet in Jarvis files.</span>
                      </div>
                    </label>
                  )}
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">Multi-File Handling</h4>
                  <p className="text-[10px] text-slate-500 leading-relaxed italic">
                    "Latest File Wins": If multiple files contain data for the same strategy, the system will merge individual TRMS line items but will use the reconciled values from the last file processed as the source of truth.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                <button 
                  onClick={() => { setShowSyncModal(false); setPendingData(null); }}
                  className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all"
                >
                  Discard
                </button>
                <button 
                  onClick={handleConfirmSync}
                  className="flex-[2] px-4 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-200 transition-all"
                >
                  Apply Sync
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
            <button 
              onClick={() => {
                if (window.confirm('Are you sure you want to clear all TRMS and Jarvis data? This will not affect your cargo profiles.')) {
                  onTrmsUpload({
                    src: [], hedging: [], paper: [], trmsAgg: {}, forwardCurves: [], uniqueValues: {},
                    summary: { total: 0, src: 0, hedging: 0, paper: 0 }
                  });
                }
              }}
              className="px-4 py-2 bg-white border border-rose-200 text-rose-600 text-xs font-bold rounded-lg hover:bg-rose-50 hover:border-rose-300 transition-all flex items-center gap-2 shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Clear Data
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
                          onViewRawData={(sn, rows) => {
                              setViewingSN(sn);
                              setViewingRawData(rows);
                          }}
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
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
                  <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <div className="relative z-10">
                  <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest block mb-1">Critical Errors</span>
                  <h3 className="text-3xl font-black text-white font-mono">{stats.criticalErrorsCount}</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mt-2">Errors exceeding 5%</p>
              </div>
          </motion.div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between col-span-1 md:col-span-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3">Average Error Summary</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                      { label: 'Purc Price', val: stats.avgErrors.buyPrice },
                      { label: 'Purc Vol', val: stats.avgErrors.buyVol },
                      { label: 'Sales Price', val: stats.avgErrors.sellPrice },
                      { label: 'Sales Vol', val: stats.avgErrors.sellVol },
                      { label: 'SRC Cost', val: stats.avgErrors.src },
                      { label: 'Purc Cost', val: stats.avgErrors.purchaseCost },
                      { label: 'Sales Rev', val: stats.avgErrors.salesRevenue }
                  ].map(err => (
                      <div key={err.label} className="flex flex-col">
                          <span className="text-[8px] font-bold text-slate-400 uppercase truncate">{err.label}</span>
                          <span className={`text-sm font-black font-mono ${err.val > 5 ? 'text-rose-600' : err.val > 0.1 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {err.val.toFixed(2)}%
                          </span>
                      </div>
                  ))}
              </div>
          </div>
      </div>
      {/* Report Preview Modal */}
      <AnimatePresence>
        {showReportPreview && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl h-[90vh] overflow-hidden border border-slate-200 flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <div>
                    <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                        <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 2v-6m-9-9H5a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012 2h2a2 2 0 002-2M9 5a2 2 0 012 2h2a2 2 0 012 2" /></svg>
                        Report Preview
                    </h3>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Review your reconciliation data before export</p>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={handleDownloadHTML}
                        className="px-4 py-2 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-200"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Download HTML
                    </button>
                    <button 
                        onClick={handleDownloadExcel}
                        className="px-4 py-2 bg-emerald-600 text-white text-xs font-black rounded-xl hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-200"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Download Excel
                    </button>
                    <button 
                        onClick={() => setShowReportPreview(false)}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-auto p-8 bg-slate-100/50">
                  <div 
                    className="bg-white shadow-2xl rounded-2xl p-10 border border-slate-200 mx-auto max-w-5xl"
                    dangerouslySetInnerHTML={{ __html: generateReportHTML() }}
                  />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {viewingRawData && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div>
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </div>
                    TRMS Deep Dive: <span className="text-indigo-600">{viewingSN}</span>
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Raw data rows extracted from TRMS for this strategy</p>
                </div>
                <button 
                  onClick={() => setViewingRawData(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-auto p-6 bg-slate-50/30">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        {Object.keys(viewingRawData[0] || {}).map(key => (
                          <th key={key} className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider border-r border-slate-200 last:border-r-0 whitespace-nowrap">
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {viewingRawData.map((row, i) => (
                        <tr key={i} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors">
                          {Object.values(row).map((val: any, j) => (
                            <td key={j} className="px-4 py-3 text-[11px] text-slate-600 border-r border-slate-100 last:border-r-0 font-mono whitespace-nowrap">
                              {val instanceof Date ? val.toLocaleDateString() : String(val ?? '-')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Showing {viewingRawData.length} raw rows
                </div>
                <button 
                  onClick={() => setViewingRawData(null)}
                  className="px-6 py-2 bg-slate-800 text-white text-xs font-black rounded-xl hover:bg-slate-900 transition-all shadow-lg shadow-slate-200"
                >
                  Close Deep Dive
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  </div>
  );
};

const AlignedSplitCell = ({ 
    type, 
    appVal, 
    trmsLegs, 
    found, 
    width, 
    formatUSD, 
    errorPct,
    isTiered,
    tier1Val,
    tier2Val,
    effectiveVal,
    totalVol,
    label
}: { 
    type: 'price' | 'vol' | 'value', 
    appVal: number, 
    trmsLegs: TRMSCommodityLeg[], 
    found: boolean, 
    width: number, 
    formatUSD: (v: number) => string, 
    errorPct: number,
    isTiered?: boolean,
    tier1Val?: number,
    tier2Val?: number,
    effectiveVal?: number,
    totalVol?: number,
    label?: string
}) => (
    <div className="px-4 py-2 shrink-0 flex flex-col justify-center border-r border-slate-50 overflow-hidden" style={{ width }}>
        <div className="flex flex-col mb-2 pb-1 border-b border-slate-50">
            <div className="flex justify-between items-center">
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                    {label || `App ${type === 'price' ? 'Price' : type === 'vol' ? 'Vol' : 'Value'}`}
                    {isTiered && type !== 'value' && <span className="ml-1 text-indigo-500">(Tiered)</span>}
                </span>
                {found && errorPct > 0 && (
                    <span className={`text-[8px] font-black ${errorPct > 5 ? 'text-rose-500' : 'text-amber-500'}`}>
                        Err: {errorPct.toFixed(1)}%
                    </span>
                )}
            </div>
            
            {isTiered && type !== 'value' ? (
                <div className="space-y-0.5">
                    <div className="flex justify-between items-center">
                        <span className="text-[7px] text-slate-400 uppercase">T1</span>
                        <span className="font-bold text-slate-700 font-mono text-[9px]">
                            {type === 'price' ? `$${tier1Val?.toFixed(3)}` : tier1Val?.toLocaleString()}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-[7px] text-slate-400 uppercase">T2</span>
                        <span className="font-bold text-slate-700 font-mono text-[9px]">
                            {type === 'price' ? `$${tier2Val?.toFixed(3)}` : tier2Val?.toLocaleString()}
                        </span>
                    </div>
                    <div className="flex justify-between items-center pt-0.5 border-t border-slate-100">
                        <span className="text-[7px] font-bold text-indigo-500 uppercase">{type === 'price' ? 'Eff' : 'Total'}</span>
                        <span className="font-black text-indigo-600 font-mono text-[10px]">
                            {type === 'price' ? `$${effectiveVal?.toFixed(3)}` : totalVol?.toLocaleString()}
                        </span>
                    </div>
                </div>
            ) : (
                <AutoScalingText maxFontSize={10} minFontSize={7} className="font-bold text-slate-700 font-mono">
                    {type === 'price' ? `$${appVal.toFixed(3)}` : type === 'vol' ? appVal.toLocaleString() : formatUSD(appVal)}
                </AutoScalingText>
            )}
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col space-y-1">
            {!found ? <span className="text-[10px] text-slate-300 italic">Not found</span> : trmsLegs.length === 0 ? <span className="text-[10px] text-rose-500 italic">No Commodity Data</span> : (
                trmsLegs.map((leg, idx) => {
                    const val = type === 'price' ? leg.price : type === 'vol' ? leg.vol : Math.abs(leg.valueUSD);
                    const isM = type === 'price' ? Math.abs(val - appVal) < 0.0051 : (type === 'vol' ? Math.abs(val - appVal) < 1.1 : Math.abs(val - appVal) < 100);
                    return (
                        <div key={idx} className={`h-5 flex items-center justify-between px-1.5 rounded font-mono text-[9px] border ${isM ? 'bg-emerald-50 text-emerald-700 font-bold border-emerald-100' : 'text-slate-500 opacity-80 border-transparent'}`}>
                            <span className="truncate pr-1">LEG {idx + 1}</span>
                            <span className="font-bold">{type === 'price' ? `$${val.toFixed(3)}` : type === 'vol' ? val.toLocaleString() : formatUSD(val)}</span>
                        </div>
                    );
                })
            )}
        </div>
    </div>
);

const ReconciliationRowItem = memo(({ row, activeTab, columnWidths, handleRowEdit, onViewRawData, formatUSD, headers, rowHeight }: { 
  row: any, 
  activeTab: string, 
  columnWidths: Record<string, number>, 
  handleRowEdit: (id: string) => void, 
  onViewRawData: (sn: string, rows: any[]) => void,
  formatUSD: (val: number) => string,
  headers: string[],
  rowHeight: number
}) => {
  const r = row as ReconciliationRow;

  const commMonth = getMonthStr(r.trms.commWindowEndDate);
  const appLoadingMonth = getMonthStr(r.app.loadingDate);
  const appDeliveryMonth = getMonthStr(r.app.deliveryDate);

  const loadingMonthMatch = commMonth && appLoadingMonth && commMonth === appLoadingMonth;
  const deliveryMonthMatch = commMonth && appDeliveryMonth && commMonth === appDeliveryMonth;

  const getMonthName = (dateStr: string) => {
      if (!dateStr) return '-';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '-';
      return d.toLocaleString('default', { month: 'short', year: 'numeric' });
  };

  return (
    <div className={`flex border-b border-slate-100 transition-colors hover:bg-indigo-50/20 bg-white group ${activeTab === 'reconcile' && !r.foundInTrms ? 'bg-slate-50' : ''}`} style={{ height: rowHeight, contentVisibility: 'auto', containIntrinsicSize: `auto ${rowHeight}px` }}>
      {activeTab === 'reconcile' ? (
        <>
          <div className={`px-4 py-2 shrink-0 sticky left-0 z-20 border-r border-slate-50 flex items-center transition-colors group-hover:bg-indigo-50/20 ${!r.foundInTrms ? 'bg-slate-100' : 'bg-white'}`} style={{ width: columnWidths['Strategy Name'] || 280 }}>
              <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold text-slate-800 truncate">{r.strategyName}</div>
                  <div className={`text-[9px] font-bold uppercase tracking-wider ${r.foundInTrms ? 'text-emerald-500' : 'text-slate-400'}`}>{r.foundInTrms ? 'Matched in TRMS' : 'Missing from TRMS'}</div>
              </div>
              {r.foundInTrms && r.trms.rawRows && r.trms.rawRows.length > 0 && (
                  <button 
                    onClick={() => onViewRawData(r.strategyName, r.trms.rawRows!)}
                    className="ml-2 p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-all group/btn"
                    title="Deep Dive TRMS Rows"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
              )}
          </div>
          
          <div className={`px-4 py-2 shrink-0 flex flex-col justify-center border-r border-slate-50 overflow-hidden ${r.foundInTrms ? (loadingMonthMatch ? 'bg-emerald-50/50' : 'bg-rose-50/50') : ''}`} style={{ width: columnWidths['Loading Month'] || DEFAULT_COLUMN_WIDTH }}>
              <div className="flex flex-col mb-1 pb-1 border-b border-slate-50">
                  <div className="flex justify-between items-center">
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">App Month</span>
                    {r.foundInTrms && (
                        <span className={`text-[8px] font-black ${r.errorPcts.loadingDate > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {r.errorPcts.loadingDate > 0 ? 'Mismatch' : 'Match'}
                        </span>
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-slate-700 font-mono">{getMonthName(r.app.loadingDate)}</span>
              </div>
              <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">TRMS Month</span>
                  <span className={`text-[10px] font-bold font-mono ${r.foundInTrms && !loadingMonthMatch ? 'text-rose-500' : 'text-slate-500'}`}>{getMonthName(r.trms.commWindowEndDate)}</span>
              </div>
          </div>

          <div className={`px-4 py-2 shrink-0 flex flex-col justify-center border-r border-slate-50 overflow-hidden ${r.foundInTrms ? (deliveryMonthMatch ? 'bg-emerald-50/50' : 'bg-rose-50/50') : ''}`} style={{ width: columnWidths['Delivery Month'] || DEFAULT_COLUMN_WIDTH }}>
              <div className="flex flex-col mb-1 pb-1 border-b border-slate-50">
                  <div className="flex justify-between items-center">
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">App Month</span>
                    {r.foundInTrms && (
                        <span className={`text-[8px] font-black ${r.errorPcts.deliveryDate > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {r.errorPcts.deliveryDate > 0 ? 'Mismatch' : 'Match'}
                        </span>
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-slate-700 font-mono">{getMonthName(r.app.deliveryDate)}</span>
              </div>
              <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">TRMS Month</span>
                  <span className={`text-[10px] font-bold font-mono ${r.foundInTrms && !deliveryMonthMatch ? 'text-rose-500' : 'text-slate-500'}`}>{getMonthName(r.trms.commWindowEndDate)}</span>
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

          <AlignedSplitCell 
            type="price" 
            appVal={r.app.buyPrice} 
            trmsLegs={r.trms.buyLegs} 
            found={r.foundInTrms} 
            width={columnWidths['Purchase Price'] || DEFAULT_COLUMN_WIDTH} 
            formatUSD={formatUSD} 
            errorPct={r.errorPcts.buyPrice} 
            isTiered={r.app.isTiered}
            tier1Val={r.app.tier1BuyPrice}
            tier2Val={r.app.tier2BuyPrice}
            effectiveVal={r.app.effectiveBuyPrice}
          />
          <AlignedSplitCell 
            type="vol" 
            appVal={r.app.buyVol} 
            trmsLegs={r.trms.buyLegs} 
            found={r.foundInTrms} 
            width={columnWidths['Purchase Volume'] || DEFAULT_COLUMN_WIDTH} 
            formatUSD={formatUSD} 
            errorPct={r.errorPcts.buyVol} 
            isTiered={r.app.isTiered}
            tier1Val={r.app.tier1BuyVol}
            tier2Val={r.app.tier2BuyVol}
            totalVol={r.app.buyVol + (r.app.tier2BuyVol || 0)}
          />
          <AlignedSplitCell 
            type="value" 
            appVal={r.app.reconciledPurchaseCost > 0 ? r.app.reconciledPurchaseCost : r.app.buyPrice * r.app.buyVol} 
            trmsLegs={r.trms.buyLegs} 
            found={r.foundInTrms} 
            width={columnWidths['Purchase Cost'] || DEFAULT_COLUMN_WIDTH} 
            formatUSD={formatUSD} 
            errorPct={r.errorPcts.purchaseCost}
            label="Purchase Cost"
          />
          <AlignedSplitCell 
            type="price" 
            appVal={r.app.sellPrice} 
            trmsLegs={r.trms.sellLegs} 
            found={r.foundInTrms} 
            width={columnWidths['Sales Price'] || DEFAULT_COLUMN_WIDTH} 
            formatUSD={formatUSD} 
            errorPct={r.errorPcts.sellPrice} 
            isTiered={r.app.isTiered}
            tier1Val={r.app.tier1SellPrice}
            tier2Val={r.app.tier2SellPrice}
            effectiveVal={r.app.effectiveSellPrice}
          />
          <AlignedSplitCell 
            type="vol" 
            appVal={r.app.sellVol} 
            trmsLegs={r.trms.sellLegs} 
            found={r.foundInTrms} 
            width={columnWidths['Sales Volume'] || DEFAULT_COLUMN_WIDTH} 
            formatUSD={formatUSD} 
            errorPct={r.errorPcts.sellVol} 
            isTiered={r.app.isTiered}
            tier1Val={r.app.tier1SellVol}
            tier2Val={r.app.tier2SellVol}
            totalVol={r.app.sellVol + (r.app.tier2SellVol || 0)}
          />
          <AlignedSplitCell 
            type="value" 
            appVal={r.app.reconciledSalesRevenue > 0 ? r.app.reconciledSalesRevenue : r.app.sellPrice * r.app.sellVol} 
            trmsLegs={r.trms.sellLegs} 
            found={r.foundInTrms} 
            width={columnWidths['Sales Revenue'] || DEFAULT_COLUMN_WIDTH} 
            formatUSD={formatUSD} 
            errorPct={r.errorPcts.salesRevenue}
            label="Sales Revenue"
          />
          
          <div className="px-4 py-2 shrink-0 flex flex-col justify-center border-r border-slate-50 overflow-hidden" style={{ width: columnWidths['SRC Components'] || DEFAULT_COLUMN_WIDTH }}>
                <div className="flex flex-col mb-2 pb-1 border-b border-slate-50">
                    <div className="flex justify-between items-center">
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">App Reconciled SRC</span>
                        {r.foundInTrms && r.errorPcts.src > 0 && (
                            <span className={`text-[8px] font-black ${r.errorPcts.src > 5 ? 'text-rose-500' : 'text-amber-500'}`}>
                                Err: {r.errorPcts.src.toFixed(1)}%
                            </span>
                        )}
                    </div>
                    <AutoScalingText maxFontSize={10} minFontSize={7} className="font-bold text-slate-700 font-mono">
                        {formatUSD(r.app.src)}
                    </AutoScalingText>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col space-y-1">
                    {!r.foundInTrms ? <span className="text-[10px] text-slate-300 italic">Not found</span> : r.trms.srcLegs.length === 0 ? (
                        r.app.src === 0 ? <span className="text-[10px] text-emerald-500 italic">Match (Both 0)</span> : <span className="text-[10px] text-rose-500 italic">No SRC Data</span>
                    ) : (
                        <>
                            <div className="text-[8px] font-bold text-slate-300 uppercase mb-0.5 flex justify-between items-center">
                                <span>TRMS Breakdown (Sum: {formatUSD(r.trms.src)})</span>
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

          <div className="px-4 py-2 shrink-0 flex flex-col justify-center border-r border-slate-50 overflow-hidden" style={{ width: columnWidths['Value Sync'] || DEFAULT_COLUMN_WIDTH }}>
              <div className="flex flex-col mb-1 pb-1 border-b border-slate-50">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">App Physical P&L</span>
                  <AutoScalingText maxFontSize={10} minFontSize={7} className="font-bold text-slate-700 font-mono">
                      {formatUSD((r.app.reconciledSalesRevenue > 0 ? r.app.reconciledSalesRevenue : r.app.sellPrice * r.app.sellVol) - (r.app.reconciledPurchaseCost > 0 ? r.app.reconciledPurchaseCost : r.app.buyPrice * r.app.buyVol) - r.app.src)}
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