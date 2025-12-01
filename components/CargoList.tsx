import React, { useState, useMemo } from 'react';
import { CargoProfile, PnLBucket } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { detectUnit } from '../services/calculationService';

interface CargoListProps {
  profiles: CargoProfile[];
  onEdit: (profile: CargoProfile) => void;
  onDelete: (id: string) => void;
  onActualize: (profile: CargoProfile) => void;
}

type SortKey = keyof CargoProfile;

export const CargoList: React.FC<CargoListProps> = ({ profiles, onEdit, onDelete, onActualize }) => {
  const [sortConfig, setSortConfig] = useState<{ key: SortKey | null; direction: 'asc' | 'desc' }>({
    key: null,
    direction: 'asc',
  });

  const sortedProfiles = useMemo(() => {
    let sortableItems = [...profiles];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let aVal = a[sortConfig.key!];
        let bVal = b[sortConfig.key!];

        if (aVal === bVal) return 0;
        if (aVal === undefined || aVal === null) return 1;
        if (bVal === undefined || bVal === null) return -1;

        if (typeof aVal === 'string' && typeof bVal === 'string') {
            return sortConfig.direction === 'asc' 
                ? aVal.localeCompare(bVal) 
                : bVal.localeCompare(aVal);
        }

        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
        }

        if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
             return sortConfig.direction === 'asc' 
                ? (aVal === bVal ? 0 : aVal ? -1 : 1)
                : (aVal === bVal ? 0 : aVal ? 1 : -1);
        }

        return 0;
      });
    }
    return sortableItems;
  }, [profiles, sortConfig]);

  const requestSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const downloadCSV = () => {
    if (sortedProfiles.length === 0) return;

    const headers = [
        "Strategy Name", "Source", "Buyer", "Optimized", 
        "Delivery Date", "Delivered Volume", "Volume Unit", "Sell Formula", "Sell Price", 
        "Buy Formula", "Buy Price", "Purchase Cost", "Sales Revenue", 
        "P&L Bucket", "Total P&L"
    ];

    const rows = sortedProfiles.map(p => {
        const unit = detectUnit(p.sellFormula || p.buyFormula);
        return [
            `"${p.strategyName || ''}"`,
            `"${p.source || ''}"`,
            `"${p.buyer || ''}"`,
            p.optimized ? "Yes" : "No",
            p.deliveryDate,
            p.deliveredVolume,
            unit,
            `"${p.sellFormula || ''}"`,
            p.absoluteSellPrice,
            `"${p.buyFormula || ''}"`,
            p.absoluteBuyPrice,
            p.reconciledPurchaseCost,
            p.finalSalesRevenue,
            p.pnlBucket,
            p.finalTotalPnL
        ];
    });

    const csvContent = [
        headers.join(','),
        ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Cargo_Profiles_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortConfig.key !== column) {
        return <svg className="w-3 h-3 text-slate-300 opacity-50 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>;
    }
    return sortConfig.direction === 'asc' 
        ? <svg className="w-3 h-3 text-blue-600 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
        : <svg className="w-3 h-3 text-blue-600 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);

  if (profiles.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center h-96 bg-white rounded-xl border border-dashed border-slate-300 text-slate-400 shadow-sm"
      >
        <div className="bg-slate-50 p-4 rounded-full mb-4">
            <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
        </div>
        <p className="font-medium text-slate-600">No cargo profiles found.</p>
        <p className="text-sm mt-1">Adjust filters or click "New Cargo" to start.</p>
      </motion.div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
      {/* Utility Bar */}
      <div className="px-6 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
            Showing {sortedProfiles.length} records
        </span>
        <button 
            onClick={downloadCSV}
            className="text-xs font-medium text-slate-600 hover:text-blue-600 bg-white border border-slate-200 hover:border-blue-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
        >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Export CSV
        </button>
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50/80 border-b border-slate-200 backdrop-blur-sm sticky top-0 z-10">
            <tr>
              <th 
                className="px-6 py-4 font-bold tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none"
                onClick={() => requestSort('strategyName')}
              >
                <div className="flex items-center">Strategy / ID <SortIcon column="strategyName" /></div>
              </th>
              <th 
                className="px-6 py-4 font-bold tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none"
                onClick={() => requestSort('buyer')}
              >
                <div className="flex items-center">Buyer <SortIcon column="buyer" /></div>
              </th>
              <th 
                className="px-6 py-4 font-bold tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none"
                onClick={() => requestSort('deliveryDate')}
              >
                 <div className="flex items-center">Schedule <SortIcon column="deliveryDate" /></div>
              </th>
              <th 
                className="px-6 py-4 font-bold tracking-wider text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                onClick={() => requestSort('deliveredVolume')}
              >
                 <div className="flex items-center justify-end">Volume <SortIcon column="deliveredVolume" /></div>
              </th>
              <th 
                className="px-6 py-4 font-bold tracking-wider text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                onClick={() => requestSort('finalTotalPnL')}
              >
                 <div className="flex items-center justify-end">Total P&L <SortIcon column="finalTotalPnL" /></div>
              </th>
              <th 
                className="px-6 py-4 font-bold tracking-wider text-center cursor-pointer hover:bg-slate-100 transition-colors select-none"
                onClick={() => requestSort('pnlBucket')}
              >
                 <div className="flex items-center justify-center">Status <SortIcon column="pnlBucket" /></div>
              </th>
              <th className="px-6 py-4 font-bold tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <AnimatePresence mode="popLayout">
            {sortedProfiles.map((profile) => {
               const unit = detectUnit(profile.sellFormula || profile.buyFormula);
               return (
                  <motion.tr 
                    key={profile.id} 
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="hover:bg-blue-50/30 transition-colors group"
                  >
                    <td className="px-6 py-4 font-medium text-slate-900">
                      <div className="flex flex-col">
                        <span className="font-semibold">{profile.strategyName || 'Untitled Strategy'}</span>
                        <span className="text-xs text-slate-400 font-normal flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                            {profile.source || <span className="text-rose-400 italic">No Source</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                        {profile.buyer || <span className="text-rose-400 italic text-xs border border-rose-200 bg-rose-50 px-2 py-0.5 rounded">Unmatched Sell</span>}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                        <div className="flex flex-col text-xs space-y-1">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 w-max">Del: {profile.deliveryDate || '-'}</span>
                            <span className="text-slate-400 pl-1.5">Load: {profile.loadingDate || '-'}</span>
                        </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 text-right font-mono">
                        {profile.deliveredVolume.toLocaleString()} 
                        <span className="text-xs text-slate-400 ml-1">{unit}</span>
                    </td>
                    <td className={`px-6 py-4 font-bold text-right ${profile.finalTotalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatCurrency(profile.finalTotalPnL)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                        profile.pnlBucket === PnLBucket.Realized 
                          ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                          : profile.pnlBucket === PnLBucket.Unrealized 
                            ? 'bg-amber-100 text-amber-700 border border-amber-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        {profile.pnlBucket}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {profile.pnlBucket !== PnLBucket.Realized && (
                              <button 
                                onClick={() => onActualize(profile)}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                title="Actualize Cargo"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              </button>
                          )}
                          <button 
                            onClick={() => onEdit(profile)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button 
                            onClick={() => onDelete(profile.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                      </div>
                    </td>
                  </motion.tr>
               );
            })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  );
};