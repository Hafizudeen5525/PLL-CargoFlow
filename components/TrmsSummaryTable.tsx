import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
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
  AlertTriangle,
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
  Zap,
  FolderKanban,
  Check,
  RotateCcw,
  CheckSquare,
  Square
} from 'lucide-react';
import { 
  getGroupName, 
  getCustomGroups, 
  saveCustomGroups, 
  getSnGroupOverrides, 
  saveSnGroupOverrides, 
  normalizeSnKey, 
  DEFAULT_GROUPS 
} from '../services/calculationService';
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
  CartesianGrid,
  ComposedChart,
  Line
} from 'recharts';
import { ReconciliationData, ColumnFilterPopover } from './DiscrepancyCheck';
import { ExecutiveDashboard } from './ExecutiveDashboard';
import { isUnallocatedBuyer, getEstimatedSellRows, extractRowIndexName, isMiscFeeRow, isSrcRow } from '../utils/trmsEngine';
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
  return getGroupName(strategyName);
};

const getRowPriceIndex = (row: any) => {
  const indexVal = row['IndexName_ProjectionMethod'] || row['IndexName ProjectionMethod'] || row['IndexName_Projection_Method'] || row['Index Name'] || row['IndexName'] || row['Reference'] || '';
  const str = String(indexVal).toUpperCase();
  if (str.includes('HH') || str.includes('HENRY')) return 'Henry Hub';
  if (str.includes('TTF')) return 'TTF';
  if (str.includes('JKM')) return 'JKM';
  if (str.includes('NBP')) return 'NBP';
  if (str.includes('BRENT') || str.includes('CO1')) return 'Brent';
  if (str.includes('JCC')) return 'JCC';
  return 'Fixed / Other';
};

const getRowTraderName = (row: any) => {
  return String(row['Trader'] || row['Trader Name'] || 'Unassigned').trim();
};

const convertVolume = (vol: number, unit?: string): number => {
  if (isNaN(vol) || vol === null) return 0;
  return vol;
};

const addUnitVolume = (acc: { [unit: string]: number }, vol: number, unit?: string): { [unit: string]: number } => {
  if (isNaN(vol) || !vol) return acc;
  const u = String(unit || 'MMBtu').trim().toUpperCase();
  let normUnit = 'MMBtu';
  if (u === 'BBL' || u === 'BBLS' || u === 'BARREL' || u === 'BARRELS') {
    normUnit = 'Bbl';
  } else if (u === 'MMBTU' || u === 'MMBTUS') {
    normUnit = 'MMBtu';
  } else if (u === 'MWH' || u === 'MWHS' || u === 'MEGAWATT HOUR' || u === 'MEGAWATT HOURS') {
    normUnit = 'MWh';
  } else if (u === 'GJ' || u === 'GJS' || u === 'GIGAJOULE' || u === 'GIGAJOULES') {
    normUnit = 'GJ';
  } else if (u === 'CARGO' || u === 'CARGOES') {
    normUnit = 'Cargo';
  } else if (u === 'CURRENCY' || u === 'USD' || u === 'EUR' || u === '$') {
    return acc;
  } else if (unit) {
    normUnit = unit.trim();
  }
  acc[normUnit] = (acc[normUnit] || 0) + vol;
  return acc;
};

const sumUnitVolumesList = (items: { [unit: string]: number }[]): { [unit: string]: number } => {
  const result: { [unit: string]: number } = {};
  items.forEach(item => {
    if (!item) return;
    Object.entries(item).forEach(([unit, val]) => {
      result[unit] = (result[unit] || 0) + val;
    });
  });
  return result;
};

const maxUnitVolumesList = (items: Array<{ purchase: { [unit: string]: number }, sales: { [unit: string]: number } }>): { [unit: string]: number } => {
  const result: { [unit: string]: number } = {};
  items.forEach(item => {
    const allUnits = new Set([
      ...Object.keys(item.purchase || {}),
      ...Object.keys(item.sales || {})
    ]);
    allUnits.forEach(unit => {
      const p = item.purchase?.[unit] || 0;
      const s = item.sales?.[unit] || 0;
      result[unit] = (result[unit] || 0) + Math.max(p, s);
    });
  });
  return result;
};

interface TrmsSummaryTableProps {
  trmsData: ReconciliationData;
  viewModeOnly?: 'grid' | 'dashboard';
}

const validateReferenceFormat = (ref: string): { isValid: boolean; error?: string } => {
  if (!ref) {
    return { isValid: false, error: 'Reference is empty' };
  }
  const parts = ref.split('_');
  if (parts.length < 3) {
    return { isValid: false, error: 'Reference must have at least 3 underscore-separated segments (Index_Buyer_ExpMonthYear)' };
  }

  const [index, buyer, exp] = parts;

  // 1. Price index check
  const allowedIndices = ['AECO', 'SLOPE', 'BRI', 'DTB', 'HH', 'JKM', 'JCC', 'NBP', 'TFU', 'TTF'];
  if (!allowedIndices.includes(index.toUpperCase())) {
    return { isValid: false, error: `Invalid price index "${index}". Expected one of: ${allowedIndices.join(', ')}` };
  }

  // 2. Buyer symbol check
  if (!/^[A-Za-z0-9]+$/.test(buyer)) {
    return { isValid: false, error: `Buyer symbol "${buyer}" must be alphanumeric (no spaces/special chars)` };
  }

  // 3. Exposure month & year check
  if (exp.length !== 3) {
    return { isValid: false, error: `Exposure segment "${exp}" must be exactly 3 characters (e.g., M26)` };
  }

  const monthChar = exp[0].toUpperCase();
  const yearStr = exp.substring(1);

  const allowedMonths = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z'];
  if (!allowedMonths.includes(monthChar)) {
    return { isValid: false, error: `Invalid month symbol "${monthChar}". Expected one of: ${allowedMonths.join(', ')}` };
  }

  if (!/^\d{2}$/.test(yearStr)) {
    return { isValid: false, error: `Invalid year suffix "${yearStr}". Expected 2 digits (e.g. 26)` };
  }

  return { isValid: true };
};

const parseIndexFromReference = (ref: string): string => {
  if (!ref) return '—';
  const parts = ref.split('_');
  if (parts.length > 0 && parts[0]) {
    return parts[0].toUpperCase();
  }
  return '—';
};

const parseBuyerFromReference = (ref: string): string => {
  if (!ref) return '—';
  const parts = ref.split('_');
  if (parts.length > 1 && parts[1]) {
    return parts[1].toUpperCase();
  }
  return '—';
};

const parseExpiryFromReference = (ref: string): string => {
  if (!ref) return '—';
  const parts = ref.split('_');
  if (parts.length > 2 && parts[2]) {
    return parts[2].toUpperCase();
  }
  return '—';
};

const getReadableIndexName = (idx: string): string => {
  const upper = idx.trim().toUpperCase();
  switch (upper) {
    case 'BRI': return 'Brent';
    case 'DTB': return 'Dated Brent';
    case 'HH': return 'HH';
    case 'NBP': return 'NBP';
    case 'TTF': return 'TTF';
    case 'JKM': return 'JKM';
    case 'AECO': return 'AECO';
    case 'SLOPE': return 'Slope';
    case 'JCC': return 'JCC';
    case 'TFU': return 'TFU';
    default: return idx;
  }
};

const decodeExposureMonth = (expCode: string): string => {
  if (!expCode || expCode.length !== 3) return expCode || '—';
  const m = expCode[0].toUpperCase();
  const y = expCode.substring(1);
  const monthMap: Record<string, string> = {
    F: 'Jan',
    G: 'Feb',
    H: 'Mar',
    J: 'Apr',
    K: 'May',
    M: 'Jun',
    N: 'Jul',
    Q: 'Aug',
    U: 'Sep',
    V: 'Oct',
    X: 'Nov',
    Z: 'Dec'
  };
  const monthName = monthMap[m];
  if (!monthName || !/^\d{2}$/.test(y)) return expCode;
  return `${monthName} 20${y}`;
};

const sortExposureMonths = (months: string[]): string[] => {
  const monthsList = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return [...months].sort((a, b) => {
    const parse = (str: string) => {
      const parts = str.split(' ');
      if (parts.length < 2) return { monthIdx: -1, year: 0 };
      const mIdx = monthsList.indexOf(parts[0]);
      const yr = parseInt(parts[1], 10);
      return { monthIdx: mIdx, year: isNaN(yr) ? 0 : yr };
    };
    const pa = parse(a);
    const pb = parse(b);
    if (pa.year !== pb.year) return pa.year - pb.year;
    return pa.monthIdx - pb.monthIdx;
  });
};

