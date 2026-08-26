import React, { useState, useMemo, useRef, useEffect } from 'react';
import { CargoProfile, PnLBucket, DashboardFilterState, createInitialDashboardFilterState } from '../types';
import { getGroupName } from '../services/calculationService';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Filter, 
  ChevronRight, 
  X, 
  RotateCcw, 
  Calendar, 
  Ship, 
  Tag, 
  Building2, 
  Layers, 
  Search, 
  Sparkles,
  Folder,
  FolderOpen
} from 'lucide-react';

interface DashboardFiltersProps {
  profiles: CargoProfile[];
  filters: DashboardFilterState;
  onFilterChange: (filters: DashboardFilterState) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  matchingCount: number;
  totalCount: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface DateDayItem {
  dateStr: string;
  dayNum: string;
  weekday: string;
  formattedDate: string;
  count: number;
  strategies: string[];
  buyers: string[];
  sources: string[];
}

interface DateMonthItem {
  monthName: string;
  monthNum: string;
  count: number;
  allDates: string[];
  days: DateDayItem[];
}

interface DateHierarchyNode {
  year: string;
  count: number;
  allDates: string[];
  months: DateMonthItem[];
}

// Tri-state checkbox helper component for Excel-style selection
const IndeterminateCheckbox: React.FC<{
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  className?: string;
  id?: string;
  title?: string;
}> = ({ checked, indeterminate = false, onChange, className = '', id, title }) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      id={id}
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      title={title}
      className={`w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer ${className}`}
    />
  );
};

