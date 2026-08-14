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
  X,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  RotateCcw,
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';
import { ReconciliationData } from './DiscrepancyCheck';
import { getGroupName, GROUPS, formatCurrency } from '../services/calculationService';
import { computeTrmsSummaryRows, TrmsStrategySummary } from '../utils/trmsEngine';
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

  // Strategy PnL Map for Baseline Date to compute Day-over-Day movements
  const baselinePnlMap = useMemo(() => {
    const map = new Map<string, number>();
    baselineSummaries.forEach(s => {
      const pnl = (Math.abs(s.salesRevenue || 0) - Math.abs(s.purchaseCost || 0)) + (s.shippingRelatedCosts || 0);
      map.set(s.strategyName, pnl);
    });
    return map;
  }, [baselineSummaries]);

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
      const other = s.shippingRelatedCosts || 0;
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
        const pnl = (Math.abs(s.salesRevenue || 0) - Math.abs(s.purchaseCost || 0)) + (s.shippingRelatedCosts || 0);
        return { name: s.strategyName, delta: pnl };
      }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 40);
    }

    return targetSummaries.map(s => {
      const pnl = (Math.abs(s.salesRevenue || 0) - Math.abs(s.purchaseCost || 0)) + (s.shippingRelatedCosts || 0);
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

        {/* ROW 2: REALIZED PHYSICAL P&L & UNREALIZED PHYSICAL P&L */}
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
