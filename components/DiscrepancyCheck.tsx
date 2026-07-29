import React, { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  ArrowUpDown, 
  Filter, 
  Check, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Download, 
  RefreshCw, 
  SlidersHorizontal, 
  Eye, 
  EyeOff, 
  Sigma,
  Info
} from 'lucide-react';
import { AutoScalingText } from './AutoScalingText';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { DataQualityDashboard } from './DataQualityDashboard';
import { CargoProfile, PnLBucket, ForwardCurveData, ForwardCurve, ForwardCurvePoint } from '../types';
import { TrmsSummaryTable } from './TrmsSummaryTable';
import { computeTrmsSummaryRows, TrmsStrategySummary, normalizeStrategyKey } from '../utils/trmsEngine';
import { getGroupName, GROUPS, saveForwardCurve, ForwardCurveRow, getForwardCurve, getAvailableCurveDates, getGRMForwardCurve, getAvailableGRMCurveDates, formatCurrency } from '../services/calculationService';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export interface TRMSCommodityLeg {
    price: number;
    vol: number;
    buySell: string;
    startDate: string;
    endDate: string;
    priceStatus: string;
    settlementType: string;
    valueUSD: number;
    rawRow?: any;
}

export interface TRMSSrcLeg {
    value: number;
    description: string;
    rawRow?: any;
}

export interface ReconciliationRow {
    strategyName: string;
    group: string;
    foundInApp: boolean;
    foundInTrms: boolean;
    status: 'Matched' | 'App Only' | 'TRMS Only';
    profileId: string;
    app: {
        pnlBucket: string;
        optimization: string;
        unallocatedCargo: string;
        buyVolT1: number;
        buyVolT2: number;
        buyVolTotal: number;
        buyPriceT1: number;
        buyPriceT2: number;
        buyPriceEffective: number;
        sellVolT1: number;
        sellVolT2: number;
        sellVolTotal: number;
        sellPriceT1: number;
        sellPriceT2: number;
        sellPriceEffective: number;
        purchaseCost: number;
        salesRevenue: number;
        src: number;
        loadingMonth: string;
        deliveryMonth: string;
        isTiered?: boolean;
        // Backwards compatibility aliases
        buyPrice: number;
        sellPrice: number;
        buyVol: number;
        sellVol: number;
        loadingDate: string;
        deliveryDate: string;
        volumeType: string;
        priceStatus: string;
        reconciledPurchaseCost: number;
        reconciledSalesRevenue: number;
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
        pnlBucket: string;
        optimization: string;
        unallocatedCargo: string;
        buyVolT1: number;
        buyVolT2: number;
        buyVolTotal: number;
        buyPriceT1: number;
        buyPriceT2: number;
        buyPriceEffective: number;
        sellVolT1: number;
        sellVolT2: number;
        sellVolTotal: number;
        sellPriceT1: number;
        sellPriceT2: number;
        sellPriceEffective: number;
        purchaseCost: number;
        salesRevenue: number;
        src: number;
        loadingMonth: string;
        deliveryMonth: string;
        buyTiers: Array<{ vol: number; unit: string; val: number; price: number }>;
        sellTiers: Array<{ vol: number; unit: string; val: number; price: number }>;
        rawRows?: any[];
        // Backwards compatibility aliases
        buyLegs: TRMSCommodityLeg[];
        sellLegs: TRMSCommodityLeg[];
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
    };
    discrepancies: Set<string>;
    diffs: {
        pnlBucket: boolean;
        optimization: boolean;
        unallocatedCargo: boolean;
        buyVol: number;
        sellVol: number;
        buyPrice: number;
        sellPrice: number;
        src: number;
        loadingMonth: boolean;
        deliveryMonth: boolean;
        purchaseCost: number;
        salesRevenue: number;
    };
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
        weightedBuyPrice?: number;
        weightedSellPrice?: number;
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
    extractedRows?: any[];
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

type TRMSTab = 'reconcile' | 'quality' | 'curves' | 'extracted' | 'summary' | 'executive';

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

  const uniqueStrategiesCount = useMemo(() => {
    const sNames = new Set<string>();
    (trmsData.extractedRows || []).forEach((r: any) => {
      const sn = String(r['Strategy Name'] || r['Strategy'] || '').trim();
      if (sn) sNames.add(sn);
    });
    return sNames.size;
  }, [trmsData.extractedRows]);

  const allQualityIssuesCount = useMemo(() => {
    let count = 0;
    const hasUnbalancedParenthesesLocal = (formula: string): boolean => {
      if (!formula) return false;
      let c = 0;
      for (const char of formula) {
        if (char === '(') c++;
        else if (char === ')') c--;
        if (c < 0) return true;
      }
      return c !== 0;
    };

    profiles.filter(p => !p.deleted).forEach(p => {
      // 1. Date Inversion
      if (p.loadingDate && p.deliveryDate) {
        const load = new Date(p.loadingDate);
        const del = new Date(p.deliveryDate);
        if (!isNaN(load.getTime()) && !isNaN(del.getTime()) && load.getTime() > del.getTime()) count++;
      }
      // 2. Missing Dates
      if (!p.loadingDate) count++;
      if (!p.deliveryDate) count++;
      
      // 3. Unnamed Strategy
      if (!p.strategyName || p.strategyName.trim() === '' || p.strategyName.toLowerCase() === 'unnamed strategy' || p.strategyName.toLowerCase() === 'unnamed') count++;
      
      // 4. Quantity/Volume checks (zero or negative)
      const totalLoaded = p.totalLoadedVolume ?? p.loadedVolume;
      const totalDelivered = p.totalDeliveredVolume ?? p.deliveredVolume;
      if (totalLoaded === undefined || totalLoaded === null || totalLoaded <= 0) count++;
      if (totalDelivered === undefined || totalDelivered === null || totalDelivered <= 0) count++;

      if (p.isTieredPricing) {
        if (p.tier2LoadedVolume === undefined || p.tier2LoadedVolume === null || p.tier2LoadedVolume < 0) count++;
        if (p.tier2DeliveredVolume === undefined || p.tier2DeliveredVolume === null || p.tier2DeliveredVolume < 0) count++;
      }

      // 5. Two-Tier Volume checks
      if (p.isTieredPricing) {
        const sumLoaded = (p.loadedVolume || 0) + (p.tier2LoadedVolume || 0);
        const sumDelivered = (p.deliveredVolume || 0) + (p.tier2DeliveredVolume || 0);
        if (totalLoaded && Math.abs(sumLoaded - totalLoaded) > 0.05) count++;
        if (totalDelivered && Math.abs(sumDelivered - totalDelivered) > 0.05) count++;
        if (!p.tierLimit || p.tierLimit <= 0) count++;
      }

      // 6. Pricing Checks
      if (p.isBuyPriceManual) {
        if (p.absoluteBuyPrice === undefined || p.absoluteBuyPrice === null || p.absoluteBuyPrice <= 0 || p.absoluteBuyPrice > 75) count++;
      }
      if (p.isSellPriceManual) {
        if (p.absoluteSellPrice === undefined || p.absoluteSellPrice === null || p.absoluteSellPrice <= 0 || p.absoluteSellPrice > 75) count++;
      }
      if (p.isTieredPricing && p.isTier2BuyPriceManual) {
        if (p.absoluteTier2BuyPrice === undefined || p.absoluteTier2BuyPrice === null || p.absoluteTier2BuyPrice <= 0) count++;
      }
      if (p.isTieredPricing && p.isTier2SellPriceManual) {
        if (p.absoluteTier2SellPrice === undefined || p.absoluteTier2SellPrice === null || p.absoluteTier2SellPrice <= 0) count++;
      }

      // 7. Formula parentheses
      if (!p.isBuyPriceManual && p.buyFormula && hasUnbalancedParenthesesLocal(p.buyFormula)) count++;
      if (!p.isSellPriceManual && p.sellFormula && hasUnbalancedParenthesesLocal(p.sellFormula)) count++;
      if (p.isTieredPricing) {
        if (!p.isTier2BuyPriceManual && p.tier2BuyFormula && hasUnbalancedParenthesesLocal(p.tier2BuyFormula)) count++;
        if (!p.isTier2SellPriceManual && p.tier2SellFormula && hasUnbalancedParenthesesLocal(p.tier2SellFormula)) count++;
      }

      // 8. Buyer missing
      if (!p.buyer || p.buyer.trim() === '') count++;

      // 9. Shipping / SRC checks
      if (p.incoterms === 'FOB') {
        const hasUnitFee = p.srcUnitFee && p.srcUnitFee > 0;
        const hasReconciledCost = p.reconciledSrcCost && p.reconciledSrcCost > 0;
        const hasSrcCodeIndicator = p.src && p.src.trim() !== '';
        if (hasUnitFee || hasReconciledCost || hasSrcCodeIndicator) count++;
      }
      if (p.incoterms === 'DES') {
        const lacksUnitFee = !p.srcUnitFee || p.srcUnitFee <= 0;
        const lacksReconciledCost = !p.reconciledSrcCost || p.reconciledSrcCost <= 0;
        if (lacksUnitFee && lacksReconciledCost) count++;
      }
      if (!p.incoterms || p.incoterms.trim() === '') count++;
    });
    return count;
  }, [profiles]);
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

  // Reconciliation Quick Filters State
  const [reconStatusFilter, setReconStatusFilter] = useState<'all' | 'matched' | 'discrepancies' | 'app_only' | 'trms_only'>('all');
  const [reconGroupFilter, setReconGroupFilter] = useState<string>('all');
  const [reconPnlBucketFilter, setReconPnlBucketFilter] = useState<string>('all');
  const [reconOptimizationFilter, setReconOptimizationFilter] = useState<string>('all');
  const [reconUnallocatedFilter, setReconUnallocatedFilter] = useState<string>('all');
  const [selectedEodDate, setSelectedEodDate] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  
  const [activeFilters, setActiveFilters] = useState<Record<string, Set<any>> >({});
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
      extractedRows: [],
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
            if (result.extractedRows) {
              aggregatedData.extractedRows?.push(...result.extractedRows);
            }
            
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

