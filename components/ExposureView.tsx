
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CargoProfile, PnLBucket } from '../types';
import { estimatePricingDate, detectUnit, getGroupName } from '../services/calculationService';
import { motion, AnimatePresence } from 'framer-motion';

interface ExposureViewProps {
    profiles: CargoProfile[];
}

const INDICES = ['HH', 'TTF', 'JKM', 'Brent', 'NBP', 'JCC', 'AECO', 'Other'];

// Helper to determine Index Type
const getIndexType = (formula: string) => {
    const f = (formula || '').toUpperCase();
    if (f.includes('HH')) return 'HH';
    if (f.includes('TTF')) return 'TTF';
    if (f.includes('NBP')) return 'NBP';
    if (f.includes('JKM')) return 'JKM';
    if (f.includes('BRENT') || f.includes('DATED')) return 'Brent';
    if (f.includes('JCC')) return 'JCC';
    if (f.includes('AECO')) return 'AECO';
    return 'Other';
};

export const ExposureView: React.FC<ExposureViewProps> = ({ profiles }) => {
    const [tableYear, setTableYear] = useState<number>(new Date().getFullYear() + 1);
    const [groupByMode, setGroupByMode] = useState<'group' | 'source'>('group');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedIndex, setSelectedIndex] = useState<string | null>(null);
    const [groupThreshold, setGroupThreshold] = useState<number>(2);
    const [simDate, setSimDate] = useState<number>(new Date().getTime());
    const [isPlaying, setIsPlaying] = useState(false);
    
    // New state for Drill Down
    const [drillDownCell, setDrillDownCell] = useState<{ month: string, index: string } | null>(null);
    
    const animationRef = useRef<number>(0);

    // Determine Timeline Boundaries
    const { minDate, maxDate } = useMemo(() => {
        const now = new Date().getTime();
        let min = now;
        let max = now + 1000 * 60 * 60 * 24 * 365 * 1.5;
        
        if (profiles.length > 0) {
            profiles.forEach(p => {
                const d = p.deliveryDate ? new Date(p.deliveryDate).getTime() : now;
                if (d < min) min = d;
                if (d > max) max = d;
            });
        }
        
        return { 
            minDate: min - 1000 * 60 * 60 * 24 * 30,
            maxDate: max + 1000 * 60 * 60 * 24 * 30
        };
    }, [profiles]);

    useEffect(() => {
        if (isPlaying) {
            const range = maxDate - minDate;
            const step = range / 300;
            const animate = () => {
                setSimDate(prev => {
                    if (prev >= maxDate) {
                        setIsPlaying(false);
                        return maxDate;
                    }
                    return prev + step;
                });
                animationRef.current = requestAnimationFrame(animate);
            };
            animationRef.current = requestAnimationFrame(animate);
        } else {
            cancelAnimationFrame(animationRef.current);
        }
        return () => cancelAnimationFrame(animationRef.current);
    }, [isPlaying, minDate, maxDate]);

    const formatDate = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', year: 'numeric', day: 'numeric' });

    // Summary Table Generation
    const tableData = useMemo(() => {
        const start = new Date(tableYear - 1, 6, 1);
        const end = new Date(tableYear + 1, 0, 1);
        
        const months: string[] = [];
        let curr = new Date(start);
        while (curr <= end) {
            months.push(`${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}`);
            curr.setMonth(curr.getMonth() + 1);
        }

        const grid: Record<string, Record<string, number>> = {};
        months.forEach(m => {
            grid[m] = {};
            INDICES.forEach(idx => grid[m][idx] = 0);
        });

        let hasData = false;
        profiles.forEach(p => {
            if (p.pnlBucket === PnLBucket.Realized) return;
            
            const physicalMonthDate = p.deliveryDate || p.loadingDate;
            if (!physicalMonthDate) return;

            const d = new Date(physicalMonthDate);
            const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!grid[mKey]) return;

            const processLeg = (formula: string, vol: number, isBuy: boolean) => {
                if (!formula || vol <= 0) return;
                const idx = getIndexType(formula);
                const factor = isBuy ? -1 : 1;
                grid[mKey][idx] += (vol * factor);
                hasData = true;
            };

            processLeg(p.buyFormula, p.loadedVolume || 0, true);
            processLeg(p.sellFormula, p.deliveredVolume || 0, false);
            if (p.isTieredPricing) {
                processLeg(p.tier2BuyFormula || '', p.tier2LoadedVolume || 0, true);
                processLeg(p.tier2SellFormula || '', p.tier2DeliveredVolume || 0, false);
            }
        });

        return { months, grid, hasData };
    }, [profiles, tableYear]);

    // Drill down logic: find all profiles contributing to a specific month and index
    const contributors = useMemo(() => {
        if (!drillDownCell) return [];
        const { month, index } = drillDownCell;

        return profiles.filter(p => {
            if (p.pnlBucket === PnLBucket.Realized) return false;
            
            const physicalMonthDate = p.deliveryDate || p.loadingDate;
            if (!physicalMonthDate) return false;

            const d = new Date(physicalMonthDate);
            const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (mKey !== month) return false;

            const hasMatch = (formula: string) => formula && getIndexType(formula) === index;

            return hasMatch(p.buyFormula) || 
                   hasMatch(p.sellFormula) || 
                   (p.isTieredPricing && (hasMatch(p.tier2BuyFormula || '') || hasMatch(p.tier2SellFormula || '')));
        }).map(p => {
            // Extract the specific volume contribution for this index
            const getLegContribution = (formula: string, vol: number, isBuy: boolean) => {
                if (formula && getIndexType(formula) === index) return isBuy ? -vol : vol;
                return 0;
            };

            const contribution = getLegContribution(p.buyFormula, p.loadedVolume || 0, true) +
                               getLegContribution(p.sellFormula, p.deliveredVolume || 0, false) +
                               (p.isTieredPricing ? (getLegContribution(p.tier2BuyFormula || '', p.tier2LoadedVolume || 0, true) + getLegContribution(p.tier2SellFormula || '', p.tier2DeliveredVolume || 0, false)) : 0);

            return { ...p, _specificContribution: contribution };
        });
    }, [profiles, drillDownCell]);

    const getDynamicSourceCategory = useMemo(() => {
        const counts: Record<string, number> = {};
        profiles.forEach(p => {
            const s = (p.source || 'Unknown').trim();
            counts[s] = (counts[s] || 0) + 1;
        });
        return (sourceName: string) => {
            const s = (sourceName || 'Unknown').trim();
            if ((counts[s] || 0) >= groupThreshold) return s;
            return 'Others';
        };
    }, [profiles, groupThreshold]);

    const getProfileCategory = (p: CargoProfile) => {
        if (groupByMode === 'group') return getGroupName(p.strategyName);
        return getDynamicSourceCategory(p.source);
    };

    const { floatingCargoes, fixedCargoes } = useMemo(() => {
        const floating: any[] = [];
        const fixed: any[] = [];
        profiles.forEach(p => {
            if (p.pnlBucket === PnLBucket.Realized) return;

            const pricingEndStr = p.pricingEndDate || estimatePricingDate(p.sellFormula || p.buyFormula, p.deliveryDate);
            const pricingEnd = pricingEndStr ? new Date(pricingEndStr).getTime() : 0;
            
            const netVolT1 = (p.deliveredVolume || 0) - (p.loadedVolume || 0);
            const netVolT2 = p.isTieredPricing ? ((p.tier2DeliveredVolume || 0) - (p.tier2LoadedVolume || 0)) : 0;
            const netVol = netVolT1 + netVolT2;

            const unit = p.volumeUnit || detectUnit(p.sellFormula || p.buyFormula);
            let mmbtuVol = netVol;
            if (unit === 'bbl') mmbtuVol *= 5.8;
            else if (unit === 'm3') mmbtuVol *= 24;
            else if (unit === 'MT') mmbtuVol *= 52;
            
            const isExposed = simDate < pricingEnd;
            const daysToFix = Math.ceil((pricingEnd - simDate) / (1000 * 60 * 60 * 24));
            
            const item = { ...p, _netVolMMBtu: mmbtuVol, _displayNetVol: netVol, _daysToFix: daysToFix, _unit: unit };
            
            if (isExposed) floating.push(item);
            else fixed.push(item);
        });
        return { floatingCargoes: floating, fixedCargoes: fixed };
    }, [profiles, simDate]);

    const { categoryBreakdown, availableIndices } = useMemo(() => {
        const groups: Record<string, { total: number, indices: Record<string, number> }> = {};
        const indicesSet = new Set<string>();
        floatingCargoes.forEach((p: any) => {
            const cat = getProfileCategory(p);
            if (!groups[cat]) groups[cat] = { total: 0, indices: {} };
            
            const processLegForDist = (formula: string, vol: number, isBuy: boolean) => {
                if (!formula || vol <= 0) return;
                const idx = getIndexType(formula);
                indicesSet.add(idx);
                const factor = isBuy ? -1 : 1;
                const impact = vol * factor;
                groups[cat].total += impact;
                groups[cat].indices[idx] = (groups[cat].indices[idx] || 0) + impact;
            };

            processLegForDist(p.buyFormula, p.loadedVolume || 0, true);
            processLegForDist(p.sellFormula, p.deliveredVolume || 0, false);
            if (p.isTieredPricing) {
                processLegForDist(p.tier2BuyFormula || '', p.tier2LoadedVolume || 0, true);
                processLegForDist(p.tier2SellFormula || '', p.tier2DeliveredVolume || 0, false);
            }
        });
        const sortedGroups = Object.entries(groups).sort((a, b) => {
            if (a[0] === 'Others') return 1;
            if (b[0] === 'Others') return -1;
            return Math.abs(b[1].total) - Math.abs(a[1].total);
        });
        return { categoryBreakdown: sortedGroups, availableIndices: Array.from(indicesSet).sort() };
    }, [floatingCargoes, groupByMode, getDynamicSourceCategory]);

    const filteredFloating = useMemo(() => {
        return floatingCargoes.filter((p: any) => {
            if (selectedCategory && getProfileCategory(p) !== selectedCategory) return false;
            if (selectedIndex) {
                const hasIndex = getIndexType(p.sellFormula || p.buyFormula) === selectedIndex || 
                                (p.isTieredPricing && getIndexType(p.tier2SellFormula || p.tier2BuyFormula) === selectedIndex);
                if (!hasIndex) return false;
            }
            return true;
        });
    }, [floatingCargoes, selectedCategory, selectedIndex, groupByMode, getDynamicSourceCategory]);

    const filteredFixed = useMemo(() => {
        return fixedCargoes.filter((p: any) => {
            if (selectedCategory && getProfileCategory(p) !== selectedCategory) return false;
            if (selectedIndex) {
                const hasIndex = getIndexType(p.sellFormula || p.buyFormula) === selectedIndex || 
                                (p.isTieredPricing && getIndexType(p.tier2SellFormula || p.tier2BuyFormula) === selectedIndex);
                if (!hasIndex) return false;
            }
            return true;
        });
    }, [fixedCargoes, selectedCategory, selectedIndex, groupByMode, getDynamicSourceCategory]);

    const getIndexColorStr = (idx: string) => {
         const f = idx.toUpperCase();
         if (f === 'JKM') return 'bg-emerald-500';
         if (f === 'TTF') return 'bg-blue-500';
         if (f === 'NBP') return 'bg-indigo-500';
         if (f === 'HH') return 'bg-amber-500';
         if (f === 'BRENT') return 'bg-rose-500';
         if (f === 'JCC') return 'bg-orange-500';
         return 'bg-slate-400';
    };

    return (
        <div className="flex flex-col gap-6 p-2 min-h-[800px]">
            
            {/* EXPOSURE SUMMARY TABLE SECTION */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col shrink-0">
                <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/30">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                            Monthly Net Exposure Summary
                        </h2>
                        <p className="text-xs text-slate-500">Net floating volumes (Sales minus Purchases) mapped to physical delivery month.</p>
                    </div>
                    <div className="flex bg-slate-200/60 p-1 rounded-xl shadow-inner">
                        {[2025, 2026, 2027, 2028].map(year => (
                            <button
                                key={year}
                                onClick={() => setTableYear(year)}
                                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                    tableYear === year 
                                    ? 'bg-white text-indigo-600 shadow-sm' 
                                    : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                {year}
                            </button>
                        ))}
                    </div>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                                <th className="px-6 py-4 sticky left-0 bg-slate-50 z-10 w-[180px]">Physical Month</th>
                                {INDICES.map(idx => (
                                    <th key={idx} className="px-4 py-4 text-center">{idx}</th>
                                ))}
                                <th className="px-6 py-4 text-right bg-slate-100/50">Net Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {tableData.hasData ? (
                                tableData.months.map(m => {
                                    const rowTotal = INDICES.reduce((sum, idx) => sum + (tableData.grid[m][idx] || 0), 0);
                                    if (Math.abs(rowTotal) < 0.1) return null; 
                                    const [y, mon] = m.split('-');
                                    const dateObj = new Date(parseInt(y), parseInt(mon)-1, 1);
                                    const monthName = dateObj.toLocaleString('en-US', { month: 'short' });

                                    return (
                                        <tr key={m} className="hover:bg-indigo-50/30 transition-colors group">
                                            <td className="px-6 py-3 font-bold text-slate-700 sticky left-0 bg-white group-hover:bg-indigo-50/30 border-r border-slate-50">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-slate-300 font-mono text-[10px]">{y}</span>
                                                    <span className="uppercase">{monthName}</span>
                                                </div>
                                            </td>
                                            {INDICES.map(idx => {
                                                const val = tableData.grid[m][idx] || 0;
                                                const hasValue = Math.abs(val) > 0.1;
                                                return (
                                                    <td 
                                                        key={idx} 
                                                        onClick={() => hasValue && setDrillDownCell({ month: m, index: idx })}
                                                        className={`px-4 py-3 text-center font-mono transition-all ${
                                                            hasValue 
                                                            ? `cursor-pointer hover:bg-white hover:shadow-inner hover:scale-105 ${val < 0 ? 'text-rose-600 font-bold' : 'text-slate-900 font-bold'}` 
                                                            : 'text-slate-300'
                                                        }`}
                                                    >
                                                        {hasValue ? (val / 1000).toLocaleString(undefined, { maximumFractionDigits: 0, minimumFractionDigits: 0 }) + 'k' : '-'}
                                                    </td>
                                                );
                                            })}
                                            <td className={`px-6 py-3 text-right font-bold bg-slate-50/30 group-hover:bg-indigo-100/30 ${rowTotal >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                                                {(Number(rowTotal) / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}k
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={INDICES.length + 2} className="px-6 py-12 text-center text-slate-400 font-medium italic">
                                        No net exposure detected for physical month in {tableYear}.
                                    </td>
                                </tr>
                            )}
                            
                            {tableData.hasData && (
                                <tr className="bg-slate-900 text-white font-bold">
                                    <td className="px-6 py-4 sticky left-0 bg-slate-900 border-r border-slate-800">GRAND NET TOTAL</td>
                                    {INDICES.map(idx => {
                                        const colTotal = tableData.months.reduce((sum: number, m) => sum + (tableData.grid[m][idx] || 0), 0);
                                        return (
                                            <td key={idx} className={`px-4 py-4 text-center ${colTotal < 0 ? 'text-rose-400' : ''}`}>
                                                {Math.abs(colTotal) > 0.1 ? (Number(colTotal) / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 }) + 'k' : '-'}
                                            </td>
                                        );
                                    })}
                                    <td className={`px-6 py-4 text-right ${(Object.values(tableData.grid) as Record<string, number>[]).reduce((acc: number, row) => acc + (Object.values(row) as number[]).reduce((s: number, v: number) => s + v, 0), 0) >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                                        {(Number((Object.values(tableData.grid) as Record<string, number>[]).reduce((acc: number, row: Record<string, number>) => acc + (Object.values(row) as number[]).reduce((s: number, v: number) => s + v, 0), 0)) / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}k
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* DRILL DOWN MODAL */}
            <AnimatePresence>
                {drillDownCell && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden border border-white/20"
                        >
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <div>
                                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                                        <span className={`w-3 h-3 rounded-full ${getIndexColorStr(drillDownCell.index)}`}></span>
                                        {drillDownCell.index} Exposure Detail
                                    </h3>
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
                                        Physical Month: {new Date(parseInt(drillDownCell.month.split('-')[0]), parseInt(drillDownCell.month.split('-')[1])-1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setDrillDownCell(null)}
                                    className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                {contributors.length > 0 ? (
                                    contributors.map((p: any) => (
                                        <div key={p.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/30 flex items-center justify-between hover:border-indigo-200 transition-all group">
                                            <div className="min-w-0">
                                                <div className="font-bold text-slate-800 truncate">{p.strategyName}</div>
                                                <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-2">
                                                    <span className="font-bold text-slate-400">{p.source}</span>
                                                    <svg className="w-3 h-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                                    <span className="font-bold text-slate-400">{p.buyer}</span>
                                                </div>
                                            </div>
                                            <div className="text-right ml-4">
                                                <div className={`text-sm font-mono font-bold ${p._specificContribution < 0 ? 'text-rose-600' : 'text-indigo-600'}`}>
                                                    {p._specificContribution > 0 ? '+' : ''}{(p._specificContribution / 1000).toLocaleString()}k
                                                </div>
                                                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">
                                                    {p._specificContribution < 0 ? 'Purchase Leg' : 'Sales Leg'}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="py-12 text-center text-slate-400 italic">No contributors found for this selection.</div>
                                )}
                            </div>
                            
                            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
                                <div className="text-xs text-slate-500 font-bold uppercase">Total Net Exposure</div>
                                {/* Use explicit numeric type parameter to ensure the result is treated as a number during division. */}
                                <div className={`text-lg font-mono font-bold ${(contributors.reduce<number>((acc, p: any) => acc + (p._specificContribution || 0), 0)) < 0 ? 'text-rose-600' : 'text-indigo-600'}`}>
                                    {(contributors.reduce<number>((acc, p: any) => acc + (p._specificContribution || 0), 0) / 1000).toLocaleString()}k
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* LOWER CONTENT AREA */}
            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
                
                {/* LEFT PANEL: FILTERS & DISTRIBUTION */}
                <aside className="w-full lg:w-[380px] flex flex-col gap-4 shrink-0">
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-3">
                             <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Filter Index Cards</h3>
                             {selectedIndex && (
                                <button onClick={() => setSelectedIndex(null)} className="text-[10px] text-rose-500 font-bold hover:underline">Clear</button>
                             )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                             <button onClick={() => setSelectedIndex(null)} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${selectedIndex === null ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>All</button>
                            {availableIndices.map(idx => (
                                <button key={idx} onClick={() => setSelectedIndex(idx === selectedIndex ? null : idx)} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center gap-1.5 ${selectedIndex === idx ? 'bg-blue-600 text-white shadow-md border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
                                    <span className={`w-2 h-2 rounded-full ${getIndexColorStr(idx)}`}></span>
                                    {idx}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-bold text-slate-800">Net Exposure Distribution</h3>
                                <div className="flex bg-white p-0.5 rounded-lg border border-slate-200 shadow-sm">
                                    <button onClick={() => setGroupByMode('group')} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${groupByMode === 'group' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>Group</button>
                                    <button onClick={() => setGroupByMode('source')} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${groupByMode === 'source' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>Source</button>
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 bg-slate-50/30">
                            {categoryBreakdown.length > 0 ? (
                                categoryBreakdown.map(([category, data]) => (
                                    <div key={category} onClick={() => setSelectedCategory(selectedCategory === category ? null : category)} className={`bg-white rounded-xl border p-4 shadow-sm cursor-pointer transition-all ${selectedCategory === category ? 'border-blue-500 ring-1 ring-blue-500' : 'hover:border-blue-300'}`}>
                                        <div className="flex justify-between items-start mb-3">
                                            <span className="font-bold text-slate-800 truncate pr-2">{category}</span>
                                            <span className={`text-sm font-mono font-bold whitespace-nowrap ${data.total >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>{(Number(data.total)/1000).toFixed(0)}k</span>
                                        </div>
                                        <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-slate-100">
                                            {Object.entries(data.indices).map(([idx, vol], i) => (
                                                <div key={i} className={`${getIndexColorStr(idx)} h-full`} style={{ width: `${(Math.abs(vol) / (Object.values(data.indices) as number[]).reduce((a: number, b: number) => a + Math.abs(b), 0)) * 100}%` }} />
                                            ))}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="py-12 text-center text-slate-400 text-xs italic">No distribution data available</div>
                            )}
                        </div>
                    </div>
                </aside>

                {/* RIGHT PANEL: SIMULATION & CARGO LIST */}
                <main className="flex-1 flex flex-col gap-4 min-w-0">
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 shrink-0">
                        <button onClick={() => setIsPlaying(!isPlaying)} className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-sm transition-all ${isPlaying ? 'bg-amber-100 text-amber-600 ring-2 ring-amber-200' : 'bg-white text-blue-600 border border-slate-200 hover:bg-blue-50'}`}>
                            {isPlaying ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
                        </button>
                        <input type="range" min={minDate} max={maxDate} step={1000 * 60 * 60 * 24} value={simDate} onChange={(e) => { setSimDate(Number(e.target.value)); setIsPlaying(false); }} className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                        <div className="shrink-0 text-right min-w-[120px] border-l border-slate-100 pl-4">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Simulation Date</div>
                            <div className="text-sm font-bold text-blue-600">{formatDate(simDate)}</div>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
                        {/* Floating Exposure Column */}
                        <div className="flex-[2] bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-tight">Active Net Exposure</h3>
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-mono font-bold">{filteredFloating.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
                                {filteredFloating.length > 0 ? (
                                    filteredFloating.map(p => <CargoCard key={p.id} profile={p} status="floating" />)
                                ) : (
                                    <div className="py-20 text-center text-slate-400 text-sm">No floating cargoes match filters</div>
                                )}
                            </div>
                        </div>
                        
                        {/* Fixed Exposure Column */}
                        <div className="flex-1 bg-slate-50/50 rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-100/30">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-tight">Fixed</h3>
                                <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded-full text-[10px] font-mono font-bold">{filteredFixed.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 opacity-70">
                                {filteredFixed.length > 0 ? (
                                    filteredFixed.map(p => <CargoCard key={p.id} profile={p} status="fixed" />)
                                ) : (
                                    <div className="py-20 text-center text-slate-300 text-xs italic">No fixed positions</div>
                                )}
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

const CargoCard: React.FC<{ profile: any, status: 'floating' | 'fixed' }> = ({ profile, status }) => {
    const f = (profile.sellFormula || profile.buyFormula || '').toUpperCase();
    const color = f.includes('JKM') ? 'bg-emerald-500' : f.includes('TTF') ? 'bg-blue-500' : f.includes('HH') ? 'bg-amber-500' : 'bg-slate-400';
    return (
        <div className={`p-4 rounded-xl border bg-white flex items-center justify-between shadow-sm border-slate-200 transition-all ${status === 'floating' ? 'hover:border-blue-300 hover:shadow-md' : 'grayscale-[0.4]'}`}>
            <div className="flex items-center gap-3 min-w-0">
                <div className={`w-2 h-8 rounded-full shrink-0 ${color}`} />
                <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 truncate">{profile.strategyName}</div>
                    <div className="text-[10px] text-slate-400 truncate">{profile.source} → {profile.buyer}</div>
                </div>
            </div>
            <div className="text-right shrink-0 ml-3">
                <div className={`text-xs font-mono font-bold ${profile._displayNetVol >= 0 ? 'text-slate-700' : 'text-rose-500'}`}>
                    {(Number(profile._displayNetVol)/1000).toFixed(0)}k
                </div>
                {status === 'floating' && (
                    <div className={`text-[9px] font-bold mt-0.5 ${profile._daysToFix <= 7 ? 'text-rose-500 animate-pulse' : 'text-slate-400'}`}>
                        FIX in {profile._daysToFix}d
                    </div>
                )}
            </div>
        </div>
    );
};
