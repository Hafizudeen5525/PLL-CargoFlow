import React, { useMemo, useState } from 'react';
import { CargoProfile, PnLBucket } from '../types';
import { recalculateProfile, getGroupName, getIndexPrice, getIndexType } from '../services/calculationService';
import { motion, AnimatePresence } from 'framer-motion';

interface PnLVarianceExplainerProps {
  currentProfiles: CargoProfile[];
  baselineProfiles: CargoProfile[];
  currentCurveDate: string;
  baselineCurveDate: string;
}

interface Attribution {
    newDeals: number;
    removedDeals: number;
    marketImpact: number;
    profileEdits: number;
    totalDelta: number;
    topIndexDriver: { name: string; impact: number; priceChange: number } | null;
    topGroupAffected: { name: string; impact: number } | null;
    indexBreakdown: Record<string, number>;
    groupBreakdown: Record<string, number>;
    items: AttributionItem[];
}

interface AttributionItem {
    id: string;
    strategy: string;
    group: string;
    category: 'Market' | 'New' | 'Closed' | 'Edit';
    impact: number;
    details: string;
    subDrivers?: { name: string, impact: number }[];
}

export const PnLVarianceExplainer: React.FC<PnLVarianceExplainerProps> = ({
  currentProfiles,
  baselineProfiles,
  currentCurveDate,
  baselineCurveDate
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const attribution = useMemo<Attribution | null>(() => {
    if (!currentCurveDate || !baselineCurveDate) return null;

    const attr: Attribution = {
        newDeals: 0,
        removedDeals: 0,
        marketImpact: 0,
        profileEdits: 0,
        totalDelta: 0,
        topIndexDriver: null,
        topGroupAffected: null,
        indexBreakdown: {},
        groupBreakdown: {},
        items: []
    };

    const currentMap = new Map<string, CargoProfile>(currentProfiles.map((p: CargoProfile) => [p.strategyName, p]));
    const baselineMap = new Map<string, CargoProfile>(baselineProfiles.map((p: CargoProfile) => [p.strategyName, p]));
    const allStrategies = Array.from(new Set([...currentMap.keys(), ...baselineMap.keys()]));

    const indexPriceChanges: Record<string, { totalImpact: number, totalMove: number, count: number }> = {};

    allStrategies.forEach((strategy: string) => {
        const current = currentMap.get(strategy);
        const baseline = baselineMap.get(strategy);
        const group = getGroupName(strategy);

        if (current && !baseline) {
            const pnl = (recalculateProfile(current, true, currentCurveDate) as CargoProfile).finalTotalPnL || 0;
            attr.newDeals += pnl;
            attr.items.push({ id: current.id, strategy, group, category: 'New', impact: pnl, details: 'New Deal Invoiced' });
            return;
        }

        if (!current && baseline) {
            const pnl = (recalculateProfile(baseline, true, baselineCurveDate) as CargoProfile).finalTotalPnL || 0;
            attr.removedDeals -= pnl;
            attr.items.push({ id: baseline.id, strategy, group, category: 'Closed', impact: -pnl, details: 'Deal Closed/Removed' });
            return;
        }

        if (current && baseline) {
            const pBase = recalculateProfile(baseline, true, baselineCurveDate) as CargoProfile;
            const pBaseAtNewMarket = recalculateProfile(baseline, true, currentCurveDate) as CargoProfile;
            const pCurr = recalculateProfile(current, true, currentCurveDate) as CargoProfile;

            const mImpact = (pBaseAtNewMarket.finalTotalPnL || 0) - (pBase.finalTotalPnL || 0);
            attr.marketImpact += mImpact;
            
            const marketSubDrivers: { name: string, impact: number }[] = [];
            
            const attributeLeg = (type: 'buy' | 'sell' | 'tier2Buy' | 'tier2Sell', p: CargoProfile) => {
                const refDate = (type === 'buy' || type === 'tier2Buy') ? p.loadingDate : p.deliveryDate;
                const vol = (type === 'buy' || type === 'tier2Buy') ? -(p.loadedVolume || 0) : (p.deliveredVolume || 0);
                if (!refDate || vol === 0) return;

                for (let i = 1; i <= 3; i++) {
                    const idx = (p as any)[`${type}PriceIndex${i}`] || (i === 1 ? getIndexType((p as any)[`${type}Formula`]) : null);
                    const weight = Number((p as any)[`${type}Price${i}Weightage`] ?? (i === 1 ? 1 : 0));
                    const slope = Number((p as any)[`${type}Price${i}Slope`] ?? 1);
                    const mDef = (p as any)[`${type}Price${i}MonthDef`] || 'n';

                    if (idx && idx !== 'Other' && weight > 0) {
                        const { price: p1 } = getIndexPrice(idx, refDate, mDef, baselineCurveDate);
                        const { price: p2 } = getIndexPrice(idx, refDate, mDef, currentCurveDate);
                        const move = p2 - p1;
                        const impact = move * slope * weight * vol;
                        
                        if (Math.abs(impact) > 1) {
                            attr.indexBreakdown[idx] = (attr.indexBreakdown[idx] || 0) + impact;
                            if (!indexPriceChanges[idx]) indexPriceChanges[idx] = { totalImpact: 0, totalMove: 0, count: 0 };
                            indexPriceChanges[idx].totalImpact += impact;
                            indexPriceChanges[idx].totalMove += move;
                            indexPriceChanges[idx].count++;
                            marketSubDrivers.push({ name: idx, impact });
                        }
                    }
                }
            };

            attributeLeg('buy', baseline);
            attributeLeg('sell', baseline);
            if (baseline.isTieredPricing) {
                attributeLeg('tier2Buy', baseline);
                attributeLeg('tier2Sell', baseline);
            }

            if (Math.abs(mImpact) > 10) {
                attr.items.push({ 
                    id: current.id, 
                    strategy, 
                    group, 
                    category: 'Market', 
                    impact: mImpact, 
                    details: 'Market Price Variance',
                    subDrivers: marketSubDrivers.sort((a: any, b: any) => Math.abs(b.impact) - Math.abs(a.impact))
                });
                attr.groupBreakdown[group] = (attr.groupBreakdown[group] || 0) + mImpact;
            }

            const eImpact = (pCurr.finalTotalPnL || 0) - (pBaseAtNewMarket.finalTotalPnL || 0);
            attr.profileEdits += eImpact;

            if (Math.abs(eImpact) > 10) {
                const changedFields = [];
                if (Math.abs((current.deliveredVolume || 0) - (baseline.deliveredVolume || 0)) > 0.1) changedFields.push('Volume');
                if (current.sellFormula !== baseline.sellFormula) changedFields.push('Formula');
                if (current.incoterms !== baseline.incoterms) changedFields.push('Incoterms');

                attr.items.push({ 
                    id: current.id, 
                    strategy, 
                    group, 
                    category: 'Edit', 
                    impact: eImpact, 
                    details: `Profile Edits (${changedFields.join(', ') || 'Manual Price'})` 
                });
                attr.groupBreakdown[group] = (attr.groupBreakdown[group] || 0) + eImpact;
            }
        }
    });

    attr.totalDelta = attr.newDeals + attr.removedDeals + attr.marketImpact + attr.profileEdits;

    let maxIdx = '', maxIdxVal = 0;
    Object.entries(attr.indexBreakdown).forEach(([name, val]: [string, number]) => {
        if (Math.abs(val) > Math.abs(maxIdxVal)) { maxIdx = name; maxIdxVal = val; }
    });
    if (maxIdx) {
        attr.topIndexDriver = { 
            name: maxIdx, 
            impact: maxIdxVal, 
            priceChange: indexPriceChanges[maxIdx].totalMove / indexPriceChanges[maxIdx].count 
        };
    }

    let maxGrp = '', maxGrpVal = 0;
    Object.entries(attr.groupBreakdown).forEach(([name, val]: [string, number]) => {
        if (Math.abs(val) > Math.abs(maxGrpVal)) { maxGrp = name; maxGrpVal = val; }
    });
    if (maxGrp) attr.topGroupAffected = { name: maxGrp, impact: maxGrpVal };

    attr.items.sort((a: any, b: any) => Math.abs(b.impact) - Math.abs(a.impact));
    return attr;
  }, [currentProfiles, baselineProfiles, currentCurveDate, baselineCurveDate]);

  const formatUSD = (val: number) => 
    new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD', 
        maximumFractionDigits: 0,
        signDisplay: 'always' 
    }).format(val);

  if (!attribution || Math.abs(attribution.totalDelta) < 1) {
    return <div className="bg-white border border-slate-200 rounded-xl p-4 text-center text-xs text-slate-400 italic">No significant portfolio variance detected.</div>;
  }

  const attr = attribution as Attribution;
  const isProfitDelta = attr.totalDelta >= 0;
  const hasEdits = Math.abs(attr.profileEdits) > 1000;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all">
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-5 flex flex-col md:flex-row justify-between items-center gap-6 cursor-pointer hover:bg-slate-50/50"
      >
        <div className="flex items-center gap-5 flex-1">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${isProfitDelta ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                {isProfitDelta ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" /></svg>
                )}
            </div>
            <div className="text-sm text-slate-700">
                <p className="font-bold text-base mb-1">Portfolio Variance Walk</p>
                <div className="space-y-0.5">
                    {attr.topIndexDriver && (
                        <p className="text-slate-600">
                            <span className="font-black text-indigo-600">{attr.topIndexDriver.name}</span> 
                            {attr.topIndexDriver.priceChange >= 0 ? ' rally ' : ' drop '} 
                            was the primary driver ({formatUSD(attr.topIndexDriver.impact)}).
                        </p>
                    )}
                    {attr.topGroupAffected && (
                        <p className="text-slate-500 text-xs">
                            Most affected portfolio: <span className="font-bold text-slate-700">{attr.topGroupAffected.name}</span> ({formatUSD(attr.topGroupAffected.impact)}).
                        </p>
                    )}
                    {hasEdits && (
                        <p className="text-amber-600 text-xs font-medium">
                            * Operational edits contributed {formatUSD(attr.profileEdits)} to this movement.
                        </p>
                    )}
                </div>
            </div>
        </div>

        <div className="flex items-center gap-6 shrink-0">
             <div className="flex items-center gap-3">
                <div className="text-right">
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-tighter">Net Change</span>
                    <span className={`text-xl font-mono font-black ${isProfitDelta ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatUSD(attr.totalDelta)}
                    </span>
                </div>
             </div>
             <button className="bg-slate-100 p-2 rounded-xl text-slate-400 hover:text-blue-600 transition-colors">
                 <svg className={`w-5 h-5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
             </button>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
            <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-slate-100 bg-slate-50/30 overflow-hidden"
            >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-8">
                    <div className="space-y-6">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-1 h-3 bg-blue-500 rounded-full"></span>
                            Top 10 Movement Items
                        </h4>
                        <div className="space-y-2">
                            {attr.items.slice(0, 10).map((item: AttributionItem, i: number) => (
                                <div key={i} className="group flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="flex items-center justify-between p-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-1 h-6 rounded-full shrink-0 ${
                                                item.category === 'Market' ? 'bg-blue-400' : 
                                                item.category === 'New' ? 'bg-emerald-400' : 
                                                item.category === 'Closed' ? 'bg-slate-400' : 'bg-amber-400'
                                            }`}></div>
                                            <div className="min-w-0">
                                                <div className="font-bold text-slate-800 truncate text-[11px]">{item.strategy}</div>
                                                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">{item.group} • {item.details}</div>
                                            </div>
                                        </div>
                                        <span className={`font-mono font-bold text-[11px] ${item.impact >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {formatUSD(item.impact)}
                                        </span>
                                    </div>
                                    {item.subDrivers && item.subDrivers.length > 0 && (
                                        <div className="px-3 pb-3 pt-1 border-t border-slate-50 flex flex-wrap gap-2">
                                            {item.subDrivers.map((sd: any, j: number) => (
                                                <div key={j} className="px-2 py-0.5 bg-slate-50 rounded text-[9px] font-bold text-slate-500 flex items-center gap-1">
                                                    {sd.name}: <span className={sd.impact >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{formatUSD(sd.impact)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-8">
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aggregate Attribution</h4>
                            <div className="space-y-3">
                                <SummaryRow label="Market Dynamics" value={attr.marketImpact} color="text-blue-600" />
                                <SummaryRow label="Portfolio Inclusions" value={attr.newDeals} color="text-emerald-600" />
                                <SummaryRow label="Deal Closures" value={attr.removedDeals} color="text-slate-500" />
                                <SummaryRow label="Operational Edits" value={attr.profileEdits} color="text-amber-600" />
                                <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                                    <span className="text-xs font-black text-slate-800 uppercase">Total Variance</span>
                                    <span className={`font-mono font-black text-lg ${isProfitDelta ? 'text-emerald-600' : 'text-rose-600'}`}>{formatUSD(attr.totalDelta)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Index Specific Impact</h4>
                            <div className="flex flex-wrap gap-2">
                                {Object.entries(attr.indexBreakdown)
                                    .sort((a: [string, number], b: [string, number]) => Math.abs(b[1]) - Math.abs(a[1]))
                                    .map(([name, val]: [string, number]) => (
                                        <div key={name} className="px-3 py-2 bg-white border border-slate-200 rounded-xl shadow-sm">
                                            <span className="block text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-0.5">{name}</span>
                                            <span className={`text-[11px] font-mono font-bold ${val >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatUSD(val)}</span>
                                        </div>
                                    ))
                                }
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="px-8 py-4 bg-white border-t border-slate-100 text-[9px] text-slate-400 flex justify-between items-center font-bold uppercase tracking-widest">
                    <span>Baseline: {baselineCurveDate} → Target: {currentCurveDate}</span>
                    <span className="italic opacity-60">Variance Analysis Methodology: Sequential Bridge Attribution</span>
                </div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface SummaryRowProps {
    label: string;
    value: number;
    color: string;
}

const SummaryRow = ({ label, value, color }: SummaryRowProps) => {
    const numericValue = Number(value || 0);
    return (
        <div className="flex justify-between items-center">
            <span className="text-[11px] font-bold text-slate-500">{label}</span>
            <span className={`text-xs font-mono font-black ${color}`}>
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0, signDisplay: 'always' }).format(numericValue)}
            </span>
        </div>
    );
};
