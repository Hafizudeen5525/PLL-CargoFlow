import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, 
  TrendingDown, 
  Layers, 
  Activity, 
  ArrowDownCircle,
  TrendingDown as DrawdownIcon
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid,
  ReferenceLine,
  Cell,
  ComposedChart,
  Legend
} from 'recharts';

// Data types matching user-pasted format exactly
interface MultiUnitRecord {
  id: string;
  date: string; // formatted YYYY-MM-DD
  values: { [key: string]: number };
}

interface UnitMetricResult {
  date: string;
  unit: string;
  dailyPnl: number;
  ytdPnl: number;
  peak: number;
  peakDate: string;
  drawdown: number;
  maxDrawdown: number;
  mddDate: string;
  mddLimit: number | null;
  limitDate: string;
  mddPct: number | null;
  drawdownPct: number | null;
  legroom: number;
  pnlBreachPoint: number | null;
}

// 10 units defined by the user
const UNITS_LIST = [
  'Physical 2026', 'Paper 2026', '2026',
  'Physical 2027', 'Paper 2027', '2027',
  'Physical 2028', 'Paper 2028', '2028',
  'Unified TRTL'
];

// Mapping to sheet columns
const UNIT_MAPPING: { [displayName: string]: string } = {
  'Physical 2028': '2028 Physical',
  'Physical 2026': '2026 Physical',
  'Physical 2027': '2027 Physical',
  'Paper 2028': '2028 Paper',
  'Paper 2026': '2026 Paper',
  'Paper 2027': '2027 Paper',
  '2028': '2028 Total',
  '2026': '2026 Total',
  '2027': '2027 Total',
  'Unified TRTL': 'Unified TRTL'
};

// Original pasted dataset parsed as baseline defaults
const BASELINE_RECORDS: MultiUnitRecord[] = [
  { id: '1', date: '2026-01-08', values: { '2026 Physical': 176590690.75, '2026 Paper': 82810297.51, '2026 Total': 259400988.26, '2027 Physical': 303020962.65, '2027 Paper': -2095080.00, '2027 Total': 300925882.65, '2028 Physical': 0, '2028 Paper': 0, '2028 Total': 0 } },
  { id: '2', date: '2026-01-09', values: { '2026 Physical': 203883591.35, '2026 Paper': 70414506.75, '2026 Total': 274298098.10, '2027 Physical': 296014100.60, '2027 Paper': -1693170.00, '2027 Total': 294320930.60, '2028 Physical': 0, '2028 Paper': 0, '2028 Total': 0 } },
  { id: '3', date: '2026-01-12', values: { '2026 Physical': 216307469.41, '2026 Paper': 63747880.57, '2026 Total': 280055349.98, '2027 Physical': 314330030.00, '2027 Paper': -1519290.00, '2027 Total': 312810740.00, '2028 Physical': 0, '2028 Paper': 0, '2028 Total': 0 } },
  { id: '4', date: '2026-01-15', values: { '2026 Physical': 228512222.59, '2026 Paper': 51580975.68, '2026 Total': 280093198.27, '2027 Physical': 210681037.12, '2027 Paper': -1479001.00, '2027 Total': 209202036.12, '2028 Physical': 0, '2028 Paper': 0, '2028 Total': 0 } },
  { id: '5', date: '2026-01-16', values: { '2026 Physical': 253643683.17, '2026 Paper': 31020283.20, '2026 Total': 284663966.37, '2027 Physical': 219874225.42, '2027 Paper': -1814864.00, '2027 Total': 218059361.42, '2028 Physical': 0, '2028 Paper': 0, '2028 Total': 0 } },
  { id: '6', date: '2026-01-19', values: { '2026 Physical': 263212377.52, '2026 Paper': 31020283.20, '2026 Total': 294232660.72, '2027 Physical': 221477600.68, '2027 Paper': -1814864.00, '2027 Total': 219662736.68, '2028 Physical': 0, '2028 Paper': 0, '2028 Total': 0 } },
  { id: '7', date: '2026-01-20', values: { '2026 Physical': 225266340.18, '2026 Paper': 31020283.20, '2026 Total': 256286623.38, '2027 Physical': 253408486.19, '2027 Paper': -1814864.00, '2027 Total': 251593622.19, '2028 Physical': 0, '2028 Paper': 0, '2028 Total': 0 } },
  { id: '8', date: '2026-01-21', values: { '2026 Physical': 237347874.42, '2026 Paper': 39593738.71, '2026 Total': 276941613.13, '2027 Physical': 281078232.78, '2027 Paper': -1464939.00, '2027 Total': 279613293.78, '2028 Physical': 0, '2028 Paper': 0, '2028 Total': 0 } },
  { id: '9', date: '2026-01-22', values: { '2026 Physical': 222264935.39, '2026 Paper': 62261238.76, '2026 Total': 284526174.15, '2027 Physical': 273882971.67, '2027 Paper': -1237490.00, '2027 Total': 272645481.67, '2028 Physical': 0, '2028 Paper': 0, '2028 Total': 0 } },
  { id: '10', date: '2026-01-23', values: { '2026 Physical': 234268957.83, '2026 Paper': 53685657.90, '2026 Total': 287954615.73, '2027 Physical': 273122334.37, '2027 Paper': -1322616.00, '2027 Total': 271799718.37, '2028 Physical': 0, '2028 Paper': 0, '2028 Total': 0 } },
  { id: '11', date: '2026-01-27', values: { '2026 Physical': 237371030.27, '2026 Paper': 66652954.50, '2026 Total': 304023984.77, '2027 Physical': 278251333.76, '2027 Paper': -970906.00, '2027 Total': 277280427.76, '2028 Physical': 0, '2028 Paper': 0, '2028 Total': 0 } },
  { id: '12', date: '2026-01-28', values: { '2026 Physical': 260961327.43, '2026 Paper': 57054991.41, '2026 Total': 318016318.84, '2027 Physical': 300500674.86, '2027 Paper': -301965.00, '2027 Total': 300198709.86, '2028 Physical': 0, '2028 Paper': 0, '2028 Total': 0 } },
  { id: '13', date: '2026-01-29', values: { '2026 Physical': 297830368.74, '2026 Paper': 36904118.40, '2026 Total': 334734487.14, '2027 Physical': 342385480.07, '2027 Paper': 313733.00, '2027 Total': 342699213.07, '2028 Physical': 0, '2028 Paper': 0, '2028 Total': 0 } },
  { id: '14', date: '2026-02-03', values: { '2026 Physical': 263761759.02, '2026 Paper': 61599755.74, '2026 Total': 325361514.76, '2027 Physical': 356924312.87, '2027 Paper': -358482.00, '2027 Total': 356565830.87, '2028 Physical': 0, '2028 Paper': 0, '2028 Total': 0 } },
  { id: '15', date: '2026-02-04', values: { '2026 Physical': 296166032.25, '2026 Paper': 47846778.77, '2026 Total': 344012811.02, '2027 Physical': 310909944.70, '2027 Paper': 360932.00, '2027 Total': 311270876.70, '2028 Physical': 0, '2028 Paper': 0, '2028 Total': 0 } },
  { id: '16', date: '2026-02-05', values: { '2026 Physical': 263137621.34, '2026 Paper': 51912678.76, '2026 Total': 315050300.10, '2027 Physical': 290397272.48, '2027 Paper': 267202.00, '2027 Total': 290664474.48, '2028 Physical': 0, '2028 Paper': 0, '2028 Total': 0 } }
];

