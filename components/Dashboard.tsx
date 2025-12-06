import React, { useMemo, useState } from 'react';
import { CargoProfile, PnLBucket } from '../types';
import { ForwardCurveRow, detectUnit, getExposureChartData } from '../services/calculationService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line, Legend } from 'recharts';
import { motion } from 'framer-motion';
import { WorldMap } from './WorldMap';
import { PnLBreakdown } from './PnLBreakdown';

interface DashboardProps {
  profiles: CargoProfile[];
  marketData: Record<string, number>;
  forwardCurve: ForwardCurveRow[];
  onRefreshMarket: () => void;
  onCargoClick?: (profile: CargoProfile) => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];
const GAS_INDICES = ['HH', 'TTF', 'JKM', 'NBP', 'AECO', 'STN 2'];
const OIL_INDICES = ['Dated Brent', 'JCC', 'BRIPE'];
const LINE_COLORS: Record<string, string> = {
    'HH': '#f59e0b',       // Amber
    'TTF': '#3b82f6',      // Blue
    'JKM': '#10b981',      // Emerald
    'NBP': '#8b5cf6',      // Violet
    'AECO': '#64748b',     // Slate
    'Dated Brent': '#ef4444', // Red
    'JCC': '#f97316',      // Orange
    'BRIPE': '#ec4899',    // Pink
    'STN 2': '#06b6d4',    // Cyan
    'Oil': '#ef4444',      // Generic Oil
    'Other': '#94a3b8'     // Gray
};

const ShipIcon = ({ className, flip = false }: { className?: string, flip?: boolean }) => (
    <svg 
        viewBox="0 0 24 24" 
        fill="currentColor" 
        className={`${className} ${flip ? '-scale-x-100' : ''}`}
    >
        {/* Hull */}
        <path d="M2 14.5L4.5 20H19.5L22 14.5H2Z" fillOpacity="0.8" />
        {/* Containers */}
        <rect x="5" y="9" width="4" height="5" rx="1" className="text-blue-400" fill="currentColor"/>
        <rect x="10" y="8" width="4" height="6" rx="1" className="text-red-400" fill="currentColor"/>
        <rect x="15" y="10" width="4" height="4" rx="1" className="text-amber-400" fill="currentColor"/>
        {/* Bridge */}
        <path d="M19 14V11L21 12V14H19Z" fillOpacity="0.6"/>
        <path d="M4 20L20 20" stroke="white" strokeWidth="1" strokeLinecap="round" className="opacity-30"/>
    </svg>
);

