import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Layers, 
  Search, 
  Download, 
  ChevronRight, 
  ChevronDown, 
  CheckCircle2, 
  X,
  Filter,
  SlidersHorizontal,
  ChevronUp,
  AlertCircle, 
  HelpCircle, 
  TrendingUp, 
  TrendingDown,
  DollarSign, 
  Database,
  Calendar,
  TableProperties,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Info,
  BarChart3,
  PieChart as PieChartIcon,
  LayoutDashboard,
  ShieldAlert,
  ListFilter,
  Activity,
  Boxes,
  FileSpreadsheet,
  BookOpen,
  Ship,
  Zap
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  Cell, 
  PieChart, 
  Pie, 
  Tooltip as RechartsTooltip, 
  Legend as RechartsLegend, 
  ResponsiveContainer, 
  XAxis, 
  YAxis, 
  CartesianGrid 
} from 'recharts';
import { ReconciliationData, ColumnFilterPopover } from './DiscrepancyCheck';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';

const formatToMonthYear = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getUTCMonth()];
  const year = String(d.getUTCFullYear()).slice(-2);
  return `${month}-${year}`;
};

const getRowExposureMonth = (row: any) => {
  // Try direct aliases
  const aliases = ['Exposure Month', 'ExposureMonth', 'Pricing Month', 'PricingMonth', 'Month', 'Delivery Month', 'DeliveryMonth', 'Comm Window End Date', 'End Date', 'Start Date'];
  for (const alias of aliases) {
    const val = row[alias];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      const strVal = String(val).trim();
      // Check if it's YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(strVal)) {
        return formatToMonthYear(strVal);
      }
      // Check if it's already a clean month name like Jan-26 or 2026-01
      if (/^[a-zA-Z]{3}-\d{2}$/.test(strVal) || /^\d{4}-\d{2}$/.test(strVal)) {
        return strVal;
      }
      const formatted = formatToMonthYear(strVal);
      if (formatted) return formatted;
    }
  }
  return '';
};

const getTrmsGroupName = (strategyName: string = ''): string => {
  const sn = strategyName.toUpperCase();
  if (sn.includes('PL9SB')) return 'PL9SB';
  if (sn.includes('FLNG1') || sn.includes('PFLNG1')) return 'FLNG1';
  if (sn.includes('FLNG2') || sn.includes('PFLNG2')) return 'FLNG2';
  if (sn.includes('LNGC')) return 'LNGC';
  if (sn.includes('SPOT')) return 'Spot';
  if (sn.includes('CHENIERE') || sn.includes('SPL') || sn.includes('CCL')) return 'Cheniere';
  return 'Others';
};

interface TrmsSummaryTableProps {
  trmsData: ReconciliationData;
  viewModeOnly?: 'grid' | 'dashboard';
}

