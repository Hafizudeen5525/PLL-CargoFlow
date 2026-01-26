
import React, { useMemo, useState, useEffect } from 'react';
import { CargoProfile, PnLBucket } from '../types';
import { ForwardCurveRow, detectUnit, getExposureChartData, getPortfolioYear, recalculateProfile, getAvailableCurveDates, getPricesSnapshot, getForwardCurve, explainPricing, analyzeFormulaStructure, evaluateFormula, findDataGaps, DataGap, getGroupName, GROUPS } from '../services/calculationService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line, Legend } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { PnLBreakdown } from './PnLBreakdown';
import { PnLVarianceExplainer } from './PnLVarianceExplainer';
import { IndexWeightedPrices } from './IndexWeightedPrices';
import { toast } from 'react-hot-toast';

interface DashboardProps {
  profiles: CargoProfile[];
  marketData: Record<string, number>;
  forwardCurve: ForwardCurveRow[];
  onRefreshMarket: () => void;
  onCargoClick?: (profile: CargoProfile) => void;
  portfolioYear?: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ec4899', '#6366f1'];
const GAS_INDICES = ['HH', 'HH Last Day', 'TTF', 'JKM', 'NBP', 'AECO', 'STN 2'];
const OIL_INDICES = ['Dated Brent', 'JCC', 'BRIPE'];

const LINE_COLORS: Record<string, string> = {
    'HH': '#f59e0b',
    'HH Last Day': '#fbbf24',
    'TTF': '#3b82f6',
    'JKM': '#10b981',
    'NBP': '#8b5cf6',
    'AECO': '#64748b',
    'Dated Brent': '#ef4444',
    'JCC': '#f97316',
    'BRIPE': '#ec4899',
    'STN 2': '#06b6d4',
    'Oil': '#ef4444',
    'Other': '#94a3b8'
};

const ShipIcon = ({ className, flip = false }: { className?: string, flip?: boolean }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`${className} ${flip ? '-scale-x-100' : ''}`}>
        <path d="M2 14.5L4.5 20H19.5L22 14.5H2Z" fillOpacity="0.8" />
        <rect x="5" y="9" width="4" height="5" rx="1" className="text-blue-400" fill="currentColor"/>
        <rect x="10" y="8" width="4" height="6" rx="1" className="text-red-400" fill="currentColor"/>
        <rect x="15" y="10" width="4" height="4" rx="1" className="text-amber-400" fill="currentColor"/>
        <path d="M19 14V11L21 12V14H19Z" fillOpacity="0.6"/>
        <path d="M4 20L20 20" stroke="white" strokeWidth="1" strokeLinecap="round" className="opacity-30"/>
    </svg>
);

interface FinancialStats {
    pnl: number;
    revenue: number;
    purchase: number;
    other: number;
    vol: number;
}