export const Dashboard: React.FC<DashboardProps> = ({ profiles, forwardCurve, onCargoClick }) => {
  const [curveView, setCurveView] = useState<'gas' | 'oil'>('gas');

  const stats = useMemo(() => {
    let totalPnL = 0;
    let totalVolume = 0;
    let realizedPnL = 0;
    let unrealizedPnL = 0;

    profiles.forEach(p => {
      totalPnL += (p.finalTotalPnL || 0);
      totalVolume += (p.deliveredVolume || 0);
      if (p.pnlBucket === PnLBucket.Realized) realizedPnL += (p.finalTotalPnL || 0);
      if (p.pnlBucket === PnLBucket.Unrealized) unrealizedPnL += (p.finalTotalPnL || 0);
    });

    return { totalPnL, totalVolume, realizedPnL, unrealizedPnL };
  }, [profiles]);

  const strategyData = useMemo(() => {
    const map = new Map<string, number>();
    profiles.forEach(p => {
      const name = p.strategyName || 'Unknown';
      const val = map.get(name) || 0;
      map.set(name, val + (p.finalTotalPnL || 0));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [profiles]);
  
  const exposureData = useMemo(() => getExposureChartData(profiles), [profiles]);

  // Logic for Upcoming Timeline
  const timelineEvents = useMemo(() => {
      const today = new Date();
      today.setHours(0,0,0,0);
      
      const events: Array<{
          id: string;
          date: Date;
          dateStr: string;
          type: 'Loading' | 'Delivery';
          title: string;
          subtitle: string;
          volume: number;
          unit: string;
          isPast: boolean;
          status: 'Scheduled' | 'Overdue' | 'Done';
          profile: CargoProfile;
      }> = [];

      profiles.forEach(p => {
          const unit = detectUnit(p.sellFormula || p.buyFormula);
          const isRealized = p.pnlBucket === PnLBucket.Realized;
          
          const processDate = (dateString: string, type: 'Loading' | 'Delivery') => {
              if (!dateString) return;
              const d = new Date(dateString);
              // Normalize time to compare dates only
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
                      isPast,
                      status: isPast ? 'Overdue' : 'Scheduled',
                      profile: p
                  });
              }
          };

          if (p.loadingDate) processDate(p.loadingDate, 'Loading');
          if (p.deliveryDate) processDate(p.deliveryDate, 'Delivery');
      });

      return events.sort((a, b) => {
          if (a.status === 'Overdue' && b.status !== 'Overdue') return -1;
          if (a.status !== 'Overdue' && b.status === 'Overdue') return 1;
          return a.date.getTime() - b.date.getTime();
      }).slice(0, 10);
  }, [profiles]);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  const chartIndices = curveView === 'gas' ? GAS_INDICES : OIL_INDICES;

  const getDaysDiffLabel = (date: Date) => {
      const today = new Date();
      today.setHours(0,0,0,0);
      const target = new Date(date);
      target.setHours(0,0,0,0);
      const diffTime = target.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Tomorrow';
      if (diffDays > 0) return `in ${diffDays} days`;
      return `${Math.abs(diffDays)} days ago`;
  };

  return (
    <motion.div 
        className="space-y-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
    >
      {/* Top Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Total Net P&L" value={stats.totalPnL} format={formatCurrency} colorClass={stats.totalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
        <StatCard title="Total Volume" value={stats.totalVolume.toLocaleString()} suffix=" Vol" colorClass="text-slate-800" />
        <StatCard title="Realized P&L" value={stats.realizedPnL} format={formatCurrency} colorClass="text-blue-600" />
        <StatCard title="Unrealized P&L" value={stats.unrealizedPnL} format={formatCurrency} colorClass="text-amber-600" />
      </div>

      {/* Global Map View */}
      <motion.div variants={itemVariants} className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Global Active Cargos
                </h3>
          </div>
          <WorldMap profiles={profiles.filter(p => p.pnlBucket === PnLBucket.Unrealized)} height={350} />
      </motion.div>

      {/* Row 2: Forward Curve & Logistics Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Forward Curve Chart (Hero) */}
          <motion.div variants={itemVariants} className="lg:col-span-2 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-col h-[500px]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
                        Forward Curve
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">Projected market prices over time</p>
                </div>
                <div className="flex bg-slate-200 p-1 rounded-lg">
                    <button 
                        onClick={() => setCurveView('gas')} 
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${curveView === 'gas' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Gas Indices
                    </button>
                    <button 
                        onClick={() => setCurveView('oil')} 
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${curveView === 'oil' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Oil Indices
                    </button>
                </div>
            </div>
            
            <div className="flex-1 p-4">
                {forwardCurve.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={forwardCurve} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} />
                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} domain={['auto', 'auto']} />
                            <Tooltip 
                                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                itemStyle={{ fontSize: '12px', fontWeight: 600 }}
                            />
                            <Legend verticalAlign="top" iconType="circle" wrapperStyle={{ paddingBottom: '20px', fontSize: '12px' }}/>
                            {chartIndices.map(idx => (
                                <Line 
                                    key={idx}
                                    type="monotone" 
                                    dataKey={`prices.${idx}`} 
                                    name={idx}
                                    stroke={LINE_COLORS[idx] || '#cbd5e1'} 
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 6 }}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <svg className="w-16 h-16 mb-4 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <p className="font-medium">No Forward Curve Data</p>
                        <p className="text-sm mt-1">Click "Forward Curve" in the sidebar to upload.</p>
                    </div>
                )}
            </div>
          </motion.div>

          {/* Upcoming Schedule Widget */}
          <motion.div variants={itemVariants} className="lg:col-span-1 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-col h-[500px]">
             <div className="p-5 border-b border-slate-100 bg-slate-50/50 z-10 relative">
                 <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Cargo Timeline
                 </h3>
                 <p className="text-xs text-slate-500 mt-1">Operational movements & alerts</p>
             </div>
             
             {/* Timeline Content */}
             <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/30 relative">
                 <div className="absolute left-[30px] top-0 bottom-0 w-[4px] bg-gradient-to-b from-blue-100 via-blue-200 to-blue-50 z-0"></div>

                 <div className="p-4 space-y-6 relative z-10">
                    {timelineEvents.length === 0 ? (
                        <div className="flex flex-col items-center justify-center pt-20 text-slate-400">
                             <p className="text-sm">No scheduled cargoes.</p>
                        </div>
                    ) : (
                        timelineEvents.map((evt, idx) => {
                            const isLoad = evt.type === 'Loading';
                            const isOverdue = evt.status === 'Overdue';
                            const daysLabel = getDaysDiffLabel(evt.date);
                            
                            return (
                                <div 
                                    key={evt.id} 
                                    className="relative flex items-center gap-4 group cursor-pointer"
                                    onClick={() => onCargoClick && onCargoClick(evt.profile)}
                                >
                                    <div className="relative shrink-0 w-[60px] h-[60px] flex items-center justify-center">
                                        <motion.div
                                            animate={{ y: [0, -3, 0] }}
                                            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut", delay: idx * 0.5 }}
                                            className="relative z-10 drop-shadow-md"
                                        >
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 bg-white ${
                                                isOverdue ? 'border-rose-400 text-rose-500' : 
                                                isLoad ? 'border-blue-400 text-blue-500' : 'border-purple-400 text-purple-500'
                                            }`}>
                                                <ShipIcon className="w-6 h-6" flip={!isLoad} />
                                            </div>
                                        </motion.div>
                                        <div className="absolute left-1/2 top-1/2 w-4 h-[2px] bg-slate-200 -translate-y-1/2 -z-10 -translate-x-full"></div>
                                    </div>

                                    <div className={`flex-1 rounded-xl p-3 border shadow-sm transition-all hover:shadow-md ${
                                        isOverdue 
                                            ? 'bg-rose-50 border-rose-200 ring-1 ring-rose-100' 
                                            : 'bg-white border-slate-100 hover:border-blue-300'
                                    }`}>
                                        <div className="flex justify-between items-start mb-1">
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                                isOverdue ? 'bg-rose-200 text-rose-700' : 'bg-slate-100 text-slate-500'
                                            }`}>
                                                {isOverdue ? 'Action Needed' : daysLabel}
                                            </span>
                                            <span className="text-xs font-mono text-slate-400">{evt.dateStr}</span>
                                        </div>
                                        
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className={`text-sm font-bold ${
                                                isOverdue ? 'text-rose-800' : isLoad ? 'text-blue-700' : 'text-purple-700'
                                            }`}>
                                                {evt.title}
                                            </h4>
                                        </div>
                                        <div className="text-xs text-slate-500 truncate" title={evt.subtitle}>{evt.subtitle}</div>
                                        <div className="mt-2 pt-2 border-t border-slate-100/50 flex justify-between items-center">
                                            <span className="text-xs font-semibold text-slate-700">
                                                {evt.volume.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">{evt.unit}</span>
                                            </span>
                                            {isOverdue && (
                                                <span className="text-[10px] text-rose-500 font-medium flex items-center gap-1">
                                                    Pending Actualization
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                 </div>
             </div>
          </motion.div>
      </div>

      {/* Row 3: Exposure & P&L Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* New Exposure Chart */}
        <motion.div variants={itemVariants} className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-100 h-[350px] overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                        Volume Exposure Profile
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">Open volume vs. Pricing Month</p>
                </div>
            </div>
            <div className="p-4 h-[280px]">
                {exposureData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={exposureData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} tickFormatter={(val) => `${val/1000}k`} label={{ value: 'MMBtu', angle: -90, position: 'insideLeft', style: { fill: '#94a3b8', fontSize: 10 } }} />
                            <Tooltip 
                                cursor={{fill: '#f8fafc'}}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                                formatter={(value: number) => [value.toLocaleString(), 'MMBtu']}
                            />
                            <Legend verticalAlign="top" iconType="circle" wrapperStyle={{ paddingBottom: '20px', fontSize: '12px' }}/>
                            {['HH', 'TTF', 'JKM', 'NBP', 'Oil', 'Other'].map(key => (
                                <Bar key={key} dataKey={key} stackId="a" fill={LINE_COLORS[key] || '#94a3b8'} barSize={40} />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                     <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <p className="font-medium">No Open Exposure</p>
                        <p className="text-sm mt-1">All cargoes are realized or pricing is fixed.</p>
                    </div>
                )}
            </div>
        </motion.div>

        {/* Strategy P&L Chart */}
        <motion.div variants={itemVariants} className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-[350px]">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">P&L by Strategy</h3>
            <ResponsiveContainer width="100%" height="100%">
            <BarChart data={strategyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} tickFormatter={(val) => `$${val/1000}k`} />
                <Tooltip 
                cursor={{fill: '#f8fafc'}}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                formatter={(value: number) => [formatCurrency(value), 'Net P&L']}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} animationDuration={1000}>
                {strategyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.value >= 0 ? '#10b981' : '#f43f5e'} />
                ))}
                </Bar>
            </BarChart>
            </ResponsiveContainer>
        </motion.div>

        {/* Buyer Distribution */}
        <motion.div variants={itemVariants} className="lg:col-span-1 bg-white p-5 rounded-xl shadow-sm border border-slate-100 h-[350px] flex flex-col justify-center">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-2 text-center">Buyer Distribution</h3>
            <ResponsiveContainer width="100%" height="100%">
            <PieChart>
                <Pie
                data={profiles as any[]}
                dataKey="deliveredVolume"
                nameKey="buyer"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={5}
                >
                {profiles.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                ))}
                </Pie>
                <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '8px', fontSize: '12px' }}
                    formatter={(value: number) => [`${value.toLocaleString()} Vol`, '']}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{fontSize: '11px'}} />
            </PieChart>
            </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Row 4: Detailed P&L Breakdown */}
      <motion.div variants={itemVariants}>
          <PnLBreakdown profiles={profiles} />
      </motion.div>

    </motion.div>
  );
};

const StatCard = ({ title, value, format, suffix, colorClass }: any) => (
    <motion.div 
        className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow"
        variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
    >
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</p>
      <p className={`text-2xl font-bold mt-2 ${colorClass}`}>
        {format ? format(value) : value}{suffix}
      </p>
    </motion.div>
);