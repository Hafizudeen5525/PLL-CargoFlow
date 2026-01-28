
import React, { useState, useEffect, useMemo } from 'react';
import { CargoProfile, PnLBucket } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { getFixationDate, getIndexType, getHistoricalCurve, MARKET_INTELLIGENCE, generateHistoricalShocks } from '../services/calculationService';

interface ExposureViewProps {
    profiles: CargoProfile[];
    onCargoClick?: (profile: CargoProfile) => void;
    editingProfileId?: string;
    portfolioYear: string;
}

const INDICES = ['BRIPE', 'JCC', 'Dated Brent', 'HH', 'HH Last Day', 'NBP', 'JKM', 'TTF', 'AECO', 'Station 2', 'Other'];

const HOLIDAY_DEFAULTS: Record<string, string> = {
    '2025-01-01': "New Year's Day",
    '2025-01-20': "MLK Jr Day",
    '2025-02-17': "Presidents' Day",
    '2025-05-26': "Memorial Day",
    '2025-06-19': "Juneteenth",
    '2025-07-04': "Independence Day",
    '2025-09-01': "Labor Day",
    '2025-10-13': "Columbus Day",
    '2025-11-11': "Veterans Day",
    '2025-11-27': "Thanksgiving Day",
    '2025-12-25': "Christmas Day",
};

const getPricingMonths = (refDateStr: string, monthDef: string = 'n'): string[] => {
    if (!refDateStr) return [];
    const base = new Date(refDateStr);
    const d = new Date(base.getFullYear(), base.getMonth(), 15);
    const results: string[] = [];
    const cleanDef = (monthDef || 'n').toLowerCase().replace(/\s/g, '');
    const avgMatch = cleanDef.match(/\(?(\d+),(\d+),(\d+)\)?/);
    if (avgMatch) {
        const count = parseInt(avgMatch[1]), lag = parseInt(avgMatch[2]);
        for (let i = 0; i < count; i++) {
            const t = new Date(d.getFullYear(), d.getMonth() - lag - i, 15);
            results.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`);
        }
    } else {
        let offset = 0;
        if (cleanDef.includes('n-')) offset = -parseInt(cleanDef.split('n-')[1] || '0');
        else if (cleanDef.includes('n+')) offset = parseInt(cleanDef.split('n+')[1] || '0');
        const t = new Date(d.getFullYear(), d.getMonth() + offset, 15);
        results.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`);
    }
    return results;
};

interface PricingExposure {
    profileId: string;
    strategyName: string;
    index: string;
    pricingMonth: string;
    volume: number;
}

