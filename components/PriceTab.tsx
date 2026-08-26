import React, { useState, useMemo, useEffect, useRef } from 'react';
import { getIndexPrice, getAvailableCurveDatesSync, getActiveCurveDate, setActiveCurveDate, normalizeMonthKey } from '../services/calculationService';
import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';
import { Copy, Download, Search, Info, Calendar, Sparkles, X, Target, AlertTriangle, AlertCircle, Eye, EyeOff } from 'lucide-react';

export interface PriceTabHighlightTarget {
  index: string;
  monthDef: string;
  refDate?: string;
  portfolioYear?: number | string;
  sourceLabel?: string;
}

interface PriceTableRowDef {
  index: string;
  monthDef: string;
  category?: string;
}

const PRICE_TAB_ROWS: PriceTableRowDef[] = [
  // BRIPE
  { index: 'BRIPE', monthDef: 'n', category: 'Oil & Condensate' },
  { index: 'BRIPE', monthDef: 'n-1', category: 'Oil & Condensate' },
  { index: 'BRIPE', monthDef: 'n-2', category: 'Oil & Condensate' },
  { index: 'BRIPE', monthDef: 'n-3', category: 'Oil & Condensate' },
  { index: 'BRIPE', monthDef: '3,0,1', category: 'Oil & Condensate' },
  { index: 'BRIPE', monthDef: '3,2,1', category: 'Oil & Condensate' },
  { index: 'BRIPE', monthDef: '3,0,3', category: 'Oil & Condensate' },
  { index: 'BRIPE', monthDef: '6,0,1', category: 'Oil & Condensate' },
  { index: 'BRIPE', monthDef: '6,0,3', category: 'Oil & Condensate' },

  // Dated Brent
  { index: 'Dated Brent', monthDef: 'n', category: 'Oil & Condensate' },
  { index: 'Dated Brent', monthDef: 'n-1', category: 'Oil & Condensate' },
  { index: 'Dated Brent', monthDef: 'n-2', category: 'Oil & Condensate' },
  { index: 'Dated Brent', monthDef: 'n-3', category: 'Oil & Condensate' },
  { index: 'Dated Brent', monthDef: '3,0,1', category: 'Oil & Condensate' },
  { index: 'Dated Brent', monthDef: '3,2,1', category: 'Oil & Condensate' },
  { index: 'Dated Brent', monthDef: '3,0,3', category: 'Oil & Condensate' },
  { index: 'Dated Brent', monthDef: '6,0,1', category: 'Oil & Condensate' },
  { index: 'Dated Brent', monthDef: '6,0,3', category: 'Oil & Condensate' },

  // JCC
  { index: 'JCC', monthDef: 'n', category: 'Oil & Condensate' },
  { index: 'JCC', monthDef: 'n-1', category: 'Oil & Condensate' },
  { index: 'JCC', monthDef: 'n-2', category: 'Oil & Condensate' },
  { index: 'JCC', monthDef: 'n-3', category: 'Oil & Condensate' },
  { index: 'JCC', monthDef: '3,0,1', category: 'Oil & Condensate' },
  { index: 'JCC', monthDef: '3,2,1', category: 'Oil & Condensate' },
  { index: 'JCC', monthDef: '3,0,3', category: 'Oil & Condensate' },
  { index: 'JCC', monthDef: '6,0,1', category: 'Oil & Condensate' },
  { index: 'JCC', monthDef: '6,0,3', category: 'Oil & Condensate' },

  // JKM
  { index: 'JKM', monthDef: 'n', category: 'LNG Marker' },
  { index: 'JKM', monthDef: 'n-1', category: 'LNG Marker' },
  { index: 'JKM', monthDef: 'n-2', category: 'LNG Marker' },
  { index: 'JKM', monthDef: 'n+1', category: 'LNG Marker' },

  // TTF
  { index: 'TTF', monthDef: 'n', category: 'European Gas' },

  // NBP
  { index: 'NBP', monthDef: 'n', category: 'European Gas' },

  // HH
  { index: 'HH', monthDef: 'n', category: 'US Gas' },
  { index: 'HH', monthDef: 'n-1', category: 'US Gas' },
  { index: 'HH', monthDef: 'n-2', category: 'US Gas' },

  // HH Last Day
  { index: 'HH Last Day', monthDef: 'n', category: 'US Gas' },

  // AECO
  { index: 'AECO', monthDef: 'n', category: 'Canadian Gas' },

  // STN 2 (Station 2)
  { index: 'STN 2', monthDef: 'n', category: 'Canadian Gas' },
];

