
import React, { useState, useMemo } from 'react';
import { CargoProfile, PnLBucket } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { detectUnit, analyzeFormulaStructure } from '../services/calculationService';
import { WorldMap } from './WorldMap';
import { CalendarView } from './CalendarView';

interface CargoListProps {
  profiles: CargoProfile[];
  onEdit: (profile: CargoProfile) => void;
  onDelete: (id: string) => void;
  onActualize: (profile: CargoProfile) => void;
  onBulkDelete: (ids: Set<string>) => void;
  onBulkUpdate?: (ids: Set<string>, updates: Partial<CargoProfile>) => void;
}

type SortKey = keyof CargoProfile;
type ViewMode = 'table' | 'map' | 'calendar';

export const CargoList: React.FC<CargoListProps> = ({ profiles, onEdit, onDelete, onActualize, onBulkDelete, onBulkUpdate }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: SortKey | null; direction: 'asc' | 'desc' }>({
    key: null,
    direction: 'asc',
  });
  
  // Bulk Assign State
  const [bulkGroupInput, setBulkGroupInput] = useState('');

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

  const handleSelectAll = () => {
    if (selectedIds.size === sortedProfiles.length && sortedProfiles.length > 0) {
        setSelectedIds(new Set());
    } else {
        setSelectedIds(new Set(sortedProfiles.map(p => p.id)));
    }
  };

  const handleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkDeleteClick = () => {
      if (selectedIds.size > 0) {
          onBulkDelete(selectedIds);
          setSelectedIds(new Set());
      }
  };
  
  const handleBulkAssignGroup = () => {
      if (selectedIds.size > 0 && bulkGroupInput.trim() && onBulkUpdate) {
          onBulkUpdate(selectedIds, { manualGroup: bulkGroupInput.trim() });
          setBulkGroupInput('');
          setSelectedIds(new Set());
      }
  };

  const downloadCSV = () => {
    if (sortedProfiles.length === 0) return;
    
    // EXACT HEADERS REQUESTED BY USER
    const headers = [
        "Strategy Name", "Buyer", "Optimized", 
        "Delivery Date", "Delivery Month", "Delivered Volume", 
        
        // Sell Side - Specific Structure
        "Sell Formula", "Absolute Sell Price", "Sales Revenue",
        "Sell Price 1 Weightage", "Sell Price 1", "Sell Price 1 slope", "Sell Price Index 1", "Sell Price 1 Month Definition", "Sell Price 1 constant",
        "Sell Price 2 Weightage", "Sell Price 2", "Sell Price 2 slope", "Sell Price Index 2", "Sell Price 2 Month Definition", "Sell Price 2 constant",
        "Sell Price 3 Weightage", "Sell Price 3", "Sell Price 3 slope", "Sell Price Index 3", "Sell Price 3 Month Definition", "Sell Price 3 constant",
        
        // Buy Side - Mirrored Structure for completeness
        "Buy Formula", "Absolute Buy Price", "Purchase Cost",
        "Buy Price 1 Weightage", "Buy Price 1 slope", "Buy Price Index 1", "Buy Price 1 Month Definition", "Buy Price 1 constant",
        "Buy Price 2 Weightage", "Buy Price 2", "Buy Price 2 slope", "Buy Price Index 2", "Buy Price 2 Month Definition", "Buy Price 2 constant",
        
        "Status", "Physical P&L", "Hedging P&L", "Total P&L"
    ];

    const q = (str: any) => {
        if (str === undefined || str === null) return '""';
        return `"${String(str).replace(/"/g, '""')}"`;
    };

    const rows = sortedProfiles.map(p => {
        const unit = p.volumeUnit || detectUnit(p.sellFormula || p.buyFormula);
        
        // Analyze Formulas with context
        // NOTE: We pass volume so analyzeFormulaStructure can determine active tier components if using split-row logic
        // or return all parts if no clear split.
        const sellAnalysis = analyzeFormulaStructure(p.sellFormula, p.deliveryDate, undefined, p.deliveredVolume, unit);
        const buyAnalysis = analyzeFormulaStructure(p.buyFormula, p.loadingDate || p.deliveryDate, undefined, p.loadedVolume, unit);

        // Helper to safely get part data
        const getPart = (parts: any[], index: number) => {
            const part = parts[index] || {};
            return {
                w: part.weightage || (parts.length > index ? '100%' : ''),
                s: part.slope || '',
                i: part.index || '',
                m: part.monthDef || '',
                c: part.constant || '',
                v: part.componentValue // Value
            };
        };

        const s1 = getPart(sellAnalysis.parts, 0);
        const s2 = getPart(sellAnalysis.parts, 1);
        const s3 = getPart(sellAnalysis.parts, 2);
        
        const b1 = getPart(buyAnalysis.parts, 0);
        const b2 = getPart(buyAnalysis.parts, 1);

        // Attach global constants to first part if no parts exist, or separate?
        if (sellAnalysis.parts.length === 0 && sellAnalysis.globalConstant !== '0') s1.c = sellAnalysis.globalConstant;
        if (buyAnalysis.parts.length === 0 && buyAnalysis.globalConstant !== '0') b1.c = buyAnalysis.globalConstant;

        return [
            q(p.strategyName), q(p.buyer), p.optimized ? "Yes" : "No",
            p.deliveryDate || '', p.deliveryMonth || '', p.deliveredVolume?.toLocaleString() || '0',
            
            // Sell Side
            q(p.sellFormula), p.absoluteSellPrice?.toFixed(3) || '', p.finalSalesRevenue?.toFixed(2) || '',
            q(s1.w), s1.v ? s1.v.toFixed(3) : '', q(s1.s), q(s1.i), q(s1.m), q(s1.c),
            q(s2.w), s2.v ? s2.v.toFixed(3) : '', q(s2.s), q(s2.i), q(s2.m), q(s2.c),
            q(s3.w), s3.v ? s3.v.toFixed(3) : '', q(s3.s), q(s3.i), q(s3.m), q(s3.c),
            
            // Buy Side
            q(p.buyFormula), p.absoluteBuyPrice?.toFixed(3) || '', p.reconciledPurchaseCost?.toFixed(2) || '',
            q(b1.w), q(b1.s), q(b1.i), q(b1.m), q(b1.c),
            q(b2.w), q(b2.s), q(b2.i), q(b2.m), q(b2.c),
            
            p.pnlBucket, p.finalPhysicalPnL?.toFixed(2) || 0, p.totalHedgingPnL || 0, p.finalTotalPnL?.toFixed(2) || 0
        ];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
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
    if (sortConfig.key !== column) return <svg className="w-3 h-3 text-slate-300 opacity-50 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>;
    return sortConfig.direction === 'asc' 
        ? <svg className="w-3 h-3 text-blue-600 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
        : <svg className="w-3 h-3 text-blue-600 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
      {/* Utility Bar */}
      <div className="px-6 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <div className="flex items-center gap-4">
            <div className="flex bg-slate-200 p-1 rounded-lg">
                <button 
                    onClick={() => setViewMode('table')} 
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${viewMode === 'table' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7-4h14M4 6h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" /></svg>
                    Grid
                </button>
                <button 
                    onClick={() => setViewMode('map')} 
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${viewMode === 'map' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Map
                </button>
                <button 
                    onClick={() => setViewMode('calendar')} 
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${viewMode === 'calendar' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Calendar
                </button>
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wide border-l pl-4 border-slate-200">
                {sortedProfiles.length} records found
            </span>
            {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 ml-4 pl-4 border-l border-slate-200">
                     <span className="text-xs font-bold text-slate-500">{selectedIds.size} Selected</span>
                     
                     {/* Bulk Group Assign */}
                     <div className="flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-blue-500/20">
                         <input 
                            type="text" 
                            placeholder="Assign Group..."
                            className="text-xs border-none py-1 px-2 w-32 focus:ring-0 text-slate-700"
                            value={bulkGroupInput}
                            onChange={(e) => setBulkGroupInput(e.target.value)}
                         />
                         <button 
                            onClick={handleBulkAssignGroup}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-2 py-1.5 border-l border-slate-200 text-xs font-bold"
                         >
                            Set
                         </button>
                     </div>

                     <button 
                        onClick={handleBulkDeleteClick}
                        className="text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </div>
            )}
        </div>

        <button 
            onClick={downloadCSV}
            className="text-xs font-medium text-slate-600 hover:text-blue-600 bg-white border border-slate-200 hover:border-blue-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
        >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Export CSV
        </button>
      </div>

      <div className="flex-1 overflow-hidden relative bg-slate-50/30">
        <AnimatePresence mode="wait">
            {viewMode === 'table' && (
                <motion.div 
                    key="table" 
                    initial={{ opacity: 0, x: -10 }} 
                    animate={{ opacity: 1, x: 0 }} 
                    exit={{ opacity: 0, x: 10 }}
                    className="h-full overflow-x-auto custom-scrollbar"
                >
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50/80 border-b border-slate-200 backdrop-blur-sm sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-4 w-10">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedIds.size === sortedProfiles.length && sortedProfiles.length > 0} 
                                        onChange={handleSelectAll} 
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    />
                                </th>
                                <th className="px-6 py-4 font-bold cursor-pointer hover:bg-slate-100" onClick={() => requestSort('strategyName')}>
                                    <div className="flex items-center">Strategy / ID <SortIcon column="strategyName" /></div>
                                </th>
                                <th className="px-6 py-4 font-bold cursor-pointer hover:bg-slate-100" onClick={() => requestSort('manualGroup')}>
                                    <div className="flex items-center">Group <SortIcon column="manualGroup" /></div>
                                </th>
                                <th className="px-6 py-4 font-bold cursor-pointer hover:bg-slate-100" onClick={() => requestSort('buyer')}>
                                    <div className="flex items-center">Buyer <SortIcon column="buyer" /></div>
                                </th>
                                <th className="px-6 py-4 font-bold cursor-pointer hover:bg-slate-100" onClick={() => requestSort('deliveryDate')}>
                                    <div className="flex items-center">Schedule <SortIcon column="deliveryDate" /></div>
                                </th>
                                <th className="px-6 py-4 font-bold text-right cursor-pointer hover:bg-slate-100" onClick={() => requestSort('deliveredVolume')}>
                                    <div className="flex items-center justify-end">Volume <SortIcon column="deliveredVolume" /></div>
                                </th>
                                <th className="px-6 py-4 font-bold text-right cursor-pointer hover:bg-slate-100" onClick={() => requestSort('finalTotalPnL')}>
                                    <div className="flex items-center justify-end">Total P&L <SortIcon column="finalTotalPnL" /></div>
                                </th>
                                <th className="px-6 py-4 font-bold text-center cursor-pointer hover:bg-slate-100" onClick={() => requestSort('pnlBucket')}>
                                    <div className="flex items-center justify-center">Status <SortIcon column="pnlBucket" /></div>
                                </th>
                                <th className="px-6 py-4 font-bold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {sortedProfiles.map((profile) => {
                                const unit = detectUnit(profile.sellFormula || profile.buyFormula);
                                const isSelected = selectedIds.has(profile.id);
                                return (
                                    <tr key={profile.id} className={`transition-colors group ${isSelected ? 'bg-blue-50/50' : 'hover:bg-blue-50/30'}`}>
                                        <td className="px-6 py-4">
                                            <input 
                                                type="checkbox" 
                                                checked={isSelected} 
                                                onChange={() => handleSelectRow(profile.id)} 
                                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            />
                                        </td>
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
                                            {profile.manualGroup ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                                    {profile.manualGroup}
                                                </span>
                                            ) : <span className="text-slate-300 text-xs italic">None</span>}
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
                                                    <button onClick={() => onActualize(profile)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors" title="Actualize">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                    </button>
                                                )}
                                                <button onClick={() => onEdit(profile)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                </button>
                                                <button onClick={() => onDelete(profile.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors" title="Delete">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </motion.div>
            )}

            {viewMode === 'map' && (
                <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full p-4">
                    <WorldMap profiles={sortedProfiles} height="100%" />
                </motion.div>
            )}

            {viewMode === 'calendar' && (
                <motion.div key="calendar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full p-4">
                    <CalendarView profiles={sortedProfiles} />
                </motion.div>
            )}
        </AnimatePresence>
      </div>
    </div>
  );
};