  const getMonthStr = (dateStr?: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(-2)}`;
  };

  const trmsEngineResult = useMemo(() => {
    return computeTrmsSummaryRows(trmsData.extractedRows || [], selectedEodDate, selectedYear);
  }, [trmsData.extractedRows, selectedEodDate, selectedYear]);

  const trmsFilterOptions = useMemo(() => {
    const rawRows = trmsData.extractedRows || [];
    const eodDates = new Set<string>();
    const years = new Set<string>();

    rawRows.forEach((r: any) => {
      const dt = String(r['EOD Date'] || r['EOD_Date'] || '').trim();
      if (dt) eodDates.add(dt);

      const yr = String(r['Plsb Year Bucket'] || r['Plsb_Year_Bucket'] || '').trim();
      if (yr) {
        const matches = yr.match(/\b(20\d\d)\b/g);
        if (matches) matches.forEach(m => years.add(m));
        else years.add(yr);
      }
    });

    return {
      eodDates: Array.from(eodDates).sort(),
      years: Array.from(years).sort()
    };
  }, [trmsData.extractedRows]);

  const reconciliationData = useMemo(() => {
    const activeProfiles = profiles.filter(p => !p.deleted);
    
    // Index App Profiles by Strategy Name
    const appMap = new Map<string, CargoProfile>();
    activeProfiles.forEach(p => {
      if (p.strategyName && p.strategyName.trim() !== '') {
        appMap.set(normalizeStrategyKey(p.strategyName), p);
      }
    });

    // Index TRMS Summaries by Strategy Name
    const trmsMap = new Map<string, TrmsStrategySummary>();
    trmsEngineResult.forEach(s => {
      if (s.strategyName && s.strategyName.trim() !== '') {
        trmsMap.set(normalizeStrategyKey(s.strategyName), s);
      }
    });

    // All Strategy Keys
    const allKeys = new Set<string>([
      ...Array.from(appMap.keys()),
      ...Array.from(trmsMap.keys())
    ]);

    const rows: ReconciliationRow[] = [];

    allKeys.forEach(key => {
      const app = appMap.get(key);
      const trms = trmsMap.get(key);

      const foundInApp = !!app;
      const foundInTrms = !!trms;
      const strategyName = app?.strategyName || trms?.strategyName || key;
      const group = getGroupName(strategyName);

      let status: 'Matched' | 'App Only' | 'TRMS Only' = 'Matched';
      if (foundInApp && !foundInTrms) status = 'App Only';
      else if (!foundInApp && foundInTrms) status = 'TRMS Only';

      // App Values
      const isAppRealized = app?.pnlBucket === PnLBucket.Realized;
      const appPnlBucket = app ? (isAppRealized ? 'Realized' : 'Unrealized') : '—';
      const appOptimization = app ? (app.optimized ? 'Yes' : 'No') : '—';

      let appUnallocatedCargo = '—';
      if (app) {
        const hasBuy = (app.loadedVolume && app.loadedVolume > 0) || (app.absoluteBuyPrice && app.absoluteBuyPrice > 0) || (app.buyFormula && app.buyFormula.trim() !== '');
        const hasSell = (app.deliveredVolume && app.deliveredVolume > 0) || (app.absoluteSellPrice && app.absoluteSellPrice > 0) || (app.sellFormula && app.sellFormula.trim() !== '');
        if (hasBuy && hasSell) appUnallocatedCargo = 'Matched';
        else if (hasBuy && !hasSell) appUnallocatedCargo = 'Open on Sell Leg';
        else if (!hasBuy && hasSell) appUnallocatedCargo = 'Open on Buy Leg';
      }

      const isAppTiered = app?.isTieredPricing 
        || (app?.tier2LoadedVolume ? app.tier2LoadedVolume > 0 : false)
        || (app?.tier2DeliveredVolume ? app.tier2DeliveredVolume > 0 : false)
        || (app?.absoluteTier2BuyPrice ? app.absoluteTier2BuyPrice > 0 : false)
        || (app?.absoluteTier2SellPrice ? app.absoluteTier2SellPrice > 0 : false);

      const appBuyVolT1 = app?.loadedVolume || 0;
      const appBuyVolT2 = app?.tier2LoadedVolume || 0;
      const appBuyVolTotal = (isAppTiered || appBuyVolT2 > 0) ? (appBuyVolT1 + appBuyVolT2) : (app?.loadedVolume || app?.totalLoadedVolume || 0);

      const appBuyPriceT1 = app?.absoluteBuyPrice || 0;
      const appBuyPriceT2 = app?.absoluteTier2BuyPrice || 0;
      const appBuyPriceEffective = appBuyVolTotal > 0
        ? (((appBuyVolT1 || (appBuyVolT2 > 0 ? 0 : 1)) * appBuyPriceT1 + appBuyVolT2 * appBuyPriceT2) / (appBuyVolT1 + appBuyVolT2 || 1))
        : appBuyPriceT1;

      const appSellVolT1 = app?.deliveredVolume || 0;
      const appSellVolT2 = app?.tier2DeliveredVolume || 0;
      const appSellVolTotal = (isAppTiered || appSellVolT2 > 0) ? (appSellVolT1 + appSellVolT2) : (app?.deliveredVolume || app?.totalDeliveredVolume || 0);

      const appSellPriceT1 = app?.absoluteSellPrice || 0;
      const appSellPriceT2 = app?.absoluteTier2SellPrice || 0;
      const appSellPriceEffective = appSellVolTotal > 0
        ? (((appSellVolT1 || (appSellVolT2 > 0 ? 0 : 1)) * appSellPriceT1 + appSellVolT2 * appSellPriceT2) / (appSellVolT1 + appSellVolT2 || 1))
        : appSellPriceT1;

      const appPurchaseCost = app?.reconciledPurchaseCost || (appBuyPriceEffective * appBuyVolTotal);
      const appSalesRevenue = app?.reconciledSalesRevenue || (appSellPriceEffective * appSellVolTotal);
      const rawAppSrc = app?.reconciledSrcCost !== undefined && app.reconciledSrcCost !== 0 ? app.reconciledSrcCost : (app?.srcUnitFee ? app.srcUnitFee * (appSellVolTotal || appBuyVolTotal) : 0);
      const appSrc = rawAppSrc > 0 ? -rawAppSrc : rawAppSrc;
      const appLoadingMonth = app?.loadingMonth || (app?.loadingDate ? getMonthStr(app.loadingDate) : '—');
      const appDeliveryMonth = app?.deliveryMonth || (app?.deliveryDate ? getMonthStr(app.deliveryDate) : '—');

      // TRMS Values
      const trmsPnlBucket = trms?.physicalPnLStatus || '—';
      const trmsOptimization = trms?.optimisationStatus || '—';
      const trmsUnallocatedCargo = trms?.unallocatedCargo || '—';

      const trmsBuyT1Vol = trms?.buyTiers?.[0]?.vol ?? (trms?.purchaseVolume ?? 0);
      const trmsBuyT2Vol = trms?.buyTiers?.[1]?.vol ?? 0;
      const trmsBuyVolTotal = trms?.purchaseVolume ?? 0;

      const trmsBuyT1Price = trms?.buyTiers?.[0]?.price ?? (trms?.purchasePrice ?? 0);
      const trmsBuyT2Price = trms?.buyTiers?.[1]?.price ?? 0;
      const trmsBuyPriceEffective = trms?.purchasePrice ?? 0;

      const trmsSellT1Vol = trms?.sellTiers?.[0]?.vol ?? (trms?.salesVolume ?? 0);
      const trmsSellT2Vol = trms?.sellTiers?.[1]?.vol ?? 0;
      const trmsSellVolTotal = trms?.salesVolume ?? 0;

      const trmsSellT1Price = trms?.sellTiers?.[0]?.price ?? (trms?.salesPrice ?? 0);
      const trmsSellT2Price = trms?.sellTiers?.[1]?.price ?? 0;
      const trmsSellPriceEffective = trms?.salesPrice ?? 0;

      const trmsPurchaseCost = trms?.purchaseCost ?? 0;
      const trmsSalesRevenue = trms?.salesRevenue ?? 0;
      const trmsSrc = trms?.shippingRelatedCosts ?? 0;
      const trmsLoadingMonth = trms?.loadingMonth || '—';
      const trmsDeliveryMonth = trms?.deliveryMonth || '—';

      // Discrepancy checks
      const discrepancies = new Set<string>();

      if (!foundInTrms) {
        discrepancies.add('Missing in TRMS');
      } else if (!foundInApp) {
        discrepancies.add('Missing in App');
      } else {
        if (appPnlBucket !== '—' && trmsPnlBucket !== '—' && appPnlBucket !== trmsPnlBucket) {
          discrepancies.add('P&L Bucket');
        }
        if (appOptimization !== '—' && trmsOptimization !== '—' && appOptimization !== trmsOptimization && !(appOptimization === 'No' && (trmsOptimization as string) === '')) {
          discrepancies.add('Optimization');
        }
        if (appUnallocatedCargo !== '—' && trmsUnallocatedCargo !== '—' && appUnallocatedCargo !== trmsUnallocatedCargo) {
          discrepancies.add('Unallocated Cargo');
        }
        if (Math.abs(appBuyVolTotal - trmsBuyVolTotal) > 1.0) {
          discrepancies.add('Buy Vol');
        }
        if (Math.abs(appSellVolTotal - trmsSellVolTotal) > 1.0) {
          discrepancies.add('Sell Vol');
        }
        if (Math.abs(appBuyPriceEffective - trmsBuyPriceEffective) > 0.01) {
          discrepancies.add('Buy Price');
        }
        if (Math.abs(appSellPriceEffective - trmsSellPriceEffective) > 0.01) {
          discrepancies.add('Sell Price');
        }
        if (Math.abs(appSrc - trmsSrc) > 1.0) {
          discrepancies.add('SRC Cost');
        }
        if (appLoadingMonth !== '—' && trmsLoadingMonth !== '—' && appLoadingMonth !== trmsLoadingMonth) {
          discrepancies.add('Loading Month');
        }
        if (appDeliveryMonth !== '—' && trmsDeliveryMonth !== '—' && appDeliveryMonth !== trmsDeliveryMonth) {
          discrepancies.add('Delivery Month');
        }
      }

      const calcPct = (a: number, b: number) => {
        if (a === 0 && b === 0) return 0;
        if (a === 0 || b === 0) return 100;
        return (Math.abs(a - b) / Math.abs(a)) * 100;
      };

      rows.push({
        strategyName,
        group,
        foundInApp,
        foundInTrms,
        status,
        profileId: app?.id || '',
        app: {
          pnlBucket: appPnlBucket,
          optimization: appOptimization,
          unallocatedCargo: appUnallocatedCargo,
          buyVolT1: appBuyVolT1,
          buyVolT2: appBuyVolT2,
          buyVolTotal: appBuyVolTotal,
          buyPriceT1: appBuyPriceT1,
          buyPriceT2: appBuyPriceT2,
          buyPriceEffective: appBuyPriceEffective,
          sellVolT1: appSellVolT1,
          sellVolT2: appSellVolT2,
          sellVolTotal: appSellVolTotal,
          sellPriceT1: appSellPriceT1,
          sellPriceT2: appSellPriceT2,
          sellPriceEffective: appSellPriceEffective,
          purchaseCost: appPurchaseCost,
          salesRevenue: appSalesRevenue,
          src: appSrc,
          loadingMonth: appLoadingMonth,
          deliveryMonth: appDeliveryMonth,
          isTiered: isAppTiered,
          // Backwards compatibility
          buyPrice: appBuyPriceEffective,
          sellPrice: appSellPriceEffective,
          buyVol: appBuyVolTotal,
          sellVol: appSellVolTotal,
          loadingDate: app?.loadingDate || '',
          deliveryDate: app?.deliveryDate || '',
          volumeType: isAppRealized ? 'Actual' : 'Estimate',
          priceStatus: isAppRealized ? 'Fixed' : 'Estimate',
          reconciledPurchaseCost: appPurchaseCost,
          reconciledSalesRevenue: appSalesRevenue,
          tier1BuyPrice: appBuyPriceT1,
          tier1BuyVol: appBuyVolT1,
          tier2BuyPrice: appBuyPriceT2,
          tier2BuyVol: appBuyVolT2,
          tier1SellPrice: appSellPriceT1,
          tier1SellVol: appSellVolT1,
          tier2SellPrice: appSellPriceT2,
          tier2SellVol: appSellVolT2,
          effectiveBuyPrice: appBuyPriceEffective,
          effectiveSellPrice: appSellPriceEffective
        },
        trms: {
          pnlBucket: trmsPnlBucket,
          optimization: trmsOptimization,
          unallocatedCargo: trmsUnallocatedCargo,
          buyVolT1: trmsBuyT1Vol,
          buyVolT2: trmsBuyT2Vol,
          buyVolTotal: trmsBuyVolTotal,
          buyPriceT1: trmsBuyT1Price,
          buyPriceT2: trmsBuyT2Price,
          buyPriceEffective: trmsBuyPriceEffective,
          sellVolT1: trmsSellT1Vol,
          sellVolT2: trmsSellT2Vol,
          sellVolTotal: trmsSellVolTotal,
          sellPriceT1: trmsSellT1Price,
          sellPriceT2: trmsSellT2Price,
          sellPriceEffective: trmsSellPriceEffective,
          purchaseCost: trmsPurchaseCost,
          salesRevenue: trmsSalesRevenue,
          src: trmsSrc,
          loadingMonth: trmsLoadingMonth,
          deliveryMonth: trmsDeliveryMonth,
          buyTiers: trms?.buyTiers || [],
          sellTiers: trms?.sellTiers || [],
          rawRows: trms?.underlyingRows || [],
          // Backwards compatibility
          buyLegs: (trms?.buyCalcRows || []).map(r => ({
            price: Number(r.Price || 0),
            vol: Number(r.Volume || 0),
            buySell: 'Buy',
            startDate: r['Start Date'] || '',
            endDate: r['End Date'] || '',
            priceStatus: r['Price Status'] || '',
            settlementType: r['Settlement Type'] || '',
            instrumentType: r['Ins Type'] || '',
            valueUSD: Number(r.Base_Total_Value_USD || 0)
          })),
          sellLegs: (trms?.sellCalcRows || []).map(r => ({
            price: Number(r.Price || 0),
            vol: Number(r.Volume || 0),
            buySell: 'Sell',
            startDate: r['Start Date'] || '',
            endDate: r['End Date'] || '',
            priceStatus: r['Price Status'] || '',
            settlementType: r['Settlement Type'] || '',
            instrumentType: r['Ins Type'] || '',
            valueUSD: Number(r.Base_Total_Value_USD || 0)
          })),
          srcLegs: [],
          loadingDate: trmsLoadingMonth,
          deliveryDate: trmsDeliveryMonth,
          volumeType: trmsPnlBucket === 'Realized' ? 'Actual' : 'Estimate',
          priceStatus: trmsPnlBucket === 'Realized' ? 'Fixed' : 'Estimate',
          commodityValue: trmsSalesRevenue - trmsPurchaseCost,
          trmsPurchaseValue: trmsPurchaseCost,
          trmsSalesValue: trmsSalesRevenue,
          reconciledPurchaseCost: trmsPurchaseCost,
          reconciledSalesRevenue: trmsSalesRevenue,
          trmsRealized: trmsPnlBucket === 'Realized',
          commWindowEndDate: trmsDeliveryMonth
        },
        discrepancies,
        diffs: {
          pnlBucket: appPnlBucket !== trmsPnlBucket,
          optimization: appOptimization !== trmsOptimization,
          unallocatedCargo: appUnallocatedCargo !== trmsUnallocatedCargo,
          buyVol: appBuyVolTotal - trmsBuyVolTotal,
          sellVol: appSellVolTotal - trmsSellVolTotal,
          buyPrice: appBuyPriceEffective - trmsBuyPriceEffective,
          sellPrice: appSellPriceEffective - trmsSellPriceEffective,
          src: appSrc - trmsSrc,
          loadingMonth: appLoadingMonth !== trmsLoadingMonth,
          deliveryMonth: appDeliveryMonth !== trmsDeliveryMonth,
          purchaseCost: appPurchaseCost - trmsPurchaseCost,
          salesRevenue: appSalesRevenue - trmsSalesRevenue
        },
        errorPcts: {
          buyPrice: calcPct(appBuyPriceEffective, trmsBuyPriceEffective),
          sellPrice: calcPct(appSellPriceEffective, trmsSellPriceEffective),
          buyVol: calcPct(appBuyVolTotal, trmsBuyVolTotal),
          sellVol: calcPct(appSellVolTotal, trmsSellVolTotal),
          src: calcPct(appSrc, trmsSrc),
          loadingDate: appLoadingMonth === trmsLoadingMonth ? 0 : 100,
          deliveryDate: appDeliveryMonth === trmsDeliveryMonth ? 0 : 100,
          purchaseCost: calcPct(appPurchaseCost, trmsPurchaseCost),
          salesRevenue: calcPct(appSalesRevenue, trmsSalesRevenue)
        }
      });
    });

    return rows;
  }, [profiles, trmsEngineResult]);

  const allGroups = useMemo(() => {
    return Array.from(new Set(reconciliationData.map(r => r.group))).filter(Boolean).sort();
  }, [reconciliationData]);

  const filteredReconciliationData = useMemo(() => {
    return reconciliationData.filter(row => {
      if (searchTerm && searchTerm.trim() !== '') {
        const q = searchTerm.toLowerCase();
        if (!row.strategyName.toLowerCase().includes(q) && !row.group.toLowerCase().includes(q)) {
          return false;
        }
      }

      if (reconStatusFilter === 'matched') {
        if (row.status !== 'Matched' || row.discrepancies.size > 0) return false;
      } else if (reconStatusFilter === 'discrepancies') {
        if (row.discrepancies.size === 0) return false;
      } else if (reconStatusFilter === 'app_only') {
        if (row.status !== 'App Only') return false;
      } else if (reconStatusFilter === 'trms_only') {
        if (row.status !== 'TRMS Only') return false;
      }

      if (reconGroupFilter !== 'all') {
        if (row.group !== reconGroupFilter) return false;
      }

      if (reconPnlBucketFilter !== 'all') {
        if (row.app.pnlBucket !== reconPnlBucketFilter && row.trms.pnlBucket !== reconPnlBucketFilter) return false;
      }

      if (reconOptimizationFilter !== 'all') {
        if (row.app.optimization !== reconOptimizationFilter && row.trms.optimization !== reconOptimizationFilter) return false;
      }

      if (reconUnallocatedFilter !== 'all') {
        if (row.app.unallocatedCargo !== reconUnallocatedFilter && row.trms.unallocatedCargo !== reconUnallocatedFilter) return false;
      }

      return true;
    });
  }, [reconciliationData, searchTerm, reconStatusFilter, reconGroupFilter, reconPnlBucketFilter, reconOptimizationFilter, reconUnallocatedFilter]);

  const currentRawData = useMemo(() => {
    if (activeTab === 'reconcile') return filteredReconciliationData;
    if (activeTab === 'quality') return [];
    if (activeTab === 'curves') return [];
    if (activeTab === 'summary') return [];
    const val = (trmsData as any)[activeTab];
    return Array.isArray(val) ? val : [];
  }, [activeTab, trmsData, filteredReconciliationData]);

  const headers = useMemo(() => {
    if (activeTab === 'reconcile') {
        return [
            'Strategy Name',
            'P&L Bucket',
            'Optimization',
            'Unallocated Cargo',
            'Purchase Volume',
            'Sales Volume',
            'Purchase Price',
            'Sales Price',
            'SRC Costs',
            'Loading Month',
            'Delivery Month'
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

  const formatUSD = formatCurrency;

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

  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [availableGRMDates, setAvailableGRMDates] = useState<string[]>([]);

  useEffect(() => {
    const fetchDates = async () => {
      const [dates, grmDates] = await Promise.all([
        getAvailableCurveDates(),
        getAvailableGRMCurveDates()
      ]);
      setAvailableDates(dates);
      setAvailableGRMDates(grmDates);
    };
    fetchDates();
  }, []);

  const handleConfirmSync = async () => {
    if (pendingData) {
      if (syncOptions.syncForwardCurves && pendingData.forwardCurves && pendingData.forwardCurves.length > 0) {
        for (const fc of pendingData.forwardCurves) {
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
            await saveForwardCurve(fc.asOfDate, rows);
            toast.success(`Forward curve for ${fc.asOfDate} imported.`);
            if (onForwardCurveUpdate) onForwardCurveUpdate();
          }
        }
        // Refresh dates after import
        const [dates, grmDates] = await Promise.all([
          getAvailableCurveDates(),
          getAvailableGRMCurveDates()
        ]);
        setAvailableDates(dates);
        setAvailableGRMDates(grmDates);
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
          <TabButton active={activeTab === 'extracted'} onClick={() => setActiveTab('extracted')} label="Extracted TRMS Table" count={trmsData.extractedRows?.length || 0} color="indigo" />
          <TabButton active={activeTab === 'executive'} onClick={() => setActiveTab('executive')} label="Executive Dashboard" count={0} color="emerald" />
          <TabButton active={activeTab === 'summary'} onClick={() => setActiveTab('summary')} label="TRMS Summary Table" count={uniqueStrategiesCount} color="violet" />
          <TabButton active={activeTab === 'quality'} onClick={() => setActiveTab('quality')} label="Data Quality" count={allQualityIssuesCount} color="amber" />
          <TabButton active={activeTab === 'curves'} onClick={() => setActiveTab('curves')} label="Curve Comparison" count={Array.from(new Set([...availableDates, ...availableGRMDates])).length} color="blue" />
      </div>

      <div className="flex-1 min-h-[600px] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {activeTab === 'summary' ? (
          <TrmsSummaryTable trmsData={trmsData} viewModeOnly="grid" />
        ) : activeTab === 'executive' ? (
          <TrmsSummaryTable trmsData={trmsData} viewModeOnly="dashboard" />
        ) : activeTab === 'curves' ? (
          <CurveComparison availableDates={availableDates} availableGRMDates={availableGRMDates} />
        ) : activeTab === 'quality' ? (
          <DataQualityDashboard profiles={profiles} trmsData={trmsData} onEditProfile={onEditProfile} />
        ) : activeTab === 'extracted' ? (
          <ExtractedTrmsTable trmsData={trmsData} />
        ) : (
          <>
            {activeTab === 'reconcile' && (
              <div className="bg-slate-900 text-white p-3 border-b border-slate-800 space-y-3 shrink-0">
                {/* Quick Filters Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mr-1">Quick Filters:</span>
                    
                    {/* Recon Status Pill Group */}
                    <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                      <button onClick={() => setReconStatusFilter('all')} className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${reconStatusFilter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>
                        All ({reconciliationData.length})
                      </button>
                      <button onClick={() => setReconStatusFilter('matched')} className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${reconStatusFilter === 'matched' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>
                        Matched ({reconciliationData.filter(r => r.status === 'Matched' && r.discrepancies.size === 0).length})
                      </button>
                      <button onClick={() => setReconStatusFilter('discrepancies')} className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${reconStatusFilter === 'discrepancies' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>
                        Discrepancies ({reconciliationData.filter(r => r.discrepancies.size > 0).length})
                      </button>
                      <button onClick={() => setReconStatusFilter('app_only')} className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${reconStatusFilter === 'app_only' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>
                        App Only ({reconciliationData.filter(r => r.status === 'App Only').length})
                      </button>
                      <button onClick={() => setReconStatusFilter('trms_only')} className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${reconStatusFilter === 'trms_only' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>
                        TRMS Only ({reconciliationData.filter(r => r.status === 'TRMS Only').length})
                      </button>
                    </div>

                    {/* Group Dropdown */}
                    <select value={reconGroupFilter} onChange={(e) => setReconGroupFilter(e.target.value)} className="bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-bold rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-indigo-500 outline-none">
                      <option value="all">Group: All ({allGroups.length})</option>
                      {allGroups.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>

                    {/* P&L Bucket Dropdown */}
                    <select value={reconPnlBucketFilter} onChange={(e) => setReconPnlBucketFilter(e.target.value)} className="bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-bold rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-indigo-500 outline-none">
                      <option value="all">P&L Bucket: All</option>
                      <option value="Realized">Realized</option>
                      <option value="Unrealized">Unrealized</option>
                    </select>

                    {/* Optimization Dropdown */}
                    <select value={reconOptimizationFilter} onChange={(e) => setReconOptimizationFilter(e.target.value)} className="bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-bold rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-indigo-500 outline-none">
                      <option value="all">Optimization: All</option>
                      <option value="Yes">Optimization: Yes</option>
                      <option value="No">Optimization: No</option>
                    </select>

                    {/* Unallocated Dropdown */}
                    <select value={reconUnallocatedFilter} onChange={(e) => setReconUnallocatedFilter(e.target.value)} className="bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-bold rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-indigo-500 outline-none">
                      <option value="all">Unallocated: All</option>
                      <option value="Matched">Matched</option>
                      <option value="Open on Buy Leg">Open on Buy Leg</option>
                      <option value="Open on Sell Leg">Open on Sell Leg</option>
                    </select>
                  </div>

                  {(reconStatusFilter !== 'all' || reconGroupFilter !== 'all' || reconPnlBucketFilter !== 'all' || reconOptimizationFilter !== 'all' || reconUnallocatedFilter !== 'all') && (
                    <button onClick={() => {
                      setReconStatusFilter('all');
                      setReconGroupFilter('all');
                      setReconPnlBucketFilter('all');
                      setReconOptimizationFilter('all');
                      setReconUnallocatedFilter('all');
                    }} className="text-[10px] font-bold text-rose-400 hover:text-rose-300 underline">
                      Reset Quick Filters
                    </button>
                  )}
                </div>

                {/* Reconciliation Metrics Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1 border-t border-slate-800">
                  <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700 flex flex-col">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Filtered Strategies</span>
                    <span className="text-sm font-black text-indigo-400 font-mono mt-0.5">{filteredReconciliationData.length} <span className="text-[10px] text-slate-400 font-normal">/ {reconciliationData.length} Total</span></span>
                  </div>
                  <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700 flex flex-col">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Discrepancy Count</span>
                    <span className="text-sm font-black text-rose-400 font-mono mt-0.5">{filteredReconciliationData.filter(r => r.discrepancies.size > 0).length} <span className="text-[10px] text-slate-400 font-normal">Strategies</span></span>
                  </div>
                  <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700 flex flex-col">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Purchase Volume (MT)</span>
                    <div className="flex items-center justify-between font-mono text-[11px] mt-0.5">
                      <span className="text-slate-300">App: <strong className="text-white">{filteredReconciliationData.reduce((acc, r) => acc + r.app.buyVolTotal, 0).toLocaleString()}</strong></span>
                      <span className="text-slate-400">TRMS: <strong className="text-white">{filteredReconciliationData.reduce((acc, r) => acc + r.trms.buyVolTotal, 0).toLocaleString()}</strong></span>
                    </div>
                  </div>
                  <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700 flex flex-col">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Sales Volume (MT)</span>
                    <div className="flex items-center justify-between font-mono text-[11px] mt-0.5">
                      <span className="text-slate-300">App: <strong className="text-white">{filteredReconciliationData.reduce((acc, r) => acc + r.app.sellVolTotal, 0).toLocaleString()}</strong></span>
                      <span className="text-slate-400">TRMS: <strong className="text-white">{filteredReconciliationData.reduce((acc, r) => acc + r.trms.sellVolTotal, 0).toLocaleString()}</strong></span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative w-full md:w-80">
              <input type="text" placeholder={`Search strategy...`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="block w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500/20" />
              <svg className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
            {Object.keys(activeFilters).length > 0 && (
              <button 
                onClick={() => setActiveFilters({})}
                className="px-3 py-2 text-rose-600 text-[10px] font-black uppercase hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-1.5 border border-rose-100"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                Clear Filters
              </button>
            )}
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
      </>
    )}
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
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-max">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        {(() => {
                          const allKeys = new Set<string>();
                          viewingRawData.forEach(r => Object.keys(r).forEach(k => allKeys.add(k)));
                          const sortedKeys = WHITELIST_COLUMNS.filter(k => allKeys.has(k));
                          // Add any keys not in whitelist at the end
                          const otherKeys = Array.from(allKeys).filter(k => !WHITELIST_COLUMNS.includes(k));
                          const finalHeaders = [...sortedKeys, ...otherKeys];
                          
                          return (
                            <>
                              {finalHeaders.map(key => (
                                <th key={key} className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider border-r border-slate-200 last:border-r-0 whitespace-nowrap">
                                  {key}
                                </th>
                              ))}
                            </>
                          );
                        })()}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const allKeys = new Set<string>();
                        viewingRawData.forEach(r => Object.keys(r).forEach(k => allKeys.add(k)));
                        const sortedKeys = WHITELIST_COLUMNS.filter(k => allKeys.has(k));
                        const otherKeys = Array.from(allKeys).filter(k => !WHITELIST_COLUMNS.includes(k));
                        const finalHeaders = [...sortedKeys, ...otherKeys];

                        const formatVal = (v: any) => {
                          if (v === null || v === undefined) return '-';
                          if (typeof v === 'number') {
                            // Fix floating point precision issues (e.g. 7.81 showing as 7.8099999999999993)
                            const s = String(v);
                            if (s.includes('.') && s.split('.')[1].length > 8) {
                              return Number(v.toFixed(6)).toString();
                            }
                            return v.toString();
                          }
                          return String(v);
                        };

                        return viewingRawData.map((row, i) => (
                          <tr key={i} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors">
                            {finalHeaders.map((key, j) => (
                              <td key={j} className="px-4 py-3 text-[11px] text-slate-600 border-r border-slate-100 last:border-r-0 font-mono whitespace-nowrap">
                                {formatVal(row[key])}
                              </td>
                            ))}
                          </tr>
                        ));
                      })()}
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
    label,
    onDeepDive
}: { 
    type: 'price' | 'vol' | 'value';
    appVal: number;
    trmsLegs: TRMSCommodityLeg[];
    found: boolean;
    width: number;
    formatUSD: (v: number) => string;
    errorPct: number;
    isTiered?: boolean;
    tier1Val?: number;
    tier2Val?: number;
    effectiveVal?: number;
    totalVol?: number;
    label?: string;
    onDeepDive?: (rows: any[]) => void;
}) => (
    <div className="px-4 py-2 shrink-0 flex flex-col justify-center border-r border-slate-50 overflow-hidden" style={{ width }}>
        <div className="flex flex-col mb-2 pb-1 border-b border-slate-50 group/app">
            <div className="flex justify-between items-center">
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter flex items-center gap-1">
                    {label || `App ${type === 'price' ? 'Price' : type === 'vol' ? 'Vol' : 'Value'}`}
                    {isTiered && type !== 'value' && <span className="ml-1 text-indigo-500">(Tiered)</span>}
                    {found && trmsLegs.length > 0 && onDeepDive && (
                        <button 
                            onClick={() => onDeepDive(trmsLegs.map(l => l.rawRow).filter(Boolean))}
                            className="opacity-0 group-hover/app:opacity-100 p-0.5 text-indigo-400 hover:text-indigo-600 transition-all"
                            title="Deep Dive all relevant TRMS rows"
                        >
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                        </button>
                    )}
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
                        <div 
                            key={idx} 
                            onClick={() => leg.rawRow && onDeepDive?.([leg.rawRow])}
                            className={`h-5 flex items-center justify-between px-1.5 rounded font-mono text-[9px] border cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] group ${isM ? 'bg-emerald-50 text-emerald-700 font-bold border-emerald-100 shadow-sm' : 'text-slate-500 opacity-80 border-transparent hover:bg-slate-50'}`}
                            title="Click to Deep Dive this specific row"
                        >
                            <span className="truncate pr-1">LEG {idx + 1}</span>
                            <span className="font-bold">{type === 'price' ? `$${val.toFixed(3)}` : type === 'vol' ? val.toLocaleString() : formatUSD(val)}</span>
                            <svg className="w-2 h-2 ml-1 opacity-0 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
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

  if (activeTab !== 'reconcile') {
    return (
      <div className="flex border-b border-slate-100 transition-colors hover:bg-indigo-50/20 bg-white group" style={{ height: rowHeight, contentVisibility: 'auto', containIntrinsicSize: `auto ${rowHeight}px` }}>
        {headers.map((header, idx) => {
          const width = columnWidths[header] || DEFAULT_COLUMN_WIDTH;
          return (
            <div key={header} className={`px-4 py-3 text-slate-600 whitespace-nowrap shrink-0 truncate text-[11px] border-r border-slate-50 ${idx === 0 ? 'sticky left-0 z-20 bg-white group-hover:bg-indigo-50/20 font-bold' : ''}`} style={{ width }}>{String(row[header] ?? '-')}</div>
          );
        })}
      </div>
    );
  }

  const pnlMismatch = r.foundInApp && r.foundInTrms && r.diffs.pnlBucket;
  const optMismatch = r.foundInApp && r.foundInTrms && r.diffs.optimization;
  const unallocMismatch = r.foundInApp && r.foundInTrms && r.diffs.unallocatedCargo;
  const buyVolMismatch = r.foundInApp && r.foundInTrms && Math.abs(r.diffs.buyVol) > 1.0;
  const sellVolMismatch = r.foundInApp && r.foundInTrms && Math.abs(r.diffs.sellVol) > 1.0;
  const buyPriceMismatch = r.foundInApp && r.foundInTrms && Math.abs(r.diffs.buyPrice) > 0.01;
  const sellPriceMismatch = r.foundInApp && r.foundInTrms && Math.abs(r.diffs.sellPrice) > 0.01;
  const srcMismatch = r.foundInApp && r.foundInTrms && Math.abs(r.diffs.src) > 1.0;
  const loadingMonthMismatch = r.foundInApp && r.foundInTrms && r.diffs.loadingMonth;
  const deliveryMonthMismatch = r.foundInApp && r.foundInTrms && r.diffs.deliveryMonth;

  return (
    <div className={`flex border-b border-slate-100 transition-colors hover:bg-indigo-50/30 bg-white group ${!r.foundInTrms ? 'bg-amber-50/20' : !r.foundInApp ? 'bg-purple-50/20' : ''}`} style={{ height: rowHeight, contentVisibility: 'auto', containIntrinsicSize: `auto ${rowHeight}px` }}>
      {/* 1. Strategy Name */}
      <div className={`px-4 py-2 shrink-0 sticky left-0 z-20 border-r border-slate-100 flex items-center transition-colors group-hover:bg-indigo-50/30 ${!r.foundInTrms ? 'bg-amber-50/80' : !r.foundInApp ? 'bg-purple-50/80' : 'bg-white'}`} style={{ width: columnWidths['Strategy Name'] || 280 }}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-800 truncate">{r.strategyName}</span>
            <span className="text-[8px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded truncate">{r.group}</span>
          </div>
          <div className="flex items-center gap-1 mt-1">
            {r.status === 'Matched' ? (
              <span className="text-[8px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Matched</span>
            ) : r.status === 'App Only' ? (
              <span className="text-[8px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">App Only (Missing in TRMS)</span>
            ) : (
              <span className="text-[8px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">TRMS Only (Missing in App)</span>
            )}

            {r.discrepancies.size > 0 && r.status === 'Matched' && (
              <span className="text-[8px] font-black bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">
                {r.discrepancies.size} Diff
              </span>
            )}
          </div>
        </div>

        {r.foundInTrms && r.trms.rawRows && r.trms.rawRows.length > 0 && (
          <button 
            onClick={() => onViewRawData(r.strategyName, r.trms.rawRows!)}
            className="ml-2 p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-all group/btn shrink-0"
            title="Deep Dive TRMS Raw Rows"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
        )}
      </div>

      {/* 2. P&L Bucket */}
      <div className={`px-3 py-2 shrink-0 flex flex-col justify-center border-r border-slate-100 overflow-hidden ${pnlMismatch ? 'bg-rose-50/70' : ''}`} style={{ width: columnWidths['P&L Bucket'] || DEFAULT_COLUMN_WIDTH }}>
        <div className="flex justify-between items-center mb-1 pb-1 border-b border-slate-100">
          <span className="text-[8px] font-bold text-slate-400 uppercase">App</span>
          <span className={`text-[10px] font-bold font-mono ${r.app.pnlBucket === 'Realized' ? 'text-blue-600' : 'text-slate-700'}`}>{r.app.pnlBucket}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[8px] font-bold text-slate-400 uppercase">TRMS</span>
          <span className={`text-[10px] font-bold font-mono ${r.trms.pnlBucket === 'Realized' ? 'text-blue-600' : pnlMismatch ? 'text-rose-600' : 'text-slate-600'}`}>{r.trms.pnlBucket}</span>
        </div>
      </div>

      {/* 3. Optimization */}
      <div className={`px-3 py-2 shrink-0 flex flex-col justify-center border-r border-slate-100 overflow-hidden ${optMismatch ? 'bg-rose-50/70' : ''}`} style={{ width: columnWidths['Optimization'] || DEFAULT_COLUMN_WIDTH }}>
        <div className="flex justify-between items-center mb-1 pb-1 border-b border-slate-100">
          <span className="text-[8px] font-bold text-slate-400 uppercase">App</span>
          <span className={`text-[10px] font-bold font-mono ${r.app.optimization === 'Yes' ? 'text-emerald-600' : 'text-slate-700'}`}>{r.app.optimization}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[8px] font-bold text-slate-400 uppercase">TRMS</span>
          <span className={`text-[10px] font-bold font-mono ${r.trms.optimization === 'Yes' ? 'text-emerald-600' : optMismatch ? 'text-rose-600' : 'text-slate-600'}`}>{r.trms.optimization}</span>
        </div>
      </div>

      {/* 4. Unallocated Cargo */}
      <div className={`px-3 py-2 shrink-0 flex flex-col justify-center border-r border-slate-100 overflow-hidden ${unallocMismatch ? 'bg-rose-50/70' : ''}`} style={{ width: columnWidths['Unallocated Cargo'] || 160 }}>
        <div className="flex justify-between items-center mb-1 pb-1 border-b border-slate-100">
          <span className="text-[8px] font-bold text-slate-400 uppercase">App</span>
          <span className="text-[9px] font-bold font-mono text-slate-800 truncate">{r.app.unallocatedCargo}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[8px] font-bold text-slate-400 uppercase">TRMS</span>
          <span className={`text-[9px] font-bold font-mono truncate ${unallocMismatch ? 'text-rose-600' : 'text-slate-600'}`}>{r.trms.unallocatedCargo}</span>
        </div>
      </div>

      {/* 5. Purchase Volume */}
      <div className={`px-3 py-2 shrink-0 flex flex-col justify-center border-r border-slate-100 overflow-hidden ${buyVolMismatch ? 'bg-rose-50/70' : ''}`} style={{ width: columnWidths['Purchase Volume'] || 160 }}>
        <div className="flex flex-col mb-1 pb-1 border-b border-slate-100">
          <div className="flex justify-between items-center text-[8px] text-slate-400 font-bold uppercase">
            <span>App Buy Vol</span>
            {r.app.isTiered && <span className="text-indigo-600">2-Tier</span>}
          </div>
          <div className="flex justify-between items-center font-mono text-[10px]">
            {r.app.isTiered ? (
              <span className="text-slate-600 text-[8px]">T1:{r.app.buyVolT1.toLocaleString()} | T2:{r.app.buyVolT2.toLocaleString()}</span>
            ) : null}
            <span className="font-bold text-slate-800 ml-auto">{r.app.buyVolTotal.toLocaleString()}</span>
          </div>
        </div>
        <div className="flex flex-col">
          <div className="flex justify-between items-center text-[8px] text-slate-400 font-bold uppercase">
            <span>TRMS Buy Vol</span>
            {r.trms.buyVolT2 > 0 && <span className="text-violet-600">2-Tier</span>}
          </div>
          <div className="flex justify-between items-center font-mono text-[10px]">
            {r.trms.buyVolT2 > 0 ? (
              <span className="text-slate-500 text-[8px]">T1:{r.trms.buyVolT1.toLocaleString()} | T2:{r.trms.buyVolT2.toLocaleString()}</span>
            ) : null}
            <span className={`font-bold ml-auto ${buyVolMismatch ? 'text-rose-600' : 'text-slate-700'}`}>{r.trms.buyVolTotal.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* 6. Sales Volume */}
      <div className={`px-3 py-2 shrink-0 flex flex-col justify-center border-r border-slate-100 overflow-hidden ${sellVolMismatch ? 'bg-rose-50/70' : ''}`} style={{ width: columnWidths['Sales Volume'] || 160 }}>
        <div className="flex flex-col mb-1 pb-1 border-b border-slate-100">
          <div className="flex justify-between items-center text-[8px] text-slate-400 font-bold uppercase">
            <span>App Sell Vol</span>
            {r.app.isTiered && <span className="text-indigo-600">2-Tier</span>}
          </div>
          <div className="flex justify-between items-center font-mono text-[10px]">
            {r.app.isTiered ? (
              <span className="text-slate-600 text-[8px]">T1:{r.app.sellVolT1.toLocaleString()} | T2:{r.app.sellVolT2.toLocaleString()}</span>
            ) : null}
            <span className="font-bold text-slate-800 ml-auto">{r.app.sellVolTotal.toLocaleString()}</span>
          </div>
        </div>
        <div className="flex flex-col">
          <div className="flex justify-between items-center text-[8px] text-slate-400 font-bold uppercase">
            <span>TRMS Sell Vol</span>
            {r.trms.sellVolT2 > 0 && <span className="text-violet-600">2-Tier</span>}
          </div>
          <div className="flex justify-between items-center font-mono text-[10px]">
            {r.trms.sellVolT2 > 0 ? (
              <span className="text-slate-500 text-[8px]">T1:{r.trms.sellVolT1.toLocaleString()} | T2:{r.trms.sellVolT2.toLocaleString()}</span>
            ) : null}
            <span className={`font-bold ml-auto ${sellVolMismatch ? 'text-rose-600' : 'text-slate-700'}`}>{r.trms.sellVolTotal.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* 7. Purchase Price */}
      <div className={`px-3 py-2 shrink-0 flex flex-col justify-center border-r border-slate-100 overflow-hidden ${buyPriceMismatch ? 'bg-rose-50/70' : ''}`} style={{ width: columnWidths['Purchase Price'] || 160 }}>
        <div className="flex flex-col mb-1 pb-1 border-b border-slate-100">
          <div className="flex justify-between items-center text-[8px] text-slate-400 font-bold uppercase">
            <span>App Buy Price</span>
            {r.app.isTiered && <span className="text-indigo-600">2-Tier</span>}
          </div>
          <div className="flex justify-between items-center font-mono text-[10px]">
            {r.app.isTiered ? (
              <span className="text-slate-600 text-[8px]">T1:${r.app.buyPriceT1.toFixed(2)} | T2:${r.app.buyPriceT2.toFixed(2)}</span>
            ) : null}
            <span className="font-bold text-slate-800 ml-auto">${r.app.buyPriceEffective.toFixed(3)}</span>
          </div>
        </div>
        <div className="flex flex-col">
          <div className="flex justify-between items-center text-[8px] text-slate-400 font-bold uppercase">
            <span>TRMS Buy Price</span>
            {r.trms.buyPriceT2 > 0 && <span className="text-violet-600">2-Tier</span>}
          </div>
          <div className="flex justify-between items-center font-mono text-[10px]">
            {r.trms.buyPriceT2 > 0 ? (
              <span className="text-slate-500 text-[8px]">T1:${r.trms.buyPriceT1.toFixed(2)} | T2:${r.trms.buyPriceT2.toFixed(2)}</span>
            ) : null}
            <span className={`font-bold ml-auto ${buyPriceMismatch ? 'text-rose-600' : 'text-slate-700'}`}>${r.trms.buyPriceEffective.toFixed(3)}</span>
          </div>
        </div>
      </div>

      {/* 8. Sales Price */}
      <div className={`px-3 py-2 shrink-0 flex flex-col justify-center border-r border-slate-100 overflow-hidden ${sellPriceMismatch ? 'bg-rose-50/70' : ''}`} style={{ width: columnWidths['Sales Price'] || 160 }}>
        <div className="flex flex-col mb-1 pb-1 border-b border-slate-100">
          <div className="flex justify-between items-center text-[8px] text-slate-400 font-bold uppercase">
            <span>App Sell Price</span>
            {r.app.isTiered && <span className="text-indigo-600">2-Tier</span>}
          </div>
          <div className="flex justify-between items-center font-mono text-[10px]">
            {r.app.isTiered ? (
              <span className="text-slate-600 text-[8px]">T1:${r.app.sellPriceT1.toFixed(2)} | T2:${r.app.sellPriceT2.toFixed(2)}</span>
            ) : null}
            <span className="font-bold text-slate-800 ml-auto">${r.app.sellPriceEffective.toFixed(3)}</span>
          </div>
        </div>
        <div className="flex flex-col">
          <div className="flex justify-between items-center text-[8px] text-slate-400 font-bold uppercase">
            <span>TRMS Sell Price</span>
            {r.trms.sellPriceT2 > 0 && <span className="text-violet-600">2-Tier</span>}
          </div>
          <div className="flex justify-between items-center font-mono text-[10px]">
            {r.trms.sellPriceT2 > 0 ? (
              <span className="text-slate-500 text-[8px]">T1:${r.trms.sellPriceT1.toFixed(2)} | T2:${r.trms.sellPriceT2.toFixed(2)}</span>
            ) : null}
            <span className={`font-bold ml-auto ${sellPriceMismatch ? 'text-rose-600' : 'text-slate-700'}`}>${r.trms.sellPriceEffective.toFixed(3)}</span>
          </div>
        </div>
      </div>

      {/* 9. SRC Costs */}
      <div className={`px-3 py-2 shrink-0 flex flex-col justify-center border-r border-slate-100 overflow-hidden ${srcMismatch ? 'bg-rose-50/70' : ''}`} style={{ width: columnWidths['SRC Costs'] || DEFAULT_COLUMN_WIDTH }}>
        <div className="flex justify-between items-center mb-1 pb-1 border-b border-slate-100">
          <span className="text-[8px] font-bold text-slate-400 uppercase">App SRC</span>
          <span className="text-[10px] font-bold font-mono text-slate-800">{formatUSD(r.app.src)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[8px] font-bold text-slate-400 uppercase">TRMS SRC</span>
          <span className={`text-[10px] font-bold font-mono ${srcMismatch ? 'text-rose-600' : 'text-slate-600'}`}>{formatUSD(r.trms.src)}</span>
        </div>
      </div>

      {/* 10. Loading Month */}
      <div className={`px-3 py-2 shrink-0 flex flex-col justify-center border-r border-slate-100 overflow-hidden ${loadingMonthMismatch ? 'bg-rose-50/70' : ''}`} style={{ width: columnWidths['Loading Month'] || DEFAULT_COLUMN_WIDTH }}>
        <div className="flex justify-between items-center mb-1 pb-1 border-b border-slate-100">
          <span className="text-[8px] font-bold text-slate-400 uppercase">App Month</span>
          <span className="text-[10px] font-bold font-mono text-slate-800">{r.app.loadingMonth}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[8px] font-bold text-slate-400 uppercase">TRMS Month</span>
          <span className={`text-[10px] font-bold font-mono ${loadingMonthMismatch ? 'text-rose-600' : 'text-slate-600'}`}>{r.trms.loadingMonth}</span>
        </div>
      </div>

      {/* 11. Delivery Month */}
      <div className={`px-3 py-2 shrink-0 flex flex-col justify-center border-r border-slate-100 overflow-hidden ${deliveryMonthMismatch ? 'bg-rose-50/70' : ''}`} style={{ width: columnWidths['Delivery Month'] || DEFAULT_COLUMN_WIDTH }}>
        <div className="flex justify-between items-center mb-1 pb-1 border-b border-slate-100">
          <span className="text-[8px] font-bold text-slate-400 uppercase">App Month</span>
          <span className="text-[10px] font-bold font-mono text-slate-800">{r.app.deliveryMonth}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[8px] font-bold text-slate-400 uppercase">TRMS Month</span>
          <span className={`text-[10px] font-bold font-mono ${deliveryMonthMismatch ? 'text-rose-600' : 'text-slate-600'}`}>{r.trms.deliveryMonth}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="px-3 py-2 shrink-0 sticky right-0 z-30 bg-white group-hover:bg-indigo-50/50 border-l border-slate-100 flex items-center justify-center" style={{ width: 80 }}>
        {r.foundInApp && (
          <button 
            onClick={() => handleRowEdit(r.profileId)}
            className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors"
            title="Edit Cargo Profile"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
        )}
      </div>
    </div>
  );
});

const TabButton = ({ active, onClick, label, count, color }: { active: boolean, onClick: () => void, label: string, count: number, color: string }) => {
    const cls = { 
        indigo: 'text-indigo-600 border-indigo-500 bg-indigo-50', 
        emerald: 'text-emerald-600 border-emerald-500 bg-emerald-50', 
        amber: 'text-amber-600 border-amber-500 bg-amber-50', 
        rose: 'text-rose-600 border-rose-500 bg-rose-50',
        blue: 'text-blue-600 border-blue-500 bg-blue-50',
        violet: 'text-violet-600 border-violet-500 bg-violet-50'
    }[color as 'indigo'|'emerald'|'amber'|'rose'|'blue'|'violet'] || 'text-indigo-600 border-indigo-500 bg-indigo-50';
    return (
        <button onClick={onClick} className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 ${active ? cls : 'border-transparent text-slate-400 hover:text-slate-600'}`}>{label} {count > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${active ? 'bg-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>{count.toLocaleString()}</span>}</button>
    );
};