function normalizeIndexForPriceTab(rawIndex: string): string {
  if (!rawIndex) return '';
  const clean = rawIndex.trim();
  const upper = clean.toUpperCase();
  if (upper.includes('BRIPE') || upper.includes('BRENT INDEX')) return 'BRIPE';
  if (upper.includes('DATED BRENT') || upper === 'BRENT') return 'Dated Brent';
  if (upper.includes('JCC') || upper.includes('JAPAN CRUDE')) return 'JCC';
  if (upper.includes('JKM')) return 'JKM';
  if (upper.includes('TTF') || upper.includes('DUTCH')) return 'TTF';
  if (upper.includes('NBP')) return 'NBP';
  if (upper.includes('HH LAST DAY') || upper.includes('HENRY HUB LAST DAY')) return 'HH Last Day';
  if (upper.includes('HH') || upper.includes('HENRY HUB')) return 'HH';
  if (upper.includes('AECO')) return 'AECO';
  if (upper.includes('STATION 2') || upper.includes('STATION2') || upper.includes('STN 2') || upper.includes('STN2')) return 'STN 2';
  return clean;
}

function normalizeMonthDefForPriceTab(rawDef: string): string {
  if (!rawDef) return 'n';
  let clean = rawDef.trim();
  clean = clean.replace(/^\((.*)\)$/, '$1').trim();
  clean = clean.replace(/\s*,\s*/g, ',');
  if (clean === '301') return '3,0,1';
  if (clean === '321') return '3,2,1';
  if (clean === '303') return '3,0,3';
  if (clean === '601') return '6,0,1';
  if (clean === '603') return '6,0,3';
  return clean.toLowerCase();
}

interface PortfolioMonthColumn {
  key: string;      // e.g. "2026-01"
  label: string;    // e.g. "Jan-26"
  refDate: string;  // e.g. "2026-01-01"
  year: number;
  monthNum: number; // 1-12
  isPrevYear: boolean;
  isPortfolioYear: boolean;
  isNextYear: boolean;
}

function getPortfolioMonthColumns(portfolioYear: number): PortfolioMonthColumn[] {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const cols: PortfolioMonthColumn[] = [];

  const prevYear = portfolioYear - 1;
  const currYear = portfolioYear;
  const nextYear = portfolioYear + 1;

  // 12 months of previous year (Jan-(Y-1) to Dec-(Y-1))
  for (let m = 1; m <= 12; m++) {
    const mStr = String(m).padStart(2, '0');
    const yy = String(prevYear).slice(-2);
    cols.push({
      key: `${prevYear}-${mStr}`,
      label: `${months[m - 1]}-${yy}`,
      refDate: `${prevYear}-${mStr}-01`,
      year: prevYear,
      monthNum: m,
      isPrevYear: true,
      isPortfolioYear: false,
      isNextYear: false,
    });
  }

  // 12 months of current portfolio year (Jan-Y to Dec-Y)
  for (let m = 1; m <= 12; m++) {
    const mStr = String(m).padStart(2, '0');
    const yy = String(currYear).slice(-2);
    cols.push({
      key: `${currYear}-${mStr}`,
      label: `${months[m - 1]}-${yy}`,
      refDate: `${currYear}-${mStr}-01`,
      year: currYear,
      monthNum: m,
      isPrevYear: false,
      isPortfolioYear: true,
      isNextYear: false,
    });
  }

  // 1 month of next year (Jan-(Y+1))
  const nextYy = String(nextYear).slice(-2);
  cols.push({
    key: `${nextYear}-01`,
    label: `Jan-${nextYy}`,
    refDate: `${nextYear}-01-01`,
    year: nextYear,
    monthNum: 1,
    isPrevYear: false,
    isPortfolioYear: false,
    isNextYear: true,
  });

  return cols;
}