export const DashboardFilters: React.FC<DashboardFiltersProps> = ({
  profiles,
  filters,
  onFilterChange,
  isOpen,
  onToggleOpen,
  matchingCount,
  totalCount
}) => {
  const [activeTab, setActiveTab] = useState<'delivery' | 'loading' | 'strategy' | 'counterparty' | 'bucket'>('delivery');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Count total active individual filters
  const activeCount = useMemo(() => {
    let count = 0;
    if (filters.deliveryDates.size > 0) count += filters.deliveryDates.size;
    if (filters.loadingDates.size > 0) count += filters.loadingDates.size;
    if (filters.strategies.size > 0) count += filters.strategies.size;
    if (filters.strategyGroups.size > 0) count += filters.strategyGroups.size;
    if (filters.buyers.size > 0) count += filters.buyers.size;
    if (filters.sources.size > 0) count += filters.sources.size;
    if (filters.pnlBuckets.size > 0) count += filters.pnlBuckets.size;
    return count;
  }, [filters]);

  // Tab-specific active counts
  const tabCounts = useMemo(() => ({
    delivery: filters.deliveryDates.size,
    loading: filters.loadingDates.size,
    strategy: filters.strategies.size + filters.strategyGroups.size,
    counterparty: filters.buyers.size + filters.sources.size,
    bucket: filters.pnlBuckets.size
  }), [filters]);

  // Helper to parse date string into Year, Month, Day
  const parseDate = (dStr: string) => {
    if (!dStr) return null;
    const clean = dStr.trim();
    const parts = clean.split(/[-/]/);
    if (parts.length >= 3) {
      let y = parts[0];
      let m = parts[1];
      let d = parts[2];
      if (parts[2].length === 4) { // DD-MM-YYYY
        d = parts[0];
        m = parts[1];
        y = parts[2];
      }
      const mNum = parseInt(m, 10);
      const dNum = parseInt(d, 10);
      const monthName = (mNum >= 1 && mNum <= 12) ? MONTH_NAMES[mNum - 1] : `Month ${m}`;
      const dayFormatted = String(dNum).padStart(2, '0');
      
      const dateObj = new Date(parseInt(y, 10), mNum - 1, dNum);
      const weekday = !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString('en-US', { weekday: 'short' }) : '';
      const formattedDate = `${dayFormatted} ${monthName.slice(0, 3)} ${y}`;

      return {
        year: y,
        monthNum: String(mNum).padStart(2, '0'),
        monthName,
        dayNum: dayFormatted,
        weekday,
        formattedDate,
        originalStr: clean
      };
    }
    return null;
  };

  // Build Delivery Date Hierarchy (Year -> Month -> Days)
  const deliveryHierarchy = useMemo<DateHierarchyNode[]>(() => {
    const yearMap = new Map<string, Map<string, Map<string, { count: number; strategies: string[]; buyers: string[]; sources: string[]; dayNum: string; weekday: string; formattedDate: string }>>>();

    profiles.forEach(p => {
      if (!p.deliveryDate) return;
      const parsed = parseDate(p.deliveryDate);
      if (!parsed) return;

      const { year, monthName, dayNum, weekday, formattedDate, originalStr } = parsed;

      if (!yearMap.has(year)) yearMap.set(year, new Map());
      const mYear = yearMap.get(year)!;

      if (!mYear.has(monthName)) mYear.set(monthName, new Map());
      const dMap = mYear.get(monthName)!;

      if (!dMap.has(originalStr)) {
        dMap.set(originalStr, { count: 0, strategies: [], buyers: [], sources: [], dayNum, weekday, formattedDate });
      }
      const entry = dMap.get(originalStr)!;
      entry.count += 1;
      if (p.strategyName && !entry.strategies.includes(p.strategyName)) entry.strategies.push(p.strategyName);
      if (p.buyer && !entry.buyers.includes(p.buyer)) entry.buyers.push(p.buyer);
      if (p.source && !entry.sources.includes(p.source)) entry.sources.push(p.source);
    });

    const result: DateHierarchyNode[] = [];
    const sortedYears = Array.from(yearMap.keys()).sort();

    sortedYears.forEach(year => {
      const monthsMap = yearMap.get(year)!;
      const sortedMonths = Array.from(monthsMap.keys()).sort((a, b) => {
        return MONTH_NAMES.indexOf(a) - MONTH_NAMES.indexOf(b);
      });

      const monthsList: DateMonthItem[] = sortedMonths.map(monthName => {
        const datesMap = monthsMap.get(monthName)!;
        const sortedDates = Array.from(datesMap.keys()).sort();
        
        const days: DateDayItem[] = sortedDates.map(dStr => {
          const item = datesMap.get(dStr)!;
          return {
            dateStr: dStr,
            dayNum: item.dayNum,
            weekday: item.weekday,
            formattedDate: item.formattedDate,
            count: item.count,
            strategies: item.strategies,
            buyers: item.buyers,
            sources: item.sources
          };
        });

        const allDates = sortedDates;
        const count = days.reduce((acc, d) => acc + d.count, 0);
        const monthNum = String(MONTH_NAMES.indexOf(monthName) + 1).padStart(2, '0');

        return { monthName, monthNum, count, days, allDates };
      });

      const allDates = monthsList.flatMap(m => m.allDates);
      const count = monthsList.reduce((acc, m) => acc + m.count, 0);

      result.push({ year, count, allDates, months: monthsList });
    });

    return result;
  }, [profiles]);

  // Build Loading Date Hierarchy (Year -> Month -> Days)
  const loadingHierarchy = useMemo<DateHierarchyNode[]>(() => {
    const yearMap = new Map<string, Map<string, Map<string, { count: number; strategies: string[]; buyers: string[]; sources: string[]; dayNum: string; weekday: string; formattedDate: string }>>>();

    profiles.forEach(p => {
      if (!p.loadingDate) return;
      const parsed = parseDate(p.loadingDate);
      if (!parsed) return;

      const { year, monthName, dayNum, weekday, formattedDate, originalStr } = parsed;

      if (!yearMap.has(year)) yearMap.set(year, new Map());
      const mYear = yearMap.get(year)!;

      if (!mYear.has(monthName)) mYear.set(monthName, new Map());
      const dMap = mYear.get(monthName)!;

      if (!dMap.has(originalStr)) {
        dMap.set(originalStr, { count: 0, strategies: [], buyers: [], sources: [], dayNum, weekday, formattedDate });
      }
      const entry = dMap.get(originalStr)!;
      entry.count += 1;
      if (p.strategyName && !entry.strategies.includes(p.strategyName)) entry.strategies.push(p.strategyName);
      if (p.buyer && !entry.buyers.includes(p.buyer)) entry.buyers.push(p.buyer);
      if (p.source && !entry.sources.includes(p.source)) entry.sources.push(p.source);
    });

    const result: DateHierarchyNode[] = [];
    const sortedYears = Array.from(yearMap.keys()).sort();

    sortedYears.forEach(year => {
      const monthsMap = yearMap.get(year)!;
      const sortedMonths = Array.from(monthsMap.keys()).sort((a, b) => {
        return MONTH_NAMES.indexOf(a) - MONTH_NAMES.indexOf(b);
      });

      const monthsList: DateMonthItem[] = sortedMonths.map(monthName => {
        const datesMap = monthsMap.get(monthName)!;
        const sortedDates = Array.from(datesMap.keys()).sort();
        
        const days: DateDayItem[] = sortedDates.map(dStr => {
          const item = datesMap.get(dStr)!;
          return {
            dateStr: dStr,
            dayNum: item.dayNum,
            weekday: item.weekday,
            formattedDate: item.formattedDate,
            count: item.count,
            strategies: item.strategies,
            buyers: item.buyers,
            sources: item.sources
          };
        });

        const allDates = sortedDates;
        const count = days.reduce((acc, d) => acc + d.count, 0);
        const monthNum = String(MONTH_NAMES.indexOf(monthName) + 1).padStart(2, '0');

        return { monthName, monthNum, count, days, allDates };
      });

      const allDates = monthsList.flatMap(m => m.allDates);
      const count = monthsList.reduce((acc, m) => acc + m.count, 0);

      result.push({ year, count, allDates, months: monthsList });
    });

    return result;
  }, [profiles]);

  // Build Strategy & Group Hierarchy
  const strategyHierarchy = useMemo(() => {
    const groupMap = new Map<string, { count: number; strategies: { name: string; count: number }[] }>();

    profiles.forEach(p => {
      const group = getGroupName(p.strategyName, p.strategyGroup) || 'Others';
      if (!groupMap.has(group)) {
        groupMap.set(group, { count: 0, strategies: [] });
      }
      const gEntry = groupMap.get(group)!;
      gEntry.count += 1;

      const existingStrat = gEntry.strategies.find(s => s.name === p.strategyName);
      if (existingStrat) {
        existingStrat.count += 1;
      } else {
        gEntry.strategies.push({ name: p.strategyName, count: 1 });
      }
    });

    return Array.from(groupMap.entries()).map(([group, data]) => ({
      group,
      count: data.count,
      strategies: data.strategies.sort((a, b) => a.name.localeCompare(b.name)),
      allStrategyNames: data.strategies.map(s => s.name)
    })).sort((a, b) => a.group.localeCompare(b.group));
  }, [profiles]);

  // Buyer & Source Lists
  const buyersList = useMemo(() => {
    const map = new Map<string, number>();
    profiles.forEach(p => {
      if (p.buyer) {
        map.set(p.buyer, (map.get(p.buyer) || 0) + 1);
      }
    });
    return Array.from(map.entries()).map(([buyer, count]) => ({ name: buyer, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [profiles]);

  const sourcesList = useMemo(() => {
    const map = new Map<string, number>();
    profiles.forEach(p => {
      if (p.source) {
        map.set(p.source, (map.get(p.source) || 0) + 1);
      }
    });
    return Array.from(map.entries()).map(([source, count]) => ({ name: source, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [profiles]);

  // PnL Bucket breakdown
  const bucketList = useMemo(() => {
    let realized = 0;
    let unrealized = 0;
    profiles.forEach(p => {
      if (p.pnlBucket === PnLBucket.Realized) realized += 1;
      else unrealized += 1;
    });
    return [
      { id: PnLBucket.Realized, name: 'Realized Physical', count: realized, color: 'text-blue-600 bg-blue-50 border-blue-200' },
      { id: PnLBucket.Unrealized, name: 'Unrealized Physical', count: unrealized, color: 'text-amber-600 bg-amber-50 border-amber-200' }
    ];
  }, [profiles]);

  // Node toggle helpers
  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const expandAllCurrent = () => {
    const nodes = new Set<string>();
    if (activeTab === 'delivery') {
      deliveryHierarchy.forEach(y => {
        nodes.add(`del-y-${y.year}`);
        y.months.forEach(m => nodes.add(`del-m-${y.year}-${m.monthName}`));
      });
    } else if (activeTab === 'loading') {
      loadingHierarchy.forEach(y => {
        nodes.add(`load-y-${y.year}`);
        y.months.forEach(m => nodes.add(`load-m-${y.year}-${m.monthName}`));
      });
    } else if (activeTab === 'strategy') {
      strategyHierarchy.forEach(g => nodes.add(`strat-g-${g.group}`));
    }
    setExpandedNodes(prev => new Set([...prev, ...nodes]));
  };

  const collapseAllCurrent = () => {
    setExpandedNodes(new Set());
  };

  // Selection toggle helpers
  const toggleSingle = (key: keyof DashboardFilterState, val: string) => {
    const nextSet = new Set(filters[key]);
    if (nextSet.has(val)) nextSet.delete(val);
    else nextSet.add(val);
    onFilterChange({ ...filters, [key]: nextSet });
  };

  const toggleBulk = (key: keyof DashboardFilterState, vals: string[], shouldSelect: boolean) => {
    const nextSet = new Set(filters[key]);
    vals.forEach(v => {
      if (shouldSelect) nextSet.add(v);
      else nextSet.delete(v);
    });
    onFilterChange({ ...filters, [key]: nextSet });
  };

  const clearKey = (key: keyof DashboardFilterState) => {
    onFilterChange({ ...filters, [key]: new Set() });
  };

  const resetAll = () => {
    onFilterChange(createInitialDashboardFilterState());
  };

  // Render Excel-like Date Tree for Delivery or Loading
  const renderDateHierarchyTree = (
    hierarchy: DateHierarchyNode[],
    filterKey: 'deliveryDates' | 'loadingDates',
    prefix: 'del' | 'load',
    labelTitle: string
  ) => {
    const allTabDates = hierarchy.flatMap(y => y.allDates);
    const currentSet = filters[filterKey];
    const allTabSelected = allTabDates.length > 0 && allTabDates.every(d => currentSet.has(d));
    const someTabSelected = allTabDates.some(d => currentSet.has(d));

    if (hierarchy.length === 0) {
      return <p className="text-xs text-slate-400 italic p-6 text-center">No {labelTitle.toLowerCase()} found in portfolio</p>;
    }

    return (
      <div className="space-y-2">
        {/* Excel-style (Select All) Master Header */}
        <div className="flex items-center justify-between p-2.5 bg-slate-100/80 rounded-xl border border-slate-200 text-xs">
          <div className="flex items-center gap-2.5">
            <IndeterminateCheckbox
              checked={allTabSelected}
              indeterminate={someTabSelected && !allTabSelected}
              onChange={() => toggleBulk(filterKey, allTabDates, !allTabSelected)}
              title="Select / Deselect all dates"
            />
            <span className="font-bold text-slate-800">
              (Select All {searchTerm ? 'Search Results' : 'Dates'})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
              {currentSet.size} of {allTabDates.length} dates selected
            </span>
            {currentSet.size > 0 && (
              <button
                type="button"
                onClick={() => clearKey(filterKey)}
                className="text-[11px] text-rose-600 hover:text-rose-800 font-bold px-2 py-0.5 hover:bg-rose-50 rounded transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Tree Container */}
        <div className="space-y-2 pt-1">
          {hierarchy.map(yearNode => {
            const isExpYear = expandedNodes.has(`${prefix}-y-${yearNode.year}`) || Boolean(searchTerm);
            const allYearSel = yearNode.allDates.every(d => currentSet.has(d));
            const someYearSel = yearNode.allDates.some(d => currentSet.has(d));

            // Search filter
            const matchesYear = yearNode.year.includes(searchTerm);
            const filteredMonths = yearNode.months.filter(m => {
              if (matchesYear) return true;
              if (m.monthName.toLowerCase().includes(searchTerm.toLowerCase())) return true;
              return m.days.some(d => 
                d.dateStr.includes(searchTerm) || 
                d.formattedDate.toLowerCase().includes(searchTerm.toLowerCase()) ||
                d.strategies.some(s => s.toLowerCase().includes(searchTerm.toLowerCase())) ||
                d.buyers.some(b => b.toLowerCase().includes(searchTerm.toLowerCase()))
              );
            });

            if (searchTerm && filteredMonths.length === 0 && !matchesYear) return null;

            return (
              <div key={`${prefix}-year-${yearNode.year}`} className="border border-slate-200 rounded-xl bg-white shadow-2xs overflow-hidden">
                {/* Year Level Header (Excel style) */}
                <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-50/80 hover:bg-slate-100/80 transition-colors border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleNode(`${prefix}-y-${yearNode.year}`)}
                      className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 rounded-md transition-colors"
                      title={isExpYear ? 'Collapse year' : 'Expand year to select months & days'}
                    >
                      <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isExpYear ? 'rotate-90 text-indigo-600' : ''}`} />
                    </button>

                    <IndeterminateCheckbox
                      checked={allYearSel}
                      indeterminate={someYearSel && !allYearSel}
                      onChange={() => toggleBulk(filterKey, yearNode.allDates, !allYearSel)}
                    />

                    <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleNode(`${prefix}-y-${yearNode.year}`)}>
                      {isExpYear ? (
                        <FolderOpen className="w-4 h-4 text-amber-500" />
                      ) : (
                        <Folder className="w-4 h-4 text-amber-500" />
                      )}
                      <span className="text-xs font-bold text-slate-900">
                        {yearNode.year}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200 shadow-2xs">
                      {yearNode.count} cargoes ({yearNode.allDates.length} dates)
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleBulk(filterKey, yearNode.allDates, !allYearSel)}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold px-1.5 py-0.5 hover:bg-indigo-50 rounded"
                    >
                      {allYearSel ? 'Uncheck Year' : 'Check Year'}
                    </button>
                  </div>
                </div>

                {/* Months Level (Nested under Year) */}
                {isExpYear && (
                  <div className="p-2 space-y-2 bg-slate-50/30">
                    {filteredMonths.map(monthNode => {
                      const isExpMonth = expandedNodes.has(`${prefix}-m-${yearNode.year}-${monthNode.monthName}`) || Boolean(searchTerm);
                      const allMonthSel = monthNode.allDates.every(d => currentSet.has(d));
                      const someMonthSel = monthNode.allDates.some(d => currentSet.has(d));

                      const filteredDays = monthNode.days.filter(d => {
                        if (!searchTerm) return true;
                        return d.dateStr.includes(searchTerm) || 
                               d.formattedDate.toLowerCase().includes(searchTerm.toLowerCase()) ||
                               d.strategies.some(s => s.toLowerCase().includes(searchTerm.toLowerCase())) ||
                               d.buyers.some(b => b.toLowerCase().includes(searchTerm.toLowerCase()));
                      });

                      return (
                        <div key={`${prefix}-m-${yearNode.year}-${monthNode.monthName}`} className="ml-4 pl-3 border-l-2 border-indigo-200 bg-white rounded-lg p-2 border border-slate-200/80 shadow-2xs">
                          {/* Month Row Header */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleNode(`${prefix}-m-${yearNode.year}-${monthNode.monthName}`)}
                                className="p-0.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
                                title={isExpMonth ? 'Collapse month' : 'Expand month to select days'}
                              >
                                <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpMonth ? 'rotate-90 text-indigo-600' : ''}`} />
                              </button>

                              <IndeterminateCheckbox
                                checked={allMonthSel}
                                indeterminate={someMonthSel && !allMonthSel}
                                onChange={() => toggleBulk(filterKey, monthNode.allDates, !allMonthSel)}
                              />

                              <span 
                                className="text-xs font-semibold text-slate-800 cursor-pointer select-none hover:text-indigo-600"
                                onClick={() => toggleNode(`${prefix}-m-${yearNode.year}-${monthNode.monthName}`)}
                              >
                                {monthNode.monthName} ({monthNode.count} cargoes, {monthNode.days.length} days)
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleBulk(filterKey, monthNode.allDates, !allMonthSel)}
                              className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium px-1.5 py-0.5 hover:bg-indigo-50 rounded"
                            >
                              {allMonthSel ? 'Uncheck Month' : 'Check Month'}
                            </button>
                          </div>

                          {/* Days Level (Nested under Month) */}
                          {isExpMonth && (
                            <div className="ml-5 mt-2 pl-3 border-l-2 border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 pt-1.5">
                              {filteredDays.map(dayItem => {
                                const isChecked = currentSet.has(dayItem.dateStr);
                                return (
                                  <label
                                    key={`${prefix}-d-${dayItem.dateStr}`}
                                    className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer border transition-all text-left select-none ${
                                      isChecked
                                        ? 'bg-indigo-50/90 border-indigo-300 text-indigo-950 font-medium shadow-2xs'
                                        : 'bg-slate-50/50 border-slate-100 hover:bg-slate-100 hover:border-slate-200 text-slate-700'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => toggleSingle(filterKey, dayItem.dateStr)}
                                      className="mt-0.5 w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="text-[11px] font-bold text-slate-800">
                                          Day {dayItem.dayNum}
                                        </span>
                                        <span className="text-[10px] font-mono text-indigo-600 bg-white/80 px-1.5 py-0.2 rounded border border-slate-200">
                                          {dayItem.dateStr}
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-slate-500 mt-0.5 flex items-center justify-between gap-1">
                                        <span>{dayItem.weekday}, {dayItem.formattedDate}</span>
                                        <span className="font-semibold text-slate-700 bg-slate-100 px-1 rounded">
                                          {dayItem.count} cargo{dayItem.count > 1 ? 'es' : ''}
                                        </span>
                                      </div>
                                      {dayItem.strategies.length > 0 && (
                                        <p className="text-[9px] text-slate-400 truncate mt-0.5">
                                          {dayItem.strategies.slice(0, 2).join(', ')}{dayItem.strategies.length > 2 ? ` (+${dayItem.strategies.length - 2})` : ''}
                                        </p>
                                      )}
                                    </div>
                                  </label>
                                );
                              })}
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
      </div>
    );
  };

  return (
    <div className="w-full">
      {/* Active Filter Chips Bar - Shown when any filters are active */}
      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 py-2 px-3 mb-2 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs">
          <div className="flex items-center gap-1.5 text-indigo-700 font-bold mr-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Active Filters ({activeCount}):</span>
          </div>

          {/* Delivery Date Chips */}
          {Array.from(filters.deliveryDates).map(dateStr => (
            <span 
              key={`del-${dateStr}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-indigo-200 text-indigo-800 text-[11px] font-medium shadow-2xs"
            >
              <Calendar className="w-3 h-3 text-indigo-500" />
              <span>Del: {dateStr}</span>
              <button 
                onClick={() => toggleSingle('deliveryDates', dateStr)} 
                className="hover:bg-indigo-100 p-0.5 rounded text-indigo-400 hover:text-indigo-700"
                title="Remove filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {/* Loading Date Chips */}
          {Array.from(filters.loadingDates).map(dateStr => (
            <span 
              key={`load-${dateStr}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-blue-200 text-blue-800 text-[11px] font-medium shadow-2xs"
            >
              <Ship className="w-3 h-3 text-blue-500" />
              <span>Load: {dateStr}</span>
              <button 
                onClick={() => toggleSingle('loadingDates', dateStr)} 
                className="hover:bg-blue-100 p-0.5 rounded text-blue-400 hover:text-blue-700"
                title="Remove filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {/* Strategy Chips */}
          {Array.from(filters.strategies).map(strat => (
            <span 
              key={`strat-${strat}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-800 text-[11px] font-medium shadow-2xs"
            >
              <Tag className="w-3 h-3 text-slate-400" />
              <span>Strat: {strat}</span>
              <button 
                onClick={() => toggleSingle('strategies', strat)} 
                className="hover:bg-slate-100 p-0.5 rounded text-slate-400 hover:text-slate-700"
                title="Remove filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {/* Strategy Group Chips */}
          {Array.from(filters.strategyGroups).map(grp => (
            <span 
              key={`grp-${grp}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-purple-200 text-purple-800 text-[11px] font-medium shadow-2xs"
            >
              <Layers className="w-3 h-3 text-purple-400" />
              <span>Group: {grp}</span>
              <button 
                onClick={() => toggleSingle('strategyGroups', grp)} 
                className="hover:bg-purple-100 p-0.5 rounded text-purple-400 hover:text-purple-700"
                title="Remove filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {/* Buyer Chips */}
          {Array.from(filters.buyers).map(buyer => (
            <span 
              key={`buyer-${buyer}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-emerald-200 text-emerald-800 text-[11px] font-medium shadow-2xs"
            >
              <Building2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Buyer: {buyer}</span>
              <button 
                onClick={() => toggleSingle('buyers', buyer)} 
                className="hover:bg-emerald-100 p-0.5 rounded text-emerald-400 hover:text-emerald-700"
                title="Remove filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {/* Source Chips */}
          {Array.from(filters.sources).map(source => (
            <span 
              key={`source-${source}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-cyan-200 text-cyan-800 text-[11px] font-medium shadow-2xs"
            >
              <Ship className="w-3 h-3 text-cyan-500" />
              <span>Source: {source}</span>
              <button 
                onClick={() => toggleSingle('sources', source)} 
                className="hover:bg-cyan-100 p-0.5 rounded text-cyan-400 hover:text-cyan-700"
                title="Remove filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {/* PnL Bucket Chips */}
          {Array.from(filters.pnlBuckets).map(bkt => (
            <span 
              key={`bkt-${bkt}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-amber-200 text-amber-800 text-[11px] font-medium shadow-2xs"
            >
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Status: {bkt}</span>
              <button 
                onClick={() => toggleSingle('pnlBuckets', bkt)} 
                className="hover:bg-amber-100 p-0.5 rounded text-amber-400 hover:text-amber-700"
                title="Remove filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {/* Clear All Button */}
          <button
            onClick={resetAll}
            className="ml-auto flex items-center gap-1 px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold rounded-md transition-colors text-[11px]"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset All</span>
          </button>
        </div>
      )}

      {/* Collapsible Filter Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden mb-4"
          >
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-4 sm:p-5">
              {/* Header inside Panel */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 mb-4 border-b border-slate-100 gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                    <Filter className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Portfolio Filters</h4>
                    <p className="text-[11px] text-slate-500">Filter portfolio cargoes by hierarchical Delivery/Loading dates, Strategy, Buyer, and P&L status</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                  <span className="text-xs font-medium text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                    Showing <strong className="text-indigo-600 font-bold">{matchingCount}</strong> of {totalCount} Cargoes
                  </span>
                  {activeCount > 0 && (
                    <button
                      onClick={resetAll}
                      className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-xs font-bold hover:bg-rose-100 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset Filters</span>
                    </button>
                  )}
                  <button
                    onClick={onToggleOpen}
                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Close filter panel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Tabs Bar */}
              <div className="flex flex-wrap items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                <button
                  onClick={() => { setActiveTab('delivery'); setSearchTerm(''); }}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'delivery'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Delivery Date</span>
                  {tabCounts.delivery > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${activeTab === 'delivery' ? 'bg-white/20 text-white' : 'bg-indigo-600 text-white'}`}>
                      {tabCounts.delivery}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => { setActiveTab('loading'); setSearchTerm(''); }}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'loading'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <Ship className="w-3.5 h-3.5" />
                  <span>Loading Date</span>
                  {tabCounts.loading > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${activeTab === 'loading' ? 'bg-white/20 text-white' : 'bg-indigo-600 text-white'}`}>
                      {tabCounts.loading}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => { setActiveTab('strategy'); setSearchTerm(''); }}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'strategy'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>Strategy & Group</span>
                  {tabCounts.strategy > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${activeTab === 'strategy' ? 'bg-white/20 text-white' : 'bg-indigo-600 text-white'}`}>
                      {tabCounts.strategy}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => { setActiveTab('counterparty'); setSearchTerm(''); }}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'counterparty'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Buyer & Source</span>
                  {tabCounts.counterparty > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${activeTab === 'counterparty' ? 'bg-white/20 text-white' : 'bg-indigo-600 text-white'}`}>
                      {tabCounts.counterparty}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => { setActiveTab('bucket'); setSearchTerm(''); }}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'bucket'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>P&L Bucket</span>
                  {tabCounts.bucket > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${activeTab === 'bucket' ? 'bg-white/20 text-white' : 'bg-indigo-600 text-white'}`}>
                      {tabCounts.bucket}
                    </span>
                  )}
                </button>
              </div>

              {/* Sub-toolbar: Search & Quick Expand/Collapse */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder={`Search within ${activeTab === 'delivery' ? 'delivery dates' : activeTab === 'loading' ? 'loading dates' : activeTab === 'strategy' ? 'strategies and groups' : 'options'}...`}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {['delivery', 'loading', 'strategy'].includes(activeTab) && (
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      onClick={expandAllCurrent}
                      className="px-2.5 py-1 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md font-semibold transition-colors text-[11px]"
                    >
                      Expand All
                    </button>
                    <button
                      onClick={collapseAllCurrent}
                      className="px-2.5 py-1 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md font-semibold transition-colors text-[11px]"
                    >
                      Collapse All
                    </button>
                  </div>
                )}
              </div>

              {/* Tab Content Panes */}
              <div className="max-h-[380px] overflow-y-auto custom-scrollbar pr-2 pt-1">
                {/* 1. DELIVERY DATE HIERARCHY (Year -> Month -> Days) */}
                {activeTab === 'delivery' && renderDateHierarchyTree(deliveryHierarchy, 'deliveryDates', 'del', 'Delivery Dates')}

                {/* 2. LOADING DATE HIERARCHY (Year -> Month -> Days) */}
                {activeTab === 'loading' && renderDateHierarchyTree(loadingHierarchy, 'loadingDates', 'load', 'Loading Dates')}

                {/* 3. STRATEGY & GROUP HIERARCHY */}
                {activeTab === 'strategy' && (
                  <div className="space-y-2">
                    {strategyHierarchy.map(gNode => {
                      const isExpGroup = expandedNodes.has(`strat-g-${gNode.group}`) || Boolean(searchTerm);
                      const currentStratSet = filters.strategies;
                      const allStratSel = gNode.allStrategyNames.every(s => currentStratSet.has(s));
                      const someStratSel = gNode.allStrategyNames.some(s => currentStratSet.has(s));

                      const filteredStrategies = gNode.strategies.filter(s => {
                        if (!searchTerm) return true;
                        return s.name.toLowerCase().includes(searchTerm.toLowerCase()) || gNode.group.toLowerCase().includes(searchTerm.toLowerCase());
                      });

                      if (searchTerm && filteredStrategies.length === 0) return null;

                      return (
                        <div key={`grp-${gNode.group}`} className="border border-slate-200 rounded-xl bg-white shadow-2xs p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => toggleNode(`strat-g-${gNode.group}`)}
                                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-md transition-colors"
                              >
                                <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpGroup ? 'rotate-90 text-indigo-600' : ''}`} />
                              </button>

                              <IndeterminateCheckbox
                                checked={allStratSel}
                                indeterminate={someStratSel && !allStratSel}
                                onChange={() => toggleBulk('strategies', gNode.allStrategyNames, !allStratSel)}
                              />
                              <span className="text-xs font-bold text-slate-800">
                                {gNode.group} Group
                              </span>
                            </div>

                            <span className="text-[10px] font-semibold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                              {gNode.count} cargoes ({gNode.strategies.length} strategies)
                            </span>
                          </div>

                          {isExpGroup && (
                            <div className="ml-5 mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 pt-2 border-t border-slate-100">
                              {filteredStrategies.map(strat => {
                                const isChecked = currentStratSet.has(strat.name);
                                return (
                                  <label
                                    key={`strat-${strat.name}`}
                                    className={`flex items-center justify-between gap-2 p-2 rounded-lg cursor-pointer border transition-colors ${
                                      isChecked
                                        ? 'bg-indigo-50/70 border-indigo-200 text-indigo-900 font-medium'
                                        : 'bg-white border-slate-100 hover:bg-slate-50 text-slate-700'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleSingle('strategies', strat.name)}
                                        className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                      />
                                      <span className="text-xs truncate font-semibold">{strat.name}</span>
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                      {strat.count} cargo{strat.count > 1 ? 'es' : ''}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 4. BUYER & SOURCE ATTRIBUTES */}
                {activeTab === 'counterparty' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Buyers */}
                    <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-2xs">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                          Buyers ({buyersList.length})
                        </span>
                        {filters.buyers.size > 0 && (
                          <button
                            onClick={() => clearKey('buyers')}
                            className="text-[10px] text-rose-600 font-medium hover:underline"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      <div className="space-y-1 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
                        {buyersList
                          .filter(b => b.name.toLowerCase().includes(searchTerm.toLowerCase()))
                          .map(b => {
                            const isChecked = filters.buyers.has(b.name);
                            return (
                              <label
                                key={`buyer-${b.name}`}
                                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer border text-xs transition-colors ${
                                  isChecked
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-bold'
                                    : 'bg-white border-slate-100 hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleSingle('buyers', b.name)}
                                    className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                                  />
                                  <span className="truncate">{b.name}</span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono">{b.count}</span>
                              </label>
                            );
                          })}
                      </div>
                    </div>

                    {/* Sources */}
                    <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-2xs">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <Ship className="w-3.5 h-3.5 text-cyan-600" />
                          Sources / Origins ({sourcesList.length})
                        </span>
                        {filters.sources.size > 0 && (
                          <button
                            onClick={() => clearKey('sources')}
                            className="text-[10px] text-rose-600 font-medium hover:underline"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      <div className="space-y-1 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
                        {sourcesList
                          .filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))
                          .map(s => {
                            const isChecked = filters.sources.has(s.name);
                            return (
                              <label
                                key={`source-${s.name}`}
                                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer border text-xs transition-colors ${
                                  isChecked
                                    ? 'bg-cyan-50 border-cyan-200 text-cyan-900 font-bold'
                                    : 'bg-white border-slate-100 hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleSingle('sources', s.name)}
                                    className="w-3.5 h-3.5 text-cyan-600 rounded border-slate-300 focus:ring-cyan-500"
                                  />
                                  <span className="truncate">{s.name}</span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono">{s.count}</span>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. PnL BUCKET */}
                {activeTab === 'bucket' && (
                  <div className="max-w-md mx-auto space-y-2 p-2">
                    <p className="text-xs text-slate-500 mb-3 text-center">Filter portfolio by cargo operational status</p>
                    {bucketList.map(b => {
                      const isChecked = filters.pnlBuckets.has(b.id);
                      return (
                        <label
                          key={`bkt-${b.id}`}
                          className={`flex items-center justify-between p-3.5 rounded-xl cursor-pointer border transition-all ${
                            isChecked
                              ? `${b.color} shadow-xs font-bold`
                              : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSingle('pnlBuckets', b.id)}
                              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                            />
                            <span className="text-sm font-semibold">{b.name}</span>
                          </div>
                          <span className="text-xs font-mono font-bold bg-white/80 px-2 py-0.5 rounded-md border border-slate-100 shadow-2xs">
                            {b.count} Cargoes
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
