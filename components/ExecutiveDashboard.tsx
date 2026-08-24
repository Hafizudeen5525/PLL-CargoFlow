import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownRight, 
  Calendar, 
  Filter, 
  Layers, 
  CheckCircle2, 
  Clock, 
  Boxes, 
  Ship, 
  Activity, 
  Sparkles, 
  ChevronRight, 
  ChevronDown, 
  X, 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Download, 
  RotateCcw, 
  SlidersHorizontal, 
  ShieldCheck, 
  FileSpreadsheet, 
  ExternalLink,
  ChevronLeft
} from 'lucide-react';
import { ReconciliationData } from './DiscrepancyCheck';
import { getGroupName, GROUPS, formatCurrency } from '../services/calculationService';
import { computeTrmsSummaryRows, TrmsStrategySummary, isDerivativeRowRealized } from '../utils/trmsEngine';
import { AutoScalingText } from './AutoScalingText';

export interface ExecutiveDashboardProps {
  trmsData: ReconciliationData;
  onCargoClick?: (strategyName: string) => void;
}

interface BucketStats {
  pnl: number;
  revenue: number;
  purchase: number;
  other: number; // shipping / SRC / misc
  vol: number;
  count: number;
}

type DrillDownMetric = 'PnL' | 'Revenue' | 'Purchase' | 'Other' | 'Volume';
type BucketType = 'Total' | 'Realized' | 'Unrealized';

interface ActiveDrillDownConfig {
  bucket: BucketType;
  metric: DrillDownMetric;
}

export type DerivativeCategory = 'PHYSICAL_HEDGING' | 'DH' | 'DFT';

export interface DerivativeCategoryConfig {
  id: DerivativeCategory;
  title: string;
  shortTitle: string;
  code: string;
  portfolioDesc: string;
  badge: string;
  themeColor: 'emerald' | 'indigo' | 'purple';
  icon: any;
  filterFn: (row: any) => boolean;
}