interface PriceTabProps {
  initialPortfolioYear?: number | string;
  curveDate?: string;
  onCurveDateChange?: (date: string) => void;
  highlightTarget?: PriceTabHighlightTarget | null;
}

export const PriceTab: React.FC<PriceTabProps> = ({
  initialPortfolioYear = 2027,
  curveDate: externalCurveDate,
  onCurveDateChange,
  highlightTarget,
}) => {
  const [availableDates, setAvailableDates] = useState<string[]>(() => getAvailableCurveDatesSync());
  const [internalCurveDate, setInternalCurveDate] = useState<string>(() => {
    return externalCurveDate || getActiveCurveDate() || (availableDates.length > 0 ? availableDates[0] : new Date().toISOString().split('T')[0]);
  });

  const activeCurveDate = externalCurveDate || internalCurveDate;

  useEffect(() => {
    if (externalCurveDate) {
      setInternalCurveDate(externalCurveDate);
    }
  }, [externalCurveDate]);

  useEffect(() => {
    const handleDateChange = (e: any) => {
      const newDate = e.detail?.date;
      if (newDate) {
        setAvailableDates(getAvailableCurveDatesSync());
        if (!externalCurveDate) {
          setInternalCurveDate(newDate);
        }
      }
    };
    window.addEventListener('forwardCurveDateChanged', handleDateChange);
    return () => window.removeEventListener('forwardCurveDateChanged', handleDateChange);
  }, [externalCurveDate]);

  const [selectedYear, setSelectedYear] = useState<number>(() => {
    if (highlightTarget?.portfolioYear) {
      const p = parseInt(String(highlightTarget.portfolioYear), 10);
      if (!isNaN(p) && p >= 2020 && p <= 2040) return p;
    }
    if (highlightTarget?.refDate) {
      const normKey = normalizeMonthKey(highlightTarget.refDate);
      if (normKey) {
        const y = parseInt(normKey.split('-')[0], 10);
        if (!isNaN(y) && y >= 2020 && y <= 2040) return y;
      }
    }
    const parsed = parseInt(String(initialPortfolioYear), 10);
    return !isNaN(parsed) && parsed >= 2020 && parsed <= 2040 ? parsed : 2027;
  });

  const [activeHighlight, setActiveHighlight] = useState<PriceTabHighlightTarget | null>(highlightTarget || null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [highlightIncomplete, setHighlightIncomplete] = useState<boolean>(true);
  const [showIncompleteOnly, setShowIncompleteOnly] = useState<boolean>(false);
  const [hoveredCell, setHoveredCell] = useState<{ rowIdx: number; colKey: string; details: string; monthUsed: string; isMissing?: boolean } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Sync highlight target if changed from props
  useEffect(() => {
    if (highlightTarget) {
      setActiveHighlight(highlightTarget);

      if (highlightTarget.portfolioYear) {
        const py = parseInt(String(highlightTarget.portfolioYear), 10);
        if (!isNaN(py) && py >= 2020 && py <= 2040) {
          setSelectedYear(py);
        }
      } else if (highlightTarget.refDate) {
        const targetMonthKey = normalizeMonthKey(highlightTarget.refDate);
        const yearFromDate = parseInt(targetMonthKey.split('-')[0], 10);
        if (!isNaN(yearFromDate) && yearFromDate >= 2020 && yearFromDate <= 2040) {
          setSelectedYear(yearFromDate);
        }
      }

      // Reset search if any so highlight row is visible
      setSearchTerm('');

      // Auto-scroll target cell into center view
      const timer = setTimeout(() => {
        const el = document.getElementById('price-tab-target-cell');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
      }, 200);

      return () => clearTimeout(timer);
    }
  }, [highlightTarget]);

  const monthColumns = useMemo(() => {
    return getPortfolioMonthColumns(selectedYear);
  }, [selectedYear]);

  // Derived normalized target coordinates
  const targetCoordinates = useMemo(() => {
    if (!activeHighlight) return null;
    const targetIndex = normalizeIndexForPriceTab(activeHighlight.index);
    const targetDef = normalizeMonthDefForPriceTab(activeHighlight.monthDef);
    const targetMonthKey = activeHighlight.refDate ? normalizeMonthKey(activeHighlight.refDate) : '';
    return { targetIndex, targetDef, targetMonthKey };
  }, [activeHighlight]);

  // Compute price grid data
  const gridData = useMemo(() => {
    const matrix: Array<{
      row: PriceTableRowDef;
      prices: Record<string, { price: number; details: string; monthUsed: string }>;
    }> = [];

    PRICE_TAB_ROWS.forEach(rowDef => {
      const prices: Record<string, { price: number; details: string; monthUsed: string }> = {};
      monthColumns.forEach(col => {
        const res = getIndexPrice(rowDef.index, col.refDate, rowDef.monthDef, activeCurveDate);
        prices[col.key] = res;
      });
      matrix.push({ row: rowDef, prices });
    });

    return matrix;
  }, [monthColumns, activeCurveDate]);

  // Incomplete stats calculation
  const incompleteStats = useMemo(() => {
    let totalMissing = 0;
    let portfolioYearMissing = 0;
    const rowsWithMissing = new Set<string>();

    gridData.forEach(item => {
      let rowHasMissing = false;
      monthColumns.forEach(col => {
        const p = item.prices[col.key]?.price;
        if (p === undefined || p === null || p <= 0) {
          totalMissing++;
          if (col.isPortfolioYear) portfolioYearMissing++;
          rowHasMissing = true;
        }
      });
      if (rowHasMissing) {
        rowsWithMissing.add(`${item.row.index}___${item.row.monthDef}`);
      }
    });

    return {
      totalMissing,
      portfolioYearMissing,
      rowsWithMissingCount: rowsWithMissing.size,
      isRowIncomplete: (index: string, monthDef: string) => rowsWithMissing.has(`${index}___${monthDef}`)
    };
  }, [gridData, monthColumns]);

  const filteredRows = useMemo(() => {
    return PRICE_TAB_ROWS.filter(r => {
      const matchesSearch = searchTerm.trim() === '' || 
        r.index.toLowerCase().includes(searchTerm.toLowerCase()) || 
        r.monthDef.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = selectedCategory === 'All' || 
        (selectedCategory === 'Oil & Condensate' && (r.index.includes('Brent') || r.index.includes('BRIPE') || r.index.includes('JCC'))) ||
        (selectedCategory === 'LNG / Gas' && !r.index.includes('Brent') && !r.index.includes('BRIPE') && !r.index.includes('JCC'));
      
      const matchesIncompleteOnly = !showIncompleteOnly || incompleteStats.isRowIncomplete(r.index, r.monthDef);

      return matchesSearch && matchesCategory && matchesIncompleteOnly;
    });
  }, [searchTerm, selectedCategory, showIncompleteOnly, incompleteStats]);

  // Find info about the highlighted cell for the header banner
  const highlightedPriceInfo = useMemo(() => {
    if (!targetCoordinates || !targetCoordinates.targetIndex || !targetCoordinates.targetMonthKey) return null;
    const item = gridData.find(g => 
      normalizeIndexForPriceTab(g.row.index) === targetCoordinates.targetIndex && 
      normalizeMonthDefForPriceTab(g.row.monthDef) === targetCoordinates.targetDef
    );
    const priceObj = item?.prices[targetCoordinates.targetMonthKey];
    const colObj = monthColumns.find(c => c.key === targetCoordinates.targetMonthKey);
    return {
      price: priceObj?.price || 0,
      details: priceObj?.details || '',
      monthUsed: priceObj?.monthUsed || '',
      colLabel: colObj?.label || targetCoordinates.targetMonthKey,
      rowDef: item?.row
    };
  }, [targetCoordinates, gridData, monthColumns]);

  const handleCopyTSV = () => {
    let tsv = 'Index\tMonth definition\t' + monthColumns.map(c => c.label).join('\t') + '\n';
    gridData.forEach(item => {
      const line = [
        item.row.index,
        item.row.monthDef,
        ...monthColumns.map(c => {
          const val = item.prices[c.key]?.price;
          return val !== undefined && val !== null && val > 0 ? val.toFixed(4) : '';
        })
      ];
      tsv += line.join('\t') + '\n';
    });

    navigator.clipboard.writeText(tsv);
    toast.success(`Copied Price Table (${selectedYear} Portfolio) to clipboard!`);
  };

  const handleExportExcel = () => {
    const headers = ['Index', 'Month definition', ...monthColumns.map(c => c.label)];
    const rows = gridData.map(item => [
      item.row.index,
      item.row.monthDef,
      ...monthColumns.map(c => {
        const val = item.prices[c.key]?.price;
        return val !== undefined && val !== null && val > 0 ? Number(val.toFixed(4)) : null;
      })
    ]);

    const worksheetData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);

    // Set column widths
    const colWidths = [{ wch: 16 }, { wch: 18 }, ...monthColumns.map(() => ({ wch: 11 }))];
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Price Table ${selectedYear}`);
    const fileName = `Forward_Price_Table_${selectedYear}_Portfolio_${activeCurveDate || 'latest'}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success(`Exported ${fileName}`);
  };

  const availableYears = [2025, 2026, 2027, 2028, 2029, 2030];

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden select-text">
      {/* Top Controls Bar */}
      <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 shadow-sm shrink-0 z-20">
        <div className="flex flex-wrap items-center gap-4">
          {/* Portfolio Year Selector */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
            <div className="flex items-center gap-1.5 px-2 text-[11px] font-black text-slate-500 uppercase tracking-wider">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>Portfolio:</span>
            </div>
            <div className="flex items-center gap-1">
              {availableYears.map(year => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    selectedYear === year
                      ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-700'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>

          {/* Curve As Of Date Selector */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Curve As Of:</span>
            {availableDates.length > 0 ? (
              <select
                value={activeCurveDate}
                onChange={(e) => {
                  setInternalCurveDate(e.target.value);
                  if (onCurveDateChange) onCurveDateChange(e.target.value);
                }}
                className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-blue-600 bg-white outline-none hover:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
              >
                {availableDates.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            ) : (
              <input
                type="date"
                value={activeCurveDate}
                onChange={(e) => {
                  setInternalCurveDate(e.target.value);
                  if (onCurveDateChange) onCurveDateChange(e.target.value);
                }}
                className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-blue-600 bg-white outline-none hover:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
              />
            )}
          </div>

          {/* Search Filter */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter Index or Def..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 w-44"
            />
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1">
            {['All', 'Oil & Condensate', 'LNG / Gas'].map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-all ${
                  selectedCategory === cat
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Incomplete Highlight & Filter Controls */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <button
              onClick={() => setHighlightIncomplete(!highlightIncomplete)}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg border transition-all ${
                highlightIncomplete
                  ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-xs'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
              title="Highlight cells with missing or incomplete forward/historical curve data"
            >
              <AlertTriangle className={`w-3.5 h-3.5 ${highlightIncomplete ? 'text-amber-600' : 'text-slate-400'}`} />
              <span>Highlight Incomplete</span>
            </button>

            {incompleteStats.rowsWithMissingCount > 0 && (
              <button
                onClick={() => setShowIncompleteOnly(!showIncompleteOnly)}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg border transition-all ${
                  showIncompleteOnly
                    ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                    : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
                }`}
                title="Filter table to only show rows with incomplete price points"
              >
                {showIncompleteOnly ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>Incomplete Only ({incompleteStats.rowsWithMissingCount})</span>
              </button>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {incompleteStats.portfolioYearMissing > 0 && (
            <span className="hidden lg:inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              <span>{incompleteStats.portfolioYearMissing} Missing in {selectedYear}</span>
            </span>
          )}
          <button
            onClick={handleCopyTSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm transition-all"
            title="Copy entire table to clipboard (Excel format)"
          >
            <Copy className="w-3.5 h-3.5 text-slate-500" />
            <span>Copy Grid</span>
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition-all"
            title="Export to Excel Spreadsheet (.xlsx)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Incomplete Warning Bar */}
      {highlightIncomplete && incompleteStats.totalMissing > 0 && (
        <div className="bg-amber-50/90 border-b border-amber-200 px-6 py-2 flex items-center justify-between text-xs text-amber-900 shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Incomplete Price Points Detected:</strong> {incompleteStats.totalMissing} contract months across {incompleteStats.rowsWithMissingCount} configurations lack valid forward or historical curve prices (highlighted below with amber dashed boxes).
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-amber-700 font-medium">
              Priority order: <strong>Forward Curve</strong> → <strong>Historical Curve</strong>
            </span>
          </div>
        </div>
      )}

      {/* Target Cell Highlighting Inspection Banner */}
      {activeHighlight && (
        <div className="bg-gradient-to-r from-amber-100 via-amber-50 to-orange-50 border-b border-amber-300 px-6 py-2.5 flex items-center justify-between shadow-sm shrink-0 z-20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-sm shadow-md ring-2 ring-amber-300 animate-pulse">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center flex-wrap gap-2">
                <span className="text-xs font-black text-amber-950 uppercase tracking-wide flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  Exact Cell Located from Cargo Form:
                </span>
                <span className="px-2 py-0.5 bg-amber-200 text-amber-950 border border-amber-400 rounded-md font-mono font-black text-xs shadow-xs">
                  Index: {targetCoordinates?.targetIndex}
                </span>
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-950 border border-indigo-300 rounded-md font-mono font-bold text-xs shadow-xs">
                  Month Def: {targetCoordinates?.targetDef}
                </span>
                <span className="text-slate-400 font-bold">→</span>
                <span className="px-2.5 py-0.5 bg-blue-100 text-blue-950 border border-blue-300 rounded-md font-mono font-bold text-xs shadow-xs">
                  Column: {highlightedPriceInfo?.colLabel || targetCoordinates?.targetMonthKey}
                </span>
                <span className="text-slate-400 font-bold">•</span>
                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-md font-mono font-black text-xs shadow-xs">
                  Retrieved Price: ${highlightedPriceInfo?.price ? highlightedPriceInfo.price.toFixed(4) : '0.0000'}
                </span>
              </div>
              {activeHighlight.sourceLabel && (
                <p className="text-[11px] text-amber-900 mt-0.5 font-medium">
                  Triggered by: <span className="font-bold text-amber-950">{activeHighlight.sourceLabel}</span>
                  {highlightedPriceInfo?.details && (
                    <span className="ml-2 text-slate-500 italic">({highlightedPriceInfo.details})</span>
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const el = document.getElementById('price-tab-target-cell');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
              }}
              className="px-3 py-1 text-xs font-bold text-amber-900 bg-amber-200/90 hover:bg-amber-300 rounded-lg border border-amber-400 transition-all shadow-xs"
            >
              Focus Cell
            </button>
            <button
              onClick={() => setActiveHighlight(null)}
              className="p-1 text-amber-700 hover:text-amber-950 hover:bg-amber-200 rounded-lg transition-all"
              title="Clear Highlight"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Column Year Legend Sub-Header */}
      <div className="px-6 py-2 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between text-[11px] font-semibold text-slate-600 shrink-0">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-1.5 text-slate-500">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block"></span>
            Prior Year: <strong className="text-slate-700">{selectedYear - 1}</strong> (Jan - Dec)
          </span>
          <span className="flex items-center gap-1.5 text-blue-600">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
            Portfolio Delivery Year: <strong className="text-blue-800">{selectedYear}</strong> (Jan - Dec)
          </span>
          <span className="flex items-center gap-1.5 text-amber-600">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
            Next Year: <strong className="text-amber-800">{selectedYear + 1}</strong> (Jan)
          </span>
        </div>
        <div className="text-[10px] text-slate-500 font-mono">
          Showing {filteredRows.length} configurations × {monthColumns.length} contract months
        </div>
      </div>

      {/* Main Table Grid Container */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto custom-scrollbar p-6">
        <div className="inline-block min-w-full align-middle">
          <div className="bg-white border border-slate-300 rounded-xl shadow-md overflow-hidden relative">
            <table className="min-w-full divide-y divide-slate-200 border-collapse text-left">
              {/* Table Header */}
              <thead className="bg-slate-200 text-slate-700 sticky top-0 z-30 shadow-sm">
                <tr className="divide-x divide-slate-300">
                  {/* Sticky Index Column */}
                  <th scope="col" className="sticky left-0 bg-slate-200 z-40 px-4 py-2.5 text-[11px] font-black text-slate-800 uppercase tracking-tight w-36 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    Index
                  </th>
                  {/* Sticky Month Definition Column */}
                  <th scope="col" className="sticky left-36 bg-slate-200 z-40 px-3 py-2.5 text-[11px] font-black text-slate-800 uppercase tracking-tight w-36 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    Month definition
                  </th>
                  {/* 25 Month Columns */}
                  {monthColumns.map((col) => {
                    const isTargetCol = targetCoordinates?.targetMonthKey === col.key;
                    let colBg = isTargetCol ? 'bg-amber-200 ring-2 ring-amber-400' : 'bg-slate-200';
                    let textStyle = isTargetCol ? 'text-amber-950 font-black' : 'text-slate-700';
                    
                    if (!isTargetCol) {
                      if (col.isPortfolioYear) {
                        colBg = 'bg-blue-100/90';
                        textStyle = 'text-blue-900 font-black';
                      } else if (col.isNextYear) {
                        colBg = 'bg-amber-100/90';
                        textStyle = 'text-amber-900 font-black';
                      }
                    }

                    return (
                      <th
                        key={col.key}
                        scope="col"
                        className={`px-3 py-2.5 text-center text-[10px] font-bold tracking-tight uppercase min-w-[76px] whitespace-nowrap transition-all ${colBg} ${textStyle}`}
                      >
                        {col.label}
                        {isTargetCol && (
                          <div className="text-[8px] font-black text-amber-700 tracking-normal capitalize">Target</div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredRows.map((rowDef, rIdx) => {
                  const item = gridData.find(g => g.row.index === rowDef.index && g.row.monthDef === rowDef.monthDef);
                  const isEvenRow = rIdx % 2 === 0;

                  const isTargetRow = targetCoordinates && 
                    normalizeIndexForPriceTab(rowDef.index) === targetCoordinates.targetIndex && 
                    normalizeMonthDefForPriceTab(rowDef.monthDef) === targetCoordinates.targetDef;

                  // Group boundary styling: thicker divider when index changes
                  const nextRow = filteredRows[rIdx + 1];
                  const isLastOfIndexGroup = !nextRow || nextRow.index !== rowDef.index;

                  return (
                    <tr
                      key={`${rowDef.index}-${rowDef.monthDef}-${rIdx}`}
                      className={`transition-colors ${
                        isTargetRow 
                          ? 'bg-amber-50/90 ring-1 ring-amber-300 font-medium' 
                          : isEvenRow 
                          ? 'bg-white hover:bg-blue-50/40' 
                          : 'bg-slate-50/50 hover:bg-blue-50/40'
                      } ${isLastOfIndexGroup ? 'border-b-2 border-slate-300' : ''}`}
                    >
                      {/* Sticky Index Cell */}
                      <td className={`sticky left-0 z-20 px-4 py-2 text-xs font-bold text-slate-800 whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${
                        isTargetRow ? 'bg-amber-100 text-amber-950 font-black' : isEvenRow ? 'bg-white' : 'bg-slate-50'
                      }`}>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-3.5 rounded-sm ${
                            isTargetRow
                              ? 'bg-amber-600 ring-1 ring-amber-700'
                              : rowDef.index.includes('Brent') || rowDef.index.includes('BRIPE') || rowDef.index.includes('JCC')
                              ? 'bg-amber-500'
                              : rowDef.index.includes('JKM')
                              ? 'bg-blue-500'
                              : 'bg-emerald-500'
                          }`}></span>
                          <span>{rowDef.index}</span>
                        </div>
                      </td>

                      {/* Sticky Month Definition Cell */}
                      <td className={`sticky left-36 z-20 px-3 py-2 text-xs font-mono whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${
                        isTargetRow ? 'bg-amber-100' : isEvenRow ? 'bg-white' : 'bg-slate-50'
                      }`}>
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                          isTargetRow
                            ? 'bg-amber-200 text-amber-950 border border-amber-400 font-black'
                            : rowDef.monthDef === 'n'
                            ? 'bg-slate-100 text-slate-700 border border-slate-200'
                            : rowDef.monthDef.startsWith('n-')
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            : rowDef.monthDef.startsWith('n+')
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-purple-50 text-purple-700 border border-purple-200'
                        }`}>
                          {rowDef.monthDef}
                        </span>
                      </td>

                      {/* 25 Month Price Values */}
                      {monthColumns.map((col) => {
                        const isTargetCol = targetCoordinates?.targetMonthKey === col.key;
                        const isExactTargetCell = isTargetRow && isTargetCol;

                        const priceObj = item?.prices[col.key];
                        const price = priceObj?.price;
                        const hasPrice = price !== undefined && price !== null && price > 0;
                        const isIncomplete = !hasPrice;
                        const showMissingHighlight = isIncomplete && highlightIncomplete;

                        return (
                          <td
                            key={col.key}
                            id={isExactTargetCell ? 'price-tab-target-cell' : undefined}
                            onMouseEnter={() => {
                              setHoveredCell({
                                rowIdx: rIdx,
                                colKey: col.key,
                                details: priceObj?.details || (isIncomplete ? `Missing price: No Forward or Historical curve point for ${rowDef.index} (${col.label})` : ''),
                                monthUsed: priceObj?.monthUsed || col.label,
                                isMissing: isIncomplete
                              });
                            }}
                            onMouseLeave={() => setHoveredCell(null)}
                            className={`px-3 py-2 text-xs font-mono text-right whitespace-nowrap border-l border-slate-200 transition-all ${
                              isExactTargetCell
                                ? 'bg-gradient-to-r from-amber-200 via-yellow-200 to-amber-200 text-amber-950 font-black ring-4 ring-amber-500/80 shadow-lg scale-105 z-20'
                                : showMissingHighlight
                                ? 'bg-amber-50/50 hover:bg-amber-100/60'
                                : isTargetRow
                                ? 'bg-amber-50/60'
                                : isTargetCol
                                ? 'bg-amber-50/40'
                                : col.isPortfolioYear
                                ? 'bg-blue-50/20'
                                : ''
                            } ${hasPrice ? 'text-slate-800' : 'text-slate-400'}`}
                            title={priceObj?.details || (isIncomplete ? `Missing price for ${rowDef.index} (${col.label})` : '')}
                          >
                            {hasPrice ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <span className={`font-semibold ${isExactTargetCell ? 'text-amber-950 font-black text-sm' : 'text-slate-800'}`}>
                                  {price.toFixed(4)}
                                </span>
                                {isExactTargetCell && (
                                  <span className="inline-flex items-center gap-0.5 px-1 py-0.2 bg-amber-600 text-white text-[8px] font-black rounded uppercase shadow-xs animate-pulse">
                                    🎯 RETRIEVED
                                  </span>
                                )}
                              </div>
                            ) : showMissingHighlight ? (
                              <div className="flex items-center justify-end gap-1">
                                <span className="px-1.5 py-0.5 text-[10px] font-bold text-amber-700 bg-amber-100/90 border border-dashed border-amber-300 rounded shadow-2xs inline-flex items-center gap-0.5" title={`Incomplete: No curve data for ${col.label}`}>
                                  <AlertTriangle className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                  <span>Missing</span>
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
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
      </div>

      {/* Bottom Status / Inspection Bar */}
      <div className="h-9 bg-slate-800 text-white flex items-center px-5 justify-between shrink-0 text-xs shadow-inner">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-blue-400" />
            Pricing Formula Engine:
          </span>
          {hoveredCell ? (
            <span className={`text-[11px] font-mono truncate max-w-2xl ${hoveredCell.isMissing ? 'text-amber-300 font-semibold' : 'text-blue-200'}`}>
              {hoveredCell.details} {hoveredCell.monthUsed ? `(Months: ${hoveredCell.monthUsed})` : ''}
            </span>
          ) : (
            <span className="text-[11px] text-slate-400 italic">
              Hover over any price cell to view underlying contract months and weighted averaging calculation
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-[10px] font-mono text-slate-300">
          <span>Active Curve: <strong className="text-white">{activeCurveDate || 'Latest'}</strong></span>
          <span className="text-slate-500">•</span>
          <span>Portfolio: <strong className="text-blue-300">{selectedYear}</strong></span>
          {incompleteStats.totalMissing > 0 && (
            <>
              <span className="text-slate-500">•</span>
              <span className="text-amber-300 font-bold">⚠️ {incompleteStats.totalMissing} Incomplete</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PriceTab;