const renderIndexPill = (idx: string) => {
  const cleanIdx = idx.trim().toUpperCase();
  const readable = getReadableIndexName(idx);
  let colorClasses = 'bg-slate-950/45 text-slate-300 border-slate-900';
  if (cleanIdx === 'TTF') {
    colorClasses = 'bg-indigo-950/45 text-indigo-300 border-indigo-900/30';
  } else if (cleanIdx === 'JKM') {
    colorClasses = 'bg-amber-950/45 text-amber-300 border-amber-900/30';
  } else if (cleanIdx === 'HH' || cleanIdx === 'HENRY HUB') {
    colorClasses = 'bg-emerald-950/45 text-emerald-300 border-emerald-900/30';
  } else if (cleanIdx === 'NBP') {
    colorClasses = 'bg-blue-950/45 text-blue-300 border-blue-900/30';
  } else if (cleanIdx === 'AECO') {
    colorClasses = 'bg-violet-950/45 text-violet-300 border-violet-900/30';
  } else if (cleanIdx === 'SLOPE') {
    colorClasses = 'bg-rose-950/45 text-rose-300 border-rose-900/30';
  } else if (cleanIdx === 'JCC') {
    colorClasses = 'bg-teal-950/45 text-teal-300 border-teal-900/30';
  } else if (cleanIdx === 'BRI' || cleanIdx === 'DTB' || cleanIdx === 'TFU') {
    colorClasses = 'bg-cyan-950/45 text-cyan-300 border-cyan-900/30';
  }

  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border tracking-wider font-mono ${colorClasses}`}>
      {readable}
    </span>
  );
};

export const TrmsSummaryTable: React.FC<TrmsSummaryTableProps> = ({ trmsData, viewModeOnly }) => {
  const [viewMode, setViewMode] = useState<'dashboard' | 'grid'>(viewModeOnly || 'dashboard');
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'optimizations' | 'breakdowns' | 'volume_exposure'>('overview');

  useEffect(() => {
    if (viewModeOnly) {
      setViewMode(viewModeOnly);
    }
  }, [viewModeOnly]);

  const [activeTrmsGroup, setActiveTrmsGroup] = useState<string>('All');
  const [selectedDrillDownStrategy, setSelectedDrillDownStrategy] = useState<string | null>(null);
  const [selectedTraderFilter, setSelectedTraderFilter] = useState<string | null>(null);
  const [selectedIndexFilter, setSelectedIndexFilter] = useState<string | null>(null);
  const [drilldownSubFilter, setDrilldownSubFilter] = useState<'all' | 'base' | 'optimized'>('all');

  useEffect(() => {
    setDrilldownSubFilter('all');
  }, [selectedDrillDownStrategy]);
  const [activeBreakdownCategory, setActiveBreakdownCategory] = useState<string>('PL9SB');
  const [selectedUnit, setSelectedUnit] = useState<string>('ALL');
  const [indexBreakdownUnit, setIndexBreakdownUnit] = useState<'MMBtu' | 'Bbl' | 'Ratio'>('MMBtu');

  // Custom Portfolio Group Categorization State
  const [isCustomGroupModalOpen, setIsCustomGroupModalOpen] = useState(false);
  const [customGroupsList, setCustomGroupsList] = useState<string[]>(() => getCustomGroups());
  const [customSnOverrides, setCustomSnOverrides] = useState<Record<string, string>>(() => getSnGroupOverrides());
  const [groupUpdateTrigger, setGroupUpdateTrigger] = useState(0);

  const [newGroupNameInput, setNewGroupNameInput] = useState('');
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [modalFilterGroup, setModalFilterGroup] = useState('ALL');
  const [selectedModalSns, setSelectedModalSns] = useState<Set<string>>(new Set());
  const [batchTargetGroup, setBatchTargetGroup] = useState('Carved Out');

  useEffect(() => {
    const handleUpdate = () => {
      setCustomGroupsList(getCustomGroups());
      setCustomSnOverrides(getSnGroupOverrides());
      setGroupUpdateTrigger(prev => prev + 1);
    };
    window.addEventListener('sn_groups_updated', handleUpdate);
    return () => window.removeEventListener('sn_groups_updated', handleUpdate);
  }, []);

  const formatUnitVolumes = useCallback((
    volumes: { [unit: string]: number } | undefined, 
    separator: string = ' | ',
    type: 'buy' | 'sell' | 'neutral' = 'neutral'
  ): string => {
    if (!volumes) return '—';
    const entries = Object.entries(volumes).filter(([_, val]) => Math.abs(val) > 0.0001);
    if (entries.length === 0) return '—';

    const signPrefix = type === 'buy' ? '+' : '';

    if (selectedUnit !== 'ALL') {
      const match = entries.find(([unit]) => unit.toUpperCase() === selectedUnit.toUpperCase());
      if (match) {
        const absoluteVal = Math.abs(match[1]);
        const formattedVal = absoluteVal.toLocaleString(undefined, { maximumFractionDigits: 0 });
        return `${signPrefix}${formattedVal} ${match[0]}`;
      }
      return '—';
    }

    return entries
      .map(([unit, val]) => {
        const absoluteVal = Math.abs(val);
        const formattedVal = absoluteVal.toLocaleString(undefined, { maximumFractionDigits: 0 });
        return `${signPrefix}${formattedVal} ${unit}`;
      })
      .join(separator);
  }, [selectedUnit]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const [selectedEodDate, setSelectedEodDate] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [showBuyer, setShowBuyer] = useState(true);
  const [showSeller, setShowSeller] = useState(false);
  const [showExposureMonths, setShowExposureMonths] = useState(false);
  const [showLoadingMonth, setShowLoadingMonth] = useState(false);
  const [showDeliveryMonth, setShowDeliveryMonth] = useState(false);
  const [showBuyIndex, setShowBuyIndex] = useState(false);
  const [showSellIndex, setShowSellIndex] = useState(false);
  const [showLinesCount, setShowLinesCount] = useState(false);
  const [isColumnsDropdownOpen, setIsColumnsDropdownOpen] = useState(false);
  const columnsDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnsDropdownRef.current && !columnsDropdownRef.current.contains(event.target as Node)) {
        setIsColumnsDropdownOpen(false);
      }
    };
    if (isColumnsDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isColumnsDropdownOpen]);
  const [expandedStrategies, setExpandedStrategies] = useState<Set<string>>(new Set());
  const [activeFilterMenu, setActiveFilterMenu] = useState<string | null>(null);

  // Filter mode for expanded auditing details list per strategy: 'base_lng' | 'shipping_costs' | 'other_costs' | 'misc_costs' | 'hedging' | 'all' | 'buy_commodity' | 'sell_commodity'
  const [expandedFilters, setExpandedFilters] = useState<Record<string, 'base_lng' | 'shipping_costs' | 'other_costs' | 'misc_costs' | 'hedging' | 'all' | 'buy_commodity' | 'sell_commodity'>>({});

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
  const [subTableRefFilters, setSubTableRefFilters] = useState<Record<string, string>>({});
  const [subTableIndexFilters, setSubTableIndexFilters] = useState<Record<string, string>>({});
  const [subTableExposureMonthFilters, setSubTableExposureMonthFilters] = useState<Record<string, string>>({});

  // Sub-table per-column filter state and popovers indexed by Strategy Name
  const [subTableColumnFilters, setSubTableColumnFilters] = useState<Record<string, Record<string, {
    selectedValues: Set<string>;
    condition: string;
    conditionValue1: string;
    conditionValue2: string;
  }>>>({});
  const [activeSubFilterMenu, setActiveSubFilterMenu] = useState<string | null>(null);
  const [subFilterSearchTerms, setSubFilterSearchTerms] = useState<Record<string, Record<string, string>>>({});
  const [subTableSortConfig, setSubTableSortConfig] = useState<Record<string, { column: string; direction: 'asc' | 'desc' | null }>>({});

  const [alertsCollapsed, setAlertsCollapsed] = useState<boolean>(true);

  const rows = useMemo(() => trmsData.extractedRows || [], [trmsData.extractedRows]);

  // Click outside handling for menus
  const menuRef = useRef<HTMLDivElement>(null);
  const subMenuRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setActiveFilterMenu(null);
      }
      if (subMenuRef.current && !subMenuRef.current.contains(target)) {
        setActiveSubFilterMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Right-click drag scrolling for the main TRMS summary table
  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;

    const handleMouseDown = (e: MouseEvent) => {
      // Right click only (button === 2)
      if (e.button !== 2) return;
      
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      scrollLeft = container.scrollLeft;
      scrollTop = container.scrollTop;

      container.style.cursor = 'grabbing';
      
      // Prevent text selection inside table during drag
      document.body.style.userSelect = 'none';
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      container.scrollLeft = scrollLeft - dx;
      container.scrollTop = scrollTop - dy;
    };

    const handleMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      
      container.style.cursor = 'auto';
      document.body.style.userSelect = '';
    };

    const handleContextMenu = (e: MouseEvent) => {
      // Allow standard context menu if user has highlighted/selected text
      const selectedText = window.getSelection()?.toString();
      if (selectedText && selectedText.trim().length > 0) {
        return;
      }
      // Always prevent context menu on right-click within the table container 
      // so the browser popup doesn't block the screen while scrolling
      e.preventDefault();
    };

    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Custom Portfolio Group Categorization Handlers
  const getDefaultRuleGroup = useCallback((strategyName: string) => {
    const sn = (strategyName || '').toUpperCase();
    if (sn.includes('PL9SB')) return 'PL9SB';
    if (sn.includes('FLNG1') || sn.includes('PFLNG1')) return 'FLNG1';
    if (sn.includes('FLNG2') || sn.includes('PFLNG2')) return 'FLNG2';
    if (sn.includes('LNGC')) return 'LNGC';
    if (sn.includes('SPOT')) return 'Spot';
    if (sn.includes('CHENIERE') || sn.includes('SPL') || sn.includes('CCL')) return 'Cheniere';
    return 'Others';
  }, []);

  const handleAddCustomGroup = () => {
    const trimmed = newGroupNameInput.trim();
    if (!trimmed) return;
    if (customGroupsList.some(g => g.toLowerCase() === trimmed.toLowerCase())) {
      toast.error(`Group "${trimmed}" already exists`);
      return;
    }
    const updated = [...customGroupsList, trimmed];
    saveCustomGroups(updated);
    setNewGroupNameInput('');
    toast.success(`Created portfolio group "${trimmed}"`);
  };

  const handleRemoveCustomGroup = (groupName: string) => {
    if (DEFAULT_GROUPS.includes(groupName)) {
      toast.error(`Cannot delete default group "${groupName}"`);
      return;
    }
    const updatedGroups = customGroupsList.filter(g => g !== groupName);
    saveCustomGroups(updatedGroups);

    const overrides = getSnGroupOverrides();
    let changed = false;
    Object.entries(overrides).forEach(([snKey, grp]) => {
      if (grp === groupName) {
        delete overrides[snKey];
        changed = true;
      }
    });
    if (changed) {
      saveSnGroupOverrides(overrides);
    }
    toast.success(`Removed portfolio group "${groupName}"`);
  };

  const handleSingleSnGroupChange = (sn: string, targetGroup: string) => {
    const overrides = { ...getSnGroupOverrides() };
    const normKey = normalizeSnKey(sn);
    const defaultGrp = getDefaultRuleGroup(sn);

    if (targetGroup === defaultGrp) {
      delete overrides[normKey];
      delete overrides[sn];
    } else {
      overrides[normKey] = targetGroup;
      overrides[sn] = targetGroup;
    }
    saveSnGroupOverrides(overrides);
    toast.success(`Assigned "${sn}" to ${targetGroup}`);
  };

  const handleApplyBatchGroup = () => {
    if (selectedModalSns.size === 0) return;
    const overrides = { ...getSnGroupOverrides() };
    selectedModalSns.forEach(sn => {
      const normKey = normalizeSnKey(sn);
      const defaultGrp = getDefaultRuleGroup(sn);
      if (batchTargetGroup === defaultGrp) {
        delete overrides[normKey];
        delete overrides[sn];
      } else {
        overrides[normKey] = batchTargetGroup;
        overrides[sn] = batchTargetGroup;
      }
    });
    saveSnGroupOverrides(overrides);
    toast.success(`Assigned ${selectedModalSns.size} strategy names to "${batchTargetGroup}"`);
    setSelectedModalSns(new Set());
  };

  const handleResetSnOverride = (sn: string) => {
    const overrides = { ...getSnGroupOverrides() };
    delete overrides[normalizeSnKey(sn)];
    delete overrides[sn];
    saveSnGroupOverrides(overrides);
    toast.success(`Reset "${sn}" to default group`);
  };

  const handleResetAllOverrides = () => {
    if (window.confirm('Are you sure you want to reset all custom strategy group categorizations to default?')) {
      saveSnGroupOverrides({});
      saveCustomGroups(DEFAULT_GROUPS);
      toast.success('All strategy group overrides reset to defaults');
    }
  };

  // Get all unique Strategy Names from data
  const allModalSns = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r: any) => {
      const sn = String(r['Strategy Name'] || r['Strategy'] || '').trim();
      if (sn) set.add(sn);
    });
    return Array.from(set).sort();
  }, [rows]);

  const filteredModalSns = useMemo(() => {
    void groupUpdateTrigger;
    return allModalSns.filter(sn => {
      const currentGrp = getGroupName(sn);
      const normKey = normalizeSnKey(sn);
      const hasOverride = !!customSnOverrides[normKey] || !!customSnOverrides[sn];

      // Group filter
      if (modalFilterGroup === 'OVERRIDDEN' && !hasOverride) return false;
      if (modalFilterGroup !== 'ALL' && modalFilterGroup !== 'OVERRIDDEN' && currentGrp !== modalFilterGroup) return false;

      // Search filter
      if (modalSearchTerm.trim()) {
        const term = modalSearchTerm.toLowerCase();
        if (!sn.toLowerCase().includes(term) && !currentGrp.toLowerCase().includes(term)) {
          return false;
        }
      }

      return true;
    });
  }, [allModalSns, customSnOverrides, modalFilterGroup, modalSearchTerm, groupUpdateTrigger]);

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
    void groupUpdateTrigger;
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

      // Physical cargo rows (Base LNG or Optimization LNG only, excluding DH LNG, DFT LNG, Hedging LNG)
      const physicalCargoRows = underlyingRows.filter(r => {
        const ins = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
        const cflow = String(r['Cflow Type'] || '').trim().toLowerCase();
        const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();

        const isCommodityPhys = ins === 'COMM-PHYS' && cflow === 'commodity';
        const isPaperOrHedge = port === 'dh lng' || port === 'dft lng' || port === 'hedging lng' || port.includes('dh') || port.includes('dft') || port.includes('hedging');

        return isCommodityPhys && !isPaperOrHedge;
      });

      const hasBuy = physicalCargoRows.some(r => {
        const buySell = String(r['Buy_Sell'] || r['BuySell'] || '').trim().toLowerCase();
        return buySell === 'buy' || buySell === 'buys';
      });

      const hasSell = physicalCargoRows.some(r => {
        const buySell = String(r['Buy_Sell'] || r['BuySell'] || '').trim().toLowerCase();
        if (buySell !== 'sell' && buySell !== 'sells') return false;
        const entity = String(r['External Legal Entity'] || r['Buyer'] || r['Legal Entity'] || '').trim();
        return !isUnallocatedBuyer(entity);
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
      const purchaseVolumeByUnit: { [unit: string]: number } = {};
      let salesVolume = 0;
      const salesVolumeByUnit: { [unit: string]: number } = {};
      let totalVolume = 0;
      const totalVolumeByUnit: { [unit: string]: number } = {};
      let totalValueUSD = 0;
      let totalPnL = 0;

      // Shipping related cost sum: Cflow Type is "SRC- Shipping Related Cost"
      let shippingRelatedCosts = 0;
      let miscCost = 0;

      // Hedging P&L sum: Base Value USD of all items with portfolio "Hedging LNG"
      let hedgingPnL = 0;
      let hedgingVolume = 0;
      const hedgingVolumeByUnit: { [unit: string]: number } = {};
      let paperVolume = 0;
      const paperVolumeByUnit: { [unit: string]: number } = {};

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
          if (buyCalcRows.length === 0) {
            buyCalcRows = underlyingRows.filter(r => {
              const isBuy = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || r['Buy_Sell'] || '').toLowerCase() === 'buys';
              const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
              const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
              const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
              const isOpt = port === 'optimization lng' || port.includes('optimization');
              return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS' && isOpt;
            });
          }

          sellCalcRows = underlyingRows.filter(r => {
            const isSell = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || r['Buy_Sell'] || '').toLowerCase() === 'sells';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            const isOpt = port === 'optimization lng' || port.includes('optimization');
            return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS' && isOpt && sett !== 'Physical Settlement';
          });
          if (sellCalcRows.length === 0) {
            sellCalcRows = underlyingRows.filter(r => {
              const isSell = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || r['Buy_Sell'] || '').toLowerCase() === 'sells';
              const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
              const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
              const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
              const isOpt = port === 'optimization lng' || port.includes('optimization');
              return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS' && isOpt;
            });
          }
        } else if (unallocatedCargo === 'Open on Buy Leg') {
          buyCalcRows = [];
          sellCalcRows = underlyingRows.filter(r => {
            const isSell = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sells';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            const isOpt = port === 'optimization lng' || port.includes('optimization');
            return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS' && isOpt && sett !== 'Physical Settlement';
          });
          if (sellCalcRows.length === 0) {
            sellCalcRows = underlyingRows.filter(r => {
              const isSell = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sells';
              const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
              const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
              const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
              const isOpt = port === 'optimization lng' || port.includes('optimization');
              return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS' && isOpt;
            });
          }
        } else if (unallocatedCargo === 'Open on Sell Leg') {
          sellCalcRows = [];
          buyCalcRows = underlyingRows.filter(r => {
            const isBuy = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buys';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            const isOpt = port === 'optimization lng' || port.includes('optimization');
            return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS' && isOpt && sett !== 'Physical Settlement';
          });
          if (buyCalcRows.length === 0) {
            buyCalcRows = underlyingRows.filter(r => {
              const isBuy = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buys';
              const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
              const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
              const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
              const isOpt = port === 'optimization lng' || port.includes('optimization');
              return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS' && isOpt;
            });
          }
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
        if (unallocatedCargo === 'Open on Buy Leg' || (!hasBuy && hasSell)) {
          buyCalcRows = [];
          sellCalcRows = underlyingRows.filter(r => {
            const isSell = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sells';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS' && sett !== 'Physical Settlement';
          });
          if (sellCalcRows.length === 0) {
            sellCalcRows = underlyingRows.filter(r => {
              const isSell = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sells';
              const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
              const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
              return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS';
            });
          }
        } else if (unallocatedCargo === 'Open on Sell Leg' || (hasBuy && !hasSell)) {
          sellCalcRows = [];
          buyCalcRows = underlyingRows.filter(r => {
            const isBuy = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buys';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS' && sett !== 'Physical Settlement';
          });
          if (buyCalcRows.length === 0) {
            buyCalcRows = underlyingRows.filter(r => {
              const isBuy = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buys';
              const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
              const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
              return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS';
            });
          }
        } else if (hasBuy && hasSell) {
          buyCalcRows = underlyingRows.filter(r => {
            const isBuy = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buys';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS' && sett !== 'Physical Settlement';
          });
          if (buyCalcRows.length === 0) {
            buyCalcRows = underlyingRows.filter(r => {
              const isBuy = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buys';
              const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
              const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
              return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS';
            });
          }

          sellCalcRows = underlyingRows.filter(r => {
            const isSell = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sells';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const sett = String(r['Settlement Type'] || '').trim();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS' && sett !== 'Physical Settlement';
          });
          if (sellCalcRows.length === 0) {
            sellCalcRows = underlyingRows.filter(r => {
              const isSell = String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sells';
              const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
              const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
              return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS';
            });
          }
        }
      }

      if (sellCalcRows.length === 0) {
        sellCalcRows = getEstimatedSellRows(underlyingRows);
      }

      // Filter buyCalcRows / sellCalcRows to prefer "Actual" line items over "Nominated" if "Actual" items exist to prevent duplication
      const getVolType = (r: any) => String(r['Volume Type'] || r['Vol Type'] || r['VolType'] || r['Volume_Type'] || '').trim();

      if (buyCalcRows.some(r => getVolType(r) === 'Actual')) {
        buyCalcRows = buyCalcRows.filter(r => getVolType(r) === 'Actual');
      }
      if (sellCalcRows.some(r => getVolType(r) === 'Actual')) {
        sellCalcRows = sellCalcRows.filter(r => getVolType(r) === 'Actual');
      }

      // Turn cargo status (physicalPnLStatus) to Realized if all relevant line items are Actual
      const relevantCalcRows = [...buyCalcRows, ...sellCalcRows];
      if (relevantCalcRows.length > 0) {
        const allActual = relevantCalcRows.every(r => getVolType(r) === 'Actual');
        physicalPnLStatus = allActual ? 'Realized' : 'Unrealized';
      }

      // 1. Calculate General Metrics from all underlying rows (hedging, shipping, total volume, etc.)
      underlyingRows.forEach(r => {
        const rawVol = Number(String(r['Volume'] || '').replace(/[^0-9.-]/g, ''));
        const unit = r['Unit'] || r['unit'];
        const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));

        const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
        const internalPortfolio = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
        const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();

        const isCommodity = cflowType === 'commodity' && insType === 'COMM-PHYS';
        const isHedgingLng = internalPortfolio === 'hedging lng';
        const isPaperLng = internalPortfolio === 'dh lng' || internalPortfolio === 'dft lng';

        // Avoid double counting volume if a Nominated commodity row was excluded in favor of an Actual row
        let includeCommodityVol = true;
        if (isCommodity) {
          if (!buyCalcRows.includes(r) && !sellCalcRows.includes(r)) {
            includeCommodityVol = false;
          }
        }

        if (!isNaN(rawVol) && includeCommodityVol) {
          totalVolume += rawVol;
          addUnitVolume(totalVolumeByUnit, rawVol, unit);
          if (isHedgingLng) {
            hedgingVolume += Math.abs(rawVol);
            addUnitVolume(hedgingVolumeByUnit, Math.abs(rawVol), unit);
          } else if (isPaperLng) {
            paperVolume += Math.abs(rawVol);
            addUnitVolume(paperVolumeByUnit, Math.abs(rawVol), unit);
          }
        }
        if (!isNaN(val)) {
          // Shipping Related Costs check (SRC)
          if (isSrcRow(r)) {
            if (hasOpt) {
              const isOptRow = internalPortfolio === 'optimization lng' || internalPortfolio.includes('optimization');
              if (isOptRow) {
                shippingRelatedCosts += val;
              }
            } else {
              shippingRelatedCosts += val;
            }
          }

          // Miscellaneous Fee check
          if (isMiscFeeRow(r)) {
            if (hasOpt) {
              const isOptRow = internalPortfolio === 'optimization lng' || internalPortfolio.includes('optimization');
              if (isOptRow) {
                miscCost += val;
              }
            } else {
              miscCost += val;
            }
          }

          // Hedging LNG P&L check (Sums of Base_Value_USD as specified)
          if (isHedgingLng) {
            hedgingPnL += val;
          }
        }
      });

      const otherCosts = shippingRelatedCosts + miscCost;

      // Collect the correctly filtered line items that calculate "sum of value" and daily P&L movement (Change in P&L)
      const correctFilteredRows: any[] = [];
      
      // Add all commodity rows that are filtered
      correctFilteredRows.push(...buyCalcRows);
      correctFilteredRows.push(...sellCalcRows);
      
      // Add shipping related costs, misc fees, and hedging rows from underlyingRows
      underlyingRows.forEach(r => {
        const internalPortfolio = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
        
        const isShipping = isSrcRow(r);
        const isMisc = isMiscFeeRow(r);
        const isOther = isShipping || isMisc;
        const isHedging = internalPortfolio === 'hedging lng';
        
        if (isOther || isHedging) {
          if (!correctFilteredRows.includes(r)) {
            if (isOther && hasOpt) {
              const isOptRow = internalPortfolio === 'optimization lng' || internalPortfolio.includes('optimization');
              if (!isOptRow) return;
            }
            correctFilteredRows.push(r);
          }
        }
      });

      // Track Change in P&L for each specific category
      let purchaseCostPnLChange = 0;
      buyCalcRows.forEach(r => {
        const pnl = Number(String(r['Change_in_Total_PnL'] || r['Change_in_PnL'] || '').replace(/[^0-9.-]/g, ''));
        if (!isNaN(pnl)) purchaseCostPnLChange += pnl;
      });

      let salesRevenuePnLChange = 0;
      sellCalcRows.forEach(r => {
        const pnl = Number(String(r['Change_in_Total_PnL'] || r['Change_in_PnL'] || '').replace(/[^0-9.-]/g, ''));
        if (!isNaN(pnl)) salesRevenuePnLChange += pnl;
      });

      let shippingCostPnLChange = 0;
      let miscCostPnLChange = 0;
      let hedgingPnLChange = 0;

      underlyingRows.forEach(r => {
        const internalPortfolio = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
        const pnl = Number(String(r['Change_in_Total_PnL'] || r['Change_in_PnL'] || '').replace(/[^0-9.-]/g, ''));

        const isShipping = isSrcRow(r);
        const isMisc = isMiscFeeRow(r);
        const isHedging = internalPortfolio === 'hedging lng';

        if (isShipping) {
          if (hasOpt) {
            const isOptRow = internalPortfolio === 'optimization lng' || internalPortfolio.includes('optimization');
            if (isOptRow && !isNaN(pnl)) shippingCostPnLChange += pnl;
          } else {
            if (!isNaN(pnl)) shippingCostPnLChange += pnl;
          }
        }

        if (isMisc) {
          if (hasOpt) {
            const isOptRow = internalPortfolio === 'optimization lng' || internalPortfolio.includes('optimization');
            if (isOptRow && !isNaN(pnl)) miscCostPnLChange += pnl;
          } else {
            if (!isNaN(pnl)) miscCostPnLChange += pnl;
          }
        }

        if (isHedging) {
          if (!isNaN(pnl)) hedgingPnLChange += pnl;
        }
      });

      const otherCostPnLChange = shippingCostPnLChange + miscCostPnLChange;

      // Sum up Base_Total_Value_USD and Change_in_Total_PnL for these correctly filtered line items
      correctFilteredRows.forEach(r => {
        const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
        const pnl = Number(String(r['Change_in_Total_PnL'] || r['Change_in_PnL'] || '').replace(/[^0-9.-]/g, ''));
        
        if (!isNaN(val)) {
          totalValueUSD += val;
        }
        if (!isNaN(pnl)) {
          totalPnL += pnl;
        }
      });

      // 2. Calculate Purchase Metrics from buyCalcRows
      let buyTiers: any[] = [];
      if (buyCalcRows.length >= 2) {
        buyTiers = buyCalcRows.map(r => {
          const rawVol = Number(String(r['Volume'] || '').replace(/[^0-9.-]/g, ''));
          const unit = String(r['Unit'] || r['unit'] || 'MMBtu').trim();
          const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
          const price = Number(String(r['Price'] || '').replace(/[^0-9.-]/g, ''));
          const indexName = extractRowIndexName(r);
          return {
            vol: isNaN(rawVol) ? 0 : rawVol,
            unit,
            val: isNaN(val) ? 0 : val,
            price: isNaN(price) ? 0 : price,
            indexName: indexName || undefined
          };
        });
      }

      buyCalcRows.forEach(r => {
        const rawVol = Number(String(r['Volume'] || '').replace(/[^0-9.-]/g, ''));
        const absVol = isNaN(rawVol) ? 0 : Math.abs(rawVol);
        const unit = r['Unit'] || r['unit'];
        const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
        const price = Number(String(r['Price'] || '').replace(/[^0-9.-]/g, ''));

        if (absVol > 0) {
          purchaseVolume += absVol;
          addUnitVolume(purchaseVolumeByUnit, absVol, unit);
        }
        if (!isNaN(val)) {
          purchaseCost += Math.abs(val);
        }
        if (!isNaN(price) && Math.abs(price) > 0) {
          if (absVol > 0) {
            weightedBuyPriceSum += Math.abs(price) * absVol;
            buyPriceVolSum += absVol;
          }
          simpleBuyPriceSum += Math.abs(price);
          buyPriceCount++;
        }
      });

      // 3. Calculate Sales Metrics from sellCalcRows
      let sellTiers: any[] = [];
      if (sellCalcRows.length >= 2) {
        sellTiers = sellCalcRows.map(r => {
          const rawVol = Number(String(r['Volume'] || '').replace(/[^0-9.-]/g, ''));
          const absVol = isNaN(rawVol) ? 0 : Math.abs(rawVol);
          const unit = String(r['Unit'] || r['unit'] || 'MMBtu').trim();
          const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
          const price = Number(String(r['Price'] || '').replace(/[^0-9.-]/g, ''));
          const indexName = extractRowIndexName(r);
          return {
            vol: absVol,
            unit,
            val: isNaN(val) ? 0 : Math.abs(val),
            price: isNaN(price) ? 0 : Math.abs(price),
            indexName: indexName || undefined
          };
        });
      }

      sellCalcRows.forEach(r => {
        const rawVol = Number(String(r['Volume'] || '').replace(/[^0-9.-]/g, ''));
        const absVol = isNaN(rawVol) ? 0 : Math.abs(rawVol);
        const unit = r['Unit'] || r['unit'];
        const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
        const price = Number(String(r['Price'] || '').replace(/[^0-9.-]/g, ''));

        if (absVol > 0) {
          salesVolume += absVol;
          addUnitVolume(salesVolumeByUnit, absVol, unit);
        }
        if (!isNaN(val) && Math.abs(val) > 0) {
          salesRevenue += Math.abs(val);
        } else if (absVol > 0 && !isNaN(price) && Math.abs(price) > 0) {
          salesRevenue += absVol * Math.abs(price);
        }
        if (!isNaN(price) && Math.abs(price) > 0) {
          if (absVol > 0) {
            weightedSellPriceSum += Math.abs(price) * absVol;
            sellPriceVolSum += absVol;
          }
          simpleSellPriceSum += Math.abs(price);
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

      const extractEntity = (calcRows: any[], fallbackRows: any[], targetBs: 'sell' | 'buy'): string => {
        let sourceRows = (calcRows || []).filter((r: any) => {
          const bs = String(r['Buy_Sell'] || r['BuySell'] || '').trim().toLowerCase();
          return bs === targetBs || bs === targetBs + 's';
        });

        if (!sourceRows || sourceRows.length === 0) {
          sourceRows = (fallbackRows || []).filter((r: any) => {
            const bs = String(r['Buy_Sell'] || r['BuySell'] || '').trim().toLowerCase();
            const ins = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            const cflow = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();

            const bsMatch = bs === targetBs || bs === targetBs + 's';
            const isCommodityPhys = ins === 'COMM-PHYS' && cflow === 'commodity';
            const isPaperOrHedge = port === 'dh lng' || port === 'dft lng' || port === 'hedging lng' || port.includes('dh') || port.includes('dft') || port.includes('hedging');

            return bsMatch && isCommodityPhys && !isPaperOrHedge;
          });
        }

        const entities = new Set<string>();
        sourceRows.forEach((r: any) => {
          const ent = String(
            r['External Legal Entity'] ||
            r['External_Legal_Entity'] ||
            r['External Legal Entity Name'] ||
            r['Legal Entity'] ||
            r['Counterparty'] ||
            (targetBs === 'sell' ? (r['Buyer'] || r['Customer']) : (r['Seller'] || r['Supplier'])) ||
            ''
          ).trim();

          if (ent && !isUnallocatedBuyer(ent)) {
            entities.add(ent);
          }
        });

        if (entities.size > 0) {
          return Array.from(entities).join(', ');
        }
        return 'Spot';
      };

      const buyer = extractEntity(sellCalcRows, underlyingRows, 'sell');
      const seller = extractEntity(buyCalcRows, underlyingRows, 'buy');

      const extractIndexNames = (rows: any[]): string => {
        if (!rows || rows.length === 0) return '—';
        const set = new Set<string>();
        rows.forEach((r: any) => {
          const idx = extractRowIndexName(r);
          if (idx) set.add(idx);
        });
        return set.size > 0 ? Array.from(set).join(', ') : '—';
      };

      const buyIndex = extractIndexNames(buyCalcRows);
      const sellIndex = extractIndexNames(sellCalcRows);

      let basePnL = 0;
      let baseValueUSD = 0;
      let basePurchaseCost = 0;
      let baseSalesRevenue = 0;
      let baseShippingRelatedCosts = 0;
      let basePurchaseVolume = 0;
      const basePurchaseVolumeByUnit: { [unit: string]: number } = {};
      let baseSalesVolume = 0;
      const baseSalesVolumeByUnit: { [unit: string]: number } = {};
      let basePurchasePrice = 0;
      let baseSalesPrice = 0;
      let baseBuyTiers: any[] = [];
      let baseSellTiers: any[] = [];
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

        // Calculate specific base values for Uplift calculation
        buyBaseCalcRows.forEach(r => {
          const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
          if (!isNaN(val)) {
            basePurchaseCost += Math.abs(val);
          }
        });

        sellBaseCalcRows.forEach(r => {
          const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
          if (!isNaN(val)) {
            baseSalesRevenue += Math.abs(val);
          }
        });

        underlyingRows.forEach(r => {
          const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
          const internalPortfolio = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
          const isShipping = cflowType === 'src- shipping related cost' || cflowType.includes('shipping related cost');
          if (isShipping) {
            const isBaseRow = internalPortfolio === 'base lng' || internalPortfolio.includes('base');
            if (isBaseRow) {
              const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
              if (!isNaN(val)) {
                baseShippingRelatedCosts += Math.abs(val);
              }
            }
          }
        });

        // Calculate specific base volumes and prices
        let baseWeightedBuyPriceSum = 0;
        let baseBuyPriceVolSum = 0;
        let baseBuyPriceCount = 0;
        let baseSimpleBuyPriceSum = 0;

        buyBaseCalcRows.forEach(r => {
          const rawVol = Number(String(r['Volume'] || r['Unsigned Volume'] || '').replace(/[^0-9.-]/g, ''));
          const unit = r['Unit'] || r['unit'];
          const price = Number(String(r['Price'] || '').replace(/[^0-9.-]/g, ''));
          if (!isNaN(rawVol)) {
            basePurchaseVolume += rawVol;
            addUnitVolume(basePurchaseVolumeByUnit, rawVol, unit);
          }
          if (!isNaN(price)) {
            if (!isNaN(rawVol) && rawVol > 0) {
              baseWeightedBuyPriceSum += price * rawVol;
              baseBuyPriceVolSum += rawVol;
            }
            baseSimpleBuyPriceSum += price;
            baseBuyPriceCount++;
          }
        });

        let baseWeightedSellPriceSum = 0;
        let baseSellPriceVolSum = 0;
        let baseSellPriceCount = 0;
        let baseSimpleSellPriceSum = 0;

        sellBaseCalcRows.forEach(r => {
          const rawVol = Number(String(r['Volume'] || r['Unsigned Volume'] || '').replace(/[^0-9.-]/g, ''));
          const unit = r['Unit'] || r['unit'];
          const price = Number(String(r['Price'] || '').replace(/[^0-9.-]/g, ''));
          if (!isNaN(rawVol)) {
            baseSalesVolume += rawVol;
            addUnitVolume(baseSalesVolumeByUnit, rawVol, unit);
          }
          if (!isNaN(price)) {
            if (!isNaN(rawVol) && rawVol > 0) {
              baseWeightedSellPriceSum += price * rawVol;
              baseSellPriceVolSum += rawVol;
            }
            baseSimpleSellPriceSum += price;
            baseSellPriceCount++;
          }
        });

        basePurchasePrice = baseBuyPriceVolSum > 0 
          ? baseWeightedBuyPriceSum / baseBuyPriceVolSum 
          : (baseBuyPriceCount > 0 ? baseSimpleBuyPriceSum / baseBuyPriceCount : 0);

        baseSalesPrice = baseSellPriceVolSum > 0 
          ? baseWeightedSellPriceSum / baseSellPriceVolSum 
          : (baseSellPriceCount > 0 ? baseSimpleSellPriceSum / baseSellPriceCount : 0);

        if (buyBaseCalcRows.length > 0) {
          baseBuyTiers = buyBaseCalcRows.map(r => {
            const rawVol = Number(String(r['Volume'] || r['Unsigned Volume'] || '').replace(/[^0-9.-]/g, ''));
            const unit = String(r['Unit'] || r['unit'] || 'MMBtu').trim();
            const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
            const price = Number(String(r['Price'] || '').replace(/[^0-9.-]/g, ''));
            return {
              vol: isNaN(rawVol) ? 0 : rawVol,
              unit,
              val: isNaN(val) ? 0 : val,
              price: isNaN(price) ? 0 : price
            };
          });
        }

        if (sellBaseCalcRows.length > 0) {
          baseSellTiers = sellBaseCalcRows.map(r => {
            const rawVol = Number(String(r['Volume'] || r['Unsigned Volume'] || '').replace(/[^0-9.-]/g, ''));
            const unit = String(r['Unit'] || r['unit'] || 'MMBtu').trim();
            const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
            const price = Number(String(r['Price'] || '').replace(/[^0-9.-]/g, ''));
            return {
              vol: isNaN(rawVol) ? 0 : rawVol,
              unit,
              val: isNaN(val) ? 0 : val,
              price: isNaN(price) ? 0 : price
            };
          });
        }
      }

      return {
        strategyName,
        physicalPnLStatus,
        optimisationStatus,
        unallocatedCargo,
        buyer,
        seller,
        buyIndex,
        sellIndex,
        exposureMonths,
        loadingMonth,
        deliveryMonth,
        basePnL,
        baseValueUSD,
        basePurchaseCost,
        baseSalesRevenue,
        baseShippingRelatedCosts,
        basePurchaseVolume,
        basePurchaseVolumeByUnit,
        baseSalesVolume,
        baseSalesVolumeByUnit,
        basePurchasePrice,
        baseSalesPrice,
        baseBuyTiers,
        baseSellTiers,
        optimizationUplift: optimisationStatus === 'Yes'
          ? (salesRevenue - purchaseCost - Math.abs(shippingRelatedCosts)) - (baseSalesRevenue - basePurchaseCost - Math.abs(baseShippingRelatedCosts))
          : 0,
        purchaseVolume,
        purchaseVolumeByUnit,
        salesVolume,
        salesVolumeByUnit,
        purchasePrice,
        salesPrice,
        purchaseCost,
        salesRevenue,
        shippingRelatedCosts,
        hedgingPnL,
        hedgingVolume,
        hedgingVolumeByUnit,
        paperVolume,
        paperVolumeByUnit,
        hedgingVolumePct: (() => {
          const physBbl = Math.max(purchaseVolumeByUnit['Bbl'] || 0, salesVolumeByUnit['Bbl'] || 0);
          const hedgeBbl = hedgingVolumeByUnit['Bbl'] || 0;

          const physMMBtu = Math.max(purchaseVolumeByUnit['MMBtu'] || 0, salesVolumeByUnit['MMBtu'] || 0);
          const hedgeMMBtu = hedgingVolumeByUnit['MMBtu'] || 0;

          const ratios: number[] = [];

          if (physBbl > 0) {
            ratios.push((hedgeBbl / physBbl) * 100);
          }
          if (physMMBtu > 0) {
            ratios.push((hedgeMMBtu / physMMBtu) * 100);
          }

          if (ratios.length === 0) {
            const totalPhys = Math.max(purchaseVolume, salesVolume);
            if (totalPhys > 0) {
              return (hedgingVolume / totalPhys) * 100;
            }
            return 0;
          }

          return ratios.reduce((a, b) => a + b, 0) / ratios.length;
        })(),
        paperVolumePct: Math.max(purchaseVolume, salesVolume) > 0
          ? (paperVolume / Math.max(purchaseVolume, salesVolume)) * 100
          : 0,
        totalVolume,
        totalVolumeByUnit,
        totalValueUSD,
        totalPnL,
        purchaseCostPnLChange,
        salesRevenuePnLChange,
        shippingCostPnLChange,
        miscCostPnLChange,
        otherCostPnLChange,
        srcCost: shippingRelatedCosts,
        miscCost,
        otherCosts,
        hedgingPnLChange,
        dealCount: underlyingRows.length,
        buyTiers,
        sellTiers,
        underlyingRows
      };
    });
  }, [dateAndYearFilteredRows, groupUpdateTrigger]);

  const allAvailableUnits = useMemo(() => {
    const unitsSet = new Set<string>();
    summaryData.forEach((item: any) => {
      if (item.purchaseVolumeByUnit) {
        Object.keys(item.purchaseVolumeByUnit).forEach(u => unitsSet.add(u));
      }
      if (item.salesVolumeByUnit) {
        Object.keys(item.salesVolumeByUnit).forEach(u => unitsSet.add(u));
      }
    });
    return Array.from(unitsSet).sort();
  }, [summaryData]);

  const availableTrmsGroups = useMemo(() => {
    void groupUpdateTrigger;
    const custom = getCustomGroups();
    const present = new Set<string>(custom);
    summaryData.forEach(item => {
      present.add(getGroupName(item.strategyName));
    });
    present.add('Carved Out');
    present.add('Others');

    const list = Array.from(present);
    const order = ['All', ...DEFAULT_GROUPS, 'Carved Out'];
    list.sort((a, b) => {
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
    return ['All', ...list.filter(g => g !== 'All')];
  }, [summaryData, groupUpdateTrigger]);

  const referenceValidationAlerts = useMemo(() => {
    const list: { row: any; error: string; strategyName: string }[] = [];
    dateAndYearFilteredRows.forEach((r: any) => {
      const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
      const isTargetPort = port === 'hedging lng' || port === 'dh lng' || port === 'dft lng';
      if (isTargetPort) {
        const ref = r['Reference'] || '';
        const validation = validateReferenceFormat(ref);
        if (!validation.isValid) {
          list.push({
            row: r,
            error: validation.error || 'Invalid Reference Format',
            strategyName: String(r['Strategy Name'] || r['Strategy'] || 'Unknown').trim()
          });
        }
      }
    });
    return list;
  }, [dateAndYearFilteredRows]);

  const columns = useMemo(() => {
    const cols = [
      'Strategy Name', 'Physical P&L Bucket', 'Optimisation', 'Unallocated Cargo'
    ];
    if (showBuyer) {
      cols.push('Buyer');
    }
    if (showSeller) {
      cols.push('Seller');
    }
    if (showExposureMonths) {
      cols.push('Exposure Months');
    }
    if (showLoadingMonth) {
      cols.push('Loading Month');
    }
    if (showDeliveryMonth) {
      cols.push('Delivery Month');
    }
    cols.push('Purchase Volume', 'Sales Volume');
    cols.push('Purchase Price');
    if (showBuyIndex) {
      cols.push('Buy Index');
    }
    cols.push('Sales Price');
    if (showSellIndex) {
      cols.push('Sell Index');
    }
    cols.push(
      'Purchase Cost', 'Sales Revenue', 'Shipping Related Costs', 'Physical P&L',
      'Hedging P&L', 'Sum of Value', 'Change in P&L'
    );
    if (showLinesCount) {
      cols.push('Lines Count');
    }
    return cols;
  }, [showBuyer, showSeller, showBuyIndex, showSellIndex, showExposureMonths, showLoadingMonth, showDeliveryMonth, showLinesCount]);

  const numCols = useMemo(() => [
    'Purchase Volume', 'Sales Volume', 'Purchase Price', 'Sales Price',
    'Purchase Cost', 'Sales Revenue', 'Shipping Related Costs', 'Physical P&L',
    'Hedging P&L', 'Sum of Value', 'Change in P&L', 'Lines Count'
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
        else if (col === 'Buyer') val = item.buyer || 'Spot';
        else if (col === 'Seller') val = item.seller || 'Spot';
        else if (col === 'Buy Index') val = item.buyIndex || '—';
        else if (col === 'Sell Index') val = item.sellIndex || '—';
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
        else if (col === 'Physical P&L') val = String((item.salesRevenue - item.purchaseCost) + item.shippingRelatedCosts);
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

    // Filter by Trader (if active)
    if (selectedTraderFilter) {
      result = result.filter(item => {
        return item.underlyingRows && item.underlyingRows.some((row: any) => getRowTraderName(row) === selectedTraderFilter);
      });
    }

    // Filter by Price Index (if active)
    if (selectedIndexFilter) {
      result = result.filter(item => {
        return item.underlyingRows && item.underlyingRows.some((row: any) => getRowPriceIndex(row) === selectedIndexFilter);
      });
    }

    // 1. Global text search
    if (debouncedSearchTerm.trim()) {
      const term = debouncedSearchTerm.toLowerCase();
      result = result.filter(item => {
        return (
          item.strategyName.toLowerCase().includes(term) ||
          item.physicalPnLStatus.toLowerCase().includes(term) ||
          item.optimisationStatus.toLowerCase().includes(term) ||
          item.unallocatedCargo.toLowerCase().includes(term) ||
          (item.buyer && item.buyer.toLowerCase().includes(term)) ||
          (item.seller && item.seller.toLowerCase().includes(term)) ||
          (item.buyIndex && item.buyIndex.toLowerCase().includes(term)) ||
          (item.sellIndex && item.sellIndex.toLowerCase().includes(term)) ||
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
          else if (col === 'Buyer') val = item.buyer || 'Spot';
          else if (col === 'Seller') val = item.seller || 'Spot';
          else if (col === 'Buy Index') val = item.buyIndex || '—';
          else if (col === 'Sell Index') val = item.sellIndex || '—';
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
          else if (col === 'Buyer') { valStr = item.buyer || 'Spot'; valNum = NaN; }
          else if (col === 'Seller') { valStr = item.seller || 'Spot'; valNum = NaN; }
          else if (col === 'Buy Index') { valStr = item.buyIndex || '—'; valNum = NaN; }
          else if (col === 'Sell Index') { valStr = item.sellIndex || '—'; valNum = NaN; }
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
          else if (col === 'Physical P&L') { const p = (item.salesRevenue - item.purchaseCost) + item.shippingRelatedCosts; valStr = String(p); valNum = p; }
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
        else if (col === 'Buyer') { valA = a.buyer || 'Spot'; valB = b.buyer || 'Spot'; }
        else if (col === 'Seller') { valA = a.seller || 'Spot'; valB = b.seller || 'Spot'; }
        else if (col === 'Buy Index') { valA = a.buyIndex || ''; valB = b.buyIndex || ''; }
        else if (col === 'Sell Index') { valA = a.sellIndex || ''; valB = b.sellIndex || ''; }
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
        else if (col === 'Physical P&L') { valA = (a.salesRevenue - a.purchaseCost) + a.shippingRelatedCosts; valB = (b.salesRevenue - b.purchaseCost) + b.shippingRelatedCosts; }
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
  }, [summaryData, debouncedSearchTerm, columnFilters, sortConfig, numCols, activeTrmsGroup, selectedTraderFilter, selectedIndexFilter]);

  const totalPages = useMemo(() => {
    if (pageSize === 0) return 1;
    return Math.max(1, Math.ceil(filteredAndSortedSummaryData.length / pageSize));
  }, [filteredAndSortedSummaryData.length, pageSize]);

  const paginatedSummaryData = useMemo(() => {
    if (pageSize === 0) return filteredAndSortedSummaryData;
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedSummaryData.slice(start, start + pageSize);
  }, [filteredAndSortedSummaryData, currentPage, pageSize]);

  const indexHedgeBreakdown = useMemo(() => {
    const indices = ['Henry Hub', 'TTF', 'JKM', 'NBP', 'Brent', 'JCC', 'Fixed / Other'];
    const dataMap = indices.reduce((acc, idx) => {
      acc[idx] = {
        physBbl: 0,
        physMMBtu: 0,
        // DH LNG
        dhBbl: 0,
        dhMMBtu: 0,
        dhPnL: 0,
        // DFT LNG
        dftBbl: 0,
        dftMMBtu: 0,
        dftPnL: 0,
        // Hedging LNG
        hedgingBbl: 0,
        hedgingMMBtu: 0,
        hedgingPnL: 0
      };
      return acc;
    }, {} as Record<string, {
      physBbl: number;
      physMMBtu: number;
      dhBbl: number;
      dhMMBtu: number;
      dhPnL: number;
      dftBbl: number;
      dftMMBtu: number;
      dftPnL: number;
      hedgingBbl: number;
      hedgingMMBtu: number;
      hedgingPnL: number;
    }>);

    filteredAndSortedSummaryData.forEach(item => {
      item.underlyingRows.forEach((r: any) => {
        const idxName = getRowPriceIndex(r);
        if (!dataMap[idxName]) {
          dataMap[idxName] = {
            physBbl: 0,
            physMMBtu: 0,
            dhBbl: 0,
            dhMMBtu: 0,
            dhPnL: 0,
            dftBbl: 0,
            dftMMBtu: 0,
            dftPnL: 0,
            hedgingBbl: 0,
            hedgingMMBtu: 0,
            hedgingPnL: 0
          };
        }

        const rawVol = Math.abs(Number(String(r['Volume'] || r['Unsigned Volume'] || r['UnsignedVolume'] || '').replace(/[^0-9.-]/g, '')) || 0);
        const val = Number(String(r['Base_Total_Value_USD'] || r['Value'] || r['BaseValue'] || '').replace(/[^0-9.-]/g, ''));
        const unit = r['Unit'] || r['unit'];
        const u = String(unit || 'MMBtu').trim().toUpperCase();
        
        let normUnit = '';
        if (u === 'BBL' || u === 'BBLS' || u === 'BARREL' || u === 'BARRELS') {
          normUnit = 'Bbl';
        } else if (u === 'MMBTU' || u === 'MMBTUS') {
          normUnit = 'MMBtu';
        }

        const internalPortfolio = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
        const isHedgingLng = internalPortfolio === 'hedging lng';
        const isDhLng = internalPortfolio === 'dh lng';
        const isDftLng = internalPortfolio === 'dft lng';
        const isTargetPort = isHedgingLng || isDhLng || isDftLng;
        const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
        const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
        
        if (isTargetPort) {
          if (!isNaN(rawVol)) {
            if (isDhLng) {
              if (normUnit === 'Bbl') dataMap[idxName].dhBbl += rawVol;
              if (normUnit === 'MMBtu') dataMap[idxName].dhMMBtu += rawVol;
            } else if (isDftLng) {
              if (normUnit === 'Bbl') dataMap[idxName].dftBbl += rawVol;
              if (normUnit === 'MMBtu') dataMap[idxName].dftMMBtu += rawVol;
            } else if (isHedgingLng) {
              if (normUnit === 'Bbl') dataMap[idxName].hedgingBbl += rawVol;
              if (normUnit === 'MMBtu') dataMap[idxName].hedgingMMBtu += rawVol;
            }
          }
          if (!isNaN(val)) {
            if (isDhLng) dataMap[idxName].dhPnL += val;
            else if (isDftLng) dataMap[idxName].dftPnL += val;
            else if (isHedgingLng) dataMap[idxName].hedgingPnL += val;
          }
        } else {
          // Physical commodity
          const isCommodity = cflowType === 'commodity' || cflowType === 'physical';
          const isPhys = insType === 'COMM-PHYS';
          const isBaseOrOpt = internalPortfolio === 'base lng' || internalPortfolio.includes('base') ||
                              internalPortfolio === 'optimization lng' || internalPortfolio.includes('optimization');
          
          if (isCommodity && isPhys && isBaseOrOpt) {
            if (!isNaN(rawVol)) {
              if (normUnit === 'Bbl') dataMap[idxName].physBbl += rawVol;
              if (normUnit === 'MMBtu') dataMap[idxName].physMMBtu += rawVol;
            }
          }
        }
      });
    });

    return Object.entries(dataMap).map(([index, stats]) => {
      // DH Ratio
      const dhRatios: number[] = [];
      if (stats.physBbl > 0) dhRatios.push((stats.dhBbl / stats.physBbl) * 100);
      if (stats.physMMBtu > 0) dhRatios.push((stats.dhMMBtu / stats.physMMBtu) * 100);
      const dhRatio = dhRatios.length > 0 ? dhRatios.reduce((a, b) => a + b, 0) / dhRatios.length : 0;

      // DFT Ratio
      const dftRatios: number[] = [];
      if (stats.physBbl > 0) dftRatios.push((stats.dftBbl / stats.physBbl) * 100);
      if (stats.physMMBtu > 0) dftRatios.push((stats.dftMMBtu / stats.physMMBtu) * 100);
      const dftRatio = dftRatios.length > 0 ? dftRatios.reduce((a, b) => a + b, 0) / dftRatios.length : 0;

      // Hedging Ratio
      const hedgingRatios: number[] = [];
      if (stats.physBbl > 0) hedgingRatios.push((stats.hedgingBbl / stats.physBbl) * 100);
      if (stats.physMMBtu > 0) hedgingRatios.push((stats.hedgingMMBtu / stats.physMMBtu) * 100);
      const hedgingRatio = hedgingRatios.length > 0 ? hedgingRatios.reduce((a, b) => a + b, 0) / hedgingRatios.length : 0;

      // Combined (Total) Hedging Ratio
      const totalHedgeBbl = stats.dhBbl + stats.dftBbl + stats.hedgingBbl;
      const totalHedgeMMBtu = stats.dhMMBtu + stats.dftMMBtu + stats.hedgingMMBtu;
      
      const totalRatios: number[] = [];
      if (stats.physBbl > 0) totalRatios.push((totalHedgeBbl / stats.physBbl) * 100);
      if (stats.physMMBtu > 0) totalRatios.push((totalHedgeMMBtu / stats.physMMBtu) * 100);
      const totalHedgeRatio = totalRatios.length > 0 ? totalRatios.reduce((a, b) => a + b, 0) / totalRatios.length : 0;

      return {
        index,
        physBbl: stats.physBbl,
        physMMBtu: stats.physMMBtu,
        
        dhBbl: stats.dhBbl,
        dhMMBtu: stats.dhMMBtu,
        dhPnL: stats.dhPnL,
        dhRatio,

        dftBbl: stats.dftBbl,
        dftMMBtu: stats.dftMMBtu,
        dftPnL: stats.dftPnL,
        dftRatio,

        hedgingBbl: stats.hedgingBbl,
        hedgingMMBtu: stats.hedgingMMBtu,
        hedgingPnL: stats.hedgingPnL,
        hedgingRatio,

        totalHedgeBbl,
        totalHedgeMMBtu,
        totalHedgePnL: stats.dhPnL + stats.dftPnL + stats.hedgingPnL,
        totalHedgeRatio
      };
    }).filter(d => 
      d.physBbl > 0 || d.physMMBtu > 0 || 
      d.dhBbl > 0 || d.dftBbl > 0 || d.hedgingBbl > 0 || 
      d.dhMMBtu > 0 || d.dftMMBtu > 0 || d.hedgingMMBtu > 0
    );
  }, [filteredAndSortedSummaryData]);

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

  // Sub-table per-column filter handlers
  const handleApplySubConditionFilter = (strategyName: string, col: string, condition: string, val1: string, val2: string) => {
    setSubTableColumnFilters(prev => {
      const stratFilters = prev[strategyName] || {};
      const current = stratFilters[col] || { selectedValues: new Set<string>(), condition: 'none', conditionValue1: '', conditionValue2: '' };
      return {
        ...prev,
        [strategyName]: {
          ...stratFilters,
          [col]: {
            ...current,
            condition,
            conditionValue1: val1,
            conditionValue2: val2
          }
        }
      };
    });
  };

  const handleToggleSubUniqueValueCheckbox = (strategyName: string, col: string, val: string) => {
    setSubTableColumnFilters(prev => {
      const stratFilters = prev[strategyName] || {};
      const current = stratFilters[col] || { selectedValues: new Set<string>(), condition: 'none', conditionValue1: '', conditionValue2: '' };
      const newSel = new Set(current.selectedValues);
      if (newSel.has(val)) {
        newSel.delete(val);
      } else {
        newSel.add(val);
      }
      return {
        ...prev,
        [strategyName]: {
          ...stratFilters,
          [col]: {
            ...current,
            selectedValues: newSel
          }
        }
      };
    });
  };

  const handleSelectAllSubUniqueValues = (
    strategyName: string,
    col: string,
    uniqueVals: { value: string; count: number }[],
    selectAll: boolean
  ) => {
    setSubTableColumnFilters(prev => {
      const stratFilters = prev[strategyName] || {};
      const current = stratFilters[col] || { selectedValues: new Set<string>(), condition: 'none', conditionValue1: '', conditionValue2: '' };
      const newSel = new Set<string>();
      if (!selectAll) {
        const term = (subFilterSearchTerms[strategyName]?.[col] || '').toLowerCase();
        uniqueVals.forEach(uv => {
          if (uv.value.toLowerCase().includes(term)) {
            newSel.add(uv.value);
          }
        });
      }
      return {
        ...prev,
        [strategyName]: {
          ...stratFilters,
          [col]: {
            ...current,
            selectedValues: newSel
          }
        }
      };
    });
  };

  const handleClearSubColumnFilter = (strategyName: string, col: string) => {
    setSubTableColumnFilters(prev => {
      const stratFilters = { ...(prev[strategyName] || {}) };
      delete stratFilters[col];
      return {
        ...prev,
        [strategyName]: stratFilters
      };
    });
  };

  const handleSubSortChange = (strategyName: string, col: string, dir: 'asc' | 'desc' | null) => {
    setSubTableSortConfig(prev => ({
      ...prev,
      [strategyName]: { column: col, direction: dir }
    }));
  };

  const handleSubSortToggle = (strategyName: string, col: string) => {
    setSubTableSortConfig(prev => {
      const current = prev[strategyName];
      if (!current || current.column !== col) {
        return { ...prev, [strategyName]: { column: col, direction: 'asc' } };
      }
      if (current.direction === 'asc') {
        return { ...prev, [strategyName]: { column: col, direction: 'desc' } };
      }
      return { ...prev, [strategyName]: { column: col, direction: null } };
    });
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

    let aggregatePurchaseVolume = 0;
    const aggregatePurchaseVolumeByUnit: { [unit: string]: number } = {};
    let aggregateSalesVolume = 0;
    const aggregateSalesVolumeByUnit: { [unit: string]: number } = {};
    let aggregatePurchaseCost = 0;
    let aggregatePurchaseCostPnLChange = 0;

    let aggregateSalesRevenue = 0;
    let aggregateSalesRevenuePnLChange = 0;

    let aggregateShippingCosts = 0;
    let aggregateShippingCostPnLChange = 0;
    let aggregateMiscCost = 0;
    let aggregateMiscCostPnLChange = 0;

    let aggregateHedgingPnL = 0;
    let aggregateHedgingPnLChange = 0;

    let aggregateTotalPnLChange = 0;

    let aggregateHedgingVolume = 0;
    const aggregateHedgingVolumeByUnit: { [unit: string]: number } = {};

    filteredAndSortedSummaryData.forEach(item => {
      if (item.physicalPnLStatus === 'Realized') realized++;
      if (item.optimisationStatus === 'Yes') optYes++;
      if (item.optimisationStatus === 'Alert') optAlert++;
      if (item.unallocatedCargo === 'Matched') matchedCargo++;
      else if (item.unallocatedCargo === 'Open on Sell Leg') openSell++;
      else if (item.unallocatedCargo === 'Open on Buy Leg') openBuy++;

      aggregatePurchaseVolume += item.purchaseVolume;
      Object.entries(item.purchaseVolumeByUnit || {}).forEach(([unit, val]) => {
        aggregatePurchaseVolumeByUnit[unit] = (aggregatePurchaseVolumeByUnit[unit] || 0) + val;
      });
      aggregateSalesVolume += item.salesVolume;
      Object.entries(item.salesVolumeByUnit || {}).forEach(([unit, val]) => {
        aggregateSalesVolumeByUnit[unit] = (aggregateSalesVolumeByUnit[unit] || 0) + val;
      });

      aggregatePurchaseCost += item.purchaseCost;
      aggregatePurchaseCostPnLChange += (item.purchaseCostPnLChange || 0);

      aggregateSalesRevenue += item.salesRevenue;
      aggregateSalesRevenuePnLChange += (item.salesRevenuePnLChange || 0);

      aggregateShippingCosts += (item.shippingRelatedCosts || item.srcCost || 0);
      aggregateShippingCostPnLChange += (item.shippingCostPnLChange || 0);

      aggregateMiscCost += (item.miscCost || 0);
      aggregateMiscCostPnLChange += (item.miscCostPnLChange || 0);

      aggregateHedgingPnL += item.hedgingPnL;
      aggregateHedgingPnLChange += (item.hedgingPnLChange || 0);

      aggregateTotalPnLChange += (item.totalPnL || 0);

      aggregateHedgingVolume += item.hedgingVolume || 0;
      Object.entries(item.hedgingVolumeByUnit || {}).forEach(([unit, val]) => {
        aggregateHedgingVolumeByUnit[unit] = (aggregateHedgingVolumeByUnit[unit] || 0) + val;
      });
    });

    const aggregateOtherCosts = aggregateShippingCosts + aggregateMiscCost;
    const aggregateOtherCostPnLChange = aggregateShippingCostPnLChange + aggregateMiscCostPnLChange;

    // Physical P&L (Excl. Hedging): (Revenue - Cost) + Other Costs (SRC + Misc)
    const aggregatePhysicalPnL = (aggregateSalesRevenue - aggregatePurchaseCost) + aggregateOtherCosts;
    const aggregatePhysicalPnLChange = aggregateSalesRevenuePnLChange + aggregatePurchaseCostPnLChange + aggregateOtherCostPnLChange;

    // Aggregate P&L tracks (Sales - Purchase) + Hedging + Other Costs
    const aggregatePnL = aggregateSalesRevenue - aggregatePurchaseCost + aggregateOtherCosts + aggregateHedgingPnL;

    const maxAggPhysicalVol = Math.max(aggregatePurchaseVolume, aggregateSalesVolume) || aggregatePurchaseVolume || aggregateSalesVolume || 1;

    return {
      total,
      realized,
      unrealized: total - realized,
      optYes,
      optAlert,
      matchedCargo,
      openSell,
      openBuy,
      aggregatePhysicalPnL,
      aggregatePhysicalPnLChange,
      aggregatePnL,
      aggregatePurchaseVolume,
      aggregatePurchaseVolumeByUnit,
      aggregateSalesVolume,
      aggregateSalesVolumeByUnit,
      aggregatePurchaseCost,
      aggregatePurchaseCostPnLChange,
      aggregateSalesRevenue,
      aggregateSalesRevenuePnLChange,
      aggregateShippingCosts,
      aggregateShippingCostPnLChange,
      aggregateMiscCost,
      aggregateMiscCostPnLChange,
      aggregateOtherCosts,
      aggregateOtherCostPnLChange,
      aggregateHedgingPnL,
      aggregateHedgingPnLChange,
      aggregateHedgingVolume,
      aggregateHedgingVolumeByUnit,
      aggregateHedgingVolumePct: (aggregateHedgingVolume / maxAggPhysicalVol) * 100,
      aggregateTotalPnLChange
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
    let targetMode: 'base_lng' | 'shipping_costs' | 'other_costs' | 'misc_costs' | 'hedging' | 'all' | 'buy_commodity' | 'sell_commodity' = 'base_lng';
    if (columnClicked === 'Shipping Related Costs' || columnClicked === 'Other Costs' || columnClicked === 'SRC') {
      targetMode = 'other_costs';
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

  const toggleRowExpansion = (sn: string, forceOpen?: boolean) => {
    setExpandedStrategies(prev => {
      const next = new Set(prev);
      if (forceOpen) {
        next.add(sn);
      } else if (next.has(sn)) {
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
  const getFilteredUnderlyingRows = (rowsList: any[], mode: 'base_lng' | 'shipping_costs' | 'other_costs' | 'misc_costs' | 'hedging' | 'all' | 'buy_commodity' | 'sell_commodity') => {
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
      case 'other_costs':
        return rowsList.filter(r => {
          const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
          const isOther = isSrcRow(r) || isMiscFeeRow(r);
          if (hasOpt) {
            return isOther && (port === 'optimization lng' || port.includes('optimization'));
          }
          return isOther;
        });
      case 'shipping_costs':
        return rowsList.filter(r => {
          const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
          const isShipping = isSrcRow(r);
          if (hasOpt) {
            return isShipping && (port === 'optimization lng' || port.includes('optimization'));
          }
          return isShipping;
        });
      case 'misc_costs':
        return rowsList.filter(r => {
          const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
          const isMisc = isMiscFeeRow(r);
          if (hasOpt) {
            return isMisc && (port === 'optimization lng' || port.includes('optimization'));
          }
          return isMisc;
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
      'Buyer',
      'Seller',
      'Exposure Months',
      'Loading Month',
      'Delivery Month',
      'Purchase Volume', 
      'Sales Volume', 
      'Purchase Price', 
      'Buy Index',
      'Sales Price', 
      'Sell Index',
      'Purchase Cost', 
      'Sales Revenue', 
      'Shipping Related Costs',
      'Hedging P&L',
      'Physical P&L',
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
        `"${(item.buyer || 'Spot').replace(/"/g, '""')}"`,
        `"${(item.seller || 'Spot').replace(/"/g, '""')}"`,
        `"${(item.exposureMonths || '').replace(/"/g, '""')}"`,
        `"${(item.loadingMonth || '').replace(/"/g, '""')}"`,
        `"${(item.deliveryMonth || '').replace(/"/g, '""')}"`,
        `"${formatUnitVolumes(item.purchaseVolumeByUnit, ' | ', 'buy')}"`,
        `"${formatUnitVolumes(item.salesVolumeByUnit, ' | ', 'sell')}"`,
        item.purchasePrice,
        `"${(item.buyIndex || '—').replace(/"/g, '""')}"`,
        item.salesPrice,
        `"${(item.sellIndex || '—').replace(/"/g, '""')}"`,
        item.purchaseCost,
        item.salesRevenue,
        item.shippingRelatedCosts,
        item.hedgingPnL,
        (item.salesRevenue - item.purchaseCost) + item.shippingRelatedCosts,
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
    if (col === 'Buyer') val = item.buyer || 'Spot';
    else if (col === 'Seller') val = item.seller || 'Spot';
    else if (col === 'Buy Index') val = item.buyIndex || '—';
    else if (col === 'Sell Index') val = item.sellIndex || '—';
    else if (col === 'Purchase Volume') val = item.purchaseVolume;
    else if (col === 'Sales Volume') val = item.salesVolume;
    else if (col === 'Purchase Price') val = item.purchasePrice;
    else if (col === 'Sales Price') val = item.salesPrice;
    else if (col === 'Purchase Cost') val = item.purchaseCost;
    else if (col === 'Sales Revenue') val = item.salesRevenue;
    else if (col === 'Shipping Related Costs') val = item.shippingRelatedCosts;
    else if (col === 'Hedging P&L') val = item.hedgingPnL;
    else if (col === 'Physical P&L') val = (item.salesRevenue - item.purchaseCost) + item.shippingRelatedCosts;
    else if (col === 'Sum of Value') val = item.totalValueUSD;
    else if (col === 'Change in P&L') val = item.totalPnL;
    else if (col === 'Lines Count') val = item.dealCount;
    else if (col === 'Exposure Months') val = item.exposureMonths;
    else if (col === 'Loading Month') val = item.loadingMonth;
    else if (col === 'Delivery Month') val = item.deliveryMonth;

    if (col === 'Buy Index') {
      if (item.buyTiers && item.buyTiers.length >= 2) {
        const i1 = item.buyTiers[0].indexName || '—';
        const i2 = item.buyTiers[1].indexName || '—';
        return (
          <div className="flex flex-col text-left">
            <span className="text-[10px] text-emerald-400 font-mono font-medium truncate max-w-[180px]" title={i1}>
              {i1} <span className="text-[9px] text-slate-500 font-normal">(T1)</span>
            </span>
            <span className="text-[10px] text-emerald-400 font-mono font-medium truncate max-w-[180px]" title={i2}>
              {i2} <span className="text-[9px] text-slate-500 font-normal">(T2)</span>
            </span>
          </div>
        );
      }
      return <span className="text-[11px] text-emerald-400/90 font-mono truncate max-w-[180px] block" title={String(item.buyIndex || '—')}>{item.buyIndex || '—'}</span>;
    }

    if (col === 'Sell Index') {
      if (item.sellTiers && item.sellTiers.length >= 2) {
        const i1 = item.sellTiers[0].indexName || '—';
        const i2 = item.sellTiers[1].indexName || '—';
        return (
          <div className="flex flex-col text-left">
            <span className="text-[10px] text-blue-400 font-mono font-medium truncate max-w-[180px]" title={i1}>
              {i1} <span className="text-[9px] text-slate-500 font-normal">(T1)</span>
            </span>
            <span className="text-[10px] text-blue-400 font-mono font-medium truncate max-w-[180px]" title={i2}>
              {i2} <span className="text-[9px] text-slate-500 font-normal">(T2)</span>
            </span>
          </div>
        );
      }
      return <span className="text-[11px] text-blue-400/90 font-mono truncate max-w-[180px] block" title={String(item.sellIndex || '—')}>{item.sellIndex || '—'}</span>;
    }

    if (numCols.includes(col)) {
      // Custom visual for two-tier purchase pricing
      if (
        item.buyTiers && 
        item.buyTiers.length === 2 && 
        (col === 'Purchase Volume' || col === 'Purchase Price' || col === 'Purchase Cost')
      ) {
        if (col === 'Purchase Volume') {
          const v1 = item.buyTiers[0].vol;
          const u1 = item.buyTiers[0].unit || 'MMBtu';
          const v2 = item.buyTiers[1].vol;
          const u2 = item.buyTiers[1].unit || 'MMBtu';
          return (
            <div className="flex flex-col items-end text-right">
              <span className="text-[10px] text-slate-300 font-medium">
                +{v1.toLocaleString(undefined, { maximumFractionDigits: 0 })} {u1} <span className="text-[9px] text-slate-500 font-normal">(T1)</span>
              </span>
              <span className="text-[10px] text-slate-300 font-medium">
                +{v2.toLocaleString(undefined, { maximumFractionDigits: 0 })} {u2} <span className="text-[9px] text-slate-500 font-normal">(T2)</span>
              </span>
              <span className="text-[9px] text-indigo-400 font-bold border-t border-slate-800/80 mt-0.5 pt-0.5 w-full">
                Σ {formatUnitVolumes(item.purchaseVolumeByUnit, ' | ', 'buy')}
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
          const u1 = item.sellTiers[0].unit || 'MMBtu';
          const v2 = item.sellTiers[1].vol;
          const u2 = item.sellTiers[1].unit || 'MMBtu';
          return (
            <div className="flex flex-col items-end text-right">
              <span className="text-[10px] text-slate-300 font-medium">
                {Math.abs(v1).toLocaleString(undefined, { maximumFractionDigits: 0 })} {u1} <span className="text-[9px] text-slate-500 font-normal">(T1)</span>
              </span>
              <span className="text-[10px] text-slate-300 font-medium">
                {Math.abs(v2).toLocaleString(undefined, { maximumFractionDigits: 0 })} {u2} <span className="text-[9px] text-slate-500 font-normal">(T2)</span>
              </span>
              <span className="text-[9px] text-indigo-400 font-bold border-t border-slate-800/80 mt-0.5 pt-0.5 w-full">
                Σ {formatUnitVolumes(item.salesVolumeByUnit, ' | ', 'sell')}
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
        const map = col === 'Purchase Volume' ? item.purchaseVolumeByUnit : item.salesVolumeByUnit;
        return formatUnitVolumes(map, ' | ', col === 'Purchase Volume' ? 'buy' : 'sell');
      }
      if (col === 'Hedging Volume') {
        return formatUnitVolumes(item.hedgingVolumeByUnit, ' | ', 'neutral');
      }
      if (col === 'Hedging Ratio (%)') {
        return val === 0 ? '0.0%' : `${val.toFixed(1)}%`;
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
      if (col === 'Physical P&L') {
        if (val > 0) {
          return (
            <span className="inline-flex items-center gap-1 font-extrabold text-emerald-400 font-mono text-[11px] tracking-wide bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/30" title="Physical P&L before hedging: (Sales Revenue - Purchase Cost) + Shipping Costs">
              <span>+${Math.abs(val).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </span>
          );
        } else if (val < 0) {
          return (
            <span className="inline-flex items-center gap-1 font-extrabold text-rose-400 font-mono text-[11px] tracking-wide bg-rose-950/40 px-2 py-0.5 rounded border border-rose-800/30" title="Physical P&L before hedging: (Sales Revenue - Purchase Cost) + Shipping Costs">
              <span>-${Math.abs(val).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </span>
          );
        } else {
          return (
            <span className="inline-flex items-center gap-1 font-semibold text-slate-400 font-mono text-[11px] bg-slate-900/50 px-2 py-0.5 rounded border border-slate-800/30">
              <span>$0</span>
            </span>
          );
        }
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
          <div className="grid grid-cols-1 gap-4">
            
            {/* Card 1: Identity & Configuration */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">1. Identity &amp; Status</h3>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
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
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Hedging Volume</span>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs text-amber-600 font-bold">{formatUnitVolumes(item.hedgingVolumeByUnit, ' | ', 'neutral')}</div>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Hedging Ratio</span>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs text-amber-600 font-bold">{(item.hedgingVolumePct || 0).toFixed(1)}%</div>
                </div>
              </div>
            </div>

            {/* Comparison Panels for Base vs Optimized Flow */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              
              {/* Card Left: Standard (Base) Scenario Flow Details */}
              <div 
                onClick={() => {
                  setDrilldownSubFilter('base');
                  toast.success("Filtered trade logs below to Standard (Base) Scenario items!");
                }}
                className={`bg-white p-5 rounded-xl border transition-all cursor-pointer shadow-sm relative overflow-hidden group ${
                  drilldownSubFilter === 'base'
                    ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/10'
                    : 'border-slate-200 hover:border-blue-350 hover:shadow-md'
                }`}
              >
                {/* Header badge */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                    drilldownSubFilter === 'base' ? 'bg-blue-600 text-white font-black' : 'bg-slate-100 text-slate-500 font-mono'
                  }`}>
                    {drilldownSubFilter === 'base' ? 'Active Filter' : 'Click to Filter Logs'}
                  </span>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-400"></div>
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      Standard (Base) Scenario Flow
                    </h3>
                  </div>

                  <div className="space-y-4">
                    {/* Loading/Purchase section */}
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-150">
                      <span className="text-[9px] font-bold text-slate-450 uppercase tracking-wide block mb-1.5">Loading &amp; Purchase (Buy Leg)</span>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <span className="text-[8px] text-slate-400 uppercase font-mono block">Base Volume</span>
                          <span className="font-mono text-[11px] font-extrabold text-slate-700">{formatUnitVolumes(item.basePurchaseVolumeByUnit, ' | ', 'buy')}</span>
                        </div>
                        <div>
                          <span className="text-[8px] text-slate-400 uppercase font-mono block">Weighted Price</span>
                          <span className="font-mono text-[11px] font-extrabold text-slate-700">${(item.basePurchasePrice || 0).toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-[8px] text-slate-400 uppercase font-mono block">Purchase Cost</span>
                          <span className="font-mono text-[11px] font-extrabold text-slate-700">${(item.basePurchaseCost || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>
                      {item.baseBuyTiers && item.baseBuyTiers.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-200/50">
                          <span className="text-[8px] uppercase font-bold text-slate-400 block mb-1">Base Purchase Breakdown:</span>
                          <div className="space-y-0.5">
                            {item.baseBuyTiers.map((t: any, idx: number) => (
                              <div key={idx} className="flex justify-between text-[9px] font-mono text-slate-500">
                                <span>Tier {idx + 1}: {t.vol.toLocaleString()} {t.unit || 'MMBtu'}</span>
                                <span>Price: ${t.price.toFixed(4)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Delivery/Sales section */}
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-150">
                      <span className="text-[9px] font-bold text-slate-450 uppercase tracking-wide block mb-1.5">Delivery &amp; Sales (Sell Leg)</span>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <span className="text-[8px] text-slate-400 uppercase font-mono block">Base Volume</span>
                          <span className="font-mono text-[11px] font-extrabold text-slate-700">{formatUnitVolumes(item.baseSalesVolumeByUnit, ' | ', 'sell')}</span>
                        </div>
                        <div>
                          <span className="text-[8px] text-slate-400 uppercase font-mono block">Weighted Price</span>
                          <span className="font-mono text-[11px] font-extrabold text-slate-700">${(item.baseSalesPrice || 0).toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-[8px] text-slate-400 uppercase font-mono block">Sales Revenue</span>
                          <span className="font-mono text-[11px] font-extrabold text-slate-700">${(item.baseSalesRevenue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>
                      {item.baseSellTiers && item.baseSellTiers.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-200/50">
                          <span className="text-[8px] uppercase font-bold text-slate-400 block mb-1">Base Sales Breakdown:</span>
                          <div className="space-y-0.5">
                            {item.baseSellTiers.map((t: any, idx: number) => (
                              <div key={idx} className="flex justify-between text-[9px] font-mono text-slate-500">
                                <span>Tier {idx + 1}: {t.vol.toLocaleString()} {t.unit || 'MMBtu'}</span>
                                <span>Price: ${t.price.toFixed(4)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Operations & Net Baseline P&L */}
                    <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-[8px] text-slate-500 block uppercase font-mono font-bold">Shipping Cost</span>
                        <span className="font-mono text-xs font-semibold text-purple-600">${(item.baseShippingRelatedCosts || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-500 block uppercase font-mono font-bold">Net P&amp;L Baseline</span>
                        <span className={`font-mono text-xs font-black ${item.basePnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {item.basePnL >= 0 ? '+' : '-'}${Math.abs(item.basePnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    </div>

                  </div>
                </div>
              </div>

              {/* Card Right: Optimized Scenario Flow Details */}
              <div 
                onClick={() => {
                  setDrilldownSubFilter('optimized');
                  toast.success("Filtered trade logs below to Optimized Scenario items!");
                }}
                className={`bg-white p-5 rounded-xl border transition-all cursor-pointer shadow-sm relative overflow-hidden group ${
                  drilldownSubFilter === 'optimized'
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/10'
                    : 'border-slate-200 hover:border-emerald-350 hover:shadow-md'
                }`}
              >
                {/* Header badge */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                    drilldownSubFilter === 'optimized' ? 'bg-emerald-600 text-white font-black' : 'bg-slate-100 text-slate-500 font-mono'
                  }`}>
                    {drilldownSubFilter === 'optimized' ? 'Active Filter' : 'Click to Filter Logs'}
                  </span>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                    <h3 className="text-xs font-black text-slate-850 uppercase tracking-wider">
                      Optimized Scenario Flow
                    </h3>
                  </div>

                  <div className="space-y-4">
                    {/* Loading/Purchase section */}
                    <div className="bg-emerald-50/20 p-3 rounded-lg border border-emerald-100">
                      <span className="text-[9px] font-bold text-emerald-800 uppercase tracking-wide block mb-1.5">Loading &amp; Purchase (Buy Leg)</span>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <span className="text-[8px] text-emerald-600 uppercase font-mono block">Optimized Volume</span>
                          <span className="font-mono text-[11px] font-extrabold text-slate-700">{formatUnitVolumes(item.purchaseVolumeByUnit, ' | ', 'buy')}</span>
                        </div>
                        <div>
                          <span className="text-[8px] text-emerald-600 uppercase font-mono block">Weighted Price</span>
                          <span className="font-mono text-[11px] font-extrabold text-slate-700">${(item.purchasePrice || 0).toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-[8px] text-emerald-600 uppercase font-mono block">Purchase Cost</span>
                          <span className="font-mono text-[11px] font-extrabold text-slate-700">${(item.purchaseCost || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>
                      {item.buyTiers && item.buyTiers.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-emerald-100/50">
                          <span className="text-[8px] uppercase font-bold text-emerald-800 block mb-1">Optimized Purchase Breakdown:</span>
                          <div className="space-y-0.5">
                            {item.buyTiers.map((t: any, idx: number) => (
                              <div key={idx} className="flex justify-between text-[9px] font-mono text-slate-500">
                                <span>Tier {idx + 1}: {t.vol.toLocaleString()} {t.unit || 'MMBtu'}</span>
                                <span>Price: ${t.price.toFixed(4)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Delivery/Sales section */}
                    <div className="bg-emerald-50/20 p-3 rounded-lg border border-emerald-100">
                      <span className="text-[9px] font-bold text-emerald-800 uppercase tracking-wide block mb-1.5">Delivery &amp; Sales (Sell Leg)</span>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <span className="text-[8px] text-emerald-600 uppercase font-mono block">Optimized Volume</span>
                          <span className="font-mono text-[11px] font-extrabold text-slate-700">{formatUnitVolumes(item.salesVolumeByUnit, ' | ', 'sell')}</span>
                        </div>
                        <div>
                          <span className="text-[8px] text-emerald-600 uppercase font-mono block">Weighted Price</span>
                          <span className="font-mono text-[11px] font-extrabold text-slate-700">${(item.salesPrice || 0).toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-[8px] text-emerald-600 uppercase font-mono block">Sales Revenue</span>
                          <span className="font-mono text-[11px] font-extrabold text-slate-700">${(item.salesRevenue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>
                      {item.sellTiers && item.sellTiers.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-emerald-100/50">
                          <span className="text-[8px] uppercase font-bold text-emerald-800 block mb-1">Optimized Sales Breakdown:</span>
                          <div className="space-y-0.5">
                            {item.sellTiers.map((t: any, idx: number) => (
                              <div key={idx} className="flex justify-between text-[9px] font-mono text-slate-500">
                                <span>Tier {idx + 1}: {t.vol.toLocaleString()} {t.unit || 'MMBtu'}</span>
                                <span>Price: ${t.price.toFixed(4)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Operations & Net Optimized P&L */}
                    <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-[8px] text-slate-500 block uppercase font-mono font-bold">Shipping Cost</span>
                        <span className="font-mono text-xs font-semibold text-purple-600">${(item.shippingRelatedCosts || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-500 block uppercase font-mono font-bold">Hedging P&amp;L</span>
                        <span className={`font-mono text-xs font-bold ${(item.hedgingPnL || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {(item.hedgingPnL || 0) >= 0 ? '+' : ''}${(item.hedgingPnL || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-500 block uppercase font-mono font-bold">Net P&amp;L Optimized</span>
                        <span className={`font-mono text-xs font-black ${item.totalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {item.totalPnL >= 0 ? '+' : '-'}${Math.abs(item.totalPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    </div>

                  </div>
                </div>
              </div>

            </div>

          </div>

          {/* Drill-down Trade-Level Auditing Table */}
          {(() => {
            const filteredRowsForStrat = rowsForStrat.filter(r => {
              if (drilldownSubFilter === 'all') return true;
              const portfolio = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
              const isBase = portfolio === 'base lng' || portfolio.includes('base');
              if (drilldownSubFilter === 'base') return isBase;
              if (drilldownSubFilter === 'optimized') return !isBase;
              return true;
            });

            return (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div>
                      <h3 className="text-xs font-bold text-slate-750 uppercase tracking-widest flex items-center gap-1.5">
                        <Database className="w-4 h-4 text-blue-600" />
                        Trade-Level Audit Trail ({filteredRowsForStrat.length} of {rowsForStrat.length} Records)
                      </h3>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">Inspect raw TRMS line item allocations comprising this strategy.</p>
                    </div>

                    {drilldownSubFilter !== 'all' && (
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border ${
                          drilldownSubFilter === 'base' ? 'bg-slate-55 border-slate-300 text-slate-600' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        }`}>
                          Filter: {drilldownSubFilter === 'base' ? 'Standard (Base) Scenario' : 'Optimized Scenario'}
                        </span>
                        <button
                          onClick={() => {
                            setDrilldownSubFilter('all');
                            toast.success("Showing all trade log records!");
                          }}
                          className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-[9px] font-bold text-slate-600 transition-colors cursor-pointer"
                        >
                          Clear Filter
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Excel Download button for this strategy */}
                  <button
                    onClick={() => {
                      try {
                        const ws = XLSX.utils.json_to_sheet(filteredRowsForStrat);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, "Audit Trail");
                        XLSX.writeFile(wb, `TRMS_Audit_${item.strategyName}_${drilldownSubFilter}.xlsx`);
                        toast.success(`Exported ${drilldownSubFilter} audit trail for ${item.strategyName}`);
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
                      {filteredRowsForStrat.map((r, i) => {
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
                          <tr key={i} className="hover:bg-slate-55 transition-colors">
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
                            <td className="py-2 px-3 text-right text-slate-900 font-semibold">{vol.toLocaleString(undefined, { maximumFractionDigits: 0 })} {r['Unit'] || r['unit'] || ''}</td>
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
            );
          })()}
        </div>
      );
    }

    // B. Main Executive Dashboard Overview
    const optimizedStrategies = filteredAndSortedSummaryData.filter(item => item.optimisationStatus === 'Yes');

    const optimizationKpis = {
      count: optimizedStrategies.length,
      totalBasePnL: optimizedStrategies.reduce((acc, item) => acc + ((item.baseSalesRevenue || 0) - (item.basePurchaseCost || 0) - Math.abs(item.baseShippingRelatedCosts || 0)), 0),
      totalOptimizedPnL: optimizedStrategies.reduce((acc, item) => acc + ((item.salesRevenue || 0) - (item.purchaseCost || 0) - Math.abs(item.shippingRelatedCosts || 0)), 0),
      netUplift: optimizedStrategies.reduce((acc, item) => acc + (item.optimizationUplift || 0), 0),
      totalVolume: optimizedStrategies.reduce((acc, item) => acc + (item.purchaseVolume || 0) + (item.salesVolume || 0), 0)
    };

    const optimizationChartData = optimizedStrategies.map(item => {
      const baseNetVal = (item.baseSalesRevenue || 0) - (item.basePurchaseCost || 0) - Math.abs(item.baseShippingRelatedCosts || 0);
      const optNetVal = (item.salesRevenue || 0) - (item.purchaseCost || 0) - Math.abs(item.shippingRelatedCosts || 0);
      return {
        name: item.strategyName,
        "Base P&L": baseNetVal,
        "Optimized P&L": optNetVal,
        "Uplift": item.optimizationUplift || 0
      };
    });

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
            <button
              onClick={() => setDashboardTab('volume_exposure')}
              className={`flex-1 sm:flex-none px-4 py-2 text-center text-xs font-extrabold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                dashboardTab === 'volume_exposure'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Ship className="w-3.5 h-3.5 text-sky-500" />
              <span>Volume &amp; Seasonal Exposure</span>
            </button>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">EOD Report Active</span>
            <div className="h-4 w-px bg-slate-300" />
            <div className="flex items-center gap-1.5 animate-fadeIn">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 font-mono">Unit Filter:</span>
              <div className="flex bg-slate-200/80 p-0.5 rounded-lg border border-slate-300/60 shadow-xs">
                {['ALL', ...allAvailableUnits].map(unit => (
                  <button
                    key={unit}
                    onClick={() => setSelectedUnit(unit)}
                    className={`px-2.5 py-1 text-[10px] font-mono font-black rounded-md transition-all cursor-pointer ${
                      selectedUnit === unit
                        ? 'bg-white text-slate-950 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {unit}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ACTIVE DASHBOARD FILTERS BANNER */}
        {(Object.keys(columnFilters).length > 0 || selectedTraderFilter !== null || selectedIndexFilter !== null || searchTerm !== '') && (
          <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-3 flex flex-col sm:flex-row gap-3 items-center justify-between shadow-sm animate-fadeIn">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-extrabold text-blue-800 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Filter className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                Active Filters:
              </span>
              
              {/* Search text */}
              {searchTerm && (
                <span className="text-[10px] bg-white border border-blue-150 text-blue-800 px-2.5 py-1 rounded-xl flex items-center gap-1.5 shadow-xs font-semibold">
                  <span className="text-slate-400 font-mono text-[9px] uppercase">Search:</span>
                  <span>"{searchTerm}"</span>
                  <button 
                    onClick={() => setSearchTerm('')}
                    className="p-0.5 hover:bg-slate-100 text-slate-400 hover:text-rose-500 rounded-full transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {/* Trader */}
              {selectedTraderFilter && (
                <span className="text-[10px] bg-white border border-blue-150 text-blue-800 px-2.5 py-1 rounded-xl flex items-center gap-1.5 shadow-xs font-semibold">
                  <span className="text-slate-400 font-mono text-[9px] uppercase">Trader:</span>
                  <span>{selectedTraderFilter}</span>
                  <button 
                    onClick={() => setSelectedTraderFilter(null)}
                    className="p-0.5 hover:bg-slate-100 text-slate-400 hover:text-rose-500 rounded-full transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {/* Price Index */}
              {selectedIndexFilter && (
                <span className="text-[10px] bg-white border border-blue-150 text-blue-800 px-2.5 py-1 rounded-xl flex items-center gap-1.5 shadow-xs font-semibold">
                  <span className="text-slate-400 font-mono text-[9px] uppercase">Index Pricing:</span>
                  <span>{selectedIndexFilter}</span>
                  <button 
                    onClick={() => setSelectedIndexFilter(null)}
                    className="p-0.5 hover:bg-slate-100 text-slate-400 hover:text-rose-500 rounded-full transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {/* Column Filters */}
              {Object.entries(columnFilters).map(([col, filter]) => {
                const hasCheckedValues = filter.selectedValues.size > 0;
                const hasCondition = filter.condition !== 'none';
                if (!hasCheckedValues && !hasCondition) return null;
                return (
                  <span key={col} className="text-[10px] bg-white border border-blue-150 text-blue-800 px-2.5 py-1 rounded-xl flex items-center gap-1.5 shadow-xs font-semibold">
                    <span className="text-slate-400 font-mono text-[9px] uppercase">{col}:</span>
                    <span>
                      {hasCondition 
                        ? `${filter.condition}(${filter.conditionValue1}${filter.conditionValue2 ? `, ${filter.conditionValue2}` : ''})` 
                        : Array.from(filter.selectedValues).join(', ')}
                    </span>
                    <button 
                      onClick={() => {
                        setColumnFilters(prev => {
                          const next = { ...prev };
                          delete next[col];
                          return next;
                        });
                      }}
                      className="p-0.5 hover:bg-slate-100 text-slate-400 hover:text-rose-500 rounded-full transition-colors cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>

            <button 
              onClick={() => {
                setSearchTerm('');
                setSelectedTraderFilter(null);
                setSelectedIndexFilter(null);
                setColumnFilters({});
                toast.success("All dashboard filters cleared successfully");
              }}
              className="text-[10px] font-bold px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-200 rounded-xl transition-colors cursor-pointer shadow-xs shrink-0 font-mono uppercase"
            >
              Clear All Filters
            </button>
          </div>
        )}

        {/* TAB CONTENT: OVERVIEW */}
        {dashboardTab === 'overview' && (
          <div className="space-y-4">
            {/* REFERENCE FORMAT COMPLIANCE ALERTS */}
            {referenceValidationAlerts.length > 0 && (
              <div className="bg-amber-950/20 border border-amber-850/45 rounded-xl p-4 shadow-sm animate-fadeIn space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 bg-amber-900/30 rounded-lg border border-amber-800/45 text-amber-400 mt-0.5 animate-pulse">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-extrabold text-amber-400 uppercase tracking-wider font-mono flex items-center gap-2">
                        <span>Reference Compliance Alerts</span>
                        <span className="bg-amber-900/40 text-amber-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-800/55">
                          {referenceValidationAlerts.length} Issues Detected
                        </span>
                      </h4>
                      <p className="text-[10.5px] text-slate-500 font-medium leading-normal mt-0.5">
                        These trades in <strong className="text-slate-700">DH</strong>, <strong className="text-slate-700">DFT</strong>, or <strong className="text-slate-700">Hedging LNG</strong> portfolios do not match the standard naming pattern: <code>&lt;Index&gt;_&lt;Buyer&gt;_&lt;ExpMonthYear&gt;[_...]</code>.
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setAlertsCollapsed(!alertsCollapsed)}
                    className="self-start sm:self-center text-[10px] font-black uppercase font-mono text-amber-650 hover:text-amber-800 hover:bg-amber-100/65 px-3 py-1.5 border border-amber-300/60 rounded-lg transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                  >
                    {alertsCollapsed ? 'Expand Details' : 'Collapse Details'}
                  </button>
                </div>

                {!alertsCollapsed && (
                  <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white max-h-60 overflow-y-auto custom-scrollbar shadow-inner">
                    <table className="w-full text-left font-mono text-[10.5px] text-slate-700">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase select-none sticky top-0 z-10">
                        <tr>
                          <th className="py-2 px-3">Deal Num</th>
                          <th className="py-2 px-3">Strategy</th>
                          <th className="py-2 px-3">Portfolio</th>
                          <th className="py-2 px-3">Non-Compliant Reference</th>
                          <th className="py-2 px-3 text-rose-600">Validation Failure Reason</th>
                          <th className="py-2 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {referenceValidationAlerts.map(({ row, error, strategyName }, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-1.5 px-3 font-extrabold text-slate-900">{row['Deal Num']}</td>
                            <td className="py-1.5 px-3 font-semibold text-slate-600">{strategyName}</td>
                            <td className="py-1.5 px-3 font-bold text-slate-500">{row['Internal Portfolio'] || row['Portfolio'] || '—'}</td>
                            <td className="py-1.5 px-3 text-amber-700 font-bold break-all max-w-[180px]">{row['Reference'] || '—'}</td>
                            <td className="py-1.5 px-3 text-rose-600/90 italic font-sans font-medium">{error}</td>
                            <td className="py-1.5 px-3 text-right">
                              <button
                                onClick={() => {
                                  // Expand the strategy and scroll down
                                  toggleRowExpansion(strategyName, true);
                                  // Set expanded detail filter to show all so they can find it
                                  setExpandedFilters(prev => ({ ...prev, [strategyName]: 'all' }));
                                  
                                  // Also enable 'all' ref filter so they can search it
                                  setSubTableRefFilters(prev => ({ ...prev, [strategyName]: 'invalid' }));

                                  toast.success(`Expanded ${strategyName} & filtered trade logs to alerts!`);
                                }}
                                className="text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-2.5 py-1 border border-blue-200/60 rounded-md transition-all cursor-pointer whitespace-nowrap"
                              >
                                Inspect Deal
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

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
                              onClick={(entry) => {
                                if (entry && entry.name) {
                                  const statusVal = entry.name.includes('Yes') ? 'Yes' : entry.name.includes('No') ? 'No' : 'Alert';
                                  setColumnFilters(prev => {
                                    const next = { ...prev };
                                    const currentFilter = next['Optimisation'];
                                    if (currentFilter && currentFilter.selectedValues.has(statusVal)) {
                                      delete next['Optimisation'];
                                      toast.success("Cleared Optimisation status filter");
                                    } else {
                                      next['Optimisation'] = {
                                        selectedValues: new Set([statusVal]),
                                        condition: 'none',
                                        conditionValue1: '',
                                        conditionValue2: ''
                                      };
                                      toast.success(`Filtering by Optimisation: ${statusVal}`);
                                    }
                                    return next;
                                  });
                                }
                              }}
                              cursor="pointer"
                            >
                              {optimizationData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} className="hover:opacity-80 transition-opacity" />
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
                              onClick={(entry) => {
                                if (entry && entry.name) {
                                  const statusVal = entry.name.includes('Matched') ? 'Matched' : entry.name.includes('Sell') ? 'Open on Sell Leg' : 'Open on Buy Leg';
                                  setColumnFilters(prev => {
                                    const next = { ...prev };
                                    const currentFilter = next['Unallocated Cargo'];
                                    if (currentFilter && currentFilter.selectedValues.has(statusVal)) {
                                      delete next['Unallocated Cargo'];
                                      toast.success("Cleared cargo matching filter");
                                    } else {
                                      next['Unallocated Cargo'] = {
                                        selectedValues: new Set([statusVal]),
                                        condition: 'none',
                                        conditionValue1: '',
                                        conditionValue2: ''
                                      };
                                      toast.success(`Filtering by Cargo Matching: ${statusVal}`);
                                    }
                                    return next;
                                  });
                                }
                              }}
                              cursor="pointer"
                            >
                              {unallocatedData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} className="hover:opacity-80 transition-opacity" />
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

            {/* Chart Section: Hedging Volume and Percentage Analytics */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 mb-4 gap-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    Hedging Operations &amp; Paper Volumes per Strategy
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                    Compares <strong>Hedging LNG</strong> volume and ratio (%) against <strong>Physical Cargo</strong> volume. Keeps paper portfolios (<strong>DH LNG</strong> &amp; <strong>DFT LNG</strong>) clearly separated.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                    <span className="w-1.5 h-1.5 rounded bg-emerald-500" />
                    Hedging LNG (Physical Related)
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium bg-amber-50 text-amber-700 border border-amber-100">
                    <span className="w-1.5 h-1.5 rounded bg-amber-500" />
                    DH &amp; DFT LNG (Paper)
                  </span>
                </div>
              </div>

              {/* Chart Content */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                {/* Visual Chart: Col-span 8 */}
                <div className="xl:col-span-8 h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={filteredAndSortedSummaryData.map(item => {
                        const getChartVol = (byUnit: any) => {
                          if (!byUnit) return 0;
                          if (selectedUnit !== 'ALL') {
                            return byUnit[selectedUnit] || 0;
                          }
                          if ('MMBtu' in byUnit) return byUnit['MMBtu'];
                          const firstKey = Object.keys(byUnit)[0];
                          return firstKey ? byUnit[firstKey] : 0;
                        };
                        const physVol = Math.max(getChartVol(item.purchaseVolumeByUnit), getChartVol(item.salesVolumeByUnit)) || 0;
                        const hedgingVol = getChartVol(item.hedgingVolumeByUnit) || 0;
                        const paperVol = getChartVol(item.paperVolumeByUnit) || 0;
                        return {
                          name: item.strategyName,
                          "Physical Volume": physVol,
                          "Hedging LNG": hedgingVol,
                          "Paper LNG (DH & DFT)": paperVol,
                          "Hedging Ratio (%)": parseFloat((item.hedgingVolumePct || 0).toFixed(1)),
                        };
                      })}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                      onClick={(data) => {
                        if (data && data.activeLabel) {
                          setSelectedDrillDownStrategy(data.activeLabel);
                          toast.success(`Opening drill-down details for ${data.activeLabel}`);
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="name" 
                        stroke="#64748b" 
                        fontSize={9} 
                        tickLine={false} 
                        axisLine={false}
                        dy={5}
                      />
                      <YAxis 
                        yAxisId="left"
                        stroke="#64748b" 
                        fontSize={9} 
                        tickLine={false} 
                        axisLine={false}
                        tickFormatter={(v) => `${(v / 1e3).toFixed(0)}k`}
                        label={{ value: `Volume (${selectedUnit === 'ALL' ? 'MMBtu/Dominant' : selectedUnit})`, angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#64748b', fontSize: 9, dy: 10 } }}
                      />
                      <YAxis 
                        yAxisId="right"
                        orientation="right"
                        stroke="#059669" 
                        fontSize={9} 
                        tickLine={false} 
                        axisLine={false}
                        tickFormatter={(v) => `${v}%`}
                        label={{ value: 'Hedging Ratio (%)', angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fill: '#059669', fontSize: 9 } }}
                      />
                      <RechartsTooltip 
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            const unitLabel = selectedUnit === 'ALL' ? 'Units' : selectedUnit;
                            return (
                              <div className="bg-slate-900 text-white p-2.5 rounded-lg shadow-lg border border-slate-800 text-[10px] font-mono space-y-1.5">
                                <p className="font-bold border-b border-slate-800 pb-1 text-slate-300">{label}</p>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Physical Volume:</span>
                                  <span className="font-bold">{(data["Physical Volume"]).toLocaleString()} {unitLabel}</span>
                                </div>
                                <div className="flex justify-between gap-4 text-emerald-400">
                                  <span>Hedging LNG Vol:</span>
                                  <span className="font-bold">{(data["Hedging LNG"]).toLocaleString()} {unitLabel}</span>
                                </div>
                                <div className="flex justify-between gap-4 text-emerald-400 font-bold">
                                  <span>Hedging Ratio:</span>
                                  <span>{data["Hedging Ratio (%)"]}%</span>
                                </div>
                                <div className="flex justify-between gap-4 text-amber-400 border-t border-slate-800 pt-1">
                                  <span>Paper LNG (DH &amp; DFT):</span>
                                  <span className="font-bold">{(data["Paper LNG (DH &amp; DFT)"] || 0).toLocaleString()} {unitLabel}</span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <RechartsLegend 
                        verticalAlign="top" 
                        height={36} 
                        iconSize={10} 
                        wrapperStyle={{ fontSize: 9, fontFamily: 'monospace' }}
                      />
                      <Bar yAxisId="left" dataKey="Physical Volume" fill="#cbd5e1" name="Phys Cargo Vol" radius={[2, 2, 0, 0]} maxBarSize={25} cursor="pointer" />
                      <Bar yAxisId="left" dataKey="Hedging LNG" fill="#10b981" name="Hedging LNG" radius={[2, 2, 0, 0]} maxBarSize={25} cursor="pointer" />
                      <Bar yAxisId="left" dataKey="Paper LNG (DH &amp; DFT)" fill="#f59e0b" name="Paper (DH/DFT)" radius={[2, 2, 0, 0]} maxBarSize={25} cursor="pointer" />
                      <Line yAxisId="right" type="monotone" dataKey="Hedging Ratio (%)" stroke="#059669" strokeWidth={2} dot={{ r: 3, strokeWidth: 1 }} activeDot={{ r: 5 }} name="Hedging Ratio (%)" cursor="pointer" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Analytical summary: Col-span 4 */}
                <div className="xl:col-span-4 bg-slate-50 rounded-lg p-3.5 border border-slate-150 flex flex-col justify-between">
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider font-mono">Operations Insights</h4>
                    
                    {/* Stat Cards */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white p-2 rounded border border-slate-100 shadow-sm flex flex-col justify-between">
                        <span className="text-[9px] text-slate-500 block">Total Hedging LNG</span>
                        <span className="text-xs font-bold text-slate-800 font-mono leading-tight whitespace-pre-line">
                          {(() => {
                            const aggregated = filteredAndSortedSummaryData.reduce((acc, curr) => {
                              Object.entries(curr.hedgingVolumeByUnit || {}).forEach(([unit, val]) => {
                                acc[unit] = (acc[unit] || 0) + val;
                              });
                              return acc;
                            }, {} as { [unit: string]: number });
                            return formatUnitVolumes(aggregated, '\n');
                          })()}
                        </span>
                      </div>

                      <div className="bg-white p-2 rounded border border-slate-100 shadow-sm flex flex-col justify-between">
                        <span className="text-[9px] text-slate-500 block">Total Paper (DH/DFT)</span>
                        <span className="text-xs font-bold text-slate-800 font-mono leading-tight whitespace-pre-line">
                          {(() => {
                            const aggregated = filteredAndSortedSummaryData.reduce((acc, curr) => {
                              Object.entries(curr.paperVolumeByUnit || {}).forEach(([unit, val]) => {
                                acc[unit] = (acc[unit] || 0) + val;
                              });
                              return acc;
                            }, {} as { [unit: string]: number });
                            return formatUnitVolumes(aggregated, '\n');
                          })()}
                        </span>
                      </div>
                    </div>

                    <div className="bg-white p-2.5 rounded border border-slate-100 shadow-sm space-y-1.5">
                      <span className="text-[9px] text-slate-500 block font-bold">Hedging Portfolio Coverage</span>
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-slate-600">Avg Hedging Ratio:</span>
                        <span className="font-bold text-emerald-600">
                          {(() => {
                            const physTotal = filteredAndSortedSummaryData.reduce((acc, curr) => {
                              if (selectedUnit !== 'ALL') {
                                return acc + Math.max(curr.purchaseVolumeByUnit[selectedUnit] || 0, curr.salesVolumeByUnit[selectedUnit] || 0);
                              }
                              return acc + Math.max(curr.purchaseVolume, curr.salesVolume);
                            }, 0);
                            const hedgeTotal = filteredAndSortedSummaryData.reduce((acc, curr) => {
                              if (selectedUnit !== 'ALL') {
                                return acc + (curr.hedgingVolumeByUnit[selectedUnit] || 0);
                              }
                              return acc + (curr.hedgingVolume || 0);
                            }, 0);
                            return physTotal > 0 ? `${((hedgeTotal / physTotal) * 100).toFixed(1)}%` : '0.0%';
                          })()}
                        </span>
                      </div>
                      {/* Visual progress bar */}
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                          style={{
                            width: (() => {
                              const physTotal = filteredAndSortedSummaryData.reduce((acc, curr) => {
                                if (selectedUnit !== 'ALL') {
                                  return acc + Math.max(curr.purchaseVolumeByUnit[selectedUnit] || 0, curr.salesVolumeByUnit[selectedUnit] || 0);
                                }
                                return acc + Math.max(curr.purchaseVolume, curr.salesVolume);
                              }, 0);
                              const hedgeTotal = filteredAndSortedSummaryData.reduce((acc, curr) => {
                                if (selectedUnit !== 'ALL') {
                                  return acc + (curr.hedgingVolumeByUnit[selectedUnit] || 0);
                                }
                                return acc + (curr.hedgingVolume || 0);
                              }, 0);
                              return physTotal > 0 ? `${Math.min(100, (hedgeTotal / physTotal) * 100)}%` : '0%';
                            })()
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="text-[9px] text-slate-500 leading-relaxed font-mono mt-3 xl:mt-0 pt-2 border-t border-slate-200">
                    <span className="font-bold text-slate-700 block mb-0.5">Portfolio Mandate Guide:</span>
                    Hedging LNG represents operational risk mitigation and is treated alongside physical flows. DH and DFT represent financial paper trades and are aggregated separately to maintain compliance and clean exposure reporting.
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
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800">{formatUnitVolumes(item.purchaseVolumeByUnit, ' | ', 'buy')}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800">{formatUnitVolumes(item.salesVolumeByUnit, ' | ', 'sell')}</td>
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
                      <BarChart 
                        data={optimizationChartData} 
                        margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                        onClick={(data) => {
                          if (data && data.activeLabel) {
                            setSelectedDrillDownStrategy(data.activeLabel);
                            toast.success(`Opening drill-down details for ${data.activeLabel}`);
                          }
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#64748b" tickFormatter={(v) => v.slice(0, 12) + (v.length > 12 ? '..' : '')} />
                        <YAxis stroke="#64748b" />
                        <RechartsTooltip 
                          contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#1e293b', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                          formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                        />
                        <RechartsLegend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                        <Bar dataKey="Base P&L" fill="#94a3b8" radius={[4, 4, 0, 0]} opacity={0.7} cursor="pointer" />
                        <Bar dataKey="Optimized P&L" fill="#10b981" radius={[4, 4, 0, 0]} opacity={0.9} cursor="pointer" />
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
                    .sort((a, b) => (b.optimizationUplift - a.optimizationUplift))
                    .slice(0, 4)
                    .map((item, idx) => {
                      const upliftVal = item.optimizationUplift;
                      return (
                        <div key={idx} className="p-3 bg-slate-50 border border-slate-150 rounded-xl flex items-center justify-between hover:border-emerald-200 transition-all cursor-pointer"
                             onClick={() => setSelectedDrillDownStrategy(item.strategyName)}>
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-bold text-slate-800 block truncate max-w-[160px]">{item.strategyName}</span>
                            <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider block">{getTrmsGroupName(item.strategyName)}</span>
                          </div>
                          <div className="text-right">
                            <span className={`text-xs font-mono font-black block ${upliftVal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {upliftVal >= 0 ? '+' : '-'}${Math.abs(upliftVal).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
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
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">Granular auditing of Standard (Base Value) vs Optimized allocations.</p>
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
                      <th className="py-2.5 px-3 text-right">Base Value ($)</th>
                      <th className="py-2.5 px-3 text-right">Optimized Value ($)</th>
                      <th className="py-2.5 px-3 text-right">Optimization Uplift ($)</th>
                      <th className="py-2.5 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {optimizedStrategies.map((item, index) => {
                      const baseNetVal = (item.baseSalesRevenue || 0) - (item.basePurchaseCost || 0) - Math.abs(item.baseShippingRelatedCosts || 0);
                      const optNetVal = (item.salesRevenue || 0) - (item.purchaseCost || 0) - Math.abs(item.shippingRelatedCosts || 0);
                      const uplift = item.optimizationUplift;
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
                          <td className="py-3 px-3 text-right font-mono text-slate-600">{formatUnitVolumes(item.purchaseVolumeByUnit, ' | ', 'buy')}</td>
                          <td className="py-3 px-3 text-right font-mono text-slate-600">{formatUnitVolumes(item.salesVolumeByUnit, ' | ', 'sell')}</td>
                          <td className={`py-3 px-3 text-right font-mono font-semibold ${baseNetVal >= 0 ? 'text-slate-600' : 'text-rose-500'}`}>
                            {baseNetVal >= 0 ? '+' : '-'}${Math.abs(baseNetVal).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                          <td className={`py-3 px-3 text-right font-mono font-bold ${optNetVal >= 0 ? 'text-slate-800' : 'text-rose-650'}`}>
                            {optNetVal >= 0 ? '+' : '-'}${Math.abs(optNetVal).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                          <td className={`py-3 px-3 text-right font-mono font-black ${uplift >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {uplift >= 0 ? '+' : '-'}${Math.abs(uplift).toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
                              <span className="font-bold text-slate-700">{formatUnitVolumes(item.purchaseVolumeByUnit, ' | ', 'buy')}</span>
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
                              <span className="font-bold text-slate-700">{formatUnitVolumes(item.salesVolumeByUnit, ' | ', 'sell')}</span>
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
                                  +${(item.optimizationUplift).toLocaleString(undefined, { maximumFractionDigits: 0 })}
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

        {dashboardTab === 'volume_exposure' && (
          <div className="space-y-4 animate-fadeIn">
            {/* Header description card */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-4 rounded-xl border border-slate-700 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                  <Ship className="w-5 h-5 text-sky-400" />
                  Volume, seasonal exposure &amp; Market Basis Analytics
                </h3>
                <p className="text-[10px] text-slate-300 font-mono mt-1">
                  Advanced overview of physical cargo commitments, pricing indices, seasonal loading schedules, and trader portfolio concentrations.
                </p>
              </div>
              <div className="flex bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 text-[10px] font-mono gap-4">
                <div>
                  <span className="text-slate-400 block uppercase">Total Physical Vol</span>
                  <span className="text-[11px] font-black text-sky-400 font-mono leading-tight block">
                    {(() => {
                      const aggregated = filteredAndSortedSummaryData.reduce((acc, curr) => {
                        const units = new Set([...Object.keys(curr.purchaseVolumeByUnit || {}), ...Object.keys(curr.salesVolumeByUnit || {})]);
                        units.forEach(unit => {
                          const p = curr.purchaseVolumeByUnit?.[unit] || 0;
                          const s = curr.salesVolumeByUnit?.[unit] || 0;
                          acc[unit] = (acc[unit] || 0) + Math.max(p, s);
                        });
                        return acc;
                      }, {} as { [unit: string]: number });
                      return formatUnitVolumes(aggregated, ' | ');
                    })()}
                  </span>
                </div>
                <div className="w-px bg-slate-800" />
                <div>
                  <span className="text-slate-400 block uppercase">Active Strategies</span>
                  <span className="text-sm font-black text-sky-400 font-mono">
                    {filteredAndSortedSummaryData.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Top row stats cards (Bento Grid) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Stat card 1: Purchases */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                  <ArrowRight className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Physical Purchase Vol</span>
                  <span className="text-sm font-black text-slate-800 font-mono leading-tight whitespace-pre-line block">
                    {(() => {
                      const aggregated = filteredAndSortedSummaryData.reduce((acc, curr) => {
                        Object.entries(curr.purchaseVolumeByUnit || {}).forEach(([unit, val]) => {
                          acc[unit] = (acc[unit] || 0) + val;
                        });
                        return acc;
                      }, {} as { [unit: string]: number });
                      return formatUnitVolumes(aggregated, '\n', 'buy');
                    })()}
                  </span>
                </div>
              </div>

              {/* Stat card 2: Sales */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="p-3 rounded-lg bg-teal-50 border border-teal-100">
                  <ArrowLeft className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Physical Sales Vol</span>
                  <span className="text-sm font-black text-slate-800 font-mono leading-tight whitespace-pre-line block">
                    {(() => {
                      const aggregated = filteredAndSortedSummaryData.reduce((acc, curr) => {
                        Object.entries(curr.salesVolumeByUnit || {}).forEach(([unit, val]) => {
                          acc[unit] = (acc[unit] || 0) + val;
                        });
                        return acc;
                      }, {} as { [unit: string]: number });
                      return formatUnitVolumes(aggregated, '\n', 'sell');
                    })()}
                  </span>
                </div>
              </div>

              {/* Stat card 3: Net Exposure */}
              {(() => {
                const aggregatedExposure = filteredAndSortedSummaryData.reduce((acc, curr) => {
                  Object.entries(curr.purchaseVolumeByUnit || {}).forEach(([unit, val]) => {
                    acc[unit] = (acc[unit] || 0) + val;
                  });
                  Object.entries(curr.salesVolumeByUnit || {}).forEach(([unit, val]) => {
                    acc[unit] = (acc[unit] || 0) - val;
                  });
                  return acc;
                }, {} as { [unit: string]: number });

                const firstUnitVal = Object.values(aggregatedExposure)[0] || 0;
                const isLong = firstUnitVal >= 0;

                return (
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className={`p-3 rounded-lg border ${isLong ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                      <Activity className={`w-5 h-5 ${isLong ? 'text-emerald-600' : 'text-rose-600'}`} />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Net Position Exposure</span>
                      <span className={`text-sm font-black font-mono leading-tight whitespace-pre-line block ${isLong ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {(() => {
                          const formatted = Object.entries(aggregatedExposure)
                            .filter(([_, val]) => Math.abs(val) > 0.0001)
                            .map(([unit, val]) => {
                              const sign = val >= 0 ? '+' : '-';
                              return `${sign}${Math.abs(val).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${unit}`;
                            })
                            .join('\n');
                          return formatted || '0 Units';
                        })()}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Stat card 4: Hedging Coverage Ratio */}
              {(() => {
                let physBblTotal = 0;
                let hedgeBblTotal = 0;
                let physMMBtuTotal = 0;
                let hedgeMMBtuTotal = 0;

                filteredAndSortedSummaryData.forEach(curr => {
                  physBblTotal += Math.max(curr.purchaseVolumeByUnit?.['Bbl'] || 0, curr.salesVolumeByUnit?.['Bbl'] || 0);
                  hedgeBblTotal += curr.hedgingVolumeByUnit?.['Bbl'] || 0;
                  physMMBtuTotal += Math.max(curr.purchaseVolumeByUnit?.['MMBtu'] || 0, curr.salesVolumeByUnit?.['MMBtu'] || 0);
                  hedgeMMBtuTotal += curr.hedgingVolumeByUnit?.['MMBtu'] || 0;
                });

                const ratios: number[] = [];
                if (physBblTotal > 0) {
                  ratios.push((hedgeBblTotal / physBblTotal) * 100);
                }
                if (physMMBtuTotal > 0) {
                  ratios.push((hedgeMMBtuTotal / physMMBtuTotal) * 100);
                }

                let ratio = 0;
                if (ratios.length > 0) {
                  ratio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
                } else {
                  const totalPhys = filteredAndSortedSummaryData.reduce((acc, curr) => acc + Math.max(curr.purchaseVolume || 0, curr.salesVolume || 0), 0);
                  const totalHedge = filteredAndSortedSummaryData.reduce((acc, curr) => acc + (curr.hedgingVolume || 0), 0);
                  ratio = totalPhys > 0 ? (totalHedge / totalPhys) * 100 : 0;
                }
                return (
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                      <TrendingUp className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Hedging Coverage Ratio</span>
                      <span className="text-lg font-black text-slate-800 font-mono leading-none">
                        {ratio.toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono block mt-1 leading-tight">
                        {(() => {
                          const aggregated = filteredAndSortedSummaryData.reduce((acc, curr) => {
                            Object.entries(curr.hedgingVolumeByUnit || {}).forEach(([unit, val]) => {
                              acc[unit] = (acc[unit] || 0) + val;
                            });
                            return acc;
                          }, {} as { [unit: string]: number });
                          return formatUnitVolumes(aggregated);
                        })()}
                      </span>
                    </div>
                  </div>
                );
              })()}

            </div>

            {/* Row 1 Charts: Volume per Strategy & Monthly Temporal Schedule */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              
              {/* Chart A: Physical Purchase vs Sales Volumes per Strategy */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-indigo-600" />
                    Physical Cargo Volume Balancing per Strategy
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                    Compares direct purchase (loading) commitments against sales (delivery) contracts.
                  </p>
                </div>

                <div className="h-[280px] mt-4 w-full text-[10px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={filteredAndSortedSummaryData.map(item => {
                        const getChartVol = (byUnit: any) => {
                          if (!byUnit) return 0;
                          if (selectedUnit !== 'ALL') {
                            return byUnit[selectedUnit] || 0;
                          }
                          if ('MMBtu' in byUnit) return byUnit['MMBtu'];
                          const firstKey = Object.keys(byUnit)[0];
                          return firstKey ? byUnit[firstKey] : 0;
                        };
                        const purchaseVol = getChartVol(item.purchaseVolumeByUnit);
                        const salesVol = getChartVol(item.salesVolumeByUnit);
                        return {
                          name: item.strategyName,
                          "Purchase Vol": purchaseVol,
                          "Sales Vol": salesVol,
                          "Net Bal": purchaseVol - salesVol
                        };
                      })}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                      onClick={(data) => {
                        if (data && data.activeLabel) {
                          setSelectedDrillDownStrategy(data.activeLabel);
                          toast.success(`Opening drill-down details for ${data.activeLabel}`);
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis 
                        dataKey="name" 
                        stroke="#64748b" 
                        fontSize={9} 
                        tickLine={false} 
                        dy={5}
                      />
                      <YAxis 
                        stroke="#64748b" 
                        fontSize={9} 
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${(v / 1e3).toFixed(0)}k`}
                        label={{ value: `Volume (${selectedUnit === 'ALL' ? 'MMBtu/Dominant' : selectedUnit})`, angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#64748b', fontSize: 9, dy: 10 } }}
                      />
                      <RechartsTooltip
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            const unitLabel = selectedUnit === 'ALL' ? 'Units' : selectedUnit;
                            return (
                              <div className="bg-slate-900 text-white p-2.5 rounded-lg shadow-md border border-slate-800 text-[10px] font-mono space-y-1.5">
                                <p className="font-bold border-b border-slate-800 pb-1 text-slate-300">{label}</p>
                                <div className="flex justify-between gap-4 text-indigo-300">
                                  <span>Purchase Volume:</span>
                                  <span className="font-bold">{(d["Purchase Vol"]).toLocaleString()} {unitLabel}</span>
                                </div>
                                <div className="flex justify-between gap-4 text-teal-300">
                                  <span>Sales Volume:</span>
                                  <span className="font-bold">{(d["Sales Vol"]).toLocaleString()} {unitLabel}</span>
                                </div>
                                <div className={`flex justify-between gap-4 border-t border-slate-800 pt-1 font-bold ${d["Net Bal"] >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  <span>Net Cargo Position:</span>
                                  <span>{d["Net Bal"] >= 0 ? '+' : ''}{(d["Net Bal"]).toLocaleString()} {unitLabel}</span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <RechartsLegend verticalAlign="top" height={30} iconSize={8} wrapperStyle={{ fontSize: 9, fontFamily: 'monospace' }} />
                      <Bar dataKey="Purchase Vol" fill="#4f46e5" name="Purchases" radius={[2, 2, 0, 0]} maxBarSize={20} cursor="pointer" />
                      <Bar dataKey="Sales Vol" fill="#0d9488" name="Sales" radius={[2, 2, 0, 0]} maxBarSize={20} cursor="pointer" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart B: Monthly Cargo Schedule & Flow Exposure */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    Seasonal Loading &amp; Delivery Timeline ({selectedUnit === 'ALL' ? 'Original Units' : selectedUnit})
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                    Chronological schedule of physical operations, outlining monthly peaks in purchase and sales.
                  </p>
                </div>

                <div className="h-[280px] mt-4 w-full text-[10px]">
                  {(() => {
                    const map: Record<string, { month: string, purchase: number, sales: number, sortKey: string }> = {};
                    
                    filteredAndSortedSummaryData.forEach(item => {
                      item.underlyingRows.forEach(row => {
                        const cflowType = String(row['Cflow Type'] || '').trim().toLowerCase();
                        if (cflowType === 'commodity' || cflowType === 'physical') {
                          const month = getRowExposureMonth(row);
                          if (month) {
                            const rawVol = Math.abs(Number(String(row['Volume'] || '').replace(/[^0-9.-]/g, '')) || 0);
                            const vol = convertVolume(rawVol, row['Unit'] || row['unit']);
                            const buySell = String(row['Buy_Sell'] || row['BuySell'] || '').toLowerCase();
                            const isBuy = buySell === 'buy' || buySell === 'buys';
                            const isSell = buySell === 'sell' || buySell === 'sells';
                            
                            if (!map[month]) {
                              const parts = month.split('-');
                              const monthsList = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                              const mIdx = monthsList.indexOf(parts[0]);
                              const yearNum = parseInt(parts[1]) || 0;
                              const sortKey = `${yearNum.toString().padStart(2, '0')}-${(mIdx >= 0 ? mIdx : 0).toString().padStart(2, '0')}`;
                              
                              map[month] = {
                                month,
                                purchase: 0,
                                sales: 0,
                                sortKey
                              };
                            }
                            
                            if (isBuy) map[month].purchase += vol;
                            if (isSell) map[month].sales += vol;
                          }
                        }
                      });
                    });

                    const timelineList = Object.values(map)
                      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

                    if (timelineList.length === 0) {
                      return (
                        <div className="flex items-center justify-center h-full text-slate-400 font-mono">
                          No physical cargo operations scheduled.
                        </div>
                      );
                    }

                    return (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={timelineList}
                          margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                          onClick={(data) => {
                            if (data && data.activeLabel) {
                              if (searchTerm === data.activeLabel) {
                                setSearchTerm('');
                                toast.success(`Cleared timeline month filter`);
                              } else {
                                setSearchTerm(data.activeLabel);
                                toast.success(`Filtering dashboard by period: ${data.activeLabel}`);
                              }
                            }
                          }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis 
                            dataKey="month" 
                            stroke="#64748b" 
                            fontSize={9} 
                            tickLine={false}
                            dy={5}
                          />
                          <YAxis 
                            stroke="#64748b" 
                            fontSize={9} 
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`}
                          />
                          <RechartsTooltip
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                const d = payload[0].payload;
                                const netVal = d.purchase - d.sales;
                                return (
                                  <div className="bg-slate-900 text-white p-2.5 rounded-lg shadow-md border border-slate-800 text-[10px] font-mono space-y-1.5">
                                    <p className="font-bold border-b border-slate-800 pb-1 text-slate-300">Period: {label}</p>
                                    <div className="flex justify-between gap-4 text-indigo-300">
                                      <span>Purchased:</span>
                                      <span className="font-bold">{d.purchase.toLocaleString()} {selectedUnit === 'ALL' ? 'Units' : selectedUnit}</span>
                                    </div>
                                    <div className="flex justify-between gap-4 text-teal-300">
                                      <span>Sold:</span>
                                      <span className="font-bold">{d.sales.toLocaleString()} {selectedUnit === 'ALL' ? 'Units' : selectedUnit}</span>
                                    </div>
                                    <div className={`flex justify-between gap-4 border-t border-slate-800 pt-1 font-bold ${netVal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      <span>Net Exposure:</span>
                                      <span>{netVal >= 0 ? 'Long' : 'Short'} ({Math.abs(netVal).toLocaleString()} {selectedUnit === 'ALL' ? 'Units' : selectedUnit})</span>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <RechartsLegend verticalAlign="top" height={30} iconSize={8} wrapperStyle={{ fontSize: 9, fontFamily: 'monospace' }} />
                          <Bar dataKey="purchase" fill="#6366f1" name="Purchase Loadings" radius={[2, 2, 0, 0]} maxBarSize={15} cursor="pointer" />
                          <Bar dataKey="sales" fill="#14b8a6" name="Sales Deliveries" radius={[2, 2, 0, 0]} maxBarSize={15} cursor="pointer" />
                          <Line type="monotone" dataKey="purchase" stroke="#3b82f6" strokeWidth={1} dot={{ r: 2 }} activeDot={{ r: 3 }} name="Loading Trend" cursor="pointer" />
                          <Line type="monotone" dataKey="sales" stroke="#10b981" strokeWidth={1} dot={{ r: 2 }} activeDot={{ r: 3 }} name="Delivery Trend" cursor="pointer" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    );
                  })()}
                </div>
              </div>

            </div>

            {/* Row 2: Index Pricing Exposure & Trader Concentration */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              
              {/* Pricing Index Exposure Breakdown */}
              <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                    <PieChartIcon className="w-4 h-4 text-indigo-600" />
                    Market Index Pricing Basis Exposure
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                    Breakdown of physical cargo volumes indexed against international gas, LNG, or Brent markers.
                  </p>
                </div>

                {(() => {
                  const getRowPriceIndex = (row: any) => {
                    const indexVal = row['IndexName_ProjectionMethod'] || row['IndexName ProjectionMethod'] || row['IndexName_Projection_Method'] || row['Index Name'] || row['IndexName'] || row['Reference'] || '';
                    const str = String(indexVal).toUpperCase();
                    if (str.includes('HH') || str.includes('HENRY')) return 'Henry Hub';
                    if (str.includes('TTF')) return 'TTF';
                    if (str.includes('JKM')) return 'JKM';
                    if (str.includes('NBP')) return 'NBP';
                    if (str.includes('BRENT') || str.includes('CO1')) return 'Brent';
                    if (str.includes('JCC')) return 'JCC';
                    return 'Fixed / Other';
                  };

                  const map: Record<string, number> = {};
                  filteredAndSortedSummaryData.forEach(item => {
                    item.underlyingRows.forEach(row => {
                      const cflowType = String(row['Cflow Type'] || '').trim().toLowerCase();
                      if (cflowType === 'commodity' || cflowType === 'physical') {
                        const idxName = getRowPriceIndex(row);
                        const rawVol = Math.abs(Number(String(row['Volume'] || '').replace(/[^0-9.-]/g, '')) || 0);
                        const vol = convertVolume(rawVol, row['Unit'] || row['unit']);
                        map[idxName] = (map[idxName] || 0) + vol;
                      }
                    });
                  });

                  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f43f5e', '#64748b'];
                  const indexList = Object.entries(map)
                    .map(([name, value], idx) => ({
                      name,
                      value,
                      color: colors[idx % colors.length]
                    }))
                    .sort((a, b) => b.value - a.value);

                  const totalVol = indexList.reduce((acc, curr) => acc + curr.value, 0);

                  if (indexList.length === 0) {
                    return (
                      <div className="h-[200px] flex items-center justify-center text-slate-400 font-mono">
                        No indexed cargo commitments.
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center mt-4 h-[200px]">
                      <div className="relative h-full flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={indexList}
                              cx="50%"
                              cy="50%"
                              innerRadius={35}
                              outerRadius={55}
                              paddingAngle={3}
                              dataKey="value"
                              onClick={(entry) => {
                                if (entry && entry.name) {
                                  if (selectedIndexFilter === entry.name) {
                                    setSelectedIndexFilter(null);
                                    toast.success("Cleared pricing index filter");
                                  } else {
                                    setSelectedIndexFilter(entry.name);
                                    toast.success(`Filtering by Pricing Index: ${entry.name}`);
                                  }
                                }
                              }}
                              cursor="pointer"
                            >
                              {indexList.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} className="hover:opacity-85 transition-opacity" />
                              ))}
                            </Pie>
                            <RechartsTooltip 
                              formatter={(v: number) => [`${v.toLocaleString()} ${selectedUnit === 'ALL' ? 'Units' : selectedUnit}`, 'Physical Volume']}
                              contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', fontSize: '9px' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute flex flex-col items-center justify-center text-center">
                          <span className="text-[8px] font-bold text-slate-400 uppercase">Total</span>
                          <span className="text-xs font-black text-slate-800 font-mono">
                            {totalVol >= 1e6 ? `${(totalVol / 1e6).toFixed(1)}M` : totalVol.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5 max-h-full overflow-y-auto custom-scrollbar pr-1">
                        {indexList.map((entry, idx) => {
                          const pct = totalVol > 0 ? (entry.value / totalVol) * 100 : 0;
                          const isSelected = selectedIndexFilter === entry.name;
                          return (
                            <div 
                              key={idx} 
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedIndexFilter(null);
                                  toast.success("Cleared pricing index filter");
                                } else {
                                  setSelectedIndexFilter(entry.name);
                                  toast.success(`Filtering by Pricing Index: ${entry.name}`);
                                }
                              }}
                              className={`flex items-center justify-between text-[10px] font-mono border border-transparent last:border-0 cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg transition-all ${
                                isSelected ? 'bg-blue-50/80 border-blue-200 text-blue-900 font-extrabold' : 'text-slate-600'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                                <span className="truncate">{entry.name}</span>
                              </div>
                              <div className="text-right flex-shrink-0 font-mono">
                                <span className="font-bold text-slate-800">{pct.toFixed(1)}%</span>
                                <span className="text-[8px] text-slate-400 ml-1">({(entry.value / 1e6).toFixed(1)}M)</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Trader Concentration & Deal Allocation */}
              <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-indigo-600" />
                    Trader Volume &amp; Deal Allocation Distribution
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                    Assesses desk concentration ratios and trade counts across key book-runners.
                  </p>
                </div>

                {(() => {
                  const getRowTraderName = (row: any) => {
                    return String(row['Trader'] || row['Trader Name'] || 'Unassigned').trim();
                  };

                  const map: Record<string, { trader: string, volume: number, dealCount: number }> = {};
                  filteredAndSortedSummaryData.forEach(item => {
                    item.underlyingRows.forEach(row => {
                      const trader = getRowTraderName(row);
                      const rawVol = Math.abs(Number(String(row['Volume'] || '').replace(/[^0-9.-]/g, '')) || 0);
                      const vol = convertVolume(rawVol, row['Unit'] || row['unit']);
                      if (!map[trader]) {
                        map[trader] = { trader, volume: 0, dealCount: 0 };
                      }
                      map[trader].volume += vol;
                      map[trader].dealCount += 1;
                    });
                  });

                  const traderList = Object.values(map)
                    .sort((a, b) => b.volume - a.volume)
                    .slice(0, 5); // top 5 traders

                  const totalTradedVol = Object.values(map).reduce((acc, curr) => acc + curr.volume, 0);

                  if (traderList.length === 0) {
                    return (
                      <div className="h-[200px] flex items-center justify-center text-slate-400 font-mono">
                        No traders assigned to physical transactions.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4 mt-4 h-[200px] flex flex-col justify-center font-mono">
                      {traderList.map((tr, idx) => {
                        const pct = totalTradedVol > 0 ? (tr.volume / totalTradedVol) * 100 : 0;
                        const isSelected = selectedTraderFilter === tr.trader;
                        return (
                          <div 
                            key={idx} 
                            onClick={() => {
                              if (isSelected) {
                                setSelectedTraderFilter(null);
                                toast.success("Cleared trader filter");
                              } else {
                                setSelectedTraderFilter(tr.trader);
                                toast.success(`Filtering by Trader: ${tr.trader}`);
                              }
                            }}
                            className={`p-2 rounded-xl transition-all border cursor-pointer hover:bg-slate-50 ${
                              isSelected ? 'bg-indigo-50/70 border-indigo-200 shadow-sm' : 'border-transparent'
                            }`}
                          >
                            <div className="flex justify-between items-baseline text-[10px]">
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-500 text-[9px]">#{idx + 1}</span>
                                <span className={`font-bold ${isSelected ? 'text-indigo-900 font-extrabold' : 'text-slate-800'}`}>{tr.trader}</span>
                                <span className="text-[8px] bg-slate-100 border border-slate-200 text-slate-500 px-1.5 py-0.2 rounded font-sans">
                                  {tr.dealCount} deals
                                </span>
                              </div>
                              <div className="text-right font-mono">
                                <span className={`font-bold ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>{tr.volume.toLocaleString()} {selectedUnit === 'ALL' ? 'Units' : selectedUnit}</span>
                                <span className="text-[9px] text-slate-400 ml-1.5">({pct.toFixed(1)}%)</span>
                              </div>
                            </div>
                            
                            {/* Horizontal Progress bar */}
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex mt-1.5">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${
                                  isSelected ? 'bg-gradient-to-r from-indigo-500 to-indigo-700' : 'bg-gradient-to-r from-blue-500 to-indigo-600'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

            </div>

            {/* Row 3: Index Hedging & Ratio Breakdown Chart */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-indigo-600" />
                    Portfolio Exposure Breakdown by Price Index
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                    Compare physical quantities vs. individual hedging allocations (DH LNG, DFT LNG, and Hedging LNG) to identify coverage imbalances.
                  </p>
                </div>
                
                {/* Selector Tabs */}
                <div className="flex bg-slate-100 p-1 border border-slate-200 rounded-lg select-none">
                  <button
                    onClick={() => setIndexBreakdownUnit('MMBtu')}
                    className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${
                      indexBreakdownUnit === 'MMBtu'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    MMBtu Volume
                  </button>
                  <button
                    onClick={() => setIndexBreakdownUnit('Bbl')}
                    className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${
                      indexBreakdownUnit === 'Bbl'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Bbl Volume
                  </button>
                  <button
                    onClick={() => setIndexBreakdownUnit('Ratio')}
                    className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${
                      indexBreakdownUnit === 'Ratio'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Hedge Ratio (%)
                  </button>
                </div>
              </div>

              {indexHedgeBreakdown.length === 0 ? (
                <div className="h-[240px] flex items-center justify-center text-slate-400 font-mono text-[10px]">
                  No index hedging data available.
                </div>
              ) : (
                <div className="h-[280px] w-full text-[10px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={indexHedgeBreakdown}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="index" stroke="#64748b" fontSize={9} tickLine={false} dy={5} />
                      <YAxis stroke="#64748b" fontSize={9} tickLine={false} dx={-5} />
                      <RechartsTooltip 
                        contentStyle={{ background: '#0f172a', border: 'none', borderRadius: '8px', color: '#f8fafc' }}
                        labelClassName="font-bold text-[11px] mb-1 font-sans text-slate-100"
                        itemStyle={{ fontSize: '10px', fontFamily: 'monospace', padding: '1px 0' }}
                        formatter={(value: any, name: string) => {
                          if (indexBreakdownUnit === 'Ratio') {
                            return [`${Number(value).toFixed(1)}%`, name];
                          }
                          return [Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 }), name];
                        }}
                      />
                      <RechartsLegend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '10px' }} />
                      
                      {indexBreakdownUnit === 'MMBtu' && (
                        <>
                          <Bar dataKey="physMMBtu" name="Physical Volume" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="dhMMBtu" name="DH LNG Volume" fill="#6366f1" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="dftMMBtu" name="DFT LNG Volume" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="hedgingMMBtu" name="Hedging LNG Volume" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </>
                      )}
                      
                      {indexBreakdownUnit === 'Bbl' && (
                        <>
                          <Bar dataKey="physBbl" name="Physical Volume" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="dhBbl" name="DH LNG Volume" fill="#6366f1" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="dftBbl" name="DFT LNG Volume" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="hedgingBbl" name="Hedging LNG Volume" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </>
                      )}

                      {indexBreakdownUnit === 'Ratio' && (
                        <>
                          <Bar dataKey="dhRatio" name="DH Hedge Ratio" fill="#6366f1" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="dftRatio" name="DFT Hedge Ratio" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="hedgingRatio" name="Hedging Hedge Ratio" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="totalHedgeRatio" name="Total Combined Hedge Ratio" fill="#e11d48" radius={[4, 4, 0, 0]} />
                        </>
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Row 4: Detailed Cards Breakdown */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-600 animate-pulse" />
                  Detailed Index Portfolio Breakdown Cards
                </h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                  Drill down into physical commitments and individual target portfolio allocations (DH LNG, DFT LNG, and Hedging LNG) calculated per unit and averaged.
                </p>
              </div>

              {indexHedgeBreakdown.length === 0 ? (
                <div className="p-8 text-center text-slate-400 font-mono text-[10px]">
                  No hedging or physical volume associated with price indices found.
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {indexHedgeBreakdown.map((item, idx) => {
                    const isTotalProfitable = item.totalHedgePnL >= 0;

                    return (
                      <div key={idx} className="border border-slate-200 rounded-xl p-5 bg-slate-50/30 hover:bg-slate-50 transition-all flex flex-col justify-between space-y-4">
                        
                        {/* Card Header: Index Name & Physical exposure info */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                          <div>
                            <span className="font-extrabold text-sm text-slate-800 block">{item.index}</span>
                            <span className="text-[9px] text-slate-400 block font-mono">
                              Physical commitments mapped to index
                            </span>
                          </div>
                          <div className="bg-white border border-slate-200 rounded-lg px-3 py-1 text-right">
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Physical Exposure</span>
                            <span className="text-[10px] font-mono font-bold text-amber-600">
                              {item.physBbl.toLocaleString(undefined, { maximumFractionDigits: 0 })} bbl / {item.physMMBtu.toLocaleString(undefined, { maximumFractionDigits: 0 })} MMBtu
                            </span>
                          </div>
                        </div>

                        {/* Card Columns: DH, DFT, Hedging portfolio breakdown */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          
                          {/* 1. DH LNG Column */}
                          <div className="bg-white border border-slate-100 rounded-xl p-3 flex flex-col justify-between space-y-3 shadow-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[10px] text-indigo-600 uppercase tracking-wider">DH LNG</span>
                              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                                item.dhPnL >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                              }`}>
                                {item.dhPnL >= 0 ? '+' : ''}${item.dhPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </span>
                            </div>

                            <div className="space-y-1 text-[9px] font-mono text-slate-600">
                              <div className="flex justify-between">
                                <span>Bbl:</span>
                                <span className="font-bold text-slate-800">{item.dhBbl.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>MMBtu:</span>
                                <span className="font-bold text-slate-800">{item.dhMMBtu.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-slate-50">
                              <div className="flex justify-between items-center mb-1 text-[9px]">
                                <span className="text-slate-400">Hedge Ratio:</span>
                                <span className="font-extrabold text-indigo-600 font-mono">{item.dhRatio.toFixed(1)}%</span>
                              </div>
                              <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${Math.min(item.dhRatio, 100)}%` }} />
                              </div>
                            </div>
                          </div>

                          {/* 2. DFT LNG Column */}
                          <div className="bg-white border border-slate-100 rounded-xl p-3 flex flex-col justify-between space-y-3 shadow-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[10px] text-sky-600 uppercase tracking-wider">DFT LNG</span>
                              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                                item.dftPnL >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                              }`}>
                                {item.dftPnL >= 0 ? '+' : ''}${item.dftPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </span>
                            </div>

                            <div className="space-y-1 text-[9px] font-mono text-slate-600">
                              <div className="flex justify-between">
                                <span>Bbl:</span>
                                <span className="font-bold text-slate-800">{item.dftBbl.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>MMBtu:</span>
                                <span className="font-bold text-slate-800">{item.dftMMBtu.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-slate-50">
                              <div className="flex justify-between items-center mb-1 text-[9px]">
                                <span className="text-slate-400">Hedge Ratio:</span>
                                <span className="font-extrabold text-sky-600 font-mono">{item.dftRatio.toFixed(1)}%</span>
                              </div>
                              <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                <div className="bg-sky-500 h-full rounded-full" style={{ width: `${Math.min(item.dftRatio, 100)}%` }} />
                              </div>
                            </div>
                          </div>

                          {/* 3. Hedging LNG Column */}
                          <div className="bg-white border border-slate-100 rounded-xl p-3 flex flex-col justify-between space-y-3 shadow-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[10px] text-emerald-600 uppercase tracking-wider">Hedging LNG</span>
                              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                                item.hedgingPnL >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                              }`}>
                                {item.hedgingPnL >= 0 ? '+' : ''}${item.hedgingPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </span>
                            </div>

                            <div className="space-y-1 text-[9px] font-mono text-slate-600">
                              <div className="flex justify-between">
                                <span>Bbl:</span>
                                <span className="font-bold text-slate-800">{item.hedgingBbl.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>MMBtu:</span>
                                <span className="font-bold text-slate-800">{item.hedgingMMBtu.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-slate-50">
                              <div className="flex justify-between items-center mb-1 text-[9px]">
                                <span className="text-slate-400">Hedge Ratio:</span>
                                <span className="font-extrabold text-emerald-600 font-mono">{item.hedgingRatio.toFixed(1)}%</span>
                              </div>
                              <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${Math.min(item.hedgingRatio, 100)}%` }} />
                              </div>
                            </div>
                          </div>

                        </div>

                        {/* Card footer: Aggregated Combined Metrics */}
                        <div className="bg-slate-900 border border-slate-850 p-3.5 rounded-xl flex items-center justify-between text-slate-100">
                          <div className="space-y-0.5">
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block font-sans">Combined Portfolio Totals</span>
                            <div className="flex items-center gap-3 text-[9.5px] font-mono text-slate-300">
                              <span>Hedge Vol: <strong className="text-white">{(item.totalHedgeBbl).toLocaleString(undefined, { maximumFractionDigits: 0 })} Bbl / {(item.totalHedgeMMBtu).toLocaleString(undefined, { maximumFractionDigits: 0 })} MMBtu</strong></span>
                              <span className="text-slate-600">|</span>
                              <span>Total PnL: <strong className={isTotalProfitable ? 'text-emerald-400' : 'text-rose-400'}>
                                {isTotalProfitable ? '+' : ''}${item.totalHedgePnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </strong></span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block font-sans">Combined Hedge Ratio</span>
                            <span className="text-xs font-black text-emerald-400 font-mono">
                              {item.totalHedgeRatio.toFixed(1)}%
                            </span>
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
    <div className="flex flex-col flex-1 h-full bg-slate-950 text-slate-100 custom-scrollbar">
      
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-widest flex items-center gap-1">
              <TableProperties className="w-3.5 h-3.5 text-blue-400" />
              Filter TRMS Group Portfolio:
            </span>
            <button
              onClick={() => setIsCustomGroupModalOpen(true)}
              className="px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-1.5 border border-blue-400/30 cursor-pointer"
            >
              <FolderKanban className="w-3.5 h-3.5" />
              <span>Categorize SNs / Custom Portfolios</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {availableTrmsGroups.map((grp) => (
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

          {/* Dynamic Column Visibility controls (Dropdown Multiselection) */}
          <div className="relative" ref={columnsDropdownRef}>
            <button
              onClick={() => setIsColumnsDropdownOpen(prev => !prev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all border flex items-center gap-2 cursor-pointer shadow-sm ${
                isColumnsDropdownOpen || (showBuyer || showSeller || showBuyIndex || showSellIndex || showExposureMonths || showLoadingMonth || showDeliveryMonth || showLinesCount)
                  ? 'bg-slate-800 text-blue-300 border-blue-500/50 hover:bg-slate-750'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-slate-100 hover:bg-slate-850'
              }`}
              title="Toggle optional table columns"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
              <span>Toggle Columns</span>
              {(showBuyer || showSeller || showBuyIndex || showSellIndex || showExposureMonths || showLoadingMonth || showDeliveryMonth || showLinesCount) && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-blue-600 text-white leading-none">
                  {[showBuyer, showSeller, showBuyIndex, showSellIndex, showExposureMonths, showLoadingMonth, showDeliveryMonth, showLinesCount].filter(Boolean).length}
                </span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isColumnsDropdownOpen ? 'rotate-180 text-blue-400' : ''}`} />
            </button>

            {isColumnsDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-64 bg-slate-900 border border-slate-750 rounded-xl shadow-2xl z-50 p-2.5 space-y-2 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider font-mono">Select Columns</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setShowBuyer(true);
                        setShowSeller(true);
                        setShowBuyIndex(true);
                        setShowSellIndex(true);
                        setShowExposureMonths(true);
                        setShowLoadingMonth(true);
                        setShowDeliveryMonth(true);
                        setShowLinesCount(true);
                      }}
                      className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      All
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      onClick={() => {
                        setShowBuyer(false);
                        setShowSeller(false);
                        setShowBuyIndex(false);
                        setShowSellIndex(false);
                        setShowExposureMonths(false);
                        setShowLoadingMonth(false);
                        setShowDeliveryMonth(false);
                        setShowLinesCount(false);
                      }}
                      className="text-[10px] text-slate-400 hover:text-slate-200 font-semibold px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar pr-0.5">
                  {[
                    { id: 'buyer', label: 'Buyer', checked: showBuyer, toggle: () => setShowBuyer(prev => !prev), color: 'bg-blue-400' },
                    { id: 'seller', label: 'Seller', checked: showSeller, toggle: () => setShowSeller(prev => !prev), color: 'bg-blue-400' },
                    { id: 'buyIndex', label: 'Buy Index', checked: showBuyIndex, toggle: () => setShowBuyIndex(prev => !prev), color: 'bg-emerald-400', badge: 'IndexName' },
                    { id: 'sellIndex', label: 'Sell Index', checked: showSellIndex, toggle: () => setShowSellIndex(prev => !prev), color: 'bg-blue-400', badge: 'IndexName' },
                    { id: 'exposureMonths', label: 'Exposure Months', checked: showExposureMonths, toggle: () => setShowExposureMonths(prev => !prev), color: 'bg-amber-400' },
                    { id: 'loadingMonth', label: 'Loading Month', checked: showLoadingMonth, toggle: () => setShowLoadingMonth(prev => !prev), color: 'bg-indigo-400' },
                    { id: 'deliveryMonth', label: 'Delivery Month', checked: showDeliveryMonth, toggle: () => setShowDeliveryMonth(prev => !prev), color: 'bg-indigo-400' },
                    { id: 'linesCount', label: 'Lines Count', checked: showLinesCount, toggle: () => setShowLinesCount(prev => !prev), color: 'bg-slate-400' },
                  ].map(col => (
                    <button
                      key={col.id}
                      onClick={col.toggle}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-left cursor-pointer ${
                        col.checked 
                          ? 'bg-blue-950/40 text-blue-200 hover:bg-blue-900/50' 
                          : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                          col.checked ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-700 bg-slate-950'
                        }`}>
                          {col.checked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                        <span className="font-semibold text-xs font-mono">{col.label}</span>
                      </div>
                      {col.badge && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                          {col.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. KPIs Overview Card Panel */}
      <div className="p-4 border-b border-slate-800 bg-slate-950 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 shrink-0">
        <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[10px] uppercase text-slate-300 font-mono font-extrabold tracking-wider">Total Strategies</div>
            <div className="text-lg font-extrabold text-slate-50 mt-1 font-mono flex items-baseline gap-1">
              {kpis.total} <span className="text-[10px] font-semibold text-slate-300">In View</span>
            </div>
          </div>
          <div className="text-[9.5px] font-mono text-slate-400 mt-2">
            Active Filtered Count
          </div>
        </div>
        
        {/* Purchase Cost */}
        <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[10px] uppercase text-slate-300 font-mono font-extrabold tracking-wider">Purchase Cost</div>
            <div className="text-lg font-extrabold text-emerald-400 mt-1 font-mono flex items-baseline gap-1" title={`Total volume count: ${kpis.aggregatePurchaseVolume.toFixed(2)}`}>
              ${kpis.aggregatePurchaseCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-[9px] font-semibold text-slate-300 ml-1">({Math.floor(kpis.aggregatePurchaseVolume).toLocaleString()} V)</span>
            </div>
          </div>
          <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-end">
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded ${
              kpis.aggregatePurchaseCostPnLChange > 0 
                ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/40' 
                : kpis.aggregatePurchaseCostPnLChange < 0 
                  ? 'text-rose-400 bg-rose-950/60 border border-rose-800/40' 
                  : 'text-slate-400 bg-slate-800/60'
            }`}>
              {kpis.aggregatePurchaseCostPnLChange > 0 ? '▲ +' : kpis.aggregatePurchaseCostPnLChange < 0 ? '▼ -' : ''}
              ${Math.abs(kpis.aggregatePurchaseCostPnLChange).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        {/* Sales Revenue */}
        <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[10px] uppercase text-slate-300 font-mono font-extrabold tracking-wider">Sales Revenue</div>
            <div className="text-lg font-extrabold text-blue-400 mt-1 font-mono flex items-baseline gap-1" title={`Total volume count: ${kpis.aggregateSalesVolume.toFixed(2)}`}>
              ${kpis.aggregateSalesRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-[9px] font-semibold text-slate-300 ml-1">({Math.floor(kpis.aggregateSalesVolume).toLocaleString()} V)</span>
            </div>
          </div>
          <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-end">
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded ${
              kpis.aggregateSalesRevenuePnLChange > 0 
                ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/40' 
                : kpis.aggregateSalesRevenuePnLChange < 0 
                  ? 'text-rose-400 bg-rose-950/60 border border-rose-800/40' 
                  : 'text-slate-400 bg-slate-800/60'
            }`}>
              {kpis.aggregateSalesRevenuePnLChange > 0 ? '▲ +' : kpis.aggregateSalesRevenuePnLChange < 0 ? '▼ -' : ''}
              ${Math.abs(kpis.aggregateSalesRevenuePnLChange).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        {/* Other Costs (SRC + Misc) */}
        <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between" title="Other Costs = Shipping Related Costs (SRC) + Miscellaneous Fee">
          <div>
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase text-slate-300 font-mono font-extrabold tracking-wider">Other Costs</div>
              <span className="text-[9px] font-mono font-bold text-purple-300 bg-purple-950/60 px-1.5 py-0.2 rounded border border-purple-800/40">
                SRC + Misc
              </span>
            </div>
            <div className="text-lg font-extrabold text-purple-400 mt-1 font-mono">
              ${kpis.aggregateOtherCosts.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div className="text-[9px] text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
              <span>SRC: ${kpis.aggregateShippingCosts.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <span className="text-slate-600">•</span>
              <span>Misc: ${kpis.aggregateMiscCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
          <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-end">
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded ${
              kpis.aggregateOtherCostPnLChange > 0 
                ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/40' 
                : kpis.aggregateOtherCostPnLChange < 0 
                  ? 'text-rose-400 bg-rose-950/60 border border-rose-800/40' 
                  : 'text-slate-400 bg-slate-800/60'
            }`}>
              {kpis.aggregateOtherCostPnLChange > 0 ? '▲ +' : kpis.aggregateOtherCostPnLChange < 0 ? '▼ -' : ''}
              ${Math.abs(kpis.aggregateOtherCostPnLChange).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        {/* Physical P&L (Excl. Hedging) */}
        <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[10px] uppercase text-slate-300 font-mono font-extrabold tracking-wider" title="(Sales Revenue - Purchase Cost) + Other Costs">
              Physical P&amp;L
            </div>
            <div className={`text-lg font-extrabold mt-1 font-mono ${kpis.aggregatePhysicalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {kpis.aggregatePhysicalPnL >= 0 ? '+' : '-'}${Math.abs(kpis.aggregatePhysicalPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-end">
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded ${
              kpis.aggregatePhysicalPnLChange > 0 
                ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/40' 
                : kpis.aggregatePhysicalPnLChange < 0 
                  ? 'text-rose-400 bg-rose-950/60 border border-rose-800/40' 
                  : 'text-slate-400 bg-slate-800/60'
            }`}>
              {kpis.aggregatePhysicalPnLChange > 0 ? '▲ +' : kpis.aggregatePhysicalPnLChange < 0 ? '▼ -' : ''}
              ${Math.abs(kpis.aggregatePhysicalPnLChange).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        {/* Hedging operations */}
        <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[10px] uppercase text-slate-300 font-mono font-extrabold tracking-wider">Hedging operations</div>
            <div className="text-lg font-extrabold text-amber-400 mt-1 font-mono flex items-baseline gap-1" title={`Total hedging volume: ${formatUnitVolumes(kpis.aggregateHedgingVolumeByUnit, ' | ', 'neutral')}`}>
              ${kpis.aggregateHedgingPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-[9px] font-semibold text-slate-300 ml-1">({formatUnitVolumes(kpis.aggregateHedgingVolumeByUnit, ' | ', 'neutral')} | {kpis.aggregateHedgingVolumePct.toFixed(1)}%)</span>
            </div>
          </div>
          <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-end">
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded ${
              kpis.aggregateHedgingPnLChange > 0 
                ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/40' 
                : kpis.aggregateHedgingPnLChange < 0 
                  ? 'text-rose-400 bg-rose-950/60 border border-rose-800/40' 
                  : 'text-slate-400 bg-slate-800/60'
            }`}>
              {kpis.aggregateHedgingPnLChange > 0 ? '▲ +' : kpis.aggregateHedgingPnLChange < 0 ? '▼ -' : ''}
              ${Math.abs(kpis.aggregateHedgingPnLChange).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        {/* Aggregate P&L */}
        <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[10px] uppercase text-slate-300 font-mono font-extrabold tracking-wider" title="(Sales - Purchase) + Hedging + SRC">
              Aggregate P&amp;L
            </div>
            <div className={`text-lg font-extrabold mt-1 font-mono ${kpis.aggregatePnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {kpis.aggregatePnL >= 0 ? '+' : '-'}${Math.abs(kpis.aggregatePnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-end">
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded ${
              kpis.aggregateTotalPnLChange > 0 
                ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/40' 
                : kpis.aggregateTotalPnLChange < 0 
                  ? 'text-rose-400 bg-rose-950/60 border border-rose-800/40' 
                  : 'text-slate-400 bg-slate-800/60'
            }`}>
              {kpis.aggregateTotalPnLChange > 0 ? '▲ +' : kpis.aggregateTotalPnLChange < 0 ? '▼ -' : ''}
              ${Math.abs(kpis.aggregateTotalPnLChange).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      </div>

      {viewMode === 'dashboard' ? (
        <ExecutiveDashboard trmsData={trmsData} />
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
      <div ref={tableContainerRef} className="flex-1 overflow-auto custom-scrollbar relative bg-slate-950">
        {filteredAndSortedSummaryData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center h-full max-w-md mx-auto">
            <Database className="w-10 h-10 text-slate-500 mb-3" />
            <h4 className="text-sm font-bold text-slate-300">No Summarized Outputs found</h4>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              Either upload a valid TRMS spreadsheet containing Strategy records, select the correct year / date filter, or modify your active parameters.
            </p>
          </div>
        ) : (
          <div className="min-w-max pb-10 font-sans">
            <table className="w-full text-left border-collapse text-xs gridlines-active bg-slate-950 text-slate-100 selection:bg-blue-600 selection:text-white">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-750 sticky top-0 z-30 font-extrabold uppercase tracking-wider text-[11px] text-slate-200 shadow-xs">
                  <th className="py-3 px-3 w-8 bg-slate-900"></th>
                  {columns.map((col, idx) => {
                    const isFiltered = !!columnFilters[col];
                    const isSorted = sortConfig.column === col;
                    const isRightAligned = numCols.includes(col);
                    const isRightHalf = idx > columns.length / 2;

                    return (
                      <th 
                        key={col} 
                        className={`py-3.5 px-4 hover:bg-slate-800/80 transition-colors relative ${isRightAligned ? 'text-right' : 'text-left'}`}
                      >
                        <div className={`flex items-center gap-1 group justify-between ${isRightAligned ? 'flex-row-reverse' : ''}`}>
                          <span className="truncate max-w-[150px] text-slate-200 font-bold tracking-wide" title={col}>{col}</span>
                          
                          <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
                            {isSorted && (
                              <span className="text-blue-400">
                                {sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
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
              <tbody className="divide-y divide-slate-800/60 bg-slate-950">
                {paginatedSummaryData.map((item, index) => {
                  const isExpanded = expandedStrategies.has(item.strategyName);
                  const activeDetailFilter = expandedFilters[item.strategyName] || 'base_lng';

                  return (
                    <React.Fragment key={item.strategyName}>
                      <tr 
                        className={`hover:bg-slate-850/90 transition-colors cursor-pointer group ${isExpanded ? 'bg-slate-900 border-l-4 border-blue-500 text-white' : 'text-slate-100 even:bg-slate-900/30'}`}
                        onClick={() => toggleRowExpansion(item.strategyName)}
                      >
                        <td className="py-3 px-3 text-center text-slate-500">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-blue-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                          )}
                        </td>

                        {/* Strategy Name */}
                        <td 
                          className="py-3 px-4 font-extrabold text-slate-100 tracking-tight text-xs hover:text-blue-400 hover:underline"
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
                          let cellStyle = `py-2.5 px-4 font-mono text-slate-200 transition-all ${numCols.includes(col) ? 'text-right' : 'text-left'}`;
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

                        // Extract unique indices dynamically
                        const uniqueSubIndices = Array.from(
                          new Set<string>(
                            unfilteredSubRows
                              .map((r: any) => getReadableIndexName(parseIndexFromReference(r['Reference'])))
                              .filter(x => x && x !== '—')
                          )
                        ).sort();

                        // Extract unique exposure months dynamically
                        const uniqueSubExposureMonths = sortExposureMonths(
                          Array.from(
                            new Set<string>(
                              unfilteredSubRows
                                .map((r: any) => decodeExposureMonth(parseExpiryFromReference(r['Reference'])))
                                .filter(x => x && x !== '—')
                            )
                          )
                        );

                        const subSearch = (subTableSearches[item.strategyName] || '').toLowerCase().trim();
                        const subBs = subTableBuySellFilters[item.strategyName] || 'all';
                        const subPort = subTablePortfolioFilters[item.strategyName] || 'all';

                        // Column filter definitions for sub-table
                        const subColumns = [
                          'Deal Num',
                          'Reference',
                          ...(activeDetailFilter === 'hedging' ? ['Ref Index', 'Ref Buyer', 'Ref Exposure Month'] : []),
                          'EOD Date',
                          'Portfolio',
                          'Buy/Sell',
                          'Ins Type',
                          'Cflow Type',
                          'Settlement Type',
                          'Exposure Month',
                          'Vol Type',
                          'Volume',
                          'Price',
                          'Value USD',
                          'Change in P&L'
                        ];

                        // Helper function to extract cell string value for a row & column in sub-table
                        const getSubCellString = (r: any, colName: string): string => {
                          switch (colName) {
                            case 'Deal Num':
                              return String(r['Deal Num'] || '').trim();
                            case 'Reference':
                              return String(r['Reference'] || '').trim();
                            case 'Ref Index':
                              return getReadableIndexName(parseIndexFromReference(r['Reference'])) || '—';
                            case 'Ref Buyer':
                              return parseBuyerFromReference(r['Reference']) || '—';
                            case 'Ref Exposure Month':
                              return decodeExposureMonth(parseExpiryFromReference(r['Reference'])) || '—';
                            case 'EOD Date':
                              return String(r['EOD Date'] || r['EOD_Date'] || '').trim();
                            case 'Portfolio':
                              return String(r['Internal Portfolio'] || r['Portfolio'] || '').trim();
                            case 'Buy/Sell':
                              return String(r['Buy_Sell'] || r['BuySell'] || '').trim();
                            case 'Ins Type':
                              return String(r['Ins Type'] || r['InsType'] || '').trim();
                            case 'Cflow Type':
                              return String(r['Cflow Type'] || r['CflowType'] || '').trim();
                            case 'Settlement Type': {
                              const rawSett = String(r['Settlement Type'] || '').trim();
                              if (rawSett && rawSett !== '—') return rawSett;
                              const cf = String(r['Cflow Type'] || '').trim().toLowerCase();
                              if (cf !== 'commodity') return rawSett || '—';
                              const strategyRows = item.underlyingRows;
                              const hasOpt = strategyRows.some((sr: any) => {
                                const port = String(sr['Internal Portfolio'] || sr['Portfolio'] || '').trim().toLowerCase();
                                return port === 'optimization lng' || port.includes('optimization');
                              });
                              const hasBuy = strategyRows.some((sr: any) => {
                                const buySell = String(sr['Buy_Sell'] || sr['BuySell'] || '').trim().toLowerCase();
                                const cflow = String(sr['Cflow Type'] || '').trim().toLowerCase();
                                return (buySell === 'buy' || buySell === 'buys') && cflow === 'commodity';
                              });
                              const hasSell = strategyRows.some((sr: any) => {
                                const buySell = String(sr['Buy_Sell'] || sr['BuySell'] || '').trim().toLowerCase();
                                const cflow = String(sr['Cflow Type'] || '').trim().toLowerCase();
                                return (buySell === 'sell' || buySell === 'sells') && cflow === 'commodity';
                              });
                              const isBuyRow = String(r['Buy_Sell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || '').toLowerCase() === 'buys';
                              const isSellRow = String(r['Buy_Sell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || '').toLowerCase() === 'sells';
                              if (hasOpt) {
                                const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
                                return (port === 'optimization lng' || port.includes('optimization')) ? (rawSett || 'Cash Settlement') : 'Physical Settlement';
                              } else {
                                if (!hasBuy && hasSell) return isBuyRow ? 'Physical Settlement' : 'Cash Settlement';
                                else if (hasBuy && !hasSell) return isSellRow ? 'Physical Settlement' : 'Cash Settlement';
                                else if (hasBuy && hasSell) return rawSett || 'Cash Settlement';
                              }
                              return rawSett || 'Cash Settlement';
                            }
                            case 'Exposure Month': {
                              const expM = decodeExposureMonth(parseExpiryFromReference(r['Reference']));
                              return (expM && expM !== '—') ? expM : (getRowExposureMonth(r) || '—');
                            }
                            case 'Vol Type':
                              return String(r['Volume Type'] || r['Vol Type'] || r['VolType'] || '').trim();
                            case 'Volume': {
                              const rawVol = Number(String(r['Volume'] || '').replace(/[^0-9.-]/g, ''));
                              const uVol = convertVolume(rawVol, r['Unit'] || r['unit']);
                              return isNaN(uVol) ? '—' : uVol.toLocaleString(undefined, { maximumFractionDigits: 2 });
                            }
                            case 'Price': {
                              const p = Number(String(r['Price'] || '').replace(/[^0-9.-]/g, ''));
                              return isNaN(p) ? '—' : p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
                            }
                            case 'Value USD': {
                              const v = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
                              return isNaN(v) ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
                            }
                            case 'Change in P&L': {
                              const pnl = Number(String(r['Change_in_Total_PnL'] || r['Change_in_PnL'] || '').replace(/[^0-9.-]/g, ''));
                              return isNaN(pnl) ? '—' : pnl.toLocaleString(undefined, { maximumFractionDigits: 2 });
                            }
                            default:
                              return String(r[colName] || '').trim();
                          }
                        };

                        // Unique values generator for popover checklist
                        const getSubUniqueValuesForCol = (colName: string) => {
                          const counts: Record<string, number> = {};
                          unfilteredSubRows.forEach((r: any) => {
                            const val = getSubCellString(r, colName) || '—';
                            counts[val] = (counts[val] || 0) + 1;
                          });
                          return Object.entries(counts)
                            .map(([value, count]) => ({ value, count }))
                            .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
                        };

                        // Active column filters for this strategy
                        const colFilters = subTableColumnFilters[item.strategyName] || {};
                        const currentSubSort = subTableSortConfig[item.strategyName];

                        // Filtered rows for sub-table
                        let filteredSubRows = unfilteredSubRows.filter((r: any) => {
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
                          // Reference format filter
                          const subRefFilter = subTableRefFilters[item.strategyName] || 'all';
                          if (subRefFilter !== 'all') {
                            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
                            const isTargetPort = port === 'hedging lng' || port === 'dh lng' || port === 'dft lng';
                            const validation = isTargetPort ? validateReferenceFormat(r['Reference'] || '') : { isValid: true };
                            if (subRefFilter === 'valid' && !validation.isValid) return false;
                            if (subRefFilter === 'invalid' && validation.isValid) return false;
                          }
                          // Index filter
                          const subIndex = subTableIndexFilters[item.strategyName] || 'all';
                          if (subIndex !== 'all') {
                            const rowIdx = getReadableIndexName(parseIndexFromReference(r['Reference']));
                            if (rowIdx !== subIndex) return false;
                          }
                          // Exposure Month filter
                          const subExpMonth = subTableExposureMonthFilters[item.strategyName] || 'all';
                          if (subExpMonth !== 'all') {
                            const rowExpMonth = decodeExposureMonth(parseExpiryFromReference(r['Reference']));
                            if (rowExpMonth !== subExpMonth) return false;
                          }

                          // Apply per-column header filters
                          for (const [colName, filter] of Object.entries(colFilters)) {
                            if (!filter) continue;
                            const cellVal = getSubCellString(r, colName);

                            // Checkbox filter
                            if (filter.selectedValues && filter.selectedValues.size > 0) {
                              const matchVal = cellVal || '—';
                              if (!filter.selectedValues.has(matchVal)) return false;
                            }

                            // Condition filter
                            if (filter.condition && filter.condition !== 'none') {
                              const rawNum = Number(cellVal.replace(/[^0-9.-]/g, ''));
                              const isNum = !isNaN(rawNum) && cellVal !== '—';

                              const v1Num = Number(filter.conditionValue1);
                              const v2Num = Number(filter.conditionValue2);
                              const valLower = cellVal.toLowerCase();
                              const c1Lower = (filter.conditionValue1 || '').toLowerCase();

                              switch (filter.condition) {
                                case 'equals':
                                  if (valLower !== c1Lower) return false;
                                  break;
                                case 'not_equals':
                                  if (valLower === c1Lower) return false;
                                  break;
                                case 'contains':
                                  if (!valLower.includes(c1Lower)) return false;
                                  break;
                                case 'not_contains':
                                  if (valLower.includes(c1Lower)) return false;
                                  break;
                                case 'starts_with':
                                  if (!valLower.startsWith(c1Lower)) return false;
                                  break;
                                case 'ends_with':
                                  if (!valLower.endsWith(c1Lower)) return false;
                                  break;
                                case 'is_empty':
                                  if (cellVal && cellVal !== '—') return false;
                                  break;
                                case 'is_not_empty':
                                  if (!cellVal || cellVal === '—') return false;
                                  break;
                                case 'greater_than':
                                  if (!isNum || isNaN(v1Num) || rawNum <= v1Num) return false;
                                  break;
                                case 'greater_than_or_equal':
                                  if (!isNum || isNaN(v1Num) || rawNum < v1Num) return false;
                                  break;
                                case 'less_than':
                                  if (!isNum || isNaN(v1Num) || rawNum >= v1Num) return false;
                                  break;
                                case 'less_than_or_equal':
                                  if (!isNum || isNaN(v1Num) || rawNum > v1Num) return false;
                                  break;
                                case 'between':
                                  if (!isNum || isNaN(v1Num) || isNaN(v2Num) || rawNum < v1Num || rawNum > v2Num) return false;
                                  break;
                                default:
                                  break;
                              }
                            }
                          }

                          return true;
                        });

                        // Apply sorting for sub-table
                        if (currentSubSort && currentSubSort.column && currentSubSort.direction) {
                          const { column, direction } = currentSubSort;
                          filteredSubRows = [...filteredSubRows].sort((a: any, b: any) => {
                            const valA = getSubCellString(a, column);
                            const valB = getSubCellString(b, column);

                            const numA = Number(valA.replace(/[^0-9.-]/g, ''));
                            const numB = Number(valB.replace(/[^0-9.-]/g, ''));
                            if (!isNaN(numA) && !isNaN(numB) && valA !== '—' && valB !== '—') {
                              return direction === 'asc' ? numA - numB : numB - numA;
                            }
                            return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                          });
                        }

                        // Totals calculations
                        const subTotals = filteredSubRows.reduce(
                          (acc, r) => {
                            const rawVol = Number(String(r['Volume'] || '').replace(/[^0-9.-]/g, ''));
                            const vol = convertVolume(rawVol, r['Unit'] || r['unit']);
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

                        const hasAnySubFilterActive = (subTableSearches[item.strategyName] || '') ||
                          (subTableBuySellFilters[item.strategyName] || 'all') !== 'all' ||
                          (subTablePortfolioFilters[item.strategyName] || 'all') !== 'all' ||
                          (subTableRefFilters[item.strategyName] || 'all') !== 'all' ||
                          (subTableIndexFilters[item.strategyName] || 'all') !== 'all' ||
                          (subTableExposureMonthFilters[item.strategyName] || 'all') !== 'all' ||
                          Object.keys(colFilters).length > 0 ||
                          !!(currentSubSort?.column && currentSubSort?.direction);

                        const clearAllSubFiltersFn = () => {
                          setSubTableSearches(prev => { const n = { ...prev }; delete n[item.strategyName]; return n; });
                          setSubTableBuySellFilters(prev => { const n = { ...prev }; delete n[item.strategyName]; return n; });
                          setSubTablePortfolioFilters(prev => { const n = { ...prev }; delete n[item.strategyName]; return n; });
                          setSubTableRefFilters(prev => { const n = { ...prev }; delete n[item.strategyName]; return n; });
                          setSubTableIndexFilters(prev => { const n = { ...prev }; delete n[item.strategyName]; return n; });
                          setSubTableExposureMonthFilters(prev => { const n = { ...prev }; delete n[item.strategyName]; return n; });
                          setSubTableColumnFilters(prev => { const n = { ...prev }; delete n[item.strategyName]; return n; });
                          setSubTableSortConfig(prev => { const n = { ...prev }; delete n[item.strategyName]; return n; });
                          setSubFilterSearchTerms(prev => { const n = { ...prev }; delete n[item.strategyName]; return n; });
                        };

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
                                      onClick={() => setExpandedFilters(prev => ({ ...prev, [item.strategyName]: 'other_costs' }))}
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                        activeDetailFilter === 'other_costs' || activeDetailFilter === 'shipping_costs'
                                          ? 'bg-purple-600 text-white shadow-sm'
                                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                      }`}
                                      title="Filter list to Other Costs (Shipping Related Costs + Misc Fees)"
                                    >
                                      Other Costs (SRC/Misc)
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

                                    {/* Reference Status Dropdown filter */}
                                    <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
                                      <select
                                        value={subTableRefFilters[item.strategyName] || 'all'}
                                        onChange={(e) => setSubTableRefFilters(prev => ({ ...prev, [item.strategyName]: e.target.value }))}
                                        className="bg-transparent text-slate-300 border-none select-[none] focus:ring-0 outline-none text-[10px] font-bold font-mono py-0 pl-1 pr-4 cursor-pointer"
                                      >
                                        <option value="all" className="bg-slate-900 text-slate-300">All Ref Status</option>
                                        <option value="valid" className="bg-slate-900 text-slate-300">Valid Refs Only</option>
                                        <option value="invalid" className="bg-slate-900 text-amber-400 font-bold">⚠️ Compliance Alerts</option>
                                      </select>
                                    </div>

                                    {/* Index Dropdown filter */}
                                    {uniqueSubIndices.length > 0 && (
                                      <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
                                        <select
                                          value={subTableIndexFilters[item.strategyName] || 'all'}
                                          onChange={(e) => setSubTableIndexFilters(prev => ({ ...prev, [item.strategyName]: e.target.value }))}
                                          className="bg-transparent text-slate-300 border-none select-[none] focus:ring-0 outline-none text-[10px] font-bold font-mono py-0 pl-1 pr-4 cursor-pointer"
                                        >
                                          <option value="all" className="bg-slate-900 text-slate-300">All Indices</option>
                                          {uniqueSubIndices.map(idxName => (
                                            <option key={idxName} value={idxName} className="bg-slate-900 text-slate-350">{idxName}</option>
                                          ))}
                                        </select>
                                      </div>
                                    )}

                                    {/* Exposure Month Dropdown filter */}
                                    {uniqueSubExposureMonths.length > 0 && (
                                      <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
                                        <select
                                          value={subTableExposureMonthFilters[item.strategyName] || 'all'}
                                          onChange={(e) => setSubTableExposureMonthFilters(prev => ({ ...prev, [item.strategyName]: e.target.value }))}
                                          className="bg-transparent text-slate-300 border-none select-[none] focus:ring-0 outline-none text-[10px] font-bold font-mono py-0 pl-1 pr-4 cursor-pointer"
                                        >
                                          <option value="all" className="bg-slate-900 text-slate-300">All Exposure Months</option>
                                          {uniqueSubExposureMonths.map(m => (
                                            <option key={m} value={m} className="bg-slate-900 text-slate-350">{m}</option>
                                          ))}
                                        </select>
                                      </div>
                                    )}

                                    {/* Clear Sub Filters button */}
                                    {hasAnySubFilterActive && (
                                      <button
                                        type="button"
                                        onClick={clearAllSubFiltersFn}
                                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors mr-1 cursor-pointer"
                                        title="Clear expanded filters"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Active Column Filters Pills Bar */}
                              {Object.keys(colFilters).length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5 py-1.5 px-3 bg-slate-900 border border-slate-800 rounded-lg mb-3">
                                  <span className="text-[9.5px] font-bold text-slate-400 uppercase font-mono tracking-wider">Active Column Filters:</span>
                                  {Object.entries(colFilters).map(([colName, filter]) => {
                                    const hasChecked = filter.selectedValues && filter.selectedValues.size > 0;
                                    const hasCond = filter.condition && filter.condition !== 'none';
                                    if (!hasChecked && !hasCond) return null;
                                    return (
                                      <span key={colName} className="text-[10px] bg-blue-950 border border-blue-800 text-blue-300 px-2 py-0.5 rounded-md flex items-center gap-1 font-mono shadow-xs">
                                        <span className="font-bold">{colName}:</span>
                                        {hasCond && (
                                          <span>{filter.condition.replace(/_/g, ' ')} {filter.conditionValue1} {filter.conditionValue2 ? `& ${filter.conditionValue2}` : ''}</span>
                                        )}
                                        {hasChecked && (
                                          <span>{filter.selectedValues.size} selected</span>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => handleClearSubColumnFilter(item.strategyName, colName)}
                                          className="hover:text-rose-300 ml-1 cursor-pointer"
                                          title={`Clear ${colName} filter`}
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </span>
                                    );
                                  })}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSubTableColumnFilters(prev => { const n = { ...prev }; delete n[item.strategyName]; return n; });
                                      setSubTableSortConfig(prev => { const n = { ...prev }; delete n[item.strategyName]; return n; });
                                    }}
                                    className="text-[9.5px] text-rose-400 hover:text-rose-300 hover:underline font-mono ml-auto cursor-pointer font-semibold"
                                  >
                                    Clear Column Filters
                                  </button>
                                </div>
                              )}

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
                                    No records match your active search or column filter criteria inside this strategy.
                                  </span>
                                  <button
                                    type="button"
                                    onClick={clearAllSubFiltersFn}
                                    className="mt-2 text-[10px] bg-slate-950 hover:bg-slate-850 px-2.5 py-1 rounded text-blue-400 border border-slate-800 cursor-pointer font-bold"
                                  >
                                    Clear All Filters &amp; Search
                                  </button>
                                </div>
                              ) : (
                                <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900 shadow-sm">
                                  <table className="w-full text-left font-mono text-[10.5px]">
                                    <thead className="bg-slate-950 text-slate-400 font-mono select-none sticky top-0 z-20">
                                      <tr className="border-b border-slate-800 text-slate-350">
                                        {subColumns.map((col, cIdx) => {
                                          const isFiltered = !!colFilters[col] && (colFilters[col].selectedValues.size > 0 || colFilters[col].condition !== 'none');
                                          const isSorted = currentSubSort?.column === col && currentSubSort?.direction !== null;
                                          const isRightAligned = ['Volume', 'Price', 'Value USD', 'Change in P&L'].includes(col);
                                          const isRightHalf = cIdx > subColumns.length / 2;
                                          const menuKey = `${item.strategyName}::${col}`;

                                          return (
                                            <th key={col} className={`py-1.5 px-3 font-semibold relative select-none ${isRightAligned ? 'text-right' : 'text-left'}`}>
                                              <div className={`flex items-center gap-1.5 ${isRightAligned ? 'justify-end' : 'justify-between'}`}>
                                                <span
                                                  onClick={() => handleSubSortToggle(item.strategyName, col)}
                                                  className="cursor-pointer hover:text-white transition-colors flex items-center gap-1"
                                                  title={`Click to sort by ${col}`}
                                                >
                                                  {col}
                                                  {isSorted && (
                                                    currentSubSort.direction === 'asc'
                                                      ? <ChevronUp className="w-3 h-3 text-indigo-400 inline" />
                                                      : <ChevronDown className="w-3 h-3 text-rose-400 inline" />
                                                  )}
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveSubFilterMenu(prev => prev === menuKey ? null : menuKey);
                                                  }}
                                                  className={`p-0.5 rounded transition-colors cursor-pointer ${
                                                    isFiltered ? 'text-amber-400 bg-slate-800' : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
                                                  }`}
                                                  title={`Filter ${col}`}
                                                >
                                                  <Filter className="w-3 h-3" />
                                                </button>
                                              </div>

                                              {/* Column Filter Popover Panel */}
                                              {activeSubFilterMenu === menuKey && (
                                                <div className={`absolute top-full mt-1.5 z-50 text-left normal-case ${isRightHalf ? 'right-0' : 'left-0'}`} ref={subMenuRef}>
                                                  <ColumnFilterPopover
                                                    columnName={col}
                                                    filter={colFilters[col] || { selectedValues: new Set(), condition: 'none', conditionValue1: '', conditionValue2: '' }}
                                                    uniqueValues={getSubUniqueValuesForCol(col)}
                                                    filterSearchTerm={subFilterSearchTerms[item.strategyName]?.[col] || ''}
                                                    setFilterSearchTerm={(val) => setSubFilterSearchTerms(prev => ({
                                                      ...prev,
                                                      [item.strategyName]: { ...(prev[item.strategyName] || {}), [col]: val }
                                                    }))}
                                                    onApplyCondition={(condition, val1, val2) => handleApplySubConditionFilter(item.strategyName, col, condition, val1, val2)}
                                                    onToggleCheckbox={(val) => handleToggleSubUniqueValueCheckbox(item.strategyName, col, val)}
                                                    onSelectAll={(sel) => handleSelectAllSubUniqueValues(item.strategyName, col, getSubUniqueValuesForCol(col), sel)}
                                                    onClear={() => handleClearSubColumnFilter(item.strategyName, col)}
                                                    onClose={() => setActiveSubFilterMenu(null)}
                                                    sortConfig={currentSubSort?.column === col ? currentSubSort : { column: col, direction: null }}
                                                    onSortChange={(dir) => handleSubSortChange(item.strategyName, col, dir)}
                                                  />
                                                </div>
                                              )}
                                            </th>
                                          );
                                        })}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-850 bg-slate-900">
                                      {filteredSubRows.map((uRow: any, subIdx) => {
                                        const uVal = Number(String(uRow['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
                                        const rawVol = Number(String(uRow['Volume'] || '').replace(/[^0-9.-]/g, ''));
                                        const uVol = convertVolume(rawVol, uRow['Unit'] || uRow['unit']);
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
                                            <td className="py-1.5 px-3 max-w-[240px]" title={uRow['Reference']}>
                                              {(() => {
                                                const port = String(uRow['Internal Portfolio'] || uRow['Portfolio'] || '').trim().toLowerCase();
                                                const isTargetPort = port === 'hedging lng' || port === 'dh lng' || port === 'dft lng';
                                                const refValidation = isTargetPort ? validateReferenceFormat(uRow['Reference'] || '') : { isValid: true };
                                                return (
                                                  <div className="flex flex-col gap-0.5">
                                                    <div className="flex items-center gap-1.5">
                                                      <span className={`font-mono font-bold ${!refValidation.isValid ? 'text-amber-500 font-extrabold animate-pulse' : 'text-slate-200'}`}>
                                                        {uRow['Reference'] || '—'}
                                                      </span>
                                                      {!refValidation.isValid && (
                                                        <span 
                                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-950/55 border border-amber-800/45 text-amber-300 text-[9px] rounded-md font-bold uppercase tracking-wider font-sans"
                                                          title={`Validation Failure: ${refValidation.error}`}
                                                        >
                                                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                                                          Alert
                                                        </span>
                                                      )}
                                                    </div>
                                                    {!refValidation.isValid && (
                                                      <span className="text-[9px] text-rose-400 font-sans leading-none">
                                                        {refValidation.error}
                                                      </span>
                                                    )}
                                                  </div>
                                                );
                                              })()}
                                            </td>
                                            {activeDetailFilter === 'hedging' && (
                                              <>
                                                <td className="py-1.5 px-3">
                                                  {renderIndexPill(parseIndexFromReference(uRow['Reference']))}
                                                </td>
                                                <td className="py-1.5 px-3 font-bold text-slate-200">
                                                  {parseBuyerFromReference(uRow['Reference'])}
                                                </td>
                                                <td className="py-1.5 px-3 text-slate-400 font-semibold">
                                                  {decodeExposureMonth(parseExpiryFromReference(uRow['Reference']))}
                                                </td>
                                              </>
                                            )}
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
                                            <td className="py-1.5 px-3 text-right text-slate-200">{isNaN(uVol) ? '—' : `${uVol.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${uRow['Unit'] || uRow['unit'] || 'MMBtu'}`}</td>
                                            <td className="py-1.5 px-3 text-right text-slate-350">{isNaN(uPrice) ? '—' : `$${uPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`}</td>
                                            <td className="py-1.5 px-3 text-right text-slate-100">
                                              ${isNaN(uVal) ? '—' : uVal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                            </td>
                                            <td className="py-1.5 px-3 text-right font-mono">
                                              {(() => {
                                                const pnl = Number(String(uRow['Change_in_Total_PnL'] || uRow['Change_in_PnL'] || '').replace(/[^0-9.-]/g, ''));
                                                if (isNaN(pnl) || pnl === 0) return <span className="text-slate-550">—</span>;
                                                const sign = pnl >= 0 ? '+' : '-';
                                                const colorClass = pnl >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold';
                                                return (
                                                  <span className={colorClass}>
                                                    {sign}${Math.abs(pnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                  </span>
                                                );
                                              })()}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot className="bg-slate-950 border-t border-slate-800 font-bold text-slate-200">
                                      <tr>
                                        <td colSpan={activeDetailFilter === 'hedging' ? 13 : 10} className="py-2 px-3 text-slate-450 text-left uppercase tracking-wider font-extrabold text-[10px]">
                                          SUBTOTAL SUM
                                        </td>
                                        <td className="py-2 px-3 text-right text-blue-400 font-mono">
                                          {subTotals.totalVol === 0 ? '—' : `${subTotals.totalVol.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${(() => {
                                            const units = Array.from(new Set(filteredSubRows.map((r: any) => String(r['Unit'] || r['unit'] || 'MMBtu').trim())));
                                            return units.length === 1 ? units[0] : (selectedUnit !== 'ALL' ? selectedUnit : 'Units');
                                          })()}`}
                                        </td>
                                        <td className="py-2 px-3 text-right text-slate-350 font-mono">
                                          {subAvgPrice === 0 ? '—' : `$${subAvgPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`}
                                        </td>
                                        <td className="py-2 px-3 text-right text-slate-100 font-mono">
                                          ${subTotals.totalVal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                        </td>
                                        <td className={`py-2 px-3 text-right font-mono ${subTotals.totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                          {subTotals.totalPnL >= 0 ? '+' : '-'}${Math.abs(subTotals.totalPnL).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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

        {/* 6. Pagination & Rows-Per-Page Footer */}
        {filteredAndSortedSummaryData.length > 0 && (
          <div className="px-4 py-2.5 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs text-slate-200">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-semibold text-[11px]">Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-slate-950 border border-slate-750 rounded-lg px-2.5 py-1 text-slate-100 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer text-xs"
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={0}>All ({filteredAndSortedSummaryData.length})</option>
              </select>
              <span className="text-slate-400 font-mono text-[11.5px] ml-2">
                {pageSize === 0 ? (
                  `Showing all ${filteredAndSortedSummaryData.length} strategies`
                ) : (
                  `Showing ${Math.min((currentPage - 1) * pageSize + 1, filteredAndSortedSummaryData.length)}–${Math.min(currentPage * pageSize, filteredAndSortedSummaryData.length)} of ${filteredAndSortedSummaryData.length} strategies`
                )}
              </span>
            </div>

            {pageSize > 0 && totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  className="px-2 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-[11px] font-bold transition-all"
                  title="First Page"
                >
                  « First
                </button>
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-[11px] font-bold transition-all"
                >
                  ‹ Prev
                </button>
                <span className="px-2.5 font-mono font-bold text-blue-400 text-xs">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-[11px] font-bold transition-all"
                >
                  Next ›
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="px-2 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-[11px] font-bold transition-all"
                  title="Last Page"
                >
                  Last »
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
    )}

      {/* Custom Group Categorization Modal */}
      <AnimatePresence>
        {isCustomGroupModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden text-slate-100"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400">
                    <FolderKanban className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      Custom Portfolio Categorization
                      <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-mono font-semibold border border-blue-500/30">
                        {Object.keys(customSnOverrides).length} Overrides Active
                      </span>
                    </h2>
                    <p className="text-xs text-slate-400">
                      Group Strategy Names (SNs) into custom portfolios like <span className="text-blue-300 font-semibold font-mono">"Carved Out"</span> or custom groups.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsCustomGroupModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                {/* Section 1: Create New Group Portfolio */}
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Boxes className="w-4 h-4 text-blue-400" />
                    1. Add New Group Portfolio
                  </h3>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newGroupNameInput}
                      onChange={(e) => setNewGroupNameInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddCustomGroup()}
                      placeholder="e.g. Carved Out, Project Alpha, Strategic Reserve..."
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                    />
                    <button
                      onClick={handleAddCustomGroup}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <span>+</span> Add Portfolio Group
                    </button>
                  </div>
                  
                  {/* List of active group portfolios */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[10px] text-slate-400 uppercase font-mono font-semibold">Active Groups:</span>
                    {customGroupsList.map(grp => (
                      <span key={grp} className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-850 border border-slate-700 text-slate-200 text-xs rounded-md font-mono font-semibold">
                        <span>{grp}</span>
                        {!DEFAULT_GROUPS.includes(grp) && grp !== 'Others' && (
                          <button 
                            onClick={() => handleRemoveCustomGroup(grp)}
                            className="hover:text-rose-400 ml-1 text-slate-400 cursor-pointer"
                            title="Delete group portfolio"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Section 2: Strategy Names Categorization Table */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                        <ListFilter className="w-4 h-4 text-blue-400" />
                        2. Categorize Strategy Names (SNs)
                      </h3>
                      <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">
                        {filteredModalSns.length} SNs Total
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Search */}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          value={modalSearchTerm}
                          onChange={(e) => setModalSearchTerm(e.target.value)}
                          placeholder="Search Strategy Names..."
                          className="bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono w-48"
                        />
                      </div>

                      {/* Filter by current group */}
                      <select
                        value={modalFilterGroup}
                        onChange={(e) => setModalFilterGroup(e.target.value)}
                        className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500 font-mono cursor-pointer"
                      >
                        <option value="ALL">All Groups</option>
                        {customGroupsList.map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                        <option value="Others">Others</option>
                        <option value="OVERRIDDEN">Custom Overridden Only</option>
                      </select>
                    </div>
                  </div>

                  {/* Batch Action Bar if items selected */}
                  {selectedModalSns.size > 0 && (
                    <div className="bg-blue-950/60 border border-blue-800/80 p-3 rounded-xl flex items-center justify-between gap-3 text-xs animate-fadeIn">
                      <span className="font-bold text-blue-200 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-blue-400" />
                        {selectedModalSns.size} Strategy Name(s) selected
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-300 font-semibold">Move to:</span>
                        <select
                          value={batchTargetGroup}
                          onChange={(e) => setBatchTargetGroup(e.target.value)}
                          className="bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-blue-400 font-mono cursor-pointer"
                        >
                          {customGroupsList.map(g => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                          <option value="Carved Out">Carved Out</option>
                          <option value="Others">Others</option>
                        </select>
                        <button
                          onClick={handleApplyBatchGroup}
                          className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1 rounded-lg transition-colors shadow-sm cursor-pointer"
                        >
                          Apply Group
                        </button>
                        <button
                          onClick={() => setSelectedModalSns(new Set())}
                          className="text-slate-400 hover:text-white px-2 py-1 cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Table of SNs */}
                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40 max-h-96 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] sticky top-0 z-10 border-b border-slate-800">
                        <tr>
                          <th className="p-3 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={filteredModalSns.length > 0 && filteredModalSns.every(sn => selectedModalSns.has(sn))}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedModalSns(new Set(filteredModalSns));
                                } else {
                                  setSelectedModalSns(new Set());
                                }
                              }}
                              className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
                            />
                          </th>
                          <th className="p-3">Strategy Name (SN)</th>
                          <th className="p-3">Default Rule Group</th>
                          <th className="p-3">Assigned Group Portfolio</th>
                          <th className="p-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                        {filteredModalSns.map((sn) => {
                          const normKey = normalizeSnKey(sn);
                          const hasOverride = !!customSnOverrides[normKey] || !!customSnOverrides[sn];
                          const currentGroup = getGroupName(sn);
                          const defaultRuleGroup = getDefaultRuleGroup(sn);
                          const isSelected = selectedModalSns.has(sn);

                          return (
                            <tr 
                              key={sn} 
                              className={`hover:bg-slate-850/80 transition-colors ${
                                isSelected ? 'bg-blue-950/30' : hasOverride ? 'bg-blue-950/10' : ''
                              }`}
                            >
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    const next = new Set(selectedModalSns);
                                    if (e.target.checked) next.add(sn);
                                    else next.delete(sn);
                                    setSelectedModalSns(next);
                                  }}
                                  className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
                                />
                              </td>
                              <td className="p-3 font-semibold text-white">
                                {sn}
                              </td>
                              <td className="p-3 text-slate-400">
                                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px]">
                                  {defaultRuleGroup}
                                </span>
                              </td>
                              <td className="p-3">
                                <select
                                  value={currentGroup}
                                  onChange={(e) => handleSingleSnGroupChange(sn, e.target.value)}
                                  className={`px-2.5 py-1 rounded-md text-xs font-bold border font-mono focus:outline-none cursor-pointer ${
                                    hasOverride 
                                      ? 'bg-blue-950 text-blue-200 border-blue-700 shadow-sm'
                                      : 'bg-slate-900 text-slate-300 border-slate-700'
                                  }`}
                                >
                                  {customGroupsList.map(g => (
                                    <option key={g} value={g}>{g}</option>
                                  ))}
                                  <option value="Carved Out">Carved Out</option>
                                  <option value="Others">Others</option>
                                </select>
                              </td>
                              <td className="p-3 text-right">
                                {hasOverride ? (
                                  <button
                                    onClick={() => handleResetSnOverride(sn)}
                                    className="text-[10px] text-rose-400 hover:text-rose-300 hover:underline cursor-pointer"
                                  >
                                    Reset
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-slate-500">Default</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {filteredModalSns.length === 0 && (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-slate-500">
                              No Strategy Names found matching criteria.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
                <button
                  onClick={handleResetAllOverrides}
                  className="text-xs text-rose-400 hover:text-rose-300 hover:underline flex items-center gap-1 font-mono cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reset All Custom Categorization Overrides
                </button>
                <button
                  onClick={() => setIsCustomGroupModalOpen(false)}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-all shadow-md cursor-pointer"
                >
                  Done &amp; Save
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
