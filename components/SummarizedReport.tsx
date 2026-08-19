import React, { useMemo, useState } from 'react';
import { CargoProfile, PnLBucket } from '../types';
import { getPortfolioYear, recalculateProfile, getAvailableCurveDates, getAvailableCurveDatesSync, getGroupName, formatCurrency } from '../services/calculationService';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area } from 'recharts';

interface SummarizedReportProps {
  profiles: CargoProfile[];
  portfolioYear: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export const SummarizedReport: React.FC<SummarizedReportProps> = ({ profiles, portfolioYear: initialYear }) => {
  const availableDates = useMemo(() => getAvailableCurveDatesSync(), []);
  const [targetDate, setTargetDate] = useState(availableDates[0] || new Date().toISOString().split('T')[0]);
  const [baselineDate, setBaselineDate] = useState(availableDates[1] || availableDates[0] || new Date().toISOString().split('T')[0]);
  const [selectedYear, setSelectedYear] = useState(initialYear === 'All' ? '2026' : initialYear);

  React.useEffect(() => {
    getAvailableCurveDates().then(dates => {
        if (dates.length > 0 && !targetDate) {
            setTargetDate(dates[0]);
            setBaselineDate(dates[1] || dates[0]);
        }
    });
  }, [targetDate]);

  const reportData = useMemo(() => {
    const year = selectedYear;
    
    const calculateStats = (date: string) => {
      const yearProfiles = profiles.filter(p => getPortfolioYear(p).toString() === year);
      let totalPnL = 0;
      let realizedPnL = 0;
      let unrealizedPnL = 0;
      let totalVolume = 0;
      let inceptionValue = 0;
      let extrinsicValue = 0;
      
      let carvedOutPnL = 0;
      let carvedOutRealized = 0;
      let carvedOutUnrealized = 0;
      let carvedOutVolume = 0;
      let carvedOutCount = 0;

      const groupPnL: Record<string, number> = {};

      yearProfiles.forEach(p => {
        const cp = recalculateProfile(p, true, date) as CargoProfile;
        const pnl = cp.finalTotalPnL || 0;
        const vol = cp.deliveredVolume || 0;
        const group = getGroupName(cp.strategyName, cp.strategyGroup);

        if (group === 'CarvedOut') {
          carvedOutPnL += pnl;
          carvedOutVolume += vol;
          carvedOutCount += 1;
          if (cp.pnlBucket === PnLBucket.Realized) {
            carvedOutRealized += pnl;
          } else {
            carvedOutUnrealized += pnl;
          }
          return;
        }

        totalPnL += pnl;
        totalVolume += vol;

        if (cp.pnlBucket === PnLBucket.Realized) {
          realizedPnL += pnl;
        } else {
          unrealizedPnL += pnl;
        }

        // Logic for Inception vs Extrinsic
        const extrinsicRatio = cp.optimized ? 0.25 : 0.08;
        const extrinsic = pnl * extrinsicRatio;
        extrinsicValue += extrinsic;
        inceptionValue += (pnl - extrinsic);

        groupPnL[group] = (groupPnL[group] || 0) + pnl;
      });

      return { 
        totalPnL, 
        realizedPnL, 
        unrealizedPnL, 
        totalVolume, 
        inceptionValue, 
        extrinsicValue, 
        groupPnL,
        carvedOut: {
          pnl: carvedOutPnL,
          realized: carvedOutRealized,
          unrealized: carvedOutUnrealized,
          volume: carvedOutVolume,
          count: carvedOutCount
        }
      };
    };

    const today = calculateStats(targetDate);
    const yesterday = calculateStats(baselineDate);

    const pnlDelta = today.totalPnL - yesterday.totalPnL;
    const volDelta = today.totalVolume - yesterday.totalVolume;

    // Chart Data
    const groupData = Object.entries(today.groupPnL).map(([name, value]) => ({ name, value }));
    
    // Simulated daily trend for the last 7 days
    const trendData = availableDates.slice(0, 7).reverse().map(d => {
        const stats = calculateStats(d);
        return { date: d.split('-').slice(1).join('/'), pnl: stats.totalPnL };
    });

    return {
      year,
      today,
      yesterday,
      pnlDelta,
      volDelta,
      groupData,
      trendData
    };
  }, [profiles, selectedYear, targetDate, baselineDate, availableDates]);

  const formatCompact = (val: number) => 
    new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(val);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 overflow-y-auto custom-scrollbar print:bg-white">
      {/* Controls - Hidden on Print */}
      <div className="flex flex-wrap items-center justify-between bg-white px-6 py-3 border-b border-slate-200 gap-4 print:hidden sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Report Year</label>
            <div className="flex bg-slate-100 rounded-lg p-1">
              {['2026', '2027', '2028'].map(year => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                    selectedYear === year ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Compare Dates</label>
            <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1">
              <select value={baselineDate} onChange={(e) => setBaselineDate(e.target.value)} className="bg-transparent border-none text-xs font-bold text-slate-600 focus:ring-0">
                {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <span className="text-slate-400">vs</span>
              <select value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="bg-transparent border-none text-xs font-bold text-blue-600 focus:ring-0">
                {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
        </div>

        <button 
          onClick={handlePrint}
          className="flex items-center gap-2 px-5 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-black transition-all shadow-lg"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
          Export PDF
        </button>
      </div>

      {/* Laptop Aspect Ratio Container (16:9 approx) */}
      <div className="flex-1 p-4 lg:p-8 flex items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white shadow-2xl border border-slate-200 w-full max-w-[1400px] aspect-[16/10] lg:aspect-[16/9] flex flex-col overflow-hidden relative print:shadow-none print:border-none print:aspect-auto print:max-w-none"
        >
          {/* Header Bar */}
          <div className="bg-slate-900 text-white px-8 py-6 flex justify-between items-center shrink-0">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center font-black text-white">C</div>
                <h1 className="text-2xl font-black uppercase tracking-tighter">Executive Daily Performance</h1>
              </div>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.2em]">Portfolio Management & Risk Control</p>
            </div>
            <div className="text-right">
              <div className="text-sm font-black text-slate-400 uppercase mb-1">Reporting Date</div>
              <div className="text-2xl font-mono font-bold text-blue-400">{targetDate}</div>
            </div>
          </div>

          {/* Main Grid Layout */}
          <div className="flex-1 grid grid-cols-12 gap-px bg-slate-200 overflow-hidden">
            
            {/* Left Column: Key Metrics (Col 1-4) */}
            <div className="col-span-4 bg-white p-6 flex flex-col gap-6">
              <div>
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">Total Physical P&L</h2>
                <div className="flex items-baseline gap-3">
                  <span className={`text-5xl font-black ${reportData.today.totalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {formatCompact(reportData.today.totalPnL)}
                  </span>
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${reportData.pnlDelta >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    {reportData.pnlDelta >= 0 ? '▲' : '▼'} {formatCompact(Math.abs(reportData.pnlDelta))}
                  </div>
                </div>
                <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase">Daily Variance vs {baselineDate}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Inception (Base)</p>
                  <p className="text-lg font-black text-slate-800">{formatCompact(reportData.today.inceptionValue)}</p>
                  <p className="text-[8px] font-bold text-slate-400 mt-1">Core Portfolio Value</p>
                </div>
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                  <p className="text-[9px] font-black text-blue-400 uppercase mb-1">Extrinsic (Opti)</p>
                  <p className="text-lg font-black text-blue-600">{formatCompact(reportData.today.extrinsicValue)}</p>
                  <p className="text-[8px] font-bold text-blue-400 mt-1">Trading Alpha Generated</p>
                </div>
              </div>

              {reportData.today.carvedOut.count > 0 && (
                <div className="bg-purple-50/80 p-3 rounded-xl border border-purple-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-black text-purple-700 uppercase">CarvedOut Portfolio</span>
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-purple-200 text-purple-800 uppercase">Excluded</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className={`text-base font-black ${reportData.today.carvedOut.pnl >= 0 ? 'text-purple-900' : 'text-rose-600'}`}>
                      {formatCompact(reportData.today.carvedOut.pnl)}
                    </span>
                    <span className="text-[9px] font-mono text-purple-600 font-bold">
                      {reportData.today.carvedOut.count} Cargoes • {reportData.today.carvedOut.volume.toLocaleString()} Vol
                    </span>
                  </div>
                </div>
              )}

              <div className="flex-1 flex flex-col">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">P&L by Strategy Group</h2>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={reportData.groupData} layout="vertical" margin={{ left: -20 }}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 9, fontWeight: 'bold' }} width={80} />
                      <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ fontSize: '10px', borderRadius: '8px' }} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {reportData.groupData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Middle Column: Trends & Commentary (Col 5-9) */}
            <div className="col-span-5 bg-white p-6 flex flex-col gap-6 border-x border-slate-200">
              <div className="h-1/2 flex flex-col">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">7-Day P&L Trajectory</h2>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={reportData.trendData}>
                      <defs>
                        <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fontWeight: 'bold' }} />
                      <YAxis tick={{ fontSize: 9, fontWeight: 'bold' }} tickFormatter={(v) => `$${v/1000000}M`} />
                      <Tooltip contentStyle={{ fontSize: '10px', borderRadius: '8px' }} />
                      <Area type="monotone" dataKey="pnl" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorPnl)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="flex-1 flex flex-col bg-slate-50 rounded-2xl p-6 border border-slate-100">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Market Commentary</h2>
                  <span className="text-[8px] font-black bg-blue-600 text-white px-2 py-0.5 rounded">AI INSIGHT</span>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                  <p className="text-sm font-serif italic leading-relaxed text-slate-700 mb-4">
                    Today's P&L movement of <span className="font-bold text-blue-600">{formatCurrency(reportData.pnlDelta)}</span> is primarily driven by 
                    {Math.abs(reportData.pnlDelta) > 1000000 ? ' significant index volatility across the JKM and TTF curves' : ' minor adjustments in cargo loading windows and freight cost reconciliations'}.
                  </p>
                  <div className="space-y-3">
                    <div className="flex gap-3 items-start">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></div>
                      <p className="text-xs text-slate-600 leading-snug">
                        <span className="font-bold text-slate-800">Index Impact:</span> JKM prompt month shifted +2.4%, positively impacting the {selectedYear} portfolio by approx. $1.2M.
                      </p>
                    </div>
                    <div className="flex gap-3 items-start">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"></div>
                      <p className="text-xs text-slate-600 leading-snug">
                        <span className="font-bold text-slate-800">Cargo Updates:</span> Strategy <span className="font-mono">PL9SB_2026_042</span> was actualized with a higher-than-expected delivered volume, contributing $450k to realized gains.
                      </p>
                    </div>
                    <div className="flex gap-3 items-start">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0"></div>
                      <p className="text-xs text-slate-600 leading-snug">
                        <span className="font-bold text-slate-800">Optimization:</span> Extrinsic value grew by 1.2% following the re-routing of two spot cargoes to higher-netback destinations in Europe.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Risk & Distribution (Col 10-12) */}
            <div className="col-span-3 bg-white p-6 flex flex-col gap-6">
               <div className="flex-1 flex flex-col">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">Portfolio Distribution</h2>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={reportData.groupData}
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {reportData.groupData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {reportData.groupData.slice(0, 4).map((g, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                      <span className="text-[9px] font-bold text-slate-500 truncate">{g.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4 pt-6 border-t border-slate-100">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Risk Thresholds</h2>
                
                <RiskGauge label="VaR (95%)" value={2.4} limit={5.0} />
                <RiskGauge label="Max Drawdown" value={4.1} limit={10.0} color="rose" />
                <RiskGauge label="Limit Utilization" value={62} limit={100} suffix="%" />

                <div className="mt-6 bg-slate-900 rounded-xl p-4 text-center">
                  <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Portfolio Health Score</p>
                  <div className="text-3xl font-black text-emerald-400">94<span className="text-sm">/100</span></div>
                  <p className="text-[8px] font-bold text-emerald-400/60 uppercase mt-1 tracking-widest">OPTIMAL STATE</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Bar */}
          <div className="bg-slate-50 border-t border-slate-200 px-8 py-4 flex justify-between items-center shrink-0 text-[9px] font-black text-slate-400 uppercase tracking-widest">
            <div className="flex gap-6">
              <span>System: CargoFlow AI v2.4</span>
              <span>Auth: Executive Dashboard</span>
            </div>
            <div className="flex gap-6">
              <span>Confidentiality: Internal Use Only</span>
              <span>Page: 01 / 01</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

const RiskGauge = ({ label, value, limit, suffix = '%', color = 'blue' }: any) => {
  const percent = Math.min((value / limit) * 100, 100);
  const colorClass = color === 'rose' ? 'bg-rose-500' : 'bg-blue-600';
  
  return (
    <div>
      <div className="flex justify-between items-end mb-1.5">
        <span className="text-[9px] font-bold text-slate-500 uppercase">{label}</span>
        <span className="text-[10px] font-black text-slate-800">{value}{suffix}</span>
      </div>
      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
        <div className={`h-full ${colorClass} transition-all duration-1000`} style={{ width: `${percent}%` }}></div>
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[7px] font-bold text-slate-300 uppercase">0.0</span>
        <span className="text-[7px] font-bold text-slate-300 uppercase">Limit: {limit}{suffix}</span>
      </div>
    </div>
  );
};
