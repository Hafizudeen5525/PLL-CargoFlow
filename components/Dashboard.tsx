
import React, { useMemo, useState, useEffect } from 'react';
import { CargoProfile, PnLBucket } from '../types';
import { ForwardCurveRow, detectUnit, getExposureChartData, getPortfolioYear, recalculateProfile, getAvailableCurveDates, getPricesSnapshot, getForwardCurve, explainPricing, analyzeFormulaStructure, evaluateFormula, findDataGaps, DataGap, getGroupName, GROUPS } from '../services/calculationService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line, Legend } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { WorldMap } from './WorldMap';
import { PnLBreakdown } from './PnLBreakdown';
import { PnLVarianceExplainer } from './PnLVarianceExplainer';
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
const ALL_INDICES = [...GAS_INDICES, ...OIL_INDICES];

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

export const Dashboard: React.FC<DashboardProps> = ({ profiles, forwardCurve, onRefreshMarket, onCargoClick, portfolioYear = 'All' }) => {
  const [curveView, setCurveView] = useState<'gas' | 'oil'>('gas');
  const [groupFilter, setGroupFilter] = useState<string>('All');
  const [pnlChartMode, setPnlChartMode] = useState<'Group' | 'Strategy' | 'Year'>('Group');
  const [volChartMode, setVolChartMode] = useState<'Group' | 'Buyer'>('Group');
  
  const [targetDate, setTargetDate] = useState<string>('');
  const [baselineDate, setBaselineDate] = useState<string>('');
  
  const [activeDrillDown, setActiveDrillDown] = useState<'total' | 'volume' | 'realized' | 'unrealized' | null>(null);
  const [indexDrillDown, setIndexDrillDown] = useState<string | null>(null);

  const [debugMode, setDebugMode] = useState<'single' | 'health' | 'tester' | 'gaps' | 'variance'>('health');
  const [baselineSnapshot, setBaselineSnapshot] = useState<{ profiles: CargoProfile[], date: string } | null>(null);

  // Added missing state variables to fix "Cannot find name 'testFormula'" errors
  const [testFormula, setTestFormula] = useState('');

  const availableDates = useMemo(() => getAvailableCurveDates(), []);

  useEffect(() => {
    const saved = localStorage.getItem('pnl_baseline_snapshot');
    if (saved) setBaselineSnapshot(JSON.parse(saved));
  }, []);

  useEffect(() => {
      const dates = getAvailableCurveDates();
      if (dates.length > 0) {
          if (!targetDate || !dates.includes(targetDate)) setTargetDate(dates[0]);
          if (!baselineDate || !dates.includes(baselineDate)) setBaselineDate(dates.length > 1 ? dates[1] : dates[0]);
      }
  }, [availableDates]);

  const handleSaveBaseline = () => {
    const snapshot = { profiles: [...profiles], date: targetDate };
    setBaselineSnapshot(snapshot);
    localStorage.setItem('pnl_baseline_snapshot', JSON.stringify(snapshot));
    toast.success('Baseline Snapshot Saved');
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
      return viewProfiles.reduce((acc, p) => ({
          totalPnL: acc.totalPnL + (p.finalTotalPnL || 0),
          totalVolume: acc.totalVolume + (p.deliveredVolume || 0),
          realizedPnL: acc.realizedPnL + (p.pnlBucket === PnLBucket.Realized ? (p.finalTotalPnL || 0) : 0),
          unrealizedPnL: acc.unrealizedPnL + (p.pnlBucket === PnLBucket.Unrealized ? (p.finalTotalPnL || 0) : 0)
      }), { totalPnL: 0, totalVolume: 0, realizedPnL: 0, unrealizedPnL: 0 });
  }, [viewProfiles]);

  const getStatsFromDate = (dateStr: string) => {
    let totalPnL = 0;
    let totalVolume = 0;
    let realizedPnL = 0;
    let unrealizedPnL = 0;

    let filtered = profiles;
    if (groupFilter !== 'All') {
        filtered = profiles.filter(p => getGroupName(p.strategyName) === groupFilter);
    }

    filtered.forEach(p => {
        let calcProfile = p;
        if (p.pnlBucket !== PnLBucket.Realized && dateStr) {
            calcProfile = recalculateProfile(p, true, dateStr) as CargoProfile;
        }
        totalPnL += (calcProfile.finalTotalPnL || 0);
        totalVolume += (calcProfile.deliveredVolume || 0);
        if (calcProfile.pnlBucket === PnLBucket.Realized) realizedPnL += (calcProfile.finalTotalPnL || 0);
        if (calcProfile.pnlBucket === PnLBucket.Unrealized) unrealizedPnL += (calcProfile.finalTotalPnL || 0);
    });

    return { totalPnL, totalVolume, realizedPnL, unrealizedPnL };
};

  const baselineStats = useMemo(() => getStatsFromDate(baselineDate), [profiles, groupFilter, baselineDate]);

  const timelineEvents = useMemo(() => {
      const today = new Date();
      today.setHours(0,0,0,0);
      const events: any[] = [];
      viewProfiles.forEach(p => {
          const unit = detectUnit(p.sellFormula || p.buyFormula);
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
                      volume: type === 'Loading' ? p.loadedVolume : p.deliveredVolume,
                      unit,
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Total Net P&L" value={targetStats.totalPnL} prevValue={baselineStats.totalPnL} compareDate={baselineDate} format={formatCurrency} colorClass={targetStats.totalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'} onClick={() => setActiveDrillDown('total')} />
        <StatCard title="Total Volume" value={targetStats.totalVolume.toLocaleString()} prevValue={baselineStats.totalVolume} compareDate={baselineDate} suffix=" Vol" colorClass="text-slate-800" onClick={() => setActiveDrillDown('volume')} />
        <StatCard title="Realized P&L" value={targetStats.realizedPnL} prevValue={baselineStats.realizedPnL} compareDate={baselineDate} format={formatCurrency} colorClass="text-blue-600" onClick={() => setActiveDrillDown('realized')} />
        <StatCard title="Unrealized P&L" value={targetStats.unrealizedPnL} prevValue={baselineStats.unrealizedPnL} compareDate={baselineDate} format={formatCurrency} colorClass="text-amber-600" onClick={() => setActiveDrillDown('unrealized')} />
      </div>

      {/* Variance Analysis Section */}
      <motion.div variants={itemVariants} className="space-y-4">
          <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Variance Attribution</h3>
              <button 
                onClick={handleSaveBaseline}
                className="px-4 py-1.5 bg-white border border-slate-200 text-slate-600 text-[10px] font-bold rounded-lg shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2"
              >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Set New Baseline
              </button>
          </div>
          <PnLVarianceExplainer 
            currentProfiles={profiles}
            baselineProfiles={baselineSnapshot?.profiles || []}
            currentCurveDate={targetDate}
            baselineCurveDate={baselineSnapshot?.date || baselineDate}
          />
      </motion.div>

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
                {timelineEvents.map((evt) => (
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
                ))}
             </div>
          </motion.div>
      </div>

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

      <motion.div variants={itemVariants} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-6">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Global Trade Flows
          </h3>
          <WorldMap profiles={viewProfiles} height={400} />
      </motion.div>

      <motion.div variants={itemVariants}>
          <PnLBreakdown profiles={viewProfiles} />
      </motion.div>

      <AnimatePresence>
          {activeDrillDown && <DrillDownTable profiles={viewProfiles} metricType={activeDrillDown} onClose={() => setActiveDrillDown(null)} targetDate={targetDate} format={formatCurrency} />}
      </AnimatePresence>
    </motion.div>
  );
};

const StatCard = ({ title, value, prevValue, compareDate, format, suffix, colorClass, onClick }: any) => {
    let delta = null;
    let isPositive = false;
    if (prevValue !== undefined && prevValue !== null && typeof value === 'number') {
        delta = value - prevValue;
        isPositive = delta >= 0;
    }
    return (
        <motion.div className={`bg-white p-6 rounded-xl shadow-sm border border-slate-100 transition-all ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-1' : ''}`} variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }} onClick={onClick}>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{title}</p>
          <p className={`text-2xl font-bold ${colorClass}`}>{format ? format(value) : value}{suffix}</p>
          {delta !== null && (
              <div className="flex items-center gap-1.5 mt-1 text-[10px] font-bold">
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
