import React, { useMemo, useState } from 'react';
import { CargoProfile, PnLBucket } from '../types';
import { ForwardCurveRow } from '../services/calculationService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line, Legend } from 'recharts';
import { motion } from 'framer-motion';

interface DashboardProps {
  profiles: CargoProfile[];
  marketData: Record<string, number>;
  forwardCurve: ForwardCurveRow[];
  onRefreshMarket: () => void;
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
};

export const Dashboard: React.FC<DashboardProps> = ({ profiles, forwardCurve }) => {
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

      {/* Forward Curve Chart (Hero) - Full Width */}
      <motion.div variants={itemVariants} className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-col h-[450px]">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                data={profiles}
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