export const ExposureView: React.FC<ExposureViewProps> = ({ profiles, onCargoClick, portfolioYear }) => {
    const [tableYear, setTableYear] = useState<number>(new Date().getFullYear());
    const [drillDownCell, setDrillDownCell] = useState<{ month: string, index: string } | null>(null);
    const [auditOpen, setAuditOpen] = useState(false);
    const [holidays, setHolidays] = useState<Record<string, string>>(() => {
        const saved = localStorage.getItem('exposure_holidays_named');
        return saved ? JSON.parse(saved) : HOLIDAY_DEFAULTS;
    });
    const [showInfo, setShowInfo] = useState(false);
    const [showHolidayManager, setShowHolidayManager] = useState(false);

    useEffect(() => {
        localStorage.setItem('exposure_holidays_named', JSON.stringify(holidays));
    }, [holidays]);

    const simDate = useMemo(() => new Date().getTime(), []);

    const profilePricingExposures = useMemo<PricingExposure[]>(() => {
        return profiles.flatMap(p => {
            if (p.pnlBucket === PnLBucket.Realized) return [];
            const results: PricingExposure[] = [];
            const processLeg = (formula: string, vol: number, isBuy: boolean, isTier2: boolean) => {
                if (!formula || vol <= 0) return;
                const index = getIndexType(formula);
                const refDate = isBuy ? p.loadingDate : p.deliveryDate;
                let mDef = 'n';
                if (!isTier2) mDef = isBuy ? (p.buyPrice1MonthDef || 'n') : (p.sellPrice1MonthDef || 'n');
                else mDef = isBuy ? (p.tier2BuyPrice1MonthDef || 'n') : (p.tier2SellPrice1MonthDef || 'n');
                const pricingMonths = getPricingMonths(refDate, mDef);
                const volPerMonth = vol / pricingMonths.length;
                pricingMonths.forEach(m => {
                    results.push({ profileId: p.id, strategyName: p.strategyName, index, pricingMonth: m, volume: isBuy ? -volPerMonth : volPerMonth });
                });
            };
            processLeg(p.buyFormula, p.loadedVolume || 0, true, false);
            processLeg(p.sellFormula, p.deliveredVolume || 0, false, false);
            if (p.isTieredPricing) {
                processLeg(p.tier2BuyFormula || '', p.tier2LoadedVolume || 0, true, true);
                processLeg(p.tier2SellFormula || '', p.tier2DeliveredVolume || 0, false, true);
            }
            return results;
        });
    }, [profiles]);

    const tableData = useMemo(() => {
        const months: string[] = [];
        const grid: Record<string, Record<string, { floating: number, base: number }>> = {};
        for (let i = 0; i < 19; i++) {
            const d = new Date(tableYear - 1, 6 + i, 1);
            const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            months.push(mKey);
            grid[mKey] = {};
            INDICES.forEach(idx => grid[mKey][idx] = { floating: 0, base: 0 });
        }
        profilePricingExposures.forEach(exp => {
            if (!grid[exp.pricingMonth]) return;
            const fixD = getFixationDate(exp.index, exp.pricingMonth);
            const fixTs = fixD.getTime();

            let mult = 0;
            if (exp.index === 'HH Last Day') {
                mult = simDate < fixTs ? 1 : 0;
            } else {
                const startTs = fixTs - (31 * 24 * 60 * 60 * 1000);
                if (simDate < startTs) mult = 1;
                else if (simDate < fixTs) mult = 1 - ((simDate - startTs) / (fixTs - startTs));
            }

            const cell = grid[exp.pricingMonth][exp.index] || grid[exp.pricingMonth]['Other'];
            cell.floating += exp.volume * mult;
            cell.base += exp.volume;
        });
        return { months, grid };
    }, [profilePricingExposures, tableYear, simDate]);

    /**
     * HISTORICAL SIMULATION RISK ENGINE (256-Day Lookback)
     */
    const riskMetrics = useMemo(() => {
        const historical = getHistoricalCurve();

        // 1. Calculate Net Floating Deltas (Position Values)
        const netDeltaPerIndex: Record<string, number> = {};
        profilePricingExposures.forEach(exp => {
            const fixD = getFixationDate(exp.index, exp.pricingMonth);
            if (simDate < fixD.getTime()) {
                const prices = historical.map(r => r.prices[exp.index]).filter(p => p > 0);
                const currentPrice = prices.length > 0 ? prices[prices.length - 1] : 10.0;
                netDeltaPerIndex[exp.index] = (netDeltaPerIndex[exp.index] || 0) + (exp.volume * currentPrice);
            }
        });

        const activeIndices = Object.keys(netDeltaPerIndex);
        if (activeIndices.length === 0) return { var: 0, cvar: 0, totalExposure: 0, confidence: 'None', auditData: [], worstDays: [], diversification: 0, standaloneRiskSum: 0 };

        // 2. Generate/Retrieve 256 Days of Market Shocks (Daily log-returns)
        const dailyShocks = generateHistoricalShocks(256);
        const dailyPnLOutcomes: number[] = [];

        for (let d = 0; d < 256; d++) {
            let simDayPnL = 0;
            activeIndices.forEach(idx => {
                const shock = dailyShocks[idx]?.[d] || 0;
                simDayPnL += (netDeltaPerIndex[idx] * shock);
            });
            dailyPnLOutcomes.push(simDayPnL);
        }

        // 3. Extract Statistics from the Outcome Distribution
        // 95% confidence on 256 days = worst 12.8 outcomes
        const sortedOutcomes = [...dailyPnLOutcomes].sort((a, b) => a - b);
        const varIndex = Math.floor(256 * 0.05); // ~Day 12
        const var95 = Math.abs(sortedOutcomes[varIndex]);

        // CVaR is the average of the tail
        const tailOutcomes = sortedOutcomes.slice(0, varIndex + 1);
        const cvar95 = Math.abs(tailOutcomes.reduce((a, b) => a + b, 0) / tailOutcomes.length);

        // Calculate diversification benefit vs standalone Var Sum
        let standaloneSum = 0;
        activeIndices.forEach(idx => {
            const indexShocks = dailyShocks[idx] || [];
            const sortedIdxShocks = [...indexShocks].sort((a, b) => a - b);
            const idxWorst = sortedIdxShocks[varIndex] || 0;
            standaloneSum += Math.abs(netDeltaPerIndex[idx] * idxWorst);
        });

        const diversification = standaloneSum > 0 ? (1 - (var95 / standaloneSum)) * 100 : 0;

        return {
            var: var95,
            cvar: cvar95,
            totalExposure: Object.values(netDeltaPerIndex).reduce((a, b) => a + Math.abs(b), 0),
            confidence: 'Historical Simulation (256-Day)',
            diversification,
            standaloneRiskSum: standaloneSum,
            auditData: activeIndices.map(idx => ({
                index: idx,
                usdDelta: netDeltaPerIndex[idx],
                worstShock: Math.min(...(dailyShocks[idx] || [0])),
                avgShock: (dailyShocks[idx] || [0]).reduce((a, b) => a + b, 0) / 256
            })),
            worstDays: sortedOutcomes.slice(0, 10).map(v => Math.abs(v))
        };
    }, [profilePricingExposures, simDate]);

    const formatUSD = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

    return (
        <div className="flex flex-col gap-6 p-2 h-full">
            {/* Risk Analytics Header */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
                <motion.div
                    whileHover={{ scale: 1.02 }}
                    onClick={() => setAuditOpen(true)}
                    className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between overflow-hidden relative group cursor-pointer"
                >
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity">
                        <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 002-2M9 5a2 2 0 012 2h2a2 2 0 012 2" /></svg>
                    </div>
                    <div className="relative z-10">
                        <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest block mb-1">Daily VaR (Hist Sim)</span>
                        <h3 className="text-3xl font-black text-white font-mono">{formatUSD(riskMetrics.var)}</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-2">Worst 5% Probability Outcome</p>
                    </div>
                </motion.div>

                <motion.div
                    whileHover={{ scale: 1.02 }}
                    onClick={() => setAuditOpen(true)}
                    className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between overflow-hidden relative group cursor-pointer"
                >
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity">
                        <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                    </div>
                    <div className="relative z-10">
                        <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest block mb-1">Expected Shortfall</span>
                        <h3 className="text-3xl font-black text-white font-mono">{formatUSD(riskMetrics.cvar)}</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-2">Avg loss in extreme tail</p>
                    </div>
                </motion.div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Diversification Benefit</span>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-3xl font-black text-indigo-600">{(riskMetrics.diversification || 0).toFixed(1)}%</h3>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-tighter">Correlation risk reduction</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Risk Methodology</span>
                        <div className="flex flex-col gap-1">
                            <span className="text-xs font-bold text-slate-700">Historical Simulation</span>
                            <div className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-700 w-max">
                                {riskMetrics.confidence}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 h-full">
                <AnimatePresence>
                    {showInfo && (
                        <motion.aside
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: 'auto' }}
                            exit={{ opacity: 0, width: 0 }}
                            className="xl:col-span-1 bg-slate-900 text-slate-300 p-6 rounded-2xl border border-slate-800 shadow-xl overflow-hidden hidden xl:flex flex-col"
                        >
                            <div className="flex justify-between items-center mb-6 shrink-0">
                                <h3 className="font-bold text-white uppercase tracking-widest text-[10px] flex items-center gap-2">HistSim Intelligence</h3>
                                <button onClick={() => setShowInfo(false)} className="text-slate-500 hover:text-white"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                            </div>
                            <div className="space-y-6 overflow-y-auto custom-scrollbar flex-1 pr-2">
                                <ExpiryItem title="Lookback" rule="Past 256 daily forward curve shifts applied to today's portfolio." />
                                <ExpiryItem title="Confidence" rule="Uses 95% threshold (approx. the 13th worst day in current history)." />
                                <ExpiryItem title="Non-Linearity" rule="Captures fat-tails and skewed volatility distributions better than parametric VaR." />
                            </div>
                        </motion.aside>
                    )}
                </AnimatePresence>

                <div className={`${showInfo ? 'xl:col-span-3' : 'xl:col-span-4'} flex flex-col gap-6`}>
                    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col shrink-0">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
                            <div className="flex items-center gap-3">
                                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    Floating Exposure Matrix
                                    <button onClick={() => setShowInfo(!showInfo)} className={`p-1 rounded-full transition-colors ${showInfo ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`} title="Show Guide">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </button>
                                </h2>
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={() => setShowHolidayManager(true)} className="px-4 py-2 flex items-center gap-2 text-xs font-bold rounded-lg transition-all border border-slate-200 hover:bg-white text-slate-600">
                                    <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    Trading Calendar
                                </button>
                                <div className="flex bg-slate-200/60 p-1 rounded-xl shadow-inner ml-2">
                                    {[2025, 2026, 2027].map(year => (
                                        <button key={year} onClick={() => setTableYear(year)} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${tableYear === year ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{year}</button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-xs text-left border-collapse min-w-[1200px]">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                                        <th className="px-6 py-4 sticky left-0 bg-slate-50 z-10 w-[180px]">Pricing Month</th>
                                        {INDICES.map(idx => (<th key={idx} className="px-4 py-4 text-center">{idx}</th>))}
                                        <th className="px-6 py-4 text-right bg-slate-100/50 sticky right-0 z-10">Total Vol</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {tableData.months.map(m => {
                                        const [y, mon] = m.split('-');
                                        const monthName = new Date(parseInt(y), parseInt(mon) - 1, 1).toLocaleString('en-US', { month: 'short' });
                                        return (
                                            <tr key={m} className="hover:bg-indigo-50/30 transition-colors group">
                                                <td className="px-6 py-3 font-bold sticky left-0 group-hover:bg-indigo-50/30 bg-white text-slate-700 border-r border-slate-50">
                                                    <div className="flex items-center gap-2"><span className="text-[10px] font-mono opacity-50">{y}</span><span className="uppercase tracking-tight">{monthName}</span></div>
                                                </td>
                                                {INDICES.map(idx => {
                                                    const cell = tableData.grid[m][idx];
                                                    const hasValue = Math.abs(cell.base) > 0.1;
                                                    const isFixed = Math.abs(cell.floating) < 0.1;
                                                    let colorClass = 'text-slate-900';
                                                    if (isFixed) colorClass = cell.base < 0 ? 'text-rose-200' : 'text-slate-200';
                                                    else if (cell.floating < 0) colorClass = 'text-rose-600 font-bold';
                                                    else colorClass = 'text-indigo-600 font-bold';

                                                    return (
                                                        <td key={idx} onClick={() => hasValue && setDrillDownCell({ month: m, index: idx })} className={`px-4 py-3 text-center font-mono transition-all ${hasValue ? 'cursor-pointer hover:bg-white hover:shadow-inner' : 'text-slate-50'}`}>
                                                            {hasValue ? (
                                                                <div className={`flex flex-col ${colorClass} relative`}>
                                                                    <span>{(cell.base / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}k</span>
                                                                    {!isFixed && <div className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></div>}
                                                                </div>
                                                            ) : '—'}
                                                        </td>
                                                    );
                                                })}
                                                <td className="px-6 py-3 text-right font-bold bg-slate-50/30 group-hover:bg-indigo-100/30 sticky right-0 z-10 text-slate-400">
                                                    {(() => {
                                                        const rowBase = INDICES.reduce((acc, idx) => acc + tableData.grid[m][idx].base, 0);
                                                        return Math.abs(rowBase) > 0.1 ? (rowBase / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 }) + 'k' : '0k';
                                                    })()}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>
            </div>

            <AnimatePresence>
                {auditOpen && (
                    <RiskAuditModal
                        onClose={() => setAuditOpen(false)}
                        metrics={riskMetrics}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showHolidayManager && (
                    <HolidayManager
                        onClose={() => setShowHolidayManager(false)}
                        holidays={holidays}
                        onUpdateHolidays={setHolidays}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {drillDownCell && (
                    <DrillDownModal
                        cell={drillDownCell}
                        onClose={() => setDrillDownCell(null)}
                        profiles={profiles}
                        simDate={simDate}
                        onCargoClick={onCargoClick}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

const RiskAuditModal = ({ onClose, metrics }: any) => {
    const formatUSD = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
    const formatPct = (val: number) => (val * 100).toFixed(2) + '%';

    return (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden border border-slate-200">
                <div className="p-8 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-2xl font-black text-slate-800 tracking-tight">Risk Audit: Historical Simulation</h3>
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[9px] font-black uppercase">256-Day Lookback</span>
                        </div>
                        <p className="text-slate-500 text-sm max-w-2xl">This method recalculates your current portfolio against the actual daily forward curve movements seen in the market over the past 256 trading days.</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white hover:bg-slate-100 rounded-full transition-colors text-slate-400 border border-slate-200">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Worst Case Distribution</h4>
                            <div className="bg-slate-900 p-6 rounded-2xl text-white font-mono space-y-3">
                                {(metrics.worstDays || []).map((val: number, i: number) => (
                                    <div key={i} className="flex items-center gap-4 text-xs">
                                        <span className="text-slate-500 w-20">Rank #{i + 1}</span>
                                        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                                            <div style={{ width: `${metrics.cvar ? (val / metrics.cvar) * 100 : 0}%` }} className="h-full bg-rose-500 opacity-60"></div>
                                        </div>
                                        <span className="text-rose-400 font-bold">{formatUSD(val)}</span>
                                    </div>
                                ))}
                                <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                                    <span className="text-indigo-400 text-xs">95% VaR Cutoff (#13)</span>
                                    <span className="text-lg font-black">{formatUSD(metrics.var || 0)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 flex flex-col justify-center">
                            <h4 className="text-xs font-black text-indigo-900 mb-6 uppercase tracking-tight">Portfolio Summary</h4>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-600">Total Floating USD Position:</span>
                                    <span className="font-bold text-slate-800">{formatUSD(metrics.totalExposure || 0)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm text-indigo-600">
                                    <span className="font-bold italic">Diversification Offset:</span>
                                    <span className="font-bold">− {(metrics.diversification || 0).toFixed(1)}% Reduction</span>
                                </div>
                                <div className="pt-4 border-t border-indigo-200 flex justify-between items-center">
                                    <span className="text-xs font-black text-slate-900 uppercase tracking-widest">Expected Shortfall (CVaR):</span>
                                    <span className="text-xl font-black text-indigo-700 font-mono">{formatUSD(metrics.cvar || 0)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Historical Index Performance (256-Day)</h4>
                        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                                    <tr>
                                        <th className="px-6 py-4">Index</th>
                                        <th className="px-6 py-4">Net Floating Delta</th>
                                        <th className="px-6 py-4">Worst Historical Shift</th>
                                        <th className="px-6 py-4 text-right">Avg Daily Drift</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(metrics.auditData || []).map((row: any, i: number) => (
                                        <tr key={i} className="hover:bg-slate-50 transition-colors font-mono">
                                            <td className="px-6 py-4 font-bold text-slate-800 font-sans">{row.index}</td>
                                            <td className="px-6 py-4 font-bold text-slate-600">{formatUSD(row.usdDelta || 0)}</td>
                                            <td className="px-6 py-4 text-rose-600">{(row.worstShock || 0 * 100).toFixed(2)}%</td>
                                            <td className="px-6 py-4 text-right text-slate-400">{(row.avgShock || 0 * 100).toFixed(3)}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="p-6 bg-white border-t border-slate-100 flex justify-end shrink-0">
                    <button onClick={onClose} className="px-8 py-3 bg-slate-900 text-white font-black rounded-2xl text-xs hover:bg-slate-800 transition-all shadow-lg">Close Audit</button>
                </div>
            </motion.div>
        </div>
    );
};

const ExpiryItem = ({ title, rule }: { title: string, rule: string }) => (
    <div className="space-y-1">
        <h4 className="text-[10px] font-black text-white uppercase tracking-tight">{title}</h4>
        <div className="p-3 bg-slate-800/40 rounded-xl border border-white/5">
            <p className="text-[11px] font-medium text-slate-200 leading-tight">{rule}</p>
        </div>
    </div>
);

const HolidayManager = ({ onClose, holidays, onUpdateHolidays }: any) => {
    const [viewYear, setViewYear] = useState(2025);
    const [viewMonth, setViewMonth] = useState(new Date().getUTCMonth());

    const nextMonth = () => viewMonth === 11 ? (setViewMonth(0), setViewYear(viewYear + 1)) : setViewMonth(viewMonth + 1);
    const prevMonth = () => viewMonth === 0 ? (setViewMonth(11), setViewYear(viewYear - 1)) : setViewMonth(viewMonth - 1);

    const toggleHoliday = (ds: string) => {
        const next = { ...holidays };
        if (next[ds]) delete next[ds];
        else next[ds] = "Custom Holiday";
        onUpdateHolidays(next);
    };

    const days = useMemo(() => {
        const firstDay = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
        const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
        return { firstDay, daysInMonth };
    }, [viewYear, viewMonth]);

    const expiries = useMemo(() => {
        const map: Record<string, string[]> = {};
        const indices = ['Dated Brent', 'JCC', 'BRIPE', 'HH', 'TTF', 'NBP', 'JKM', 'AECO'];

        const pricingMonths = [
            new Date(Date.UTC(viewYear, viewMonth - 1, 1)),
            new Date(Date.UTC(viewYear, viewMonth, 1)),
            new Date(Date.UTC(viewYear, viewMonth + 1, 1))
        ];

        pricingMonths.forEach(pDate => {
            const mKey = `${pDate.getUTCFullYear()}-${String(pDate.getUTCMonth() + 1).padStart(2, '0')}`;
            const mName = pDate.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();

            indices.forEach(idx => {
                const d = getFixationDate(idx, mKey);
                if (d.getUTCFullYear() === viewYear && d.getUTCMonth() === viewMonth) {
                    const ds = d.toISOString().split('T')[0];
                    if (!map[ds]) map[ds] = [];
                    const shortIdx = idx.includes('Brent') ? 'BRENT' : idx.split(' ')[0];
                    map[ds].push(`${shortIdx} ${mName} EXP`);
                }
            });
        });
        return map;
    }, [viewYear, viewMonth, holidays]);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden border border-slate-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white shadow-sm z-10">
                    <div className="flex items-center gap-6">
                        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Trading Calendar</h3>
                        <div className="flex items-center gap-4 bg-slate-100 p-1 rounded-xl">
                            <button onClick={prevMonth} className="p-2 hover:bg-white rounded-lg transition-all text-slate-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
                            <span className="text-sm font-black text-slate-700 w-32 text-center uppercase tracking-widest">{new Date(Date.UTC(viewYear, viewMonth)).toLocaleString('default', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>
                            <button onClick={nextMonth} className="p-2 hover:bg-white rounded-lg transition-all text-slate-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={() => onUpdateHolidays(HOLIDAY_DEFAULTS)} className="text-[10px] font-black text-slate-400 hover:text-indigo-600 uppercase">Reset to Factory</button>
                        <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-slate-50 p-6">
                    <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-2xl overflow-hidden border border-slate-200 shadow-inner">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                            <div key={d} className="bg-slate-100 p-3 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200">{d}</div>
                        ))}
                        {Array.from({ length: days.firstDay }).map((_, i) => <div key={`empty-${i}`} className="bg-slate-50/50" />)}
                        {Array.from({ length: days.daysInMonth }).map((_, i) => {
                            const ds = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
                            const hName = holidays[ds];
                            const dayExpiries = expiries[ds] || [];
                            const isWeekend = new Date(ds).getUTCDay() === 0 || new Date(ds).getUTCDay() === 6;
                            return (
                                <div
                                    key={i}
                                    onClick={() => toggleHoliday(ds)}
                                    className={`bg-white min-h-[110px] p-2 flex flex-col gap-1 transition-all cursor-pointer hover:bg-indigo-50/50 group ${hName ? 'bg-amber-50/30' : ''}`}
                                >
                                    <div className="flex justify-between items-start">
                                        <span className={`text-xs font-bold ${hName ? 'text-amber-600' : isWeekend ? 'text-slate-300' : 'text-slate-400'}`}>{i + 1}</span>
                                        <div className="flex flex-col items-end gap-0.5">
                                            {dayExpiries.map((exp, idx) => (
                                                <span key={idx} className="text-[6.5px] font-black bg-indigo-600 text-white px-1 py-0.5 rounded leading-none whitespace-nowrap">{exp}</span>
                                            ))}
                                        </div>
                                    </div>
                                    {hName && (
                                        <div className="bg-amber-500 text-white text-[9px] px-1.5 py-1 rounded-md font-bold shadow-sm animate-in fade-in zoom-in duration-200 truncate" title={hName}>
                                            {hName}
                                        </div>
                                    )}
                                    <div className="flex-1" />
                                    {!hName && !isWeekend && (
                                        <div className="opacity-0 group-hover:opacity-40 text-[9px] font-bold text-indigo-400 text-center uppercase tracking-tighter">Mark Holiday</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

const DrillDownModal = ({ cell, onClose, profiles, simDate, onCargoClick }: any) => {
    const contributors = useMemo(() => {
        const { month, index } = cell;
        const results: any[] = [];
        profiles.forEach((p: CargoProfile) => {
            if (p.pnlBucket === PnLBucket.Realized) return;
            const process = (formula: string, vol: number, type: string, isTier2: boolean) => {
                if (!formula || vol <= 0) return;
                if (getIndexType(formula) !== index) return;

                const refD = type === 'Buy' ? p.loadingDate : p.deliveryDate;
                let mDef = 'n';
                if (!isTier2) mDef = type === 'Buy' ? (p.buyPrice1MonthDef || 'n') : (p.sellPrice1MonthDef || 'n');
                else mDef = type === 'Buy' ? (p.tier2BuyPrice1MonthDef || 'n') : (p.tier2SellPrice1MonthDef || 'n');

                const pMonths = getPricingMonths(refD, mDef);
                if (pMonths.includes(month)) {
                    const fixD = getFixationDate(index, month);
                    const fixTs = fixD.getTime();

                    let mult = 0;
                    if (index === 'HH Last Day') {
                        mult = simDate < fixTs ? 1 : 0;
                    } else {
                        const startTs = fixTs - (31 * 24 * 60 * 60 * 1000);
                        if (simDate < startTs) mult = 1;
                        else if (simDate < fixTs) mult = 1 - ((simDate - startTs) / (fixTs - startTs));
                    }

                    results.push({
                        id: p.id,
                        name: p.strategyName,
                        type,
                        isTier2,
                        vol: type === 'Buy' ? -(vol / pMonths.length) : (vol / pMonths.length),
                        mult,
                        isFixed: mult < 0.001,
                        fixDate: fixD.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        profile: p
                    });
                }
            };

            process(p.buyFormula, p.loadedVolume || 0, 'Buy', false);
            process(p.sellFormula, p.deliveredVolume || 0, 'Sell', false);
            if (p.isTieredPricing) {
                process(p.tier2BuyFormula || '', p.tier2LoadedVolume || 0, 'Buy', true);
                process(p.tier2SellFormula || '', p.tier2DeliveredVolume || 0, 'Sell', true);
            }
        });
        return results;
    }, [profiles, cell, simDate]);

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden border border-slate-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">{cell.index} Detail</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase">{cell.month}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4 max-h-[70vh] custom-scrollbar">
                    {contributors.map((c, i) => (
                        <div key={`${c.id}-${c.type}-${c.isTier2}-${i}`} onClick={() => { onCargoClick?.(c.profile); onClose(); }} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/20 cursor-pointer transition-all space-y-3 group">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                                        {c.name} {c.isTier2 && <span className="ml-1 px-1 py-0.5 bg-indigo-100 text-indigo-700 text-[8px] rounded uppercase">Tier 2</span>}
                                    </div>
                                    <div className={`text-[10px] font-black uppercase mt-0.5 ${c.type === 'Buy' ? 'text-rose-500' : 'text-indigo-500'}`}>{c.type} Leg Contribution</div>
                                </div>
                                <div className="text-right">
                                    <div className={`text-sm font-mono font-bold ${c.vol > 0 ? 'text-indigo-600' : 'text-rose-600'}`}>{(c.vol / 1000).toLocaleString()}k</div>
                                    <div className="flex flex-col items-end gap-1 mt-1">
                                        <div className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${c.isFixed ? 'bg-slate-200 text-slate-500' : 'bg-amber-100 text-amber-600'}`}>
                                            {c.isFixed ? 'FULLY FIXED' : 'PRICING ACTIVE'}
                                        </div>
                                        <div className="text-[8px] font-bold text-slate-400 uppercase">Settles: {c.fixDate}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                    <span>Fixed Portfolio</span>
                                    <span className={c.isFixed ? 'text-slate-500' : 'text-indigo-600'}>{(c.mult * 100).toFixed(0)}% Floating Exposure</span>
                                </div>
                                <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden flex">
                                    <div
                                        style={{ width: `${(1 - c.mult) * 100}%` }}
                                        className="h-full bg-slate-300 transition-all duration-300"
                                    />
                                    <div
                                        style={{ width: `${c.mult * 100}%` }}
                                        className={`h-full ${c.type === 'Buy' ? 'bg-gradient-to-r from-rose-400 to-rose-500' : 'bg-gradient-to-r from-indigo-400 to-indigo-500'} transition-all duration-300 relative`}
                                    >
                                        {!c.isFixed && (
                                            <div className="absolute inset-0 bg-white/20 animate-pulse" />
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    {contributors.length === 0 && <div className="text-center py-12 text-slate-400 text-xs italic">No active legs contributing to this period.</div>}
                </div>
            </motion.div>
        </div>
    );
};