const DERIVATIVE_CONFIGS: Record<DerivativeCategory, DerivativeCategoryConfig> = {
  PHYSICAL_HEDGING: {
    id: 'PHYSICAL_HEDGING',
    title: 'Physical Hedging P&L',
    shortTitle: 'Physical Hedging',
    code: 'HEDGE',
    portfolioDesc: 'HEDGING LNG',
    badge: 'Physical Hedging',
    themeColor: 'emerald',
    icon: ShieldCheck,
    filterFn: (r: any) => {
      const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
      const cflow = String(r['Cflow Type'] || '').trim().toLowerCase();
      return port === 'hedging lng' || port.includes('hedging') || cflow.includes('hedge');
    }
  },
  DH: {
    id: 'DH',
    title: 'Dynamic Hedging (DH) P&L',
    shortTitle: 'Dynamic Hedging (DH)',
    code: 'DH',
    portfolioDesc: 'DH LNG',
    badge: 'Dynamic Hedging',
    themeColor: 'indigo',
    icon: Activity,
    filterFn: (r: any) => {
      const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
      const cflow = String(r['Cflow Type'] || '').trim().toLowerCase();
      return port === 'dh lng' || port === 'dh' || port.includes('dynamic hedging') || port.includes('dh lng') || (port.startsWith('dh') && !port.startsWith('dft')) || cflow.includes('dh');
    }
  },
  DFT: {
    id: 'DFT',
    title: 'Derivatives Trading (DFT) P&L',
    shortTitle: 'Financial Trading (DFT)',
    code: 'DFT',
    portfolioDesc: 'DFT LNG',
    badge: 'Derivatives & Financial',
    themeColor: 'purple',
    icon: TrendingUp,
    filterFn: (r: any) => {
      const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
      const cflow = String(r['Cflow Type'] || '').trim().toLowerCase();
      return port === 'dft lng' || port === 'dft' || port.includes('financial trading') || port.includes('dft lng') || port.includes('derivative') || cflow.includes('dft');
    }
  }
};

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({ trmsData, onCargoClick }) => {
  const [selectedGroup, setSelectedGroup] = useState<string>('All');
  const [targetDate, setTargetDate] = useState<string>('all');
  const [baselineDate, setBaselineDate] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [activeDrillDown, setActiveDrillDown] = useState<ActiveDrillDownConfig | null>(null);

  // Drilldown Table Filter States
  const [modalSearch, setModalSearch] = useState<string>('');
  const [filterGroup, setFilterGroup] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterLoadingMonth, setFilterLoadingMonth] = useState<string>('ALL');
  const [filterDeliveryMonth, setFilterDeliveryMonth] = useState<string>('ALL');
  const [filterBuyer, setFilterBuyer] = useState<string>('ALL');
  const [filterSeller, setFilterSeller] = useState<string>('ALL');
  const [filterOptimization, setFilterOptimization] = useState<string>('ALL');
  const [filterAllocation, setFilterAllocation] = useState<string>('ALL');

  // Sorting state for modal table
  const [sortColumn, setSortColumn] = useState<string>('pnl');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Derivatives (Physical Hedging, DH, DFT) Modal & Drilldown State
  const [activeDerivativeCategory, setActiveDerivativeCategory] = useState<DerivativeCategory>('PHYSICAL_HEDGING');
  const [isDerivativesModalOpen, setIsDerivativesModalOpen] = useState<boolean>(false);
  const [selectedDerivativeGroup, setSelectedDerivativeGroup] = useState<string | null>(null);
  const [derivativeModalFilterStatus, setDerivativeModalFilterStatus] = useState<'ALL' | 'Realized' | 'Unrealized'>('ALL');
  const [derivativeModalSearch, setDerivativeModalSearch] = useState<string>('');
  const [derivativeOnlyActive, setDerivativeOnlyActive] = useState<boolean>(false);
  const [derivativeSortColumn, setDerivativeSortColumn] = useState<string>('totalPnL');
  const [derivativeSortDirection, setDerivativeSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedDerivativeSN, setExpandedDerivativeSN] = useState<string | null>(null);

  const rawRows = useMemo(() => {
    if (trmsData.extractedRows && trmsData.extractedRows.length > 0) {
      return trmsData.extractedRows;
    }
    return [...(trmsData.src || []), ...(trmsData.hedging || []), ...(trmsData.paper || [])];
  }, [trmsData]);

  // Extract available EOD Dates sorted descending
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    rawRows.forEach((r: any) => {
      const dt = String(r['EOD Date'] || r['EOD_Date'] || r['As At Date'] || r['Extract Date'] || r['Run Date'] || '').trim();
      if (dt) dates.add(dt);
    });
    return Array.from(dates).sort().reverse();
  }, [rawRows]);

  // Extract available Years
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    rawRows.forEach((r: any) => {
      const yr = String(r['Plsb Year Bucket'] || r['Plsb_Year_Bucket'] || '').trim();
      if (yr) {
        const matches = yr.match(/\b(20\d\d)\b/g);
        if (matches) matches.forEach(m => years.add(m));
        else years.add(yr);
      }
      const sn = String(r['Strategy Name'] || r['Strategy'] || '').trim();
      const match = sn.match(/202[0-9]/);
      if (match) years.add(match[0]);
    });
    return Array.from(years).sort();
  }, [rawRows]);

  // Initialize targetDate and baselineDate when dates load
  React.useEffect(() => {
    if (availableDates.length > 0) {
      if (targetDate === 'all' || !availableDates.includes(targetDate)) {
        setTargetDate(availableDates[0]);
        if (availableDates.length > 1) {
          setBaselineDate(availableDates[1]);
        } else {
          setBaselineDate(availableDates[0]);
        }
      }
    }
  }, [availableDates, targetDate]);

  // Compute summary rows for any specific EOD date
  const getComputedSummaries = useCallback((eodDate: string, year: string, group: string) => {
    const summaries = computeTrmsSummaryRows(rawRows, eodDate, year);
    if (group === 'All') return summaries;
    return summaries.filter(s => getGroupName(s.strategyName) === group);
  }, [rawRows]);

  // Target summaries (Current Day / Selected Run)
  const targetSummaries = useMemo(() => {
    return getComputedSummaries(targetDate, selectedYear, selectedGroup);
  }, [getComputedSummaries, targetDate, selectedYear, selectedGroup]);

  // Baseline summaries (Yesterday / Comparison Run)
  const baselineSummaries = useMemo(() => {
    return getComputedSummaries(baselineDate, selectedYear, selectedGroup);
  }, [getComputedSummaries, baselineDate, selectedYear, selectedGroup]);

  // Helper to extract specific derivative category details for a strategy
  const extractStrategyDerivatives = useCallback((s: TrmsStrategySummary, cat: DerivativeCategory) => {
    const cfg = DERIVATIVE_CONFIGS[cat];
    const dealRows = (s.underlyingRows || []).filter(cfg.filterFn);

    let realizedPnL = 0;
    let unrealizedPnL = 0;
    let vol = 0;

    if (dealRows.length > 0) {
      let rawVolSum = 0;
      dealRows.forEach((r: any) => {
        const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, '')) || 0;
        const rVol = Math.abs(Number(String(r['Volume'] || '').replace(/[^0-9.-]/g, '')) || 0);
        rawVolSum += rVol;

        const isRealized = isDerivativeRowRealized(r, targetDate);
        if (isRealized) {
          realizedPnL += val;
        } else {
          unrealizedPnL += val;
        }
      });
      vol = rawVolSum;
    } else {
      // Fallbacks from summary object if precomputed
      if (cat === 'PHYSICAL_HEDGING') {
        realizedPnL = s.realizedHedgingPnL ?? (s.hedgingRealized ? (s.hedgingPnL || 0) : 0);
        unrealizedPnL = s.unrealizedHedgingPnL ?? (!s.hedgingRealized ? (s.hedgingPnL || 0) : 0);
        vol = s.hedgingVolume || 0;
      } else if (cat === 'DH') {
        realizedPnL = s.realizedDhPnL ?? (s.dhRealized ? (s.dhPnL || 0) : 0);
        unrealizedPnL = s.unrealizedDhPnL ?? (!s.dhRealized ? (s.dhPnL || 0) : 0);
        vol = s.dhVolume || 0;
      } else if (cat === 'DFT') {
        realizedPnL = s.realizedDftPnL ?? (s.dftRealized ? (s.dftPnL || 0) : 0);
        unrealizedPnL = s.unrealizedDftPnL ?? (!s.dftRealized ? (s.dftPnL || 0) : 0);
        vol = s.dftVolume || 0;
      }
    }

    const totalPnL = realizedPnL + unrealizedPnL;
    const isRealized = realizedPnL !== 0 && unrealizedPnL === 0 ? true : (unrealizedPnL !== 0 ? false : (dealRows.length > 0 ? dealRows.every(r => isDerivativeRowRealized(r, targetDate)) : false));

    return {
      dealRows,
      realizedPnL,
      unrealizedPnL,
      totalPnL,
      vol,
      isRealized,
      hasTrades: Math.abs(totalPnL) > 0.001 || vol > 0 || dealRows.length > 0
    };
  }, [targetDate]);

  // Strategy PnL Map for Baseline Date to compute Day-over-Day movements
  const baselinePnlMap = useMemo(() => {
    const map = new Map<string, number>();
    baselineSummaries.forEach(s => {
      const other = s.otherCosts !== undefined ? s.otherCosts : ((s.shippingRelatedCosts || 0) + (s.miscCost || 0));
      const pnl = (Math.abs(s.salesRevenue || 0) - Math.abs(s.purchaseCost || 0)) + other;
      map.set(s.strategyName, pnl);
    });
    return map;
  }, [baselineSummaries]);

  // Baseline map for each derivative category per strategy
  const baselineDerivativesMap = useMemo(() => {
    const map: Record<DerivativeCategory, Map<string, number>> = {
      PHYSICAL_HEDGING: new Map(),
      DH: new Map(),
      DFT: new Map()
    };
    baselineSummaries.forEach(s => {
      (['PHYSICAL_HEDGING', 'DH', 'DFT'] as DerivativeCategory[]).forEach(cat => {
        const details = extractStrategyDerivatives(s, cat);
        map[cat].set(s.strategyName, details.totalPnL);
      });
    });
    return map;
  }, [baselineSummaries, extractStrategyDerivatives]);

  // Target and baseline overview stats for each derivative category
  const targetDerivativesStats = useMemo(() => {
    const res: Record<DerivativeCategory, {
      totalPnL: number;
      realizedPnL: number;
      unrealizedPnL: number;
      volume: number;
      count: number;
      activeCount: number;
    }> = {
      PHYSICAL_HEDGING: { totalPnL: 0, realizedPnL: 0, unrealizedPnL: 0, volume: 0, count: targetSummaries.length, activeCount: 0 },
      DH: { totalPnL: 0, realizedPnL: 0, unrealizedPnL: 0, volume: 0, count: targetSummaries.length, activeCount: 0 },
      DFT: { totalPnL: 0, realizedPnL: 0, unrealizedPnL: 0, volume: 0, count: targetSummaries.length, activeCount: 0 }
    };

    targetSummaries.forEach(s => {
      (['PHYSICAL_HEDGING', 'DH', 'DFT'] as DerivativeCategory[]).forEach(cat => {
        const d = extractStrategyDerivatives(s, cat);
        res[cat].totalPnL += d.totalPnL;
        res[cat].realizedPnL += d.realizedPnL;
        res[cat].unrealizedPnL += d.unrealizedPnL;
        res[cat].volume += d.vol;
        if (d.hasTrades) res[cat].activeCount++;
      });
    });

    return res;
  }, [targetSummaries, extractStrategyDerivatives]);

  const baselineDerivativesStats = useMemo(() => {
    const res: Record<DerivativeCategory, {
      totalPnL: number;
      realizedPnL: number;
      unrealizedPnL: number;
      volume: number;
      count: number;
      activeCount: number;
    }> = {
      PHYSICAL_HEDGING: { totalPnL: 0, realizedPnL: 0, unrealizedPnL: 0, volume: 0, count: baselineSummaries.length, activeCount: 0 },
      DH: { totalPnL: 0, realizedPnL: 0, unrealizedPnL: 0, volume: 0, count: baselineSummaries.length, activeCount: 0 },
      DFT: { totalPnL: 0, realizedPnL: 0, unrealizedPnL: 0, volume: 0, count: baselineSummaries.length, activeCount: 0 }
    };

    baselineSummaries.forEach(s => {
      (['PHYSICAL_HEDGING', 'DH', 'DFT'] as DerivativeCategory[]).forEach(cat => {
        const d = extractStrategyDerivatives(s, cat);
        res[cat].totalPnL += d.totalPnL;
        res[cat].realizedPnL += d.realizedPnL;
        res[cat].unrealizedPnL += d.unrealizedPnL;
        res[cat].volume += d.vol;
        if (d.hasTrades) res[cat].activeCount++;
      });
    });

    return res;
  }, [baselineSummaries, extractStrategyDerivatives]);

  // Group-level Aggregations for Active Derivative Category
  const derivativesByGroup = useMemo(() => {
    const groupMap: Record<string, {
      groupName: string;
      strategyCount: number;
      activeCount: number;
      totalPnL: number;
      realizedPnL: number;
      unrealizedPnL: number;
      volume: number;
      prevTotalPnL: number;
      pnlChange: number;
      strategies: Array<any>;
    }> = {};

    targetSummaries.forEach(s => {
      const g = getGroupName(s.strategyName) || 'Unassigned';
      if (!groupMap[g]) {
        groupMap[g] = {
          groupName: g,
          strategyCount: 0,
          activeCount: 0,
          totalPnL: 0,
          realizedPnL: 0,
          unrealizedPnL: 0,
          volume: 0,
          prevTotalPnL: 0,
          pnlChange: 0,
          strategies: []
        };
      }

      const details = extractStrategyDerivatives(s, activeDerivativeCategory);
      const prevPnL = baselineDerivativesMap[activeDerivativeCategory].get(s.strategyName) || 0;
      const pnlChange = details.totalPnL - prevPnL;

      groupMap[g].strategyCount += 1;
      if (details.hasTrades) groupMap[g].activeCount += 1;
      groupMap[g].totalPnL += details.totalPnL;
      groupMap[g].realizedPnL += details.realizedPnL;
      groupMap[g].unrealizedPnL += details.unrealizedPnL;
      groupMap[g].volume += details.vol;
      groupMap[g].prevTotalPnL += prevPnL;
      groupMap[g].pnlChange += pnlChange;

      groupMap[g].strategies.push({
        ...s,
        group: g,
        ...details,
        prevPnL,
        pnlChange
      });
    });

    return Object.values(groupMap).sort((a, b) => Math.abs(b.totalPnL) - Math.abs(a.totalPnL));
  }, [targetSummaries, baselineDerivativesMap, extractStrategyDerivatives, activeDerivativeCategory]);

  // Derivative SN Table Data for the active category modal
  const derivativeSNTableData = useMemo(() => {
    let list: any[] = [];

    if (selectedDerivativeGroup && selectedDerivativeGroup !== 'ALL') {
      const foundGroup = derivativesByGroup.find(g => g.groupName === selectedDerivativeGroup);
      if (foundGroup) {
        list = [...foundGroup.strategies];
      }
    } else {
      derivativesByGroup.forEach(g => {
        list.push(...g.strategies);
      });
    }

    if (derivativeModalFilterStatus === 'Realized') {
      list = list.filter(item => Math.abs(item.realizedPnL) > 0.001 || item.physicalPnLStatus === 'Realized');
    } else if (derivativeModalFilterStatus === 'Unrealized') {
      list = list.filter(item => Math.abs(item.unrealizedPnL) > 0.001 || item.physicalPnLStatus === 'Unrealized');
    }

    if (derivativeOnlyActive) {
      list = list.filter(item => item.hasTrades);
    }

    if (derivativeModalSearch.trim()) {
      const q = derivativeModalSearch.toLowerCase().trim();
      list = list.filter(item =>
        item.strategyName.toLowerCase().includes(q) ||
        (item.group && item.group.toLowerCase().includes(q)) ||
        (item.buyer && item.buyer.toLowerCase().includes(q)) ||
        (item.seller && item.seller.toLowerCase().includes(q)) ||
        (item.loadingMonth && item.loadingMonth.toLowerCase().includes(q)) ||
        (item.deliveryMonth && item.deliveryMonth.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      const valA = (a as any)[derivativeSortColumn];
      const valB = (b as any)[derivativeSortColumn];

      if (typeof valA === 'string') {
        return derivativeSortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return derivativeSortDirection === 'asc' ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
    });

    return list;
  }, [derivativesByGroup, selectedDerivativeGroup, derivativeModalFilterStatus, derivativeOnlyActive, derivativeModalSearch, derivativeSortColumn, derivativeSortDirection]);

  // Export Derivative data to CSV
  const handleExportDerivativeCSV = useCallback(() => {
    const cfg = DERIVATIVE_CONFIGS[activeDerivativeCategory];
    const catCode = cfg.code;

    if (selectedDerivativeGroup === null) {
      // Export Group Breakdown
      const headers = ['Group', 'Total SNs', `Active ${catCode} SNs`, `${catCode} Volume (MMBtu)`, `Realized ${catCode} PnL ($)`, `Unrealized ${catCode} PnL ($)`, `Total ${catCode} PnL ($)`, 'DoD Change ($)'];
      const rows = derivativesByGroup.map(g => [
        `"${g.groupName}"`,
        g.strategyCount,
        g.activeCount,
        Math.round(g.volume),
        g.realizedPnL.toFixed(2),
        g.unrealizedPnL.toFixed(2),
        g.totalPnL.toFixed(2),
        g.pnlChange.toFixed(2)
      ]);
      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `${catCode}_By_Group_${targetDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // Export SN Breakdown
      const headers = ['Strategy Name', 'Group', 'Status', 'Buyer', 'Seller', 'Loading Month', 'Delivery Month', `${catCode} Volume (MMBtu)`, `Realized ${catCode} PnL ($)`, `Unrealized ${catCode} PnL ($)`, `Total ${catCode} PnL ($)`, 'DoD Change ($)', `${catCode} Deals Count`];
      const rows = derivativeSNTableData.map(item => [
        `"${item.strategyName}"`,
        `"${item.group}"`,
        `"${item.physicalPnLStatus}"`,
        `"${item.buyer || ''}"`,
        `"${item.seller || ''}"`,
        `"${item.loadingMonth || ''}"`,
        `"${item.deliveryMonth || ''}"`,
        Math.round(item.vol || 0),
        (item.realizedPnL || 0).toFixed(2),
        (item.unrealizedPnL || 0).toFixed(2),
        (item.totalPnL || 0).toFixed(2),
        (item.pnlChange || 0).toFixed(2),
        item.dealRows ? item.dealRows.length : 0
      ]);
      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `${catCode}_SN_${selectedDerivativeGroup}_${targetDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, [activeDerivativeCategory, selectedDerivativeGroup, derivativesByGroup, derivativeSNTableData, targetDate]);

  // Aggregate stats helper for Total, Realized, Unrealized
  const aggregateStats = useCallback((summaries: TrmsStrategySummary[]) => {
    const initStats = (): BucketStats => ({ pnl: 0, revenue: 0, purchase: 0, other: 0, vol: 0, count: 0 });
    const acc = {
      total: initStats(),
      realized: initStats(),
      unrealized: initStats()
    };

    summaries.forEach(s => {
      const purchase = Math.abs(s.purchaseCost || 0);
      const revenue = Math.abs(s.salesRevenue || 0);
      const other = s.otherCosts !== undefined ? s.otherCosts : ((s.shippingRelatedCosts || 0) + (s.miscCost || 0));
      const pnl = (revenue - purchase) + other;
      const vol = (s.salesVolume > 0 ? s.salesVolume : s.purchaseVolume) || 0;
      const isReal = s.physicalPnLStatus === 'Realized';

      // Total
      acc.total.pnl += pnl;
      acc.total.revenue += revenue;
      acc.total.purchase += purchase;
      acc.total.other += other;
      acc.total.vol += vol;
      acc.total.count += 1;

      // Buckets
      if (isReal) {
        acc.realized.pnl += pnl;
        acc.realized.revenue += revenue;
        acc.realized.purchase += purchase;
        acc.realized.other += other;
        acc.realized.vol += vol;
        acc.realized.count += 1;
      } else {
        acc.unrealized.pnl += pnl;
        acc.unrealized.revenue += revenue;
        acc.unrealized.purchase += purchase;
        acc.unrealized.other += other;
        acc.unrealized.vol += vol;
        acc.unrealized.count += 1;
      }
    });

    return acc;
  }, []);

  const targetStats = useMemo(() => aggregateStats(targetSummaries), [aggregateStats, targetSummaries]);
  const baselineStats = useMemo(() => aggregateStats(baselineSummaries), [aggregateStats, baselineSummaries]);

  // Strategy-level movements between targetDate and baselineDate for the Ticker
  const strategyMovements = useMemo(() => {
    if (!baselineDate || !targetDate || baselineDate === targetDate) {
      return targetSummaries.map(s => {
        const other = s.otherCosts !== undefined ? s.otherCosts : ((s.shippingRelatedCosts || 0) + (s.miscCost || 0));
        const pnl = (Math.abs(s.salesRevenue || 0) - Math.abs(s.purchaseCost || 0)) + other;
        return { name: s.strategyName, delta: pnl };
      }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 40);
    }

    return targetSummaries.map(s => {
      const other = s.otherCosts !== undefined ? s.otherCosts : ((s.shippingRelatedCosts || 0) + (s.miscCost || 0));
      const pnl = (Math.abs(s.salesRevenue || 0) - Math.abs(s.purchaseCost || 0)) + other;
      const basePnl = baselinePnlMap.get(s.strategyName) || 0;
      const delta = pnl - basePnl;
      return { name: s.strategyName, delta };
    }).filter(m => Math.abs(m.delta) > 0.01).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [targetSummaries, baselinePnlMap, targetDate, baselineDate]);

  // Helper to open drilldown
  const handleOpenDrilldown = useCallback((bucket: BucketType, metric: DrillDownMetric) => {
    setActiveDrillDown({ bucket, metric });
    // Reset filters
    setModalSearch('');
    setFilterGroup('ALL');
    setFilterStatus(bucket === 'Total' ? 'ALL' : bucket);
    setFilterLoadingMonth('ALL');
    setFilterDeliveryMonth('ALL');
    setFilterBuyer('ALL');
    setFilterSeller('ALL');
    setFilterOptimization('ALL');
    setFilterAllocation('ALL');
    setSortColumn(metric === 'Purchase' ? 'purchaseCost' : metric === 'Revenue' ? 'salesRevenue' : metric === 'Volume' ? 'vol' : 'pnl');
    setSortDirection('desc');
  }, []);

  // Filter options for modal table
  const distinctFilterOptions = useMemo(() => {
    const groups = new Set<string>();
    const loadingMonths = new Set<string>();
    const deliveryMonths = new Set<string>();
    const buyers = new Set<string>();
    const sellers = new Set<string>();

    targetSummaries.forEach(s => {
      const g = getGroupName(s.strategyName);
      if (g) groups.add(g);
      if (s.loadingMonth && s.loadingMonth !== '—' && s.loadingMonth !== '') loadingMonths.add(s.loadingMonth);
      if (s.deliveryMonth && s.deliveryMonth !== '—' && s.deliveryMonth !== '') deliveryMonths.add(s.deliveryMonth);
      if (s.buyer && s.buyer !== '—' && s.buyer !== '') buyers.add(s.buyer);
      if (s.seller && s.seller !== '—' && s.seller !== '') sellers.add(s.seller);
    });

    return {
      groups: Array.from(groups).sort(),
      loadingMonths: Array.from(loadingMonths).sort(),
      deliveryMonths: Array.from(deliveryMonths).sort(),
      buyers: Array.from(buyers).sort(),
      sellers: Array.from(sellers).sort()
    };
  }, [targetSummaries]);

  // Filtered & Sorted items for modal table
  const modalTableData = useMemo(() => {
    if (!activeDrillDown) return [];

    let list = targetSummaries.map(s => {
      const purchaseCost = Math.abs(s.purchaseCost || 0);
      const salesRevenue = Math.abs(s.salesRevenue || 0);
      const src = s.shippingRelatedCosts || 0;
      const pnl = (salesRevenue - purchaseCost) + src;
      const prevPnl = baselinePnlMap.get(s.strategyName) || 0;
      const pnlChange = pnl - prevPnl;
      const purchaseVol = s.purchaseVolume || 0;
      const salesVol = s.salesVolume || 0;
      const netVol = salesVol > 0 ? salesVol : purchaseVol;
      const purchasePrice = purchaseVol > 0 ? purchaseCost / purchaseVol : 0;
      const salesPrice = salesVol > 0 ? salesRevenue / salesVol : 0;
      const group = getGroupName(s.strategyName);

      return {
        ...s,
        group,
        purchaseCost,
        salesRevenue,
        src,
        pnl,
        prevPnl,
        pnlChange,
        purchaseVol,
        salesVol,
        netVol,
        purchasePrice,
        salesPrice
      };
    });

    // Apply bucket initial filter
    if (activeDrillDown.bucket === 'Realized') {
      list = list.filter(item => item.physicalPnLStatus === 'Realized');
    } else if (activeDrillDown.bucket === 'Unrealized') {
      list = list.filter(item => item.physicalPnLStatus === 'Unrealized');
    }

    // Apply Non-Numerical Filters
    if (filterGroup !== 'ALL') {
      list = list.filter(item => item.group === filterGroup);
    }
    if (filterStatus !== 'ALL') {
      list = list.filter(item => item.physicalPnLStatus === filterStatus);
    }
    if (filterLoadingMonth !== 'ALL') {
      list = list.filter(item => item.loadingMonth === filterLoadingMonth);
    }
    if (filterDeliveryMonth !== 'ALL') {
      list = list.filter(item => item.deliveryMonth === filterDeliveryMonth);
    }
    if (filterBuyer !== 'ALL') {
      list = list.filter(item => item.buyer === filterBuyer);
    }
    if (filterSeller !== 'ALL') {
      list = list.filter(item => item.seller === filterSeller);
    }
    if (filterOptimization !== 'ALL') {
      list = list.filter(item => item.optimisationStatus === filterOptimization);
    }
    if (filterAllocation !== 'ALL') {
      list = list.filter(item => item.unallocatedCargo === filterAllocation);
    }

    // Apply text search
    if (modalSearch.trim()) {
      const q = modalSearch.toLowerCase().trim();
      list = list.filter(item => 
        item.strategyName.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q) ||
        item.buyer.toLowerCase().includes(q) ||
        item.seller.toLowerCase().includes(q) ||
        item.loadingMonth.toLowerCase().includes(q) ||
        item.deliveryMonth.toLowerCase().includes(q)
      );
    }

    // Sort items
    list.sort((a, b) => {
      let valA: any = (a as any)[sortColumn];
      let valB: any = (b as any)[sortColumn];

      if (typeof valA === 'string') {
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });

    return list;
  }, [
    activeDrillDown, 
    targetSummaries, 
    baselinePnlMap, 
    filterGroup, 
    filterStatus, 
    filterLoadingMonth, 
    filterDeliveryMonth, 
    filterBuyer, 
    filterSeller, 
    filterOptimization, 
    filterAllocation, 
    modalSearch, 
    sortColumn, 
    sortDirection
  ]);

  // Handle column header sort
  const handleSort = (colKey: string) => {
    if (sortColumn === colKey) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(colKey);
      setSortDirection('desc');
    }
  };

  // CSV Export for Drill-down
  const handleExportCSV = useCallback(() => {
    if (modalTableData.length === 0) return;
    const headers = [
      'Strategy Name', 'Group', 'Status', 'Loading Month', 'Delivery Month', 
      'Buyer', 'Seller', 'Purchase Volume (MMBtu)', 'Purchase Price ($/MMBtu)', 
      'Purchase Cost Total ($)', 'Sales Volume (MMBtu)', 'Sales Price ($/MMBtu)', 
      'Sales Revenue Total ($)', 'Shipping/SRC ($)', 'Physical P&L ($)', 'P&L Change vs Yesterday ($)'
    ];

    const rows = modalTableData.map(item => [
      `"${item.strategyName.replace(/"/g, '""')}"`,
      `"${item.group.replace(/"/g, '""')}"`,
      `"${item.physicalPnLStatus}"`,
      `"${item.loadingMonth || ''}"`,
      `"${item.deliveryMonth || ''}"`,
      `"${(item.buyer || '').replace(/"/g, '""')}"`,
      `"${(item.seller || '').replace(/"/g, '""')}"`,
      item.purchaseVol,
      item.purchasePrice.toFixed(4),
      item.purchaseCost,
      item.salesVol,
      item.salesPrice.toFixed(4),
      item.salesRevenue,
      item.src,
      item.pnl,
      item.pnlChange
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `TRMS_Executive_${activeDrillDown?.bucket}_${activeDrillDown?.metric}_${targetDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [modalTableData, activeDrillDown, targetDate]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filterGroup !== 'ALL') count++;
    if (filterStatus !== 'ALL' && activeDrillDown?.bucket === 'Total') count++;
    if (filterLoadingMonth !== 'ALL') count++;
    if (filterDeliveryMonth !== 'ALL') count++;
    if (filterBuyer !== 'ALL') count++;
    if (filterSeller !== 'ALL') count++;
    if (filterOptimization !== 'ALL') count++;
    if (filterAllocation !== 'ALL') count++;
    if (modalSearch.trim()) count++;
    return count;
  }, [filterGroup, filterStatus, filterLoadingMonth, filterDeliveryMonth, filterBuyer, filterSeller, filterOptimization, filterAllocation, modalSearch, activeDrillDown]);

  const handleClearAllFilters = () => {
    setModalSearch('');
    setFilterGroup('ALL');
    setFilterStatus(activeDrillDown?.bucket === 'Total' ? 'ALL' : activeDrillDown?.bucket || 'ALL');
    setFilterLoadingMonth('ALL');
    setFilterDeliveryMonth('ALL');
    setFilterBuyer('ALL');
    setFilterSeller('ALL');
    setFilterOptimization('ALL');
    setFilterAllocation('ALL');
  };

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const itemVariants = { hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0 } };

  return (
    <motion.div 
      className="flex-1 flex flex-col min-h-0 space-y-4 lg:space-y-6 overflow-y-auto custom-scrollbar p-1"
      variants={containerVariants} 
      initial="hidden" 
      animate="visible"
    >
      
      {/* 1. TOP HEADER & COMPARISON BASIS CONTROLS */}
      <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-sm gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-wide px-1">Portfolio Group:</span>
            <select 
              value={selectedGroup} 
              onChange={(e) => setSelectedGroup(e.target.value)} 
              className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 rounded-lg px-3 py-1.5 outline-none transition-colors cursor-pointer"
            >
              <option value="All">All Portfolios ({GROUPS.length + 1})</option>
              {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              <option value="Others">Others</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-wide px-1">PLSB Year:</span>
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(e.target.value)} 
              className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 rounded-lg px-3 py-1.5 outline-none transition-colors cursor-pointer"
            >
              <option value="all">All Years</option>
              {availableYears.map(yr => <option key={yr} value={yr}>{yr}</option>)}
            </select>
          </div>
        </div>

        {/* Basis Comparison: Yesterday vs Today */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex flex-1 items-center justify-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
            <span className="text-[9px] font-black text-slate-400 uppercase px-2">Basis:</span>
            <select 
              value={baselineDate} 
              onChange={(e) => setBaselineDate(e.target.value)} 
              className="bg-white border border-slate-200 text-[10px] sm:text-xs font-medium text-slate-600 rounded-lg px-2.5 py-1 outline-none shadow-sm cursor-pointer"
            >
              {availableDates.length === 0 && <option value="all">No EOD Runs</option>}
              {availableDates.map((d: string) => (
                <option key={d} value={d}>
                  {d} {d === availableDates[1] ? '(Yesterday)' : ''}
                </option>
              ))}
            </select>
            <span className="text-slate-400 font-bold">→</span>
            <select 
              value={targetDate} 
              onChange={(e) => setTargetDate(e.target.value)} 
              className="bg-white border border-blue-200 text-[10px] sm:text-xs font-bold text-blue-700 rounded-lg px-2.5 py-1 outline-none shadow-sm cursor-pointer"
            >
              {availableDates.length === 0 && <option value="all">All EOD Data</option>}
              {availableDates.map((d: string) => (
                <option key={d} value={d}>
                  {d} {d === availableDates[0] ? '(Latest EOD)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 2. THE TOP DASHBOARD FINANCIAL HERO CARDS (Matching App Dashboard Top Cards) */}
      <div className="space-y-4">
        
        {/* ROW 1: TOTAL PHYSICAL P&L & PORTFOLIO GROSS VOLUME */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FinancialHeroCard 
            title="Total Physical P&L" 
            bucket="Total"
            stats={targetStats.total} 
            baseline={baselineStats.total} 
            compareDate={baselineDate} 
            isHero 
            onDrillDown={(metric: DrillDownMetric) => handleOpenDrilldown('Total', metric)}
          />
          <StatCard 
            title="Portfolio Gross Volume" 
            value={targetStats.total.vol} 
            prevValue={baselineStats.total.vol} 
            compareDate={baselineDate} 
            suffix=" MMBtu" 
            colorClass="text-slate-800" 
            hint={`${targetStats.total.count} Strategies`}
            onClick={() => handleOpenDrilldown('Total', 'Volume')}
          />
        </div>

        {/* ROW 2: REALIZED & UNREALIZED PHYSICAL P&L CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FinancialHeroCard 
            title="Realized Physical P&L" 
            bucket="Realized"
            stats={targetStats.realized} 
            baseline={baselineStats.realized} 
            compareDate={baselineDate} 
            colorClass="text-blue-600"
            badgeText="Settled / Actualized"
            onDrillDown={(metric: DrillDownMetric) => handleOpenDrilldown('Realized', metric)}
          />
          <FinancialHeroCard 
            title="Unrealized Physical P&L" 
            bucket="Unrealized"
            stats={targetStats.unrealized} 
            baseline={baselineStats.unrealized} 
            compareDate={baselineDate} 
            colorClass="text-amber-600"
            badgeText="Open / Forward"
            onDrillDown={(metric: DrillDownMetric) => handleOpenDrilldown('Unrealized', metric)}
          />
        </div>

        {/* ROW 3: DERIVATIVE & HEDGING PORTFOLIOS (Physical Hedging, DH, DFT) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DerivativeHeroCard
            category="PHYSICAL_HEDGING"
            stats={targetDerivativesStats.PHYSICAL_HEDGING}
            baseline={baselineDerivativesStats.PHYSICAL_HEDGING}
            compareDate={baselineDate}
            onOpenModal={(group?: string | null, status?: 'ALL' | 'Realized' | 'Unrealized') => {
              setActiveDerivativeCategory('PHYSICAL_HEDGING');
              setIsDerivativesModalOpen(true);
              setSelectedDerivativeGroup(group !== undefined ? group : null);
              if (status) setDerivativeModalFilterStatus(status);
            }}
          />
          <DerivativeHeroCard
            category="DH"
            stats={targetDerivativesStats.DH}
            baseline={baselineDerivativesStats.DH}
            compareDate={baselineDate}
            onOpenModal={(group?: string | null, status?: 'ALL' | 'Realized' | 'Unrealized') => {
              setActiveDerivativeCategory('DH');
              setIsDerivativesModalOpen(true);
              setSelectedDerivativeGroup(group !== undefined ? group : null);
              if (status) setDerivativeModalFilterStatus(status);
            }}
          />
          <DerivativeHeroCard
            category="DFT"
            stats={targetDerivativesStats.DFT}
            baseline={baselineDerivativesStats.DFT}
            compareDate={baselineDate}
            onOpenModal={(group?: string | null, status?: 'ALL' | 'Realized' | 'Unrealized') => {
              setActiveDerivativeCategory('DFT');
              setIsDerivativesModalOpen(true);
              setSelectedDerivativeGroup(group !== undefined ? group : null);
              if (status) setDerivativeModalFilterStatus(status);
            }}
          />
        </div>

      </div>

      {/* 3. THE TICKER (Change in P&L from Yesterday) */}
      <motion.div variants={itemVariants}>
        <StrategyTicker 
          movements={strategyMovements} 
          baselineDate={baselineDate} 
          onStrategyClick={(name) => {
            if (onCargoClick) onCargoClick(name);
            handleOpenDrilldown('Total', 'PnL');
            setModalSearch(name);
          }}
        />
      </motion.div>

      {/* 4. COMPREHENSIVE DRILL-DOWN MODAL WITH RELEVANT COLUMNS & ADVANCED FILTERS */}
      <AnimatePresence>
        {activeDrillDown && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-2 sm:p-4 lg:p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              className="bg-white w-full max-w-7xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
            >
              {/* Modal Top Header */}
              <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${
                    activeDrillDown.metric === 'Purchase' ? 'bg-rose-50 text-rose-600' :
                    activeDrillDown.metric === 'Revenue' ? 'bg-indigo-50 text-indigo-600' :
                    activeDrillDown.metric === 'Other' ? 'bg-purple-50 text-purple-600' :
                    activeDrillDown.metric === 'Volume' ? 'bg-slate-100 text-slate-800' :
                    activeDrillDown.bucket === 'Realized' ? 'bg-blue-50 text-blue-600' :
                    activeDrillDown.bucket === 'Unrealized' ? 'bg-amber-50 text-amber-600' :
                    'bg-emerald-50 text-emerald-600'
                  }`}>
                    {activeDrillDown.metric === 'Purchase' ? <ArrowDownRight className="w-5 h-5" /> :
                     activeDrillDown.metric === 'Revenue' ? <ArrowUpRight className="w-5 h-5" /> :
                     activeDrillDown.metric === 'Other' ? <Ship className="w-5 h-5" /> :
                     activeDrillDown.metric === 'Volume' ? <Boxes className="w-5 h-5" /> :
                     <DollarSign className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                        {activeDrillDown.bucket} {activeDrillDown.metric === 'Other' ? 'Shipping / SRC' : activeDrillDown.metric} Analysis
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        activeDrillDown.bucket === 'Realized' ? 'bg-blue-100 text-blue-800' :
                        activeDrillDown.bucket === 'Unrealized' ? 'bg-amber-100 text-amber-800' :
                        'bg-slate-200 text-slate-800'
                      }`}>
                        {activeDrillDown.bucket}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                      Showing {modalTableData.length} strategies • EOD {targetDate} vs {baselineDate}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportCSV}
                    className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                  <button
                    onClick={() => setActiveDrillDown(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Comprehensive Filter Toolbar for Non-Numerical Columns */}
              <div className="p-3 sm:p-4 bg-slate-50/50 border-b border-slate-200 shrink-0 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Search Box */}
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search strategy, buyer, seller..."
                      value={modalSearch}
                      onChange={(e) => setModalSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                    />
                    {modalSearch && (
                      <button 
                        onClick={() => setModalSearch('')} 
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Group Filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Group:</span>
                    <select
                      value={filterGroup}
                      onChange={(e) => setFilterGroup(e.target.value)}
                      className="bg-white border border-slate-200 text-xs font-semibold text-slate-700 rounded-xl px-2.5 py-1.5 outline-none shadow-sm cursor-pointer"
                    >
                      <option value="ALL">All Groups</option>
                      {distinctFilterOptions.groups.map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>

                  {/* Status Filter (Realized vs Unrealized) */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Status:</span>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="bg-white border border-slate-200 text-xs font-semibold text-slate-700 rounded-xl px-2.5 py-1.5 outline-none shadow-sm cursor-pointer"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="Realized">Realized</option>
                      <option value="Unrealized">Unrealized</option>
                    </select>
                  </div>

                  {/* Loading Month Filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Loading Month:</span>
                    <select
                      value={filterLoadingMonth}
                      onChange={(e) => setFilterLoadingMonth(e.target.value)}
                      className="bg-white border border-slate-200 text-xs font-semibold text-slate-700 rounded-xl px-2.5 py-1.5 outline-none shadow-sm cursor-pointer"
                    >
                      <option value="ALL">All Loading</option>
                      {distinctFilterOptions.loadingMonths.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  {/* Delivery Month Filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Delivery Month:</span>
                    <select
                      value={filterDeliveryMonth}
                      onChange={(e) => setFilterDeliveryMonth(e.target.value)}
                      className="bg-white border border-slate-200 text-xs font-semibold text-slate-700 rounded-xl px-2.5 py-1.5 outline-none shadow-sm cursor-pointer"
                    >
                      <option value="ALL">All Delivery</option>
                      {distinctFilterOptions.deliveryMonths.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  {/* Buyer Filter */}
                  {distinctFilterOptions.buyers.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Buyer:</span>
                      <select
                        value={filterBuyer}
                        onChange={(e) => setFilterBuyer(e.target.value)}
                        className="bg-white border border-slate-200 text-xs font-semibold text-slate-700 rounded-xl px-2.5 py-1.5 outline-none shadow-sm cursor-pointer max-w-[140px] truncate"
                      >
                        <option value="ALL">All Buyers</option>
                        {distinctFilterOptions.buyers.map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Seller Filter */}
                  {distinctFilterOptions.sellers.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Seller:</span>
                      <select
                        value={filterSeller}
                        onChange={(e) => setFilterSeller(e.target.value)}
                        className="bg-white border border-slate-200 text-xs font-semibold text-slate-700 rounded-xl px-2.5 py-1.5 outline-none shadow-sm cursor-pointer max-w-[140px] truncate"
                      >
                        <option value="ALL">All Sellers</option>
                        {distinctFilterOptions.sellers.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Clear Filters Button */}
                  {activeFiltersCount > 0 && (
                    <button
                      onClick={handleClearAllFilters}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset ({activeFiltersCount})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Modal Table Body (Dynamic Columns based on active metric) */}
              <div className="flex-1 overflow-auto custom-scrollbar p-3 sm:p-4">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200 sticky top-0 z-10 select-none shadow-xs">
                    <tr>
                      {/* Strategy Name */}
                      <th 
                        onClick={() => handleSort('strategyName')} 
                        className="px-3 py-2.5 cursor-pointer hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center gap-1">
                          <span>Strategy Name</span>
                          {sortColumn === 'strategyName' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />)}
                        </div>
                      </th>

                      {/* Group */}
                      <th 
                        onClick={() => handleSort('group')} 
                        className="px-3 py-2.5 cursor-pointer hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center gap-1">
                          <span>Group</span>
                          {sortColumn === 'group' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />)}
                        </div>
                      </th>

                      {/* Status */}
                      <th 
                        onClick={() => handleSort('physicalPnLStatus')} 
                        className="px-3 py-2.5 cursor-pointer hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center gap-1">
                          <span>Status</span>
                          {sortColumn === 'physicalPnLStatus' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />)}
                        </div>
                      </th>

                      {/* Loading Month (Always shown for context) */}
                      <th 
                        onClick={() => handleSort('loadingMonth')} 
                        className="px-3 py-2.5 cursor-pointer hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center gap-1">
                          <span>Loading Month</span>
                          {sortColumn === 'loadingMonth' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />)}
                        </div>
                      </th>

                      {/* Delivery Month (Always shown for context) */}
                      <th 
                        onClick={() => handleSort('deliveryMonth')} 
                        className="px-3 py-2.5 cursor-pointer hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center gap-1">
                          <span>Delivery Month</span>
                          {sortColumn === 'deliveryMonth' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />)}
                        </div>
                      </th>

                      {/* CONDITIONAL COLUMNS: PURCHASE METRIC */}
                      {(activeDrillDown.metric === 'Purchase' || activeDrillDown.metric === 'PnL') && (
                        <>
                          <th 
                            onClick={() => handleSort('purchaseVol')} 
                            className="px-3 py-2.5 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>Purchase Vol</span>
                              {sortColumn === 'purchaseVol' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />)}
                            </div>
                          </th>
                          <th 
                            onClick={() => handleSort('purchasePrice')} 
                            className="px-3 py-2.5 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>Purchase Price</span>
                              {sortColumn === 'purchasePrice' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />)}
                            </div>
                          </th>
                          <th 
                            onClick={() => handleSort('purchaseCost')} 
                            className="px-3 py-2.5 text-right cursor-pointer hover:bg-slate-100 transition-colors text-rose-600"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>Purchase Cost Total</span>
                              {sortColumn === 'purchaseCost' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />)}
                            </div>
                          </th>
                        </>
                      )}

                      {/* CONDITIONAL COLUMNS: REVENUE METRIC */}
                      {(activeDrillDown.metric === 'Revenue' || activeDrillDown.metric === 'PnL') && (
                        <>
                          <th 
                            onClick={() => handleSort('salesVol')} 
                            className="px-3 py-2.5 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>Sales Vol</span>
                              {sortColumn === 'salesVol' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />)}
                            </div>
                          </th>
                          <th 
                            onClick={() => handleSort('salesPrice')} 
                            className="px-3 py-2.5 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>Sales Price</span>
                              {sortColumn === 'salesPrice' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />)}
                            </div>
                          </th>
                          <th 
                            onClick={() => handleSort('salesRevenue')} 
                            className="px-3 py-2.5 text-right cursor-pointer hover:bg-slate-100 transition-colors text-indigo-600"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>Sales Revenue Total</span>
                              {sortColumn === 'salesRevenue' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />)}
                            </div>
                          </th>
                        </>
                      )}

                      {/* CONDITIONAL COLUMNS: SHIPPING / OTHER METRIC */}
                      {(activeDrillDown.metric === 'Other' || activeDrillDown.metric === 'PnL') && (
                        <th 
                          onClick={() => handleSort('src')} 
                          className="px-3 py-2.5 text-right cursor-pointer hover:bg-slate-100 transition-colors text-purple-600"
                        >
                          <div className="flex items-center justify-end gap-1">
                            <span>Shipping / SRC</span>
                            {sortColumn === 'src' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />)}
                          </div>
                        </th>
                      )}

                      {/* CONDITIONAL COLUMNS: VOLUME METRIC */}
                      {activeDrillDown.metric === 'Volume' && (
                        <>
                          <th 
                            onClick={() => handleSort('purchaseVol')} 
                            className="px-3 py-2.5 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>Purchase Vol (MMBtu)</span>
                              {sortColumn === 'purchaseVol' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />)}
                            </div>
                          </th>
                          <th 
                            onClick={() => handleSort('salesVol')} 
                            className="px-3 py-2.5 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>Sales Vol (MMBtu)</span>
                              {sortColumn === 'salesVol' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />)}
                            </div>
                          </th>
                          <th 
                            onClick={() => handleSort('netVol')} 
                            className="px-3 py-2.5 text-right cursor-pointer hover:bg-slate-100 transition-colors font-bold text-slate-800"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>Total Vol</span>
                              {sortColumn === 'netVol' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />)}
                            </div>
                          </th>
                        </>
                      )}

                      {/* PHYSICAL P&L (Always shown) */}
                      <th 
                        onClick={() => handleSort('pnl')} 
                        className="px-3 py-2.5 text-right cursor-pointer hover:bg-slate-100 transition-colors font-bold text-slate-800"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Physical P&L</span>
                          {sortColumn === 'pnl' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />)}
                        </div>
                      </th>

                      {/* CHANGE IN P&L (Day over Day movement) */}
                      <th 
                        onClick={() => handleSort('pnlChange')} 
                        className="px-3 py-2.5 text-right cursor-pointer hover:bg-slate-100 transition-colors text-slate-700"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Change in P&L</span>
                          {sortColumn === 'pnlChange' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />)}
                        </div>
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 font-mono">
                    {modalTableData.length === 0 ? (
                      <tr>
                        <td colSpan={14} className="py-12 text-center text-slate-400 font-sans">
                          No matching strategies found for the selected filters.
                        </td>
                      </tr>
                    ) : (
                      modalTableData.map(item => {
                        const isReal = item.physicalPnLStatus === 'Realized';
                        const isPositiveChange = item.pnlChange >= 0;

                        return (
                          <tr 
                            key={item.strategyName} 
                            onClick={() => {
                              if (onCargoClick) onCargoClick(item.strategyName);
                            }}
                            className="hover:bg-indigo-50/40 transition-colors cursor-pointer group"
                          >
                            {/* Strategy Name */}
                            <td className="px-3 py-2.5 font-bold text-slate-900 font-sans group-hover:text-indigo-600 transition-colors">
                              {item.strategyName}
                            </td>

                            {/* Group */}
                            <td className="px-3 py-2.5 text-slate-600 font-sans">
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold text-[10px]">
                                {item.group}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="px-3 py-2.5">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-sans ${
                                isReal ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-amber-50 text-amber-600 border border-amber-200'
                              }`}>
                                {item.physicalPnLStatus}
                              </span>
                            </td>

                            {/* Loading Month */}
                            <td className="px-3 py-2.5 text-slate-600 font-sans font-medium">
                              {item.loadingMonth || '—'}
                            </td>

                            {/* Delivery Month */}
                            <td className="px-3 py-2.5 text-slate-600 font-sans font-medium">
                              {item.deliveryMonth || '—'}
                            </td>

                            {/* PURCHASE METRICS */}
                            {(activeDrillDown.metric === 'Purchase' || activeDrillDown.metric === 'PnL') && (
                              <>
                                <td className="px-3 py-2.5 text-right text-slate-600">
                                  {item.purchaseVol > 0 ? Math.round(item.purchaseVol).toLocaleString() : '—'}
                                </td>
                                <td className="px-3 py-2.5 text-right text-slate-600">
                                  {item.purchasePrice > 0 ? `$${item.purchasePrice.toFixed(2)}` : '—'}
                                </td>
                                <td className="px-3 py-2.5 text-right text-rose-600 font-semibold">
                                  {item.purchaseCost > 0 ? formatCurrency(item.purchaseCost) : '$0'}
                                </td>
                              </>
                            )}

                            {/* REVENUE METRICS */}
                            {(activeDrillDown.metric === 'Revenue' || activeDrillDown.metric === 'PnL') && (
                              <>
                                <td className="px-3 py-2.5 text-right text-slate-600">
                                  {item.salesVol > 0 ? Math.round(item.salesVol).toLocaleString() : '—'}
                                </td>
                                <td className="px-3 py-2.5 text-right text-slate-600">
                                  {item.salesPrice > 0 ? `$${item.salesPrice.toFixed(2)}` : '—'}
                                </td>
                                <td className="px-3 py-2.5 text-right text-indigo-600 font-semibold">
                                  {item.salesRevenue > 0 ? formatCurrency(item.salesRevenue) : '$0'}
                                </td>
                              </>
                            )}

                            {/* SHIPPING / OTHER */}
                            {(activeDrillDown.metric === 'Other' || activeDrillDown.metric === 'PnL') && (
                              <td className="px-3 py-2.5 text-right text-purple-600 font-semibold">
                                {formatCurrency(item.src)}
                              </td>
                            )}

                            {/* VOLUME METRICS */}
                            {activeDrillDown.metric === 'Volume' && (
                              <>
                                <td className="px-3 py-2.5 text-right text-slate-600">
                                  {item.purchaseVol > 0 ? Math.round(item.purchaseVol).toLocaleString() : '—'}
                                </td>
                                <td className="px-3 py-2.5 text-right text-slate-600">
                                  {item.salesVol > 0 ? Math.round(item.salesVol).toLocaleString() : '—'}
                                </td>
                                <td className="px-3 py-2.5 text-right text-slate-900 font-bold">
                                  {item.netVol > 0 ? Math.round(item.netVol).toLocaleString() : '—'}
                                </td>
                              </>
                            )}

                            {/* PHYSICAL P&L */}
                            <td className={`px-3 py-2.5 text-right font-black ${item.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {formatCurrency(item.pnl)}
                            </td>

                            {/* CHANGE IN P&L (Day over Day movement) */}
                            <td className="px-3 py-2.5 text-right">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                                Math.abs(item.pnlChange) < 0.01 
                                  ? 'text-slate-400 bg-slate-100' 
                                  : isPositiveChange 
                                  ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' 
                                  : 'text-rose-700 bg-rose-50 border border-rose-200'
                              }`}>
                                {Math.abs(item.pnlChange) < 0.01 ? (
                                  '— $0'
                                ) : (
                                  <>
                                    <span>{isPositiveChange ? '▲' : '▼'}</span>
                                    <span>{formatCurrency(Math.abs(item.pnlChange))}</span>
                                  </>
                                )}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Modal Footer Summary */}
              <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0 text-xs text-slate-500 font-medium">
                <div>
                  Showing <span className="font-bold text-slate-800">{modalTableData.length}</span> strategies in view.
                </div>
                <div className="flex items-center gap-4 font-mono font-bold">
                  {activeDrillDown.metric === 'Purchase' && (
                    <span className="text-rose-600">
                      Total Purchase: {formatCurrency(modalTableData.reduce((acc, i) => acc + i.purchaseCost, 0))}
                    </span>
                  )}
                  {activeDrillDown.metric === 'Revenue' && (
                    <span className="text-indigo-600">
                      Total Revenue: {formatCurrency(modalTableData.reduce((acc, i) => acc + i.salesRevenue, 0))}
                    </span>
                  )}
                  {activeDrillDown.metric === 'Volume' && (
                    <span className="text-slate-800">
                      Total Vol: {Math.round(modalTableData.reduce((acc, i) => acc + i.netVol, 0)).toLocaleString()} MMBtu
                    </span>
                  )}
                  <span className="text-emerald-600">
                    Net Physical P&L: {formatCurrency(modalTableData.reduce((acc, i) => acc + i.pnl, 0))}
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* DERIVATIVES & HEDGING DRILL-DOWN MODAL (Group -> SN -> Trade Details for Physical Hedging, DH, DFT) */}
        {isDerivativesModalOpen && (
          <DerivativePortfolioModal
            isOpen={isDerivativesModalOpen}
            onClose={() => setIsDerivativesModalOpen(false)}
            activeCategory={activeDerivativeCategory}
            onSelectCategory={(cat: DerivativeCategory) => {
              setActiveDerivativeCategory(cat);
              setSelectedDerivativeGroup(null);
            }}
            targetDate={targetDate}
            baselineDate={baselineDate}
            selectedGroup={selectedDerivativeGroup}
            onSelectGroup={(g) => setSelectedDerivativeGroup(g)}
            filterStatus={derivativeModalFilterStatus}
            onFilterStatusChange={(st) => setDerivativeModalFilterStatus(st)}
            searchQuery={derivativeModalSearch}
            onSearchChange={(q) => setDerivativeModalSearch(q)}
            onlyActive={derivativeOnlyActive}
            onToggleOnlyActive={(val) => setDerivativeOnlyActive(val)}
            sortColumn={derivativeSortColumn}
            sortDirection={derivativeSortDirection}
            onSort={(col) => {
              if (derivativeSortColumn === col) {
                setDerivativeSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
              } else {
                setDerivativeSortColumn(col);
                setDerivativeSortDirection('desc');
              }
            }}
            expandedSN={expandedDerivativeSN}
            onToggleExpandSN={(sn) => setExpandedDerivativeSN(prev => prev === sn ? null : sn)}
            overviewStats={targetDerivativesStats}
            baselineStats={baselineDerivativesStats}
            groupsData={derivativesByGroup}
            snData={derivativeSNTableData}
            onCargoClick={onCargoClick}
            onExportCSV={handleExportDerivativeCSV}
          />
        )}
      </AnimatePresence>

    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* FINANCIAL HERO CARD (Matching App Dashboard Top Card Pattern)             */
/* -------------------------------------------------------------------------- */
const FinancialHeroCard = ({ title, stats, baseline, compareDate, isHero, colorClass, badgeText, onDrillDown }: any) => {
  const delta = stats.pnl - (baseline ? baseline.pnl : 0);
  const isPositive = delta >= 0;

  return (
    <motion.div 
      className={`bg-white p-4 sm:p-6 rounded-2xl shadow-sm border transition-all flex flex-col justify-between h-full ${
        isHero ? 'border-indigo-100 ring-2 ring-indigo-50/50' : 'border-slate-100'
      } hover:shadow-md hover:-translate-y-0.5`}
      variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
    >
      <div className="cursor-pointer" onClick={() => onDrillDown('PnL')}>
        <div className="flex justify-between items-start mb-2 sm:mb-4">
          <div className="flex flex-col">
            <p className={`text-[10px] sm:text-xs font-black uppercase tracking-widest ${isHero ? 'text-indigo-500' : 'text-slate-400'}`}>
              {title}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase">{stats.count} Strategies</p>
              {badgeText && (
                <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-slate-100 text-slate-500">
                  {badgeText}
                </span>
              )}
            </div>
          </div>
          
          {/* Day-over-Day Delta Badge */}
          <div className="flex items-center gap-2">
            <div className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg text-[8px] sm:text-[10px] font-bold ${
              isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
            }`}>
              {isPositive ? '▲' : '▼'} {formatCurrency(Math.abs(delta))}
            </div>
          </div>
        </div>

        {/* Primary PnL Number */}
        <div className={`font-black ${stats.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'} ${colorClass || ''}`}>
          <AutoScalingText maxFontSize={30} minFontSize={14}>
            {formatCurrency(stats.pnl)}
          </AutoScalingText>
        </div>
        <p className="text-[8px] sm:text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-tight">
          vs Basis: {compareDate || 'Previous'}
        </p>
      </div>

      {/* Sub-Metric Split: Sales Revenue, Purchase Cost, Shipping/Other */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-4 sm:mt-8 pt-4 sm:pt-6 border-t border-slate-50">
        <SubMetric 
          label="Rev" 
          fullLabel="Revenue" 
          value={stats.revenue} 
          baseline={baseline ? baseline.revenue : 0} 
          color="text-indigo-600" 
          onClick={() => onDrillDown('Revenue')} 
        />
        <SubMetric 
          label="Cost" 
          fullLabel="Purchase" 
          value={stats.purchase} 
          baseline={baseline ? baseline.purchase : 0} 
          color="text-rose-500" 
          invert 
          onClick={() => onDrillDown('Purchase')} 
        />
        <SubMetric 
          label="Misc" 
          fullLabel="Shipping/SRC" 
          value={stats.other} 
          baseline={baseline ? baseline.other : 0} 
          color="text-slate-600" 
          onClick={() => onDrillDown('Other')} 
        />
      </div>
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* SUB-METRIC CELL WITH CLICK & DELTA                                         */
/* -------------------------------------------------------------------------- */
const SubMetric = ({ label, fullLabel, value, baseline, color, invert, onClick }: any) => {
  const delta = value - (baseline || 0);
  const isImproved = invert ? delta <= 0 : delta >= 0;
  
  return (
    <div className="cursor-pointer group/sub" onClick={(e: React.MouseEvent) => { e.stopPropagation(); onClick(); }}>
      <p className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-0.5 group-hover/sub:text-indigo-600 transition-colors">
        <span className="sm:hidden">{label}</span>
        <span className="hidden sm:inline">{fullLabel}</span>
      </p>
      <p className={`text-[10px] sm:text-xs font-bold ${color}`}>{formatCurrency(value)}</p>
      <div className={`text-[7px] sm:text-[8px] font-bold mt-0.5 ${isImproved ? 'text-emerald-500' : 'text-rose-400'}`}>
        {delta >= 0 ? '+' : '-'}{formatCurrency(Math.abs(delta))}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* VOLUME STAT CARD                                                           */
/* -------------------------------------------------------------------------- */
const StatCard = ({ title, value, prevValue, compareDate, suffix, colorClass, onClick, isHero, hint }: any) => {
  let delta = null;
  let isPositive = false;
  if (prevValue !== undefined && prevValue !== null && typeof value === 'number') {
    delta = value - prevValue;
    isPositive = delta >= 0;
  }
  const displayVal = typeof value === 'number' ? Math.round(value).toLocaleString() : value;

  return (
    <motion.div 
      className={`bg-white p-4 sm:p-6 rounded-2xl shadow-sm border transition-all h-full ${
        isHero ? 'border-indigo-100 ring-1 ring-indigo-50/50' : 'border-slate-100'
      } ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''}`} 
      variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }} 
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-2">
        <p className={`text-[10px] sm:text-xs font-black uppercase tracking-widest ${isHero ? 'text-indigo-500' : 'text-slate-400'}`}>
          {title}
        </p>
        {hint && <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase bg-slate-100 px-2 py-0.5 rounded-full">{hint}</span>}
      </div>
      <div className={`font-black ${colorClass}`}>
        <AutoScalingText maxFontSize={30} minFontSize={14}>
          {displayVal}{suffix}
        </AutoScalingText>
      </div>
      {delta !== null && (
        <div className="flex items-center gap-1.5 mt-2 text-[8px] sm:text-[10px] font-bold">
          <span className={isPositive ? 'text-emerald-500' : 'text-rose-500'}>
            {isPositive ? '▲' : '▼'} {Math.round(Math.abs(delta)).toLocaleString()} MMBtu
          </span>
          <span className="text-slate-400 font-normal">vs {compareDate}</span>
        </div>
      )}
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* STRATEGY TICKER (Day-over-Day P&L change in TRMS Summary Table)             */
/* -------------------------------------------------------------------------- */
const StrategyTicker = ({ 
  movements, 
  baselineDate, 
  onStrategyClick 
}: { 
  movements: { name: string; delta: number }[]; 
  baselineDate: string; 
  onStrategyClick?: (name: string) => void;
}) => {
  if (movements.length === 0) return null;

  return (
    <div className="bg-slate-900 py-2.5 rounded-xl overflow-hidden whitespace-nowrap border border-slate-800 relative shadow-inner">
      <div className="flex animate-marquee-slower items-center">
        {[...movements, ...movements, ...movements].map((m, i) => (
          <div 
            key={i} 
            onClick={() => onStrategyClick && onStrategyClick(m.name)}
            className="flex items-center gap-2 mx-5 sm:mx-7 text-[10px] sm:text-[11px] font-black cursor-pointer hover:opacity-80 transition-opacity"
          >
            <span className="text-slate-300 uppercase tracking-wider">{m.name}</span>
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${
              Math.abs(m.delta) < 0.01 
                ? 'bg-slate-800 text-slate-400 border border-slate-700' 
                : m.delta >= 0 
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
            }`}>
              <span>{m.delta >= 0 ? '▲' : '▼'}</span>
              <span className="font-mono">{formatCurrency(Math.abs(m.delta))}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="absolute right-0 top-0 h-full w-12 sm:w-20 bg-gradient-to-l from-slate-900 to-transparent pointer-events-none z-10" />
      <div className="absolute left-0 top-0 h-full w-12 sm:w-20 bg-gradient-to-r from-slate-900 to-transparent pointer-events-none z-10" />
      <div className="absolute top-0 left-2 sm:left-3 h-full flex items-center z-20">
        <span className="text-[7px] sm:text-[8px] font-black text-slate-300 uppercase bg-slate-800 px-1.5 py-0.5 border border-slate-700 rounded shadow-sm">
          DAY-OVER-DAY P&amp;L (vs {baselineDate || 'Yesterday'})
        </span>
      </div>
      <style>{`
        @keyframes marquee-slower {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.33%); }
        }
        .animate-marquee-slower {
          animation: marquee-slower 55s linear infinite;
        }
        .animate-marquee-slower:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* DERIVATIVE & HEDGING HERO CARD (Physical Hedging, DH, DFT)                 */
/* -------------------------------------------------------------------------- */
interface DerivativeHeroCardProps {
  category: DerivativeCategory;
  stats: any;
  baseline: any;
  compareDate: string;
  onOpenModal: (group?: string | null, status?: 'ALL' | 'Realized' | 'Unrealized') => void;
}

const DerivativeHeroCard: React.FC<DerivativeHeroCardProps> = ({
  category,
  stats = { totalPnL: 0, realizedPnL: 0, unrealizedPnL: 0, volume: 0, count: 0, activeCount: 0 },
  baseline,
  compareDate,
  onOpenModal
}) => {
  const config = DERIVATIVE_CONFIGS[category];
  const IconComponent = config.icon || ShieldCheck;
  const delta = stats.totalPnL - (baseline ? baseline.totalPnL : 0);
  const isPositive = delta >= 0;

  const colorStyles = {
    emerald: {
      border: 'border-emerald-100 ring-2 ring-emerald-50/60',
      badgeBg: 'bg-emerald-100/80 text-emerald-800',
      titleText: 'text-emerald-800',
      pillBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      activeText: 'text-emerald-600',
      hoverText: 'group-hover/sub:text-emerald-600',
      pnlPositive: 'text-emerald-600'
    },
    indigo: {
      border: 'border-indigo-100 ring-2 ring-indigo-50/60',
      badgeBg: 'bg-indigo-100/80 text-indigo-800',
      titleText: 'text-indigo-800',
      pillBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      activeText: 'text-indigo-600',
      hoverText: 'group-hover/sub:text-indigo-600',
      pnlPositive: 'text-indigo-600'
    },
    purple: {
      border: 'border-purple-100 ring-2 ring-purple-50/60',
      badgeBg: 'bg-purple-100/80 text-purple-800',
      titleText: 'text-purple-800',
      pillBg: 'bg-purple-50 text-purple-700 border-purple-200',
      activeText: 'text-purple-600',
      hoverText: 'group-hover/sub:text-purple-600',
      pnlPositive: 'text-purple-600'
    }
  }[config.themeColor] || {
    border: 'border-slate-100',
    badgeBg: 'bg-slate-100 text-slate-800',
    titleText: 'text-slate-800',
    pillBg: 'bg-slate-50 text-slate-700 border-slate-200',
    activeText: 'text-slate-600',
    hoverText: 'group-hover/sub:text-slate-600',
    pnlPositive: 'text-emerald-600'
  };

  return (
    <motion.div 
      className={`bg-white p-4 sm:p-6 rounded-2xl shadow-sm border ${colorStyles.border} transition-all flex flex-col justify-between h-full hover:shadow-md hover:-translate-y-0.5`}
      variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
    >
      <div className="cursor-pointer" onClick={() => onOpenModal(null, 'ALL')}>
        <div className="flex justify-between items-start mb-2 sm:mb-4">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className={`p-1 rounded-md ${colorStyles.badgeBg}`}>
                <IconComponent className="w-3.5 h-3.5" />
              </span>
              <p className={`text-[10px] sm:text-xs font-black uppercase tracking-widest ${colorStyles.titleText}`}>
                {config.title}
              </p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase">
                {stats.activeCount} Active / {stats.count} Total SNs
              </p>
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold border shadow-2xs ${colorStyles.pillBg}`}>
                Click to Drilldown
              </span>
            </div>
          </div>
          
          {/* Day-over-Day Delta Badge */}
          <div className="flex items-center gap-2">
            <div className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg text-[8px] sm:text-[10px] font-bold ${
              isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
            }`}>
              {isPositive ? '▲' : '▼'} {formatCurrency(Math.abs(delta))}
            </div>
          </div>
        </div>

        {/* Primary PnL Number */}
        <div className={`font-black ${stats.totalPnL >= 0 ? colorStyles.pnlPositive : 'text-rose-600'}`}>
          <AutoScalingText maxFontSize={30} minFontSize={14}>
            {formatCurrency(stats.totalPnL)}
          </AutoScalingText>
        </div>
        <p className="text-[8px] sm:text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-tight">
          vs Basis: {compareDate || 'Previous'}
        </p>
      </div>

      {/* Sub-Metric Split: Realized P&L, Unrealized P&L, Volume */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-4 sm:mt-8 pt-4 sm:pt-6 border-t border-slate-50">
        <SubMetric 
          label="Realized" 
          fullLabel="Realized P&L" 
          value={stats.realizedPnL} 
          baseline={baseline ? baseline.realizedPnL : 0} 
          color="text-blue-600" 
          onClick={() => onOpenModal(null, 'Realized')} 
        />
        <SubMetric 
          label="Unrealized" 
          fullLabel="Unrealized P&L" 
          value={stats.unrealizedPnL} 
          baseline={baseline ? baseline.unrealizedPnL : 0} 
          color="text-amber-600" 
          onClick={() => onOpenModal(null, 'Unrealized')} 
        />
        <div 
          className="cursor-pointer group/sub" 
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); onOpenModal(null, 'ALL'); }}
        >
          <p className={`text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-0.5 ${colorStyles.hoverText} transition-colors`}>
            <span className="sm:hidden">{config.code} Vol</span>
            <span className="hidden sm:inline">{config.code} Volume</span>
          </p>
          <p className="text-[10px] sm:text-xs font-bold text-slate-800">
            {stats.volume > 0 ? `${Math.round(stats.volume).toLocaleString()}` : '0'} <span className="text-[8px] font-normal text-slate-500">MMBtu</span>
          </p>
          <div className="text-[7px] sm:text-[8px] font-bold text-slate-400 mt-0.5">
            {stats.activeCount} Active Positions
          </div>
        </div>
      </div>
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* DERIVATIVES & HEDGING DRILLDOWN MODAL (Group -> SN -> Trade Lines)         */
/* -------------------------------------------------------------------------- */
interface DerivativePortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCategory: DerivativeCategory;
  onSelectCategory: (category: DerivativeCategory) => void;
  targetDate: string;
  baselineDate: string;
  selectedGroup: string | null;
  onSelectGroup: (group: string | null) => void;
  filterStatus: 'ALL' | 'Realized' | 'Unrealized';
  onFilterStatusChange: (status: 'ALL' | 'Realized' | 'Unrealized') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onlyActive: boolean;
  onToggleOnlyActive: (val: boolean) => void;
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  onSort: (col: string) => void;
  expandedSN: string | null;
  onToggleExpandSN: (sn: string) => void;
  overviewStats: Record<DerivativeCategory, any>;
  baselineStats: Record<DerivativeCategory, any>;
  groupsData: any[];
  snData: any[];
  onCargoClick?: (strategyName: string) => void;
  onExportCSV: () => void;
}

const DerivativePortfolioModal: React.FC<DerivativePortfolioModalProps> = ({
  isOpen,
  onClose,
  activeCategory,
  onSelectCategory,
  targetDate,
  baselineDate,
  selectedGroup,
  onSelectGroup,
  filterStatus,
  onFilterStatusChange,
  searchQuery,
  onSearchChange,
  onlyActive,
  onToggleOnlyActive,
  sortColumn,
  sortDirection,
  onSort,
  expandedSN,
  onToggleExpandSN,
  overviewStats,
  baselineStats,
  groupsData,
  snData,
  onCargoClick,
  onExportCSV
}) => {
  if (!isOpen) return null;

  const currentConfig = DERIVATIVE_CONFIGS[activeCategory];
  const IconComponent = currentConfig.icon || ShieldCheck;
  const currentStats = overviewStats[activeCategory] || { totalPnL: 0, realizedPnL: 0, unrealizedPnL: 0, volume: 0, count: 0, activeCount: 0 };
  const currentBaseline = baselineStats[activeCategory];
  const isSNLevel = selectedGroup !== null;

  const themeClasses = {
    emerald: {
      headerBg: 'from-emerald-50/40 via-white to-slate-50',
      iconBox: 'bg-emerald-500 text-white shadow-emerald-500/20',
      textAccent: 'text-emerald-800',
      breadcrumbTag: 'bg-emerald-100/70 text-emerald-800',
      buttonAccent: 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100/80 border-emerald-200',
      dotColor: 'bg-emerald-500',
      activeTab: 'bg-emerald-600 text-white shadow-sm',
      tableHover: 'hover:bg-emerald-50/40',
      activeRowBg: 'bg-emerald-50/25',
      primaryText: 'text-emerald-600',
      footerTotalText: 'text-emerald-700'
    },
    indigo: {
      headerBg: 'from-indigo-50/40 via-white to-slate-50',
      iconBox: 'bg-indigo-500 text-white shadow-indigo-500/20',
      textAccent: 'text-indigo-800',
      breadcrumbTag: 'bg-indigo-100/70 text-indigo-800',
      buttonAccent: 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100/80 border-indigo-200',
      dotColor: 'bg-indigo-500',
      activeTab: 'bg-indigo-600 text-white shadow-sm',
      tableHover: 'hover:bg-indigo-50/40',
      activeRowBg: 'bg-indigo-50/25',
      primaryText: 'text-indigo-600',
      footerTotalText: 'text-indigo-700'
    },
    purple: {
      headerBg: 'from-purple-50/40 via-white to-slate-50',
      iconBox: 'bg-purple-500 text-white shadow-purple-500/20',
      textAccent: 'text-purple-800',
      breadcrumbTag: 'bg-purple-100/70 text-purple-800',
      buttonAccent: 'text-purple-700 bg-purple-50 hover:bg-purple-100/80 border-purple-200',
      dotColor: 'bg-purple-500',
      activeTab: 'bg-purple-600 text-white shadow-sm',
      tableHover: 'hover:bg-purple-50/40',
      activeRowBg: 'bg-purple-50/25',
      primaryText: 'text-purple-600',
      footerTotalText: 'text-purple-700'
    }
  }[currentConfig.themeColor] || {
    headerBg: 'from-slate-50 via-white to-slate-50',
    iconBox: 'bg-slate-700 text-white shadow-slate-700/20',
    textAccent: 'text-slate-800',
    breadcrumbTag: 'bg-slate-100 text-slate-800',
    buttonAccent: 'text-slate-700 bg-slate-50 hover:bg-slate-100 border-slate-200',
    dotColor: 'bg-slate-500',
    activeTab: 'bg-slate-700 text-white shadow-sm',
    tableHover: 'hover:bg-slate-50/80',
    activeRowBg: 'bg-slate-50/50',
    primaryText: 'text-emerald-600',
    footerTotalText: 'text-slate-800'
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-2 sm:p-4 lg:p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        className="bg-white w-full max-w-7xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
      >
        {/* Modal Top Header */}
        <div className={`p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gradient-to-r ${themeClasses.headerBg} shrink-0`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${themeClasses.iconBox} shadow-md`}>
              <IconComponent className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-slate-800">
                  {currentConfig.title} Analysis
                </h3>
                {isSNLevel ? (
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <span className="text-slate-400">/</span>
                    <button 
                      onClick={() => onSelectGroup(null)}
                      className="text-slate-600 hover:text-slate-900 underline underline-offset-2"
                    >
                      All Groups
                    </button>
                    <span className="text-slate-400">/</span>
                    <span className={`px-2 py-0.5 ${themeClasses.breadcrumbTag} rounded-md font-mono text-xs`}>
                      {selectedGroup === 'ALL' ? 'All Portfolios (Flat)' : `Group: ${selectedGroup}`}
                    </span>
                  </div>
                ) : (
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-xs font-bold">
                    Portfolio Group Breakdown
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Internal Portfolio: <span className="font-mono font-bold text-slate-700">{currentConfig.portfolioDesc}</span> • EOD Date: <span className="font-bold text-slate-700">{targetDate || 'All'}</span> (Baseline: {baselineDate || 'Prior'})
              </p>
            </div>
          </div>

          {/* Category Selector Tabs & Actions */}
          <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
            {/* Category Switcher Tabs */}
            <div className="flex items-center p-1 bg-slate-100 rounded-xl text-xs font-bold border border-slate-200/60 shadow-2xs">
              {(['PHYSICAL_HEDGING', 'DH', 'DFT'] as DerivativeCategory[]).map((cat) => {
                const conf = DERIVATIVE_CONFIGS[cat];
                const isSelected = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => onSelectCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 text-[11px] font-bold ${
                      isSelected
                        ? themeClasses.activeTab
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    <span>{conf.shortTitle}</span>
                  </button>
                );
              })}
            </div>

            {isSNLevel && (
              <button
                onClick={() => onSelectGroup(null)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back to Groups
              </button>
            )}
            <button
              onClick={onExportCSV}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border rounded-lg shadow-2xs transition-colors ${themeClasses.buttonAccent}`}
              title="Export visible data to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button 
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Top Summary KPI Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3 sm:p-4 bg-slate-50/70 border-b border-slate-100 shrink-0 text-xs">
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Total {currentConfig.code} P&amp;L</span>
            <div className={`text-base font-black ${currentStats.totalPnL >= 0 ? themeClasses.primaryText : 'text-rose-600'}`}>
              {formatCurrency(currentStats.totalPnL)}
            </div>
            <div className="text-[9px] font-bold text-slate-400 mt-0.5">
              DoD: {formatCurrency(currentStats.totalPnL - (currentBaseline ? currentBaseline.totalPnL : 0))}
            </div>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Realized {currentConfig.code}</span>
            <div className={`text-base font-black ${currentStats.realizedPnL >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
              {formatCurrency(currentStats.realizedPnL)}
            </div>
            <div className="text-[9px] font-bold text-slate-400 mt-0.5">
              Settled contracts
            </div>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Unrealized {currentConfig.code}</span>
            <div className={`text-base font-black ${currentStats.unrealizedPnL >= 0 ? 'text-amber-600' : 'text-rose-600'}`}>
              {formatCurrency(currentStats.unrealizedPnL)}
            </div>
            <div className="text-[9px] font-bold text-slate-400 mt-0.5">
              Open / forward positions
            </div>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase">{currentConfig.code} Volume</span>
            <div className="text-base font-black text-slate-800">
              {Math.round(currentStats.volume).toLocaleString()} <span className="text-[10px] font-normal text-slate-500">MMBtu</span>
            </div>
            <div className="text-[9px] font-bold text-slate-400 mt-0.5">
              Across all {currentConfig.code} deals
            </div>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Active Strategies</span>
            <div className="text-base font-black text-slate-800">
              {currentStats.activeCount} <span className="text-xs font-normal text-slate-500">/ {currentStats.count} total</span>
            </div>
            <div className={`text-[9px] font-bold ${themeClasses.primaryText} mt-0.5`}>
              {groupsData.length} Portfolio Groups
            </div>
          </div>
        </div>

        {/* Modal Controls & Filters */}
        <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-white shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative min-w-[200px] sm:min-w-[260px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder={isSNLevel ? "Search Strategy Name, buyer, seller, month..." : "Search group or portfolio..."}
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-slate-400 transition-colors"
              />
              {searchQuery && (
                <button 
                  onClick={() => onSearchChange('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status Filter Buttons */}
            <div className="flex items-center p-0.5 bg-slate-100 rounded-lg text-xs font-bold">
              {(['ALL', 'Realized', 'Unrealized'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => onFilterStatusChange(st)}
                  className={`px-3 py-1 rounded-md transition-all ${
                    filterStatus === st 
                      ? 'bg-white text-slate-800 shadow-2xs' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {st === 'ALL' ? 'All Status' : st}
                </button>
              ))}
            </div>

            {/* Only Active Toggle */}
            <label className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer select-none">
              <input 
                type="checkbox"
                checked={onlyActive}
                onChange={(e) => onToggleOnlyActive(e.target.checked)}
                className="rounded border-slate-300 text-slate-700 focus:ring-slate-400 cursor-pointer"
              />
              <span>Only Non-Zero Positions</span>
            </label>
          </div>

          {/* Quick Level Switches */}
          <div className="flex items-center gap-2">
            {!isSNLevel ? (
              <button
                onClick={() => onSelectGroup('ALL')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border rounded-lg shadow-2xs transition-colors ${themeClasses.buttonAccent}`}
              >
                <Layers className="w-3.5 h-3.5" />
                View All SNs Directly
              </button>
            ) : (
              <div className="flex items-center gap-1 overflow-x-auto max-w-xs sm:max-w-md py-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase shrink-0">Switch Group:</span>
                <button
                  onClick={() => onSelectGroup('ALL')}
                  className={`px-2 py-0.5 text-[11px] font-bold rounded-md shrink-0 ${
                    selectedGroup === 'ALL' ? themeClasses.activeTab : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All
                </button>
                {groupsData.map(g => (
                  <button
                    key={g.groupName}
                    onClick={() => onSelectGroup(g.groupName)}
                    className={`px-2 py-0.5 text-[11px] font-bold rounded-md shrink-0 ${
                      selectedGroup === g.groupName ? themeClasses.activeTab : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {g.groupName}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-100">
          {!isSNLevel ? (
            /* ========================================================================= */
            /* LEVEL 2: GROUP BREAKDOWN VIEW                                             */
            /* ========================================================================= */
            <div>
              <div className="p-3 bg-slate-50 text-xs font-medium text-slate-700 flex items-center justify-between border-b border-slate-200/70">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${themeClasses.dotColor} animate-pulse`}></span>
                  <span>Click on any portfolio group row below to drill down into <strong>{currentConfig.shortTitle} by Strategy Name (SN)</strong>.</span>
                </div>
                <span className="text-[11px] font-bold text-slate-600">
                  {groupsData.length} Groups Total
                </span>
              </div>

              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0 z-10 border-b border-slate-200 shadow-2xs">
                  <tr>
                    <th className="p-3">Portfolio Group</th>
                    <th className="p-3 text-center">Strategies (Active / Total)</th>
                    <th className="p-3 text-right">{currentConfig.code} Vol (MMBtu)</th>
                    <th className="p-3 text-right">Realized P&amp;L</th>
                    <th className="p-3 text-right">Unrealized P&amp;L</th>
                    <th className="p-3 text-right">Total {currentConfig.code} P&amp;L</th>
                    <th className="p-3 text-right">Change vs DoD</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {groupsData.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 font-medium">
                        No groups found matching filter criteria.
                      </td>
                    </tr>
                  ) : (
                    groupsData.map((g) => {
                      const isZero = Math.abs(g.totalHedgingPnL) < 0.001 && g.volume === 0;
                      return (
                        <tr 
                          key={g.groupName}
                          onClick={() => onSelectGroup(g.groupName)}
                          className={`cursor-pointer transition-colors group ${
                            isZero ? 'opacity-60 hover:opacity-100 hover:bg-slate-50/80' : themeClasses.tableHover
                          }`}
                        >
                          <td className="p-3 font-black text-slate-800 flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${themeClasses.dotColor} group-hover:scale-125 transition-transform`} />
                            <span className="group-hover:text-slate-900 transition-colors">{g.groupName}</span>
                          </td>
                          <td className="p-3 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 font-bold text-slate-700 text-[11px]">
                              {g.activeCount} active <span className="text-slate-400 font-normal">/ {g.strategyCount} total</span>
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-700">
                            {g.volume > 0 ? `${Math.round(g.volume).toLocaleString()}` : '—'}
                          </td>
                          <td className={`p-3 text-right font-mono font-bold ${
                            Math.abs(g.realizedPnL) < 0.01 ? 'text-slate-400' : g.realizedPnL >= 0 ? 'text-blue-600' : 'text-rose-600'
                          }`}>
                            {Math.abs(g.realizedPnL) < 0.01 ? '—' : formatCurrency(g.realizedPnL)}
                          </td>
                          <td className={`p-3 text-right font-mono font-bold ${
                            Math.abs(g.unrealizedPnL) < 0.01 ? 'text-slate-400' : g.unrealizedPnL >= 0 ? 'text-amber-600' : 'text-rose-600'
                          }`}>
                            {Math.abs(g.unrealizedPnL) < 0.01 ? '—' : formatCurrency(g.unrealizedPnL)}
                          </td>
                          <td className={`p-3 text-right font-mono font-black text-sm ${
                            Math.abs(g.totalHedgingPnL) < 0.01 ? 'text-slate-400' : g.totalHedgingPnL >= 0 ? themeClasses.primaryText : 'text-rose-600'
                          }`}>
                            {Math.abs(g.totalHedgingPnL) < 0.01 ? '$0.00' : formatCurrency(g.totalHedgingPnL)}
                          </td>
                          <td className="p-3 text-right font-mono text-[11px] font-bold">
                            <span className={
                              Math.abs(g.pnlChange) < 0.01 ? 'text-slate-400' : g.pnlChange >= 0 ? 'text-emerald-600' : 'text-rose-600'
                            }>
                              {g.pnlChange > 0.01 ? '+' : ''}{Math.abs(g.pnlChange) < 0.01 ? '—' : formatCurrency(g.pnlChange)}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <button 
                              onClick={(e) => { e.stopPropagation(); onSelectGroup(g.groupName); }}
                              className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors inline-flex items-center gap-1 ${themeClasses.buttonAccent}`}
                            >
                              <span>View SNs</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* ========================================================================= */
            /* LEVEL 3: STRATEGY NAME (SN) BREAKDOWN & TRANSACTION EXPANSION             */
            /* ========================================================================= */
            <div>
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0 z-10 border-b border-slate-200 shadow-2xs">
                  <tr>
                    <th className="p-2.5 pl-4 cursor-pointer hover:text-slate-900" onClick={() => onSort('strategyName')}>
                      <div className="flex items-center gap-1">
                        <span>Strategy Name (SN)</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                    <th className="p-2.5 cursor-pointer hover:text-slate-900" onClick={() => onSort('group')}>
                      <div className="flex items-center gap-1">
                        <span>Group</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                    <th className="p-2.5 text-center cursor-pointer hover:text-slate-900" onClick={() => onSort('physicalPnLStatus')}>
                      <div className="flex items-center justify-center gap-1">
                        <span>Status</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                    <th className="p-2.5">Buyer / Seller</th>
                    <th className="p-2.5 text-center">Delivery Mo.</th>
                    <th className="p-2.5 text-right cursor-pointer hover:text-slate-900" onClick={() => onSort('vol')}>
                      <div className="flex items-center justify-end gap-1">
                        <span>{currentConfig.code} Vol (MMBtu)</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                    <th className="p-2.5 text-right cursor-pointer hover:text-slate-900" onClick={() => onSort('realizedPnL')}>
                      <div className="flex items-center justify-end gap-1">
                        <span>Realized {currentConfig.code}</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                    <th className="p-2.5 text-right cursor-pointer hover:text-slate-900" onClick={() => onSort('unrealizedPnL')}>
                      <div className="flex items-center justify-end gap-1">
                        <span>Unrealized {currentConfig.code}</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                    <th className="p-2.5 text-right cursor-pointer hover:text-slate-900" onClick={() => onSort('totalHedgingPnL')}>
                      <div className="flex items-center justify-end gap-1">
                        <span>Total {currentConfig.code} P&amp;L</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                    <th className="p-2.5 text-right cursor-pointer hover:text-slate-900" onClick={() => onSort('hedgingPnLChange')}>
                      <div className="flex items-center justify-end gap-1">
                        <span>DoD Change</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                    <th className="p-2.5 pr-4 text-center">{currentConfig.code} Deals</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {snData.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-slate-400 font-medium">
                        No strategies match your filter criteria in this group.
                      </td>
                    </tr>
                  ) : (
                    snData.map((item) => {
                      const isExpanded = expandedSN === item.strategyName;
                      const hasDeals = item.hedgeRows && item.hedgeRows.length > 0;
                      const isZero = Math.abs(item.totalHedgingPnL) < 0.001 && (!item.vol || item.vol === 0);

                      return (
                        <React.Fragment key={item.strategyName}>
                          <tr className={`hover:bg-slate-50/90 transition-colors ${isExpanded ? themeClasses.activeRowBg : isZero ? 'opacity-55' : ''}`}>
                            {/* Strategy Name */}
                            <td className="p-2.5 pl-4 font-mono font-bold text-slate-800">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => onToggleExpandSN(item.strategyName)}
                                  className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                                  title={isExpanded ? "Collapse deal rows" : "Expand deal rows"}
                                >
                                  {isExpanded ? <ChevronDown className={`w-3.5 h-3.5 ${themeClasses.primaryText}`} /> : <ChevronRight className="w-3.5 h-3.5" />}
                                </button>
                                <span 
                                  onClick={() => onCargoClick && onCargoClick(item.strategyName)}
                                  className="hover:underline cursor-pointer flex items-center gap-1"
                                >
                                  {item.strategyName}
                                  <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-slate-400" />
                                </span>
                              </div>
                            </td>

                            {/* Group */}
                            <td className="p-2.5">
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold text-[10px]">
                                {item.group}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="p-2.5 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                item.physicalPnLStatus === 'Realized' 
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}>
                                {item.physicalPnLStatus}
                              </span>
                            </td>

                            {/* Buyer / Seller */}
                            <td className="p-2.5 text-[11px] text-slate-600">
                              <div className="truncate max-w-[140px]" title={`Buyer: ${item.buyer || '—'} / Seller: ${item.seller || '—'}`}>
                                <span className="font-bold text-slate-700">{item.buyer || '—'}</span>
                                <span className="text-slate-400 mx-1">/</span>
                                <span>{item.seller || '—'}</span>
                              </div>
                            </td>

                            {/* Delivery Month */}
                            <td className="p-2.5 text-center font-mono text-[11px] text-slate-600">
                              {item.deliveryMonth || '—'}
                            </td>

                            {/* Volume */}
                            <td className="p-2.5 text-right font-mono font-bold text-slate-700">
                              {item.vol > 0 ? `${Math.round(item.vol).toLocaleString()}` : '—'}
                            </td>

                            {/* Realized PnL */}
                            <td className={`p-2.5 text-right font-mono font-bold ${
                              Math.abs(item.realizedPnL) < 0.01 ? 'text-slate-400' : item.realizedPnL >= 0 ? 'text-blue-600' : 'text-rose-600'
                            }`}>
                              {Math.abs(item.realizedPnL) < 0.01 ? '—' : formatCurrency(item.realizedPnL)}
                            </td>

                            {/* Unrealized PnL */}
                            <td className={`p-2.5 text-right font-mono font-bold ${
                              Math.abs(item.unrealizedPnL) < 0.01 ? 'text-slate-400' : item.unrealizedPnL >= 0 ? 'text-amber-600' : 'text-rose-600'
                            }`}>
                              {Math.abs(item.unrealizedPnL) < 0.01 ? '—' : formatCurrency(item.unrealizedPnL)}
                            </td>

                            {/* Total PnL */}
                            <td className={`p-2.5 text-right font-mono font-black ${
                              Math.abs(item.totalHedgingPnL) < 0.01 ? 'text-slate-400' : item.totalHedgingPnL >= 0 ? themeClasses.primaryText : 'text-rose-600'
                            }`}>
                              {Math.abs(item.totalHedgingPnL) < 0.01 ? '$0.00' : formatCurrency(item.totalHedgingPnL)}
                            </td>

                            {/* DoD Change */}
                            <td className="p-2.5 text-right font-mono text-[11px] font-bold">
                              <span className={
                                Math.abs(item.hedgingPnLChange) < 0.01 ? 'text-slate-400' : item.hedgingPnLChange >= 0 ? 'text-emerald-600' : 'text-rose-600'
                              }>
                                {item.hedgingPnLChange > 0.01 ? '+' : ''}{Math.abs(item.hedgingPnLChange) < 0.01 ? '—' : formatCurrency(item.hedgingPnLChange)}
                              </span>
                            </td>

                            {/* Deals Expand Button */}
                            <td className="p-2.5 pr-4 text-center">
                              <button
                                onClick={() => onToggleExpandSN(item.strategyName)}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                                  hasDeals 
                                    ? `${themeClasses.buttonAccent}` 
                                    : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {item.hedgeRows ? `${item.hedgeRows.length} deals` : '0 deals'}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded Trade Details Sub-table */}
                          {isExpanded && (
                            <tr className="bg-slate-50/80">
                              <td colSpan={11} className="p-3 pl-8 pr-6">
                                <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-inner">
                                  <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-xs font-black text-slate-800 flex items-center gap-2">
                                      <IconComponent className={`w-3.5 h-3.5 ${themeClasses.primaryText}`} />
                                      Underlying TRMS {currentConfig.title} Transactions for <span className="font-mono text-slate-900 font-black">{item.strategyName}</span>
                                    </h4>
                                    <span className="text-[10px] font-bold text-slate-400">
                                      {item.hedgeRows ? item.hedgeRows.length : 0} Matching Trade Lines
                                    </span>
                                  </div>

                                  {item.hedgeRows && item.hedgeRows.length > 0 ? (
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-left text-[11px] border-collapse">
                                        <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                                          <tr>
                                            <th className="p-2">Deal / Tracking #</th>
                                            <th className="p-2">Internal Portfolio</th>
                                            <th className="p-2">Cflow Type</th>
                                            <th className="p-2 text-center">Buy/Sell</th>
                                            <th className="p-2 text-right">Volume</th>
                                            <th className="p-2 text-right">Price</th>
                                            <th className="p-2 text-right">Base Total Value (USD)</th>
                                            <th className="p-2 text-center">Start / End Date</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 font-mono">
                                          {item.hedgeRows.map((r: any, idx: number) => {
                                            const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, '')) || 0;
                                            const vol = Number(String(r['Volume'] || '').replace(/[^0-9.-]/g, '')) || 0;
                                            const price = Number(String(r['Price'] || '').replace(/[^0-9.-]/g, '')) || 0;
                                            const dealNum = r['Deal Tracking Num'] || r['Deal Num'] || r['Deal ID'] || `Row-${idx + 1}`;
                                            const port = r['Internal Portfolio'] || r['Portfolio'] || '—';
                                            const cflow = r['Cflow Type'] || '—';
                                            const bs = r['Buy/Sell'] || r['Buy / Sell'] || '—';
                                            const startDate = r['Start Date'] || '—';
                                            const endDate = r['End Date'] || '—';

                                            return (
                                              <tr key={idx} className="hover:bg-slate-50">
                                                <td className="p-2 font-bold text-slate-800">{dealNum}</td>
                                                <td className="p-2 text-slate-600">{port}</td>
                                                <td className="p-2 text-slate-600">{cflow}</td>
                                                <td className="p-2 text-center">
                                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                                    String(bs).toLowerCase().includes('buy') ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                                                  }`}>
                                                    {bs}
                                                  </span>
                                                </td>
                                                <td className="p-2 text-right font-bold text-slate-700">
                                                  {vol ? Math.round(vol).toLocaleString() : '—'}
                                                </td>
                                                <td className="p-2 text-right text-slate-600">
                                                  {price ? `$${price.toFixed(4)}` : '—'}
                                                </td>
                                                <td className={`p-2 text-right font-black ${
                                                  val >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                                }`}>
                                                  {formatCurrency(val)}
                                                </td>
                                                <td className="p-2 text-center text-slate-500 text-[10px]">
                                                  {startDate} ~ {endDate}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <div className="p-4 text-center text-slate-400 text-xs italic">
                                      No detailed transaction lines found under '{currentConfig.portfolioDesc}' portfolio for this strategy. P&amp;L is derived from strategy level summaries.
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer Summary */}
        <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0 text-xs text-slate-500 font-medium">
          <div>
            {!isSNLevel ? (
              <span>Showing <strong className="text-slate-800">{groupsData.length}</strong> portfolio groups for <strong className="text-slate-900">{currentConfig.shortTitle}</strong>.</span>
            ) : (
              <span>Showing <strong className="text-slate-800">{snData.length}</strong> strategies in <strong className="text-slate-900">{selectedGroup}</strong>.</span>
            )}
          </div>
          <div className="flex items-center gap-4 font-mono font-bold">
            <span className="text-blue-600">
              Realized: {formatCurrency(isSNLevel ? snData.reduce((acc, i) => acc + (i.realizedPnL || 0), 0) : groupsData.reduce((acc, g) => acc + g.realizedPnL, 0))}
            </span>
            <span className="text-amber-600">
              Unrealized: {formatCurrency(isSNLevel ? snData.reduce((acc, i) => acc + (i.unrealizedPnL || 0), 0) : groupsData.reduce((acc, g) => acc + g.unrealizedPnL, 0))}
            </span>
            <span className={themeClasses.footerTotalText}>
              Total {currentConfig.code} P&amp;L: {formatCurrency(isSNLevel ? snData.reduce((acc, i) => acc + (i.totalHedgingPnL || 0), 0) : groupsData.reduce((acc, g) => acc + g.totalHedgingPnL, 0))}
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
