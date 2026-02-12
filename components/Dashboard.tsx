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
  editingProfileId?: string;
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

interface DrillDownConfig {
    bucket: 'Total' | 'Realized' | 'Unrealized';
    metric: 'PnL' | 'Revenue' | 'Purchase' | 'Other' | 'Volume';
}

export const Dashboard: React.FC<DashboardProps> = ({ profiles, marketData, forwardCurve, onRefreshMarket, onCargoClick, portfolioYear = 'All', editingProfileId }) => {
  const [curveView, setCurveView] = useState<'gas' | 'oil'>('gas');
  const [groupFilter, setGroupFilter] = useState<string>('All');
  
  const [targetDate, setTargetDate] = useState<string>('');
  const [baselineDate, setBaselineDate] = useState<string>('');
  
  const [activeDrillDown, setActiveDrillDown] = useState<DrillDownConfig | null>(null);

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
          filtered = profiles.filter((p: CargoProfile) => getGroupName(p.strategyName) === groupFilter);
      }

      return filtered.map((p: CargoProfile) => {
          if (p.pnlBucket === PnLBucket.Realized) return p;
          return recalculateProfile(p, true, targetDate) as CargoProfile;
      });
  }, [profiles, groupFilter, targetDate]);

  const dataGaps = useMemo(() => findDataGaps(viewProfiles, targetDate), [viewProfiles, targetDate]);

  const healthReport = useMemo(() => {
      const errors: any[] = [];
      const warnings: any[] = [];
      const success: any[] = [];

      viewProfiles.forEach((p: CargoProfile) => {
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

  const strategyMovements = useMemo(() => {
      if (!baselineDate || !targetDate) return [];
      return viewProfiles.map((p: CargoProfile) => {
          const pBase = (p.pnlBucket === PnLBucket.Realized) ? p : recalculateProfile(p, true, baselineDate) as CargoProfile;
          const pCurr = (p.pnlBucket === PnLBucket.Realized) ? p : recalculateProfile(p, true, targetDate) as CargoProfile;
          const delta = (pCurr.finalTotalPnL || 0) - (pBase.finalTotalPnL || 0);
          return { name: p.strategyName, delta };
      }).filter((m: { name: string, delta: number }) => Math.abs(m.delta) > 0.01).sort((a: any, b: any) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [viewProfiles, baselineDate, targetDate]);

  const targetStats = useMemo(() => {
      const initStats = () => ({ pnl: 0, revenue: 0, purchase: 0, other: 0, vol: 0, count: 0 });
      const acc = {
          total: initStats(),
          realized: initStats(),
          unrealized: initStats()
      };

      viewProfiles.forEach((p: CargoProfile) => {
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
          acc.total.count += 1;

          // Add to Buckets
          if (p.pnlBucket === PnLBucket.Realized) {
              acc.realized.pnl += pnl;
              acc.realized.revenue += revenue;
              acc.realized.purchase += purchase;
              acc.realized.other += other;
              acc.realized.vol += vol;
              acc.realized.count += 1;
          } else {
              acc.unrealized.pnl += pnl;
              acc.unrealized.revenue += revenue;
              acc.unrealized.purchase += purchase;
              acc.unrealized.other += other;
              acc.unrealized.vol += vol;
              acc.unrealized.count += 1;
          }
      });

      return acc;
  }, [viewProfiles]);

  const getStatsSnapshot = (dateStr: string) => {
    const initStats = () => ({ pnl: 0, revenue: 0, purchase: 0, other: 0, vol: 0, count: 0 });
    const acc = {
        total: initStats(),
        realized: initStats(),
        unrealized: initStats()
    };

    let filtered = profiles;
    if (groupFilter !== 'All') {
        filtered = profiles.filter((p: CargoProfile) => getGroupName(p.strategyName) === groupFilter);
    }

    filtered.forEach((p: CargoProfile) => {
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
        acc.total.count += 1;

        if (cp.pnlBucket === PnLBucket.Realized) {
            acc.realized.pnl += pnl;
            acc.realized.revenue += revenue;
            acc.realized.purchase += purchase;
            acc.realized.other += other;
            acc.realized.vol += vol;
            acc.realized.count += 1;
        } else {
            acc.unrealized.pnl += pnl;
            acc.unrealized.revenue += revenue;
            acc.unrealized.purchase += purchase;
            acc.unrealized.other += other;
            acc.unrealized.vol += vol;
            acc.unrealized.count += 1;
        }
    });

    return acc;
  };

  const baselineStats = useMemo(() => getStatsSnapshot(baselineDate), [profiles, groupFilter, baselineDate]);

  const timelineEvents = useMemo(() => {
      const today = new Date();
      today.setHours(0,0,0,0);
      const events: any[] = [];
      viewProfiles.forEach((p: CargoProfile) => {
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
      return events.sort((a: any, b: any) => a.date.getTime() - b.date.getTime()).slice(0, 10);
  }, [viewProfiles]);

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

  return (
    <motion.div className="space-y-4 lg:space-y-6 relative" variants={containerVariants} initial="hidden" animate="visible">
      <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm gap-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
              <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wide px-1">Derived Group:</span>
              <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-700 text-xs sm:text-sm rounded-lg p-2 font-medium">
                  {availableGroups.map((g: string) => <option key={g} value={g}>{g === 'All' ? 'All (Auto-mapped)' : g}</option>)}
              </select>
              {dataGaps.length > 0 && (
                  <button onClick={() => setDebugMode('gaps')} className="flex items-center justify-center gap-2 px-3 py-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-xs font-bold animate-pulse">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      {dataGaps.length} Gaps
                  </button>
              )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex flex-1 items-center justify-center gap-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-100 overflow-x-auto">
                  <span className="hidden sm:inline text-[9px] font-black text-slate-400 uppercase px-2">Basis:</span>
                  <select value={baselineDate} onChange={(e) => setBaselineDate(e.target.value)} className="bg-white border border-slate-200 text-[10px] font-medium text-slate-600 rounded-md px-2 py-1">
                      {availableDates.map((d: string) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <span className="text-slate-400">→</span>
                  <select value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="bg-white border border-slate-200 text-[10px] font-bold text-blue-700 rounded-md px-2 py-1">
                      {availableDates.map((d: string) => <option key={d} value={d}>{d}</option>)}
                  </select>
              </div>
              <button 
                onClick={handleSaveBaseline}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-lg text-[10px] sm:text-xs font-bold hover:bg-indigo-100 transition-colors"
              >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                  <span className="hidden sm:inline">Snapshot Baseline</span>
                  <span className="sm:hidden">Snapshot</span>
              </button>
          </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FinancialHeroCard 
                title="Total Physical P&L" 
                bucket="Total"
                stats={targetStats.total} 
                baseline={baselineStats.total} 
                compareDate={baselineDate} 
                isHero 
                onDrillDown={(metric: any) => setActiveDrillDown({ bucket: 'Total', metric })}
            />
            <StatCard 
                title="Portfolio Gross Volume" 
                value={targetStats.total.vol} 
                prevValue={baselineStats.total.vol} 
                compareDate={baselineDate} 
                suffix=" Vol Units" 
                colorClass="text-slate-800" 
                hint={`${targetStats.total.count} Cargoes`}
                onClick={() => setActiveDrillDown({ bucket: 'Total', metric: 'Volume' })}
            />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <FinancialHeroCard 
                title="Realized Physical" 
                bucket="Realized"
                stats={targetStats.realized} 
                baseline={baselineStats.realized} 
                compareDate={baselineDate} 
                colorClass="text-blue-600"
                onDrillDown={(metric: any) => setActiveDrillDown({ bucket: 'Realized', metric })}
            />
            <FinancialHeroCard 
                title="Unrealized Physical" 
                bucket="Unrealized"
                stats={targetStats.unrealized} 
                baseline={baselineStats.unrealized} 
                compareDate={baselineDate} 
                colorClass="text-amber-600"
                onDrillDown={(metric: any) => setActiveDrillDown({ bucket: 'Unrealized', metric })}
            />
        </div>
      </div>

      <motion.div variants={itemVariants}>
          <StrategyTicker movements={strategyMovements} baselineDate={baselineDate} />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div variants={itemVariants} className="lg:col-span-2 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-col h-[350px] sm:h-[500px]">
             <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50/50 gap-2">
                <h3 className="font-bold text-slate-800">Forward Curve Context</h3>
                <div className="flex bg-slate-200 p-0.5 rounded-lg text-[9px] sm:text-[10px] font-bold w-full sm:w-auto">
                    <button onClick={() => setCurveView('gas')} className={`flex-1 sm:flex-none px-3 py-1 rounded-md ${curveView === 'gas' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Gas</button>
                    <button onClick={() => setCurveView('oil')} className={`flex-1 sm:flex-none px-3 py-1 rounded-md ${curveView === 'oil' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Oil</button>
                </div>
             </div>
             <div className="flex-1 p-2 sm:p-4 overflow-hidden">
                {forwardCurve.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={forwardCurve}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="month" tick={{fontSize: 9}} />
                            <YAxis tick={{fontSize: 9}} />
                            <Tooltip wrapperStyle={{fontSize: '10px'}} />
                            <Legend wrapperStyle={{fontSize: '10px', paddingTop: '10px'}} />
                            {(curveView === 'gas' ? GAS_INDICES : OIL_INDICES).map((idx: string) => (
                                <Line key={idx} type="monotone" dataKey={`prices.${idx}`} name={idx} stroke={LINE_COLORS[idx]} strokeWidth={2} dot={false} />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                ) : <div className="h-full flex items-center justify-center text-slate-400">No Forward Curve Data</div>}
            </div>
          </motion.div>
          
          <motion.div variants={itemVariants} className="lg:col-span-1 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-col h-[400px] sm:h-[500px]">
             <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                 <h3 className="text-lg font-bold text-slate-800">Cargo Timeline</h3>
             </div>
             <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 sm:space-y-4">
                {timelineEvents.length > 0 ? timelineEvents.map((evt: any) => (
                    <div key={evt.id} className="flex items-center gap-3 sm:gap-4 p-3 bg-white border border-slate-100 rounded-xl hover:shadow-md cursor-pointer" onClick={() => onCargoClick && onCargoClick(evt.profile)}>
                        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border-2 shrink-0 ${evt.status === 'Overdue' ? 'border-rose-400 text-rose-500' : 'border-blue-400 text-blue-500'}`}>
                            <ShipIcon className="w-5 h-5 sm:w-6 sm:h-6" flip={evt.type !== 'Loading'} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="text-xs sm:text-sm font-bold truncate">{evt.title}</h4>
                            <p className="text-[9px] sm:text-[10px] text-slate-500 truncate">{evt.subtitle}</p>
                            <p className="text-[9px] font-mono mt-1 text-slate-400">{evt.dateStr}</p>
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
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
              <h3 className="text-xs sm:text-sm font-bold text-slate-500 uppercase tracking-widest px-1">Market Variance Attribution</h3>
              <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase px-1">Snap: {baselineSnapshot?.date || 'N/A'} vs Now</p>
          </div>
          <PnLVarianceExplainer 
            currentProfiles={profiles}
            baselineProfiles={baselineSnapshot?.profiles || profiles} 
            currentCurveDate={targetDate}
            baselineCurveDate={baselineDate}
          />
      </motion.div>

      <motion.div variants={itemVariants} className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200 h-[500px] sm:h-[600px] flex flex-col">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 shrink-0 gap-4">
              <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                  Portfolio Integrity
              </h3>
              <div className="flex bg-slate-100 p-1 rounded-lg w-full sm:w-auto overflow-x-auto">
                  {[
                    { id: 'health', label: 'Health' },
                    { id: 'gaps', label: 'Gaps' },
                    { id: 'tester', label: 'Lab' }
                  ].map((tab: any) => (
                      <button key={tab.id} onClick={() => setDebugMode(tab.id as any)} className={`flex-1 sm:flex-none px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${debugMode === tab.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>{tab.label}</button>
                  ))}
              </div>
          </div>
          
          <div className="flex-1 overflow-hidden min-h-0">
            {debugMode === 'health' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 h-full pb-2 min-h-0 overflow-y-auto sm:overflow-hidden">
                    <HealthColumn title="Attention" items={healthReport.errors} color="rose" />
                    <HealthColumn title="Warnings" items={healthReport.warnings} color="amber" />
                    <HealthColumn title="Operational" items={healthReport.success} color="emerald" />
                </div>
            )}

            {debugMode === 'gaps' && (
                <div className="space-y-4 h-full flex flex-col min-h-0">
                    <div className="bg-rose-50 border border-rose-100 p-3 sm:p-4 rounded-xl shrink-0">
                        <h4 className="text-rose-800 font-bold text-xs sm:text-sm mb-1">Missing Monthly Prices</h4>
                        <p className="text-[10px] sm:text-xs text-rose-600">Referenced in formulas but missing from {targetDate}.</p>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar border border-slate-200 rounded-xl bg-white shadow-inner min-h-0">
                        <table className="w-full text-[10px] sm:text-xs text-left">
                            <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3">Index</th>
                                    <th className="px-4 py-3">Month</th>
                                    <th className="hidden sm:table-cell px-4 py-3">Strategies</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {dataGaps.length === 0 ? (
                                    <tr><td colSpan={3} className="p-8 text-center text-slate-400">No missing data.</td></tr>
                                ) : (
                                    dataGaps.map((gap: DataGap, i: number) => (
                                        <tr key={i} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-bold text-slate-700">{gap.index}</td>
                                            <td className="px-4 py-3 font-mono text-rose-500">{gap.month}</td>
                                            <td className="hidden sm:table-cell px-4 py-3 text-slate-500 whitespace-normal break-words">{gap.affectedStrategies.join(', ')}</td>
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
                    <div className="bg-slate-50 p-4 sm:p-6 rounded-xl border border-slate-200">
                        <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-2">Test Formula Expression</label>
                        <input type="text" value={testFormula} onChange={(e) => setTestFormula(e.target.value)} placeholder="e.g. 50% HH + 0.50" className="w-full px-4 py-3 rounded-lg border border-slate-300 font-mono text-xs sm:text-sm" />
                    </div>
                    {testFormula && (
                        <div className="bg-white border border-slate-200 rounded-xl p-4">
                            <p className="text-[10px] sm:text-xs font-bold text-slate-400 mb-2">Evaluation Result ({targetDate}):</p>
                            <div className="text-lg sm:text-xl font-mono font-bold text-blue-600">${evaluateFormula(testFormula, undefined, targetDate)?.toFixed(3) ?? 'Error'}</div>
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
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-0 sm:p-6">
              <DrillDownTable 
                  profiles={viewProfiles} 
                  config={activeDrillDown} 
                  onClose={() => setActiveDrillDown(null)} 
                  onCargoClick={(p: CargoProfile) => {
                      onCargoClick?.(p);
                  }}
                  targetDate={targetDate} 
                  format={formatCurrency} 
                  baselineDate={baselineDate}
                  editingProfileId={editingProfileId}
              />
            </div>
          )}
      </AnimatePresence>
    </motion.div>
  );
};

const StrategyTicker = ({ movements, baselineDate }: { movements: { name: string, delta: number }[], baselineDate: string }) => {
    if (movements.length === 0) return null;

    return (
        <div className="bg-slate-900 py-2.5 overflow-hidden whitespace-nowrap border-y border-slate-800 relative shadow-inner">
            <div className="flex animate-marquee-slower items-center">
                {[...movements, ...movements, ...movements].map((m: { name: string, delta: number }, i: number) => (
                    <div key={i} className="flex items-center gap-2 mx-6 sm:mx-10 text-[10px] sm:text-[11px] font-black">
                        <span className="text-slate-500 uppercase tracking-widest">{m.name}</span>
                        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded ${m.delta >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                            <span>{m.delta >= 0 ? '▲' : '▼'}</span>
                            <span className="font-mono">${Math.abs(m.delta).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </div>
                    </div>
                ))}
            </div>
            <div className="absolute right-0 top-0 h-full w-12 sm:w-24 bg-gradient-to-l from-slate-900 to-transparent pointer-events-none z-10"></div>
            <div className="absolute left-0 top-0 h-full w-12 sm:w-24 bg-gradient-to-r from-slate-900 to-transparent pointer-events-none z-10"></div>
            <div className="absolute top-0 left-2 sm:left-4 h-full flex items-center z-20">
                <span className="text-[7px] sm:text-[8px] font-black text-slate-500 uppercase bg-slate-900 px-1.5 py-1 border border-slate-800 rounded">MOVEMENTS</span>
            </div>
            <style>{`
                @keyframes marquee-slower {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-33.33%); }
                }
                .animate-marquee-slower {
                    animation: marquee-slower 60s linear infinite;
                }
                .animate-marquee-slower:hover {
                    animation-play-state: paused;
                }
            `}</style>
        </div>
    );
};

const FinancialHeroCard = ({ title, stats, baseline, compareDate, isHero, colorClass, onDrillDown }: any) => {
    const format = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
    const delta = stats.pnl - baseline.pnl;
    const isPositive = delta >= 0;

    return (
        <motion.div 
            className={`bg-white p-4 sm:p-6 rounded-2xl shadow-sm border transition-all flex flex-col justify-between h-full ${isHero ? 'border-indigo-100 ring-2 ring-indigo-50/50' : 'border-slate-100'} hover:shadow-md hover:-translate-y-1`}
            variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
        >
            <div className="cursor-pointer" onClick={() => onDrillDown('PnL')}>
                <div className="flex justify-between items-start mb-2 sm:mb-4">
                    <div className="flex flex-col">
                        <p className={`text-[10px] sm:text-xs font-black uppercase tracking-widest ${isHero ? 'text-indigo-500' : 'text-slate-400'}`}>{title}</p>
                        <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase mt-0.5">{stats.count} Cargoes</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg text-[8px] sm:text-[10px] font-bold ${isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            {isPositive ? '▲' : '▼'} {format(Math.abs(delta))}
                        </div>
                    </div>
                </div>
                <p className={`text-2xl sm:text-3xl font-black ${stats.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'} ${colorClass || ''}`}>
                    {format(stats.pnl)}
                </p>
                <p className="text-[8px] sm:text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-tight">Market: {compareDate}</p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-4 sm:mt-8 pt-4 sm:pt-6 border-t border-slate-50">
                <SubMetric label="Rev" fullLabel="Revenue" value={stats.revenue} baseline={baseline.revenue} format={format} color="text-indigo-600" onClick={() => onDrillDown('Revenue')} />
                <SubMetric label="Cost" fullLabel="Purchase" value={stats.purchase} baseline={baseline.purchase} format={format} color="text-rose-500" invert onClick={() => onDrillDown('Purchase')} />
                <SubMetric label="Misc" fullLabel="Other" value={stats.other} baseline={baseline.other} format={format} color="text-slate-600" onClick={() => onDrillDown('Other')} />
            </div>
        </motion.div>
    );
};

const SubMetric = ({ label, fullLabel, value, baseline, format, color, invert, onClick }: any) => {
    const delta = value - baseline;
    const isImproved = invert ? delta <= 0 : delta >= 0;
    
    return (
        <div className="cursor-pointer group/sub" onClick={(e: React.MouseEvent) => { e.stopPropagation(); onClick(); }}>
            <p className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-0.5 group-hover/sub:text-indigo-600 transition-colors">
                <span className="sm:hidden">{label}</span>
                <span className="hidden sm:inline">{fullLabel}</span>
            </p>
            <p className={`text-[10px] sm:text-xs font-bold ${color}`}>{format(value)}</p>
            <div className={`text-[7px] sm:text-[8px] font-bold mt-0.5 ${isImproved ? 'text-emerald-500' : 'text-rose-400'}`}>
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
            className={`bg-white p-4 sm:p-6 rounded-2xl shadow-sm border transition-all h-full ${isHero ? 'border-indigo-100 ring-1 ring-indigo-50/50' : 'border-slate-100'} ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-1' : ''}`} 
            variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }} 
            onClick={onClick}
        >
          <div className="flex justify-between items-start mb-2">
            <p className={`text-[10px] sm:text-xs font-black uppercase tracking-widest ${isHero ? 'text-indigo-500' : 'text-slate-400'}`}>{title}</p>
            {hint && <span className="text-[8px] sm:text-[9px] font-bold text-slate-300 uppercase bg-slate-100 px-2 py-0.5 rounded-full">{hint}</span>}
          </div>
          <p className={`text-2xl sm:text-3xl font-black ${colorClass}`}>{displayVal}{suffix}</p>
          {delta !== null && (
              <div className="flex items-center gap-1.5 mt-2 text-[8px] sm:text-[10px] font-bold">
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
        <div className={`rounded-xl border p-4 flex flex-col h-full min-h-[120px] ${bgClass}`}>
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-white/50 shrink-0">
                <h4 className={`font-bold text-xs sm:text-sm ${textClass}`}>{title}</h4>
                <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-white/50 ${textClass}`}>{items.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 min-h-0">
                {items.map((p: any) => (
                    <div key={p.id} className="bg-white p-2 sm:p-3 rounded-lg shadow-sm border border-white/50">
                        <div className="font-bold text-[10px] sm:text-xs text-slate-700 leading-tight whitespace-normal break-words">{p.strategyName}</div>
                        <div className="text-[8px] sm:text-[10px] text-slate-500 mt-1">{getGroupName(p.strategyName)}</div>
                    </div>
                ))}
                {items.length === 0 && (
                    <div className="text-[8px] sm:text-[10px] text-slate-400 italic text-center py-4">No records</div>
                )}
            </div>
        </div>
    );
};

const DrillDownTable = ({ profiles, config, onClose, onCargoClick, targetDate, format, baselineDate, editingProfileId }: { profiles: CargoProfile[], config: DrillDownConfig, onClose: () => void, onCargoClick: (p: CargoProfile) => void, targetDate: string, format: (v: number) => string, baselineDate: string, editingProfileId?: string }) => {
    const filtered = useMemo(() => {
        if (config.bucket === 'Total') return profiles;
        return profiles.filter((p: CargoProfile) => p.pnlBucket === (config.bucket as any));
    }, [profiles, config]);

    const getMovementData = (p: CargoProfile) => {
        const pBase = (p.pnlBucket === PnLBucket.Realized) ? p : recalculateProfile(p, true, baselineDate) as CargoProfile;
        const pCurr = (p.pnlBucket === PnLBucket.Realized) ? p : recalculateProfile(p, true, targetDate) as CargoProfile;
        
        const extractValues = (prof: CargoProfile) => {
            let val = 0;
            let price = 0;
            let volume = 0;
            let src = 0;

            if (config.metric === 'PnL') {
                val = prof.finalTotalPnL || 0;
            } else if (config.metric === 'Revenue') {
                val = prof.finalSalesRevenue || 0;
                const volT1 = prof.deliveredVolume || 0;
                const volT2 = prof.isTieredPricing ? (prof.tier2DeliveredVolume || 0) : 0;
                volume = volT1 + volT2;
                price = volume > 0 ? val / volume : 0;
            } else if (config.metric === 'Purchase') {
                const t1 = (prof.loadedVolume || 0) * (prof.absoluteBuyPrice || 0);
                const t2 = prof.isTieredPricing ? (prof.tier2LoadedVolume || 0) * (prof.absoluteTier2BuyPrice || 0) : 0;
                val = (prof.reconciledPurchaseCost > 0) ? prof.reconciledPurchaseCost : (t1 + t2);
                volume = (prof.loadedVolume || 0) + (prof.isTieredPricing ? (prof.tier2LoadedVolume || 0) : 0);
                price = volume > 0 ? val / volume : 0;
            } else if (config.metric === 'Other') {
                const revenue = prof.finalSalesRevenue || 0;
                const t1 = (prof.loadedVolume || 0) * (prof.absoluteBuyPrice || 0);
                const t2 = prof.isTieredPricing ? (prof.tier2LoadedVolume || 0) * (prof.absoluteTier2BuyPrice || 0) : 0;
                const purchase = (prof.reconciledPurchaseCost > 0) ? prof.reconciledPurchaseCost : (t1 + t2);
                val = (prof.finalTotalPnL || 0) - revenue + purchase;
                src = prof.reconciledSrcCost || ((prof.incoterms === 'DES') ? (prof.srcUnitFee || 0) * ((prof.deliveredVolume || 0) + (prof.tier2DeliveredVolume || 0)) : 0);
            } else if (config.metric === 'Volume') {
                val = prof.deliveredVolume || 0;
                volume = val;
            }
            return { val, price, volume, src };
        };
        
        const curr = extractValues(pCurr);
        const base = extractValues(pBase);
        
        return { 
            curr, 
            base, 
            delta: curr.val - base.val 
        };
    };

    const headerLabel = `${config.bucket} ${config.metric}`;

    return (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-none sm:rounded-2xl shadow-2xl w-full max-w-5xl h-full sm:max-h-[80vh] flex flex-col overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div>
                    <h3 className="text-base sm:text-xl font-black text-slate-800 uppercase tracking-tight">{headerLabel} Analysis</h3>
                    <p className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase mt-1">Movement vs {baselineDate}</p>
                </div>
                <button onClick={onClose} className="p-2 bg-slate-50 text-slate-400 hover:text-rose-500 rounded-full transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 sm:p-4 custom-scrollbar bg-slate-50/30">
                <div className="sm:hidden space-y-3">
                  {filtered.map((p: CargoProfile) => {
                    const { curr, base, delta } = getMovementData(p);
                    const isPositive = delta >= 0;
                    return (
                      <div key={p.id} onClick={() => onCargoClick(p)} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm space-y-2">
                        <div className="flex justify-between items-start">
                          <div className="min-w-0">
                            <h4 className="font-bold text-xs truncate">{p.strategyName}</h4>
                            <p className="text-[9px] text-slate-400 font-black uppercase">{getGroupName(p.strategyName)}</p>
                          </div>
                          <div className="text-right">
                             <div className={`text-xs font-bold ${delta > 0.01 ? 'text-emerald-500' : delta < -0.01 ? 'text-rose-500' : 'text-slate-400'}`}>
                                {Math.abs(delta) > 0.01 ? `${isPositive ? '▲' : '▼'} ${format(Math.abs(delta))}` : '—'}
                             </div>
                          </div>
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                           <span className="text-slate-500">{config.metric === 'Volume' ? 'Volume' : 'Current P&L'}</span>
                           <span className="font-mono font-bold">{config.metric === 'Volume' ? curr.val.toLocaleString() : format(curr.val)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <table className="hidden sm:table w-full text-sm text-left border-separate border-spacing-y-2">
                    <thead className="text-[10px] text-slate-400 uppercase font-black bg-white sticky top-0">
                        <tr>
                            <th className="px-6 py-4">Strategy & Leg Details</th>
                            <th className="px-6 py-4">Group</th>
                            {(config.metric === 'Purchase' || config.metric === 'Revenue') && (
                                <>
                                    <th className="px-6 py-4 text-right">Avg Unit Price</th>
                                    <th className="px-6 py-4 text-right">Physical Volume</th>
                                </>
                            )}
                            {config.metric === 'Other' && (
                                <th className="px-6 py-4 text-right">SRC Value</th>
                            )}
                            <th className="px-6 py-4 text-right">Line Total</th>
                            <th className="px-6 py-4 text-right">PnL Variance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr><td colSpan={6} className="py-20 text-center text-slate-400 italic">No records found.</td></tr>
                        ) : filtered.map((p: CargoProfile) => {
                            const { curr, base, delta } = getMovementData(p);
                            const isPositive = delta >= 0;
                            const isEditing = p.id === editingProfileId;

                            return (
                                <tr 
                                    key={p.id} 
                                    className={`group transition-all rounded-xl border ${isEditing ? 'bg-indigo-50 border-indigo-200 ring-2 ring-indigo-500 ring-inset shadow-lg' : 'bg-white border-slate-100 hover:shadow-md'}`}
                                >
                                    <td 
                                        className={`px-6 py-4 font-bold rounded-l-xl cursor-pointer transition-colors ${isEditing ? 'text-indigo-800' : 'text-slate-700 hover:text-indigo-600'}`}
                                        onClick={() => onCargoClick(p)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <motion.div 
                                                animate={isEditing ? { scale: [1, 1.1, 1], opacity: [1, 0.8, 1] } : {}}
                                                transition={{ repeat: Infinity, duration: 2 }}
                                            >
                                                {p.strategyName}
                                            </motion.div>
                                            {isEditing ? (
                                                <span className="px-2 py-0.5 bg-indigo-600 text-white text-[9px] font-black rounded-full uppercase tracking-tighter animate-pulse">Editing</span>
                                            ) : (
                                                <svg className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                            )}
                                        </div>
                                        <div className={`text-[9px] uppercase font-black mt-0.5 ${isEditing ? 'text-indigo-400' : 'text-slate-400'}`}>
                                            {config.metric === 'Purchase' ? `BUY: ${p.source}` : config.metric === 'Revenue' ? `SELL: ${p.buyer}` : `${p.source} → ${p.buyer}`}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${isEditing ? 'bg-indigo-200 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{getGroupName(p.strategyName)}</span>
                                    </td>
                                    
                                    {(config.metric === 'Purchase' || config.metric === 'Revenue') && (
                                        <>
                                            <td className="px-6 py-4 text-right font-mono">
                                                <div className="text-slate-700 font-bold">${curr.price.toFixed(3)}</div>
                                                {Math.abs(curr.price - base.price) > 0.0001 && (
                                                    <div className={`text-[9px] font-bold ${curr.price >= base.price ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                        {curr.price >= base.price ? '▲' : '▼'} ${Math.abs(curr.price - base.price).toFixed(3)}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono">
                                                <div className="text-slate-700">{curr.volume.toLocaleString()}</div>
                                                {Math.abs(curr.volume - base.volume) > 0.1 && (
                                                    <div className={`text-[9px] font-bold ${curr.volume >= base.volume ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                        {curr.volume >= base.volume ? '+' : '-'}{Math.abs(curr.volume - base.volume).toLocaleString()}
                                                    </div>
                                                )}
                                            </td>
                                        </>
                                    )}

                                    {config.metric === 'Other' && (
                                        <td className="px-6 py-4 text-right font-mono">
                                            <div className="text-slate-700 font-bold">{format(curr.src)}</div>
                                            {Math.abs(curr.src - base.src) > 1 && (
                                                <div className={`text-[9px] font-bold ${curr.src <= base.src ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                    {curr.src <= base.src ? '▼' : '▲'} {format(Math.abs(curr.src - base.src))}
                                                </div>
                                            )}
                                        </td>
                                    )}

                                    <td className={`px-6 py-4 text-right font-mono font-bold ${config.metric === 'Volume' ? (isEditing ? 'text-indigo-700' : 'text-slate-700') : (curr.val >= 0 ? 'text-emerald-600' : 'text-rose-600')}`}>
                                        {config.metric === 'Volume' ? curr.val.toLocaleString() : format(curr.val)}
                                    </td>
                                    <td className={`px-6 py-4 text-right font-mono font-bold rounded-r-xl ${delta > 0.01 ? 'text-emerald-500' : delta < -0.01 ? 'text-rose-500' : 'text-slate-300'}`}>
                                        {Math.abs(delta) > 0.01 ? `${isPositive ? '+' : '-'}${config.metric === 'Volume' ? Math.abs(delta).toLocaleString() : format(Math.abs(delta))}` : '—'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </motion.div>
    );
};
