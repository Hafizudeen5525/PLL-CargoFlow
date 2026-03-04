
import React, { useState, useMemo } from 'react';
import { CargoProfile, PnLBucket } from '../types';
import { motion } from 'framer-motion';

interface PnLBreakdownProps {
    profiles: CargoProfile[];
}

export const PnLBreakdown: React.FC<PnLBreakdownProps> = ({ profiles }) => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [bucketFilter, setBucketFilter] = useState<'All' | 'Realized' | 'Unrealized'>('All');
    const [sortKey, setSortKey] = useState<keyof CargoProfile>('finalTotalPnL');
    const [sortDesc, setSortDesc] = useState(true);

    // Filter Logic
    const filteredData = useMemo(() => {
        return profiles.filter(p => {
            // 1. Bucket Filter
            if (bucketFilter !== 'All' && p.pnlBucket !== bucketFilter) return false;

            // 2. Date Filter (using Delivery Date)
            if (startDate && (!p.deliveryDate || p.deliveryDate < startDate)) return false;
            if (endDate && (!p.deliveryDate || p.deliveryDate > endDate)) return false;

            return true;
        });
    }, [profiles, startDate, endDate, bucketFilter]);

    // Sort Logic
    const sortedData = useMemo(() => {
        return [...filteredData].sort((a, b) => {
            const valA = a[sortKey] || 0;
            const valB = b[sortKey] || 0;
            if (valA === valB) return 0;
            return sortDesc ? (valA > valB ? -1 : 1) : (valA > valB ? 1 : -1);
        });
    }, [filteredData, sortKey, sortDesc]);

    // Summary Stats for Filtered Data
    const stats = useMemo(() => {
        return filteredData.reduce((acc, curr) => ({
            revenue: acc.revenue + (curr.finalSalesRevenue || 0),
            cost: acc.cost + (curr.finalTotalCost || 0),
            pnl: acc.pnl + (curr.finalTotalPnL || 0),
            maxPnl: Math.max(acc.maxPnl, Math.abs(curr.finalTotalPnL || 0)) // For visual bars
        }), { revenue: 0, cost: 0, pnl: 0, maxPnl: 0 });
    }, [filteredData]);

    const formatCurrency = (val: number) => 
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

    const handleSort = (key: keyof CargoProfile) => {
        if (sortKey === key) setSortDesc(!sortDesc);
        else {
            setSortKey(key);
            setSortDesc(true);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span>
                        Detailed P&L Breakdown
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">Analyze financial performance by specific periods and buckets.</p>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Range</span>
                        <input 
                            type="date" 
                            value={startDate} 
                            onChange={e => setStartDate(e.target.value)}
                            className="text-xs border-none p-0 focus:ring-0 text-slate-600 w-24"
                        />
                        <span className="text-slate-300">-</span>
                        <input 
                            type="date" 
                            value={endDate} 
                            onChange={e => setEndDate(e.target.value)}
                            className="text-xs border-none p-0 focus:ring-0 text-slate-600 w-24"
                        />
                    </div>
                    
                    <select 
                        value={bucketFilter} 
                        onChange={e => setBucketFilter(e.target.value as any)}
                        className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 shadow-sm focus:ring-2 focus:ring-indigo-500/20"
                    >
                        <option value="All">All Buckets</option>
                        <option value="Realized">Realized Only</option>
                        <option value="Unrealized">Unrealized Only</option>
                    </select>
                </div>
            </div>

            {/* Mini Stat Bar */}
            <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 bg-white">
                <div className="p-4 text-center">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Filtered Revenue</p>
                    <p className="text-lg font-bold text-slate-700">{formatCurrency(stats.revenue)}</p>
                </div>
                <div className="p-4 text-center">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Filtered Cost</p>
                    <p className="text-lg font-bold text-slate-700">{formatCurrency(stats.cost)}</p>
                </div>
                <div className="p-4 text-center bg-slate-50">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Net P&L</p>
                    <p className={`text-lg font-bold ${stats.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatCurrency(stats.pnl)}
                    </p>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto custom-scrollbar max-h-[400px]">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('strategyName')}>Strategy</th>
                            <th className="px-6 py-3 cursor-pointer hover:bg-slate-100 text-center" onClick={() => handleSort('deliveryDate')}>Date</th>
                            <th className="px-6 py-3 text-center">Status</th>
                            <th className="px-6 py-3 cursor-pointer hover:bg-slate-100 text-right" onClick={() => handleSort('deliveredVolume')}>Volume</th>
                            <th className="px-6 py-3 cursor-pointer hover:bg-slate-100 text-right" onClick={() => handleSort('finalTotalPnL')}>Net P&L</th>
                            <th className="px-6 py-3 text-left w-32">Contribution</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {sortedData.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-slate-400 text-xs">
                                    No data matches the selected filters.
                                </td>
                            </tr>
                        ) : (
                            sortedData.map(p => {
                                const pnl = p.finalTotalPnL || 0;
                                const barWidth = stats.maxPnl > 0 ? (Math.abs(pnl) / stats.maxPnl) * 100 : 0;
                                const isProfit = pnl >= 0;

                                return (
                                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-3 font-medium text-slate-700">
                                            {p.strategyName}
                                            <div className="text-[10px] text-slate-400 font-normal">{p.source} → {p.buyer}</div>
                                        </td>
                                        <td className="px-6 py-3 text-center text-xs font-mono text-slate-500">
                                            {p.deliveryDate || '-'}
                                        </td>
                                        <td className="px-6 py-3 text-center">
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                                p.pnlBucket === PnLBucket.Realized 
                                                ? 'bg-blue-100 text-blue-700' 
                                                : 'bg-amber-100 text-amber-700'
                                            }`}>
                                                {p.pnlBucket === PnLBucket.Realized ? 'Real' : 'Unreal'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-right text-xs font-mono text-slate-600">
                                            {p.deliveredVolume?.toLocaleString()}
                                        </td>
                                        <td className={`px-6 py-3 text-right font-bold ${isProfit ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {formatCurrency(pnl)}
                                        </td>
                                        <td className="px-6 py-3">
                                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                                                <div 
                                                    className={`h-full rounded-full ${isProfit ? 'bg-emerald-400' : 'bg-rose-400'}`}
                                                    style={{ width: `${Math.min(barWidth, 100)}%` }}
                                                ></div>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