// Prescribed MDD policy limits copyable from sheets
const DEFAULT_LIMITS: { [unit: string]: { limit: number; date: string } } = {
  'Physical 2028': { limit: 0, date: '2026-01-16' },
  'Physical 2026': { limit: 138000000, date: '2026-01-16' },
  'Physical 2027': { limit: 210000000, date: '2026-01-16' },
  'Paper 2028': { limit: 0, date: '2026-01-16' },
  'Paper 2026': { limit: 14000000, date: '2026-01-16' },
  'Paper 2027': { limit: 21000000, date: '2026-01-16' },
  '2028': { limit: 147000000, date: '2026-01-16' },
  '2026': { limit: 217000000, date: '2026-01-16' },
  '2027': { limit: 330000000, date: '2026-01-16' },
  'Unified TRTL': { limit: 0, date: '2026-01-16' }
};

// Help clean cells containing excel symbols ($, commas, negative parens)
function cleanValue(str: string | undefined | null): number {
  if (!str) return 0;
  let s = str.trim();
  if (s === '.' || s === '' || s === '-' || s === '—') return 0;
  
  // Detect negative formats like (123) or -123 or - 123
  const isNegative = /^[(-]/.test(s) || s.includes('(') || s.includes(')');
  
  // Strip currency signs, commas, spaces and other symbols except digits, dot, e, E, plus, minus
  s = s.replace(/[$,\s]/g, '');
  
  // Strip parentheses
  s = s.replace(/[()]/g, '');
  
  const val = parseFloat(s);
  if (isNaN(val)) return 0;
  
  if (isNegative && val > 0) {
    return -val;
  }
  return val;
}

// Match a text header to our internal key names
function matchHeaderToKey(header: string): string | null {
  const norm = header.toLowerCase().replace(/\s+/g, '').replace(/_/g, '').replace(/-/g, '').replace(/\//g, '');
  
  let year = '';
  if (norm.includes('2026') || norm.includes('26')) year = '2026';
  else if (norm.includes('2027') || norm.includes('27')) year = '2027';
  else if (norm.includes('2028') || norm.includes('28')) year = '2028';
  
  const isPhys = norm.includes('phys');
  const isPaper = norm.includes('paper') || norm.includes('papr');
  const isTotal = norm.includes('total') || norm.includes('tot') || norm.includes('sum');
  
  if (year) {
    if (isPhys) return `${year} Physical`;
    if (isPaper) return `${year} Paper`;
    if (isTotal) return `${year} Total`;
  } else {
    if (isPhys) return `2026 Physical`;
    if (isPaper) return `2026 Paper`;
    if (isTotal) return `2026 Total`;
  }
  return null;
}

// Standard fallback if columns don't have header labels
function getFallbackHeadersForCount(numValues: number): string[] {
  if (numValues === 2) {
    return ['2026 Physical', '2026 Paper'];
  }
  if (numValues === 3) {
    return ['2026 Physical', '2026 Paper', '2026 Total'];
  }
  if (numValues === 4) {
    return ['2026 Physical', '2026 Paper', '2027 Physical', '2027 Paper'];
  }
  if (numValues === 5) {
    return ['2026 Physical', '2026 Paper', '2026 Total', '2027 Physical', '2027 Paper'];
  }
  if (numValues === 6) {
    return ['2026 Physical', '2026 Paper', '2026 Total', '2027 Physical', '2027 Paper', '2027 Total'];
  }
  return [
    '2026 Physical', '2026 Paper', '2026 Total',
    '2027 Physical', '2027 Paper', '2027 Total',
    '2028 Physical', '2028 Paper', '2028 Total'
  ];
}

export const MDDAnalyzer: React.FC = () => {
  const [records, setRecords] = useState<MultiUnitRecord[]>(() => {
    const saved = localStorage.getItem('cargo_mdd_multi_unit_records');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (e) {
        console.error('Error loading MDD ledger records:', e);
      }
    }
    return BASELINE_RECORDS;
  });

  const [limits, setLimits] = useState<{ [unit: string]: { limit: number; date: string } }>(() => {
    const saved = localStorage.getItem('cargo_mdd_limits_and_dates');
    return saved ? JSON.parse(saved) : DEFAULT_LIMITS;
  });

  const [pasteText, setPasteText] = useState('');
  const [dateParsingMode, setDateParsingMode] = useState<'auto' | 'mm_dd' | 'dd_mm'>('auto');
  const [activeUnit, setActiveUnit] = useState<string>('Physical 2026');
  const [chartMode, setChartMode] = useState<'cumulative' | 'underwater' | 'max_drawdown' | 'daily' | 'overlapped'>('cumulative');
  const [activeTabPanel, setActiveTabPanel] = useState<'excel' | 'edit_limits' | 'how_to' | 'manage_logs'>('excel');
  const [showToast, setShowToast] = useState<{ msg: string; type: 'success' | 'err' | 'none' }>({ msg: '', type: 'none' });

  // Custom live date selector state
  const [selectedDate, setSelectedDate] = useState<string>('');
  
  // Custom sandbox-safe confirmation dialog states to bypass standard browser popup confirmations
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const triggerToast = (msg: string, type: 'success' | 'err') => {
    setShowToast({ msg, type });
    setTimeout(() => setShowToast({ msg: '', type: 'none' }), 3000);
  };

  const saveRecords = (updated: MultiUnitRecord[]) => {
    setRecords(updated);
    localStorage.setItem('cargo_mdd_multi_unit_records', JSON.stringify(updated));
  };

  const saveLimits = (updatedLimits: typeof limits) => {
    setLimits(updatedLimits);
    localStorage.setItem('cargo_mdd_limits_and_dates', JSON.stringify(updatedLimits));
  };

  const handleResetToDefault = () => {
    setShowResetConfirm(true);
  };

  const handleClearAll = () => {
    setShowClearConfirm(true);
  };

  // Chronologically sort records and run deep loop calculations for all 10 divisions
  const processedData = useMemo(() => {
    const sorted = [...records]
      .filter(r => r.date && !isNaN(Date.parse(r.date)))
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

    const metricsMap: { [unit: string]: UnitMetricResult[] } = {};

    UNITS_LIST.forEach(unit => {
      const limitObj = limits[unit] || { limit: 0, date: '2026-01-16' };
      const limitVal = limitObj.limit > 0 ? limitObj.limit : null;
      const limitDate = limitObj.date || '2026-01-16';

      const history: UnitMetricResult[] = [];
      let runningPeak = -Infinity;
      let runningPeakDate = '';
      let runningMaxDrawdown = 0;
      let runningMaxDrawdownDate = '';

      for (let i = 0; i < sorted.length; i++) {
        const record = sorted[i];
        
        // Define YTD PnL
        let ytd = 0;
        if (unit === 'Unified TRTL') {
          const t26 = record.values['2026 Total'] || 0;
          const t27 = record.values['2027 Total'] || 0;
          const t28 = record.values['2028 Total'] || 0;
          ytd = t26 + t27 + t28;
        } else {
          const key = UNIT_MAPPING[unit] || unit;
          ytd = record.values[key] !== undefined ? record.values[key] : (record.values[unit] || 0);
        }

        // Daily standard PnL diff
        let daily = 0;
        if (i > 0) {
          const prev = sorted[i - 1];
          let prevYtd = 0;
          if (unit === 'Unified TRTL') {
            const pt26 = prev.values['2026 Total'] || 0;
            const pt27 = prev.values['2027 Total'] || 0;
            const pt28 = prev.values['2028 Total'] || 0;
            prevYtd = pt26 + pt27 + pt28;
          } else {
            const key = UNIT_MAPPING[unit] || unit;
            prevYtd = prev.values[key] !== undefined ? prev.values[key] : (prev.values[unit] || 0);
          }
          daily = ytd - prevYtd;
        }

        // Peak high watermark
        if (ytd > runningPeak) {
          runningPeak = ytd;
          runningPeakDate = record.date;
        }

        // Current drawdown
        const drawdown = runningPeak > -Infinity ? runningPeak - ytd : 0;

        // Max drawdown trigger
        if (drawdown > runningMaxDrawdown) {
          runningMaxDrawdown = drawdown;
          runningMaxDrawdownDate = record.date;
        }

        const mddPct = limitVal && limitVal > 0 ? (runningMaxDrawdown / limitVal) * 100 : null;
        const drawdownPct = limitVal && limitVal > 0 ? (drawdown / limitVal) * 100 : null;
        const legroom = limitVal && limitVal > 0 ? limitVal - drawdown : -drawdown;
        const pnlBreachPoint = limitVal && limitVal > 0 ? runningPeak - limitVal : null;

        history.push({
          date: record.date,
          unit,
          dailyPnl: daily,
          ytdPnl: ytd,
          peak: runningPeak,
          peakDate: runningPeakDate,
          drawdown,
          maxDrawdown: runningMaxDrawdown,
          mddDate: runningMaxDrawdownDate || record.date,
          mddLimit: limitVal,
          limitDate,
          mddPct,
          drawdownPct,
          legroom,
          pnlBreachPoint
        });
      }

      metricsMap[unit] = history;
    });

    return {
      sorted,
      metricsMap
    };
  }, [records, limits]);

  // Extract unique available dates chronologically
  const availableDates = useMemo(() => {
    return processedData.sorted.map(r => r.date);
  }, [processedData]);

  // Default active reporting date is the last element
  const activeReportingDate = useMemo(() => {
    if (availableDates.length === 0) return '';
    if (selectedDate && availableDates.includes(selectedDate)) return selectedDate;
    return availableDates[availableDates.length - 1];
  }, [availableDates, selectedDate]);

  // Aggregate current risk table values for the selected/active date
  const activeDateTable = useMemo(() => {
    if (!activeReportingDate) return [];
    return UNITS_LIST.map(unitName => {
      const history = processedData.metricsMap[unitName] || [];
      const item = history.find(h => h.date === activeReportingDate) || history[history.length - 1];
      return item;
    }).filter(Boolean);
  }, [processedData, activeReportingDate]);

  // Active highlighted metric cards selected by user from the table rows or standard active unit
  const activeUnitMetrics = useMemo(() => {
    const history = processedData.metricsMap[activeUnit] || [];
    if (history.length === 0) return null;
    return history.find(h => h.date === activeReportingDate) || history[history.length - 1];
  }, [processedData, activeUnit, activeReportingDate]);

  // Parsed data generator for drawing charts for the single active unit
  const [activeUnitChartData, CHART_TABS] = useMemo(() => {
    const history = processedData.metricsMap[activeUnit] || [];
    const chartData = history.map(item => ({
      ...item,
      invertedDrawdown: -item.drawdown,
      invertedMaxDrawdown: -item.maxDrawdown,
      // For clean formatting inside the recharts labels
      formattedDate: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    }));

    const tabs = [
      { id: 'cumulative' as const, label: 'YTD P&L', color: 'text-cyan-400', activeBg: 'bg-cyan-950/50 border border-cyan-805/60 text-cyan-400 font-bold', icon: TrendingUp },
      { id: 'underwater' as const, label: 'Drawdown', color: 'text-rose-400', activeBg: 'bg-rose-950/50 border border-rose-850/60 text-rose-450 font-bold', icon: TrendingDown },
      { id: 'max_drawdown' as const, label: 'Max DD', color: 'text-pink-400', activeBg: 'bg-pink-950/50 border border-pink-850/60 text-pink-400 font-bold', icon: ArrowDownCircle },
      { id: 'daily' as const, label: 'Daily Delta', color: 'text-emerald-450', activeBg: 'bg-emerald-950/50 border border-emerald-850/60 text-emerald-400 font-bold', icon: Activity },
      { id: 'overlapped' as const, label: 'Overlay', color: 'text-indigo-400', activeBg: 'bg-indigo-950/50 border border-indigo-850/60 text-indigo-400 font-bold', icon: Layers }
    ];

    return [chartData, tabs];
  }, [processedData, activeUnit]);

  // Sophisticated multi-column excel clipboard parser
  const handleExcelPasteParse = () => {
    if (!pasteText.trim()) {
      triggerToast('Clipboard box is empty.', 'err');
      return;
    }

    const lines = pasteText.split('\n');
    const parsedRecords: MultiUnitRecord[] = [];
    
    // 1. Identify headers dynamically from the pasted text if they exist
    let mappedHeaders: string[] = [];
    let detectedHeaders = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const lower = line.toLowerCase();
      // A header line contains keywords of dates and units
      if (lower.includes('date') || lower.includes('physical') || lower.includes('paper') || lower.includes('total') || lower.includes('phys')) {
        let tokens: string[] = [];
        const parts = line.split('\t');
        if (parts.length >= 2) {
          tokens = parts.map(p => p.trim());
        } else {
          tokens = line.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
        }
        
        const headerTokens = tokens.slice(1);
        const newlyMapped = headerTokens.map(tok => tok ? matchHeaderToKey(tok) : null);
        
        if (newlyMapped.some(h => h !== null)) {
          mappedHeaders = newlyMapped.map(h => h || '');
          detectedHeaders = true;
        }
        break;
      }
    }

    // 2. Smart batch date format detector (running across raw cell rows)
    let format: 'MM/DD' | 'DD/MM' = 'MM/DD';
    
    if (dateParsingMode === 'mm_dd') {
      format = 'MM/DD';
    } else if (dateParsingMode === 'dd_mm') {
      format = 'DD/MM';
    } else {
      // Auto-detect format
      let firstGreaterThan12Count = 0;
      let secondGreaterThan12Count = 0;
      const firstValues: number[] = [];
      const secondValues: number[] = [];

      lines.forEach(line => {
        const cleanLine = line.trim();
        if (!cleanLine) return;
        if (cleanLine.toLowerCase().includes('date') || cleanLine.toLowerCase().includes('physical') || cleanLine.toLowerCase().includes('paper')) {
          return;
        }
        
        let cellTokens: string[] = [];
        const parts = cleanLine.split('\t');
        if (parts.length >= 2) {
          cellTokens = parts.map(p => p.trim());
        } else {
          cellTokens = cleanLine.split(/\s{2,}/).map(p => p.trim());
        }

        if (cellTokens.length >= 2) {
          const datePart = cellTokens[0];
          const separator = datePart.includes('/') ? '/' : (datePart.includes('-') ? '-' : null);
          if (separator) {
            const dateParts = datePart.split(separator);
            if (dateParts.length === 3 && dateParts[0].length !== 4) { // ignore YYYY-MM-DD
              const first = parseInt(dateParts[0], 10);
              const second = parseInt(dateParts[1], 10);
              if (!isNaN(first) && !isNaN(second)) {
                if (first > 12 && first <= 31) firstGreaterThan12Count++;
                if (second > 12 && second <= 31) secondGreaterThan12Count++;
                firstValues.push(first);
                secondValues.push(second);
              }
            }
          }
        }
      });

      if (firstGreaterThan12Count > 0 && secondGreaterThan12Count === 0) {
        format = 'DD/MM';
      } else if (secondGreaterThan12Count > 0 && firstGreaterThan12Count === 0) {
        format = 'MM/DD';
      } else if (firstValues.length > 1) {
        const uniqueFirsts = new Set(firstValues).size;
        const uniqueSeconds = new Set(secondValues).size;
        if (uniqueFirsts === 1 && uniqueSeconds > 1) {
          format = 'MM/DD';
        } else if (uniqueSeconds === 1 && uniqueFirsts > 1) {
          format = 'DD/MM';
        }
      }
    }

    // 3. Parse each row
    lines.forEach((line) => {
      const cleanLine = line.trim();
      if (!cleanLine) return;

      // Skip row if it looks strictly like descriptive letter titles
      if (cleanLine.toLowerCase().includes('date') || cleanLine.toLowerCase().includes('physical') || cleanLine.toLowerCase().includes('paper')) {
        return;
      }

      // Preserve empty columns by splitting exactly on a single tab if tabs exist
      let cellTokens: string[] = [];
      const parts = cleanLine.split('\t');
      if (parts.length >= 2) {
        cellTokens = parts.map(p => p.trim());
      } else {
        // Fall back to split by 2 or more spaces, or single spaces if absolutely necessary
        const spaceParts = cleanLine.split(/\s{2,}/);
        if (spaceParts.length >= 2) {
          cellTokens = spaceParts.map(p => p.trim());
        } else {
          cellTokens = cleanLine.split(/\s+/).map(p => p.trim());
        }
      }

      if (cellTokens.length >= 2) {
        const datePart = cellTokens[0];
        const separator = datePart.includes('/') ? '/' : (datePart.includes('-') ? '-' : null);
        let calculatedDate = '';

        if (separator) {
          const dateParts = datePart.split(separator);
          if (dateParts.length === 3) {
            // Check if YYYY-MM-DD
            if (dateParts[0].length === 4) {
              calculatedDate = datePart; // already YYYY-MM-DD
            } else {
              const first = parseInt(dateParts[0], 10);
              const second = parseInt(dateParts[1], 10);
              const yearVal = parseInt(dateParts[2], 10);
              const year = yearVal < 100 ? 2000 + yearVal : yearVal;

              if (format === 'DD/MM') {
                calculatedDate = `${year}-${String(second).padStart(2, '0')}-${String(first).padStart(2, '0')}`;
              } else {
                // MM/DD/YYYY
                calculatedDate = `${year}-${String(first).padStart(2, '0')}-${String(second).padStart(2, '0')}`;
              }
            }
          } else {
            const parsedTs = Date.parse(datePart);
            if (!isNaN(parsedTs)) {
              calculatedDate = new Date(parsedTs).toISOString().split('T')[0];
            }
          }
        } else {
          const parsedTs = Date.parse(datePart);
          if (!isNaN(parsedTs)) {
            calculatedDate = new Date(parsedTs).toISOString().split('T')[0];
          }
        }

        if (calculatedDate && !isNaN(Date.parse(calculatedDate))) {
          // Read subsequent numeric spreadsheet values. Map empty cells as undefined so they hold cumulative carryovers
          const valMap: { [key: string]: number } = {};
          const numericTokensRaw = cellTokens.slice(1);
          const headersToUse = detectedHeaders ? mappedHeaders : getFallbackHeadersForCount(numericTokensRaw.length);

          headersToUse.forEach((header, idx) => {
            if (header && idx < numericTokensRaw.length) {
              const rawVal = numericTokensRaw[idx];
              if (rawVal !== "") {
                valMap[header] = cleanValue(rawVal);
              }
            }
          });

          // Ensure Total is always correct (sum) if physical/paper are specified, but total is missing/0
          ['2026', '2027', '2028'].forEach(year => {
            const physKey = `${year} Physical`;
            const paperKey = `${year} Paper`;
            const totKey = `${year} Total`;
            
            if (valMap[physKey] !== undefined || valMap[paperKey] !== undefined) {
              const physVal = valMap[physKey] !== undefined ? valMap[physKey] : 0;
              const paperVal = valMap[paperKey] !== undefined ? valMap[paperKey] : 0;
              // If total is missing, or total is 0 but sum is non-zero, let's set it!
              if (valMap[totKey] === undefined || valMap[totKey] === 0) {
                valMap[totKey] = physVal + paperVal;
              }
            }
          });

          parsedRecords.push({
            id: Math.random().toString(36).substring(2, 9),
            date: calculatedDate,
            values: valMap
          });
        }
      }
    });

    if (parsedRecords.length > 0) {
      // Overwrite the records state completely with the newly pasted clipboard dataset
      const sortedMerged = [...parsedRecords].sort((a,b) => Date.parse(a.date) - Date.parse(b.date));

      // Forward-fill pass to prevent temporary drops to 0 when columns are omitted in subsequent rows or dates
      const keys = [
        '2026 Physical', '2026 Paper', '2026 Total',
        '2027 Physical', '2027 Paper', '2027 Total',
        '2028 Physical', '2028 Paper', '2028 Total'
      ];

      for (let i = 0; i < sortedMerged.length; i++) {
        const current = sortedMerged[i];
        if (i > 0) {
          const previous = sortedMerged[i - 1];
          keys.forEach(key => {
            if (current.values[key] === undefined) {
              current.values[key] = previous.values[key] !== undefined ? previous.values[key] : 0;
            }
          });
        } else {
          keys.forEach(key => {
            if (current.values[key] === undefined) {
              current.values[key] = 0;
            }
          });
        }
      }

      saveRecords(sortedMerged);
      setPasteText('');
      setSelectedDate(''); // clear active reporting date selection to fallback to the latest pasted day
      triggerToast(`Loaded ${parsedRecords.length} rows directly from spreadsheet clipboard!`, 'success');
    } else {
      triggerToast('Regex parse failed. Verify you selected the Date and P&L numeric columns from Excel.', 'err');
    }
  };

  const formatCurrency = (val: number | null | undefined, forceSimpleDecimal = false) => {
    if (val === null || val === undefined) return '—';
    const isAbsZero = Math.abs(val) < 0.01;
    if (isAbsZero) return '$0';

    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: forceSimpleDecimal ? 1 : 0
    }).format(val);

    return formatted;
  };

  const formatPercentage = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '#DIV/0!';
    return `${val.toFixed(1)}%`;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-900 text-slate-100 p-4 lg:p-6 overflow-y-auto max-h-[85vh] @container">
      
      {/* Absolute Toast & Confirmation Overlays */}
      <AnimatePresence>
        {showToast.type !== 'none' && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-8 right-8 z-[500] px-5 py-3.5 rounded-2xl border text-xs font-bold font-mono uppercase tracking-wide flex items-center gap-3 shadow-2xl ${
              showToast.type === 'success' 
              ? 'bg-emerald-950 text-emerald-300 border-emerald-800' 
              : 'bg-rose-950 text-rose-300 border-rose-800'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${showToast.type === 'success' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            {showToast.msg}
          </motion.div>
        )}

        {showClearConfirm && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl relative"
            >
              <div className="w-12 h-12 rounded-full bg-rose-950 text-rose-400 border border-rose-800 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider mb-2">Clear Ledger Data</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Are you absolutely sure you want to permanently clear all uploaded historical ledger curves? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-705 text-slate-200 text-xs font-bold uppercase tracking-wider rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    saveRecords([]);
                    setSelectedDate('');
                    setShowClearConfirm(false);
                    triggerToast('All curves and ledger entries have been cleared.', 'success');
                  }}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-lg"
                >
                  Yes, Clear All
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showResetConfirm && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl relative"
            >
              <div className="w-12 h-12 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-805 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 16H19" />
                </svg>
              </div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider mb-2">Revert to Default</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Restore the default 16-day benchmark commodities dataset? This will discard your current timeline config.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-705 text-slate-200 text-xs font-bold uppercase tracking-wider rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    saveRecords(BASELINE_RECORDS);
                    saveLimits(DEFAULT_LIMITS);
                    setSelectedDate('');
                    setShowResetConfirm(false);
                    triggerToast('Reverted to the official 14-day benchmark commodities state.', 'success');
                  }}
                  className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-lg"
                >
                  Restore Benchmark
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Title Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 border-b border-slate-800 pb-5">
        <div>
          <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest block mb-1">
            REGULATORY COMPLIANCE & RISK METRIC ENGINE
          </span>
          <h1 className="text-2xl font-black text-white tracking-tight">
            Maximum Drawdown (MDD) Analyzer
          </h1>
          <p className="text-xs text-slate-400 max-w-3xl mt-1 leading-relaxed">
            Dynamic real-time calculating of Commodity peak-to-trough curves, drawdown thresholds, available policy legroom, and breach trigger indicators. Paste whole Excel matrices directly to compute instant multi-year risk models.
          </p>
        </div>

        {/* Global Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {availableDates.length > 0 && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">As Of:</span>
              <select 
                value={activeReportingDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-xs font-bold font-mono text-emerald-400 focus:outline-none cursor-pointer pr-1"
              >
                {availableDates.map(d => (
                  <option key={d} value={d} className="bg-slate-950 text-slate-100">
                    {new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button 
            onClick={handleResetToDefault}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all"
          >
            Revert to default
          </button>
          
          <button 
            onClick={handleClearAll}
            className="px-3.5 py-2 bg-rose-950 text-rose-300 hover:bg-rose-900 border border-rose-900 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all"
          >
            Clear Data
          </button>
        </div>
      </div>

      {/* Top Cards Grid reflecting the selected ACTIVE UNIT */}
      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
        Live Highlight Card: {activeUnit} (Reporting on {activeReportingDate || 'No data'})
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        
        {/* YTD Cumulative PnL value */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">YTD PnL</span>
            <h3 className={`text-xl font-bold font-mono tracking-tight ${activeUnitMetrics && activeUnitMetrics.ytdPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {activeUnitMetrics ? formatCurrency(activeUnitMetrics.ytdPnl) : '—'}
            </h3>
            <p className="text-[9px] text-slate-500 font-mono mt-1">
              Daily Change: {activeUnitMetrics ? (activeUnitMetrics.dailyPnl >= 0 ? '+' : '') + formatCurrency(activeUnitMetrics.dailyPnl) : '—'}
            </p>
          </div>
        </div>

        {/* Peak achieved and date */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Peak High Watermark</span>
            <h3 className="text-xl font-bold font-mono text-cyan-400">
              {activeUnitMetrics ? formatCurrency(activeUnitMetrics.peak) : '—'}
            </h3>
            <p className="text-[9px] text-slate-500 font-mono mt-1 uppercase">
              Achieved On: {activeUnitMetrics && activeUnitMetrics.peakDate ? activeUnitMetrics.peakDate : '—'}
            </p>
          </div>
        </div>

        {/* Current Drawdown state */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Current Drawdown</span>
            <h3 className={`text-xl font-bold font-mono ${activeUnitMetrics && activeUnitMetrics.drawdown > 0 ? 'text-amber-500' : 'text-slate-400'}`}>
              {activeUnitMetrics ? formatCurrency(activeUnitMetrics.drawdown) : '—'}
            </h3>
            <p className="text-[9px] text-slate-500 font-mono mt-1 uppercase">
              Drawdown %: {activeUnitMetrics ? formatPercentage(activeUnitMetrics.drawdownPct) : '—'}
            </p>
          </div>
        </div>

        {/* Max Drawdown (MDD) */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest block mb-1">Maximum Drawdown</span>
            <h3 className="text-xl font-bold font-mono text-rose-500">
              {activeUnitMetrics ? formatCurrency(activeUnitMetrics.maxDrawdown) : '—'}
            </h3>
            <p className="text-[9px] text-slate-500 font-mono mt-1 uppercase">
              Worst on: {activeUnitMetrics ? activeUnitMetrics.mddDate : '—'} | MDD: {activeUnitMetrics ? formatPercentage(activeUnitMetrics.mddPct) : '—'}
            </p>
          </div>
        </div>

        {/* Legroom & Breach points */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1">Threshold Legroom</span>
            {activeUnitMetrics ? (
              <>
                <h3 className={`text-xl font-bold font-mono ${activeUnitMetrics.legroom >= 0 ? 'text-emerald-400' : 'text-rose-500 animate-pulse'}`}>
                  {formatCurrency(activeUnitMetrics.legroom)}
                </h3>
                <p className="text-[9px] text-slate-500 font-mono mt-1 uppercase">
                  Breach limit: {activeUnitMetrics.pnlBreachPoint !== null ? formatCurrency(activeUnitMetrics.pnlBreachPoint) : 'No Policy limit set'}
                </p>
              </>
            ) : (
              <h3 className="text-xl font-bold font-mono text-slate-500">—</h3>
            )}
          </div>
        </div>

      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        
        {/* Left Column: Trend curves of active division */}
        <div className="xl:col-span-2 flex flex-col gap-5">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 flex flex-col h-[380px]">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-slate-900 rounded-lg text-emerald-400 border border-slate-800">
                  <TrendingUp className="w-4 h-4" />
                </span>
                <div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Risk Chart View</span>
                  <select 
                    value={activeUnit} 
                    onChange={(e) => setActiveUnit(e.target.value)}
                    className="bg-transparent text-sm font-black text-white hover:text-emerald-400 focus:outline-none cursor-pointer pr-1"
                  >
                    {UNITS_LIST.map(u => (
                      <option key={u} value={u} className="bg-slate-950 text-slate-100">{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Chart selector */}
              <div className="flex flex-wrap sm:flex-nowrap bg-slate-900 border border-slate-800 p-0.5 rounded-xl shadow-inner gap-0.5">
                {CHART_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = chartMode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setChartMode(tab.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all whitespace-nowrap ${
                        isActive 
                          ? tab.activeBg 
                          : 'text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Recharts zone */}
            {records.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-12 text-slate-500 font-mono text-xs">
                <p>No active sequence curves loaded yet.</p>
                <p className="text-[10px] text-slate-600 mt-2">Paste your multi-column sheet grid in the panel to populate curves instantly.</p>
              </div>
            ) : (
              <div className="flex-1 min-h-[220px] w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  {chartMode === 'cumulative' ? (
                    <AreaChart data={activeUnitChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorValueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="formattedDate" stroke="#64748b" fontSize={9} fontWeight="bold" />
                      <YAxis 
                        stroke="#64748b" 
                        fontSize={9} 
                        fontWeight="bold" 
                        tickFormatter={(v) => `$${(v / 1000000).toFixed(0)}M`}
                        domain={['dataMin - 10000000', 'dataMax + 10000000']}
                      />
                      <Tooltip 
                        formatter={(value: any) => [formatCurrency(value as number), 'YTD Valuation']}
                        contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '12px' }}
                      />
                      <Line type="monotone" dataKey="peak" stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 4" dot={false} name="High Watermark Peak" />
                      <Area type="monotone" dataKey="ytdPnl" stroke="#06b6d4" strokeWidth={2.5} fillOpacity={1} fill="url(#colorValueGrad)" name="YTD PnL" />
                    </AreaChart>
                  ) : chartMode === 'underwater' ? (
                    <AreaChart data={activeUnitChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorDropGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.05}/>
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.25}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="formattedDate" stroke="#64748b" fontSize={9} fontWeight="bold" />
                      <YAxis 
                        stroke="#64748b" 
                        fontSize={9} 
                        fontWeight="bold" 
                        tickFormatter={(v) => v === 0 ? '$0' : `-$${(Math.abs(v) / 1000000).toFixed(0)}M`}
                        domain={['dataMin - 10000000', 0]}
                      />
                      <Tooltip 
                        formatter={(value: any) => [formatCurrency(value as number), 'Drawdown USD']}
                        contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '12px' }}
                      />
                      <Area type="monotone" dataKey="invertedDrawdown" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorDropGrad)" name="Current Drawdown Value" />
                      {limits[activeUnit]?.limit > 0 && (
                        <ReferenceLine y={-limits[activeUnit].limit} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="3 3" label={{ value: `Drawdown Limit (-${formatCurrency(limits[activeUnit].limit)})`, fill: '#ef4444', fontSize: 9, position: 'bottom', fontWeight: 'bold' }} />
                      )}
                    </AreaChart>
                  ) : chartMode === 'max_drawdown' ? (
                    <AreaChart data={activeUnitChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorMaxDropGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ec4899" stopOpacity={0.05}/>
                          <stop offset="95%" stopColor="#ec4899" stopOpacity={0.25}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="formattedDate" stroke="#64748b" fontSize={9} fontWeight="bold" />
                      <YAxis 
                        stroke="#64748b" 
                        fontSize={9} 
                        fontWeight="bold" 
                        tickFormatter={(v) => v === 0 ? '$0' : `-$${(Math.abs(v) / 1000000).toFixed(0)}M`}
                        domain={['dataMin - 10000000', 0]}
                      />
                      <Tooltip 
                        formatter={(value: any) => [formatCurrency(value as number), 'Max Drawdown USD']}
                        contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '12px' }}
                      />
                      <Area type="stepBefore" dataKey="invertedMaxDrawdown" stroke="#ec4899" strokeWidth={2} fillOpacity={1} fill="url(#colorMaxDropGrad)" name="Maximum Drawdown" />
                      {limits[activeUnit]?.limit > 0 && (
                        <ReferenceLine y={-limits[activeUnit].limit} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="3 3" label={{ value: `Drawdown Limit (-${formatCurrency(limits[activeUnit].limit)})`, fill: '#ef4444', fontSize: 9, position: 'bottom', fontWeight: 'bold' }} />
                      )}
                    </AreaChart>
                  ) : chartMode === 'daily' ? (
                    <BarChart data={activeUnitChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="formattedDate" stroke="#64748b" fontSize={9} fontWeight="bold" />
                      <YAxis 
                        stroke="#64748b" 
                        fontSize={9} 
                        fontWeight="bold" 
                        tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`}
                      />
                      <Tooltip 
                        formatter={(value: any) => [formatCurrency(value as number), 'Daily shift']}
                        contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '12px' }}
                      />
                      <Bar dataKey="dailyPnl" radius={[3, 3, 0, 0]}>
                        {activeUnitChartData.map((entry, index) => (
                          <Cell
                            key={`cell-daily-${index}`}
                            fill={entry.dailyPnl >= 0 ? '#10b981' : '#f43f5e'}
                            stroke={entry.dailyPnl >= 0 ? '#059669' : '#e11d48'}
                            strokeWidth={1}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  ) : (
                    <ComposedChart data={activeUnitChartData} margin={{ top: 10, right: 25, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="formattedDate" stroke="#64748b" fontSize={9} fontWeight="bold" />
                      <YAxis 
                        yAxisId="left"
                        stroke="#06b6d4" 
                        fontSize={9} 
                        fontWeight="bold" 
                        tickFormatter={(v) => `$${(v / 1000000).toFixed(0)}M`}
                        domain={['dataMin - 10000000', 'dataMax + 10000000']}
                      />
                      <YAxis 
                        yAxisId="right"
                        orientation="right"
                        stroke="#f43f5e" 
                        fontSize={9} 
                        fontWeight="bold" 
                        tickFormatter={(v) => v === 0 ? '$0' : `-$${(Math.abs(v) / 1000000).toFixed(0)}M`}
                        domain={['dataMin - 10000000', 0]}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '12px' }}
                        formatter={(value: any, name: string) => {
                          return [formatCurrency(value as number), name];
                        }}
                      />
                      <Legend verticalAlign="top" height={32} wrapperStyle={{ fontSize: '9px', fontWeight: 'bold' }} />
                      
                      <Area 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="ytdPnl" 
                        stroke="#06b6d4" 
                        strokeWidth={2}
                        fill="#06b6d4"
                        fillOpacity={0.06}
                        name="YTD PnL" 
                      />
                      <Line 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="peak" 
                        stroke="#64748b" 
                        strokeWidth={1} 
                        strokeDasharray="4 4" 
                        dot={false} 
                        name="Peak High" 
                      />
                      <Area 
                        yAxisId="right"
                        type="monotone" 
                        dataKey="invertedDrawdown" 
                        stroke="#f43f5e" 
                        strokeWidth={1.5}
                        fill="#f43f5e"
                        fillOpacity={0.12}
                        name="Drawdown" 
                      />
                      <Bar 
                        yAxisId="right"
                        dataKey="dailyPnl" 
                        barSize={8}
                        name="Daily P&L Shift"
                        radius={[2, 2, 0, 0]}
                      >
                        {activeUnitChartData.map((entry, index) => (
                          <Cell
                            key={`cell-overlapped-${index}`}
                            fill={entry.dailyPnl >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(244, 63, 94, 0.7)'}
                            stroke={entry.dailyPnl >= 0 ? '#10b981' : '#f43f5e'}
                            strokeWidth={1}
                          />
                        ))}
                      </Bar>
                    </ComposedChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Ingest tool, Accordion configuration */}
        <div className="flex flex-col gap-5">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl flex flex-col h-[380px] overflow-hidden">
            <div className="flex bg-slate-900 border-b border-slate-800 p-1.5 shrink-0 gap-1">
              <button 
                onClick={() => setActiveTabPanel('excel')}
                className={`flex-1 text-center py-2 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all ${
                  activeTabPanel === 'excel' ? 'bg-slate-800 text-white shadow-sm border border-slate-700' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Ingest Excel
              </button>
              
              <button 
                onClick={() => setActiveTabPanel('edit_limits')}
                className={`flex-1 text-center py-2 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all ${
                  activeTabPanel === 'edit_limits' ? 'bg-slate-800 text-white shadow-sm border border-slate-700' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Thresholds
              </button>

              <button 
                onClick={() => setActiveTabPanel('how_to')}
                className={`flex-1 text-center py-2 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all ${
                  activeTabPanel === 'how_to' ? 'bg-slate-800 text-white shadow-sm border border-slate-700' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Guidelines
              </button>

              <button 
                onClick={() => setActiveTabPanel('manage_logs')}
                className={`flex-1 text-center py-2 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all ${
                  activeTabPanel === 'manage_logs' ? 'bg-slate-800 text-indigo-400 shadow-sm border border-slate-700' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Manage Logs
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto font-mono text-xs text-slate-300">
              
              {/* Tab 1: Clipboard parser block */}
              {activeTabPanel === 'excel' && (
                <div className="flex flex-col h-full justify-between">
                  <div>
                    <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-widest block mb-1">Spreadsheet Clipboard</h4>
                    <p className="text-[10px] text-slate-400 leading-snug mb-2">
                      Copy a range from your MDD excel spreadsheet. Be sure it includes columns representing: [Date, 2026 Physical... up to 2028 Total].
                    </p>
                    
                    {/* Date Ingestion Format Toggle Selector */}
                    <div className="mb-2">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-1">Date Ingestion Format:</span>
                      <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl shadow-inner gap-1">
                        <button 
                          type="button"
                          onClick={() => setDateParsingMode('auto')}
                          className={`flex-1 py-1 text-[8px] font-black uppercase tracking-wider rounded-lg transition-all ${
                            dateParsingMode === 'auto' ? 'bg-slate-800 text-cyan-400 border border-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          Auto Detect
                        </button>
                        <button 
                          type="button"
                          onClick={() => setDateParsingMode('mm_dd')}
                          className={`flex-1 py-1 text-[8px] font-black uppercase tracking-wider rounded-lg transition-all ${
                            dateParsingMode === 'mm_dd' ? 'bg-slate-800 text-emerald-400 border border-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          MM/DD (US)
                        </button>
                        <button 
                          type="button"
                          onClick={() => setDateParsingMode('dd_mm')}
                          className={`flex-1 py-1 text-[8px] font-black uppercase tracking-wider rounded-lg transition-all ${
                            dateParsingMode === 'dd_mm' ? 'bg-slate-800 text-indigo-400 border border-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          DD/MM (Intl)
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <textarea 
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="Date	 2026 Physical 	 2026 Paper 	 2026 Total ... &#10;08/01/2026	$176,590,690.75 	$82,810,297.51 	$259,400,988.26 ..."
                    className="w-full flex-1 min-h-[120px] bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-[10px] font-mono text-slate-100 outline-none focus:border-cyan-500 resize-none hover:border-slate-700"
                  />

                  <div className="mt-3 flex gap-2">
                    <button 
                      onClick={() => {
                        setPasteText(`03/02/2026\t $263,761,759.02 \t $61,599,755.74 \t $325,361,514.76 \t $356,924,312.87 \t $(358,482.00)\t $356,565,830.87\n04/02/2026\t $296,166,032.25 \t $47,846,778.77 \t $344,012,811.02 \t $110,909,944.70 \t $360,932.00 \t $111,270,876.70`);
                        triggerToast('Pre-loaded example row into input box.', 'success');
                      }}
                      className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-[9px] font-black uppercase text-slate-400 font-sans"
                    >
                      Use Demo text
                    </button>
                    <button 
                      onClick={handleExcelPasteParse}
                      className="flex-1 py-1 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-all shadow-md font-sans"
                    >
                      Calculate Grid ➜
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 2: Custom Limits */}
              {activeTabPanel === 'edit_limits' && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Customize Portfolio Risk Limits</h4>
                    <p className="text-[10px] text-slate-500 leading-snug">
                      Adjust the MDD limits and inception limit dates for each entity to watch your reactive available legroom recalculated live.
                    </p>
                  </div>

                  <div className="space-y-2 max-h-[190px] overflow-y-auto pr-1">
                    {UNITS_LIST.map(unit => {
                      const limitObj = limits[unit] || { limit: 0, date: '2026-01-16' };
                      return (
                        <div key={unit} className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-200">{unit}</span>
                            <span className="text-[9px] text-slate-500">Limit Date</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input 
                              type="number"
                              value={limitObj.limit}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                saveLimits({
                                  ...limits,
                                  [unit]: { ...limitObj, limit: val }
                                });
                              }}
                              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-center text-[10px] font-semibold text-emerald-400 focus:outline-none"
                              placeholder="Policy Limit"
                            />
                            <input 
                              type="text"
                              value={limitObj.date}
                              onChange={(e) => {
                                saveLimits({
                                  ...limits,
                                  [unit]: { ...limitObj, date: e.target.value }
                                });
                              }}
                              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-center text-[10px] font-semibold text-slate-400 focus:outline-none"
                              placeholder="Inception Date"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tab 3: Detailed math formulas details */}
              {activeTabPanel === 'how_to' && (
                <div className="space-y-2.5 leading-relaxed text-slate-400 text-[10px]">
                  <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Calculated formulas inside</h4>
                  <p>
                    <strong>Daily P&L:</strong> Calculated relative to prior trading day: <code className="text-slate-200 font-bold font-mono">YTD(t) - YTD(t-1)</code>.
                  </p>
                  <p>
                    <strong>Peak Value:</strong> Running high watermark: <code className="text-slate-200 font-bold font-mono">max(YTD_PnL)</code> up to current period.
                  </p>
                  <p>
                    <strong>Drawdown:</strong> Loss depth from high-watermark: <code className="text-slate-200 font-bold font-mono">Peak - YTD</code>.
                  </p>
                  <p>
                    <strong>Max Drawdown (MDD):</strong> Maximum loss peak-to-trough: <code className="text-slate-200 font-bold font-mono">max(Drawdown)</code>.
                  </p>
                  <p>
                    <strong>Available Legroom:</strong> Safe remaining room before policy breach: <code className="text-slate-200 font-bold font-mono">MDD_limit - Drawdown</code>.
                  </p>
                  <p>
                    <strong>PnL Breach Point:</strong> Absolute valuation below which the policy is breached: <code className="text-slate-200 font-bold font-mono">Peak - MDD_limit</code>.
                  </p>
                </div>
              )}

              {/* Tab 4: Ingested logs inspector panel */}
              {activeTabPanel === 'manage_logs' && (
                <div className="flex flex-col h-full justify-between">
                  <div>
                    <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-widest block mb-1">Ingested Ledger Logs</h4>
                    <p className="text-[10px] text-slate-500 leading-snug mb-3">
                      Review, verify, or individually delete ingested business date points from the active sequence. Useful for eliminating historical parsing issues.
                    </p>
                  </div>
                  <div className="flex-1 overflow-y-auto max-h-[190px] pr-1 space-y-1.5">
                    {records.length === 0 ? (
                      <p className="text-[10px] text-slate-500 text-center py-8">No loaded logs found.</p>
                    ) : (
                      [...records].sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).map(record => (
                        <div key={record.date} className="flex items-center justify-between p-2 bg-slate-900/60 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-white font-mono">{record.date}</span>
                            <span className="text-[9px] text-slate-400 font-mono">
                              2026 Phys: {formatCurrency(record.values['2026 Physical'])}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              const updated = records.filter(r => r.date !== record.date);
                              saveRecords(updated);
                              if (selectedDate === record.date) {
                                setSelectedDate('');
                              }
                              triggerToast(`Successfully removed daily P&L log for date ${record.date}.`, 'success');
                            }}
                            className="p-1 px-2 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded transition-all font-sans text-[10px] font-bold"
                          >
                            Delete
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

      </div>

      {/* COMPREHENSIVE DETAILED RISK TABLE SECTION */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl flex-1 flex flex-col min-h-0 min-w-0 overflow-x-auto">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4 shrink-0">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Calculated Drawdown Compliance Table (Active Date: {activeReportingDate})
            </h3>
            <p className="text-[10px] text-slate-500 font-mono">
              Table reflects precise mathematical formulas with real-time risk status computed for each division.
            </p>
          </div>

          <div className="text-[10px] font-mono text-slate-400 uppercase">
            Unit Count: <span className="font-bold text-emerald-400 font-mono">10 Divisions</span> | Past date points: <span className="font-bold text-cyan-400 font-mono">{records.length} days</span>
          </div>
        </div>

        {/* Outer scrolling container, styled cleanly */}
        <div className="flex-1 min-w-[1240px] overflow-y-auto">
          <table className="w-full text-[11px] text-left border-collapse font-sans">
            <thead>
              <tr className="bg-slate-900 border-y border-slate-800 text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono">
                <th className="py-2.5 px-3">PnL date</th>
                <th className="py-2.5 px-3">Unit</th>
                <th className="py-2.5 px-3 text-right">Daily PnL</th>
                <th className="py-2.5 px-3 text-right">YTD PnL</th>
                <th className="py-2.5 px-3 text-right">Peak</th>
                <th className="py-2.5 px-3">Peak date</th>
                <th className="py-2.5 px-3 text-right">Drawdown</th>
                <th className="py-2.5 px-3 text-right">Max drawdown</th>
                <th className="py-2.5 px-3">MDD date</th>
                <th className="py-2.5 px-3 text-right">MDD limit</th>
                <th className="py-2.5 px-3">Limit date</th>
                <th className="py-2.5 px-3 text-right">MDD %</th>
                <th className="py-2.5 px-3 text-right">Drawdown %</th>
                <th className="py-2.5 px-3 text-right">Legroom</th>
                <th className="py-2.5 px-3 text-right">PnL breach point</th>
              </tr>
            </thead>
            <tbody>
              {activeDateTable.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-8 text-center text-slate-500 font-mono">
                    No active daily logs found. Please input or paste some datasets above.
                  </td>
                </tr>
              ) : (
                activeDateTable.map((row, idx) => {
                  const isActiveRow = row.unit === activeUnit;
                  const isBreached = row.legroom < 0;

                  return (
                    <tr 
                      key={row.unit + idx} 
                      onClick={() => setActiveUnit(row.unit)}
                      className={`border-b border-slate-900 text-slate-200 transition-colors cursor-pointer hover:bg-slate-900/60 ${
                        isActiveRow ? 'bg-slate-900 text-cyan-200 border-l-2 border-l-cyan-500 font-medium' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-400">{row.date}</td>
                      <td className="py-2.5 px-3 font-bold select-none text-slate-100">{row.unit}</td>
                      
                      <td className={`py-2.5 px-3 text-right font-mono text-[10px] ${
                        row.dailyPnl > 0 ? 'text-emerald-400' : row.dailyPnl < 0 ? 'text-rose-400' : 'text-slate-400'
                      }`}>
                        {row.dailyPnl === 0 ? '$0' : (row.dailyPnl > 0 ? '+' : '') + formatCurrency(row.dailyPnl)}
                      </td>

                      <td className={`py-2.5 px-3 text-right font-mono text-[10px] ${
                        row.ytdPnl >= 0 ? 'text-slate-200' : 'text-rose-400'
                      }`}>
                        {formatCurrency(row.ytdPnl)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-[10px] text-cyan-300">
                        {formatCurrency(row.peak)}
                      </td>

                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500">{row.peakDate || '—'}</td>

                      <td className={`py-2.5 px-3 text-right font-mono text-[10px] ${
                        row.drawdown > 0 ? 'text-amber-400' : 'text-slate-500'
                      }`}>
                        {row.drawdown > 0 ? formatCurrency(row.drawdown) : '$0'}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-[10px] text-rose-400 font-bold">
                        {formatCurrency(row.maxDrawdown)}
                      </td>

                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500">{row.mddDate}</td>

                      <td className="py-2.5 px-3 text-right font-mono text-[10px] text-slate-300">
                        {row.mddLimit ? formatCurrency(row.mddLimit) : '.'}
                      </td>

                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500">{row.limitDate || '—'}</td>

                      <td className={`py-2.5 px-3 text-right font-mono font-bold text-[10px] ${
                        row.mddPct && row.mddPct > 100 ? 'text-rose-400' : 'text-slate-300'
                      }`}>
                        {formatPercentage(row.mddPct)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-[10px] text-slate-300">
                        {formatPercentage(row.drawdownPct)}
                      </td>

                      <td className={`py-2.5 px-3 text-right font-mono font-bold text-[10px] ${
                        isBreached ? 'text-rose-400 bg-rose-950/20 px-1 rounded' : 'text-emerald-400'
                      }`}>
                        {formatCurrency(row.legroom)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-[10px] text-slate-400">
                        {row.pnlBreachPoint !== null ? formatCurrency(row.pnlBreachPoint) : '.'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
