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
import { ExecutiveDashboard } from './ExecutiveDashboard';
import { computeTrmsSummaryRows, TrmsStrategySummary, normalizeStrategyKey, parseFlexibleDate, isUnallocatedBuyer } from '../utils/trmsEngine';
import { getGroupName, GROUPS, saveForwardCurve, ForwardCurveRow, formatCurrency } from '../services/calculationService';

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
        buyer: string;
        seller: string;
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
        hedgingPnL?: number;
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
        buyer: string;
        seller: string;
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
        hedgingPnL?: number;
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
        buyer: boolean;
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

type TRMSTab = 'reconcile' | 'executive' | 'summary' | 'quality';

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

function parseMonthOrDate(val: any): { year: string; monthName: string; rawVal: string } | null {
  if (val === null || val === undefined || val === '' || val === '—' || val === '-') return null;
  const str = String(val).trim();

  const monthAbbrs: Record<string, string> = {
    jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June',
    jul: 'July', aug: 'August', sep: 'September', oct: 'October', nov: 'November', dec: 'December'
  };

  const m1 = str.match(/^([a-zA-Z]{3,9})[-_\s]?(\d{2,4})$/);
  if (m1) {
    const mStr = m1[1].substring(0, 3).toLowerCase();
    let yStr = m1[2];
    if (yStr.length === 2) yStr = '20' + yStr;
    if (monthAbbrs[mStr]) {
      return {
        year: yStr,
        monthName: monthAbbrs[mStr],
        rawVal: str
      };
    }
  }

  const m2 = str.match(/^(\d{4})[-_](\d{1,2})$/);
  if (m2) {
    const yStr = m2[1];
    const monthIdx = parseInt(m2[2], 10) - 1;
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    if (monthIdx >= 0 && monthIdx < 12) {
      return {
        year: yStr,
        monthName: monthNames[monthIdx],
        rawVal: str
      };
    }
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return {
      year: d.getUTCFullYear().toString(),
      monthName: monthNames[d.getUTCMonth()],
      rawVal: str
    };
  }

  return null;
}

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
  const [reconFilterSource, setReconFilterSource] = useState<'both' | 'app' | 'trms'>('both');
  const [selectedEodDate, setSelectedEodDate] = useState<string>('all');
  const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set(['all']));
  const [showYearFilterMenu, setShowYearFilterMenu] = useState(false);

  // Pagination State for App vs TRMS Reconciliation Table
  const [reconPageSize, setReconPageSize] = useState<number>(50);
  const [reconCurrentPage, setReconCurrentPage] = useState<number>(1);

  // Report Customization State
  const [reportSelectedSNs, setReportSelectedSNs] = useState<Set<string>>(new Set());
  const [reportSnSearch, setReportSnSearch] = useState('');
  const [reportShowCustomizer, setReportShowCustomizer] = useState(true);
  
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
    'Buyer': 180,
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
    const parsed = parseFlexibleDate(dateStr);
    if (!parsed) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parsed.month]}-${String(parsed.year).slice(-2)}`;
  };

  const trmsEngineResult = useMemo(() => {
    return computeTrmsSummaryRows(trmsData.extractedRows || [], selectedEodDate, selectedYears);
  }, [trmsData.extractedRows, selectedEodDate, selectedYears]);

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

    profiles.forEach((p: any) => {
      const match = p.strategyName?.match(/\b(20\d\d)\b/);
      if (match) years.add(match[1]);
      if (p.deliveryDate || p.loadingDate) {
        const yr = new Date(p.deliveryDate || p.loadingDate).getFullYear();
        if (yr && !isNaN(yr)) years.add(String(yr));
      }
      if (p.deliveryMonth) {
        const matchM = p.deliveryMonth.match(/\b(20\d\d)\b/);
        if (matchM) years.add(matchM[1]);
      }
    });

    return {
      eodDates: Array.from(eodDates).sort(),
      years: Array.from(years).sort()
    };
  }, [trmsData.extractedRows, profiles]);

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
        const hasBuyData = (app.loadedVolume && app.loadedVolume > 0) || (app.absoluteBuyPrice && app.absoluteBuyPrice > 0) || (app.buyFormula && app.buyFormula.trim() !== '');
        const hasSellData = (app.deliveredVolume && app.deliveredVolume > 0) || (app.absoluteSellPrice && app.absoluteSellPrice > 0) || (app.sellFormula && app.sellFormula.trim() !== '');

        const hasBuy = hasBuyData && !isUnallocatedBuyer(app.source);
        const hasSell = hasSellData && !isUnallocatedBuyer(app.buyer);

        if (hasBuy && hasSell) appUnallocatedCargo = 'Matched';
        else if (hasBuy && !hasSell) appUnallocatedCargo = 'Open on Sell Leg';
        else if (!hasBuy && hasSell) appUnallocatedCargo = 'Open on Buy Leg';
        else if (hasBuyData && !hasSellData) appUnallocatedCargo = 'Open on Sell Leg';
        else if (!hasBuyData && hasSellData) appUnallocatedCargo = 'Open on Buy Leg';
        else appUnallocatedCargo = '—';
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
      const appBuyer = app?.buyer && app.buyer.trim() !== '' ? app.buyer.trim() : 'Spot';
      const appSeller = app?.source && app.source.trim() !== '' ? app.source.trim() : 'Spot';

      // TRMS Values
      const trmsPnlBucket = trms?.physicalPnLStatus || '—';
      const trmsOptimization = trms?.optimisationStatus || '—';
      const trmsUnallocatedCargo = trms?.unallocatedCargo || '—';
      const trmsBuyer = trms?.buyer && trms.buyer.trim() !== '' ? trms.buyer.trim() : 'Spot';
      const trmsSeller = trms?.seller && trms.seller.trim() !== '' ? trms.seller.trim() : 'Spot';

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
        const calcVolPctDiff = (v1: number, v2: number) => {
          const diff = Math.abs(v1 - v2);
          if (diff <= 0.1) return 0;
          const maxVal = Math.max(Math.abs(v1), Math.abs(v2));
          return maxVal > 0 ? (diff / maxVal) * 100 : 0;
        };

        if (calcVolPctDiff(appBuyVolTotal, trmsBuyVolTotal) >= 5) {
          discrepancies.add('Buy Vol');
        }
        if (calcVolPctDiff(appSellVolTotal, trmsSellVolTotal) >= 5) {
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
          buyer: appBuyer,
          seller: appSeller,
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
          hedgingPnL: 0,
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
          buyer: trmsBuyer,
          seller: trmsSeller,
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
          hedgingPnL: trmsData.trmsAgg[strategyName]?.hedgingPnL || 0,
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
          buyer: false,
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
  }, [profiles, trmsEngineResult, trmsData.trmsAgg]);

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
        if (reconFilterSource === 'app') {
          if (row.app.pnlBucket !== reconPnlBucketFilter) return false;
        } else if (reconFilterSource === 'trms') {
          if (row.trms.pnlBucket !== reconPnlBucketFilter) return false;
        } else {
          if (row.app.pnlBucket !== reconPnlBucketFilter && row.trms.pnlBucket !== reconPnlBucketFilter) return false;
        }
      }

      if (reconOptimizationFilter !== 'all') {
        if (reconFilterSource === 'app') {
          if (row.app.optimization !== reconOptimizationFilter) return false;
        } else if (reconFilterSource === 'trms') {
          if (row.trms.optimization !== reconOptimizationFilter) return false;
        } else {
          if (row.app.optimization !== reconOptimizationFilter && row.trms.optimization !== reconOptimizationFilter) return false;
        }
      }

      if (reconUnallocatedFilter !== 'all') {
        if (reconFilterSource === 'app') {
          if (row.app.unallocatedCargo !== reconUnallocatedFilter) return false;
        } else if (reconFilterSource === 'trms') {
          if (row.trms.unallocatedCargo !== reconUnallocatedFilter) return false;
        } else {
          if (row.app.unallocatedCargo !== reconUnallocatedFilter && row.trms.unallocatedCargo !== reconUnallocatedFilter) return false;
        }
      }

      if (selectedYears.size > 0 && !selectedYears.has('all')) {
        const yearsArr = Array.from(selectedYears);
        const trmsMatch = row.trms && (
          yearsArr.some(yr => row.strategyName.includes(yr)) ||
          (row.trms.rawRows && row.trms.rawRows.some((r: any) => {
            const rowYr = String(r['Plsb Year Bucket'] || r['Plsb_Year_Bucket'] || r['PLSB Year'] || r['Year'] || '').trim();
            return yearsArr.some(yr => rowYr.includes(yr));
          }))
        );
        const appMatch = row.app && (
          yearsArr.some(yr => row.strategyName.includes(yr)) ||
          (row.app.deliveryDate && yearsArr.includes(String(new Date(row.app.deliveryDate).getFullYear()))) ||
          (row.app.loadingDate && yearsArr.includes(String(new Date(row.app.loadingDate).getFullYear()))) ||
          yearsArr.some(yr => String(row.app.deliveryMonth || '').includes(yr)) ||
          yearsArr.some(yr => String(row.app.loadingMonth || '').includes(yr))
        );

        if (!trmsMatch && !appMatch) return false;
      }

      return true;
    });
  }, [reconciliationData, searchTerm, reconStatusFilter, reconGroupFilter, reconPnlBucketFilter, reconOptimizationFilter, reconUnallocatedFilter, reconFilterSource, selectedYears]);

  const currentRawData = useMemo(() => {
    if (activeTab === 'reconcile') return filteredReconciliationData;
    return [];
  }, [activeTab, filteredReconciliationData]);

  const headers = useMemo(() => {
    if (activeTab === 'reconcile') {
        return [
            'Strategy Name',
            'Buyer',
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

  const getReconcileRowValues = (row: ReconciliationRow, header: string, source: 'both' | 'app' | 'trms'): any[] => {
    const vals: any[] = [];
    const addVal = (v: any) => {
      if (v !== undefined && v !== null && v !== '' && v !== '—' && v !== '-') {
        vals.push(v);
      }
    };

    if (header === 'Strategy Name') {
      addVal(row.strategyName);
      return vals;
    }

    if (source === 'app' || source === 'both') {
      if (header === 'Buyer') addVal(row.app.buyer);
      else if (header === 'P&L Bucket') addVal(row.app.pnlBucket);
      else if (header === 'Optimization') addVal(row.app.optimization);
      else if (header === 'Unallocated Cargo') addVal(row.app.unallocatedCargo);
      else if (header === 'Purchase Volume') addVal(row.app.buyVolTotal);
      else if (header === 'Sales Volume') addVal(row.app.sellVolTotal);
      else if (header === 'Purchase Price') addVal(row.app.buyPriceEffective);
      else if (header === 'Sales Price') addVal(row.app.sellPriceEffective);
      else if (header === 'SRC Costs') addVal(row.app.src);
      else if (header === 'Loading Month') {
        if (row.app.loadingMonth && row.app.loadingMonth !== '—') addVal(row.app.loadingMonth);
        else if (row.app.loadingDate) addVal(row.app.loadingDate);
      }
      else if (header === 'Delivery Month') {
        if (row.app.deliveryMonth && row.app.deliveryMonth !== '—') addVal(row.app.deliveryMonth);
        else if (row.app.deliveryDate) addVal(row.app.deliveryDate);
      }
    }

    if (source === 'trms' || source === 'both') {
      if (header === 'Buyer') addVal(row.trms.buyer);
      else if (header === 'P&L Bucket') addVal(row.trms.pnlBucket);
      else if (header === 'Optimization') addVal(row.trms.optimization);
      else if (header === 'Unallocated Cargo') addVal(row.trms.unallocatedCargo);
      else if (header === 'Purchase Volume') addVal(row.trms.buyVolTotal);
      else if (header === 'Sales Volume') addVal(row.trms.sellVolTotal);
      else if (header === 'Purchase Price') addVal(row.trms.buyPriceEffective);
      else if (header === 'Sales Price') addVal(row.trms.sellPriceEffective);
      else if (header === 'SRC Costs') addVal(row.trms.src);
      else if (header === 'Loading Month') {
        if (row.trms.loadingMonth && row.trms.loadingMonth !== '—') addVal(row.trms.loadingMonth);
        else if (row.trms.loadingDate) addVal(row.trms.loadingDate);
      }
      else if (header === 'Delivery Month') {
        if (row.trms.deliveryMonth && row.trms.deliveryMonth !== '—') addVal(row.trms.deliveryMonth);
        else if (row.trms.deliveryDate) addVal(row.trms.deliveryDate);
      }
    }

    return Array.from(new Set(vals));
  };

  const filterData = useMemo(() => {
    const values: Record<string, any[]> = {};
    const strategyHierarchies: Record<string, StrategyHierarchy> = {};
    const dateHierarchies: Record<string, DateHierarchy> = {};

    headers.forEach(header => {
      const isStrategy = header === 'Strategy Name';
      const isDateOrMonth = header.toLowerCase().includes('date') || header.toLowerCase().includes('month');

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
      } else if (isDateOrMonth) {
          const hierarchy: DateHierarchy = {};
          currentRawData.forEach((r: any) => {
              let rawVals: any[] = [];
              if (activeTab === 'reconcile') {
                  rawVals = getReconcileRowValues(r as ReconciliationRow, header, reconFilterSource);
              } else {
                  if (r[header]) rawVals = [r[header]];
              }

              rawVals.forEach(val => {
                  const parsed = parseMonthOrDate(val);
                  if (!parsed) return;
                  const { year, monthName, rawVal } = parsed;
                  if (!hierarchy[year]) hierarchy[year] = {};
                  if (!hierarchy[year][monthName]) hierarchy[year][monthName] = [];
                  if (!hierarchy[year][monthName].includes(rawVal)) {
                      hierarchy[year][monthName].push(rawVal);
                  }
              });
          });
          
          // Sort years descending, months by calendar order, values ascending
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
          const uniqueSet = new Set<any>();
          currentRawData.forEach((r: any) => {
              if (activeTab === 'reconcile') {
                  const vals = getReconcileRowValues(r as ReconciliationRow, header, reconFilterSource);
                  vals.forEach(v => uniqueSet.add(v));
              } else {
                  if (r[header] !== undefined && r[header] !== null && r[header] !== '') {
                      uniqueSet.add(r[header]);
                  }
              }
          });
          values[header] = Array.from(uniqueSet).sort();
      }
    });
    return { values, strategyHierarchies, dateHierarchies };
  }, [headers, activeTab, currentRawData, reconFilterSource]);

  const processedData = useMemo(() => {
    let result = [...currentRawData];
    if (debouncedSearch) {
      const lower = debouncedSearch.toLowerCase();
      result = result.filter(row => {
        if (activeTab === 'reconcile') {
          const r = row as ReconciliationRow;
          return r.strategyName.toLowerCase().includes(lower) || 
                 (r.app.buyer && r.app.buyer.toLowerCase().includes(lower)) ||
                 (r.trms.buyer && r.trms.buyer.toLowerCase().includes(lower)) ||
                 (r.app.loadingMonth && r.app.loadingMonth.toLowerCase().includes(lower)) ||
                 (r.trms.loadingMonth && r.trms.loadingMonth.toLowerCase().includes(lower));
        }
        return Object.values(row).some(v => String(v).toLowerCase().includes(lower));
      });
    }
    Object.entries(activeFilters).forEach(([header, selectedValues]) => {
      const vals = selectedValues as Set<any>;
      if (vals.size > 0) {
        result = result.filter(row => {
          if (activeTab === 'reconcile') {
            const rowVals = getReconcileRowValues(row as ReconciliationRow, header, reconFilterSource);
            return rowVals.some(v => vals.has(v));
          } else {
            return vals.has((row as any)[header]);
          }
        });
      }
    });
    if (sortConfig.key) {
      const { key, direction } = sortConfig;
      result.sort((a, b) => {
        let aVal: any, bVal: any;
        if (activeTab === 'reconcile') {
          const ar = a as ReconciliationRow, br = b as ReconciliationRow;
          const aVals = getReconcileRowValues(ar, key, reconFilterSource);
          const bVals = getReconcileRowValues(br, key, reconFilterSource);
          aVal = aVals.length > 0 ? aVals[0] : null;
          bVal = bVals.length > 0 ? bVals[0] : null;
        } else { aVal = (a as any)[key!]; bVal = (b as any)[key!]; }
        if (aVal === bVal) return 0; if (aVal == null) return 1; if (bVal == null) return -1;
        return direction === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal > bVal ? -1 : 1);
      });
    }
    return result;
  }, [currentRawData, debouncedSearch, activeFilters, sortConfig, activeTab, reconFilterSource]);

  // Reset pagination page when filters or search or tab change
  useEffect(() => {
    setReconCurrentPage(1);
  }, [searchTerm, debouncedSearch, reconStatusFilter, reconGroupFilter, reconPnlBucketFilter, reconOptimizationFilter, reconUnallocatedFilter, reconFilterSource, selectedYears, activeFilters, activeTab, reconPageSize]);

  const totalReconPages = useMemo(() => {
    if (reconPageSize === 0) return 1;
    return Math.max(1, Math.ceil(processedData.length / reconPageSize));
  }, [processedData.length, reconPageSize]);

  const paginatedReconData = useMemo(() => {
    if (reconPageSize === 0) return processedData;
    const start = (reconCurrentPage - 1) * reconPageSize;
    return processedData.slice(start, start + reconPageSize);
  }, [processedData, reconCurrentPage, reconPageSize]);

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

  const toggleYearFilter = (yr: string) => {
    setSelectedYears(prev => {
      const next = new Set(prev);
      if (yr === 'all') {
        return new Set(['all']);
      }
      next.delete('all');
      if (next.has(yr)) {
        next.delete(yr);
        if (next.size === 0) next.add('all');
      } else {
        next.add(yr);
      }
      return next;
    });
  };

  const handleRowEdit = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (profile && onEditProfile) {
        onEditProfile(profile);
    }
  };

  const customizedReportData = useMemo(() => {
    if (reportSelectedSNs.size === 0) return processedData;
    return processedData.filter((row: any) => {
      const sn = activeTab === 'reconcile' ? row.strategyName : row['Strategy Name'];
      return reportSelectedSNs.has(sn);
    });
  }, [processedData, reportSelectedSNs, activeTab]);

  const handleDownloadReport = () => {
    if (processedData.length === 0) {
      toast.error("No data available to download.");
      return;
    }
    const allSNs = new Set<string>();
    processedData.forEach((row: any) => {
      const sn = activeTab === 'reconcile' ? row.strategyName : row['Strategy Name'];
      if (sn) allSNs.add(sn);
    });
    setReportSelectedSNs(allSNs);
    setShowReportPreview(true);
  };

  const generateReportHTML = () => {
    const dataToRender = customizedReportData;
    const tableHeaders = headers.map(h => `<th style="border: 1px solid #e2e8f0; padding: 12px 14px; background: #f8fafc; font-size: 10px; text-transform: uppercase; font-family: sans-serif; color: #475569; font-weight: 800; letter-spacing: 0.5px; text-align: left;">${h}</th>`).join('');
    
    const tableRows = dataToRender.map((row: any) => {
        if (activeTab === 'reconcile') {
            const r = row as ReconciliationRow;

            const pnlMismatch = r.foundInApp && r.foundInTrms && r.diffs.pnlBucket;
            const optMismatch = r.foundInApp && r.foundInTrms && r.diffs.optimization;
            const unallocMismatch = r.foundInApp && r.foundInTrms && r.diffs.unallocatedCargo;

            const buyVolDiff = Math.abs(r.app.buyVolTotal - r.trms.buyVolTotal);
            const buyVolMax = Math.max(Math.abs(r.app.buyVolTotal), Math.abs(r.trms.buyVolTotal));
            const buyVolPct = buyVolMax > 0 ? (buyVolDiff / buyVolMax) * 100 : 0;
            const buyVolBg = buyVolDiff <= 0.1 ? 'transparent' : buyVolPct > 5 ? '#fef2f2' : '#fffbeb';

            const sellVolDiff = Math.abs(r.app.sellVolTotal - r.trms.sellVolTotal);
            const sellVolMax = Math.max(Math.abs(r.app.sellVolTotal), Math.abs(r.trms.sellVolTotal));
            const sellVolPct = sellVolMax > 0 ? (sellVolDiff / sellVolMax) * 100 : 0;
            const sellVolBg = sellVolDiff <= 0.1 ? 'transparent' : sellVolPct > 5 ? '#fef2f2' : '#fffbeb';

            const buyPriceMismatch = r.foundInApp && r.foundInTrms && Math.abs(r.diffs.buyPrice) > 0.01;
            const sellPriceMismatch = r.foundInApp && r.foundInTrms && Math.abs(r.diffs.sellPrice) > 0.01;
            const srcMismatch = r.foundInApp && r.foundInTrms && Math.abs(r.diffs.src) > 1.0;
            const loadingMonthMismatch = r.foundInApp && r.foundInTrms && r.diffs.loadingMonth;
            const deliveryMonthMismatch = r.foundInApp && r.foundInTrms && r.diffs.deliveryMonth;

            const getStatusBadge = () => {
              if (r.status === 'Matched') {
                return `<span style="background: #dcfce7; color: #15803d; font-size: 8px; font-weight: 900; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">Matched</span>`;
              } else if (r.status === 'App Only') {
                return `<span style="background: #fef3c7; color: #92400e; font-size: 8px; font-weight: 900; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">App Only</span>`;
              } else {
                return `<span style="background: #f3e8ff; color: #6b21a8; font-size: 8px; font-weight: 900; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">TRMS Only</span>`;
              }
            };

            return `
                <tr style="font-family: monospace; background: ${!r.foundInTrms ? '#fffbeb' : !r.foundInApp ? '#faf5ff' : 'white'};">
                    <td style="border: 1px solid #e2e8f0; padding: 10px 12px; font-size: 11px; font-weight: bold; color: #1e293b;">
                        <div>${r.strategyName}</div>
                        <div style="font-size: 9px; color: #64748b; font-weight: normal; margin-top: 2px;">${r.group || '-'}</div>
                        <div style="margin-top: 6px; display: flex; gap: 4px; align-items: center;">
                            ${getStatusBadge()}
                            ${r.discrepancies.size > 0 && r.status === 'Matched' ? `<span style="background: #ffe4e6; color: #be123c; font-size: 8px; font-weight: 900; padding: 2px 6px; border-radius: 4px;">${r.discrepancies.size} DIFF</span>` : ''}
                        </div>
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 10px 12px; font-size: 10px; background: transparent;">
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">App: <span style="color: #1e293b; font-weight: 800;">${r.app.buyer}</span></div>
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase; margin-top: 4px;">TRMS: <span style="color: #475569; font-weight: 800;">${r.trms.buyer}</span></div>
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 10px 12px; font-size: 10px; background: ${pnlMismatch ? '#fef2f2' : 'transparent'};">
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">App: <span style="color: #1e293b; font-weight: 800;">${r.app.pnlBucket}</span></div>
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase; margin-top: 4px;">TRMS: <span style="color: ${pnlMismatch ? '#ef4444' : '#475569'}; font-weight: 800;">${r.trms.pnlBucket}</span></div>
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 10px 12px; font-size: 10px; background: ${optMismatch ? '#fef2f2' : 'transparent'};">
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">App: <span style="color: #1e293b; font-weight: 800;">${r.app.optimization}</span></div>
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase; margin-top: 4px;">TRMS: <span style="color: ${optMismatch ? '#ef4444' : '#475569'}; font-weight: 800;">${r.trms.optimization}</span></div>
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 10px 12px; font-size: 10px; background: ${unallocMismatch ? '#fef2f2' : 'transparent'};">
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">App: <span style="color: #1e293b; font-weight: 800;">${r.app.unallocatedCargo}</span></div>
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase; margin-top: 4px;">TRMS: <span style="color: ${unallocMismatch ? '#ef4444' : '#475569'}; font-weight: 800;">${r.trms.unallocatedCargo}</span></div>
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 10px 12px; font-size: 10px; background: ${buyVolBg};">
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">App: <span style="color: #1e293b; font-weight: 800;">${r.app.buyVolTotal.toLocaleString()}</span></div>
                        ${r.app.isTiered ? `<div style="font-size: 8px; color: #6366f1;">T1:${r.app.buyVolT1.toLocaleString()} | T2:${r.app.buyVolT2.toLocaleString()}</div>` : ''}
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase; margin-top: 4px;">TRMS: <span style="color: ${buyVolPct > 5 ? '#ef4444' : buyVolPct > 0.1 ? '#d97706' : '#475569'}; font-weight: 800;">${r.trms.buyVolTotal.toLocaleString()}</span></div>
                        ${r.trms.buyVolT2 > 0 ? `<div style="font-size: 8px; color: #8b5cf6;">T1:${r.trms.buyVolT1.toLocaleString()} | T2:${r.trms.buyVolT2.toLocaleString()}</div>` : ''}
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 10px 12px; font-size: 10px; background: ${sellVolBg};">
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">App: <span style="color: #1e293b; font-weight: 800;">${r.app.sellVolTotal.toLocaleString()}</span></div>
                        ${r.app.isTiered ? `<div style="font-size: 8px; color: #6366f1;">T1:${r.app.sellVolT1.toLocaleString()} | T2:${r.app.sellVolT2.toLocaleString()}</div>` : ''}
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase; margin-top: 4px;">TRMS: <span style="color: ${sellVolPct > 5 ? '#ef4444' : sellVolPct > 0.1 ? '#d97706' : '#475569'}; font-weight: 800;">${r.trms.sellVolTotal.toLocaleString()}</span></div>
                        ${r.trms.sellVolT2 > 0 ? `<div style="font-size: 8px; color: #8b5cf6;">T1:${r.trms.sellVolT1.toLocaleString()} | T2:${r.trms.sellVolT2.toLocaleString()}</div>` : ''}
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 10px 12px; font-size: 10px; background: ${buyPriceMismatch ? '#fef2f2' : 'transparent'};">
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">App: <span style="color: #1e293b; font-weight: 800;">$${r.app.buyPriceEffective.toFixed(3)}</span></div>
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase; margin-top: 4px;">TRMS: <span style="color: ${buyPriceMismatch ? '#ef4444' : '#475569'}; font-weight: 800;">$${r.trms.buyPriceEffective.toFixed(3)}</span></div>
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 10px 12px; font-size: 10px; background: ${sellPriceMismatch ? '#fef2f2' : 'transparent'};">
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">App: <span style="color: #1e293b; font-weight: 800;">$${r.app.sellPriceEffective.toFixed(3)}</span></div>
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase; margin-top: 4px;">TRMS: <span style="color: ${sellPriceMismatch ? '#ef4444' : '#475569'}; font-weight: 800;">$${r.trms.sellPriceEffective.toFixed(3)}</span></div>
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 10px 12px; font-size: 10px; background: ${srcMismatch ? '#fef2f2' : 'transparent'};">
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">App: <span style="color: #1e293b; font-weight: 800;">${formatUSD(r.app.src)}</span></div>
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase; margin-top: 4px;">TRMS: <span style="color: ${srcMismatch ? '#ef4444' : '#475569'}; font-weight: 800;">${formatUSD(r.trms.src)}</span></div>
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 10px 12px; font-size: 10px; background: ${loadingMonthMismatch ? '#fef2f2' : 'transparent'};">
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">App: <span style="color: #1e293b; font-weight: 800;">${r.app.loadingMonth}</span></div>
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase; margin-top: 4px;">TRMS: <span style="color: ${loadingMonthMismatch ? '#ef4444' : '#475569'}; font-weight: 800;">${r.trms.loadingMonth}</span></div>
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 10px 12px; font-size: 10px; background: ${deliveryMonthMismatch ? '#fef2f2' : 'transparent'};">
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase;">App: <span style="color: #1e293b; font-weight: 800;">${r.app.deliveryMonth}</span></div>
                        <div style="color: #64748b; font-size: 8px; font-weight: bold; text-transform: uppercase; margin-top: 4px;">TRMS: <span style="color: ${deliveryMonthMismatch ? '#ef4444' : '#475569'}; font-weight: 800;">${r.trms.deliveryMonth}</span></div>
                    </td>
                </tr>
            `;
        }
        return '';
    }).join('');

    const totalStrategies = dataToRender.length;
    const matchedStrategies = dataToRender.filter((r: any) => r.status === 'Matched').length;
    const appOnlyStrategies = dataToRender.filter((r: any) => r.status === 'App Only').length;
    const trmsOnlyStrategies = dataToRender.filter((r: any) => r.status === 'TRMS Only').length;

    const discrepancyStrategies = dataToRender.filter((r: any) => r.discrepancies && r.discrepancies.size > 0).length;
    const totalDiscrepancyPoints = dataToRender.reduce((acc: number, r: any) => acc + (r.discrepancies ? r.discrepancies.size : 0), 0);

    const appBuyVol = dataToRender.reduce((acc: number, r: any) => acc + (r.app?.buyVolTotal || 0), 0);
    const trmsBuyVol = dataToRender.reduce((acc: number, r: any) => acc + (r.trms?.buyVolTotal || 0), 0);
    const buyVolDiff = appBuyVol - trmsBuyVol;

    const appSellVol = dataToRender.reduce((acc: number, r: any) => acc + (r.app?.sellVolTotal || 0), 0);
    const trmsSellVol = dataToRender.reduce((acc: number, r: any) => acc + (r.trms?.sellVolTotal || 0), 0);
    const sellVolDiff = appSellVol - trmsSellVol;

    const calcVolPctDiff = (v1: number, v2: number) => {
      const diff = Math.abs(v1 - v2);
      if (diff <= 0.1) return 0;
      const maxVal = Math.max(Math.abs(v1), Math.abs(v2));
      return maxVal > 0 ? (diff / maxVal) * 100 : 0;
    };

    const matchedRows = processedData.filter((r: any) => r.foundInApp && r.foundInTrms);
    const fieldDiffs = {
      pnlBucket: matchedRows.filter((r: any) => r.diffs?.pnlBucket).length,
      optimization: matchedRows.filter((r: any) => r.diffs?.optimization).length,
      unallocatedCargo: matchedRows.filter((r: any) => r.diffs?.unallocatedCargo).length,
      buyVol: matchedRows.filter((r: any) => calcVolPctDiff(r.app?.buyVolTotal || 0, r.trms?.buyVolTotal || 0) >= 5).length,
      sellVol: matchedRows.filter((r: any) => calcVolPctDiff(r.app?.sellVolTotal || 0, r.trms?.sellVolTotal || 0) >= 5).length,
      buyPrice: matchedRows.filter((r: any) => Math.abs(r.diffs?.buyPrice || 0) > 0.01).length,
      sellPrice: matchedRows.filter((r: any) => Math.abs(r.diffs?.sellPrice || 0) > 0.01).length,
      src: matchedRows.filter((r: any) => Math.abs(r.diffs?.src || 0) > 1.0).length,
      loadingMonth: matchedRows.filter((r: any) => r.diffs?.loadingMonth).length,
      deliveryMonth: matchedRows.filter((r: any) => r.diffs?.deliveryMonth).length,
    };

    // 4 Main Financial Cards totals comparing App vs TRMS
    const appPurchaseCostTotal = dataToRender.reduce((acc: number, r: any) => acc + (r.app?.purchaseCost || 0), 0);
    const trmsPurchaseCostTotal = dataToRender.reduce((acc: number, r: any) => acc + (r.trms?.purchaseCost || 0), 0);
    const purchaseCostDiff = appPurchaseCostTotal - trmsPurchaseCostTotal;

    const appSalesRevenueTotal = dataToRender.reduce((acc: number, r: any) => acc + (r.app?.salesRevenue || 0), 0);
    const trmsSalesRevenueTotal = dataToRender.reduce((acc: number, r: any) => acc + (r.trms?.salesRevenue || 0), 0);
    const salesRevenueDiff = appSalesRevenueTotal - trmsSalesRevenueTotal;

    const appSrcTotal = dataToRender.reduce((acc: number, r: any) => acc + (r.app?.src || 0), 0);
    const trmsSrcTotal = dataToRender.reduce((acc: number, r: any) => acc + (r.trms?.src || 0), 0);
    const srcDiff = appSrcTotal - trmsSrcTotal;

    const appPhysPnLTotal = appSalesRevenueTotal - appPurchaseCostTotal - Math.abs(appSrcTotal);
    const trmsPhysPnLTotal = trmsSalesRevenueTotal - trmsPurchaseCostTotal - Math.abs(trmsSrcTotal);
    const physPnLDiff = appPhysPnLTotal - trmsPhysPnLTotal;

    const summaryCards = `
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px; font-family: sans-serif;">
            <div style="background: #0f172a; color: white; padding: 18px; border-radius: 16px; border: 1px solid #1e293b;">
                <div style="font-size: 10px; text-transform: uppercase; color: #94a3b8; font-weight: 800; letter-spacing: 0.5px; margin-bottom: 6px;">Total Strategies</div>
                <div style="font-size: 28px; font-weight: 900; font-family: monospace;">${totalStrategies}</div>
                <div style="font-size: 10px; color: #38bdf8; margin-top: 6px; font-weight: bold;">
                    ${matchedStrategies} Matched • ${appOnlyStrategies} App Only • ${trmsOnlyStrategies} TRMS Only
                </div>
            </div>

            <div style="background: #0f172a; color: white; padding: 18px; border-radius: 16px; border: 1px solid #1e293b;">
                <div style="font-size: 10px; text-transform: uppercase; color: #fb7185; font-weight: 800; letter-spacing: 0.5px; margin-bottom: 6px;">Strategies with Discrepancies (≥5%)</div>
                <div style="font-size: 28px; font-weight: 900; font-family: monospace; color: ${discrepancyStrategies > 0 ? '#f43f5e' : '#34d399'};">${discrepancyStrategies}</div>
                <div style="font-size: 10px; color: #94a3b8; margin-top: 6px; font-weight: bold;">
                    ${totalDiscrepancyPoints} Total Discrepancy Points
                </div>
            </div>

            <div style="background: #f8fafc; padding: 18px; border-radius: 16px; border: 1px solid #e2e8f0;">
                <div style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 800; letter-spacing: 0.5px; margin-bottom: 6px;">Purchase Vol Alignment (MMBtu)</div>
                <div style="font-size: 15px; font-weight: 900; font-family: monospace; color: #0f172a;">App: ${appBuyVol.toLocaleString()}</div>
                <div style="font-size: 12px; color: #64748b; font-family: monospace;">TRMS: ${trmsBuyVol.toLocaleString()}</div>
                <div style="font-size: 10px; font-weight: 800; margin-top: 4px; color: ${Math.abs(buyVolDiff) > 100 ? '#e11d48' : '#059669'}; font-family: monospace;">
                    Diff: ${buyVolDiff > 0 ? '+' : ''}${buyVolDiff.toLocaleString()}
                </div>
            </div>

            <div style="background: #f8fafc; padding: 18px; border-radius: 16px; border: 1px solid #e2e8f0;">
                <div style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 800; letter-spacing: 0.5px; margin-bottom: 6px;">Sales Vol Alignment (MMBtu)</div>
                <div style="font-size: 15px; font-weight: 900; font-family: monospace; color: #0f172a;">App: ${appSellVol.toLocaleString()}</div>
                <div style="font-size: 12px; color: #64748b; font-family: monospace;">TRMS: ${trmsSellVol.toLocaleString()}</div>
                <div style="font-size: 10px; font-weight: 800; margin-top: 4px; color: ${Math.abs(sellVolDiff) > 100 ? '#e11d48' : '#059669'}; font-family: monospace;">
                    Diff: ${sellVolDiff > 0 ? '+' : ''}${sellVolDiff.toLocaleString()}
                </div>
            </div>
        </div>

        <!-- 4 Main Financial Performance Cards Comparing App vs TRMS -->
        <div style="background: white; border: 1px solid #e2e8f0; padding: 18px; border-radius: 16px; margin-bottom: 25px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="font-size: 10px; text-transform: uppercase; color: #475569; font-weight: 900; letter-spacing: 1px; margin-bottom: 12px;">Financial Performance Comparison — 4 Main Summary Cards (App vs TRMS)</div>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; font-family: sans-serif;">
                <div style="background: #f8fafc; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 800; margin-bottom: 4px;">Purchase Cost</div>
                    <div style="font-size: 13px; font-weight: 900; font-family: monospace; color: #0f172a;">App: ${Math.abs(appPurchaseCostTotal).toLocaleString()}</div>
                    <div style="font-size: 11px; color: #64748b; font-family: monospace;">TRMS: ${Math.abs(trmsPurchaseCostTotal).toLocaleString()}</div>
                    <div style="font-size: 10px; font-weight: 800; margin-top: 4px; color: ${Math.abs(purchaseCostDiff) > 1000 ? '#e11d48' : '#059669'}; font-family: monospace;">
                        Diff: ${purchaseCostDiff >= 0 ? '+' : ''}${purchaseCostDiff.toLocaleString()}
                    </div>
                </div>
                <div style="background: #f8fafc; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 800; margin-bottom: 4px;">Sales Revenue</div>
                    <div style="font-size: 13px; font-weight: 900; font-family: monospace; color: #0f172a;">App: ${Math.abs(appSalesRevenueTotal).toLocaleString()}</div>
                    <div style="font-size: 11px; color: #64748b; font-family: monospace;">TRMS: ${Math.abs(trmsSalesRevenueTotal).toLocaleString()}</div>
                    <div style="font-size: 10px; font-weight: 800; margin-top: 4px; color: ${Math.abs(salesRevenueDiff) > 1000 ? '#e11d48' : '#059669'}; font-family: monospace;">
                        Diff: ${salesRevenueDiff >= 0 ? '+' : ''}${salesRevenueDiff.toLocaleString()}
                    </div>
                </div>
                <div style="background: #f8fafc; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 800; margin-bottom: 4px;">Shipping Cost (SRC)</div>
                    <div style="font-size: 13px; font-weight: 900; font-family: monospace; color: #0f172a;">App: ${Math.abs(appSrcTotal).toLocaleString()}</div>
                    <div style="font-size: 11px; color: #64748b; font-family: monospace;">TRMS: ${Math.abs(trmsSrcTotal).toLocaleString()}</div>
                    <div style="font-size: 10px; font-weight: 800; margin-top: 4px; color: ${Math.abs(srcDiff) > 100 ? '#e11d48' : '#059669'}; font-family: monospace;">
                        Diff: ${srcDiff >= 0 ? '+' : ''}${srcDiff.toLocaleString()}
                    </div>
                </div>
                <div style="background: #f8fafc; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 800; margin-bottom: 4px;">Physical P&amp;L</div>
                    <div style="font-size: 13px; font-weight: 900; font-family: monospace; color: ${appPhysPnLTotal >= 0 ? '#059669' : '#e11d48'};">App: ${appPhysPnLTotal >= 0 ? '+' : ''}${Math.abs(appPhysPnLTotal).toLocaleString()}</div>
                    <div style="font-size: 11px; color: #64748b; font-family: monospace;">TRMS: ${trmsPhysPnLTotal >= 0 ? '+' : ''}${Math.abs(trmsPhysPnLTotal).toLocaleString()}</div>
                    <div style="font-size: 10px; font-weight: 800; margin-top: 4px; color: ${Math.abs(physPnLDiff) > 1000 ? '#e11d48' : '#059669'}; font-family: monospace;">
                        Diff: ${physPnLDiff >= 0 ? '+' : ''}${physPnLDiff.toLocaleString()}
                    </div>
                </div>
            </div>
        </div>

        <div style="background: white; border: 1px solid #e2e8f0; padding: 18px; border-radius: 16px; margin-bottom: 30px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 900; letter-spacing: 1px; margin-bottom: 12px;">Field Mismatch Breakdown (${matchedRows.length} Matched Strategies)</div>
            <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; font-family: sans-serif;">
                <div style="background: #f8fafc; padding: 10px; border-radius: 10px; border: 1px solid #f1f5f9;">
                    <div style="font-size: 8px; color: #64748b; font-weight: 800; text-transform: uppercase;">P&L Bucket</div>
                    <div style="font-size: 16px; font-weight: 900; font-family: monospace; color: ${fieldDiffs.pnlBucket > 0 ? '#e11d48' : '#059669'}">${fieldDiffs.pnlBucket}</div>
                </div>
                <div style="background: #f8fafc; padding: 10px; border-radius: 10px; border: 1px solid #f1f5f9;">
                    <div style="font-size: 8px; color: #64748b; font-weight: 800; text-transform: uppercase;">Optimization</div>
                    <div style="font-size: 16px; font-weight: 900; font-family: monospace; color: ${fieldDiffs.optimization > 0 ? '#e11d48' : '#059669'}">${fieldDiffs.optimization}</div>
                </div>
                <div style="background: #f8fafc; padding: 10px; border-radius: 10px; border: 1px solid #f1f5f9;">
                    <div style="font-size: 8px; color: #64748b; font-weight: 800; text-transform: uppercase;">Unallocated Cargo</div>
                    <div style="font-size: 16px; font-weight: 900; font-family: monospace; color: ${fieldDiffs.unallocatedCargo > 0 ? '#e11d48' : '#059669'}">${fieldDiffs.unallocatedCargo}</div>
                </div>
                <div style="background: #f8fafc; padding: 10px; border-radius: 10px; border: 1px solid #f1f5f9;">
                    <div style="font-size: 8px; color: #64748b; font-weight: 800; text-transform: uppercase;">Purchase Vol</div>
                    <div style="font-size: 16px; font-weight: 900; font-family: monospace; color: ${fieldDiffs.buyVol > 0 ? '#e11d48' : '#059669'}">${fieldDiffs.buyVol}</div>
                </div>
                <div style="background: #f8fafc; padding: 10px; border-radius: 10px; border: 1px solid #f1f5f9;">
                    <div style="font-size: 8px; color: #64748b; font-weight: 800; text-transform: uppercase;">Sales Vol</div>
                    <div style="font-size: 16px; font-weight: 900; font-family: monospace; color: ${fieldDiffs.sellVol > 0 ? '#e11d48' : '#059669'}">${fieldDiffs.sellVol}</div>
                </div>
                <div style="background: #f8fafc; padding: 10px; border-radius: 10px; border: 1px solid #f1f5f9;">
                    <div style="font-size: 8px; color: #64748b; font-weight: 800; text-transform: uppercase;">Purchase Price</div>
                    <div style="font-size: 16px; font-weight: 900; font-family: monospace; color: ${fieldDiffs.buyPrice > 0 ? '#e11d48' : '#059669'}">${fieldDiffs.buyPrice}</div>
                </div>
                <div style="background: #f8fafc; padding: 10px; border-radius: 10px; border: 1px solid #f1f5f9;">
                    <div style="font-size: 8px; color: #64748b; font-weight: 800; text-transform: uppercase;">Sales Price</div>
                    <div style="font-size: 16px; font-weight: 900; font-family: monospace; color: ${fieldDiffs.sellPrice > 0 ? '#e11d48' : '#059669'}">${fieldDiffs.sellPrice}</div>
                </div>
                <div style="background: #f8fafc; padding: 10px; border-radius: 10px; border: 1px solid #f1f5f9;">
                    <div style="font-size: 8px; color: #64748b; font-weight: 800; text-transform: uppercase;">SRC Costs</div>
                    <div style="font-size: 16px; font-weight: 900; font-family: monospace; color: ${fieldDiffs.src > 0 ? '#e11d48' : '#059669'}">${fieldDiffs.src}</div>
                </div>
                <div style="background: #f8fafc; padding: 10px; border-radius: 10px; border: 1px solid #f1f5f9;">
                    <div style="font-size: 8px; color: #64748b; font-weight: 800; text-transform: uppercase;">Loading Month</div>
                    <div style="font-size: 16px; font-weight: 900; font-family: monospace; color: ${fieldDiffs.loadingMonth > 0 ? '#e11d48' : '#059669'}">${fieldDiffs.loadingMonth}</div>
                </div>
                <div style="background: #f8fafc; padding: 10px; border-radius: 10px; border: 1px solid #f1f5f9;">
                    <div style="font-size: 8px; color: #64748b; font-weight: 800; text-transform: uppercase;">Delivery Month</div>
                    <div style="font-size: 16px; font-weight: 900; font-family: monospace; color: ${fieldDiffs.deliveryMonth > 0 ? '#e11d48' : '#059669'}">${fieldDiffs.deliveryMonth}</div>
                </div>
            </div>
        </div>
    `;

    return `
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset="UTF-8">
                <title>App vs TRMS Reconciliation Report</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; background-color: #f1f5f9; color: #0f172a; line-height: 1.5; }
                    .container { max-width: 1600px; margin: 0 auto; background: white; padding: 50px; border-radius: 32px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.15); border: 1px solid #e2e8f0; }
                    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 2px solid #f1f5f9; padding-bottom: 24px; }
                    .title-area h1 { font-size: 32px; font-weight: 900; letter-spacing: -1.5px; margin: 0; color: #0f172a; }
                    .portfolio-info { margin-top: 10px; display: flex; gap: 15px; }
                    .info-pill { background: #f1f5f9; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
                    .meta { font-size: 11px; color: #94a3b8; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
                    table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 20px; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                    th { text-align: left; background-color: #f8fafc; padding: 12px 14px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; border-bottom: 2px solid #e2e8f0; }
                    td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
                    tr:last-child td { border-bottom: none; }
                    tr:hover { background-color: #f8fafc; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="title-area">
                            <h1>App vs TRMS Reconciliation Report</h1>
                            <div class="portfolio-info">
                                <span class="info-pill">Portfolio: ${trmsData.portfolioName || 'N/A'}</span>
                                <span class="info-pill">Year: ${trmsData.portfolioYear || 'N/A'}</span>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div class="meta">Generated on ${new Date().toLocaleString()}</div>
                            <div style="font-size: 10px; color: #6366f1; font-weight: 900; margin-top: 5px; text-transform: uppercase;">App vs TRMS Engine</div>
                        </div>
                    </div>
                    
                    ${summaryCards}
                    
                    <table>
                        <thead><tr>${tableHeaders}</tr></thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                    
                    <div style="margin-top: 40px; padding: 24px; background: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0; text-align: center;">
                        <div style="font-size: 11px; color: #94a3b8; font-weight: 900; text-transform: uppercase; letter-spacing: 2px;">
                            End of App vs TRMS Reconciliation Report
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
    a.download = `App_vs_TRMS_Reconciliation_Report_${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("HTML report downloaded successfully.");
  };

  const handleDownloadExcel = () => {
    const reportData = customizedReportData.map((row: any) => {
      if (activeTab === 'reconcile') {
        const r = row as ReconciliationRow;
        const buyVolDiff = r.app.buyVolTotal - r.trms.buyVolTotal;
        const sellVolDiff = r.app.sellVolTotal - r.trms.sellVolTotal;
        const buyPriceDiff = r.app.buyPriceEffective - r.trms.buyPriceEffective;
        const sellPriceDiff = r.app.sellPriceEffective - r.trms.sellPriceEffective;
        const srcDiff = r.app.src - r.trms.src;

        return {
          'Strategy Name': r.strategyName,
          'Group': r.group || '-',
          'Status': r.status,
          'Discrepancies Count': r.discrepancies.size,
          'Discrepancies List': Array.from(r.discrepancies).join(', ') || 'None',

          'App Buyer': r.app.buyer,
          'TRMS Buyer': r.trms.buyer,

          'App P&L Bucket': r.app.pnlBucket,
          'TRMS P&L Bucket': r.trms.pnlBucket,
          'P&L Bucket Match': !r.diffs.pnlBucket ? 'Match' : 'Mismatch',

          'App Optimization': r.app.optimization,
          'TRMS Optimization': r.trms.optimization,
          'Optimization Match': !r.diffs.optimization ? 'Match' : 'Mismatch',

          'App Unallocated Cargo': r.app.unallocatedCargo,
          'TRMS Unallocated Cargo': r.trms.unallocatedCargo,
          'Unallocated Cargo Match': !r.diffs.unallocatedCargo ? 'Match' : 'Mismatch',

          'App Purchase Vol (MMBtu)': r.app.buyVolTotal,
          'TRMS Purchase Vol (MMBtu)': r.trms.buyVolTotal,
          'Purchase Vol Diff (MMBtu)': buyVolDiff,

          'App Sales Vol (MMBtu)': r.app.sellVolTotal,
          'TRMS Sales Vol (MMBtu)': r.trms.sellVolTotal,
          'Sales Vol Diff (MMBtu)': sellVolDiff,

          'App Purchase Price ($)': r.app.buyPriceEffective,
          'TRMS Purchase Price ($)': r.trms.buyPriceEffective,
          'Purchase Price Diff ($)': buyPriceDiff,

          'App Sales Price ($)': r.app.sellPriceEffective,
          'TRMS Sales Price ($)': r.trms.sellPriceEffective,
          'Sales Price Diff ($)': sellPriceDiff,

          'App SRC Costs ($)': r.app.src,
          'TRMS SRC Costs ($)': r.trms.src,
          'SRC Costs Diff ($)': srcDiff,

          'App Loading Month': r.app.loadingMonth,
          'TRMS Loading Month': r.trms.loadingMonth,
          'Loading Month Match': !r.diffs.loadingMonth ? 'Match' : 'Mismatch',

          'App Delivery Month': r.app.deliveryMonth,
          'TRMS Delivery Month': r.trms.deliveryMonth,
          'Delivery Month Match': !r.diffs.deliveryMonth ? 'Match' : 'Mismatch'
        };
      }
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(reportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "App vs TRMS Report");
    XLSX.writeFile(wb, `App_vs_TRMS_Reconciliation_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
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
          <TabButton active={activeTab === 'executive'} onClick={() => setActiveTab('executive')} label="Executive Dashboard" count={0} color="emerald" />
          <TabButton active={activeTab === 'summary'} onClick={() => setActiveTab('summary')} label="TRMS Summary Table" count={uniqueStrategiesCount} color="violet" />
          <TabButton active={activeTab === 'quality'} onClick={() => setActiveTab('quality')} label="Data Quality" count={allQualityIssuesCount} color="amber" />
      </div>

      <div className="flex-1 min-h-[600px] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {activeTab === 'summary' ? (
          <TrmsSummaryTable trmsData={trmsData} viewModeOnly="grid" />
        ) : activeTab === 'executive' ? (
          <ExecutiveDashboard trmsData={trmsData} />
        ) : activeTab === 'quality' ? (
          <DataQualityDashboard profiles={profiles} trmsData={trmsData} onEditProfile={onEditProfile} />
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

                    {/* Multi-Select Year Dropdown */}
                    <div className="relative">
                      <button 
                        onClick={() => setShowYearFilterMenu(!showYearFilterMenu)}
                        className={`border text-[10px] font-bold rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-indigo-500 outline-none flex items-center gap-1.5 transition-colors ${!selectedYears.has('all') ? 'bg-indigo-900/60 border-indigo-500 text-indigo-200' : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-750'}`}
                      >
                        <span>
                          {selectedYears.has('all') 
                            ? `Years: All (${trmsFilterOptions.years.length})` 
                            : `Years: ${Array.from(selectedYears).sort().join(', ')}`}
                        </span>
                        <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>

                      {showYearFilterMenu && (
                        <div className="absolute left-0 mt-1 w-52 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 p-2 text-[11px] space-y-1">
                          <div className="flex justify-between items-center px-2 py-1 border-b border-slate-700 text-slate-400 font-bold text-[10px] uppercase">
                            <span>Select Years</span>
                            <button onClick={() => setShowYearFilterMenu(false)} className="text-slate-400 hover:text-white text-xs">✕</button>
                          </div>
                          <label className="flex items-center gap-2 px-2 py-1 hover:bg-slate-700 rounded cursor-pointer text-slate-200 font-bold">
                            <input 
                              type="checkbox" 
                              checked={selectedYears.has('all')} 
                              onChange={() => toggleYearFilter('all')} 
                              className="rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500" 
                            />
                            <span>All Years ({trmsFilterOptions.years.length})</span>
                          </label>
                          <div className="max-h-40 overflow-y-auto space-y-0.5 pt-1">
                            {trmsFilterOptions.years.map(y => (
                              <label key={y} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-700 rounded cursor-pointer text-slate-300">
                                <input 
                                  type="checkbox" 
                                  checked={!selectedYears.has('all') && selectedYears.has(y)} 
                                  onChange={() => toggleYearFilter(y)} 
                                  className="rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500" 
                                />
                                <span>{y}</span>
                              </label>
                            ))}
                          </div>
                          {!selectedYears.has('all') && (
                            <button 
                              onClick={() => setSelectedYears(new Set(['all']))} 
                              className="w-full text-center text-[10px] font-bold text-indigo-400 hover:text-indigo-300 pt-1 border-t border-slate-700"
                            >
                              Reset to All
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Filter Target Segmented Control */}
                    <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                      <span className="px-2 text-[9px] font-black uppercase text-slate-400 tracking-wider">Target:</span>
                      <button
                        type="button"
                        onClick={() => setReconFilterSource('both')}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${reconFilterSource === 'both' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                        title="Filter matching App or TRMS data"
                      >
                        Both
                      </button>
                      <button
                        type="button"
                        onClick={() => setReconFilterSource('app')}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${reconFilterSource === 'app' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                        title="Filter strictly by App cargo data"
                      >
                        App
                      </button>
                      <button
                        type="button"
                        onClick={() => setReconFilterSource('trms')}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${reconFilterSource === 'trms' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                        title="Filter strictly by TRMS data"
                      >
                        TRMS
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

                  {(reconStatusFilter !== 'all' || reconGroupFilter !== 'all' || reconPnlBucketFilter !== 'all' || reconOptimizationFilter !== 'all' || reconUnallocatedFilter !== 'all' || reconFilterSource !== 'both' || !selectedYears.has('all') || Object.keys(activeFilters).some(k => (activeFilters[k]?.size ?? 0) > 0)) && (
                    <button onClick={() => {
                      setReconStatusFilter('all');
                      setReconGroupFilter('all');
                      setReconPnlBucketFilter('all');
                      setReconOptimizationFilter('all');
                      setReconUnallocatedFilter('all');
                      setReconFilterSource('both');
                      setSelectedYears(new Set(['all']));
                      setActiveFilters({});
                    }} className="text-[10px] font-bold text-rose-400 hover:text-rose-300 underline">
                      Reset Filters
                    </button>
                  )}
                </div>

                {/* Reconciliation Metrics Summary Cards */}
                {(() => {
                  const reconcileFilteredRows = processedData as ReconciliationRow[];
                  return (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1 border-t border-slate-800">
                        <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700 flex flex-col">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Filtered Strategies</span>
                          <span className="text-sm font-black text-indigo-400 font-mono mt-0.5">{reconcileFilteredRows.length} <span className="text-[10px] text-slate-400 font-normal">/ {reconciliationData.length} Total</span></span>
                        </div>
                        <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700 flex flex-col">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Discrepancies (≥5% Vol)</span>
                          <span className="text-sm font-black text-rose-400 font-mono mt-0.5">{reconcileFilteredRows.filter(r => r.discrepancies.size > 0).length} <span className="text-[10px] text-slate-400 font-normal">Strategies</span></span>
                        </div>
                        <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700 flex flex-col">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Purchase Volume (MMBtu)</span>
                          <div className="flex items-center justify-between font-mono text-[11px] mt-0.5">
                            <span className="text-slate-300">App: <strong className="text-white">{reconcileFilteredRows.reduce((acc, r) => acc + r.app.buyVolTotal, 0).toLocaleString()}</strong></span>
                            <span className="text-slate-400">TRMS: <strong className="text-white">{reconcileFilteredRows.reduce((acc, r) => acc + r.trms.buyVolTotal, 0).toLocaleString()}</strong></span>
                          </div>
                        </div>
                        <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700 flex flex-col">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Sales Volume (MMBtu)</span>
                          <div className="flex items-center justify-between font-mono text-[11px] mt-0.5">
                            <span className="text-slate-300">App: <strong className="text-white">{reconcileFilteredRows.reduce((acc, r) => acc + r.app.sellVolTotal, 0).toLocaleString()}</strong></span>
                            <span className="text-slate-400">TRMS: <strong className="text-white">{reconcileFilteredRows.reduce((acc, r) => acc + r.trms.sellVolTotal, 0).toLocaleString()}</strong></span>
                          </div>
                        </div>
                      </div>

                      {/* The 4 Main TRMS Financial Performance Cards (App vs TRMS Comparison) */}
                      {(() => {
                        const appPurchaseCostSum = reconcileFilteredRows.reduce((acc, r) => acc + (r.app.purchaseCost || 0), 0);
                        const trmsPurchaseCostSum = reconcileFilteredRows.reduce((acc, r) => acc + (r.trms.purchaseCost || 0), 0);
                        const purchaseCostDiff = appPurchaseCostSum - trmsPurchaseCostSum;

                        const appSalesRevSum = reconcileFilteredRows.reduce((acc, r) => acc + (r.app.salesRevenue || 0), 0);
                        const trmsSalesRevSum = reconcileFilteredRows.reduce((acc, r) => acc + (r.trms.salesRevenue || 0), 0);
                        const salesRevDiff = appSalesRevSum - trmsSalesRevSum;

                        const appSrcSum = reconcileFilteredRows.reduce((acc, r) => acc + (r.app.src || 0), 0);
                        const trmsSrcSum = reconcileFilteredRows.reduce((acc, r) => acc + (r.trms.src || 0), 0);
                        const srcDiff = appSrcSum - trmsSrcSum;

                        const appPhysPnL = appSalesRevSum - appPurchaseCostSum - Math.abs(appSrcSum);
                        const trmsPhysPnL = trmsSalesRevSum - trmsPurchaseCostSum - Math.abs(trmsSrcSum);
                        const physPnLDiff = appPhysPnL - trmsPhysPnL;

                        return (
                          <div className="pt-2.5 border-t border-slate-800 space-y-1.5">
                            <div className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-mono">
                              4 Main TRMS Financial Cards (App vs TRMS Comparison)
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                              {/* 1. Purchase Cost */}
                              <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-700/80 flex flex-col justify-between">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Purchase Cost</span>
                                <div className="font-mono text-[10.5px] mt-1 space-y-0.5">
                                  <div className="text-slate-300 flex justify-between"><span>App:</span> <strong className="text-white">${Math.abs(appPurchaseCostSum).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></div>
                                  <div className="text-slate-400 flex justify-between"><span>TRMS:</span> <strong className="text-slate-200">${Math.abs(trmsPurchaseCostSum).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></div>
                                  <div className={`text-[10px] font-extrabold flex justify-between pt-0.5 border-t border-slate-800 ${Math.abs(purchaseCostDiff) > 1000 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                    <span>Diff:</span> <span>{purchaseCostDiff >= 0 ? '+' : ''}${purchaseCostDiff.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                  </div>
                                </div>
                              </div>

                              {/* 2. Sales Revenue */}
                              <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-700/80 flex flex-col justify-between">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Sales Revenue</span>
                                <div className="font-mono text-[10.5px] mt-1 space-y-0.5">
                                  <div className="text-slate-300 flex justify-between"><span>App:</span> <strong className="text-white">${Math.abs(appSalesRevSum).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></div>
                                  <div className="text-slate-400 flex justify-between"><span>TRMS:</span> <strong className="text-slate-200">${Math.abs(trmsSalesRevSum).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></div>
                                  <div className={`text-[10px] font-extrabold flex justify-between pt-0.5 border-t border-slate-800 ${Math.abs(salesRevDiff) > 1000 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                    <span>Diff:</span> <span>{salesRevDiff >= 0 ? '+' : ''}${salesRevDiff.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                  </div>
                                </div>
                              </div>

                              {/* 3. Shipping Cost (SRC) */}
                              <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-700/80 flex flex-col justify-between">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Shipping Cost (SRC)</span>
                                <div className="font-mono text-[10.5px] mt-1 space-y-0.5">
                                  <div className="text-slate-300 flex justify-between"><span>App:</span> <strong className="text-white">${Math.abs(appSrcSum).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></div>
                                  <div className="text-slate-400 flex justify-between"><span>TRMS:</span> <strong className="text-slate-200">${Math.abs(trmsSrcSum).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></div>
                                  <div className={`text-[10px] font-extrabold flex justify-between pt-0.5 border-t border-slate-800 ${Math.abs(srcDiff) > 100 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                    <span>Diff:</span> <span>{srcDiff >= 0 ? '+' : ''}${srcDiff.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                  </div>
                                </div>
                              </div>

                              {/* 4. Physical P&L */}
                              <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-700/80 flex flex-col justify-between">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Physical P&amp;L</span>
                                <div className="font-mono text-[10.5px] mt-1 space-y-0.5">
                                  <div className="text-slate-300 flex justify-between"><span>App:</span> <strong className={appPhysPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{appPhysPnL >= 0 ? '+' : '-'}${Math.abs(appPhysPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></div>
                                  <div className="text-slate-400 flex justify-between"><span>TRMS:</span> <strong className={trmsPhysPnL >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{trmsPhysPnL >= 0 ? '+' : '-'}${Math.abs(trmsPhysPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></div>
                                  <div className={`text-[10px] font-extrabold flex justify-between pt-0.5 border-t border-slate-800 ${Math.abs(physPnLDiff) > 1000 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                    <span>Diff:</span> <span>{physPnLDiff >= 0 ? '+' : ''}${physPnLDiff.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  );
                })()}
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
                {paginatedReconData.map((row: any, i) => (
                  <ReconciliationRowItem 
                    key={((reconCurrentPage - 1) * (reconPageSize || 1)) + i}
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
                    rowHeight={activeTab === 'reconcile' ? 140 : 48}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-20 text-slate-400">
                <svg className="w-12 h-12 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 2v-6m-9-9H5a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012 2h2a2 2 0 002-2M9 5a2 2 0 012 2" /></svg>
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

        {/* Pagination Bar */}
        {processedData.length > 0 && (
          <div className="bg-slate-900 border-t border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-slate-300 text-xs shrink-0 z-20">
            <div className="flex items-center gap-3">
              <span className="font-medium text-slate-400">
                Showing{' '}
                <span className="font-bold text-white">
                  {reconPageSize === 0 ? (processedData.length > 0 ? 1 : 0) : Math.min((reconCurrentPage - 1) * reconPageSize + 1, processedData.length)}
                </span>
                {' '}-{' '}
                <span className="font-bold text-white">
                  {reconPageSize === 0 ? processedData.length : Math.min(reconCurrentPage * reconPageSize, processedData.length)}
                </span>
                {' '}of <span className="font-bold text-indigo-400">{processedData.length}</span> strategies
              </span>

              <div className="flex items-center gap-1.5 ml-3">
                <span className="text-[10px] uppercase font-bold text-slate-400">Page Size:</span>
                <select
                  value={reconPageSize}
                  onChange={(e) => {
                    setReconPageSize(Number(e.target.value));
                    setReconCurrentPage(1);
                  }}
                  className="bg-slate-800 text-slate-200 border border-slate-700 text-xs font-bold rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                  <option value={200}>200 / page</option>
                  <option value={0}>All ({processedData.length})</option>
                </select>
              </div>
            </div>

            {reconPageSize > 0 && totalReconPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setReconCurrentPage(1)}
                  disabled={reconCurrentPage === 1}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-slate-200 rounded-lg border border-slate-700 transition-colors"
                  title="First Page"
                >
                  « First
                </button>
                <button
                  onClick={() => setReconCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={reconCurrentPage === 1}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-slate-200 rounded-lg border border-slate-700 transition-colors"
                >
                  ‹ Prev
                </button>

                <span className="text-xs font-bold px-3 text-indigo-300 font-mono">
                  Page {reconCurrentPage} of {totalReconPages}
                </span>

                <button
                  onClick={() => setReconCurrentPage(prev => Math.min(totalReconPages, prev + 1))}
                  disabled={reconCurrentPage === totalReconPages}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-slate-200 rounded-lg border border-slate-700 transition-colors"
                >
                  Next ›
                </button>
                <button
                  onClick={() => setReconCurrentPage(totalReconPages)}
                  disabled={reconCurrentPage === totalReconPages}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-slate-200 rounded-lg border border-slate-700 transition-colors"
                  title="Last Page"
                >
                  Last »
                </button>
              </div>
            )}
          </div>
        )}
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
              <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                <div>
                    <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                        <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 2v-6m-9-9H5a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012 2h2a2 2 0 002-2M9 5a2 2 0 012 2h2a2 2 0 012 2" /></svg>
                        Report Customization & Export
                    </h3>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                        Customize strategy selection ({customizedReportData.length} / {processedData.length} exported)
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setReportShowCustomizer(!reportShowCustomizer)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all flex items-center gap-1.5 ${reportShowCustomizer ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                        {reportShowCustomizer ? 'Hide SN Selector' : 'Customize SNs'}
                    </button>
                    <button 
                        onClick={handleDownloadHTML}
                        className="px-4 py-2 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-200"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Download HTML ({customizedReportData.length})
                    </button>
                    <button 
                        onClick={handleDownloadExcel}
                        className="px-4 py-2 bg-emerald-600 text-white text-xs font-black rounded-xl hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-200"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Download Excel ({customizedReportData.length})
                    </button>
                    <button 
                        onClick={() => setShowReportPreview(false)}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-hidden flex bg-slate-100/50">
                  {/* Report Customization Sidebar */}
                  {reportShowCustomizer && (
                    <div className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0 h-full">
                      <div className="p-4 border-b border-slate-100 space-y-3 bg-slate-50/50">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Select Strategies</span>
                          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                            {reportSelectedSNs.size} Selected
                          </span>
                        </div>
                        <input 
                          type="text"
                          placeholder="Search SN / Strategy Name..."
                          value={reportSnSearch}
                          onChange={(e) => setReportSnSearch(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                        />
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              const all = new Set(processedData.map((r: any) => activeTab === 'reconcile' ? r.strategyName : r['Strategy Name']).filter(Boolean));
                              setReportSelectedSNs(all);
                            }}
                            className="flex-1 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg transition-colors"
                          >
                            Select All ({processedData.length})
                          </button>
                          <button 
                            onClick={() => setReportSelectedSNs(new Set())}
                            className="flex-1 py-1 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 text-[10px] font-bold rounded-lg transition-colors"
                          >
                            Deselect All
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-slate-50">
                        {processedData
                          .filter((r: any) => {
                            const sn = activeTab === 'reconcile' ? r.strategyName : r['Strategy Name'];
                            if (!reportSnSearch) return true;
                            return String(sn || '').toLowerCase().includes(reportSnSearch.toLowerCase());
                          })
                          .map((r: any) => {
                            const sn = activeTab === 'reconcile' ? r.strategyName : r['Strategy Name'];
                            const isChecked = reportSelectedSNs.has(sn);
                            return (
                              <label key={sn} className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors hover:bg-slate-50 ${isChecked ? 'bg-indigo-50/40' : ''}`}>
                                <div className="flex items-center gap-2 min-w-0 pr-2">
                                  <input 
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      setReportSelectedSNs(prev => {
                                        const next = new Set(prev);
                                        if (next.has(sn)) next.delete(sn);
                                        else next.add(sn);
                                        return next;
                                      });
                                    }}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                                  />
                                  <span className="text-xs font-bold text-slate-800 truncate" title={sn}>{sn}</span>
                                </div>
                                {r.status && (
                                  <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 ${r.status === 'Matched' ? 'bg-emerald-100 text-emerald-700' : r.status === 'App Only' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                                    {r.status}
                                  </span>
                                )}
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Main Report View */}
                  <div className="flex-1 overflow-auto p-8">
                      <div 
                        className="bg-white shadow-2xl rounded-2xl p-10 border border-slate-200 mx-auto max-w-5xl"
                        dangerouslySetInnerHTML={{ __html: generateReportHTML() }}
                      />
                  </div>
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

  const getVolHighlight = (appVol: number, trmsVol: number, foundInApp: boolean, foundInTrms: boolean) => {
    if (!foundInApp && !foundInTrms) return { bgClass: '', textClass: 'text-slate-700', pctDiff: 0, level: 'match' };

    const diff = Math.abs(appVol - trmsVol);
    if (diff <= 0.1) {
      return { bgClass: '', textClass: 'text-slate-700', pctDiff: 0, level: 'match' };
    }

    const maxVol = Math.max(Math.abs(appVol), Math.abs(trmsVol));
    const pctDiff = maxVol > 0 ? (diff / maxVol) * 100 : 100;

    if (pctDiff > 5.0) {
      return {
        bgClass: 'bg-rose-100/90 border border-rose-200',
        textClass: 'text-rose-700 font-extrabold',
        pctDiff,
        level: 'red'
      };
    } else {
      return {
        bgClass: 'bg-amber-100/90 border border-amber-200',
        textClass: 'text-amber-800 font-extrabold',
        pctDiff,
        level: 'yellow'
      };
    }
  };

  const pnlMismatch = r.foundInApp && r.foundInTrms && r.diffs.pnlBucket;
  const optMismatch = r.foundInApp && r.foundInTrms && r.diffs.optimization;
  const unallocMismatch = r.foundInApp && r.foundInTrms && r.diffs.unallocatedCargo;
  const buyVolHighlight = getVolHighlight(r.app.buyVolTotal, r.trms.buyVolTotal, r.foundInApp, r.foundInTrms);
  const sellVolHighlight = getVolHighlight(r.app.sellVolTotal, r.trms.sellVolTotal, r.foundInApp, r.foundInTrms);
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

      {/* 1b. Buyer */}
      <div className="px-3 py-2 shrink-0 flex flex-col justify-center border-r border-slate-100 overflow-hidden" style={{ width: columnWidths['Buyer'] || 180 }}>
        <div className="flex justify-between items-center mb-1 pb-1 border-b border-slate-100">
          <span className="text-[8px] font-bold text-slate-400 uppercase">App Buyer</span>
          <span className="text-[9px] font-bold font-mono text-slate-800 truncate ml-1" title={r.app.buyer}>{r.app.buyer}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[8px] font-bold text-slate-400 uppercase">TRMS Buyer</span>
          <span className="text-[9px] font-bold font-mono text-slate-600 truncate ml-1" title={r.trms.buyer}>{r.trms.buyer}</span>
        </div>
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
      <div className={`px-3 py-2 shrink-0 flex flex-col justify-center border-r border-slate-100 overflow-hidden ${buyVolHighlight.bgClass}`} style={{ width: columnWidths['Purchase Volume'] || 160 }} title={buyVolHighlight.level !== 'match' ? `Volume diff: ${buyVolHighlight.pctDiff?.toFixed(1)}% (${buyVolHighlight.level === 'red' ? '>5%' : '≤5%'})` : undefined}>
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
            <span className={`font-bold ml-auto ${buyVolHighlight.textClass}`}>{r.trms.buyVolTotal.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* 6. Sales Volume */}
      <div className={`px-3 py-2 shrink-0 flex flex-col justify-center border-r border-slate-100 overflow-hidden ${sellVolHighlight.bgClass}`} style={{ width: columnWidths['Sales Volume'] || 160 }} title={sellVolHighlight.level !== 'match' ? `Volume diff: ${sellVolHighlight.pctDiff?.toFixed(1)}% (${sellVolHighlight.level === 'red' ? '>5%' : '≤5%'})` : undefined}>
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
            <span className={`font-bold ml-auto ${sellVolHighlight.textClass}`}>{r.trms.sellVolTotal.toLocaleString()}</span>
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
