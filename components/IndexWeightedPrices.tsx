import React, { useMemo, useState } from 'react';
import { CargoProfile, PnLBucket } from '../types';
import { getIndexType, getIndexPrice, ForwardCurveRow, getHistoricalCurve, getForwardCurve } from '../services/calculationService';
import { motion, AnimatePresence } from 'framer-motion';

interface IndexWeightedPricesProps {
  profiles: CargoProfile[];
  curveDate: string;
  baselineCurveDate: string;
  forwardCurve: ForwardCurveRow[];
  portfolioYear: string;
}

interface MonthlyContribution {
    month: string;
    price: number;
    baselinePrice: number;
    exposure: number;
    weightedValue: number;
}

interface IndexWeightedResult {
    index: string;
    weightedPrice: number;
    baselineWeightedPrice: number;
    totalExposure: number;
    breakdown: MonthlyContribution[];
    isMarketAverage: boolean;
}

const INDEX_ORDER = ['BRIPE', 'JCC', 'Dated Brent', 'HH', 'NBP', 'JKM', 'TTF', 'AECO', 'STN 2'];

export const IndexWeightedPrices: React.FC<IndexWeightedPricesProps> = ({ 
    profiles, 
    curveDate, 
    baselineCurveDate, 
    forwardCurve,
    portfolioYear 
}) => {
  const [selectedIdxDetail, setSelectedIdxDetail] = useState<IndexWeightedResult | null>(null);

  const weightedResults = useMemo(() => {
    const targetFullCurve = getForwardCurve(curveDate);

    const results: IndexWeightedResult[] = INDEX_ORDER.map((idx: string) => {
        const stats = { 
            numerator: 0, 
            denominator: 0, 
            baselineNumerator: 0,
            breakdown: {} as Record<string, MonthlyContribution> 
        };

        let hasExposure = false;

        profiles.forEach((p: CargoProfile) => {
          if (p.pnlBucket === PnLBucket.Realized) return;

          const processLeg = (formula: string | undefined, volume: number, isBuy: boolean) => {
            if (!formula || volume <= 0) return;
            const formulaIdx = getIndexType(formula);
            if (formulaIdx !== idx) return;

            const date = isBuy ? p.loadingDate : p.deliveryDate;
            if (!date) return;

            const { price: targetPrice } = getIndexPrice(idx, date, 'n', curveDate);
            const { price: baselinePrice } = getIndexPrice(idx, date, 'n', baselineCurveDate);
            
            if (targetPrice <= 0) return;

            const exposure = isBuy ? -volume : volume;
            const absExposure = volume;
            const monthKey = date.slice(0, 7);
            
            stats.numerator += (targetPrice * absExposure);
            stats.baselineNumerator += (baselinePrice * absExposure);
            stats.denominator += absExposure;
            hasExposure = true;

            if (!stats.breakdown[monthKey]) {
                stats.breakdown[monthKey] = { month: monthKey, price: targetPrice, baselinePrice, exposure: 0, weightedValue: 0 };
            }
            stats.breakdown[monthKey].exposure += exposure;
            stats.breakdown[monthKey].weightedValue += (targetPrice * absExposure);
          };

          processLeg(p.buyFormula, p.loadedVolume || 0, true);
          processLeg(p.sellFormula, p.deliveredVolume || 0, false);
          if (p.isTieredPricing) {
            processLeg(p.tier2BuyFormula, p.tier2LoadedVolume || 0, true);
            processLeg(p.tier2SellFormula, p.tier2DeliveredVolume || 0, false);
          }
        });

        if (!hasExposure) {
            const targetMonths = targetFullCurve.filter((r: ForwardCurveRow) => portfolioYear === 'All' || r.month.startsWith(portfolioYear));
            
            if (targetMonths.length > 0) {
                let sumTarget = 0;
                let sumBaseline = 0;
                let count = 0;

                targetMonths.forEach((mRow: ForwardCurveRow) => {
                    const month = mRow.month;
                    const { price: tPrice } = getIndexPrice(idx, `${month}-15`, 'n', curveDate);
                    const { price: bPrice } = getIndexPrice(idx, `${month}-15`, 'n', baselineCurveDate);

                    if (tPrice > 0) {
                        sumTarget += tPrice;
                        sumBaseline += (bPrice > 0 ? bPrice : tPrice);
                        count++;
                        stats.breakdown[month] = { 
                            month, 
                            price: tPrice, 
                            baselinePrice: bPrice > 0 ? bPrice : tPrice, 
                            exposure: 0, 
                            weightedValue: 0 
                        };
                    }
                });

                if (count > 0) {
                    return {
                        index: idx,
                        weightedPrice: sumTarget / count,
                        baselineWeightedPrice: sumBaseline / count,
                        totalExposure: 0,
                        breakdown: Object.values(stats.breakdown).sort((a: MonthlyContribution, b: MonthlyContribution) => a.month.localeCompare(b.month)),
                        isMarketAverage: true
                    };
                }
            }
        }

        return {
            index: idx,
            weightedPrice: stats.denominator > 0 ? stats.numerator / stats.denominator : 0,
            baselineWeightedPrice: stats.denominator > 0 ? stats.baselineNumerator / stats.denominator : 0,
            totalExposure: Object.values(stats.breakdown).reduce((a: number, b: MonthlyContribution) => a + b.exposure, 0),
            breakdown: Object.values(stats.breakdown).sort((a: MonthlyContribution, b: MonthlyContribution) => a.month.localeCompare(b.month)),
            isMarketAverage: false
        };
    });

    return results;
  }, [profiles, curveDate, baselineCurveDate, portfolioYear]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Portfolio Market Basis</h3>
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-slate-500 uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Weighted
                <span className="ml-2 w-1.5 h-1.5 rounded-full bg-slate-300"></span> Market Avg
            </div>
        </div>
        <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold text-slate-400 uppercase">Movement:</span>
            <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-500 font-medium">{baselineCurveDate}</span>
                <span className="text-slate-300">→</span>
                <span className="text-[10px] text-blue-600 font-bold">{curveDate || 'Latest'}</span>
            </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {weightedResults.map((res: IndexWeightedResult) => {
              const delta = res.weightedPrice - res.baselineWeightedPrice;
              const isPositive = delta >= 0;
              const hasPrice = res.weightedPrice > 0;

              return (
                  <div key={res.index} className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-blue-300 transition-all ${!hasPrice ? 'opacity-50 grayscale' : ''}`}>
                      <div className="flex justify-between items-start">
                          <div className="flex flex-col">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">{res.index}</span>
                              <span className={`text-[8px] font-black uppercase tracking-tighter ${res.isMarketAverage ? 'text-slate-300' : 'text-blue-500'}`}>
                                  {res.isMarketAverage ? 'Market Avg' : 'Portfolio Basis'}
                              </span>
                          </div>
                          {hasPrice && (
                              <button 
                                  onClick={() => setSelectedIdxDetail(res)}
                                  className="text-[10px] font-bold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                              >
                                  Details
                              </button>
                          )}
                      </div>
                      <div className="mt-2">
                          <div className="flex items-baseline gap-2">
                              <div className="text-xl font-mono font-bold text-slate-800">
                                  {hasPrice ? `$${res.weightedPrice.toFixed(3)}` : 'N/A'}
                              </div>
                              {hasPrice && Math.abs(delta) > 0.0001 && (
                                  <div className={`flex items-center gap-0.5 text-[10px] font-bold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                      {isPositive ? '▲' : '▼'}
                                      <span>{Math.abs(delta).toFixed(3)}</span>
                                  </div>
                              )}
                          </div>
                          <div className={`text-[10px] font-bold mt-1 ${res.totalExposure > 0 ? 'text-emerald-600' : res.totalExposure < 0 ? 'text-rose-600' : 'text-slate-300'}`}>
                              {res.totalExposure !== 0 ? `Net: ${(res.totalExposure / 1000).toFixed(0)}k Units` : '0 Active Exposure'}
                          </div>
                      </div>
                  </div>
              );
          })}
      </div>

      <AnimatePresence>
        {selectedIdxDetail && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden border border-slate-200 max-h-[85vh]"
            >
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                    <div>
                        <h3 className="text-base font-bold text-slate-800">{selectedIdxDetail.index} {selectedIdxDetail.isMarketAverage ? 'Market' : 'Portfolio'} Breakdown</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Mode: {selectedIdxDetail.isMarketAverage ? 'Arithmetic Average' : 'Volume Weighted'}</p>
                    </div>
                    <button onClick={() => setSelectedIdxDetail(null)} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-all">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                    <table className="w-full text-left text-[11px]">
                        <thead className="text-[9px] font-bold text-slate-400 uppercase border-b border-slate-100 sticky top-0 bg-white z-10">
                            <tr>
                                <th className="p-4">Month</th>
                                <th className="p-4 text-right">Baseline</th>
                                <th className="p-4 text-right">Target</th>
                                <th className="p-4 text-right">Delta</th>
                                <th className="p-4 text-right">{selectedIdxDetail.isMarketAverage ? 'Availability' : 'Exposure'}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {selectedIdxDetail.breakdown.map((row: MonthlyContribution) => {
                                const mDelta = row.price - row.baselinePrice;
                                return (
                                    <tr key={row.month} className="hover:bg-slate-50 group">
                                        <td className="px-4 py-3 font-bold text-slate-700">{row.month}</td>
                                        <td className="px-4 py-3 text-right font-mono text-slate-400">${row.baselinePrice.toFixed(3)}</td>
                                        <td className="px-4 py-3 text-right font-mono text-slate-800 font-bold group-hover:text-blue-600 transition-colors">${row.price.toFixed(3)}</td>
                                        <td className={`px-4 py-3 text-right font-mono font-bold ${mDelta > 0.0001 ? 'text-emerald-600' : mDelta < -0.0001 ? 'text-rose-600' : 'text-slate-300'}`}>
                                            {mDelta > 0.0001 ? '+' : ''}{mDelta.toFixed(3)}
                                        </td>
                                        <td className={`px-4 py-3 text-right font-mono ${row.exposure > 0 ? 'text-emerald-600' : row.exposure < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                            {selectedIdxDetail.isMarketAverage ? 'Market' : `${(row.exposure / 1000).toLocaleString()}k`}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 border-t-2 border-slate-100 bg-slate-50 shrink-0">
                    <div className="flex justify-between items-center text-xs font-bold">
                        <span className="uppercase text-slate-400">Total Basis</span>
                        <div className="flex gap-4">
                            <div className="text-right">
                                <span className="block text-[9px] text-slate-400 uppercase">Baseline</span>
                                <span className="font-mono text-slate-500">${selectedIdxDetail.baselineWeightedPrice.toFixed(3)}</span>
                            </div>
                            <div className="text-right">
                                <span className="block text-[9px] text-blue-500 uppercase">Target</span>
                                <span className="font-mono text-blue-600 text-sm">${selectedIdxDetail.weightedPrice.toFixed(3)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
