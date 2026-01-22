
import React, { useState, useMemo, useRef } from 'react';
import { CargoProfile, PnLBucket, EmptyCargoProfile } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { detectUnit, analyzeFormulaStructure, recalculateProfile } from '../services/calculationService';
import { WorldMap } from './WorldMap';
import { CalendarView } from './CalendarView';
import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';

interface CargoListProps {
  profiles: CargoProfile[];
  onEdit: (profile: CargoProfile) => void;
  onDelete: (id: string) => void;
  onActualize: (profile: CargoProfile) => void;
  onBulkDelete: (ids: Set<string>) => void;
  onBulkUpdate?: (ids: Set<string>, updates: Partial<CargoProfile>) => void;
  onBulkImport?: (profiles: CargoProfile[]) => void;
}

type SortKey = keyof CargoProfile;
type ViewMode = 'table' | 'map' | 'calendar';

export const CargoList: React.FC<CargoListProps> = ({ profiles, onEdit, onDelete, onActualize, onBulkDelete, onBulkUpdate, onBulkImport }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isImportingJarvis, setIsImportingJarvis] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [sortConfig, setSortConfig] = useState<{ key: SortKey | null; direction: 'asc' | 'desc' }>({
    key: null,
    direction: 'asc',
  });
  
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
            return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [profiles, sortConfig]);

  const handleJarvisImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingJarvis(true);
    const loadingToast = toast.loading('Extracting Jarvis Workbook (.xlsm)...');

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        
        const mergedData: Record<string, Partial<CargoProfile>> = {};

        const extractSheetData = (sheetName: string, mapping: Record<string, string>) => {
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) return;
            
            const json: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            if (json.length === 0) return;

            let headerRowIndex = -1;
            for (let i = 0; i < Math.min(json.length, 50); i++) {
                const row = json[i];
                if (row.some(cell => String(cell || '').toLowerCase().trim() === 'strategy name')) {
                    headerRowIndex = i;
                    break;
                }
            }

            if (headerRowIndex === -1) return;

            const headers = json[headerRowIndex].map(h => String(h || '').toLowerCase().trim());
            const dataRows = json.slice(headerRowIndex + 1);

            dataRows.forEach(row => {
                const stratIdx = headers.indexOf('strategy name');
                const stratName = row[stratIdx];
                if (!stratName || String(stratName).trim() === '') return;

                const cleanStratName = String(stratName).trim();
                if (!mergedData[cleanStratName]) {
                    mergedData[cleanStratName] = { ...EmptyCargoProfile, strategyName: cleanStratName };
                }

                Object.entries(mapping).forEach(([excelHeader, profileKey]) => {
                    const idx = headers.indexOf(excelHeader.toLowerCase().trim());
                    if (idx !== -1 && row[idx] !== undefined && row[idx] !== '') {
                        const val = row[idx];
                        if (profileKey === 'optimized') {
                             mergedData[cleanStratName][profileKey] = String(val).toLowerCase().includes('yes') || val === true || val === 1;
                        } else if (val instanceof Date) {
                             // CRITICAL FIX: Convert Date objects to YYYY-MM-DD strings to prevent React Error #31
                             (mergedData[cleanStratName] as any)[profileKey] = val.toISOString().split('T')[0];
                        } else if (typeof (EmptyCargoProfile as any)[profileKey] === 'number') {
                             const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
                             if (!isNaN(num)) (mergedData[cleanStratName] as any)[profileKey] = num;
                        } else {
                             (mergedData[cleanStratName] as any)[profileKey] = val;
                        }
                    }
                });
            });
        };

        // 1. Purchase Sheet Mapping
        extractSheetData('Purchase', {
            'Source': 'source',
            'No.': 'jarvisNo',
            'Buyer': 'buyer',
            'Optimized': 'optimized',
            'Loading Date': 'loadingDate',
            'Loading Month': 'loadingMonth',
            'Loaded Volume': 'loadedVolume',
            'Buy Formula': 'buyFormula',
            'Absolute Buy Price': 'absoluteBuyPrice',
            'Purchase Cost': 'reconciledPurchaseCost',
            'Buy Price 1 Weightage': 'buyPrice1Weightage',
            'Buy Price 1 slope': 'buyPrice1Slope',
            'Buy Price Index 1': 'buyPriceIndex1',
            'Buy Price 1 Month Definition': 'buyPrice1MonthDef',
            'Buy Price 1 constant': 'buyPrice1Constant',
            'Buy Price 2 Weightage': 'buyPrice2Weightage',
            'Buy Price 2 slope': 'buyPrice2Slope',
            'Buy Price Index 2': 'buyPriceIndex2',
            'Buy Price 2 Month Definition': 'buyPrice2MonthDef',
            'Buy Price 2 constant': 'buyPrice2Constant'
        });

        // 2. Sales Sheet Mapping
        extractSheetData('Sales', {
            'Buyer': 'buyer',
            'Delivery Date': 'deliveryDate',
            'Delivery Month': 'deliveryMonth',
            'Delivered Volume': 'deliveredVolume',
            'Sell Formula': 'sellFormula',
            'Absolute Sell Price': 'absoluteSellPrice',
            'Sales Revenue': 'salesRevenue',
            'Sell Price 1 Weightage': 'sellPrice1Weightage',
            'Sell Price 1': 'sellPrice1Value',
            'Sell Price 1 slope': 'sellPrice1Slope',
            'Sell Price Index 1': 'sellPriceIndex1',
            'Sell Price 1 Month Definition': 'sellPrice1MonthDef',
            'Sell Price 1 constant': 'sellPrice1Constant',
            'Sell Price 2 Weightage': 'sellPrice2Weightage',
            'Sell Price 2': 'sellPrice2Value',
            'Sell Price 2 slope': 'sellPrice2Slope',
            'Sell Price Index 2': 'sellPriceIndex2',
            'Sell Price 2 Month Definition': 'sellPrice2MonthDef',
            'Sell Price 2 constant': 'sellPrice2Constant'
        });

        // 3. Cost Sheet Mapping
        extractSheetData('Cost', {
            'Incoterm': 'incoterms',
            'SRC': 'src'
        });

        const finalProfiles = Object.values(mergedData).map(p => {
            const existing = profiles.find(ep => ep.strategyName === p.strategyName);
            const fullProfile = { 
                ...p, 
                id: existing?.id || Math.random().toString(36).substr(2, 9) 
            } as CargoProfile;
            return recalculateProfile(fullProfile) as CargoProfile;
        });

        if (onBulkImport) {
            onBulkImport(finalProfiles);
            toast.success(`Merged ${finalProfiles.length} Jarvis strategies`, { id: loadingToast });
        }
      } catch (err) {
        console.error(err);
        toast.error('Failed to process Jarvis Macro workbook', { id: loadingToast });
      } finally {
        setIsImportingJarvis(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleJarvisExport = () => {
    if (profiles.length === 0) {
        toast.error("No data to export");
        return;
    }

    const workbook = XLSX.utils.book_new();

    const getPriceParts = (formula: string, date: string, vol: number) => {
        const analysis = analyzeFormulaStructure(formula, date, undefined, vol);
        const parts = analysis.parts;
        return {
            p1: (parts[0] || {}) as any,
            p2: (parts[1] || {}) as any
        };
    };

    // --- PURCHASE SHEET ---
    const purchaseData = sortedProfiles.map(p => {
        const { p1, p2 } = getPriceParts(p.buyFormula, p.loadingDate, p.loadedVolume);
        return {
            'Source': p.source || '',
            'No.': p.jarvisNo || '',
            'Strategy Name': p.strategyName || '',
            'Buyer': p.buyer || '',
            'Optimized': p.optimized ? 'Yes' : 'No',
            'Loading Date': p.loadingDate || '',
            'Loading Month': p.loadingMonth || '',
            'Loaded Volume': p.loadedVolume || 0,
            'Buy Formula': p.buyFormula || '',
            'Absolute Buy Price': p.absoluteBuyPrice || 0,
            'Purchase Cost': p.reconciledPurchaseCost || 0,
            'Buy Price 1 Weightage': p.buyPrice1Weightage || p1.weightage || '',
            'Buy Price 1 slope': p.buyPrice1Slope || p1.slope || '',
            'Buy Price Index 1': p.buyPriceIndex1 || p1.index || '',
            'Buy Price 1 Month Definition': p.buyPrice1MonthDef || p1.monthDef || '',
            'Buy Price 1 constant': p.buyPrice1Constant || p1.constant || '',
            'Buy Price 2 Weightage': p.buyPrice2Weightage || p2.weightage || '',
            'Buy Price 2 slope': p.buyPrice2Slope || p2.slope || '',
            'Buy Price Index 2': p.buyPriceIndex2 || p2.index || '',
            'Buy Price 2 Month Definition': p.buyPrice2MonthDef || p2.monthDef || '',
            'Buy Price 2 constant': p.buyPrice2Constant || p2.constant || ''
        };
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(purchaseData), 'Purchase');

    // --- SALES SHEET ---
    const salesData = sortedProfiles.map(p => {
        const { p1, p2 } = getPriceParts(p.sellFormula, p.deliveryDate, p.deliveredVolume);
        return {
            'Strategy Name': p.strategyName || '',
            'Buyer': p.buyer || '',
            'Delivery Date': p.deliveryDate || '',
            'Delivery Month': p.deliveryMonth || '',
            'Delivered Volume': p.deliveredVolume || 0,
            'Sell Formula': p.sellFormula || '',
            'Absolute Sell Price': p.absoluteSellPrice || 0,
            'Sales Revenue': p.salesRevenue || 0,
            'Sell Price 1 Weightage': p.sellPrice1Weightage || p1.weightage || '',
            'Sell Price 1': p.sellPrice1Value || p1.componentValue || '',
            'Sell Price 1 slope': p.sellPrice1Slope || p1.slope || '',
            'Sell Price Index 1': p.sellPriceIndex1 || p1.index || '',
            'Sell Price 1 Month Definition': p.sellPrice1MonthDef || p1.monthDef || '',
            'Sell Price 1 constant': p.sellPrice1Constant || p1.constant || '',
            'Sell Price 2 Weightage': p.sellPrice2Weightage || p2.weightage || '',
            'Sell Price 2': p.sellPrice2Value || p2.componentValue || '',
            'Sell Price 2 slope': p.sellPrice2Slope || p2.slope || '',
            'Sell Price Index 2': p.sellPriceIndex2 || p2.index || '',
            'Sell Price 2 Month Definition': p.sellPrice2MonthDef || p2.monthDef || '',
            'Sell Price 2 constant': p.sellPrice2Constant || p2.constant || ''
        };
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(salesData), 'Sales');

    // --- COST SHEET ---
    const costData = sortedProfiles.map(p => ({
        'Strategy Name': p.strategyName || '',
        'Incoterm': p.incoterms || '',
        'SRC': p.src || ''
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(costData), 'Cost');

    XLSX.writeFile(workbook, `Jarvis_Export_${new Date().toISOString().split('T')[0]}.xlsm`, { bookType: 'xlsm' });
  };

  const requestSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === sortedProfiles.length && sortedProfiles.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(sortedProfiles.map(p => p.id)));
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
      <div className="px-6 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <div className="flex items-center gap-4">
            <div className="flex bg-slate-200 p-1 rounded-lg">
                <button onClick={() => setViewMode('table')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${viewMode === 'table' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Grid</button>
                <button onClick={() => setViewMode('map')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${viewMode === 'map' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Map</button>
                <button onClick={() => setViewMode('calendar')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${viewMode === 'calendar' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Calendar</button>
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wide border-l pl-4 border-slate-200">
                {sortedProfiles.length} records found
            </span>
            {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 ml-4 pl-4 border-l border-slate-200">
                     <span className="text-xs font-bold text-slate-500">{selectedIds.size} Selected</span>
                     <div className="flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden">
                         <input type="text" placeholder="Assign Group..." className="text-xs border-none py-1 px-2 w-32 focus:ring-0 text-slate-700" value={bulkGroupInput} onChange={(e) => setBulkGroupInput(e.target.value)} />
                         <button onClick={handleBulkAssignGroup} className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-2 py-1.5 border-l border-slate-200 text-xs font-bold">Set</button>
                     </div>
                     <button onClick={handleBulkDeleteClick} className="text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 shadow-sm">Delete</button>
                </div>
            )}
        </div>

        <div className="flex items-center gap-2">
            <div className="relative group">
                <input type="file" ref={fileInputRef} accept=".xlsm, .xlsx, .xls" onChange={handleJarvisImport} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 shadow-sm">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    Import Jarvis (.xlsm)
                </button>
            </div>
            <button onClick={handleJarvisExport} className="text-xs font-medium text-slate-600 hover:text-blue-600 bg-white border border-slate-200 hover:border-blue-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 shadow-sm">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Export Jarvis (.xlsm)
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative bg-slate-50/30">
        <AnimatePresence mode="wait">
            {viewMode === 'table' && (
                <motion.div key="table" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="h-full overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50/80 border-b border-slate-200 backdrop-blur-sm sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-4 w-10"><input type="checkbox" checked={selectedIds.size === sortedProfiles.length && sortedProfiles.length > 0} onChange={handleSelectAll} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" /></th>
                                <th className="px-6 py-4 font-bold cursor-pointer hover:bg-slate-100" onClick={() => requestSort('strategyName')}><div className="flex items-center">Strategy / ID <SortIcon column="strategyName" /></div></th>
                                <th className="px-6 py-4 font-bold cursor-pointer hover:bg-slate-100" onClick={() => requestSort('manualGroup')}><div className="flex items-center">Group <SortIcon column="manualGroup" /></div></th>
                                <th className="px-6 py-4 font-bold cursor-pointer hover:bg-slate-100" onClick={() => requestSort('buyer')}><div className="flex items-center">Buyer <SortIcon column="buyer" /></div></th>
                                <th className="px-6 py-4 font-bold cursor-pointer hover:bg-slate-100" onClick={() => requestSort('deliveryDate')}><div className="flex items-center">Schedule <SortIcon column="deliveryDate" /></div></th>
                                <th className="px-6 py-4 font-bold text-right cursor-pointer hover:bg-slate-100" onClick={() => requestSort('deliveredVolume')}><div className="flex items-center justify-end">Volume <SortIcon column="deliveredVolume" /></div></th>
                                <th className="px-6 py-4 font-bold text-right cursor-pointer hover:bg-slate-100" onClick={() => requestSort('finalTotalPnL')}><div className="flex items-center justify-end">Total P&L <SortIcon column="finalTotalPnL" /></div></th>
                                <th className="px-6 py-4 font-bold text-center cursor-pointer hover:bg-slate-100" onClick={() => requestSort('pnlBucket')}><div className="flex items-center justify-center">Status <SortIcon column="pnlBucket" /></div></th>
                                <th className="px-6 py-4 font-bold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {sortedProfiles.map((profile) => {
                                const unit = detectUnit(profile.sellFormula || profile.buyFormula);
                                const isSelected = selectedIds.has(profile.id);
                                return (
                                    <tr key={profile.id} className={`transition-colors group ${isSelected ? 'bg-blue-50/50' : 'hover:bg-blue-50/30'}`}>
                                        <td className="px-6 py-4"><input type="checkbox" checked={isSelected} onChange={() => handleSelectRow(profile.id)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" /></td>
                                        <td className="px-6 py-4 font-medium text-slate-900">
                                            <div className="flex flex-col">
                                                <span className="font-semibold">{profile.strategyName || 'Untitled Strategy'}</span>
                                                <span className="text-xs text-slate-400 font-normal flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                                    {profile.source || <span className="text-rose-400 italic">No Source</span>}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">{profile.manualGroup ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">{profile.manualGroup}</span> : <span className="text-slate-300 text-xs italic">None</span>}</td>
                                        <td className="px-6 py-4 text-slate-600">{profile.buyer || <span className="text-rose-400 italic text-xs border border-rose-200 bg-rose-50 px-2 py-0.5 rounded">Unmatched</span>}</td>
                                        <td className="px-6 py-4 text-slate-600"><div className="flex flex-col text-xs space-y-1"><span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 w-max">Del: {profile.deliveryDate || '-'}</span><span className="text-slate-400 pl-1.5">Load: {profile.loadingDate || '-'}</span></div></td>
                                        <td className="px-6 py-4 text-slate-600 text-right font-mono">{profile.deliveredVolume.toLocaleString()} <span className="text-xs text-slate-400 ml-1">{unit}</span></td>
                                        <td className={`px-6 py-4 font-bold text-right ${profile.finalTotalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(profile.finalTotalPnL)}</td>
                                        <td className="px-6 py-4 text-center"><span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${profile.pnlBucket === PnLBucket.Realized ? 'bg-blue-100 text-blue-700 border border-blue-200' : profile.pnlBucket === PnLBucket.Unrealized ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>{profile.pnlBucket}</span></td>
                                        <td className="px-6 py-4 text-right"><div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">{profile.pnlBucket !== PnLBucket.Realized && <button onClick={() => onActualize(profile)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors" title="Actualize"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></button>}<button onClick={() => onEdit(profile)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button><button onClick={() => onDelete(profile.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors" title="Delete"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </motion.div>
            )}
            {viewMode === 'map' && <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full p-4"><WorldMap profiles={sortedProfiles} height="100%" /></motion.div>}
            {viewMode === 'calendar' && <motion.div key="calendar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full p-4"><CalendarView profiles={sortedProfiles} /></motion.div>}
        </AnimatePresence>
      </div>
    </div>
  );
};