const CurveComparison: React.FC<{ availableDates: string[], availableGRMDates: string[] }> = ({ availableDates, availableGRMDates }) => {
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [selectedIndex, setSelectedIndex] = useState('TTF');
    const [chartData, setChartData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (availableDates.length > 0 && !selectedDate) {
            setSelectedDate(availableDates[0]);
        }
    }, [availableDates, selectedDate]);

    useEffect(() => {
        const fetchCurves = async () => {
            if (!selectedDate) return;
            setIsLoading(true);
            try {
                const [normalCurve, grmCurve] = await Promise.all([
                    getForwardCurve(selectedDate),
                    getGRMForwardCurve(selectedDate)
                ]);
                
                const allMonths = Array.from(new Set([...normalCurve.map(r => r.month), ...grmCurve.map(r => r.month)])).sort();
                
                const data = allMonths.map(month => {
                    const nVal = normalCurve.find(r => r.month === month)?.prices[selectedIndex] || null;
                    const gVal = grmCurve.find(r => r.month === month)?.prices[selectedIndex] || null;
                    return {
                        month,
                        'Normal Curve': nVal,
                        'GRM Curve (Endur)': gVal,
                        'Diff': (nVal !== null && gVal !== null) ? nVal - gVal : null
                    };
                });
                setChartData(data);
            } catch (error) {
                console.error("Error fetching curves:", error);
                toast.error("Failed to fetch curve data");
            } finally {
                setIsLoading(false);
            }
        };
        fetchCurves();
    }, [selectedDate, selectedIndex]);

    const indices = ['TTF', 'JKM', 'HH', 'Dated Brent', 'NBP', 'AECO', 'STN 2'];

    const handleDownloadCurveData = () => {
        if (chartData.length === 0) {
            toast.error("No curve data to download");
            return;
        }
        const ws = XLSX.utils.json_to_sheet(chartData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Curve Comparison");
        XLSX.writeFile(wb, `Curve_Comparison_${selectedIndex}_${selectedDate}.xlsx`);
        toast.success("Curve data exported to Excel");
    };

    if (availableDates.length === 0 && availableGRMDates.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-20 text-slate-400 bg-slate-50">
                <svg className="w-16 h-16 mb-4 opacity-20 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4" /></svg>
                <p className="font-bold text-slate-600 uppercase tracking-widest text-sm">No Curve Data Available</p>
                <p className="text-xs text-center max-w-xs mt-2">
                    Upload a TRMS file containing forward curves to begin comparison.
                </p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
            <div className="p-6 border-b border-slate-200 bg-white flex flex-wrap items-center gap-6 shadow-sm">
                <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pricing Index</label>
                    <select 
                        value={selectedIndex} 
                        onChange={(e) => setSelectedIndex(e.target.value)}
                        className="block w-48 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                        {indices.map(idx => <option key={idx} value={idx}>{idx}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Comparison Date</label>
                    <select 
                        value={selectedDate} 
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="block w-48 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                        {Array.from(new Set([...availableDates, ...availableGRMDates])).sort().reverse().map(d => (
                            <option key={d} value={d}>{d}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-4 ml-auto">
                    <button 
                        onClick={handleDownloadCurveData}
                        className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-2 shadow-sm"
                    >
                        <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Export CSV
                    </button>
                    <div className="h-10 w-px bg-slate-200 mx-2" />
                    {isLoading && <span className="text-xs text-slate-400 animate-pulse">Loading curves...</span>}
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-indigo-600 rounded-full"></div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Normal Curve</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-rose-500 rounded-full"></div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">GRM Curve</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-[500px]">
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight mb-6 flex items-center gap-2">
                            <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4" /></svg>
                            Visual Comparison: {selectedIndex}
                        </h3>
                        <ResponsiveContainer width="100%" height="90%">
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="month" tick={{fontSize: 10, fontWeight: 700}} axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                    formatter={(value: number) => [value.toFixed(4), '']}
                                />
                                <Legend verticalAlign="top" align="right" />
                                <Line type="monotone" dataKey="Normal Curve" stroke="#4f46e5" strokeWidth={4} dot={{ r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }} animationDuration={600} />
                                <Line type="monotone" dataKey="GRM Curve (Endur)" stroke="#f43f5e" strokeWidth={4} dot={{ r: 4, fill: '#f43f5e', strokeWidth: 2, stroke: '#fff' }} strokeDasharray="6 6" animationDuration={600} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Numerical Variance</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-white shadow-sm z-10">
                                    <tr className="border-b border-slate-100">
                                        <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase">Month</th>
                                        <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase text-right">Normal</th>
                                        <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase text-right">GRM</th>
                                        <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase text-right">Diff</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {chartData.map(row => (
                                        <tr key={row.month} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-2.5 text-[10px] font-bold text-slate-700">{row.month}</td>
                                            <td className="px-4 py-2.5 text-[10px] font-mono text-right text-slate-600">{row['Normal Curve']?.toFixed(4) || '-'}</td>
                                            <td className="px-4 py-2.5 text-[10px] font-mono text-right text-slate-600">{row['GRM Curve (Endur)']?.toFixed(4) || '-'}</td>
                                            <td className={`px-4 py-2.5 text-[10px] font-mono font-bold text-right ${row.Diff && Math.abs(row.Diff) > 0.0001 ? (row.Diff > 0 ? 'text-rose-500' : 'text-emerald-500') : 'text-slate-300'}`}>
                                                {row.Diff ? (row.Diff > 0 ? '+' : '') + row.Diff.toFixed(4) : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const ExtractedTrmsTable: React.FC<{ trmsData: ReconciliationData }> = ({ trmsData }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [showGridlines, setShowGridlines] = useState(true);

  const columns = useMemo(() => [
    'Deal Num', 'Reference', 'Internal Portfolio', 'External Legal Entity',
    'Trade Date', 'Start Date', 'End Date', 'Buy_Sell', 'Price', 'Strike', 
    'Base_Total_Value_USD', 'Change_in_Total_PnL', 'Payment Date', 
    'Plsb Year Bucket', 'Volume', 'Unit', 'Strategy Name', 'Ins Type', 
    'Event Source', 'Settlement Type', 'Cflow Type', 'Volume Type', 
    'Price Status', 'EOD Date', 'Tran_Status', 'Yday_Tran_Status', 
    'Incoterm', 'BU_L1', 'BU_L2', 'BU_L3', 'BU_L4', 'BU_L5', 'BU_L6', 
    'Trader', 'IndexName_ProjectionMethod'
  ], []);

  const numCols = useMemo(() => [
    'Price', 'Strike', 'Base_Total_Value_USD', 'Change_in_Total_PnL', 'Volume'
  ], []);

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => new Set(columns));
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);
  const [activeFilterMenu, setActiveFilterMenu] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  // Filters state
  const [sortConfig, setSortConfig] = useState<{ column: string; direction: 'asc' | 'desc' | null }>({
    column: '',
    direction: null,
  });

  const [columnFilters, setColumnFilters] = useState<Record<string, {
    selectedValues: Set<string>;
    condition: string;
    conditionValue1: string;
    conditionValue2: string;
  }>>({});

  const [filterSearchTerms, setFilterSearchTerms] = useState<Record<string, string>>({});

  const rows = useMemo(() => trmsData.extractedRows || [], [trmsData.extractedRows]);

  // Click outside handling for menus
  const menuRef = useRef<HTMLDivElement>(null);
  const colPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setActiveFilterMenu(null);
      }
      if (colPickerRef.current && !colPickerRef.current.contains(target)) {
        setIsColumnPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Compute unique values inside each column
  const uniqueValues = useMemo(() => {
    const map: Record<string, { value: string; count: number }[]> = {};
    columns.forEach(col => {
      const counts: Record<string, number> = {};
      rows.forEach((row: any) => {
        const v = String(row[col] !== undefined && row[col] !== null ? row[col] : '').trim();
        counts[v] = (counts[v] || 0) + 1;
      });
      map[col] = Object.entries(counts)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);
    });
    return map;
  }, [rows, columns]);

  // Main Comprehensive Filter and Sort Engine
  const filteredAndSortedRows = useMemo(() => {
    let result = [...rows];

    // 1. Global text search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((row: any) => {
        return Object.entries(row).some(([col, val]) => {
          if (!visibleColumns.has(col)) return false;
          return String(val || '').toLowerCase().includes(term);
        });
      });
    }

    // 2. Multi-column filters
    Object.entries(columnFilters).forEach(([col, filter]) => {
      // A. Value checkbox selections
      if (filter.selectedValues && filter.selectedValues.size > 0) {
        result = result.filter((row: any) => {
          const val = String(row[col] !== undefined && row[col] !== null ? row[col] : '').trim();
          return filter.selectedValues.has(val);
        });
      }

      // B. Condition operations
      if (filter.condition && filter.condition !== 'none') {
        const cond = filter.condition;
        const val1 = filter.conditionValue1.toLowerCase();
        const val2 = filter.conditionValue2.toLowerCase();

        result = result.filter((row: any) => {
          const rawVal = row[col];
          const valStr = String(rawVal === undefined || rawVal === null ? '' : rawVal);
          const valStrLower = valStr.toLowerCase();
          const valNum = Number(String(rawVal || '').replace(/[^0-9.-]/g, ''));

          switch (cond) {
            case 'contains':
              return valStrLower.includes(val1);
            case 'notContains':
              return !valStrLower.includes(val1);
            case 'equals':
              return valStrLower === val1;
            case 'notEquals':
              return valStrLower !== val1;
            case 'starts':
              return valStrLower.startsWith(val1);
            case 'ends':
              return valStrLower.endsWith(val1);
            case 'empty':
              return valStr.trim() === '';
            case 'notEmpty':
              return valStr.trim() !== '';
            case 'gt':
              return !isNaN(valNum) && valNum > Number(val1);
            case 'lt':
              return !isNaN(valNum) && valNum < Number(val1);
            case 'between':
              return !isNaN(valNum) && valNum >= Number(val1) && valNum <= Number(val2);
            default:
              return true;
          }
        });
      }
    });

    // 3. Sorting
    if (sortConfig.column && sortConfig.direction) {
      const col = sortConfig.column;
      const isAsc = sortConfig.direction === 'asc';
      result.sort((a, b) => {
        const valA = a[col];
        const valB = b[col];

        const numA = Number(String(valA || '').replace(/[^0-9.-]/g, ''));
        const numB = Number(String(valB || '').replace(/[^0-9.-]/g, ''));

        // Number sort
        if (!isNaN(numA) && !isNaN(numB) && valA !== '' && valB !== '' && numCols.includes(col)) {
          return isAsc ? numA - numB : numB - numA;
        }

        // String locale sort
        const strA = String(valA || '').toLowerCase();
        const strB = String(valB || '').toLowerCase();
        return isAsc ? strA.localeCompare(strB) : strB.localeCompare(strA);
      });
    }

    return result;
  }, [rows, searchTerm, columnFilters, sortConfig, visibleColumns, numCols]);

  // Auto-clear selected rows when layout data adjusts
  useEffect(() => {
    setSelectedRows(new Set());
  }, [columnFilters, searchTerm]);

  // Compute dynamic aggregations (Excel Bottom Status Bar style)
  const targetGroupForStats = useMemo(() => {
    if (selectedRows.size > 0) {
      const selectionArray = Array.from(selectedRows);
      return filteredAndSortedRows.filter((_, idx) => selectedRows.has(idx));
    }
    return filteredAndSortedRows;
  }, [filteredAndSortedRows, selectedRows]);

  const stats = useMemo(() => {
    const totalLines = targetGroupForStats.length;
    let sumValue = 0;
    let sumPnL = 0;
    let sumVolume = 0;
    let priceSum = 0;
    let priceCount = 0;

    targetGroupForStats.forEach((row: any) => {
      const valStr = String(row['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, '');
      const pnlStr = String(row['Change_in_Total_PnL'] || '').replace(/[^0-9.-]/g, '');
      const volStr = String(row['Volume'] || '').replace(/[^0-9.-]/g, '');
      const prcStr = String(row['Price'] || '').replace(/[^0-9.-]/g, '');

      const v = Number(valStr);
      const p = Number(pnlStr);
      const vol = Number(volStr);
      const prc = Number(prcStr);

      if (!isNaN(v) && valStr !== '') sumValue += v;
      if (!isNaN(p) && pnlStr !== '') sumPnL += p;
      if (!isNaN(vol) && volStr !== '') sumVolume += vol;
      if (!isNaN(prc) && prcStr !== '' && prc !== 0) {
        priceSum += prc;
        priceCount++;
      }
    });

    return {
      count: totalLines,
      sumValue,
      avgValue: totalLines > 0 ? sumValue / totalLines : 0,
      sumPnL,
      avgPnL: totalLines > 0 ? sumPnL / totalLines : 0,
      sumVolume,
      avgVolume: totalLines > 0 ? sumVolume / totalLines : 0,
      avgPrice: priceCount > 0 ? priceSum / priceCount : 0
    };
  }, [targetGroupForStats]);

  // Pagination bounds
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedRows.slice(start, start + pageSize);
  }, [filteredAndSortedRows, currentPage, pageSize]);

  // Helpers to act on columns
  const toggleColumnVisibility = (col: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(col)) {
        if (next.size > 1) next.delete(col); // Keep at least one column visible
      } else {
        next.add(col);
      }
      return next;
    });
  };

  const handleApplyConditionFilter = (col: string, condition: string, val1: string, val2: string) => {
    setColumnFilters(prev => {
      const current = prev[col] || { selectedValues: new Set<string>(), condition: 'none', conditionValue1: '', conditionValue2: '' };
      return {
        ...prev,
        [col]: {
          ...current,
          condition,
          conditionValue1: val1,
          conditionValue2: val2
        }
      };
    });
    setCurrentPage(1);
  };

  const handleToggleUniqueValueCheckbox = (col: string, val: string) => {
    setColumnFilters(prev => {
      const current = prev[col] || { selectedValues: new Set<string>(), condition: 'none', conditionValue1: '', conditionValue2: '' };
      const newSel = new Set(current.selectedValues);
      if (newSel.has(val)) {
        newSel.delete(val);
      } else {
        newSel.add(val);
      }
      return {
        ...prev,
        [col]: {
          ...current,
          selectedValues: newSel
        }
      };
    });
    setCurrentPage(1);
  };

  const handleSelectAllUniqueValues = (col: string, selectAll: boolean) => {
    setColumnFilters(prev => {
      const current = prev[col] || { selectedValues: new Set<string>(), condition: 'none', conditionValue1: '', conditionValue2: '' };
      const newSel = new Set<string>();
      if (!selectAll) {
        // Find visible matches within checklist and populate them to define exact filter
        const checklistSearchTerm = (filterSearchTerms[col] || '').toLowerCase();
        const uValues = uniqueValues[col] || [];
        uValues.forEach(uv => {
          if (uv.value.toLowerCase().includes(checklistSearchTerm)) {
            newSel.add(uv.value);
          }
        });
      }
      return {
        ...prev,
        [col]: {
          ...current,
          selectedValues: newSel
        }
      };
    });
    setCurrentPage(1);
  };

  const handleClearColumnFilter = (col: string) => {
    setColumnFilters(prev => {
      const next = { ...prev };
      delete next[col];
      return next;
    });
  };

  const handleClearAllFilters = () => {
    setColumnFilters({});
    setSearchTerm('');
    setSortConfig({ column: '', direction: null });
    setCurrentPage(1);
  };

  // Preset quick filter triggers
  const handleApplyPresetFilter = (preset: 'highValue' | 'losses' | 'buys' | 'sells' | 'clear') => {
    if (preset === 'clear') {
      handleClearAllFilters();
      return;
    }
    
    handleClearAllFilters();
    
    setTimeout(() => {
      if (preset === 'highValue') {
        setColumnFilters({
          'Base_Total_Value_USD': {
            selectedValues: new Set(),
            condition: 'gt',
            conditionValue1: '1000000',
            conditionValue2: ''
          }
        });
      } else if (preset === 'losses') {
        setColumnFilters({
          'Change_in_Total_PnL': {
            selectedValues: new Set(),
            condition: 'lt',
            conditionValue1: '0',
            conditionValue2: ''
          }
        });
      } else if (preset === 'buys') {
        const buyValues = new Set<string>();
        const uValues = uniqueValues['Buy_Sell'] || [];
        uValues.forEach(uv => {
          const l = uv.value.toLowerCase();
          if (l === 'buy' || l === 'buys' || l.includes('buy')) {
            buyValues.add(uv.value);
          }
        });
        if (buyValues.size === 0) {
          buyValues.add('BUY');
          buyValues.add('Buy');
          buyValues.add('buys');
        }
        setColumnFilters({
          'Buy_Sell': {
            selectedValues: buyValues,
            condition: 'none',
            conditionValue1: '',
            conditionValue2: ''
          }
        });
      } else if (preset === 'sells') {
        const sellValues = new Set<string>();
        const uValues = uniqueValues['Buy_Sell'] || [];
        uValues.forEach(uv => {
          const l = uv.value.toLowerCase();
          if (l === 'sell' || l === 'sells' || l.includes('sell')) {
            sellValues.add(uv.value);
          }
        });
        if (sellValues.size === 0) {
          sellValues.add('SELL');
          sellValues.add('Sell');
          sellValues.add('sells');
        }
        setColumnFilters({
          'Buy_Sell': {
            selectedValues: sellValues,
            condition: 'none',
            conditionValue1: '',
            conditionValue2: ''
          }
        });
      }
    }, 50);
  };

  // Row selection states
  const handleSelectPageCheckbox = (checked: boolean) => {
    const startIndex = (currentPage - 1) * pageSize;
    setSelectedRows(prev => {
      const next = new Set(prev);
      paginatedRows.forEach((_, idx) => {
        const globalIdx = startIndex + idx;
        if (checked) {
          next.add(globalIdx);
        } else {
          next.delete(globalIdx);
        }
      });
      return next;
    });
  };

  const handleSelectRow = (globalIdx: number, checked: boolean) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(globalIdx);
      } else {
        next.delete(globalIdx);
      }
      return next;
    });
  };

  const isAllPageSelected = useMemo(() => {
    if (paginatedRows.length === 0) return false;
    const startIndex = (currentPage - 1) * pageSize;
    return paginatedRows.every((_, idx) => selectedRows.has(startIndex + idx));
  }, [paginatedRows, selectedRows, currentPage, pageSize]);

  // Export dynamically configured CSV (only filtered rows & visible columns option)
  const handleExportCSV = (exportOnlyVisibleCols: boolean = false) => {
    if (filteredAndSortedRows.length === 0) return;

    const targetCols = columns.filter(c => !exportOnlyVisibleCols || visibleColumns.has(c));
    const headerRow = targetCols.map(c => `"${c.replace(/"/g, '""')}"`).join(',');
    const bodyRows = filteredAndSortedRows.map(row => {
      return targetCols.map(col => {
        const val = row[col] === undefined || row[col] === null ? '' : String(row[col]);
        return `"${val.replace(/"/g, '""')}"`;
      }).join(',');
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headerRow, ...bodyRows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `extracted_trms_reconciliation_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Successfully exported current view as CSV!");
  };

  const renderCellContent = (col: string, val: any) => {
    if (val === undefined || val === null) return '';
    const num = Number(val);
    if (!isNaN(num) && val !== '' && numCols.includes(col)) {
      if (col === 'Base_Total_Value_USD' || col === 'Change_in_Total_PnL') {
        const sign = num < 0 ? '-' : '';
        return `${sign}$${Math.abs(num).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
      }
      if (col === 'Price' || col === 'Strike') {
        return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
      }
      if (col === 'Volume') {
        return num.toLocaleString(undefined, { maximumFractionDigits: 3 });
      }
    }
    return String(val);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-900 border border-slate-800 text-slate-100 h-full select-none">
      
      {/* 1. Header Toolbar with actions */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4">
        
        {/* Left Search and Active Filter count */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-80">
            <input 
              type="text" 
              placeholder="Global Excel search (fuzzy tracking)..." 
              value={searchTerm} 
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }} 
              className="block w-full pl-10 pr-10 py-1.5 bg-slate-950/80 border border-slate-750 hover:border-slate-650 rounded-lg text-xs font-medium text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:outline-none transition-all" 
            />
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
            {searchTerm && (
              <button 
                onClick={() => {
                  setSearchTerm('');
                  setCurrentPage(1);
                }} 
                className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 bg-slate-950 rounded-full text-slate-400 font-mono flex items-center gap-1.5 border border-slate-800">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span>
              <strong>{filteredAndSortedRows.length}</strong> of {rows.length} rows
            </span>
            {Object.keys(columnFilters).length > 0 && (
              <button 
                onClick={handleClearAllFilters}
                className="text-xs px-2.5 py-1 bg-rose-950/40 text-rose-400 border border-rose-900 hover:bg-rose-950/80 rounded-full flex items-center gap-1.5 transition-colors"
                title="Clear all active column sorting & filters"
              >
                <X className="w-3 h-3" />
                Clear Filters ({Object.keys(columnFilters).length})
              </button>
            )}
          </div>
        </div>

        {/* Action presets and custom configuration toggles */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Preset Selector */}
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-slate-400 text-xs">
            <span className="px-2 font-semibold text-[10px] uppercase text-slate-550 hidden md:inline">Presets:</span>
            <button 
              onClick={() => handleApplyPresetFilter('buys')}
              className="px-2 py-1 rounded hover:text-white hover:bg-slate-850 text-[11px]"
            >
              Buys
            </button>
            <button 
              onClick={() => handleApplyPresetFilter('sells')}
              className="px-2 py-1 rounded hover:text-white hover:bg-slate-850 text-[11px]"
            >
              Sells
            </button>
            <button 
              onClick={() => handleApplyPresetFilter('highValue')}
              className="px-2 py-1 rounded hover:text-white hover:bg-slate-850 text-[11px]"
              title="Deals where Value > $1,000,000 USD"
            >
              &gt; $1M
            </button>
            <button 
              onClick={() => handleApplyPresetFilter('losses')}
              className="px-2 py-1 rounded hover:text-white hover:bg-slate-850 text-[11px]"
              title="Deals with Negative Realized P&L"
            >
              Losses
            </button>
          </div>

          {/* Gridline display toggle */}
          <button 
            onClick={() => setShowGridlines(prev => !prev)}
            className={`px-3 py-1.5 border rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${showGridlines ? 'bg-slate-800 text-indigo-400 border-indigo-500/30' : 'bg-slate-950/60 text-slate-400 border-slate-800'}`}
            title="Toggle Excel Cell Borders Grid"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Gridlines: {showGridlines ? 'ON' : 'OFF'}
          </button>

          {/* Column Picker popover */}
          <div className="relative" ref={colPickerRef}>
            <button 
              onClick={() => setIsColumnPickerOpen(!isColumnPickerOpen)}
              className="px-3 py-1.5 bg-slate-950 select-none hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-white rounded-lg flex items-center gap-1.5 transition-all"
            >
              <Eye className="w-3.5 h-3.5 text-blue-400" />
              Columns ({visibleColumns.size}/{columns.length})
              <ChevronDown className="w-3 h-3 text-slate-500" />
            </button>

            <AnimatePresence>
              {isColumnPickerOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute right-0 mt-2 w-72 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-3 z-50 flex flex-col"
                >
                  <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-850">
                    <span className="text-xs font-bold text-slate-300">Toggle Column Visibility</span>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => setVisibleColumns(new Set(columns))}
                        className="text-[10px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                      >
                        All
                      </button>
                      <button 
                        onClick={() => setVisibleColumns(new Set(['Deal Num', 'Reference', 'Price', 'Volume', 'Base_Total_Value_USD', 'Change_in_Total_PnL']))}
                        className="text-[10px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto custom-scrollbar flex flex-col gap-1.5 pr-1">
                    {columns.map(col => {
                      const isChecked = visibleColumns.has(col);
                      return (
                        <label key={col} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-900 rounded cursor-pointer text-xs select-none">
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={() => toggleColumnVisibility(col)}
                            className="bg-slate-800 border-slate-700 text-indigo-500 rounded focus:ring-0 focus:ring-offset-0"
                          />
                          <span className={isChecked ? 'text-slate-200' : 'text-slate-500 line-through'}>{col}</span>
                        </label>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Export Actions with drop configuration */}
          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => handleExportCSV(false)}
              disabled={filteredAndSortedRows.length === 0}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors text-white"
              title="Export all rows of the table"
            >
              <Download className="w-3.5 h-3.5" />
              CSV (All Cols)
            </button>
            <button 
              onClick={() => handleExportCSV(true)}
              disabled={filteredAndSortedRows.length === 0}
              className="px-3 py-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 disabled:opacity-40 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors text-slate-300"
              title="Export only visible columns"
            >
              CSV (Visible Only)
            </button>
          </div>

        </div>
      </div>

      {/* 2. List of active filters - visual feedback panel */}
      {Object.keys(columnFilters).length > 0 && (
        <div className="px-4 py-2 bg-slate-950/40 border-b border-slate-850/60 flex flex-wrap gap-2 items-center">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Active Filters:</span>
          {Object.entries(columnFilters).map(([col, filter]) => {
            const hasCheckedValues = filter.selectedValues.size > 0;
            const hasCondition = filter.condition !== 'none';
            if (!hasCheckedValues && !hasCondition) return null;
            return (
              <span key={col} className="text-[11px] bg-slate-900 border border-slate-750 text-slate-200 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-sm">
                <span className="text-slate-450 font-medium">{col}:</span>
                <span className="text-amber-400 font-bold">
                  {hasCondition ? `${filter.condition}(${filter.conditionValue1}${filter.conditionValue2 ? `, ${filter.conditionValue2}` : ''})` : `${filter.selectedValues.size} selections`}
                </span>
                <button 
                  onClick={() => handleClearColumnFilter(col)}
                  className="p-0.5 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded-full transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* 3. Table container & Scroll Panel */}
      <div className="flex-1 overflow-auto custom-scrollbar relative bg-slate-950/80">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center h-full">
            <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center mb-4 text-slate-500 shadow-xl">
              <DatabaseIcon className="w-8 h-8 text-indigo-400" />
            </div>
            <h4 className="text-sm font-bold text-slate-300">No TRMS Data Extracted</h4>
            <p className="text-xs text-slate-500 max-w-sm mt-1">Please select and upload a TRMS export Excel file to analyze records.</p>
          </div>
        ) : filteredAndSortedRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center h-full">
            <X className="w-10 h-10 text-rose-500 mb-2" />
            <h4 className="text-sm font-bold text-slate-300">No Matching Spreadsheet Rows</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">Your spreadsheet filters did not match any of the {rows.length} records. Click the 'Clear Filters' button above to start fresh.</p>
          </div>
        ) : (
          <div className="h-full overflow-hidden flex flex-col">
            <div className="flex-1 overflow-auto custom-scrollbar relative">
              <table className={`w-full text-left border-collapse min-w-max text-[11.5px] ${showGridlines ? 'gridlines-active' : ''}`}>
                
                <thead>
                  <tr className="bg-slate-900 sticky top-0 z-30 shadow-md">
                    {/* Checkbox frozen left element */}
                    <th className="px-3 py-3 w-10 sticky left-0 z-40 bg-slate-900 border-r border-slate-800/80 shadow-[1px_0_0_0_rgba(30,41,59,1)]">
                      <input 
                        type="checkbox" 
                        checked={isAllPageSelected}
                        onChange={(e) => handleSelectPageCheckbox(e.target.checked)}
                        className="bg-slate-800 border-slate-700 text-indigo-500 rounded focus:ring-0 focus:ring-offset-0"
                      />
                    </th>

                    {/* Deal Num static frozen left element */}
                    {visibleColumns.has('Deal Num') && (
                      <th className="px-4 py-3 w-32 sticky left-10 z-40 bg-slate-900 border-r border-slate-800/80 shadow-[1px_0_0_0_rgba(30,41,59,1)]">
                        <div className="flex items-center justify-between gap-1 group">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Deal Num</span>
                          <button 
                            onClick={() => {
                              setActiveFilterMenu(activeFilterMenu === 'Deal Num' ? null : 'Deal Num');
                            }}
                            className={`p-1 rounded transition-colors ${columnFilters['Deal Num'] ? 'text-amber-500 bg-slate-800' : 'text-slate-500 hover:text-slate-200 hover:bg-slate-850'}`}
                          >
                            <Filter className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {/* Inline drop-menu panel for Deal Num */}
                        {activeFilterMenu === 'Deal Num' && (
                          <div className="absolute left-10 mt-1.5 z-50 text-left" ref={menuRef}>
                            <ColumnFilterPopover 
                              columnName="Deal Num"
                              filter={columnFilters['Deal Num'] || { selectedValues: new Set(), condition: 'none', conditionValue1: '', conditionValue2: '' }}
                              uniqueValues={uniqueValues['Deal Num'] || []}
                              filterSearchTerm={filterSearchTerms['Deal Num'] || ''}
                              setFilterSearchTerm={(val) => setFilterSearchTerms(prev => ({ ...prev, 'Deal Num': val }))}
                              onApplyCondition={(condition, val1, val2) => handleApplyConditionFilter('Deal Num', condition, val1, val2)}
                              onToggleCheckbox={(val) => handleToggleUniqueValueCheckbox('Deal Num', val)}
                              onSelectAll={(sel) => handleSelectAllUniqueValues('Deal Num', sel)}
                              onClear={() => handleClearColumnFilter('Deal Num')}
                              onClose={() => setActiveFilterMenu(null)}
                              sortConfig={sortConfig}
                              onSortChange={(dir) => {
                                setSortConfig({ column: 'Deal Num', direction: dir });
                                setActiveFilterMenu(null);
                              }}
                            />
                          </div>
                        )}
                      </th>
                    )}

                    {/* Reference static frozen left element */}
                    {visibleColumns.has('Reference') && (
                      <th className="px-4 py-3 w-40 sticky left-[168px] z-40 bg-slate-900 border-r border-slate-800/80 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.4)]">
                        <div className="flex items-center justify-between gap-1 group">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Reference</span>
                          <button 
                            onClick={() => {
                              setActiveFilterMenu(activeFilterMenu === 'Reference' ? null : 'Reference');
                            }}
                            className={`p-1 rounded transition-colors ${columnFilters['Reference'] ? 'text-amber-500 bg-slate-800' : 'text-slate-500 hover:text-slate-200 hover:bg-slate-850'}`}
                          >
                            <Filter className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {activeFilterMenu === 'Reference' && (
                          <div className="absolute left-[8px] mt-1.5 z-50 text-left" ref={menuRef}>
                            <ColumnFilterPopover 
                              columnName="Reference"
                              filter={columnFilters['Reference'] || { selectedValues: new Set(), condition: 'none', conditionValue1: '', conditionValue2: '' }}
                              uniqueValues={uniqueValues['Reference'] || []}
                              filterSearchTerm={filterSearchTerms['Reference'] || ''}
                              setFilterSearchTerm={(val) => setFilterSearchTerms(prev => ({ ...prev, 'Reference': val }))}
                              onApplyCondition={(condition, val1, val2) => handleApplyConditionFilter('Reference', condition, val1, val2)}
                              onToggleCheckbox={(val) => handleToggleUniqueValueCheckbox('Reference', val)}
                              onSelectAll={(sel) => handleSelectAllUniqueValues('Reference', sel)}
                              onClear={() => handleClearColumnFilter('Reference')}
                              onClose={() => setActiveFilterMenu(null)}
                              sortConfig={sortConfig}
                              onSortChange={(dir) => {
                                setSortConfig({ column: 'Reference', direction: dir });
                                setActiveFilterMenu(null);
                              }}
                            />
                          </div>
                        )}
                      </th>
                    )}

                    {/* All other horizontal scrolling header elements */}
                    {columns.map(col => {
                      if (col === 'Deal Num' || col === 'Reference') return null; // Already frozen left
                      if (!visibleColumns.has(col)) return null;

                      const isFiltered = !!columnFilters[col];
                      const isSorted = sortConfig.column === col;
                      const colIdx = columns.indexOf(col);
                      const isRightHalf = colIdx > columns.length / 2;

                      return (
                        <th key={col} className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-r border-slate-800/50 hover:bg-slate-850">
                          <div className="flex items-center justify-between gap-1 group relative">
                            <span className="truncate max-w-[150px]" title={col}>{col}</span>
                            
                            <div className="flex items-center gap-0.5">
                              {isSorted && (
                                <span className="text-indigo-400">
                                  {sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </span>
                              )}
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveFilterMenu(activeFilterMenu === col ? null : col);
                                }}
                                className={`p-1 rounded transition-colors ${isFiltered ? 'text-amber-500 bg-slate-800' : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'}`}
                              >
                                <Filter className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {activeFilterMenu === col && (
                              <div className={`absolute top-full mt-2.5 z-50 text-left normal-case ${isRightHalf ? 'right-0' : 'left-0'}`} ref={menuRef}>
                                <ColumnFilterPopover 
                                  columnName={col}
                                  filter={columnFilters[col] || { selectedValues: new Set(), condition: 'none', conditionValue1: '', conditionValue2: '' }}
                                  uniqueValues={uniqueValues[col] || []}
                                  filterSearchTerm={filterSearchTerms[col] || ''}
                                  setFilterSearchTerm={(val) => setFilterSearchTerms(prev => ({ ...prev, [col]: val }))}
                                  onApplyCondition={(condition, val1, val2) => handleApplyConditionFilter(col, condition, val1, val2)}
                                  onToggleCheckbox={(val) => handleToggleUniqueValueCheckbox(col, val)}
                                  onSelectAll={(sel) => handleSelectAllUniqueValues(col, sel)}
                                  onClear={() => handleClearColumnFilter(col)}
                                  onClose={() => setActiveFilterMenu(null)}
                                  sortConfig={sortConfig}
                                  onSortChange={(dir) => {
                                    setSortConfig({ column: col, direction: dir });
                                    setActiveFilterMenu(null);
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-850/80">
                  {paginatedRows.map((row, rIdx) => {
                    const globalIdx = (currentPage - 1) * pageSize + rIdx;
                    const isSelected = selectedRows.has(globalIdx);

                    return (
                      <tr 
                        key={rIdx} 
                        className={`hover:bg-slate-900/60 transition-colors ${isSelected ? 'bg-indigo-950/20 hover:bg-indigo-950/30 font-medium' : ''}`}
                      >
                        {/* Checkbox sticky pane */}
                        <td className="px-3 py-2 text-center sticky left-0 z-20 bg-slate-950 border-r border-slate-850/60 shadow-[1px_0_0_0_rgba(30,41,59,1)]">
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={(e) => handleSelectRow(globalIdx, e.target.checked)}
                            className="bg-slate-800 border-slate-700 text-indigo-500 rounded focus:ring-0 focus:ring-offset-0"
                          />
                        </td>

                        {/* Deal Num sticky pane */}
                        {visibleColumns.has('Deal Num') && (
                          <td className="px-4 py-2 font-mono text-slate-300 font-semibold sticky left-10 z-20 bg-slate-950 border-r border-slate-850/60 shadow-[1px_0_0_0_rgba(30,41,59,1)]">
                            {row['Deal Num']}
                          </td>
                        )}

                        {/* Reference sticky pane */}
                        {visibleColumns.has('Reference') && (
                          <td className="px-4 py-2 font-medium text-slate-400 sticky left-[168px] z-20 bg-slate-950 border-r border-slate-850/60 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.4)] truncate max-w-[150px]" title={row['Reference']}>
                            {row['Reference']}
                          </td>
                        )}

                        {/* Other scrollable items */}
                        {columns.map(col => {
                          if (col === 'Deal Num' || col === 'Reference') return null;
                          if (!visibleColumns.has(col)) return null;

                          const val = row[col];
                          const formatted = renderCellContent(col, val);

                          let highlightClass = "text-slate-300 font-mono";
                          if (numCols.includes(col)) {
                            const numeric = Number(String(val || '').replace(/[^0-9.-]/g, ''));
                            if (!isNaN(numeric)) {
                              if (col === 'Change_in_Total_PnL' && numeric !== 0) {
                                highlightClass = numeric > 0 ? "text-emerald-400 font-bold font-mono" : "text-rose-400 font-bold font-mono";
                              } else if (col === 'Base_Total_Value_USD') {
                                highlightClass = "text-slate-200 font-semibold font-mono";
                              } else {
                                highlightClass = "text-slate-300 font-mono";
                              }
                            }
                          } else if (col === 'Buy_Sell') {
                            highlightClass = val === 'BUY' ? "text-emerald-500/90 font-black" : "text-rose-500/90 font-black";
                          } else if (col === 'Tran_Status' || col === 'Price Status') {
                            highlightClass = "text-indigo-400 font-semibold";
                          }

                          return (
                            <td key={col} className={`px-4 py-2 border-r border-slate-900/60 truncate max-w-xs ${highlightClass}`}>
                              {formatted}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 4. Bottom aggregates and excel calculations footer status bar */}
      {filteredAndSortedRows.length > 0 && (
        <div className="bg-slate-950 px-4 py-2 border-t border-slate-800 flex flex-wrap justify-between items-center text-[10.5px] text-slate-400 font-mono gap-y-2 select-none shadow-[0_-4px_12px_rgba(0,0,0,0.2)]">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1">
              <Sigma className="w-3.5 h-3.5 text-slate-500" />
              Calculated on: <strong>{selectedRows.size > 0 ? `Selected Row subset (${selectedRows.size} lines)` : `All filtered matches (${stats.count} lines)`}</strong>
            </span>
          </div>
          
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 justify-end">
            <span>Base Value Sum: <strong className={stats.sumValue >= 0 ? "text-emerald-400" : "text-rose-400"}>${stats.sumValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
            <span>Average Value: <strong className="text-slate-300">${stats.avgValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
            <span>Change in PnL Sum: <strong className={stats.sumPnL >= 0 ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>${stats.sumPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
            <span>Avg PnL: <strong className="text-slate-300">${stats.avgPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
            <span>Total Volume Sum: <strong className="text-blue-400">{stats.sumVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} MT</strong></span>
            <span>Avg Price: <strong className="text-amber-400">${stats.avgPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
          </div>
        </div>
      )}

      {/* 5. Pagination Bar */}
      {filteredAndSortedRows.length > 0 && (
        <div className="p-3 border-t border-slate-800 bg-slate-900 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Grid rows to show:</span>
            <select 
              value={pageSize} 
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-slate-950 border border-slate-850 text-xs text-slate-300 rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500"
            >
              {[25, 55, 100, 250, 500, 1000].map(size => (
                <option key={size} value={size}>{size} rows</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => setCurrentPage(1)} 
              disabled={currentPage === 1}
              className="px-2.5 py-1 bg-slate-950 hover:bg-slate-850 disabled:opacity-40 text-[10px] uppercase font-bold tracking-tight text-slate-300 rounded border border-slate-850 transition-colors"
            >
              First
            </button>
            <button 
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} 
              disabled={currentPage === 1}
              className="px-2.5 py-1 bg-slate-950 hover:bg-slate-850 disabled:opacity-40 text-[10px] uppercase font-bold tracking-tight text-slate-300 rounded border border-slate-850 transition-colors"
            >
              Prev
            </button>
            <span className="text-xs text-slate-400 font-mono select-none px-2 font-medium">
              Page {currentPage} of {totalPages}
            </span>
            <button 
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} 
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 bg-slate-950 hover:bg-slate-850 disabled:opacity-40 text-[10px] uppercase font-bold tracking-tight text-slate-300 rounded border border-slate-850 transition-colors"
            >
              Next
            </button>
            <button 
              onClick={() => setCurrentPage(totalPages)} 
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 bg-slate-950 hover:bg-slate-850 disabled:opacity-40 text-[10px] uppercase font-bold tracking-tight text-slate-300 rounded border border-slate-850 transition-colors"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Subcomponent: Column Filter Popover containing condition and checklist
export interface ColumnFilterPopoverProps {
  columnName: string;
  filter: {
    selectedValues: Set<string>;
    condition: string;
    conditionValue1: string;
    conditionValue2: string;
  };
  uniqueValues: { value: string; count: number }[];
  filterSearchTerm: string;
  setFilterSearchTerm: (val: string) => void;
  onApplyCondition: (condition: string, val1: string, val2: string) => void;
  onToggleCheckbox: (val: string) => void;
  onSelectAll: (val: boolean) => void;
  onClear: () => void;
  onClose: () => void;
  sortConfig: { column: string; direction: 'asc' | 'desc' | null };
  onSortChange: (dir: 'asc' | 'desc' | null) => void;
}

export const ColumnFilterPopover: React.FC<ColumnFilterPopoverProps> = ({
  columnName,
  filter,
  uniqueValues,
  filterSearchTerm,
  setFilterSearchTerm,
  onApplyCondition,
  onToggleCheckbox,
  onSelectAll,
  onClear,
  onClose,
  sortConfig,
  onSortChange
}) => {
  const [cond, setCond] = useState(filter.condition);
  const [val1, setVal1] = useState(filter.conditionValue1);
  const [val2, setVal2] = useState(filter.conditionValue2);

  const numericColumns = ['Price', 'Strike', 'Base_Total_Value_USD', 'Change_in_Total_PnL', 'Volume'];
  const isNumeric = numericColumns.includes(columnName);

  const searchFilteredUniqueValues = useMemo(() => {
    const term = filterSearchTerm.trim().toLowerCase();
    if (!term) return uniqueValues;
    return uniqueValues.filter(v => String(v.value).toLowerCase().includes(term));
  }, [uniqueValues, filterSearchTerm]);

  return (
    <div className="w-72 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-4 flex flex-col gap-3 font-sans relative">
      
      {/* Tab Header Sorting */}
      <div>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2 font-mono">Sort Configuration</span>
        <div className="flex gap-2">
          <button 
            type="button"
            onClick={() => onSortChange('asc')}
            className={`flex-1 py-1 px-2 text-[11px] font-semibold border rounded-lg flex items-center justify-center gap-1.5 transition-colors ${sortConfig.column === columnName && sortConfig.direction === 'asc' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-850'}`}
          >
            <ChevronUp className="w-3.5 h-3.5 text-indigo-400" />
            Sort A-Z (Asc)
          </button>
          <button 
            type="button"
            onClick={() => onSortChange('desc')}
            className={`flex-1 py-1 px-2 text-[11px] font-semibold border rounded-lg flex items-center justify-center gap-1.5 transition-colors ${sortConfig.column === columnName && sortConfig.direction === 'desc' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-850'}`}
          >
            <ChevronDown className="w-3.5 h-3.5 text-rose-400" />
            Sort Z-A (Desc)
          </button>
        </div>
      </div>

      <div className="h-px bg-slate-800" />

      {/* Operator Conditional Filter */}
      <div>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 font-mono">Conditional Rule</span>
        <div className="flex flex-col gap-2">
          <select 
            value={cond}
            onChange={(e) => {
              setCond(e.target.value);
              if (e.target.value === 'none' || e.target.value === 'empty' || e.target.value === 'notEmpty') {
                onApplyCondition(e.target.value, '', '');
              }
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 px-2 py-1.5 focus:outline-none focus:border-indigo-500"
          >
            <option value="none">No conditional filter</option>
            <option value="equals">Equals</option>
            <option value="notEquals">Does Not Equal</option>
            <option value="contains">Contains text</option>
            <option value="notContains">Does not contain text</option>
            <option value="starts">Starts with</option>
            <option value="ends">Ends with</option>
            <option value="empty">Is Empty</option>
            <option value="notEmpty">Is Not Empty</option>
            {isNumeric && (
              <>
                <option value="gt">Greater than (&gt;)</option>
                <option value="lt">Less than (&lt;)</option>
                <option value="between">Value is between</option>
              </>
            )}
          </select>

          {cond !== 'none' && cond !== 'empty' && cond !== 'notEmpty' && (
            <div className="flex flex-col gap-1.5">
              <input 
                type="text"
                placeholder={cond === 'between' ? "Minimum value" : "Filter rule matching value..."}
                value={val1}
                onChange={(e) => setVal1(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 px-2 py-1 focus:outline-none focus:border-indigo-500"
              />
              {cond === 'between' && (
                <input 
                  type="text"
                  placeholder="Maximum value"
                  value={val2}
                  onChange={(e) => setVal2(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 px-2 py-1 focus:outline-none focus:border-indigo-500"
                />
              )}
              <button 
                type="button"
                onClick={() => onApplyCondition(cond, val1, val2)}
                className="w-full py-1 bg-indigo-600/90 hover:bg-indigo-600 text-[11px] text-white font-bold rounded-lg transition-colors"
              >
                Apply Conditional Rule
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="h-px bg-slate-800" />

      {/* Select unique value checklist */}
      <div className="flex-1 flex flex-col min-h-0">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 font-mono">Filter by Value ({uniqueValues.length})</span>
        
        {/* Checklist search box */}
        <div className="relative mb-2">
          <input 
            type="text"
            placeholder="Search within unique items..."
            value={filterSearchTerm}
            onChange={(e) => setFilterSearchTerm(e.target.value)}
            className="w-full bg-slate-950 pl-7 pr-7 py-1 border border-slate-850 rounded-md text-[11px] text-slate-300 placeholder-slate-600 focus:outline-none"
          />
          <Search className="absolute left-2.5 top-2 h-3 w-3 text-slate-600" />
          {filterSearchTerm && (
            <button 
              type="button"
              onClick={() => setFilterSearchTerm('')}
              className="absolute right-2 top-1.5 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Global Select/Deselect buttons */}
        <div className="flex gap-2 mb-2">
          <button 
            type="button" 
            onClick={() => onSelectAll(true)}
            className="text-[10px] px-2 py-0.5 bg-slate-950 hover:bg-slate-850 border border-slate-800/80 rounded text-slate-400 font-semibold flex-1"
          >
            Clear (Deselect All)
          </button>
          <button 
            type="button"
            onClick={() => onSelectAll(false)}
            className="text-[10px] px-2 py-0.5 bg-slate-950 hover:bg-slate-850 border border-slate-800/80 rounded text-indigo-400 font-semibold flex-1"
          >
            Select Current
          </button>
        </div>

        {/* List scroll panel */}
        <div className="max-h-36 overflow-y-auto custom-scrollbar flex flex-col gap-1 border border-slate-950 p-1.5 bg-slate-950 rounded-lg">
          {searchFilteredUniqueValues.slice(0, 80).map((uv, index) => {
            const rowValueStr = String(uv.value);
            const isChecked = filter.selectedValues.has(rowValueStr);

            return (
              <label 
                key={index} 
                className={`flex items-center gap-1.5 px-1.5 py-0.5 hover:bg-slate-900 rounded cursor-pointer select-none text-[11px] truncate ${isChecked ? 'text-indigo-400 font-semibold' : 'text-slate-300'}`}
              >
                <input 
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggleCheckbox(rowValueStr)}
                  className="bg-slate-850 border-slate-750 text-indigo-600 rounded focus:ring-0 focus:ring-offset-0 w-3 h-3"
                />
                <span className="truncate flex-1" title={rowValueStr || '(Blank)'}>
                  {rowValueStr === '' ? <span className="text-slate-600 italic">(Blank)</span> : rowValueStr}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">({uv.count})</span>
              </label>
            );
          })}
          {searchFilteredUniqueValues.length > 80 && (
            <span className="text-[10px] text-slate-500 text-center italic py-1 border-t border-slate-900 mt-1">
              +{searchFilteredUniqueValues.length - 80} more unique values
            </span>
          )}
          {searchFilteredUniqueValues.length === 0 && (
            <span className="text-[11px] text-slate-600 text-center py-4">No unique matches</span>
          )}
        </div>
      </div>

      <div className="h-px bg-slate-800" />

      {/* Row with footer action controls */}
      <div className="flex justify-between gap-2">
        <button 
          type="button"
          onClick={onClear}
          className="text-[11px] py-1 px-2.5 bg-slate-950 hover:bg-rose-950/20 border border-slate-850 text-slate-400 hover:text-rose-400 hover:border-rose-900/40 rounded-lg transition-colors font-semibold"
        >
          Reset Filter
        </button>
        <button 
          type="button"
          onClick={onClose}
          className="text-[11px] py-1 px-3.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-white rounded-lg transition-colors font-bold"
        >
          Close
        </button>
      </div>

    </div>
  );
};

// Generic fallback DatabaseIcon to prevent compile issues
const DatabaseIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
  </svg>
);