export const TrmsSummaryTable: React.FC<TrmsSummaryTableProps> = ({ trmsData, viewModeOnly }) => {
  const [viewMode, setViewMode] = useState<'dashboard' | 'grid'>(viewModeOnly || 'dashboard');
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'optimizations' | 'breakdowns'>('overview');

  useEffect(() => {
    if (viewModeOnly) {
      setViewMode(viewModeOnly);
    }
  }, [viewModeOnly]);

  const [activeTrmsGroup, setActiveTrmsGroup] = useState<string>('All');
  const [selectedDrillDownStrategy, setSelectedDrillDownStrategy] = useState<string | null>(null);
  const [activeBreakdownCategory, setActiveBreakdownCategory] = useState<string>('PL9SB');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEodDate, setSelectedEodDate] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [showExposureMonths, setShowExposureMonths] = useState(false);
  const [showLoadingMonth, setShowLoadingMonth] = useState(false);
  const [showDeliveryMonth, setShowDeliveryMonth] = useState(false);
  const [showLinesCount, setShowLinesCount] = useState(false);
  const [expandedStrategies, setExpandedStrategies] = useState<Set<string>>(new Set());
  const [activeFilterMenu, setActiveFilterMenu] = useState<string | null>(null);

  // Filter mode for expanded auditing details list per strategy: 'base_lng' | 'shipping_costs' | 'hedging' | 'all' | 'buy_commodity' | 'sell_commodity'
  const [expandedFilters, setExpandedFilters] = useState<Record<string, 'base_lng' | 'shipping_costs' | 'hedging' | 'all' | 'buy_commodity' | 'sell_commodity'>>({});

  // Sorting state
  const [sortConfig, setSortConfig] = useState<{ column: string; direction: 'asc' | 'desc' | null }>({
    column: '',
    direction: null,
  });

  // Filter state
  const [columnFilters, setColumnFilters] = useState<Record<string, {
    selectedValues: Set<string>;
    condition: string;
    conditionValue1: string;
    conditionValue2: string;
  }>>({});

  const [filterSearchTerms, setFilterSearchTerms] = useState<Record<string, string>>({});

  // Sub-table specific state filters indexed by Strategy Name
  const [subTableSearches, setSubTableSearches] = useState<Record<string, string>>({});
  const [subTableBuySellFilters, setSubTableBuySellFilters] = useState<Record<string, string>>({});
  const [subTablePortfolioFilters, setSubTablePortfolioFilters] = useState<Record<string, string>>({});

  const rows = useMemo(() => trmsData.extractedRows || [], [trmsData.extractedRows]);

  // Click outside handling for menus
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setActiveFilterMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Extract all unique PLSB Year Buckets dynamically
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    rows.forEach((row: any) => {
      const yr = String(row['Plsb Year Bucket'] || row['Plsb_Year_Bucket'] || '').trim();
      if (yr) {
        // Look for any 4 digit years e.g., "2026", "2027", "2028" etc.
        const match = yr.match(/\b(20\d{2})\b/);
        if (match) {
          years.add(match[1]);
        } else {
          years.add(yr);
        }
      }
    });
    return Array.from(years).sort();
  }, [rows]);

  // Extract all unique dates to filter
  const eodDates = useMemo(() => {
    const dates = new Set<string>();
    rows.forEach((row: any) => {
      const dt = String(row['EOD Date'] || row['EOD_Date'] || '').trim();
      if (dt) dates.add(dt);
    });
    return Array.from(dates).sort((a, b) => b.localeCompare(a)); // Descending chronological
  }, [rows]);

  // Filter rows by selected EOD date AND selected PLSB year bucket
  const dateAndYearFilteredRows = useMemo(() => {
    let result = rows;
    
    // 1. EOD Date filter
    if (selectedEodDate !== 'all') {
      result = result.filter((row: any) => {
        const dt = String(row['EOD Date'] || row['EOD_Date'] || '').trim();
        return dt === selectedEodDate;
      });
    }

    // 2. Year Bucket filter
    if (selectedYear !== 'all') {
      result = result.filter((row: any) => {
        const yr = String(row['Plsb Year Bucket'] || row['Plsb_Year_Bucket'] || '').trim();
        return yr.includes(selectedYear);
      });
    }

    return result;
  }, [rows, selectedEodDate, selectedYear]);

  // Strategy Summaries calculation engine (grouped purely by Strategy Name)
  const summaryData = useMemo(() => {
    const map: Record<string, {
      strategyName: string;
      underlyingRows: any[];
    }> = {};

    dateAndYearFilteredRows.forEach((row: any) => {
      const sn = String(row['Strategy Name'] || row['Strategy'] || '').trim();
      if (!sn) return; // Skip empty strategy names

      if (!map[sn]) {
        map[sn] = {
          strategyName: sn,
          underlyingRows: []
        };
      }
      map[sn].underlyingRows.push(row);
    });

    // Compute metrics for each unique Strategy Name
    return Object.values(map).map(item => {
      const { strategyName, underlyingRows } = item;

      // calculation A: Physical P&L Bucket
      const physRows = underlyingRows.filter(r => 
        String(r['Ins Type'] || '').trim() === 'COMM-PHYS' && 
        String(r['Cflow Type'] || '').trim() === 'Commodity'
      );
      
      let physicalPnLStatus: 'Realized' | 'Unrealized' = 'Unrealized';
      if (physRows.length > 0) {
        const allActual = physRows.every(r => String(r['Volume Type'] || '').trim() === 'Actual');
        physicalPnLStatus = allActual ? 'Realized' : 'Unrealized';
      }

      // calculation B: Optimisation Status
      const hasBase = underlyingRows.some(r => {
        const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
        return port === 'base lng' || port.includes('base');
      });
      const hasOpt = underlyingRows.some(r => {
        const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
        return port === 'optimization lng' || port.includes('optimization');
      });

      let optimisationStatus: 'Yes' | 'No' | 'Alert' | '' = '';
      if (hasBase && hasOpt) {
        optimisationStatus = 'Yes';
      } else if (hasBase && !hasOpt) {
        optimisationStatus = 'No';
      } else if (!hasBase && hasOpt) {
        optimisationStatus = 'Alert';
      } else {
        optimisationStatus = '';
      }

      // calculation C: Unallocated Cargo status
      const hasBuy = underlyingRows.some(r => {
        const buySell = String(r['Buy_Sell'] || r['BuySell'] || '').trim().toLowerCase();
        return buySell === 'buy' || buySell === 'buys';
      });
      const hasSell = underlyingRows.some(r => {
        const buySell = String(r['Buy_Sell'] || r['BuySell'] || '').trim().toLowerCase();
        return buySell === 'sell' || buySell === 'sells';
      });

      let unallocatedCargo: 'Matched' | 'Open on Sell Leg' | 'Open on Buy Leg' | '' = '';
      if (hasBuy && hasSell) {
        unallocatedCargo = 'Matched';
      } else if (hasBuy && !hasSell) {
        unallocatedCargo = 'Open on Sell Leg';
      } else if (!hasBuy && hasSell) {
        unallocatedCargo = 'Open on Buy Leg';
      } else {
        unallocatedCargo = '';
      }

      // Calculations D: Extra aggregated values
      let purchaseVolume = 0;
      let salesVolume = 0;
      let totalVolume = 0;
      let totalValueUSD = 0;
      let totalPnL = 0;

      // Shipping related cost sum: Cflow Type is "SRC- Shipping Related Cost"
      let shippingRelatedCosts = 0;

      // Hedging P&L sum: Base Value USD of all items with portfolio "Hedging LNG"
      let hedgingPnL = 0;

      // Buy price weighting calculations
      let weightedBuyPriceSum = 0;
      let buyPriceVolSum = 0;
      let buyPriceCount = 0;
      let simpleBuyPriceSum = 0;

      // Sell price weighting calculations
      let weightedSellPriceSum = 0;
      let sellPriceVolSum = 0;
      let sellPriceCount = 0;
      let simpleSellPriceSum = 0;

      // Buy total value summing for Cost
      let purchaseCost = 0;
      // Sell total value summing for Revenue
      let salesRevenue = 0;

      // Determine real commodity calculation rows based on rules
      let buyCalcRows: any[] = [];
      let sellCalcRows: any[] = [];

      if (hasOpt) {
        // To calculate the volume that has optimization, it also looks for Unallocated Cargo matching status.
        // If its matched, it should look for Cash Settlement. If its open on either leg, the open leg will use Physical Settlement.
        if (unallocatedCargo === 'Matched') {
          buyCalcRows = underlyingRows.filter(r => {
            const isBuy = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || r['Buy_Sell'] || '').toLowerCase() === 'buys';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            const isOpt = port === 'optimization lng' || port.includes('optimization');
            return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS' && isOpt && sett !== 'Physical Settlement';
          });
          sellCalcRows = underlyingRows.filter(r => {
            const isSell = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || r['Buy_Sell'] || '').toLowerCase() === 'sells';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            const isOpt = port === 'optimization lng' || port.includes('optimization');
            return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS' && isOpt && sett !== 'Physical Settlement';
          });
        } else if (unallocatedCargo === 'Open on Buy Leg') {
          buyCalcRows = underlyingRows.filter(r => {
            const isSell = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sells';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            const isOpt = port === 'optimization lng' || port.includes('optimization');
            return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS' && isOpt && sett === 'Physical Settlement';
          });
          sellCalcRows = underlyingRows.filter(r => {
            const isSell = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sells';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            const isOpt = port === 'optimization lng' || port.includes('optimization');
            return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS' && isOpt && sett !== 'Physical Settlement';
          });
        } else if (unallocatedCargo === 'Open on Sell Leg') {
          sellCalcRows = underlyingRows.filter(r => {
            const isBuy = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buys';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            const isOpt = port === 'optimization lng' || port.includes('optimization');
            return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS' && isOpt && sett === 'Physical Settlement';
          });
          buyCalcRows = underlyingRows.filter(r => {
            const isBuy = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buys';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            const isOpt = port === 'optimization lng' || port.includes('optimization');
            return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS' && isOpt && sett !== 'Physical Settlement';
          });
        } else {
          buyCalcRows = underlyingRows.filter(r => {
            const isBuy = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || r['Buy_Sell'] || '').toLowerCase() === 'buys';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS' && (port === 'optimization lng' || port.includes('optimization'));
          });
          sellCalcRows = underlyingRows.filter(r => {
            const isSell = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || r['Buy_Sell'] || '').toLowerCase() === 'sells';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS' && (port === 'optimization lng' || port.includes('optimization'));
          });
        }
      } else {
        if (!hasBuy && hasSell) {
          // Open on Buy Leg (the buy leg does not have any deal yet): physical for buy, cash for sell
          // Sell rows with Physical Settlement go to buyCalcRows, other Sell rows with Cash Settlement go to sellCalcRows
          buyCalcRows = underlyingRows.filter(r => {
            const isSell = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sells';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS' && sett === 'Physical Settlement';
          });
          sellCalcRows = underlyingRows.filter(r => {
            const isSell = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sells';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS' && sett !== 'Physical Settlement';
          });
        } else if (hasBuy && !hasSell) {
          // Open on Sell Leg (the sell leg does not have any deal yet): physical for sell, cash for buy
          // Buy rows with Physical Settlement go to sellCalcRows, other Buy rows with Cash Settlement go to buyCalcRows
          sellCalcRows = underlyingRows.filter(r => {
            const isBuy = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buys';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS' && sett === 'Physical Settlement';
          });
          buyCalcRows = underlyingRows.filter(r => {
            const isBuy = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buys';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS' && sett !== 'Physical Settlement';
          });
        } else if (hasBuy && hasSell) {
          // Matched (both exist): use Cash Settlement rows (exclude Physical Settlement rows)
          buyCalcRows = underlyingRows.filter(r => {
            const isBuy = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buys';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS' && sett !== 'Physical Settlement';
          });
          sellCalcRows = underlyingRows.filter(r => {
            const isSell = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sells';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS' && sett !== 'Physical Settlement';
          });
        }
      }

      // 1. Calculate General Metrics from all underlying rows (hedging, shipping, total volume, etc.)
      underlyingRows.forEach(r => {
        const vol = Number(String(r['Volume'] || '').replace(/[^0-9.-]/g, ''));
        const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));

        const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
        const internalPortfolio = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();

        if (!isNaN(vol)) {
          totalVolume += vol;
        }
        if (!isNaN(val)) {
          // Shipping Related Costs check
          if (cflowType === 'src- shipping related cost' || cflowType.includes('shipping related cost')) {
            if (hasOpt) {
              const isOptRow = internalPortfolio === 'optimization lng' || internalPortfolio.includes('optimization');
              if (isOptRow) {
                shippingRelatedCosts += val;
              }
            } else {
              shippingRelatedCosts += val;
            }
          }

          // Hedging LNG P&L check (Sums of Base_Value_USD as specified)
          if (internalPortfolio === 'hedging lng' || internalPortfolio.includes('hedging')) {
            hedgingPnL += val;
          }
        }
      });

      // Collect the correctly filtered line items that calculate "sum of value" and daily P&L movement (Change in P&L)
      const correctFilteredRows: any[] = [];
      
      // Add all commodity rows that are filtered
      correctFilteredRows.push(...buyCalcRows);
      correctFilteredRows.push(...sellCalcRows);
      
      // Add shipping related costs and hedging rows from underlyingRows
      underlyingRows.forEach(r => {
        const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
        const internalPortfolio = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
        
        const isShipping = cflowType === 'src- shipping related cost' || cflowType.includes('shipping related cost');
        const isHedging = internalPortfolio === 'hedging lng' || internalPortfolio.includes('hedging');
        
        if (isShipping || isHedging) {
          if (!correctFilteredRows.includes(r)) {
            if (isShipping && hasOpt) {
              const isOptRow = internalPortfolio === 'optimization lng' || internalPortfolio.includes('optimization');
              if (!isOptRow) return;
            }
            correctFilteredRows.push(r);
          }
        }
      });

      // Sum up Base_Total_Value_USD and Change_in_Total_PnL for these correctly filtered line items
      correctFilteredRows.forEach(r => {
        const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
        const pnl = Number(String(r['Change_in_Total_PnL'] || '').replace(/[^0-9.-]/g, ''));
        
        if (!isNaN(val)) {
          totalValueUSD += val;
        }
        if (!isNaN(pnl)) {
          totalPnL += pnl;
        }
      });

      // 2. Calculate Purchase Metrics from buyCalcRows
      let buyTiers: any[] = [];
      if (buyCalcRows.length === 2) {
        buyTiers = buyCalcRows.map(r => {
          const vol = Number(String(r['Volume'] || '').replace(/[^0-9.-]/g, ''));
          const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
          const price = Number(String(r['Price'] || '').replace(/[^0-9.-]/g, ''));
          return {
            vol: isNaN(vol) ? 0 : vol,
            val: isNaN(val) ? 0 : val,
            price: isNaN(price) ? 0 : price
          };
        });
      }

      buyCalcRows.forEach(r => {
        const vol = Number(String(r['Volume'] || '').replace(/[^0-9.-]/g, ''));
        const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
        const price = Number(String(r['Price'] || '').replace(/[^0-9.-]/g, ''));

        if (!isNaN(vol)) {
          purchaseVolume += vol;
        }
        if (!isNaN(val)) {
          purchaseCost += Math.abs(val);
        }
        if (!isNaN(price)) {
          if (!isNaN(vol) && vol > 0) {
            weightedBuyPriceSum += price * vol;
            buyPriceVolSum += vol;
          }
          simpleBuyPriceSum += price;
          buyPriceCount++;
        }
      });

      // 3. Calculate Sales Metrics from sellCalcRows
      let sellTiers: any[] = [];
      if (sellCalcRows.length === 2) {
        sellTiers = sellCalcRows.map(r => {
          const vol = Number(String(r['Volume'] || '').replace(/[^0-9.-]/g, ''));
          const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
          const price = Number(String(r['Price'] || '').replace(/[^0-9.-]/g, ''));
          return {
            vol: isNaN(vol) ? 0 : vol,
            val: isNaN(val) ? 0 : val,
            price: isNaN(price) ? 0 : price
          };
        });
      }

      sellCalcRows.forEach(r => {
        const vol = Number(String(r['Volume'] || '').replace(/[^0-9.-]/g, ''));
        const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
        const price = Number(String(r['Price'] || '').replace(/[^0-9.-]/g, ''));

        if (!isNaN(vol)) {
          salesVolume += vol;
        }
        if (!isNaN(val)) {
          salesRevenue += Math.abs(val);
        }
        if (!isNaN(price)) {
          if (!isNaN(vol) && vol > 0) {
            weightedSellPriceSum += price * vol;
            sellPriceVolSum += vol;
          }
          simpleSellPriceSum += price;
          sellPriceCount++;
        }
      });

      const purchasePrice = buyPriceVolSum > 0 
        ? weightedBuyPriceSum / buyPriceVolSum 
        : (buyPriceCount > 0 ? simpleBuyPriceSum / buyPriceCount : 0);

      const salesPrice = sellPriceVolSum > 0 
        ? weightedSellPriceSum / sellPriceVolSum 
        : (sellPriceCount > 0 ? simpleSellPriceSum / sellPriceCount : 0);

      // Try to find if there is an explicit "Exposure Month" or "Month" column in the raw rows
      const explicitMonths = new Set<string>();
      underlyingRows.forEach((r: any) => {
        const aliases = ['Exposure Month', 'ExposureMonth', 'Pricing Month', 'PricingMonth', 'Month', 'Delivery Month', 'DeliveryMonth'];
        for (const alias of aliases) {
          const val = r[alias];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            explicitMonths.add(String(val).trim());
            break;
          }
        }
      });

      let exposureMonths = '—';
      if (explicitMonths.size > 0) {
        exposureMonths = Array.from(explicitMonths).join(', ');
      } else {
        const ymKeys = new Set<string>();
        const getYearMonthKey = (dateStr: string) => {
          if (!dateStr) return null;
          const d = new Date(dateStr);
          if (isNaN(d.getTime())) return null;
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        };

        underlyingRows.forEach((r: any) => {
          const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
          if (cflowType === 'commodity' || cflowType === 'physical') {
            const sDate = String(r['Start Date'] || '').trim();
            const eDate = String(r['End Date'] || '').trim();
            
            const sKey = getYearMonthKey(sDate);
            if (sKey) ymKeys.add(sKey);
            const eKey = getYearMonthKey(eDate);
            if (eKey) ymKeys.add(eKey);
          }
        });

        const monthsList = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const sortedYmKeys = Array.from(ymKeys).sort();
        exposureMonths = sortedYmKeys.map(ym => {
          const [y, m] = ym.split('-');
          const mIdx = parseInt(m) - 1;
          const shortYear = y.slice(-2);
          return `${monthsList[mIdx]}-${shortYear}`;
        }).join(', ') || '—';
      }

      let loadingDateVal = '';
      let deliveryDateVal = '';

      underlyingRows.forEach((r: any) => {
        const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
        if (cflowType === 'commodity' || cflowType === 'physical') {
          const buySell = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase();
          const isBuy = buySell === 'buy' || buySell === 'buys';
          const isSell = buySell === 'sell' || buySell === 'sells';
          
          if (isBuy) {
            const sDate = String(r['Start Date'] || r['Comm Window Start Date'] || '').trim();
            if (sDate) loadingDateVal = sDate;
          }
          if (isSell) {
            const eDate = String(r['End Date'] || r['Comm Window End Date'] || '').trim();
            if (eDate) deliveryDateVal = eDate;
          }
        }
      });

      const loadingMonth = loadingDateVal ? formatToMonthYear(loadingDateVal) : '—';
      const deliveryMonth = deliveryDateVal ? formatToMonthYear(deliveryDateVal) : '—';

      let basePnL = 0;
      let baseValueUSD = 0;
      if (optimisationStatus === 'Yes') {
        let buyBaseCalcRows: any[] = [];
        let sellBaseCalcRows: any[] = [];
        
        if (unallocatedCargo === 'Matched') {
          buyBaseCalcRows = underlyingRows.filter(r => {
            const isBuy = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || r['Buy_Sell'] || '').toLowerCase() === 'buys';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const isBase = port === 'base lng' || port.includes('base');
            return isBuy && cflowType === 'commodity' && isBase && sett !== 'Physical Settlement';
          });
          sellBaseCalcRows = underlyingRows.filter(r => {
            const isSell = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || r['Buy_Sell'] || '').toLowerCase() === 'sells';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const isBase = port === 'base lng' || port.includes('base');
            return isSell && cflowType === 'commodity' && isBase && sett !== 'Physical Settlement';
          });
        } else if (unallocatedCargo === 'Open on Buy Leg') {
          buyBaseCalcRows = underlyingRows.filter(r => {
            const isSell = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || r['Buy_Sell'] || '').toLowerCase() === 'sells';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const isBase = port === 'base lng' || port.includes('base');
            return isSell && cflowType === 'commodity' && isBase && sett === 'Physical Settlement';
          });
          sellBaseCalcRows = underlyingRows.filter(r => {
            const isSell = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || r['Buy_Sell'] || '').toLowerCase() === 'sells';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const isBase = port === 'base lng' || port.includes('base');
            return isSell && cflowType === 'commodity' && isBase && sett !== 'Physical Settlement';
          });
        } else if (unallocatedCargo === 'Open on Sell Leg') {
          sellBaseCalcRows = underlyingRows.filter(r => {
            const isBuy = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || r['Buy_Sell'] || '').toLowerCase() === 'buys';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const isBase = port === 'base lng' || port.includes('base');
            return isBuy && cflowType === 'commodity' && isBase && sett === 'Physical Settlement';
          });
          buyBaseCalcRows = underlyingRows.filter(r => {
            const isBuy = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || r['Buy_Sell'] || '').toLowerCase() === 'buys';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const isBase = port === 'base lng' || port.includes('base');
            return isBuy && cflowType === 'commodity' && isBase && sett !== 'Physical Settlement';
          });
        } else {
          buyBaseCalcRows = underlyingRows.filter(r => {
            const isBuy = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || r['Buy_Sell'] || '').toLowerCase() === 'buys';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const isBase = port === 'base lng' || port.includes('base');
            return isBuy && cflowType === 'commodity' && isBase;
          });
          sellBaseCalcRows = underlyingRows.filter(r => {
            const isSell = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || r['Buy_Sell'] || '').toLowerCase() === 'sells';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const isBase = port === 'base lng' || port.includes('base');
            return isSell && cflowType === 'commodity' && isBase;
          });
        }
        
        const correctBaseFilteredRows = [...buyBaseCalcRows, ...sellBaseCalcRows];
        
        underlyingRows.forEach(r => {
          const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
          const internalPortfolio = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
          const isShipping = cflowType === 'src- shipping related cost' || cflowType.includes('shipping related cost');
          const isHedging = internalPortfolio === 'hedging lng' || internalPortfolio.includes('hedging');
          
          if (isShipping || isHedging) {
            if (!correctBaseFilteredRows.includes(r)) {
              if (isShipping) {
                const isBaseRow = internalPortfolio === 'base lng' || internalPortfolio.includes('base');
                if (!isBaseRow) return;
              }
              correctBaseFilteredRows.push(r);
            }
          }
        });
        
        correctBaseFilteredRows.forEach(r => {
          const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
          const pnl = Number(String(r['Change_in_Total_PnL'] || '').replace(/[^0-9.-]/g, ''));
          if (!isNaN(val)) baseValueUSD += val;
          if (!isNaN(pnl)) basePnL += pnl;
        });
      }

      return {
        strategyName,
        physicalPnLStatus,
        optimisationStatus,
        unallocatedCargo,
        exposureMonths,
        loadingMonth,
        deliveryMonth,
        basePnL,
        baseValueUSD,
        purchaseVolume,
        salesVolume,
        purchasePrice,
        salesPrice,
        purchaseCost,
        salesRevenue,
        shippingRelatedCosts,
        hedgingPnL,
        totalVolume,
        totalValueUSD,
        totalPnL,
        dealCount: underlyingRows.length,
        buyTiers,
        sellTiers,
        underlyingRows
      };
    });
  }, [dateAndYearFilteredRows]);

  const columns = useMemo(() => {
    const cols = [
      'Strategy Name', 'Physical P&L Bucket', 'Optimisation', 'Unallocated Cargo'
    ];
    if (showExposureMonths) {
      cols.push('Exposure Months');
    }
    if (showLoadingMonth) {
      cols.push('Loading Month');
    }
    if (showDeliveryMonth) {
      cols.push('Delivery Month');
    }
    cols.push(
      'Purchase Volume', 'Sales Volume', 'Purchase Price', 'Sales Price',
      'Purchase Cost', 'Sales Revenue', 'Shipping Related Costs', 'Hedging P&L',
      'Sum of Value', 'Change in P&L'
    );
    if (showLinesCount) {
      cols.push('Lines Count');
    }
    return cols;
  }, [showExposureMonths, showLoadingMonth, showDeliveryMonth, showLinesCount]);

  const numCols = useMemo(() => [
    'Purchase Volume', 'Sales Volume', 'Purchase Price', 'Sales Price',
    'Purchase Cost', 'Sales Revenue', 'Shipping Related Costs', 'Hedging P&L',
    'Sum of Value', 'Change in P&L', 'Lines Count'
  ], []);

  const clickableFilteredCols = useMemo(() => [
    'Shipping Related Costs', 'Hedging P&L'
  ], []);

  // Compute unique values inside each column for filters
  const uniqueValues = useMemo(() => {
    const map: Record<string, { value: string; count: number }[]> = {};
    columns.forEach(col => {
      const counts: Record<string, number> = {};
      summaryData.forEach((item: any) => {
        let val = '';
        if (col === 'Strategy Name') val = item.strategyName;
        else if (col === 'Physical P&L Bucket') val = item.physicalPnLStatus;
        else if (col === 'Optimisation') val = item.optimisationStatus;
        else if (col === 'Unallocated Cargo') val = item.unallocatedCargo;
        else if (col === 'Exposure Months') val = item.exposureMonths;
        else if (col === 'Loading Month') val = item.loadingMonth;
        else if (col === 'Delivery Month') val = item.deliveryMonth;
        else if (col === 'Purchase Volume') val = String(item.purchaseVolume);
        else if (col === 'Sales Volume') val = String(item.salesVolume);
        else if (col === 'Purchase Price') val = String(item.purchasePrice);
        else if (col === 'Sales Price') val = String(item.salesPrice);
        else if (col === 'Purchase Cost') val = String(item.purchaseCost);
        else if (col === 'Sales Revenue') val = String(item.salesRevenue);
        else if (col === 'Shipping Related Costs') val = String(item.shippingRelatedCosts);
        else if (col === 'Hedging P&L') val = String(item.hedgingPnL);
        else if (col === 'Sum of Value') val = String(item.totalValueUSD);
        else if (col === 'Change in P&L') val = String(item.totalPnL);
        else if (col === 'Lines Count') val = String(item.dealCount);

        const v = String(val !== undefined && val !== null ? val : '').trim();
        counts[v] = (counts[v] || 0) + 1;
      });
      map[col] = Object.entries(counts)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);
    });
    return map;
  }, [summaryData, columns]);

  // Main Comprehensive Filter and Sort Engine
  const filteredAndSortedSummaryData = useMemo(() => {
    let result = [...summaryData];

    // Filter by TRMS Group (PL9SB, FLNG1, FLNG2, LNGC, Spot, Cheniere, Others)
    if (activeTrmsGroup !== 'All') {
      result = result.filter(item => getTrmsGroupName(item.strategyName) === activeTrmsGroup);
    }

    // 1. Global text search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(item => {
        return (
          item.strategyName.toLowerCase().includes(term) ||
          item.physicalPnLStatus.toLowerCase().includes(term) ||
          item.optimisationStatus.toLowerCase().includes(term) ||
          item.unallocatedCargo.toLowerCase().includes(term) ||
          item.exposureMonths.toLowerCase().includes(term) ||
          item.loadingMonth.toLowerCase().includes(term) ||
          item.deliveryMonth.toLowerCase().includes(term)
        );
      });
    }

    // 2. Multi-column filters
    Object.entries(columnFilters).forEach(([col, filter]) => {
      // A. Value checkbox selections
      if (filter.selectedValues && filter.selectedValues.size > 0) {
        result = result.filter((item: any) => {
          let val = '';
          if (col === 'Strategy Name') val = item.strategyName;
          else if (col === 'Physical P&L Bucket') val = item.physicalPnLStatus;
          else if (col === 'Optimisation') val = item.optimisationStatus;
          else if (col === 'Unallocated Cargo') val = item.unallocatedCargo;
          else if (col === 'Exposure Months') val = item.exposureMonths;
          else if (col === 'Loading Month') val = item.loadingMonth;
          else if (col === 'Delivery Month') val = item.deliveryMonth;
          else if (col === 'Purchase Volume') val = String(item.purchaseVolume);
          else if (col === 'Sales Volume') val = String(item.salesVolume);
          else if (col === 'Purchase Price') val = String(item.purchasePrice);
          else if (col === 'Sales Price') val = String(item.salesPrice);
          else if (col === 'Purchase Cost') val = String(item.purchaseCost);
          else if (col === 'Sales Revenue') val = String(item.salesRevenue);
          else if (col === 'Shipping Related Costs') val = String(item.shippingRelatedCosts);
          else if (col === 'Hedging P&L') val = String(item.hedgingPnL);
          else if (col === 'Sum of Value') val = String(item.totalValueUSD);
          else if (col === 'Change in P&L') val = String(item.totalPnL);
          else if (col === 'Lines Count') val = String(item.dealCount);

          const valStr = String(val).trim();
          return filter.selectedValues.has(valStr);
        });
      }

      // B. Condition operations
      if (filter.condition && filter.condition !== 'none') {
        const cond = filter.condition;
        const val1 = filter.conditionValue1.toLowerCase();
        const val2 = filter.conditionValue2.toLowerCase();

        result = result.filter((item: any) => {
          let valStr = '';
          let valNum = 0;

          if (col === 'Strategy Name') { valStr = item.strategyName; valNum = NaN; }
          else if (col === 'Physical P&L Bucket') { valStr = item.physicalPnLStatus; valNum = NaN; }
          else if (col === 'Optimisation') { valStr = item.optimisationStatus; valNum = NaN; }
          else if (col === 'Unallocated Cargo') { valStr = item.unallocatedCargo; valNum = NaN; }
          else if (col === 'Exposure Months') { valStr = item.exposureMonths; valNum = NaN; }
          else if (col === 'Loading Month') { valStr = item.loadingMonth; valNum = NaN; }
          else if (col === 'Delivery Month') { valStr = item.deliveryMonth; valNum = NaN; }
          else if (col === 'Purchase Volume') { valStr = String(item.purchaseVolume); valNum = item.purchaseVolume; }
          else if (col === 'Sales Volume') { valStr = String(item.salesVolume); valNum = item.salesVolume; }
          else if (col === 'Purchase Price') { valStr = String(item.purchasePrice); valNum = item.purchasePrice; }
          else if (col === 'Sales Price') { valStr = String(item.salesPrice); valNum = item.salesPrice; }
          else if (col === 'Purchase Cost') { valStr = String(item.purchaseCost); valNum = item.purchaseCost; }
          else if (col === 'Sales Revenue') { valStr = String(item.salesRevenue); valNum = item.salesRevenue; }
          else if (col === 'Shipping Related Costs') { valStr = String(item.shippingRelatedCosts); valNum = item.shippingRelatedCosts; }
          else if (col === 'Hedging P&L') { valStr = String(item.hedgingPnL); valNum = item.hedgingPnL; }
          else if (col === 'Sum of Value') { valStr = String(item.totalValueUSD); valNum = item.totalValueUSD; }
          else if (col === 'Change in P&L') { valStr = String(item.totalPnL); valNum = item.totalPnL; }
          else if (col === 'Lines Count') { valStr = String(item.dealCount); valNum = item.dealCount; }

          const valStrLower = valStr.toLowerCase();

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
        let valA: any = '';
        let valB: any = '';

        if (col === 'Strategy Name') { valA = a.strategyName; valB = b.strategyName; }
        else if (col === 'Physical P&L Bucket') { valA = a.physicalPnLStatus; valB = b.physicalPnLStatus; }
        else if (col === 'Optimisation') { valA = a.optimisationStatus; valB = b.optimisationStatus; }
        else if (col === 'Unallocated Cargo') { valA = a.unallocatedCargo; valB = b.unallocatedCargo; }
        else if (col === 'Exposure Months') { valA = a.exposureMonths; valB = b.exposureMonths; }
        else if (col === 'Loading Month') { valA = a.loadingMonth; valB = b.loadingMonth; }
        else if (col === 'Delivery Month') { valA = a.deliveryMonth; valB = b.deliveryMonth; }
        else if (col === 'Purchase Volume') { valA = a.purchaseVolume; valB = b.purchaseVolume; }
        else if (col === 'Sales Volume') { valA = a.salesVolume; valB = b.salesVolume; }
        else if (col === 'Purchase Price') { valA = a.purchasePrice; valB = b.purchasePrice; }
        else if (col === 'Sales Price') { valA = a.salesPrice; valB = b.salesPrice; }
        else if (col === 'Purchase Cost') { valA = a.purchaseCost; valB = b.purchaseCost; }
        else if (col === 'Sales Revenue') { valA = a.salesRevenue; valB = b.salesRevenue; }
        else if (col === 'Shipping Related Costs') { valA = a.shippingRelatedCosts; valB = b.shippingRelatedCosts; }
        else if (col === 'Hedging P&L') { valA = a.hedgingPnL; valB = b.hedgingPnL; }
        else if (col === 'Sum of Value') { valA = a.totalValueUSD; valB = b.totalValueUSD; }
        else if (col === 'Change in P&L') { valA = a.totalPnL; valB = b.totalPnL; }
        else if (col === 'Lines Count') { valA = a.dealCount; valB = b.dealCount; }

        if (numCols.includes(col)) {
          const numA = Number(valA);
          const numB = Number(valB);
          return isAsc ? numA - numB : numB - numA;
        }

        const strA = String(valA || '').toLowerCase();
        const strB = String(valB || '').toLowerCase();
        return isAsc ? strA.localeCompare(strB) : strB.localeCompare(strA);
      });
    } else {
      // Default alphabetically by strategy name ascending
      result.sort((a, b) => a.strategyName.localeCompare(b.strategyName));
    }

    return result;
  }, [summaryData, searchTerm, columnFilters, sortConfig, numCols, activeTrmsGroup]);

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
  };

  const handleSelectAllUniqueValues = (col: string, selectAll: boolean) => {
    setColumnFilters(prev => {
      const current = prev[col] || { selectedValues: new Set<string>(), condition: 'none', conditionValue1: '', conditionValue2: '' };
      const newSel = new Set<string>();
      if (!selectAll) {
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
    setSelectedYear('all');
    setSortConfig({ column: '', direction: null });
  };

  // Dashboard calculations for KPIs in view
  const kpis = useMemo(() => {
    const total = filteredAndSortedSummaryData.length;
    let realized = 0;
    let optYes = 0;
    let optAlert = 0;
    let matchedCargo = 0;
    let openSell = 0;
    let openBuy = 0;
    let aggregatePnL = 0;

    let aggregatePurchaseVolume = 0;
    let aggregateSalesVolume = 0;
    let aggregatePurchaseCost = 0;
    let aggregateSalesRevenue = 0;
    let aggregateShippingCosts = 0;
    let aggregateHedgingPnL = 0;

    filteredAndSortedSummaryData.forEach(item => {
      if (item.physicalPnLStatus === 'Realized') realized++;
      if (item.optimisationStatus === 'Yes') optYes++;
      if (item.optimisationStatus === 'Alert') optAlert++;
      if (item.unallocatedCargo === 'Matched') matchedCargo++;
      else if (item.unallocatedCargo === 'Open on Sell Leg') openSell++;
      else if (item.unallocatedCargo === 'Open on Buy Leg') openBuy++;
      aggregatePnL += item.totalPnL;

      aggregatePurchaseVolume += item.purchaseVolume;
      aggregateSalesVolume += item.salesVolume;
      aggregatePurchaseCost += item.purchaseCost;
      aggregateSalesRevenue += item.salesRevenue;
      aggregateShippingCosts += item.shippingRelatedCosts;
      aggregateHedgingPnL += item.hedgingPnL;
    });

    return {
      total,
      realized,
      unrealized: total - realized,
      optYes,
      optAlert,
      matchedCargo,
      openSell,
      openBuy,
      aggregatePnL,
      aggregatePurchaseVolume,
      aggregateSalesVolume,
      aggregatePurchaseCost,
      aggregateSalesRevenue,
      aggregateShippingCosts,
      aggregateHedgingPnL
    };
  }, [filteredAndSortedSummaryData]);

  // -------------------------------------------------------------------------
  // EXECUTIVE DASHBOARD ANALYTICS COMPUTATIONS
  // -------------------------------------------------------------------------
  const pnlChartData = useMemo(() => {
    const sorted = [...filteredAndSortedSummaryData]
      .filter(item => item.totalPnL !== 0)
      .sort((a, b) => Math.abs(b.totalPnL) - Math.abs(a.totalPnL));
    return sorted.slice(0, 8).map(item => ({
      name: item.strategyName,
      value: item.totalPnL,
      abs: Math.abs(item.totalPnL),
      formattedValue: item.totalPnL >= 0 
        ? `+$${Math.abs(item.totalPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}` 
        : `-$${Math.abs(item.totalPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    }));
  }, [filteredAndSortedSummaryData]);

  const valuationChartData = useMemo(() => {
    const sorted = [...filteredAndSortedSummaryData]
      .filter(item => item.totalValueUSD !== 0)
      .sort((a, b) => b.totalValueUSD - a.totalValueUSD);
    return sorted.slice(0, 8).map(item => ({
      name: item.strategyName,
      value: item.totalValueUSD,
      formattedValue: `$${item.totalValueUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    }));
  }, [filteredAndSortedSummaryData]);

  const optimizationData = useMemo(() => {
    let yes = 0, no = 0, alert = 0;
    filteredAndSortedSummaryData.forEach(item => {
      const status = item.optimisationStatus;
      if (status === 'Yes') yes++;
      else if (status === 'No') no++;
      else if (status === 'Alert') alert++;
    });
    return [
      { name: 'Optimized (Yes)', value: yes, color: '#10b981' }, // emerald-500
      { name: 'Base-Only (No)', value: no, color: '#64748b' },   // slate-500
      { name: 'Alert (Missing Leg)', value: alert, color: '#f43f5e' } // rose-500
    ].filter(item => item.value > 0);
  }, [filteredAndSortedSummaryData]);

  const unallocatedData = useMemo(() => {
    let matched = 0, openSell = 0, openBuy = 0;
    filteredAndSortedSummaryData.forEach(item => {
      const status = item.unallocatedCargo;
      if (status === 'Matched') matched++;
      else if (status === 'Open on Sell Leg') openSell++;
      else if (status === 'Open on Buy Leg') openBuy++;
    });
    return [
      { name: 'Matched Legs', value: matched, color: '#6366f1' },  // indigo-500
      { name: 'Open Sell Leg', value: openSell, color: '#f59e0b' }, // amber-500
      { name: 'Open Buy Leg', value: openBuy, color: '#f97316' }   // orange-500
    ].filter(item => item.value > 0);
  }, [filteredAndSortedSummaryData]);

  // Selected Strategy object for Drilled-Down analysis
  const drilledDownStrategyObj = useMemo(() => {
    if (!selectedDrillDownStrategy) return null;
    return filteredAndSortedSummaryData.find(item => item.strategyName === selectedDrillDownStrategy) || null;
  }, [selectedDrillDownStrategy, filteredAndSortedSummaryData]);

  // Open strategy rows with distinct filter mode specified on click
  const handleCellClick = (strategyName: string, columnClicked: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid collapsing parent if we double-click or navigate

    // Determine targeted filter mode
    let targetMode: 'base_lng' | 'shipping_costs' | 'hedging' | 'all' | 'buy_commodity' | 'sell_commodity' = 'base_lng';
    if (columnClicked === 'Shipping Related Costs') {
      targetMode = 'shipping_costs';
    } else if (columnClicked === 'Hedging P&L') {
      targetMode = 'hedging';
    } else if (columnClicked === 'Lines Count') {
      targetMode = 'all';
    } else if (columnClicked === 'Purchase Cost' || columnClicked === 'Purchase Price' || columnClicked === 'Purchase Volume') {
      targetMode = 'buy_commodity';
    } else if (columnClicked === 'Sales Revenue' || columnClicked === 'Sales Price' || columnClicked === 'Sales Volume') {
      targetMode = 'sell_commodity';
    }

    // Expand state
    setExpandedStrategies(prev => {
      const next = new Set(prev);
      next.add(strategyName); // Always force open the expansion
      return next;
    });

    // Apply the audit detail list filter
    setExpandedFilters(prev => ({
      ...prev,
      [strategyName]: targetMode
    }));

    toast.success(`Showing ${targetMode.replace('_', ' ').toUpperCase()} details in the trade logs!`);
  };

  const toggleRowExpansion = (sn: string) => {
    setExpandedStrategies(prev => {
      const next = new Set(prev);
      if (next.has(sn)) {
        next.delete(sn);
      } else {
        next.add(sn);
        // Default to 'base_lng' strictly when expanded by normal clicks (satisfying rule: show Base LNG when clicked)
        setExpandedFilters(prevF => {
          if (!prevF[sn]) {
            return { ...prevF, [sn]: 'base_lng' };
          }
          return prevF;
        });
      }
      return next;
    });
  };

  // Filter underlying rows dynamically strictly based on active visual filter mode
  const getFilteredUnderlyingRows = (rowsList: any[], mode: 'base_lng' | 'shipping_costs' | 'hedging' | 'all' | 'buy_commodity' | 'sell_commodity') => {
    const hasOpt = rowsList.some(r => {
      const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
      return port === 'optimization lng' || port.includes('optimization');
    });

    switch (mode) {
      case 'base_lng':
        return rowsList.filter(r => {
          const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
          if (hasOpt) {
            return port === 'optimization lng' || port.includes('optimization');
          }
          return port === 'base lng' || port.includes('base');
        });
      case 'shipping_costs':
        return rowsList.filter(r => {
          const cflow = String(r['Cflow Type'] || '').trim().toLowerCase();
          const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
          const isShipping = cflow === 'src- shipping related cost' || cflow.includes('shipping related cost');
          if (hasOpt) {
            return isShipping && (port === 'optimization lng' || port.includes('optimization'));
          }
          return isShipping;
        });
      case 'hedging':
        return rowsList.filter(r => {
          const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
          return port === 'hedging lng' || port.includes('hedging');
        });
      case 'buy_commodity':
        return rowsList.filter(r => {
          const buySell = String(r['Buy_Sell'] || r['BuySell'] || '').trim().toLowerCase();
          const cflow = String(r['Cflow Type'] || '').trim().toLowerCase();
          const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
          const isBuy = buySell === 'buy' || buySell === 'buys';
          const isComm = cflow === 'commodity';
          if (hasOpt) {
            return isBuy && isComm && (port === 'optimization lng' || port.includes('optimization'));
          }
          return isBuy && isComm;
        });
      case 'sell_commodity':
        return rowsList.filter(r => {
          const buySell = String(r['Buy_Sell'] || r['BuySell'] || '').trim().toLowerCase();
          const cflow = String(r['Cflow Type'] || '').trim().toLowerCase();
          const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
          const isSell = buySell === 'sell' || buySell === 'sells';
          const isComm = cflow === 'commodity';
          if (hasOpt) {
            return isSell && isComm && (port === 'optimization lng' || port.includes('optimization'));
          }
          return isSell && isComm;
        });
      case 'all':
      default:
        return rowsList;
    }
  };

  const handleExportSummaryCSV = () => {
    if (filteredAndSortedSummaryData.length === 0) return;

    const exportHeaders = [
      'Strategy Name', 
      'Physical P&L Bucket', 
      'Optimisation', 
      'Unallocated Cargo', 
      'Exposure Months',
      'Loading Month',
      'Delivery Month',
      'Purchase Volume', 
      'Sales Volume', 
      'Purchase Price', 
      'Sales Price', 
      'Purchase Cost', 
      'Sales Revenue', 
      'Shipping Related Costs',
      'Hedging P&L',
      'Sum of Value', 
      'Sum of P&L', 
      'Lines Count'
    ];

    const bodyRows = filteredAndSortedSummaryData.map(item => {
      return [
        `"${item.strategyName.replace(/"/g, '""')}"`,
        `"${item.physicalPnLStatus}"`,
        `"${item.optimisationStatus}"`,
        `"${item.unallocatedCargo}"`,
        `"${(item.exposureMonths || '').replace(/"/g, '""')}"`,
        `"${(item.loadingMonth || '').replace(/"/g, '""')}"`,
        `"${(item.deliveryMonth || '').replace(/"/g, '""')}"`,
        item.purchaseVolume,
        item.salesVolume,
        item.purchasePrice,
        item.salesPrice,
        item.purchaseCost,
        item.salesRevenue,
        item.shippingRelatedCosts,
        item.hedgingPnL,
        item.totalValueUSD,
        item.totalPnL,
        item.dealCount
      ].join(',');
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [exportHeaders.join(','), ...bodyRows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `trms_portfolio_summary_audit_${selectedEodDate !== 'all' ? selectedEodDate : 'all_dates'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("TRMS portfolio summary table exported successfully!");
  };

  const renderCellMetric = (col: string, item: any) => {
    let val: any = 0;
    if (col === 'Purchase Volume') val = item.purchaseVolume;
    else if (col === 'Sales Volume') val = item.salesVolume;
    else if (col === 'Purchase Price') val = item.purchasePrice;
    else if (col === 'Sales Price') val = item.salesPrice;
    else if (col === 'Purchase Cost') val = item.purchaseCost;
    else if (col === 'Sales Revenue') val = item.salesRevenue;
    else if (col === 'Shipping Related Costs') val = item.shippingRelatedCosts;
    else if (col === 'Hedging P&L') val = item.hedgingPnL;
    else if (col === 'Sum of Value') val = item.totalValueUSD;
    else if (col === 'Change in P&L') val = item.totalPnL;
    else if (col === 'Lines Count') val = item.dealCount;
    else if (col === 'Exposure Months') val = item.exposureMonths;
    else if (col === 'Loading Month') val = item.loadingMonth;
    else if (col === 'Delivery Month') val = item.deliveryMonth;

    if (numCols.includes(col)) {
      // Custom visual for two-tier purchase pricing
      if (
        item.buyTiers && 
        item.buyTiers.length === 2 && 
        (col === 'Purchase Volume' || col === 'Purchase Price' || col === 'Purchase Cost')
      ) {
        if (col === 'Purchase Volume') {
          const v1 = item.buyTiers[0].vol;
          const v2 = item.buyTiers[1].vol;
          return (
            <div className="flex flex-col items-end text-right">
              <span className="text-[10px] text-slate-300 font-medium">
                {v1.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[9px] text-slate-500 font-normal">(T1)</span>
              </span>
              <span className="text-[10px] text-slate-300 font-medium">
                {v2.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[9px] text-slate-500 font-normal">(T2)</span>
              </span>
              <span className="text-[9px] text-indigo-400 font-bold border-t border-slate-800/80 mt-0.5 pt-0.5 w-full">
                Σ {val.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          );
        }
        if (col === 'Purchase Price') {
          const p1 = item.buyTiers[0].price;
          const p2 = item.buyTiers[1].price;
          return (
            <div className="flex flex-col items-end text-right">
              <span className="text-[10px] text-emerald-400 font-medium">
                ${p1.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} <span className="text-[9px] text-slate-500 font-normal">(T1)</span>
              </span>
              <span className="text-[10px] text-emerald-400 font-medium">
                ${p2.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} <span className="text-[9px] text-slate-500 font-normal">(T2)</span>
              </span>
              <span className="text-[9px] text-slate-400 font-bold border-t border-slate-800/80 mt-0.5 pt-0.5 w-full">
                ø ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
              </span>
            </div>
          );
        }
        if (col === 'Purchase Cost') {
          const c1 = Math.abs(item.buyTiers[0].val);
          const c2 = Math.abs(item.buyTiers[1].val);
          const totalC = Math.abs(val);
          return (
            <div className="flex flex-col items-end text-right">
              <span className="text-[10px] text-slate-300 font-medium">
                ${c1.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[9px] text-slate-500 font-normal">(T1)</span>
              </span>
              <span className="text-[10px] text-slate-300 font-medium">
                ${c2.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[9px] text-slate-500 font-normal">(T2)</span>
              </span>
              <span className="text-[9px] text-indigo-400 font-bold border-t border-slate-800/80 mt-0.5 pt-0.5 w-full">
                Σ ${totalC.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          );
        }
      }

      // Custom visual for two-tier sales pricing
      if (
        item.sellTiers && 
        item.sellTiers.length === 2 && 
        (col === 'Sales Volume' || col === 'Sales Price' || col === 'Sales Revenue')
      ) {
        if (col === 'Sales Volume') {
          const v1 = item.sellTiers[0].vol;
          const v2 = item.sellTiers[1].vol;
          return (
            <div className="flex flex-col items-end text-right">
              <span className="text-[10px] text-slate-300 font-medium">
                {v1.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[9px] text-slate-500 font-normal">(T1)</span>
              </span>
              <span className="text-[10px] text-slate-300 font-medium">
                {v2.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[9px] text-slate-500 font-normal">(T2)</span>
              </span>
              <span className="text-[9px] text-indigo-400 font-bold border-t border-slate-800/80 mt-0.5 pt-0.5 w-full">
                Σ {val.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          );
        }
        if (col === 'Sales Price') {
          const p1 = item.sellTiers[0].price;
          const p2 = item.sellTiers[1].price;
          return (
            <div className="flex flex-col items-end text-right">
              <span className="text-[10px] text-blue-400 font-medium">
                ${p1.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} <span className="text-[9px] text-slate-500 font-normal">(T1)</span>
              </span>
              <span className="text-[10px] text-blue-400 font-medium">
                ${p2.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} <span className="text-[9px] text-slate-500 font-normal">(T2)</span>
              </span>
              <span className="text-[9px] text-slate-400 font-bold border-t border-slate-800/80 mt-0.5 pt-0.5 w-full">
                ø ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
              </span>
            </div>
          );
        }
        if (col === 'Sales Revenue') {
          const r1 = Math.abs(item.sellTiers[0].val);
          const r2 = Math.abs(item.sellTiers[1].val);
          const totalR = Math.abs(val);
          return (
            <div className="flex flex-col items-end text-right">
              <span className="text-[10px] text-slate-300 font-medium">
                ${r1.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[9px] text-slate-500 font-normal">(T1)</span>
              </span>
              <span className="text-[10px] text-slate-300 font-medium">
                ${r2.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[9px] text-slate-500 font-normal">(T2)</span>
              </span>
              <span className="text-[9px] text-indigo-400 font-bold border-t border-slate-800/80 mt-0.5 pt-0.5 w-full">
                Σ ${totalR.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          );
        }
      }

      if (col === 'Purchase Volume' || col === 'Sales Volume') {
        return val === 0 ? '—' : val.toLocaleString(undefined, { maximumFractionDigits: 3 });
      }
      if (col === 'Purchase Price' || col === 'Sales Price') {
        return val === 0 ? '—' : `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
      }
      if (col === 'Purchase Cost' || col === 'Sales Revenue' || col === 'Shipping Related Costs' || col === 'Hedging P&L') {
        const sign = val < 0 ? '-' : '';
        return val === 0 ? '—' : `${sign}$${Math.abs(val).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
      }
      if (col === 'Sum of Value') {
        const sign = val < 0 ? '-' : '';
        return val === 0 ? '$0' : `${sign}$${Math.abs(val).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
      }
      if (col === 'Change in P&L') {
        if (val > 0) {
          return (
            <span className="inline-flex items-center gap-1 font-extrabold text-emerald-400 font-mono text-[11px] tracking-wide bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/30">
              <span>▲</span>
              <span>+${Math.abs(val).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </span>
          );
        } else if (val < 0) {
          return (
            <span className="inline-flex items-center gap-1 font-extrabold text-rose-400 font-mono text-[11px] tracking-wide bg-rose-950/40 px-2 py-0.5 rounded border border-rose-800/30">
              <span>▼</span>
              <span>-${Math.abs(val).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </span>
          );
        } else {
          return (
            <span className="inline-flex items-center gap-1 font-semibold text-slate-400 font-mono text-[11px] bg-slate-900/50 px-2 py-0.5 rounded border border-slate-800/30">
              <span>▶</span>
              <span>$0</span>
            </span>
          );
        }
      }
      if (col === 'Lines Count') {
        return `${val} deals`;
      }
    }
    return String(val);
  };

  // Render Dashboard Views
  const renderDashboard = () => {
    // A. Drill-Down view if a strategy is selected
    if (selectedDrillDownStrategy && drilledDownStrategyObj) {
      const item = drilledDownStrategyObj;
      const rowsForStrat = item.underlyingRows || [];

      return (
        <div className="flex-1 overflow-auto custom-scrollbar bg-slate-50 p-4 space-y-4">
          {/* Top navigation header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedDrillDownStrategy(null)}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Dashboard</span>
              </button>
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-widest">DRILLED DOWN STRATEGY</div>
                <h2 className="text-sm font-extrabold text-slate-850 tracking-wide mt-0.5">{item.strategyName}</h2>
              </div>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              <span className={`px-2.5 py-1 rounded text-[10px] font-bold font-mono border flex items-center gap-1.5 ${
                item.optimisationStatus === 'Yes' 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : item.optimisationStatus === 'No'
                  ? 'bg-slate-50 text-slate-500 border-slate-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                <span>●</span>
                <span>Optimized: {item.optimisationStatus || 'No'}</span>
              </span>

              <span className={`px-2.5 py-1 rounded text-[10px] font-bold font-mono border flex items-center gap-1.5 ${
                item.unallocatedCargo === 'Matched' 
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                <span>●</span>
                <span>Cargo: {item.unallocatedCargo || 'Open Leg'}</span>
              </span>

              <span className="px-2.5 py-1 bg-slate-50 border border-slate-200 text-slate-600 rounded text-[10px] font-bold font-mono flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-450" />
                <span>Exposure: {item.exposureMonths || '—'}</span>
              </span>
            </div>
          </div>

          {/* Drill-Down visual Cargo-Form inspector Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* Card 1: Identity & Configuration */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">1. Identity &amp; Status</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Strategy Name</span>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs text-slate-700 font-semibold">{item.strategyName}</div>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">EOD Portfolio</span>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs text-slate-700 font-semibold">{getTrmsGroupName(item.strategyName)} Group</div>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Optimization Status</span>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs text-slate-700 font-semibold">{item.optimisationStatus || 'No'}</div>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Cargo Matching</span>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs text-slate-700 font-semibold">{item.unallocatedCargo || 'Matched'}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Loading / Purchase Leg Details */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">2. Loading / Purchase Details</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Purchase Volume</span>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs text-slate-700 font-semibold">{item.purchaseVolume.toLocaleString()} MMBtu</div>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Weighted Buy Price</span>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs text-slate-700 font-semibold">${item.purchasePrice.toFixed(2)} /MMBtu</div>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Total Purchase Cost</span>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs text-emerald-600 font-bold">${item.purchaseCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                  </div>
                </div>
                {item.buyTiers && item.buyTiers.length > 0 && (
                  <div className="mt-3 bg-slate-50 border border-slate-100 rounded-lg p-2">
                    <span className="text-[8px] uppercase font-bold text-slate-400 block mb-1">Purchase Tier breakdown:</span>
                    <div className="space-y-1">
                      {item.buyTiers.map((t: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-[10px] font-mono text-slate-600">
                          <span>Tier {idx + 1}: {t.vol.toLocaleString()} MMBtu</span>
                          <span>Price: ${t.price.toFixed(4)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Card 3: Delivery / Sales Leg Details */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">3. Delivery / Sales Details</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Sales Volume</span>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs text-slate-700 font-semibold">{item.salesVolume.toLocaleString()} MMBtu</div>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Weighted Sell Price</span>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs text-slate-700 font-semibold">${item.salesPrice.toFixed(2)} /MMBtu</div>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Total Sales Revenue</span>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs text-blue-600 font-bold">${item.salesRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                  </div>
                </div>
                {item.sellTiers && item.sellTiers.length > 0 && (
                  <div className="mt-3 bg-slate-50 border border-slate-100 rounded-lg p-2">
                    <span className="text-[8px] uppercase font-bold text-slate-400 block mb-1">Sales Tier breakdown:</span>
                    <div className="space-y-1">
                      {item.sellTiers.map((t: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-[10px] font-mono text-slate-600">
                          <span>Tier {idx + 1}: {t.vol.toLocaleString()} MMBtu</span>
                          <span>Price: ${t.price.toFixed(4)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Card 4: Operations & Performance */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">4. Operations &amp; Performance Overview</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Shipping Cost</span>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs text-purple-600 font-bold">${item.shippingRelatedCosts.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Hedging P&amp;L</span>
                    <div className={`bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs font-bold ${item.hedgingPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {item.hedgingPnL >= 0 ? '+' : ''}${item.hedgingPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Sum of Value</span>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs text-slate-700 font-bold">${item.totalValueUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Net Change in P&amp;L</span>
                    <div className={`bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs font-black ${item.totalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {item.totalPnL >= 0 ? '▲ +' : '▼ -'}${Math.abs(item.totalPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Drill-down Trade-Level Auditing Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-slate-750 uppercase tracking-widest flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-blue-600" />
                  Trade-Level Audit Trail ({rowsForStrat.length} Records)
                </h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">Inspect raw TRMS line item allocations comprising this strategy.</p>
              </div>

              {/* Excel Download button for this strategy */}
              <button
                onClick={() => {
                  try {
                    const ws = XLSX.utils.json_to_sheet(rowsForStrat);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Audit Trail");
                    XLSX.writeFile(wb, `TRMS_Audit_${item.strategyName}.xlsx`);
                    toast.success(`Exported audit trail for ${item.strategyName}`);
                  } catch (err) {
                    toast.error("Failed to export Excel");
                  }
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded text-[11px] font-bold text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Audit Excel</span>
              </button>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-[11.5px] font-mono text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10.5px] uppercase font-bold text-slate-500 tracking-wider">
                  <tr>
                    <th className="py-2.5 px-4 text-left">EOD Date</th>
                    <th className="py-2.5 px-3">Deal ID</th>
                    <th className="py-2.5 px-3">Buy/Sell</th>
                    <th className="py-2.5 px-3">Internal Portfolio</th>
                    <th className="py-2.5 px-3">Instrument</th>
                    <th className="py-2.5 px-3">Cash/Phys</th>
                    <th className="py-2.5 px-3 text-right">Volume</th>
                    <th className="py-2.5 px-3 text-right">Price ($)</th>
                    <th className="py-2.5 px-3 text-right">Sum of Value ($)</th>
                    <th className="py-2.5 px-4 text-right">Change in P&amp;L ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rowsForStrat.map((r, i) => {
                    const dealId = r['Deal No'] || r['DealNo'] || r['Deal_No'] || '—';
                    const buySell = String(r['Buy_Sell'] || r['BuySell'] || '').trim();
                    const portfolio = r['Internal Portfolio'] || r['Portfolio'] || '—';
                    const insType = r['Ins Type'] || r['InstrumentType'] || '—';
                    const sett = r['Settlement Type'] || '—';
                    const eodDt = r['EOD Date'] || r['EOD_Date'] || '—';
                    
                    // Parsing numeric columns safely
                    const vol = Number(r['Volume'] || r['Unsigned Volume'] || r['UnsignedVolume'] || 0);
                    const price = Number(r['Price'] || r['Price_Val'] || 0);
                    const valUsd = Number(r['Value USD'] || r['Value_USD'] || r['totalValueUSD'] || r['totalPnL'] || 0);
                    const pnlVal = Number(r['P&L Change'] || r['totalPnL'] || r['PnL'] || 0);

                    const isBuy = buySell.toLowerCase() === 'buy' || buySell.toLowerCase() === 'buys';

                    return (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-4 text-slate-500">{eodDt}</td>
                        <td className="py-2 px-3 font-semibold text-blue-600">{dealId}</td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isBuy ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}>
                            {buySell}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-600 truncate max-w-[150px]">{portfolio}</td>
                        <td className="py-2 px-3 text-slate-600">{insType}</td>
                        <td className="py-2 px-3 text-slate-500 text-[10px]">{sett}</td>
                        <td className="py-2 px-3 text-right text-slate-900 font-semibold">{vol.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className="py-2 px-3 text-right text-slate-700">${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                        <td className="py-2 px-3 text-right text-slate-800">${valUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className={`py-2 px-4 text-right font-bold ${pnlVal > 0 ? 'text-emerald-600' : pnlVal < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                          {pnlVal > 0 ? '+' : pnlVal < 0 ? '-' : ''}${Math.abs(pnlVal).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    // B. Main Executive Dashboard Overview
    const optimizedStrategies = filteredAndSortedSummaryData.filter(item => item.optimisationStatus === 'Yes');

    const optimizationKpis = {
      count: optimizedStrategies.length,
      totalBasePnL: optimizedStrategies.reduce((acc, item) => acc + (item.basePnL || 0), 0),
      totalOptimizedPnL: optimizedStrategies.reduce((acc, item) => acc + (item.totalPnL || 0), 0),
      netUplift: optimizedStrategies.reduce((acc, item) => acc + ((item.totalPnL || 0) - (item.basePnL || 0)), 0),
      totalVolume: optimizedStrategies.reduce((acc, item) => acc + (item.purchaseVolume || 0) + (item.salesVolume || 0), 0)
    };

    const optimizationChartData = optimizedStrategies.map(item => ({
      name: item.strategyName,
      "Base P&L": item.basePnL || 0,
      "Optimized P&L": item.totalPnL || 0,
      "Uplift": (item.totalPnL || 0) - (item.basePnL || 0)
    }));

    const categoryGroupedData = [
      { key: 'PL9SB', title: 'Train9 (PL9SB)', icon: <Layers className="w-5 h-5 text-indigo-500" />, description: 'Train 9 physical allocations & portfolio optimizations', items: [] as any[], totalPnL: 0, totalVolume: 0, optCount: 0, realizedCount: 0 },
      { key: 'Cheniere', title: 'Cheniere / SPL / CCL', icon: <Boxes className="w-5 h-5 text-amber-500" />, description: 'Cheniere Energy portfolio physical/hedging deals', items: [] as any[], totalPnL: 0, totalVolume: 0, optCount: 0, realizedCount: 0 },
      { key: 'LNGC', title: 'LNGC Ships', icon: <Ship className="w-5 h-5 text-blue-500" />, description: 'LNG carrier vessel transport & chartering contracts', items: [] as any[], totalPnL: 0, totalVolume: 0, optCount: 0, realizedCount: 0 },
      { key: 'FLNG', title: 'FLNG (Floating LNG)', icon: <Activity className="w-5 h-5 text-rose-500" />, description: 'FLNG1 & FLNG2 asset production & trade matches', items: [] as any[], totalPnL: 0, totalVolume: 0, optCount: 0, realizedCount: 0 },
      { key: 'Spot', title: 'Spot Cargoes', icon: <TrendingUp className="w-5 h-5 text-emerald-500" />, description: 'Spot market physical trades & opportunistic leg matching', items: [] as any[], totalPnL: 0, totalVolume: 0, optCount: 0, realizedCount: 0 },
      { key: 'Others', title: 'Other Portfolios', icon: <HelpCircle className="w-5 h-5 text-slate-500" />, description: 'Miscellaneous and third-party contract positions', items: [] as any[], totalPnL: 0, totalVolume: 0, optCount: 0, realizedCount: 0 }
    ];

    filteredAndSortedSummaryData.forEach(item => {
      const sn = item.strategyName.toUpperCase();
      let catKey = 'Others';
      if (sn.includes('PL9SB')) catKey = 'PL9SB';
      else if (sn.includes('CHENIERE') || sn.includes('SPL') || sn.includes('CCL')) catKey = 'Cheniere';
      else if (sn.includes('LNGC')) catKey = 'LNGC';
      else if (sn.includes('FLNG1') || sn.includes('PFLNG1') || sn.includes('FLNG2') || sn.includes('PFLNG2')) catKey = 'FLNG';
      else if (sn.includes('SPOT')) catKey = 'Spot';
      
      const grp = categoryGroupedData.find(g => g.key === catKey);
      if (grp) {
        grp.items.push(item);
        grp.totalPnL += item.totalPnL;
        grp.totalVolume += item.purchaseVolume + item.salesVolume;
        if (item.optimisationStatus === 'Yes') grp.optCount++;
        if (item.physicalPnLStatus === 'Realized') grp.realizedCount++;
      }
    });

    const activeGroupObj = categoryGroupedData.find(g => g.key === activeBreakdownCategory) || categoryGroupedData[0];

    return (
      <div className="flex-1 overflow-auto custom-scrollbar bg-slate-50 p-4 space-y-4">
        
        {/* Navigation & Tab Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex bg-slate-200/80 p-1 rounded-xl border border-slate-300 w-full sm:w-auto">
            <button
              onClick={() => setDashboardTab('overview')}
              className={`flex-1 sm:flex-none px-4 py-2 text-center text-xs font-extrabold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                dashboardTab === 'overview'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-blue-600" />
              <span>Portfolio Overview</span>
            </button>
            <button
              onClick={() => setDashboardTab('optimizations')}
              className={`flex-1 sm:flex-none px-4 py-2 text-center text-xs font-extrabold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                dashboardTab === 'optimizations'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
              <span>Physical Optimizations</span>
            </button>
            <button
              onClick={() => setDashboardTab('breakdowns')}
              className={`flex-1 sm:flex-none px-4 py-2 text-center text-xs font-extrabold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                dashboardTab === 'breakdowns'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Boxes className="w-3.5 h-3.5 text-indigo-500" />
              <span>Asset &amp; Group Breakdowns</span>
            </button>
          </div>
          
          <div className="text-[10px] font-mono text-slate-400">
            EOD Report Active
          </div>
        </div>

        {/* TAB CONTENT: OVERVIEW */}
        {dashboardTab === 'overview' && (
          <div className="space-y-4">
            {/* Visual Bento Grid of Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              
              {/* Chart 1: Net Change in P&L Contribution */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm lg:col-span-5 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                    Change in P&amp;L impact
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">Top strategies ranked by absolute P&amp;L contribution (click bars to drill down)</p>
                </div>
                
                <div className="h-56 mt-4 w-full text-[10px]">
                  {pnlChartData.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-400 font-mono">No data to display</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={pnlChartData} 
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        onClick={(data) => {
                          if (data && data.activeLabel) {
                            setSelectedDrillDownStrategy(data.activeLabel);
                            toast.success(`Opening drill-down details for ${data.activeLabel}`);
                          }
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#64748b" tickFormatter={(v) => v.slice(0, 10) + (v.length > 10 ? '..' : '')} />
                        <YAxis stroke="#64748b" />
                        <RechartsTooltip 
                          contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#1e293b', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          formatter={(value: number) => [
                            <span className={value >= 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                              {value >= 0 ? '+' : '-'}${Math.abs(value).toLocaleString()}
                            </span>,
                            'P&L Impact'
                          ]}
                        />
                        <Bar dataKey="value" cursor="pointer">
                          {pnlChartData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.value >= 0 ? '#10b981' : '#ef4444'} 
                              opacity={0.8}
                              className="hover:opacity-100 transition-opacity"
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Chart 2: Portfolio Valuations (Sum of Value) */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm lg:col-span-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-blue-600" />
                    Strategy Valuations
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">Top strategies by total commodity contract value ($)</p>
                </div>

                <div className="h-56 mt-4 w-full text-[10px]">
                  {valuationChartData.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-400 font-mono">No data to display</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={valuationChartData} 
                        margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                        onClick={(data) => {
                          if (data && data.activeLabel) {
                            setSelectedDrillDownStrategy(data.activeLabel);
                            toast.success(`Opening drill-down details for ${data.activeLabel}`);
                          }
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#64748b" tickFormatter={(v) => v.slice(0, 10) + (v.length > 10 ? '..' : '')} />
                        <YAxis stroke="#64748b" />
                        <RechartsTooltip 
                          contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#1e293b', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          formatter={(value: number) => [`$${value.toLocaleString()}`, 'Value USD']}
                        />
                        <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} cursor="pointer" opacity={0.8} className="hover:opacity-100 transition-opacity" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Chart 3: Operational Health Ring Charts */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm lg:col-span-3 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-blue-600" />
                    Operational Health
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">Cargo leg coverage &amp; Optimization status ratio</p>
                </div>

                <div className="grid grid-cols-2 gap-2 h-56 mt-4 items-center">
                  {/* Donut A: Optimization status */}
                  <div className="flex flex-col items-center justify-center">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">Optimization</span>
                    <div className="w-full h-32 relative flex items-center justify-center">
                      {optimizationData.length === 0 ? (
                        <span className="text-[9px] text-slate-400 font-mono">None</span>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={optimizationData}
                              cx="50%"
                              cy="50%"
                              innerRadius={25}
                              outerRadius={40}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              {optimizationData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <RechartsTooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', fontSize: '9px' }} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                    {/* Micro Legend */}
                    <div className="space-y-0.5 text-[8px] font-mono text-slate-500 mt-1">
                      {optimizationData.map((entry, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                          <span>{entry.name}: {entry.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Donut B: Cargo matching status */}
                  <div className="flex flex-col items-center justify-center">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">Unallocated Leg</span>
                    <div className="w-full h-32 relative flex items-center justify-center">
                      {unallocatedData.length === 0 ? (
                        <span className="text-[9px] text-slate-400 font-mono">None</span>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={unallocatedData}
                              cx="50%"
                              cy="50%"
                              innerRadius={25}
                              outerRadius={40}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              {unallocatedData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <RechartsTooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', fontSize: '9px' }} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                    {/* Micro Legend */}
                    <div className="space-y-0.5 text-[8px] font-mono text-slate-500 mt-1">
                      {unallocatedData.map((entry, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                          <span>{entry.name.slice(0, 11)}: {entry.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Strategies Interactive Directory Section */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                    <Boxes className="w-4 h-4 text-blue-600" />
                    Strategy Directory
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">Click any strategy to drill down into trade-level details, average prices, and audit logs.</p>
                </div>

                {/* In-dashboard mini search bar */}
                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    placeholder="Search strategy directory..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="block w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
                  />
                  <Search className="absolute left-3 top-2.5 w-3 h-3 text-slate-400" />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="absolute right-2 px-1 text-slate-400 hover:text-slate-600">×</button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse text-[11px] text-slate-700">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    <tr>
                      <th className="py-2.5 px-4 text-left">Strategy Name</th>
                      <th className="py-2.5 px-3">Optimisation</th>
                      <th className="py-2.5 px-3">Cargo Status</th>
                      <th className="py-2.5 px-3 text-right">Purchase Vol</th>
                      <th className="py-2.5 px-3 text-right">Sales Vol</th>
                      <th className="py-2.5 px-3 text-right">Shipping Costs</th>
                      <th className="py-2.5 px-3 text-right">Hedging P&amp;L</th>
                      <th className="py-2.5 px-3 text-right">Sum of Value ($)</th>
                      <th className="py-2.5 px-3 text-right">Change in P&amp;L ($)</th>
                      <th className="py-2.5 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAndSortedSummaryData.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-slate-400 font-mono">No matching strategies found.</td>
                      </tr>
                    ) : (
                      filteredAndSortedSummaryData.map((item, index) => (
                        <tr
                          key={index}
                          onClick={() => {
                            setSelectedDrillDownStrategy(item.strategyName);
                            toast.success(`Opening drill-down details for ${item.strategyName}`);
                          }}
                          className="hover:bg-slate-50 transition-all cursor-pointer group"
                        >
                          <td className="py-2.5 px-4 font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                            {item.strategyName}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              item.optimisationStatus === 'Yes'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : item.optimisationStatus === 'No'
                                ? 'bg-slate-50 text-slate-500 border border-slate-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              <span className="w-1 h-1 rounded-full bg-current" />
                              <span>{item.optimisationStatus || 'No'}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              item.unallocatedCargo === 'Matched'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              <span className="w-1 h-1 rounded-full bg-current" />
                              <span>{item.unallocatedCargo || 'Open Leg'}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800">{item.purchaseVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800">{item.salesVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600">${item.shippingRelatedCosts.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          <td className={`py-2.5 px-3 text-right font-mono font-bold ${item.hedgingPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {item.hedgingPnL >= 0 ? '+' : '-'}${Math.abs(item.hedgingPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">${item.totalValueUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {item.totalPnL > 0 ? (
                              <span className="text-emerald-600 font-bold">▲ +${Math.abs(item.totalPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            ) : item.totalPnL < 0 ? (
                              <span className="text-rose-650 font-bold">▼ -${Math.abs(item.totalPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            ) : (
                              <span className="text-slate-400">$0</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <span className="text-xs text-blue-600 group-hover:text-blue-700 font-bold flex items-center justify-center gap-1">
                              <span>Inspect</span>
                              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB CONTENT: PHYSICAL OPTIMIZATIONS */}
        {dashboardTab === 'optimizations' && (
          <div className="space-y-4">
            
            {/* Header explaining methodology */}
            <div className="bg-emerald-950/90 text-emerald-100 p-5 rounded-2xl border border-emerald-800 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-emerald-400 fill-emerald-400" />
                  <h2 className="text-sm font-black tracking-wide uppercase">Physical Portfolio Optimizations</h2>
                </div>
                <p className="text-[11px] text-emerald-300 leading-relaxed max-w-2xl">
                  Traders and optimizers constantly optimize physical LNG flows. By comparing the <strong>Base LNG</strong> (Standard Portfolio) contracts against the final <strong>Optimization LNG</strong> portfolio, we calculate the active <strong>Optimization Uplift</strong> value created.
                </p>
              </div>
              <div className="bg-emerald-900/60 px-4 py-2.5 rounded-xl border border-emerald-700/50 flex flex-col items-end">
                <span className="text-[9px] uppercase font-bold tracking-wider text-emerald-300">Total Net Optimization Uplift</span>
                <span className="text-lg font-black text-white mt-0.5">
                  ${optimizationKpis.netUplift.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>

            {/* KPI Cards specific to Optimizations */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Optimized Strategies</span>
                <span className="text-2xl font-black text-slate-800 mt-1">{optimizationKpis.count} Deals</span>
                <span className="text-[9px] font-mono text-emerald-600 font-bold mt-1 flex items-center gap-1">
                  <span>●</span> Active Physical Arbitrages
                </span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Cumulative Base P&amp;L</span>
                <span className="text-2xl font-black text-slate-600 mt-1">
                  {optimizationKpis.totalBasePnL >= 0 ? '+' : '-'}${Math.abs(optimizationKpis.totalBasePnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                <span className="text-[9px] font-mono text-slate-500 mt-1">EOD portfolio baseline</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Cumulative Optimized P&amp;L</span>
                <span className="text-2xl font-black text-slate-800 mt-1">
                  {optimizationKpis.totalOptimizedPnL >= 0 ? '+' : '-'}${Math.abs(optimizationKpis.totalOptimizedPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                <span className="text-[9px] font-mono text-slate-500 mt-1">Realized &amp; prospective delivery</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-emerald-300 shadow-sm bg-emerald-50/20 flex flex-col justify-between">
                <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest block">P&amp;L Optimized (Uplift)</span>
                <span className="text-2xl font-black text-emerald-600 mt-1">
                  +${optimizationKpis.netUplift.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                <span className="text-[9px] font-mono text-emerald-700 font-extrabold mt-1 flex items-center gap-1">
                  ▲ +{((optimizationKpis.netUplift / (Math.abs(optimizationKpis.totalBasePnL) || 1)) * 100).toFixed(1)}% improvement over Base
                </span>
              </div>
            </div>

            {/* Comparison Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm lg:col-span-8 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-emerald-600" />
                    Strategy Baseline vs. Optimized P&amp;L Performance Comparison
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">Dual-column performance of physical LNG strategies comparing Base LNG vs Optimization LNG portfolios ($ USD)</p>
                </div>
                
                <div className="h-64 mt-4 w-full text-[10px]">
                  {optimizationChartData.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-400 font-mono">No physical optimizations to display</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={optimizationChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#64748b" tickFormatter={(v) => v.slice(0, 12) + (v.length > 12 ? '..' : '')} />
                        <YAxis stroke="#64748b" />
                        <RechartsTooltip 
                          contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#1e293b', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                          formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                        />
                        <RechartsLegend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                        <Bar dataKey="Base P&L" fill="#94a3b8" radius={[4, 4, 0, 0]} opacity={0.7} />
                        <Bar dataKey="Optimized P&L" fill="#10b981" radius={[4, 4, 0, 0]} opacity={0.9} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Top Uplift strategies breakdown */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm lg:col-span-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-emerald-500" />
                    Optimization Top Performers
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">Strategies ranked by highest optimization margin</p>
                </div>

                <div className="mt-4 space-y-3 flex-1 overflow-auto custom-scrollbar">
                  {[...optimizedStrategies]
                    .sort((a, b) => ((b.totalPnL - b.basePnL) - (a.totalPnL - a.basePnL)))
                    .slice(0, 4)
                    .map((item, idx) => {
                      const upliftVal = item.totalPnL - item.basePnL;
                      return (
                        <div key={idx} className="p-3 bg-slate-50 border border-slate-150 rounded-xl flex items-center justify-between hover:border-emerald-200 transition-all cursor-pointer"
                             onClick={() => setSelectedDrillDownStrategy(item.strategyName)}>
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-bold text-slate-800 block truncate max-w-[160px]">{item.strategyName}</span>
                            <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider block">{getTrmsGroupName(item.strategyName)}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-mono font-black text-emerald-600 block">+${upliftVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            <span className="text-[8px] font-mono text-slate-400 block">Uplift</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            {/* Comprehensive Grid list of physical optimizations */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-850 uppercase tracking-widest flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    Physical Optimizations Performance Sheet
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">Granular P&amp;L auditing of Standard (Base) vs Optimized allocations.</p>
                </div>
              </div>

              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse text-[11px] text-slate-700">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    <tr>
                      <th className="py-2.5 px-4 text-left">Strategy Name</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3 text-right">Purchase Vol</th>
                      <th className="py-2.5 px-3 text-right">Sales Vol</th>
                      <th className="py-2.5 px-3 text-right">Base P&amp;L ($)</th>
                      <th className="py-2.5 px-3 text-right">Optimized P&amp;L ($)</th>
                      <th className="py-2.5 px-3 text-right">Optimization Uplift ($)</th>
                      <th className="py-2.5 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {optimizedStrategies.map((item, index) => {
                      const uplift = item.totalPnL - item.basePnL;
                      return (
                        <tr
                          key={index}
                          onClick={() => {
                            setSelectedDrillDownStrategy(item.strategyName);
                            toast.success(`Opening drill-down details for ${item.strategyName}`);
                          }}
                          className="hover:bg-slate-50 transition-all cursor-pointer group"
                        >
                          <td className="py-3 px-4 font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">
                            {item.strategyName}
                          </td>
                          <td className="py-3 px-3">
                            <span className="text-[10px] font-bold text-slate-500 font-mono uppercase bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                              {getTrmsGroupName(item.strategyName)}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-600">{item.purchaseVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          <td className="py-3 px-3 text-right font-mono text-slate-600">{item.salesVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          <td className={`py-3 px-3 text-right font-mono font-semibold ${item.basePnL >= 0 ? 'text-slate-600' : 'text-rose-500'}`}>
                            {item.basePnL >= 0 ? '+' : '-'}${Math.abs(item.basePnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                          <td className={`py-3 px-3 text-right font-mono font-bold ${item.totalPnL >= 0 ? 'text-slate-800' : 'text-rose-650'}`}>
                            {item.totalPnL >= 0 ? '+' : '-'}${Math.abs(item.totalPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-black text-emerald-600">
                            +${uplift.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="text-xs text-blue-600 group-hover:text-blue-700 font-bold flex items-center justify-center gap-1">
                              <span>Inspect Flow</span>
                              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* TAB CONTENT: ASSET & PORTFOLIO BREAKDOWNS */}
        {dashboardTab === 'breakdowns' && (
          <div className="space-y-4">
            
            {/* Bento-style Category Selector Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categoryGroupedData.map((group, idx) => {
                const isActive = activeBreakdownCategory === group.key;
                const optPercentage = group.items.length > 0 
                  ? Math.round((group.optCount / group.items.length) * 100) 
                  : 0;

                return (
                  <div
                    key={idx}
                    onClick={() => setActiveBreakdownCategory(group.key)}
                    className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-4 relative overflow-hidden ${
                      isActive 
                        ? 'bg-slate-900 border-slate-900 text-slate-100 shadow-lg scale-[1.01]' 
                        : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300 shadow-sm'
                    }`}
                  >
                    {/* Background accent */}
                    {isActive && (
                      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none" />
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="p-2 rounded-xl bg-slate-100 border border-slate-200/50">
                          {group.icon}
                        </div>
                        <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full ${
                          isActive 
                            ? 'bg-slate-800 text-indigo-400 border border-slate-700' 
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}>
                          {group.items.length} Strategies
                        </span>
                      </div>
                      <div>
                        <h4 className="text-xs font-black tracking-wide">{group.title}</h4>
                        <p className={`text-[9px] mt-0.5 ${isActive ? 'text-slate-400' : 'text-slate-500'}`}>{group.description}</p>
                      </div>
                    </div>

                    <div className="border-t border-slate-200/20 pt-3 grid grid-cols-2 gap-3 text-[10px]">
                      <div>
                        <span className={`text-[8px] uppercase font-bold tracking-wider block ${isActive ? 'text-slate-500' : 'text-slate-400'}`}>Cumulative P&amp;L</span>
                        <span className={`font-mono font-bold mt-0.5 block ${
                          group.totalPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'
                        }`}>
                          {group.totalPnL >= 0 ? '+' : '-'}${Math.abs(group.totalPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      <div>
                        <span className={`text-[8px] uppercase font-bold tracking-wider block ${isActive ? 'text-slate-500' : 'text-slate-400'}`}>Optimized Rate</span>
                        <span className={`font-mono font-bold mt-0.5 block ${isActive ? 'text-indigo-400' : 'text-indigo-600'}`}>
                          {optPercentage}% <span className="text-[8px] font-normal text-slate-400">({group.optCount})</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected category details */}
            <div className="bg-slate-900 text-slate-100 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-800 rounded-lg">
                  {activeGroupObj.icon}
                </div>
                <div>
                  <h3 className="text-xs font-black tracking-wider uppercase">{activeGroupObj.title} Drill-Down Panel</h3>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">Showing {activeGroupObj.items.length} physical strategy allocations and visual gas flows.</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[9px] uppercase font-bold text-slate-500 block">Cumulative P&amp;L Change</span>
                <span className={`text-sm font-black font-mono mt-0.5 block ${
                  activeGroupObj.totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {activeGroupObj.totalPnL >= 0 ? '+' : '-'}${Math.abs(activeGroupObj.totalPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>

            {/* Drill Down Grid: Compact Flow Cards (easy-to-read, not like extracted table) */}
            <div className="space-y-4">
              {activeGroupObj.items.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 font-mono shadow-sm">
                  No active strategies in this group.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {activeGroupObj.items.map((item, index) => {
                    return (
                      <div
                        key={index}
                        onClick={() => {
                          setSelectedDrillDownStrategy(item.strategyName);
                          toast.success(`Opening drill-down details for ${item.strategyName}`);
                        }}
                        className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-blue-400 transition-all cursor-pointer p-4 hover:shadow-md flex flex-col justify-between space-y-4 group"
                      >
                        {/* Flow Card Top Header Row */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2.5">
                          <div className="flex items-center gap-2.5">
                            <span className="text-xs font-black text-slate-850 group-hover:text-blue-600 transition-colors">
                              {item.strategyName}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 font-mono uppercase bg-slate-100 border border-slate-200/60 px-2 py-0.5 rounded">
                              {getTrmsGroupName(item.strategyName)}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold border flex items-center gap-1 ${
                              item.optimisationStatus === 'Yes' 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-50 text-slate-500 border-slate-200'
                            }`}>
                              <span>●</span>
                              <span>{item.optimisationStatus === 'Yes' ? 'Optimized' : 'Base Only'}</span>
                            </span>

                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold border flex items-center gap-1 ${
                              item.unallocatedCargo === 'Matched' 
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              <span>●</span>
                              <span>{item.unallocatedCargo || 'Open Leg'}</span>
                            </span>

                            <span className="px-2 py-0.5 bg-slate-50 border border-slate-200 text-slate-600 rounded text-[9px] font-mono font-bold">
                              Exposure: {item.exposureMonths}
                            </span>
                          </div>
                        </div>

                        {/* Flow Card Graphical Cargo flow row */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center py-2">
                          
                          {/* Loading / Purchase Leg Block */}
                          <div className="md:col-span-4 p-3 bg-slate-50 rounded-xl border border-slate-150 space-y-1.5">
                            <span className="text-[8px] uppercase font-bold tracking-wider text-slate-400 block">LOADING / PURCHASE LEG</span>
                            <div className="flex items-baseline justify-between">
                              <span className="text-xs font-black text-slate-750">{item.loadingMonth !== '—' ? item.loadingMonth : '—'}</span>
                              <span className="text-[10px] font-bold font-mono text-emerald-600">
                                ${item.purchasePrice > 0 ? `${item.purchasePrice.toFixed(2)} /MMBtu` : '—'}
                              </span>
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 flex justify-between pt-1 border-t border-slate-200/50">
                              <span>Volume:</span>
                              <span className="font-bold text-slate-700">{item.purchaseVolume.toLocaleString()} MMBtu</span>
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 flex justify-between">
                              <span>Total Cost:</span>
                              <span className="font-bold text-slate-700">${item.purchaseCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>
                          </div>

                          {/* Cargo graphical flow matching bridge */}
                          <div className="md:col-span-4 flex flex-col items-center justify-center py-2 px-1 text-center">
                            <span className="text-[9px] font-mono text-slate-400 mb-1">
                              {item.unallocatedCargo === 'Matched' ? 'Leg Balanced' : 'Unbalanced Open Leg'}
                            </span>
                            <div className="w-full flex items-center justify-center gap-2">
                              <div className="h-0.5 bg-slate-300 flex-1 relative">
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 border-t border-r border-slate-400 rotate-45" />
                              </div>
                              <div className={`p-1.5 rounded-full ${
                                item.unallocatedCargo === 'Matched' 
                                  ? 'bg-blue-50 text-blue-600 border border-blue-200' 
                                  : 'bg-amber-50 text-amber-600 border border-amber-200'
                              }`}>
                                <Ship className="w-4 h-4" />
                              </div>
                              <div className="h-0.5 bg-slate-300 flex-1 relative">
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 border-t border-r border-slate-400 rotate-45" />
                              </div>
                            </div>
                            <span className={`text-[8px] font-bold uppercase tracking-wider mt-1 ${
                              item.unallocatedCargo === 'Matched' ? 'text-blue-600' : 'text-amber-600'
                            }`}>
                              {item.unallocatedCargo === 'Matched' ? 'Legs Fully Matched' : item.unallocatedCargo}
                            </span>
                          </div>

                          {/* Delivery / Sales Leg Block */}
                          <div className="md:col-span-4 p-3 bg-slate-50 rounded-xl border border-slate-150 space-y-1.5">
                            <span className="text-[8px] uppercase font-bold tracking-wider text-slate-400 block">DELIVERY / SALES LEG</span>
                            <div className="flex items-baseline justify-between">
                              <span className="text-xs font-black text-slate-750">{item.deliveryMonth !== '—' ? item.deliveryMonth : '—'}</span>
                              <span className="text-[10px] font-bold font-mono text-blue-600">
                                ${item.salesPrice > 0 ? `${item.salesPrice.toFixed(2)} /MMBtu` : '—'}
                              </span>
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 flex justify-between pt-1 border-t border-slate-200/50">
                              <span>Volume:</span>
                              <span className="font-bold text-slate-700">{item.salesVolume.toLocaleString()} MMBtu</span>
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 flex justify-between">
                              <span>Total Revenue:</span>
                              <span className="font-bold text-slate-700">${item.salesRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>
                          </div>

                        </div>

                        {/* Financial summary row of this strategy */}
                        <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-[10.5px]">
                          <div className="grid grid-cols-2 sm:flex sm:flex-row items-center gap-y-1.5 sm:gap-6 text-slate-500 font-mono">
                            <div>
                              <span>Sum of Value: </span>
                              <span className="font-bold text-slate-800">${item.totalValueUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>
                            <div>
                              <span>Shipping Cost: </span>
                              <span className="font-bold text-purple-600">${item.shippingRelatedCosts.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>
                            <div>
                              <span>Hedging P&amp;L: </span>
                              <span className={`font-bold ${item.hedgingPnL >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                {item.hedgingPnL >= 0 ? '+' : ''}${item.hedgingPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </span>
                            </div>
                            {item.optimisationStatus === 'Yes' && (
                              <div>
                                <span className="text-emerald-700 font-extrabold">Net Uplift: </span>
                                <span className="font-extrabold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  +${(item.totalPnL - item.basePnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0">
                            {/* Strategy P&L outcome */}
                            <div className="text-right">
                              <span className="text-[8px] uppercase font-bold text-slate-400 block">P&amp;L impact</span>
                              <span className={`text-xs font-black font-mono ${
                                item.totalPnL > 0 ? 'text-emerald-600' : item.totalPnL < 0 ? 'text-rose-600' : 'text-slate-400'
                              }`}>
                                {item.totalPnL > 0 ? '▲ +' : item.totalPnL < 0 ? '▼ -' : ''}${Math.abs(item.totalPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </span>
                            </div>

                            {/* Direct call to action */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDrillDownStrategy(item.strategyName);
                                toast.success(`Opening drill-down details for ${item.strategyName}`);
                              }}
                              className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all border border-blue-200"
                            >
                              <span>Audit Trails</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 h-full bg-slate-950 text-slate-100 select-none custom-scrollbar">
      
      {/* 1. Header controller bar */}
      <div className="p-4 border-b border-slate-850 bg-slate-900 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
        <div className="flex items-center gap-2">
          <TableProperties className="w-5 h-5 text-blue-400" />
          <div>
            <h3 className="text-xs font-bold text-slate-150 uppercase tracking-widest flex items-center gap-2">
              TRMS Portfolio Report Dashboard
            </h3>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
              Comprehensive strategy breakdown detailing volumes, pricing, costs, revenues, shipping costs, hedging operations, and audits.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle Buttons */}
          {!viewModeOnly && (
            <div className="flex bg-slate-950 p-1 border border-slate-800 rounded-lg mr-2">
              <button
                onClick={() => {
                  setViewMode('dashboard');
                  setSelectedDrillDownStrategy(null);
                }}
                className={`px-3 py-1 rounded-md text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'dashboard'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Executive Dashboard</span>
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1 rounded-md text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Summary Grid</span>
              </button>
            </div>
          )}

          {/* EOD Date Filter */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-400 font-mono text-[10.5px]">EOD Date:</span>
            <select
              value={selectedEodDate}
              onChange={(e) => setSelectedEodDate(e.target.value)}
              className="bg-transparent text-slate-200 border-none outline-none focus:ring-0 py-0 text-[11px] font-bold font-mono pl-1 cursor-pointer"
            >
              <option value="all" className="bg-slate-950 text-slate-200">Show All Dates</option>
              {eodDates.map(d => (
                <option key={d} value={d} className="bg-slate-950 text-slate-200">{d}</option>
              ))}
            </select>
          </div>

          <button 
            onClick={handleExportSummaryCSV}
            className="px-3.5 py-1.5 bg-emerald-650 hover:bg-emerald-700 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export Summary ({filteredAndSortedSummaryData.length})
          </button>
        </div>
      </div>

      {/* 1.5. Unified Filtering Control Panel with TRMS Group Portfolio Navigation */}
      <div className="flex flex-col gap-3 p-3 px-4 border-b border-slate-850 bg-slate-900 text-slate-150">
        {/* TRMS Group Filter Navigation Tabs */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-widest flex items-center gap-1">
            <TableProperties className="w-3.5 h-3.5 text-blue-400" />
            Filter TRMS Group Portfolio:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {['All', 'PL9SB', 'FLNG1', 'FLNG2', 'LNGC', 'Spot', 'Cheniere', 'Others'].map((grp) => (
              <button
                key={grp}
                onClick={() => {
                  setActiveTrmsGroup(grp);
                  toast.success(`Filtered TRMS data to ${grp} Portfolio`);
                }}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all border cursor-pointer ${
                  activeTrmsGroup === grp
                    ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-slate-100 hover:bg-slate-850'
                }`}
              >
                {grp}
              </button>
            ))}
          </div>
        </div>

        {/* Year Filter and Column Toggles */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2 border-t border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-widest mr-2 flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-450" />
              PLSB Year Filter:
            </span>
            <button
              onClick={() => setSelectedYear('all')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all border cursor-pointer ${
                selectedYear === 'all'
                  ? 'bg-blue-600 text-white border-blue-550 shadow-sm'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-slate-100 hover:bg-slate-850'
              }`}
            >
              All Years
            </button>
            {availableYears.map(yr => (
              <button
                key={yr}
                onClick={() => setSelectedYear(yr)}
                className={`px-3 py-1 rounded-full text-xs font-semibold font-mono transition-all border cursor-pointer ${
                  selectedYear === yr
                    ? 'bg-blue-600 text-white border-blue-550 shadow-sm'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-slate-100 hover:bg-slate-850'
                }`}
              >
                {yr}
              </button>
            ))}
            {selectedYear !== 'all' && (
              <button 
                onClick={() => setSelectedYear('all')} 
                className="p-1 px-2 text-[10px] text-slate-400 hover:text-rose-450 underline font-mono ml-2 cursor-pointer"
              >
                Reset Year Filter
              </button>
            )}
          </div>

          {/* Dynamic Column Visibility controls */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-widest mr-1">
              Toggle Columns:
            </span>
            <button
              onClick={() => setShowExposureMonths(prev => !prev)}
              className={`px-2.5 py-1 rounded text-[10px] font-bold font-mono transition-all border flex items-center gap-1.5 cursor-pointer ${
                showExposureMonths
                  ? 'bg-blue-950/40 text-blue-300 border-blue-900/60 hover:bg-blue-900/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-850'
              }`}
            >
              <span className={showExposureMonths ? "text-blue-400" : "text-slate-600"}>●</span>
              <span>Exposure Months</span>
            </button>
            <button
              onClick={() => setShowLoadingMonth(prev => !prev)}
              className={`px-2.5 py-1 rounded text-[10px] font-bold font-mono transition-all border flex items-center gap-1.5 cursor-pointer ${
                showLoadingMonth
                  ? 'bg-blue-950/40 text-blue-300 border-blue-900/60 hover:bg-blue-900/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-850'
              }`}
            >
              <span className={showLoadingMonth ? "text-blue-400" : "text-slate-600"}>●</span>
              <span>Loading Month</span>
            </button>
            <button
              onClick={() => setShowDeliveryMonth(prev => !prev)}
              className={`px-2.5 py-1 rounded text-[10px] font-bold font-mono transition-all border flex items-center gap-1.5 cursor-pointer ${
                showDeliveryMonth
                  ? 'bg-blue-950/40 text-blue-300 border-blue-900/60 hover:bg-blue-900/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-850'
              }`}
            >
              <span className={showDeliveryMonth ? "text-blue-400" : "text-slate-600"}>●</span>
              <span>Delivery Month</span>
            </button>
            <button
              onClick={() => setShowLinesCount(prev => !prev)}
              className={`px-2.5 py-1 rounded text-[10px] font-bold font-mono transition-all border flex items-center gap-1.5 cursor-pointer ${
                showLinesCount
                  ? 'bg-blue-950/40 text-blue-300 border-blue-900/60 hover:bg-blue-900/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-850'
              }`}
            >
              <span className={showLinesCount ? "text-blue-400" : "text-slate-600"}>●</span>
              <span>Lines Count</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. KPIs Overview Card Panel */}
      <div className="p-4 border-b border-slate-800 bg-slate-950 grid grid-cols-2 lg:grid-cols-6 gap-3 shrink-0">
        <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 shadow-sm">
          <div className="text-[10px] uppercase text-slate-400 font-mono font-bold tracking-wider">Total Strategies</div>
          <div className="text-lg font-extrabold text-slate-100 mt-1 font-mono flex items-baseline gap-1">
            {kpis.total} <span className="text-[10px] font-normal text-slate-500">In View</span>
          </div>
        </div>
        
        <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 shadow-sm">
          <div className="text-[10px] uppercase text-slate-400 font-mono font-bold tracking-wider">Purchase Cost</div>
          <div className="text-lg font-extrabold text-emerald-400 mt-1 font-mono flex items-baseline gap-1" title={`Total volume count: ${kpis.aggregatePurchaseVolume.toFixed(2)}`}>
            ${kpis.aggregatePurchaseCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            <span className="text-[9px] font-normal text-slate-500 ml-1">({Math.floor(kpis.aggregatePurchaseVolume).toLocaleString()} V)</span>
          </div>
        </div>

        <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 shadow-sm">
          <div className="text-[10px] uppercase text-slate-400 font-mono font-bold tracking-wider">Sales Revenue</div>
          <div className="text-lg font-extrabold text-blue-400 mt-1 font-mono flex items-baseline gap-1" title={`Total volume count: ${kpis.aggregateSalesVolume.toFixed(2)}`}>
            ${kpis.aggregateSalesRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            <span className="text-[9px] font-normal text-slate-500 ml-1">({Math.floor(kpis.aggregateSalesVolume).toLocaleString()} V)</span>
          </div>
        </div>

        <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 shadow-sm">
          <div className="text-[10px] uppercase text-slate-400 font-mono font-bold tracking-wider">Shipping Cost</div>
          <div className="text-lg font-extrabold text-purple-400 mt-1 font-mono">
            ${kpis.aggregateShippingCosts.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>

        <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 shadow-sm">
          <div className="text-[10px] uppercase text-slate-400 font-mono font-bold tracking-wider">Hedging operations</div>
          <div className="text-lg font-extrabold text-amber-400 mt-1 font-mono">
            ${kpis.aggregateHedgingPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>

        <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 shadow-sm col-span-2 lg:col-span-1">
          <div className="text-[10px] uppercase text-slate-400 font-mono font-bold tracking-wider">Aggregate P&amp;L</div>
          <div className={`text-lg font-extrabold mt-1 font-mono ${kpis.aggregatePnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {kpis.aggregatePnL >= 0 ? '+' : '-'}${Math.abs(kpis.aggregatePnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {viewMode === 'dashboard' ? (
        renderDashboard()
      ) : (
        <>
          {/* 3. Sub-Filters tabs and Search */}
          <div className="p-3 border-b border-slate-800 bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 shadow-sm text-slate-100">
            <div className="flex items-center gap-2">
              {Object.keys(columnFilters).length > 0 && (
                <button 
                  onClick={handleClearAllFilters}
                  className="text-xs px-2.5 py-1 bg-rose-950/40 text-rose-350 border border-rose-900 hover:bg-rose-900 rounded-full flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  title="Clear all active sorting and filtering"
                >
                  <X className="w-3 h-3" />
              Clear Filters ({Object.keys(columnFilters).length})
            </button>
          )}
          {Object.keys(columnFilters).length === 0 && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Info className="w-3.5 h-3.5 text-blue-450 shrink-0" />
              <span>Click cells to filter expanded list. (e.g. standard cells filter Base LNG, Specific cost/hedge filter active item)</span>
            </div>
          )}
        </div>

        {/* Global report search bar */}
        <div className="relative w-full sm:w-72">
          <input 
            type="text" 
            placeholder="Search Strategy or status..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="block w-full pl-9 pr-8 py-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-lg text-xs font-semibold text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-slate-900" 
          />
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')} 
              className="absolute right-2 px-1 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* 4. Active filters visual feedback bar */}
      {Object.keys(columnFilters).length > 0 && (
        <div className="px-4 py-2 bg-slate-950 border-b border-slate-850 flex flex-wrap gap-2 items-center shrink-0">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Filter Settings:</span>
          {Object.entries(columnFilters).map(([col, filter]) => {
            const hasCheckedValues = filter.selectedValues.size > 0;
            const hasCondition = filter.condition !== 'none';
            if (!hasCheckedValues && !hasCondition) return null;
            return (
              <span key={col} className="text-[11px] bg-slate-900 border border-slate-800 text-slate-300 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-sm">
                <span className="text-slate-500 font-bold font-mono text-[9.5px]">{col}:</span>
                <span className="text-amber-400 font-bold text-[10px]">
                  {hasCondition ? `${filter.condition}(${filter.conditionValue1}${filter.conditionValue2 ? `, ${filter.conditionValue2}` : ''})` : `${filter.selectedValues.size} items`}
                </span>
                <button 
                  onClick={() => handleClearColumnFilter(col)}
                  className="p-0.5 hover:bg-slate-850 text-slate-500 hover:text-rose-400 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* 5. Table Grid Panel */}
      <div className="flex-1 overflow-auto custom-scrollbar relative bg-slate-950">
        {filteredAndSortedSummaryData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center h-full max-w-md mx-auto">
            <Database className="w-10 h-10 text-slate-500 mb-3" />
            <h4 className="text-sm font-bold text-slate-300">No Summarized Outputs found</h4>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              Either upload a valid TRMS spreadsheet containing Strategy records, select the correct year / date filter, or modify your active parameters.
            </p>
          </div>
        ) : (
          <div className="min-w-max pb-10">
            <table className="w-full text-left border-collapse text-[11px] gridlines-active bg-slate-950 text-slate-200">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 font-bold uppercase tracking-wider text-slate-200">
                  <th className="py-3 px-3 w-8 bg-slate-900"></th>
                  {columns.map((col, idx) => {
                    const isFiltered = !!columnFilters[col];
                    const isSorted = sortConfig.column === col;
                    const isRightAligned = numCols.includes(col);
                    const isRightHalf = idx > columns.length / 2;

                    return (
                      <th 
                        key={col} 
                        className={`py-3 px-4 hover:bg-slate-800 relative ${isRightAligned ? 'text-right' : 'text-left'}`}
                      >
                        <div className={`flex items-center gap-1 group justify-between ${isRightAligned ? 'flex-row-reverse' : ''}`}>
                          <span className="truncate max-w-[140px] text-slate-300" title={col}>{col}</span>
                          
                          <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
                            {isSorted && (
                              <span className="text-blue-400">
                                {sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </span>
                            )}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveFilterMenu(activeFilterMenu === col ? null : col);
                              }}
                              className={`p-1 rounded transition-colors cursor-pointer ${isFiltered ? 'text-amber-400 bg-slate-800' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                            >
                              <Filter className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Inline drop-menu panel for column filtrations */}
                        {activeFilterMenu === col && (
                          <div className={`absolute top-full mt-1.5 z-50 text-left normal-case ${isRightHalf ? 'right-0' : 'left-0'}`} ref={menuRef}>
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
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 bg-slate-950">
                {filteredAndSortedSummaryData.map((item, index) => {
                  const isExpanded = expandedStrategies.has(item.strategyName);
                  const activeDetailFilter = expandedFilters[item.strategyName] || 'base_lng';

                  return (
                    <React.Fragment key={item.strategyName}>
                      <tr 
                        className={`hover:bg-slate-850 transition-colors cursor-pointer group ${isExpanded ? 'bg-slate-900 border-l-4 border-blue-500 text-white' : 'text-slate-100'}`}
                        onClick={() => toggleRowExpansion(item.strategyName)}
                      >
                        <td className="py-2.5 px-3 text-center text-slate-500">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-blue-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                          )}
                        </td>

                        {/* Strategy Name */}
                        <td 
                          className="py-2.5 px-4 font-extrabold text-slate-100 hover:text-blue-400 hover:underline"
                          onClick={(e) => handleCellClick(item.strategyName, 'Strategy Name', e)}
                          title="Click to view Base LNG details"
                        >
                          {item.strategyName}
                        </td>

                        {/* Physical P&L Status */}
                        <td className="py-2.5 px-4">
                          {item.physicalPnLStatus === 'Realized' ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-950/40 border border-emerald-800/30 text-emerald-300">
                              <CheckCircle2 className="w-3 h-3" />
                              Realized
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/40 border border-amber-800/30 text-amber-300">
                              <AlertCircle className="w-3 h-3" />
                              Unrealized
                            </span>
                          )}
                        </td>

                        {/* Optimisation status column */}
                        <td className="py-2.5 px-4">
                          {item.optimisationStatus === 'Yes' ? (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-blue-950/40 border border-blue-800/30 text-blue-300 font-extrabold text-[10.5px]">
                              Yes
                            </span>
                          ) : item.optimisationStatus === 'No' ? (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-bold text-[10.5px]">
                              No
                            </span>
                          ) : item.optimisationStatus === 'Alert' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-950/40 border border-rose-800/30 text-rose-300 font-black text-[10.5px] animate-pulse">
                              <AlertCircle className="w-3 h-3 text-rose-450" />
                              Alert
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>

                        {/* Unallocated Cargo column */}
                        <td className="py-2.5 px-4">
                          {item.unallocatedCargo === 'Matched' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-indigo-950/40 border border-indigo-800/30 text-indigo-300 font-bold">
                              Matched
                            </span>
                          ) : item.unallocatedCargo === 'Open on Sell Leg' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/40 border border-amber-800/30 text-amber-300 font-semibold" title="Has Buy leg but no matching Sell leg">
                              Open on Sell Leg
                            </span>
                          ) : item.unallocatedCargo === 'Open on Buy Leg' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/40 border border-amber-800/30 text-amber-300 font-semibold" title="Has Sell leg but no matching Buy leg">
                              Open on Buy Leg
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>

                        {/* Render all calculated columns */}
                        {columns.slice(4).map(col => {
                          const isClickableCol = clickableFilteredCols.includes(col);
                          const isValueOrPnL = col === 'Sum of Value' || col === 'Change in P&L';
                          const isWeightedPrice = col === 'Purchase Price' || col === 'Sales Price';
                          const isLinesCount = col === 'Lines Count';
                          
                          // Style custom clickable columns beautifully
                          let cellStyle = "py-2.5 px-4 font-mono text-slate-200 transition-all text-right";
                          if (isClickableCol) {
                            cellStyle += " font-semibold text-blue-400 underline underline-offset-4 decoration-dotted decoration-blue-500 hover:text-blue-300 hover:bg-slate-850 cursor-pointer";
                          } else if (col === 'Change in P&L') {
                            cellStyle += ` font-semibold`;
                          } else if (col === 'Purchase Cost' || col === 'Purchase Price' || col === 'Purchase Volume') {
                            cellStyle += " hover:text-emerald-300 hover:underline hover:bg-slate-850 cursor-pointer text-emerald-400 font-semibold";
                          } else if (col === 'Sales Revenue' || col === 'Sales Price' || col === 'Sales Volume') {
                            cellStyle += " hover:text-blue-350 hover:underline hover:bg-slate-850 cursor-pointer text-blue-400 font-semibold";
                          } else if (isLinesCount) {
                            cellStyle += " hover:text-white hover:underline cursor-pointer text-slate-300";
                          }

                          let tooltip = "";
                          if (col === 'Shipping Related Costs') tooltip = "Click to filter trade details by Shipping Related Cost (SRC)";
                          else if (col === 'Hedging P&L') tooltip = "Click to filter trade details by Hedging LNG";
                          else if (col === 'Purchase Cost' || col === 'Purchase Price' || col === 'Purchase Volume') tooltip = "Click to filter trade details to Purchase (Buy + Commodity) only";
                          else if (col === 'Sales Revenue' || col === 'Sales Price' || col === 'Sales Volume') tooltip = "Click to filter trade details to Sales (Sell + Commodity) only";
                          else if (isLinesCount) tooltip = "Click to view ALL matching records for this Strategy";

                          return (
                            <td 
                              key={col} 
                              className={cellStyle}
                              title={tooltip}
                              onClick={(e) => {
                                if (
                                  isClickableCol || 
                                  col === 'Purchase Cost' || col === 'Purchase Price' || col === 'Purchase Volume' ||
                                  col === 'Sales Revenue' || col === 'Sales Price' || col === 'Sales Volume' ||
                                  isLinesCount
                                ) {
                                  handleCellClick(item.strategyName, col, e);
                                }
                              }}
                            >
                              {renderCellMetric(col, item)}
                            </td>
                          );
                        })}
                      </tr>

                      {/* Expandable Trade audit block */}
                      {isExpanded && (() => {
                        const unfilteredSubRows = getFilteredUnderlyingRows(item.underlyingRows, activeDetailFilter);
                        
                        // Extract unique portfolios dynamically
                        const uniqueSubPortfolios = Array.from(
                          new Set<string>(
                            unfilteredSubRows
                              .map((r: any) => String(r['Internal Portfolio'] || r['Portfolio'] || '').trim())
                              .filter(Boolean)
                          )
                        ).sort();

                        const subSearch = (subTableSearches[item.strategyName] || '').toLowerCase().trim();
                        const subBs = subTableBuySellFilters[item.strategyName] || 'all';
                        const subPort = subTablePortfolioFilters[item.strategyName] || 'all';

                        // Filtered rows for sub-table
                        const filteredSubRows = unfilteredSubRows.filter((r: any) => {
                          if (subSearch) {
                            const dNum = String(r['Deal Num'] || '').toLowerCase();
                            const ref = String(r['Reference'] || '').toLowerCase();
                            const inst = String(r['Ins Type'] || '').toLowerCase();
                            const cf = String(r['Cflow Type'] || '').toLowerCase();
                            if (!dNum.includes(subSearch) && !ref.includes(subSearch) && !inst.includes(subSearch) && !cf.includes(subSearch)) {
                              return false;
                            }
                          }
                          if (subBs !== 'all') {
                            const buySell = String(r['Buy_Sell'] || '').toLowerCase();
                            if (subBs === 'buy' && !(buySell === 'buy' || buySell === 'buys')) return false;
                            if (subBs === 'sell' && !(buySell === 'sell' || buySell === 'sells')) return false;
                          }
                          if (subPort !== 'all') {
                            const p = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim();
                            if (p !== subPort) return false;
                          }
                          return true;
                        });

                        // Totals calculations
                        const subTotals = filteredSubRows.reduce(
                          (acc, r) => {
                            const vol = Number(String(r['Volume'] || '').replace(/[^0-9.-]/g, ''));
                            const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
                            const pnl = Number(String(r['Change_in_Total_PnL'] || '').replace(/[^0-9.-]/g, ''));
                            const price = Number(String(r['Price'] || '').replace(/[^0-9.-]/g, ''));

                            if (!isNaN(vol)) acc.totalVol += vol;
                            if (!isNaN(val)) acc.totalVal += val;
                            if (!isNaN(pnl)) acc.totalPnL += pnl;
                            if (!isNaN(price) && price > 0) {
                              acc.priceSum += price;
                              acc.priceCount++;
                            }
                            return acc;
                          },
                          { totalVol: 0, totalVal: 0, totalPnL: 0, priceSum: 0, priceCount: 0 }
                        );

                        const subAvgPrice = subTotals.priceCount > 0 ? subTotals.priceSum / subTotals.priceCount : 0;

                        return (
                          <tr>
                            <td colSpan={columns.length + 1} className="bg-slate-950 py-4 px-8 border-l-4 border-blue-500 text-slate-100">
                              
                              {/* Filter selection controls inside expanded box */}
                              <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between border-b border-slate-800 pb-3 mb-3 gap-3">
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-black uppercase text-blue-400 tracking-wider font-mono">
                                      Auditing Details
                                    </span>
                                    <span className="text-slate-400 text-[10.5px] font-sans font-medium">
                                      Showing records for <strong className="text-slate-250 font-bold">{item.strategyName}</strong> ({filteredSubRows.length} of {unfilteredSubRows.length} shown)
                                    </span>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  {/* Target level controller Pills */}
                                  <div className="flex flex-wrap items-center gap-1 bg-slate-900 p-1 border border-slate-800 rounded-lg mr-2 shadow-sm">
                                    <button
                                      type="button"
                                      onClick={() => setExpandedFilters(prev => ({ ...prev, [item.strategyName]: 'base_lng' }))}
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                        activeDetailFilter === 'base_lng'
                                          ? 'bg-blue-600 text-white shadow-sm'
                                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                      }`}
                                      title={item.optimisationStatus === 'Yes' ? "Filter list to Optimization LNG portfolio entries only (Default)" : "Filter list to Base LNG portfolio entries only (Default)"}
                                    >
                                      {item.optimisationStatus === 'Yes' ? "Optimization LNG (Default)" : "Base LNG (Default)"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setExpandedFilters(prev => ({ ...prev, [item.strategyName]: 'shipping_costs' }))}
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                        activeDetailFilter === 'shipping_costs'
                                          ? 'bg-purple-600 text-white shadow-sm'
                                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                      }`}
                                      title="Filter list to Shipping Related Costs (Cflow: SRC- Shipping Related Cost)"
                                    >
                                      Shipping Cost (SRC)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setExpandedFilters(prev => ({ ...prev, [item.strategyName]: 'hedging' }))}
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                        activeDetailFilter === 'hedging'
                                          ? 'bg-amber-600 text-white shadow-sm'
                                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                      }`}
                                      title="Filter list to Hedging portfolio logs only"
                                    >
                                      Hedging P&amp;L
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setExpandedFilters(prev => ({ ...prev, [item.strategyName]: 'buy_commodity' }))}
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                        activeDetailFilter === 'buy_commodity'
                                          ? 'bg-emerald-600 text-white shadow-sm'
                                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                      }`}
                                      title="Filter list to Purchase deals (Buy + Commodity cflow Type)"
                                    >
                                      Purchase (Buy)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setExpandedFilters(prev => ({ ...prev, [item.strategyName]: 'sell_commodity' }))}
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                        activeDetailFilter === 'sell_commodity'
                                          ? 'bg-blue-600 text-white shadow-sm'
                                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                      }`}
                                      title="Filter list to Sales deals (Sell + Commodity cflow Type)"
                                    >
                                      Sales (Sell)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setExpandedFilters(prev => ({ ...prev, [item.strategyName]: 'all' }))}
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                        activeDetailFilter === 'all'
                                          ? 'bg-slate-700 text-white shadow-sm'
                                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                      }`}
                                      title="Show literally all raw rows under this strategy"
                                    >
                                      All ({item.dealCount})
                                    </button>
                                  </div>

                                  {/* Sub Table filters bar */}
                                  <div className="flex flex-wrap items-center gap-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
                                    <div className="flex items-center gap-1">
                                      <Search className="w-3 h-3 text-slate-500 ml-1" />
                                      <input
                                        type="text"
                                        placeholder="Filter sub-trades..."
                                        value={subTableSearches[item.strategyName] || ''}
                                        onChange={(e) => setSubTableSearches(prev => ({ ...prev, [item.strategyName]: e.target.value }))}
                                        className="bg-slate-950 border border-slate-800 text-[10px] font-mono py-0.5 px-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-200 placeholder-slate-500 w-28 text-left"
                                      />
                                    </div>

                                    {/* Buy/Sell Dropdown filter */}
                                    <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
                                      <select
                                        value={subTableBuySellFilters[item.strategyName] || 'all'}
                                        onChange={(e) => setSubTableBuySellFilters(prev => ({ ...prev, [item.strategyName]: e.target.value }))}
                                        className="bg-transparent text-slate-300 border-none select-[none] focus:ring-0 outline-none text-[10px] font-bold font-mono py-0 pl-1 pr-4 cursor-pointer"
                                      >
                                        <option value="all" className="bg-slate-900 text-slate-300">All Buy/Sells</option>
                                        <option value="buy" className="bg-slate-900 text-slate-300">Buy List Only</option>
                                        <option value="sell" className="bg-slate-900 text-slate-300">Sell List Only</option>
                                      </select>
                                    </div>

                                    {/* Portfolio Dropdown filter */}
                                    {uniqueSubPortfolios.length > 0 && (
                                      <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
                                        <select
                                          value={subTablePortfolioFilters[item.strategyName] || 'all'}
                                          onChange={(e) => setSubTablePortfolioFilters(prev => ({ ...prev, [item.strategyName]: e.target.value }))}
                                          className="bg-transparent text-slate-300 border-none select-[none] focus:ring-0 outline-none text-[10px] font-bold font-mono py-0 pl-1 pr-4 cursor-pointer"
                                        >
                                          <option value="all" className="bg-slate-900 text-slate-300">All Portfolios</option>
                                          {uniqueSubPortfolios.map(p => (
                                            <option key={p} value={p} className="bg-slate-900 text-slate-350">{p}</option>
                                          ))}
                                        </select>
                                      </div>
                                    )}

                                    {/* Clear Sub Filters button */}
                                    {((subTableSearches[item.strategyName] || '') || (subTableBuySellFilters[item.strategyName] || 'all') !== 'all' || (subTablePortfolioFilters[item.strategyName] || 'all') !== 'all') && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSubTableSearches(prev => { const n = { ...prev }; delete n[item.strategyName]; return n; });
                                          setSubTableBuySellFilters(prev => { const n = { ...prev }; delete n[item.strategyName]; return n; });
                                          setSubTablePortfolioFilters(prev => { const n = { ...prev }; delete n[item.strategyName]; return n; });
                                        }}
                                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors mr-1 cursor-pointer"
                                        title="Clear expanded filters"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Sub table output */}
                              {unfilteredSubRows.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-6 text-center bg-slate-900 border border-slate-800 rounded-lg shadow-sm">
                                  <AlertCircle className="w-5 h-5 text-slate-500 mb-1" />
                                  <span className="text-[10px] font-mono text-slate-400">
                                    No records found under category: <strong className="text-amber-400 font-extrabold">{activeDetailFilter.toUpperCase()}</strong>
                                  </span>
                                </div>
                              ) : filteredSubRows.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-6 text-center bg-slate-900 border border-slate-800 rounded-lg shadow-sm">
                                  <Filter className="w-5 h-5 text-slate-500 mb-1" />
                                  <span className="text-[10px] font-mono text-slate-400">
                                    No records match your active search or dropdown criteria inside this strategy.
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSubTableSearches(prev => { const n = { ...prev }; delete n[item.strategyName]; return n; });
                                      setSubTableBuySellFilters(prev => { const n = { ...prev }; delete n[item.strategyName]; return n; });
                                      setSubTablePortfolioFilters(prev => { const n = { ...prev }; delete n[item.strategyName]; return n; });
                                    }}
                                    className="mt-2 text-[10px] bg-slate-950 hover:bg-slate-850 px-2.5 py-1 rounded text-blue-400 border border-slate-800 cursor-pointer"
                                  >
                                    Clear Expand Search
                                  </button>
                                </div>
                              ) : (
                                <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900 shadow-sm">
                                  <table className="w-full text-left font-mono text-[10.5px]">
                                    <thead className="bg-slate-950 text-slate-400 font-mono select-none">
                                      <tr className="border-b border-slate-800 text-slate-350">
                                        <th className="py-1.5 px-3">Deal Num</th>
                                        <th className="py-1.5 px-3">Reference</th>
                                        <th className="py-1.5 px-3">EOD Date</th>
                                        <th className="py-1.5 px-3">Portfolio</th>
                                        <th className="py-1.5 px-3">Buy/Sell</th>
                                        <th className="py-1.5 px-3">Ins Type</th>
                                        <th className="py-1.5 px-3">Cflow Type</th>
                                        <th className="py-1.5 px-3 font-semibold select-none text-blue-400">Settlement Type</th>
                                        <th className="py-1.5 px-3 text-blue-300">Exposure Month</th>
                                        <th className="py-1.5 px-3">Vol Type</th>
                                        <th className="py-1.5 px-3 text-right">Volume</th>
                                        <th className="py-1.5 px-3 text-right">Price</th>
                                        <th className="py-1.5 px-3 text-right">Value USD</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-850 bg-slate-900">
                                      {filteredSubRows.map((uRow: any, subIdx) => {
                                        const uVal = Number(String(uRow['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
                                        const uVol = Number(String(uRow['Volume'] || '').replace(/[^0-9.-]/g, ''));
                                        const uPrice = Number(String(uRow['Price'] || '').replace(/[^0-9.-]/g, ''));

                                        const isBuy = String(uRow['Buy_Sell'] || '').toLowerCase() === 'buy' || String(uRow['Buy_Sell'] || '').toLowerCase() === 'buys';

                                        // Dynamic Settlement Type calculation per row based on strategy context
                                        const getRowSettlementType = (row: any) => {
                                          const rawSett = String(row['Settlement Type'] || '').trim();
                                          if (rawSett && rawSett !== '—') {
                                            return rawSett;
                                          }

                                          const cflowType = String(row['Cflow Type'] || '').trim().toLowerCase();
                                          if (cflowType !== 'commodity') {
                                            return String(row['Settlement Type'] || '').trim() || '—';
                                          }

                                          // Find if strategy has Optimization LNG rows
                                          const strategyRows = item.underlyingRows;
                                          const hasOpt = strategyRows.some(r => {
                                            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
                                            return port === 'optimization lng' || port.includes('optimization');
                                          });

                                          const hasBuy = strategyRows.some(r => {
                                            const buySell = String(r['Buy_Sell'] || r['BuySell'] || '').trim().toLowerCase();
                                            const cf = String(r['Cflow Type'] || '').trim().toLowerCase();
                                            return (buySell === 'buy' || buySell === 'buys') && cf === 'commodity';
                                          });

                                          const hasSell = strategyRows.some(r => {
                                            const buySell = String(r['Buy_Sell'] || r['BuySell'] || '').trim().toLowerCase();
                                            const cf = String(r['Cflow Type'] || '').trim().toLowerCase();
                                            return (buySell === 'sell' || buySell === 'sells') && cf === 'commodity';
                                          });

                                          const isBuyRow = String(row['Buy_Sell'] || '').toLowerCase() === 'buy' || String(row['Buy_Sell'] || '').toLowerCase() === 'buys';
                                          const isSellRow = String(row['Buy_Sell'] || '').toLowerCase() === 'sell' || String(row['Buy_Sell'] || '').toLowerCase() === 'sells';

                                          if (hasOpt) {
                                            const port = String(row['Internal Portfolio'] || row['Portfolio'] || '').trim().toLowerCase();
                                            if (port === 'optimization lng' || port.includes('optimization')) {
                                              return String(row['Settlement Type'] || '').trim() || 'Cash Settlement';
                                            } else {
                                              return 'Physical Settlement';
                                            }
                                          } else {
                                            if (!hasBuy && hasSell) {
                                              // Open on buy leg: physical for buy (missing), cash for sell (exists)
                                              return isBuyRow ? 'Physical Settlement' : 'Cash Settlement';
                                            } else if (hasBuy && !hasSell) {
                                              // Open on sell leg: physical for sell (missing), cash for buy (exists)
                                              return isSellRow ? 'Physical Settlement' : 'Cash Settlement';
                                            } else if (hasBuy && hasSell) {
                                              // Matched legs: drop physical settlement (meaning they are Cash Settlement)
                                              return String(row['Settlement Type'] || '').trim() || 'Cash Settlement';
                                            }
                                          }
                                          return String(row['Settlement Type'] || '').trim() || 'Cash Settlement';
                                        };

                                        const settlementType = getRowSettlementType(uRow);

                                        return (
                                          <tr key={subIdx} className="hover:bg-slate-850 text-slate-300 border-b border-slate-850 font-mono transition-colors">
                                            <td className="py-1.5 px-3 font-semibold text-slate-100">{uRow['Deal Num']}</td>
                                            <td className="py-1.5 px-3 max-w-[200px] truncate" title={uRow['Reference']}>{uRow['Reference']}</td>
                                            <td className="py-1.5 px-3 text-slate-400">{uRow['EOD Date'] || uRow['EOD_Date']}</td>
                                            <td className="py-1.5 px-3 font-semibold text-slate-350">{uRow['Internal Portfolio']}</td>
                                            <td className={`py-1.5 px-3 font-bold ${isBuy ? 'text-emerald-400' : 'text-rose-400'}`}>
                                              {uRow['Buy_Sell']}
                                            </td>
                                            <td className="py-1.5 px-3 text-slate-400">{uRow['Ins Type']}</td>
                                            <td className="py-1.5 px-3 text-blue-400">{uRow['Cflow Type']}</td>
                                            <td className="py-1.5 px-3">
                                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                                settlementType === 'Physical Settlement'
                                                  ? 'bg-amber-950/45 text-amber-300 border border-amber-900/30'
                                                  : settlementType === '—'
                                                  ? 'text-slate-500'
                                                  : 'bg-emerald-950/45 text-emerald-300 border border-emerald-900/30'
                                              }`}>
                                                {settlementType}
                                              </span>
                                            </td>
                                            <td className="py-1.5 px-3 text-slate-400 font-mono">
                                              {getRowExposureMonth(uRow) || '—'}
                                            </td>
                                            <td className="py-1.5 px-3">
                                              <span className={uRow['Volume Type'] === 'Actual' ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                                                {uRow['Volume Type']}
                                              </span>
                                            </td>
                                            <td className="py-1.5 px-3 text-right text-slate-200">{isNaN(uVol) ? '—' : uVol.toLocaleString(undefined, { maximumFractionDigits: 3 })}</td>
                                            <td className="py-1.5 px-3 text-right text-slate-350">{isNaN(uPrice) ? '—' : `$${uPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`}</td>
                                            <td className="py-1.5 px-3 text-right text-slate-100">
                                              ${isNaN(uVal) ? '—' : uVal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot className="bg-slate-950 border-t border-slate-800 font-bold text-slate-200">
                                      <tr>
                                        <td colSpan={10} className="py-2 px-3 text-slate-450 text-left uppercase tracking-wider font-extrabold text-[10px]">
                                          SUBTOTAL SUM
                                        </td>
                                        <td className="py-2 px-3 text-right text-blue-400 font-mono">
                                          {subTotals.totalVol === 0 ? '—' : subTotals.totalVol.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                                        </td>
                                        <td className="py-2 px-3 text-right text-slate-350 font-mono">
                                          {subAvgPrice === 0 ? '—' : `$${subAvgPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`}
                                        </td>
                                        <td className="py-2 px-3 text-right text-slate-100 font-mono">
                                          ${subTotals.totalVal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })()}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
    )}

    </div>
  );
};
