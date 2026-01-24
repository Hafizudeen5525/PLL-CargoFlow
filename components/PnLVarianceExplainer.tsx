
import React, { useMemo, useState } from 'react';
import { CargoProfile, PnLBucket } from '../types';
import { recalculateProfile } from '../services/calculationService';
import { motion, AnimatePresence } from 'framer-motion';

interface PnLVarianceExplainerProps {
  currentProfiles: CargoProfile[];
  baselineProfiles: CargoProfile[];
  currentCurveDate: string;
  baselineCurveDate: string;
}

interface DetailRow {
    strategyName: string;
    impact: number;
    description: string;
}

interface VarianceInsight {
    id: string;
    title: string;
    totalImpact: number;
    explanation: string;
    details: DetailRow[];
    icon: React.ReactNode;
    color: string;
}

export const PnLVarianceExplainer: React.FC<PnLVarianceExplainerProps> = ({
  currentProfiles,
  baselineProfiles,
  currentCurveDate,
  baselineCurveDate
}) => {
  const [selectedInsightId, setSelectedInsightId] = useState<string | null>(null);

  const insights = useMemo(() => {
    if (baselineProfiles.length === 0) return [];

    const currentMap = new Map(currentProfiles.map(p => [p.strategyName, p]));
    const baselineMap = new Map(baselineProfiles.map(p => [p.strategyName, p]));

    const marketDetails: DetailRow[] = [];
    const actualizationDetails: DetailRow[] = [];
    const newBusinessDetails: DetailRow[] = [];
    const closedBusinessDetails: DetailRow[] = [];
    const operationalDetails: DetailRow[] = [];

    // 1. Walk through Baseline Profiles to find Market, Actualization, and Operational moves
    baselineProfiles.forEach(bP => {
      const cP = currentMap.get(bP.strategyName);
      const bCalcBase = recalculateProfile(bP, true, baselineCurveDate) as CargoProfile;
      const basePnL = bCalcBase.finalTotalPnL || 0;

      if (!cP) {
        // Closed/Deleted Business
        closedBusinessDetails.push({
            strategyName: bP.strategyName,
            impact: -basePnL,
            description: `Cargo removed from active portfolio.`
        });
      } else {
        // A: Market Impact (Yesterday's Profile valued at Today's Price)
        const marketCalc = recalculateProfile(bP, true, currentCurveDate) as CargoProfile;
        const marketPnL = marketCalc.finalTotalPnL || 0;
        const mDelta = marketPnL - basePnL;
        
        if (Math.abs(mDelta) > 1) {
            marketDetails.push({
                strategyName: bP.strategyName,
                impact: mDelta,
                description: `Impact of price move on existing ${bP.source} supply.`
            });
        }

        // B: Actualization Impact (Moving from Floating to Fixed)
        if (bP.pnlBucket !== PnLBucket.Realized && cP.pnlBucket === PnLBucket.Realized) {
          const actDelta = (cP.finalTotalPnL || 0) - marketPnL;
          actualizationDetails.push({
              strategyName: bP.strategyName,
              impact: actDelta,
              description: `Difference between final invoice and last market estimate.`
          });
        } else if (cP.pnlBucket === PnLBucket.Unrealized) {
          // C: Operational Edits (Today's Profile vs Yesterday's Profile, both at Today's Price)
          const cCalcToday = recalculateProfile(cP, true, currentCurveDate) as CargoProfile;
          const opDelta = (cCalcToday.finalTotalPnL || 0) - marketPnL;
          if (Math.abs(opDelta) > 1) {
              const reason = cP.deliveredVolume !== bP.deliveredVolume ? 'Volume change' : 'Formula tweak';
              operationalDetails.push({
                  strategyName: bP.strategyName,
                  impact: opDelta,
                  description: `${reason} detected in trade capture.`
              });
          }
        }
      }
    });

    // 2. Find New Business
    currentProfiles.forEach(cP => {
      if (!baselineMap.has(cP.strategyName)) {
        const cCalc = recalculateProfile(cP, true, currentCurveDate) as CargoProfile;
        newBusinessDetails.push({
            strategyName: cP.strategyName,
            impact: cCalc.finalTotalPnL || 0,
            description: `New trade entered into the system.`
        });
      }
    });

    const formatS = (details: DetailRow[]) => details.reduce((a, b) => a + b.impact, 0);

    const results: VarianceInsight[] = [
        {
            id: 'market',
            title: 'Market Movement',
            totalImpact: formatS(marketDetails),
            explanation: `The forward curve move between ${baselineCurveDate} and ${currentCurveDate} resulted in a ${formatS(marketDetails) >= 0 ? 'gain' : 'loss'} of P&L across ${marketDetails.length} active positions.`,
            details: marketDetails.sort((a,b) => Math.abs(b.impact) - Math.abs(a.impact)),
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
            color: 'blue'
        },
        {
            id: 'actualization',
            title: 'Actualization (Fixing)',
            totalImpact: formatS(actualizationDetails),
            explanation: `${actualizationDetails.length} cargos were moved to Realized status. The delta represents slippage or gains from the final pricing vs the last floating estimate.`,
            details: actualizationDetails.sort((a,b) => Math.abs(b.impact) - Math.abs(a.impact)),
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
            color: 'emerald'
        },
        {
            id: 'portfolio',
            title: 'Portfolio Changes',
            totalImpact: formatS(newBusinessDetails) + formatS(closedBusinessDetails),
            explanation: `Net effect of ${newBusinessDetails.length} new trades added and ${closedBusinessDetails.length} trades removed or completed since baseline.`,
            details: [...newBusinessDetails, ...closedBusinessDetails].sort((a,b) => Math.abs(b.impact) - Math.abs(a.impact)),
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>,
            color: 'purple'
        },
        {
            id: 'operational',
            title: 'Operational Edits',
            totalImpact: formatS(operationalDetails),
            explanation: `Manual tweaks to volumes, costs, or formula constants on existing cargos contributed to this variance.`,
            details: operationalDetails.sort((a,b) => Math.abs(b.impact) - Math.abs(a.impact)),
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
            color: 'orange'
        }
    ];

    return results.filter(r => Math.abs(r.totalImpact) > 0.01 || r.details.length > 0);
  }, [currentProfiles, baselineProfiles, currentCurveDate, baselineCurveDate]);

  const totalVariance = useMemo(() => insights.reduce((a, b) => a + b.totalImpact, 0), [insights]);

  const formatUSD = (val: number) => 
    new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD', 
        maximumFractionDigits: 0,
        signDisplay: 'always' 
    }).format(val);

  if (baselineProfiles.length === 0) {
    return (
      <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
        </div>
        <h3 className="text-slate-600 font-bold">No Baseline Snapshot</h3>
        <p className="text-slate-400 text-sm mt-1 max-w-sm mx-auto">Save a baseline snapshot using the "Set New Baseline" button to track P&L movements from that point in time.</p>
      </div>
    );
  }

  const selectedInsight = insights.find(i => i.id === selectedInsightId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Narrative Summary Sidebar */}
      <div className="lg:col-span-4 space-y-4">
        <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl border border-slate-800">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Variance Insight</p>
                    <h2 className={`text-2xl font-bold mt-1 ${totalVariance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatUSD(totalVariance)}
                    </h2>
                </div>
                <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${totalVariance >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                    {totalVariance >= 0 ? 'Bullish' : 'Bearish'}
                </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
                Since your snapshot on <span className="text-white font-bold">{baselineCurveDate}</span>, the portfolio has shifted by {formatUSD(totalVariance)}. 
                {totalVariance >= 0 
                  ? " Gains were primarily fueled by market favorability and successful trade actualizations." 
                  : " Exposure to declining indices and operational adjustments reduced the net value."}
            </p>
        </div>

        <div className="space-y-2">
            {insights.map((insight) => (
                <button
                    key={insight.id}
                    onClick={() => setSelectedInsightId(insight.id === selectedInsightId ? null : insight.id)}
                    className={`w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between group ${
                        selectedInsightId === insight.id 
                        ? 'bg-white border-blue-500 shadow-md ring-1 ring-blue-500' 
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                >
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                            insight.id === 'market' ? 'bg-blue-50 text-blue-600' :
                            insight.id === 'actualization' ? 'bg-emerald-50 text-emerald-600' :
                            insight.id === 'portfolio' ? 'bg-purple-50 text-purple-600' : 'bg-orange-50 text-orange-600'
                        }`}>
                            {insight.icon}
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-800">{insight.title}</p>
                            <p className={`text-[10px] font-mono font-bold ${insight.totalImpact >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {formatUSD(insight.totalImpact)}
                            </p>
                        </div>
                    </div>
                    <svg className={`w-4 h-4 text-slate-300 transition-transform ${selectedInsightId === insight.id ? 'rotate-90 text-blue-500' : 'group-hover:translate-x-1'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
            ))}
        </div>
      </div>

      {/* Detail Drill-Down Panel */}
      <div className="lg:col-span-8">
        <AnimatePresence mode="wait">
            {selectedInsight ? (
                <motion.div 
                    key={selectedInsight.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full min-h-[500px]"
                >
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-3">
                                {selectedInsight.title} Breakdown
                                <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-bold ${selectedInsight.totalImpact >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                    {formatUSD(selectedInsight.totalImpact)}
                                </span>
                            </h3>
                            <button onClick={() => setSelectedInsightId(null)} className="text-slate-400 hover:text-slate-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <p className="text-sm text-slate-500 leading-relaxed italic">{selectedInsight.explanation}</p>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-4">Strategy</th>
                                    <th className="px-6 py-4">Explanation</th>
                                    <th className="px-6 py-4 text-right">Variance Impact</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {selectedInsight.details.map((detail, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-bold text-slate-700">{detail.strategyName}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-xs text-slate-500">{detail.description}</p>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <p className={`text-xs font-mono font-bold ${detail.impact >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {formatUSD(detail.impact)}
                                            </p>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    
                    <div className="p-4 border-t border-slate-100 bg-slate-50/30 flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Total Components: {selectedInsight.details.length}</span>
                        <div className="flex items-center gap-2">
                             <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                                {(() => {
                                    const pos = selectedInsight.details.filter(d => d.impact > 0).reduce((a,b) => a+b.impact, 0);
                                    const neg = Math.abs(selectedInsight.details.filter(d => d.impact < 0).reduce((a,b) => a+b.impact, 0));
                                    const total = pos + neg;
                                    return (
                                        <>
                                            <div className="h-full bg-emerald-400" style={{ width: `${(pos/total)*100}%` }} />
                                            <div className="h-full bg-rose-400" style={{ width: `${(neg/total)*100}%` }} />
                                        </>
                                    );
                                })()}
                             </div>
                             <span className="text-[10px] text-slate-400 font-bold uppercase">Net Contribution</span>
                        </div>
                    </div>
                </motion.div>
            ) : (
                <div className="bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200 h-full min-h-[500px] flex flex-col items-center justify-center text-center p-12">
                    <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center mb-4 text-blue-500">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
                    </div>
                    <h3 className="text-slate-700 font-bold text-lg">Select a Variance Driver</h3>
                    <p className="text-slate-400 text-sm mt-2 max-w-sm">Click on one of the insights to the left to drill down into the specific strategies that contributed to that change.</p>
                </div>
            )}
        </AnimatePresence>
      </div>
    </div>
  );
};