export const Dashboard: React.FC<DashboardProps> = ({ profiles, marketData, forwardCurve, onRefreshMarket, onCargoClick, portfolioYear = 'All' }) => {
  const [curveView, setCurveView] = useState<'gas' | 'oil'>('gas');
  const [groupFilter, setGroupFilter] = useState<string>('All');
  
  const [targetDate, setTargetDate] = useState<string>('');
  const [baselineDate, setBaselineDate] = useState<string>('');
  
  const [activeDrillDown, setActiveDrillDown] = useState<string | null>(null);

  const [debugMode, setDebugMode] = useState<'single' | 'health' | 'tester' | 'gaps' | 'variance'>('health');
  const [baselineSnapshot, setBaselineSnapshot] = useState<{ profiles: CargoProfile[], date: string } | null>(null);

  const [testFormula, setTestFormula] = useState('');

  const availableDates = useMemo(() => getAvailableCurveDates(), [forwardCurve]);

  useEffect(() => {
    const saved = localStorage.getItem('pnl_baseline_snapshot');
    if (saved) setBaselineSnapshot(JSON.parse(saved));
  }, []);

  useEffect(() => {
      if (availableDates.length > 0) {
          if (!targetDate || !availableDates.includes(targetDate)) {
              setTargetDate(availableDates[0]);
          }
          if (!baselineDate || !availableDates.includes(baselineDate)) {
              setBaselineDate(availableDates.length > 1 ? availableDates[1] : availableDates[0]);
          }
      }
  }, [availableDates]);

  const handleSaveBaseline = () => {
    const snapshot = { profiles: JSON.parse(JSON.stringify(profiles)), date: targetDate };
    setBaselineSnapshot(snapshot);
    localStorage.setItem('pnl_baseline_snapshot', JSON.stringify(snapshot));
    toast.success('Portfolio Snapshot Saved as Baseline');
  };

  const availableGroups = useMemo(() => {
      return ['All', ...GROUPS, 'Others'];
  }, []);

  const viewProfiles = useMemo(() => {
      let filtered = profiles;
      if (groupFilter !== 'All') {
          filtered = profiles.filter(p => getGroupName(p.strategyName) === groupFilter);
      }

      return filtered.map(p => {
          if (p.pnlBucket === PnLBucket.Realized) return p;
          return recalculateProfile(p, true, targetDate) as CargoProfile;
      });
  }, [profiles, groupFilter, targetDate]);

  const dataGaps = useMemo(() => findDataGaps(viewProfiles, targetDate), [viewProfiles, targetDate]);

  const healthReport = useMemo(() => {
      const errors: any[] = [];
      const warnings: any[] = [];
      const success: any[] = [];

      viewProfiles.forEach(p => {
          if (p.pnlBucket === PnLBucket.Realized) {
              success.push({ ...p, _status: 'Realized', _source: 'Reconciled', _msg: 'Price locked' });
              return;
          }

          const sellTrace = explainPricing(p.sellFormula, p.deliveryDate, targetDate);
          const buyTrace = explainPricing(p.buyFormula, p.loadingDate || p.deliveryDate, targetDate);

          const isSellError = sellTrace.pricingMode === 'Error';
          const isBuyError = buyTrace.pricingMode === 'Error';
          
          if (isSellError || isBuyError) {
              errors.push({ 
                  ...p, 
                  _status: 'Error', 
                  _source: 'Failed', 
                  _msg: isSellError ? 'Sell Formula Error' : 'Buy Formula Error'
              });
              return;
          }

          success.push({
              ...p,
              _status: 'Unrealized',
              _source: sellTrace.pricingMode === buyTrace.pricingMode ? sellTrace.pricingMode : `${sellTrace.pricingMode}/${buyTrace.pricingMode}`,
              _msg: 'Calculated'
          });
      });

      return { errors, warnings, success };
  }, [viewProfiles, targetDate]);

  const targetStats = useMemo(() => {
      const initStats = () => ({ pnl: 0, revenue: 0, purchase: 0, other: 0, vol: 0 });
      const acc = {
          total: initStats(),
          realized: initStats(),
          unrealized: initStats()
      };

      viewProfiles.forEach(p => {
          const pnl = p.finalTotalPnL || 0;
          const revenue = p.finalSalesRevenue || 0;
          const vol = p.deliveredVolume || 0;
          
          const totalPurchaseT1 = (p.loadedVolume || 0) * (p.absoluteBuyPrice || 0);
          const totalPurchaseT2 = p.isTieredPricing ? (p.tier2LoadedVolume || 0) * (p.absoluteTier2BuyPrice || 0) : 0;
          const purchase = (p.reconciledPurchaseCost > 0) ? p.reconciledPurchaseCost : (totalPurchaseT1 + totalPurchaseT2);
          const other = pnl - revenue + purchase;

          // Add to Total
          acc.total.pnl += pnl;
          acc.total.revenue += revenue;
          acc.total.purchase += purchase;
          acc.total.other += other;
          acc.total.vol += vol;

          // Add to Buckets
          if (p.pnlBucket === PnLBucket.Realized) {
              acc.realized.pnl += pnl;
              acc.realized.revenue += revenue;
              acc.realized.purchase += purchase;
              acc.realized.other += other;
              acc.realized.vol += vol;
          } else {
              acc.unrealized.pnl += pnl;
              acc.unrealized.revenue += revenue;
              acc.unrealized.purchase += purchase;
              acc.unrealized.other += other;
              acc.unrealized.vol += vol;
          }
      });

      return acc;
  }, [viewProfiles]);

  const getStatsSnapshot = (dateStr: string) => {
    const initStats = () => ({ pnl: 0, revenue: 0, purchase: 0, other: 0, vol: 0 });
    const acc = {
        total: initStats(),
        realized: initStats(),
        unrealized: initStats()
    };

    let filtered = profiles;
    if (groupFilter !== 'All') {
        filtered = profiles.filter(p => getGroupName(p.strategyName) === groupFilter);
    }

    filtered.forEach(p => {
        let cp = p;
        if (p.pnlBucket !== PnLBucket.Realized && dateStr) {
            cp = recalculateProfile(p, true, dateStr) as CargoProfile;
        }
        
        const pnl = cp.finalTotalPnL || 0;
        const revenue = cp.finalSalesRevenue || 0;
        const vol = cp.deliveredVolume || 0;
        
        const totalPurchaseT1 = (cp.loadedVolume || 0) * (cp.absoluteBuyPrice || 0);
        const totalPurchaseT2 = cp.isTieredPricing ? (cp.tier2LoadedVolume || 0) * (cp.absoluteTier2BuyPrice || 0) : 0;
        const purchase = (cp.reconciledPurchaseCost > 0) ? cp.reconciledPurchaseCost : (totalPurchaseT1 + totalPurchaseT2);
        const other = pnl - revenue + purchase;

        acc.total.pnl += pnl;
        acc.total.revenue += revenue;
        acc.total.purchase += purchase;
        acc.total.other += other;
        acc.total.vol += vol;

        if (cp.pnlBucket === PnLBucket.Realized) {
            acc.realized.pnl += pnl;
            acc.realized.revenue += revenue;
            acc.realized.purchase += purchase;
            acc.realized.other += other;
            acc.realized.vol += vol;
        } else {
            acc.unrealized.pnl += pnl;
            acc.unrealized.revenue += revenue;
            acc.unrealized.purchase += purchase;
            acc.unrealized.other += other;
            acc.unrealized.vol += vol;
        }
    });

    return acc;
  };

  const baselineStats = useMemo(() => getStatsSnapshot(baselineDate), [profiles, groupFilter, baselineDate]);

  const timelineEvents = useMemo(() => {
      const today = new Date();
      today.setHours(0,0,0,0);
      const events: any[] = [];
      viewProfiles.forEach(p => {
          const isRealized = p.pnlBucket === PnLBucket.Realized;
          const processDate = (dateString: string, type: 'Loading' | 'Delivery') => {
              if (!dateString) return;
              const d = new Date(dateString);
              const dTime = new Date(d).setHours(0,0,0,0);
              const tTime = today.getTime();
              const isPast = dTime < tTime;
              if (!isPast || (isPast && !isRealized)) {
                  events.push({
                      id: p.id + (type === 'Loading' ? '_load' : '_del'),
                      date: d,
                      dateStr: dateString,
                      type,
                      title: type === 'Loading' ? `Load: ${p.source || 'Unknown'}` : `Deliver: ${p.buyer || 'Unknown'}`,
                      subtitle: p.strategyName,
                      status: isPast ? 'Overdue' : 'Scheduled',
                      profile: p
                  });
              }
          };
          if (p.loadingDate) processDate(p.loadingDate, 'Loading');
          if (p.deliveryDate) processDate(p.deliveryDate, 'Delivery');
      });
      return events.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 10);
  }, [viewProfiles]);

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

  return (
    <motion.div className="space-y-6 relative" variants={containerVariants} initial="hidden" animate="visible">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm gap-4">
          <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Derived Group:</span>
              <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg p-2 pr-8 font-medium">
                  {availableGroups.map(g => <option key={g} value={g}>{g === 'All' ? 'All (Auto-mapped)' : g}</option>)}
              </select>
              {dataGaps.length > 0 && (
                  <button onClick={() => setDebugMode('gaps')} className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-xs font-bold animate-pulse">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      {dataGaps.length} Historical Data Gaps
                  </button>
              )}
          </div>

          <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase px-2">Market Basis:</span>
                  <select value={baselineDate} onChange={(e) => setBaselineDate(e.target.value)} className="bg-white border border-slate-200 text-xs font-medium text-slate-600 rounded-md px-2 py-1">
                      {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <span className="text-slate-400">→</span>
                  <select value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="bg-white border border-slate-200 text-xs font-bold text-blue-700 rounded-md px-2 py-1">
                      {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
              </div>
              <button 
                onClick={handleSaveBaseline}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
                title="Save current cargo list and market as comparison baseline"
              >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                  Snapshot Baseline
              </button>
          </div>
      </div>

      <div className="space-y-4">
        {/* Main KPI Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FinancialHeroCard 
                title="Total Net P&L" 
                stats={targetStats.total} 
                baseline={baselineStats.total} 
                compareDate={baselineDate} 
                isHero 
                onClick={() => setActiveDrillDown('Total P&L')}
            />
            <StatCard 
                title="Portfolio Gross Volume" 
                value={targetStats.total.vol} 
                prevValue={baselineStats.total.vol} 
                compareDate={baselineDate} 
                suffix=" Vol Units" 
                colorClass="text-slate-800" 
                onClick={() => setActiveDrillDown('Volume')}
            />
        </div>

        {/* Realized / Unrealized Breakdown Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <FinancialHeroCard 
                title="Realized Performance" 
                stats={targetStats.realized} 
                baseline={baselineStats.realized} 
                compareDate={baselineDate} 
                colorClass="text-blue-600"
                onClick={() => setActiveDrillDown('Realized P&L')}
            />
            <FinancialHeroCard 
                title="Unrealized Projection" 
                stats={targetStats.unrealized} 
                baseline={baselineStats.unrealized} 
                compareDate={baselineDate} 
                colorClass="text-amber-600"
                onClick={() => setActiveDrillDown('Unrealized P&L')}
            />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div variants={itemVariants} className="lg:col-span-2 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-col h-[500px]">
             <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-bold text-slate-800">Forward Curve Context</h3>
                <div className="flex bg-slate-200 p-0.5 rounded-lg text-[10px] font-bold">
                    <button onClick={() => setCurveView('gas')} className={`px-3 py-1 rounded-md ${curveView === 'gas' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Gas</button>
                    <button onClick={() => setCurveView('oil')} className={`px-3 py-1 rounded-md ${curveView === 'oil' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Oil</button>
                </div>
             </div>
             <div className="flex-1 p-4">
                {forwardCurve.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={forwardCurve}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="month" tick={{fontSize: 10}} />
                            <YAxis tick={{fontSize: 10}} />
                            <Tooltip />
                            <Legend />
                            {(curveView === 'gas' ? GAS_INDICES : OIL_INDICES).map(idx => (
                                <Line key={idx} type="monotone" dataKey={`prices.${idx}`} name={idx} stroke={LINE_COLORS[idx]} strokeWidth={2} dot={false} />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                ) : <div className="h-full flex items-center justify-center text-slate-400">No Forward Curve Data</div>}
            </div>
          </motion.div>
          
          <motion.div variants={itemVariants} className="lg:col-span-1 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-col h-[500px]">
             <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                 <h3 className="text-lg font-bold text-slate-800">Cargo Timeline</h3>
             </div>
             <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                {timelineEvents.length > 0 ? timelineEvents.map((evt) => (
                    <div key={evt.id} className="flex items-center gap-4 p-3 bg-white border border-slate-100 rounded-xl hover:shadow-md cursor-pointer" onClick={() => onCargoClick && onCargoClick(evt.profile)}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${evt.status === 'Overdue' ? 'border-rose-400 text-rose-500' : 'border-blue-400 text-blue-500'}`}>
                            <ShipIcon className="w-6 h-6" flip={evt.type !== 'Loading'} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold truncate">{evt.title}</h4>
                            <p className="text-[10px] text-slate-500 truncate">{evt.subtitle}</p>
                            <p className="text-[10px] font-mono mt-1 text-slate-400">{evt.dateStr}</p>
                        </div>
                    </div>
                )) : (
                    <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">No upcoming events</div>
                )}
             </div>
          </motion.div>
      </div>

      <motion.div variants={itemVariants}>
          <IndexWeightedPrices 
            profiles={viewProfiles} 
            curveDate={targetDate} 
            baselineCurveDate={baselineDate} 
            forwardCurve={forwardCurve} 
            portfolioYear={portfolioYear}
          />
      </motion.div>

      <motion.div variants={itemVariants} className="space-y-4">
          <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Portfolio & Market Variance Attribution</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Snapshot: {baselineSnapshot?.date || 'N/A'} vs Current</p>
          </div>
          <PnLVarianceExplainer 
            currentProfiles={profiles}
            baselineProfiles={baselineSnapshot?.profiles || profiles} 
            currentCurveDate={targetDate}
            baselineCurveDate={baselineDate}
          />
      </motion.div>

      <motion.div variants={itemVariants} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-[600px] flex flex-col">
          <div className="flex justify-between items-center mb-6 shrink-0">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                  Portfolio Integrity & Diagnostic
              </h3>
              <div className="flex bg-slate-100 p-1 rounded-lg">
                  {[
                    { id: 'health', label: 'Health Status' },
                    { id: 'gaps', label: 'Missing Data' },
                    { id: 'tester', label: 'Formula Lab' }
                  ].map(tab => (
                      <button key={tab.id} onClick={() => setDebugMode(tab.id as any)} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${debugMode === tab.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>{tab.label}</button>
                  ))}
              </div>
          </div>
          
          <div className="flex-1 overflow-hidden min-h-0">
            {debugMode === 'health' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 h-full pb-2 min-h-0">
                    <HealthColumn title="Attention Needed" items={healthReport.errors} color="rose" />
                    <HealthColumn title="Pricing Warnings" items={healthReport.warnings} color="amber" />
                    <HealthColumn title="Operational Health" items={healthReport.success} color="emerald" />
                </div>
            )}

            {debugMode === 'gaps' && (
                <div className="space-y-4 h-full flex flex-col min-h-0">
                    <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl shrink-0">
                        <h4 className="text-rose-800 font-bold text-sm mb-1">Missing Historical Monthly Prices</h4>
                        <p className="text-xs text-rose-600">These index/month pairs are referenced in active formulas but missing from the current curve ({targetDate}).</p>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar border border-slate-200 rounded-xl bg-white shadow-inner min-h-0">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3">Index</th>
                                    <th className="px-4 py-3">Pricing Month</th>
                                    <th className="px-4 py-3">Affected Strategies</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {dataGaps.length === 0 ? (
                                    <tr><td colSpan={3} className="p-8 text-center text-slate-400">No missing monthly data detected for current view.</td></tr>
                                ) : (
                                    dataGaps.map((gap, i) => (
                                        <tr key={i} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-bold text-slate-700">{gap.index}</td>
                                            <td className="px-4 py-3 font-mono text-rose-500">{gap.month}</td>
                                            <td className="px-4 py-3 text-slate-500 whitespace-normal break-words">{gap.affectedStrategies.join(', ')}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {debugMode === 'tester' && (
                <div className="space-y-4 h-full overflow-y-auto custom-scrollbar pr-2 min-h-0">
                    <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                        <label className="block text-sm font-bold text-slate-700 mb-2">Test Formula Expression</label>
                        <input type="text" value={testFormula} onChange={(e) => setTestFormula(e.target.value)} placeholder="e.g. 50% HH + 0.50" className="w-full px-4 py-3 rounded-lg border border-slate-300 font-mono text-sm" />
                    </div>
                    {testFormula && (
                        <div className="bg-white border border-slate-200 rounded-xl p-4">
                            <p className="text-xs font-bold text-slate-400 mb-2">Evaluation Result ({targetDate}):</p>
                            <div className="text-xl font-mono font-bold text-blue-600">${evaluateFormula(testFormula, undefined, targetDate)?.toFixed(3) ?? 'Calculation Error'}</div>
                        </div>
                    )}
                </div>
            )}
          </div>
      </motion.div>

      <motion.div variants={itemVariants}>
          <PnLBreakdown profiles={viewProfiles} />
      </motion.div>

      <AnimatePresence>
          {activeDrillDown && (
            <DrillDownTable 
                profiles={viewProfiles} 
                metricType={activeDrillDown} 
                onClose={() => setActiveDrillDown(null)} 
                targetDate={targetDate} 
                format={formatCurrency} 
            />
          )}
      </AnimatePresence>
    </motion.div>
  );
};

/**
 * Hero Card with sub-breakdown for Revenue, Purchase, and Other
 */
const FinancialHeroCard = ({ title, stats, baseline, compareDate, isHero, colorClass, onClick }: any) => {
    const format = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
    const delta = stats.pnl - baseline.pnl;
    const isPositive = delta >= 0;

    return (
        <motion.div 
            className={`bg-white p-6 rounded-2xl shadow-sm border transition-all flex flex-col justify-between h-full ${isHero ? 'border-indigo-100 ring-2 ring-indigo-50/50' : 'border-slate-100'} ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-1' : ''}`}
            variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
            onClick={onClick}
        >
            <div>
                <div className="flex justify-between items-start mb-4">
                    <p className={`text-xs font-black uppercase tracking-widest ${isHero ? 'text-indigo-500' : 'text-slate-400'}`}>{title}</p>
                    <div className={`px-2 py-1 rounded-lg text-[10px] font-bold ${isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {isPositive ? '▲' : '▼'} {format(Math.abs(delta))}
                    </div>
                </div>
                <p className={`text-3xl font-black ${stats.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'} ${colorClass || ''}`}>
                    {format(stats.pnl)}
                </p>
                <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-tight">Market Basis: {compareDate}</p>
            </div>

            {/* Sub-breakdown Row */}
            <div className="grid grid-cols-3 gap-4 mt-8 pt-6 border-t border-slate-50">
                <SubMetric label="Revenue" value={stats.revenue} baseline={baseline.revenue} format={format} color="text-indigo-600" />
                <SubMetric label="Purchase" value={stats.purchase} baseline={baseline.purchase} format={format} color="text-rose-500" invert />
                <SubMetric label="Other" value={stats.other} baseline={baseline.other} format={format} color="text-slate-600" />
            </div>
        </motion.div>
    );
};

const SubMetric = ({ label, value, baseline, format, color, invert }: any) => {
    const delta = value - baseline;
    const isImproved = invert ? delta <= 0 : delta >= 0;
    
    return (
        <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-0.5">{label}</p>
            <p className={`text-xs font-bold ${color}`}>{format(value)}</p>
            <div className={`text-[8px] font-bold mt-0.5 ${isImproved ? 'text-emerald-500' : 'text-rose-400'}`}>
                {delta >= 0 ? '+' : '-'}{format(Math.abs(delta))}
            </div>
        </div>
    );
};

const StatCard = ({ title, value, prevValue, compareDate, format, suffix, colorClass, onClick, isHero, hint }: any) => {
    let delta = null;
    let isPositive = false;
    if (prevValue !== undefined && prevValue !== null && typeof value === 'number') {
        delta = value - prevValue;
        isPositive = delta >= 0;
    }
    const displayVal = format ? format(value) : (typeof value === 'number' ? value.toLocaleString() : value);

    return (
        <motion.div 
            className={`bg-white p-6 rounded-2xl shadow-sm border transition-all h-full ${isHero ? 'border-indigo-100 ring-1 ring-indigo-50/50' : 'border-slate-100'} ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-1' : ''}`} 
            variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }} 
            onClick={onClick}
        >
          <div className="flex justify-between items-start mb-2">
            <p className={`text-xs font-black uppercase tracking-widest ${isHero ? 'text-indigo-500' : 'text-slate-400'}`}>{title}</p>
            {hint && <span className="text-[9px] font-bold text-slate-300 uppercase">{hint}</span>}
          </div>
          <p className={`text-3xl font-black ${colorClass}`}>{displayVal}{suffix}</p>
          {delta !== null && (
              <div className="flex items-center gap-1.5 mt-2 text-[10px] font-bold">
                  <span className={isPositive ? 'text-emerald-500' : 'text-rose-500'}>{isPositive ? '▲' : '▼'} {format ? format(Math.abs(delta)) : Math.abs(delta).toLocaleString()}</span>
                  <span className="text-slate-400 font-normal">vs {compareDate}</span>
              </div>
          )}
        </motion.div>
    );
};

const HealthColumn = ({ title, items, color }: any) => {
    const bgClass = color === 'rose' ? 'bg-rose-50 border-rose-100' : color === 'amber' ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100';
    const textClass = color === 'rose' ? 'text-rose-800' : color === 'amber' ? 'text-amber-800' : 'text-emerald-800';
    return (
        <div className={`rounded-xl border p-4 flex flex-col h-full min-h-0 ${bgClass}`}>
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-white/50 shrink-0">
                <h4 className={`font-bold text-sm ${textClass}`}>{title}</h4>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold bg-white/50 ${textClass}`}>{items.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 min-h-0">
                {items.map((p: any) => (
                    <div key={p.id} className="bg-white p-3 rounded-lg shadow-sm border border-white/50">
                        <div className="font-bold text-xs text-slate-700 leading-tight whitespace-normal break-words">{p.strategyName}</div>
                        <div className="text-[10px] text-slate-500 mt-1">{getGroupName(p.strategyName)}</div>
                    </div>
                ))}
                {items.length === 0 && (
                    <div className="text-[10px] text-slate-400 italic text-center py-4">No records in this bucket</div>
                )}
            </div>
        </div>
    );
};

const DrillDownTable = ({ profiles, metricType, onClose, targetDate, format }: any) => {
    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-slate-800 uppercase">Drill Down: {metricType}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0">
                            <tr>
                                <th className="px-4 py-3 bg-slate-50">Strategy</th>
                                <th className="px-4 py-3 bg-slate-50">Auto Group</th>
                                <th className="px-4 py-3 text-right bg-slate-50">PnL ({targetDate})</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {profiles.map((p: any) => (
                                <tr key={p.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-bold">{p.strategyName}</td>
                                    <td className="px-4 py-3">{getGroupName(p.strategyName)}</td>
                                    <td className={`px-4 py-3 text-right font-mono ${p.finalTotalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{format(p.finalTotalPnL)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </motion.div>
        </div>
    );
};
