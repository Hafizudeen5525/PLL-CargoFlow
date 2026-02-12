import React, { useState } from 'react';
import { CargoProfile, PnLBucket, EmptyCargoProfile } from '../types';
import { recalculateProfile, generateStrategyName } from '../services/calculationService';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

interface BulkImportModalProps {
  existingProfiles: CargoProfile[];
  onClose: () => void;
  onImport: (profiles: CargoProfile[]) => void;
}

const COLUMN_MAPPING: Record<string, string[]> = {
  strategyName: ['strategy', 'name', 'deal', 'id', 'ref'],
  source: ['source', 'origin', 'load port', 'loading port'],
  buyer: ['buyer', 'customer', 'client', 'destination', 'disport'],
  deliveryDate: ['delivery date', 'arrival', 'end date', 'del date'],
  deliveryWindowStart: ['delivery start', 'del start'],
  deliveryWindowEnd: ['delivery end', 'del end'],
  loadingDate: ['loading date', 'load date', 'bl date'],
  loadingWindowStart: ['loading start', 'load start'],
  loadingWindowEnd: ['loading end', 'load end'],
  deliveredVolume: ['volume', 'vol', 'quantity', 'qty', 'mmbtu', 'bbl', 'delivered volume'],
  loadedVolume: ['loaded volume', 'load vol'],
  sellFormula: ['sell formula', 'sales formula'],
  absoluteSellPrice: ['sell price', 'sales price', 'unit price', 'final price'],
  buyFormula: ['buy formula', 'purchase formula'],
  absoluteBuyPrice: ['buy price', 'purchase price', 'cost price'],
  salesRevenue: ['sales revenue', 'revenue', 'invoice value'],
  reconciledPurchaseCost: ['purchase cost', 'cost', 'total cost'],
  finalTotalPnL: ['total pnl', 'final pnl', 'profit', 'p&l', 'net pnl'],
  incoterms: ['incoterms', 'terms'],
  pnlBucket: ['status', 'bucket', 'state']
};

const formatMonthStr = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const y = parseInt(parts[0]);
            const m = parseInt(parts[1]) - 1;
            const d = parseInt(parts[2]);
            const date = new Date(y, m, d);
            if (isNaN(date.getTime())) return '';
            const monthShort = date.toLocaleString('en-US', { month: 'short' });
            const yearShort = y.toString().slice(2);
            return `${monthShort}-${yearShort}`;
        }
    } catch(e) {}
    return '';
}

interface DiffCellProps {
    row: any;
    field: keyof CargoProfile;
    rowIndex: number;
    format?: (v: any) => React.ReactNode;
    className?: string;
    isIgnored: boolean;
    onToggle: (idx: number, field: string) => void;
}

const DiffCell = ({ row, field, rowIndex, format, className = "", isIgnored, onToggle }: DiffCellProps) => {
    const val = row[field];
    const change = row._status === 'Update' && row._changes && row._changes[field];
    const isEmpty = (v: any) => v === null || v === undefined || v === '' || v === 0;

    if (change) {
        if (isEmpty(change.old) && isEmpty(change.new)) {
             return <div className={`text-slate-600 ${className}`}>{format ? format(val) : (val || '-')}</div>;
        }
        return (
            <div 
                onClick={() => onToggle(rowIndex, field as string)}
                className={`flex flex-col leading-tight cursor-pointer group select-none transition-all p-1 rounded ${isIgnored ? 'bg-slate-100 border border-slate-200 opacity-70' : 'hover:bg-blue-50'} ${className}`}
                title="Click to toggle this specific change"
            >
                {isIgnored ? (
                    <>
                        <span className="text-[10px] font-bold text-slate-500 mb-0.5">Keep: {format ? format(change.old) : (change.old || '-')}</span>
                        <span className="line-through text-[9px] text-slate-400 opacity-60">Skip: {format ? format(change.new) : (change.new || '-')}</span>
                    </>
                ) : (
                    <>
                         <div className="flex items-center gap-1">
                            <span className="line-through text-[9px] text-rose-400 opacity-60">{format ? format(change.old) : (change.old || '-')}</span>
                             <svg className="w-2 h-2 text-blue-300 opacity-0 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                        </div>
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-100/50 px-1 rounded -ml-1 w-max border border-blue-100">{format ? format(change.new) : (change.new || '-')}</span>
                    </>
                )}
            </div>
        );
    }
    return <div className={`text-slate-600 ${className}`}>{format ? format(val) : (val || '-')}</div>;
};

export const BulkImportModal: React.FC<BulkImportModalProps> = ({ existingProfiles, onClose, onImport }) => {
  const [inputText, setInputText] = useState('');
  const [parsedRows, setParsedRows] = useState<(CargoProfile & { _status: 'New' | 'Update' | 'No Change', _changes?: Record<string, {old: any, new: any}> })[]>([]);
  const [step, setStep] = useState<'paste' | 'preview'>('paste');
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [ignoredChanges, setIgnoredChanges] = useState<Record<number, Set<string>>>({});

  const parseDate = (raw: string): string => {
    if (!raw) return '';
    const str = raw.trim();
    const months: Record<string, string> = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
        january: '01', february: '02', march: '03', april: '04', june: '06',
        july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
    };
    const ddMmmYy = str.match(/^(\d{1,2})[\s\-\/]+([a-zA-Z]{3,})[\s\-\/]+(\d{2,4})$/);
    if (ddMmmYy) {
        const d = ddMmmYy[1].padStart(2, '0');
        const mStr = ddMmmYy[2].toLowerCase().slice(0, 3);
        let y = ddMmmYy[3];
        if (y.length === 2) y = `20${y}`;
        const m = months[mStr];
        if (m) return `${y}-${m}-${d}`;
    }
    const mmmYy = str.match(/^([a-zA-Z]{3,})[\s\-\']+(\d{2})$/);
    if (mmmYy) {
        const mStr = mmmYy[1].toLowerCase().slice(0, 3);
        const yStr = mmmYy[2];
        const m = months[mStr];
        if (m) return `20${yStr}-${m}-01`;
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    return '';
  };

  const handleParse = () => {
    if (!inputText.trim()) {
        toast.error("Clipboard is empty");
        return;
    }
    try {
        const rows = inputText.trim().split('\n');
        const firstRow = rows[0].split(/\t|,/);
        const headers = firstRow.map(h => h.trim().toLowerCase().replace(/['"]+/g, ''));
        const mapIndices: Record<string, number> = {};
        
        headers.forEach((h: string, index: number) => {
            for (const [key, aliases] of Object.entries(COLUMN_MAPPING)) {
                if (aliases.some(alias => h.includes(alias))) {
                    if (mapIndices[key] === undefined) mapIndices[key] = index;
                }
            }
        });

        const processedProfiles: (CargoProfile & { _status: 'New' | 'Update' | 'No Change', _changes?: Record<string, {old: any, new: any}> })[] = [];
        
        for (let i = 1; i < rows.length; i++) {
            const rowStr = rows[i].trim();
            if (!rowStr) continue;
            const cells = rowStr.split(rowStr.includes('\t') ? '\t' : ',').map(c => c.trim().replace(/^"|"$/g, ''));
            const parsedFields: Partial<CargoProfile> = {};
            
            Object.entries(mapIndices).forEach(([key, index]) => {
                if (cells[index]) {
                    const rawVal = cells[index];
                    if (key.includes('Volume')) {
                        const mmbtuMatch = rawVal.match(/([\d,.]+)\s*(mmbtu)/i);
                        const m3Match = rawVal.match(/([\d,.]+)\s*(m3|cbm|cubic)/i);
                        let volNum = 0;
                        if (mmbtuMatch) {
                             volNum = parseFloat(mmbtuMatch[1].replace(/,/g, ''));
                             if (!parsedFields.volumeUnit) parsedFields.volumeUnit = 'MMBtu';
                        } else if (m3Match) {
                             volNum = parseFloat(m3Match[1].replace(/,/g, ''));
                             if (!parsedFields.volumeUnit) parsedFields.volumeUnit = 'm3';
                        } else {
                             volNum = parseFloat(rawVal.replace(/[^0-9.-]/g, ''));
                        }
                        if (!isNaN(volNum)) (parsedFields as any)[key] = volNum;
                    } else if (key.includes('Date') || key.includes('Start') || key.includes('End')) {
                        (parsedFields as any)[key] = parseDate(rawVal);
                    } else if (['absoluteSellPrice', 'absoluteBuyPrice', 'salesRevenue', 'reconciledPurchaseCost', 'finalTotalPnL'].includes(key)) {
                        const cleanNum = parseFloat(rawVal.replace(/[^0-9.-]/g, ''));
                        if (!isNaN(cleanNum)) (parsedFields as any)[key] = cleanNum;
                    } else if (key === 'pnlBucket') {
                        const val = rawVal.toLowerCase();
                        if (val.includes('unreal')) parsedFields.pnlBucket = PnLBucket.Unrealized;
                        else if (val.includes('real')) parsedFields.pnlBucket = PnLBucket.Realized;
                    } else {
                        (parsedFields as any)[key] = rawVal;
                    }
                }
            });

            if (parsedFields.deliveryDate && !parsedFields.deliveryMonth) parsedFields.deliveryMonth = formatMonthStr(parsedFields.deliveryDate);
            if (parsedFields.loadingDate && !parsedFields.loadingMonth) parsedFields.loadingMonth = formatMonthStr(parsedFields.loadingDate);

            let finalProfile: CargoProfile;
            let status: 'New' | 'Update' | 'No Change';
            let changes: Record<string, { old: any, new: any }> = {};

            const strategyName = parsedFields.strategyName;
            const existingMatch = strategyName ? existingProfiles.find(p => p.strategyName?.toLowerCase() === strategyName.toLowerCase()) : undefined;

            if (existingMatch) {
                // Tiered Volume Logic: If the deal is tiered, split the incoming total volume
                const merged = { ...existingMatch, ...parsedFields };
                
                if (existingMatch.isTieredPricing) {
                    // Logic for Sales Volume
                    if (parsedFields.deliveredVolume !== undefined) {
                        const incomingTotal = parsedFields.deliveredVolume;
                        const t1Threshold = existingMatch.deliveredVolume || 0; // Existing T1 volume acts as threshold
                        
                        if (t1Threshold > 0 && incomingTotal > t1Threshold) {
                            merged.deliveredVolume = t1Threshold;
                            merged.tier2DeliveredVolume = incomingTotal - t1Threshold;
                        } else {
                            // If smaller or threshold not set, just keep as Tier 1
                            merged.deliveredVolume = incomingTotal;
                            merged.tier2DeliveredVolume = 0;
                        }
                    }

                    // Logic for Purchase Volume
                    if (parsedFields.loadedVolume !== undefined) {
                        const incomingTotal = parsedFields.loadedVolume;
                        const t1Threshold = existingMatch.loadedVolume || 0;
                        
                        if (t1Threshold > 0 && incomingTotal > t1Threshold) {
                            merged.loadedVolume = t1Threshold;
                            merged.tier2LoadedVolume = incomingTotal - t1Threshold;
                        } else {
                            merged.loadedVolume = incomingTotal;
                            merged.tier2LoadedVolume = 0;
                        }
                    }
                }

                const isRealized = merged.pnlBucket === PnLBucket.Realized;
                finalProfile = recalculateProfile(merged, !isRealized) as CargoProfile;
                status = 'Update';

                (Object.keys(finalProfile) as Array<keyof CargoProfile>).forEach(key => {
                    if (key === 'id') return;
                    const oldVal = (existingMatch as any)[key];
                    const newVal = (finalProfile as any)[key];
                    if (oldVal !== newVal) {
                         if (typeof oldVal === 'number' && typeof newVal === 'number' && Math.abs(oldVal - newVal) < 0.001) return;
                         if (!oldVal && !newVal) return;
                         changes[key as string] = { old: oldVal, new: newVal };
                    }
                });
                if (Object.keys(changes).length === 0) status = 'No Change';

            } else {
                const baseProfile = { ...EmptyCargoProfile, id: Date.now().toString() + Math.random().toString().slice(2, 6), ...parsedFields };
                if (!baseProfile.strategyName) baseProfile.strategyName = generateStrategyName(baseProfile);
                if (!baseProfile.loadedVolume && baseProfile.deliveredVolume) baseProfile.loadedVolume = baseProfile.deliveredVolume;
                finalProfile = recalculateProfile(baseProfile, true) as CargoProfile;
                status = 'New';
            }
            
            processedProfiles.push({ ...finalProfile, _status: status, _changes: changes });
        }

        setParsedRows(processedProfiles);
        const defaultSelected = new Set<number>();
        processedProfiles.forEach((row, idx) => {
            if (row._status === 'New' || row._status === 'Update') defaultSelected.add(idx);
        });
        setSelectedIndices(defaultSelected);
        setIgnoredChanges({});
        setStep('preview');

    } catch (e) {
        console.error(e);
        toast.error("Failed to parse table data");
    }
  };

  const toggleFieldChange = (rowIndex: number, field: string) => {
      setIgnoredChanges(prev => {
          const rowSet = new Set(prev[rowIndex] || []);
          if (rowSet.has(field)) rowSet.delete(field); else rowSet.add(field);
          return { ...prev, [rowIndex]: rowSet };
      });
  };

  const handleFinish = () => {
      const finalImports: CargoProfile[] = [];
      parsedRows.forEach((row: any, idx: number) => {
          if (!selectedIndices.has(idx)) return;
          if (row._status === 'New' || row._status === 'No Change') {
              const { _status, _changes, ...rest } = row;
              finalImports.push(rest as CargoProfile);
          } else {
              const ignoredFields = ignoredChanges[idx] || new Set();
              if (ignoredFields.size === 0) {
                  const { _status, _changes, ...rest } = row;
                  finalImports.push(rest as CargoProfile);
              } else {
                  const original = existingProfiles.find(p => p.id === row.id);
                  if (!original) return;
                  const mixed: any = { ...row };
                  ignoredFields.forEach((field: string) => mixed[field] = (original as any)[field]);
                  const { _status, _changes, ...cleanMixed } = mixed;
                  finalImports.push(recalculateProfile(cleanMixed, true) as CargoProfile);
              }
          }
      });
      onImport(finalImports);
      onClose();
  };

  const toggleRow = (index: number) => {
      const newSet = new Set(selectedIndices);
      if (newSet.has(index)) newSet.delete(index); else newSet.add(index);
      setSelectedIndices(newSet);
  };

  const toggleAll = () => {
      const actionableIndices = parsedRows.map((r, i) => r._status !== 'No Change' ? i : -1).filter(i => i !== -1);
      const allActionableSelected = actionableIndices.every(i => selectedIndices.has(i));
      if (allActionableSelected && actionableIndices.length > 0) setSelectedIndices(new Set());
      else setSelectedIndices(new Set([...Array.from(selectedIndices), ...actionableIndices]));
  };

  const actionableCount = parsedRows.filter(r => r._status !== 'No Change').length;
  const selectedActionableCount = parsedRows.filter((r, i) => r._status !== 'No Change' && selectedIndices.has(i)).length;
  const isAllSelected = actionableCount > 0 && actionableCount === selectedActionableCount;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
            <div>
                <h2 className="text-xl font-bold text-slate-800">Bulk Import: {step === 'paste' ? 'Paste Data' : 'Verify Differences'}</h2>
                <p className="text-xs text-slate-400 font-medium">
                    {step === 'paste' ? 'Paste your Excel/CSV table data below.' : 'Inspect changes and toggle individual field updates.'}
                </p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
            {step === 'paste' ? (
                <div className="space-y-4 h-full flex flex-col">
                    <textarea 
                        className="flex-1 w-full p-4 border border-slate-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 whitespace-pre"
                        placeholder="Strategy Name | Source | Volume | Status"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                    />
                </div>
            ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm min-w-max">
                    <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-slate-100 text-slate-500 uppercase font-black text-[10px] tracking-widest border-b border-slate-200 sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-4 text-center w-12 sticky left-0 bg-slate-100 z-20">
                                    <input type="checkbox" checked={isAllSelected} onChange={toggleAll} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                                </th>
                                <th className="px-4 py-4 text-center w-24">Status</th>
                                <th className="px-6 py-4 w-48 sticky left-12 bg-slate-100 z-20 border-r border-slate-200">Strategy Name</th>
                                <th className="px-4 py-4">Buyer/Source</th>
                                <th className="px-4 py-4">Loading Date</th>
                                <th className="px-4 py-4">Delivery Date</th>
                                <th className="px-4 py-4 text-right">Vol (MT/U)</th>
                                <th className="px-4 py-4">Formula</th>
                                <th className="px-4 py-4 text-right">Price</th>
                                <th className="px-4 py-4 text-right">P&L</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {parsedRows.map((row: any, i: number) => (
                                <tr key={i} className={`hover:bg-indigo-50/20 transition-colors group ${!selectedIndices.has(i) ? 'opacity-40 grayscale' : ''}`}>
                                    <td className="px-4 py-3 text-center sticky left-0 bg-white group-hover:bg-indigo-50/20 z-10">
                                        <input type="checkbox" checked={selectedIndices.has(i)} onChange={() => toggleRow(i)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                                            row._status === 'Update' ? 'bg-blue-50 text-blue-700 border-blue-100' : 
                                            row._status === 'New' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                                            'bg-slate-50 text-slate-400 border-slate-100'
                                        }`}>
                                            {row._status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 font-bold text-slate-700 sticky left-12 bg-white group-hover:bg-indigo-50/20 z-10 border-r border-slate-200">{row.strategyName}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col gap-1">
                                            <DiffCell row={row} rowIndex={i} field="source" isIgnored={ignoredChanges[i]?.has("source")} onToggle={toggleFieldChange} />
                                            <div className="h-px bg-slate-100 my-0.5" />
                                            <DiffCell row={row} rowIndex={i} field="buyer" isIgnored={ignoredChanges[i]?.has("buyer")} onToggle={toggleFieldChange} />
                                        </div>
                                    </td>
                                    <td className="px-4 py-3"><DiffCell row={row} rowIndex={i} field="loadingDate" isIgnored={ignoredChanges[i]?.has("loadingDate")} onToggle={toggleFieldChange} className="font-mono" /></td>
                                    <td className="px-4 py-3"><DiffCell row={row} rowIndex={i} field="deliveryDate" isIgnored={ignoredChanges[i]?.has("deliveryDate")} onToggle={toggleFieldChange} className="font-mono" /></td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex flex-col gap-1">
                                            <DiffCell row={row} rowIndex={i} field="loadedVolume" format={(v: any) => v?.toLocaleString()} isIgnored={ignoredChanges[i]?.has("loadedVolume")} onToggle={toggleFieldChange} className="font-mono" />
                                            <div className="h-px bg-slate-100 my-0.5" />
                                            <DiffCell row={row} rowIndex={i} field="deliveredVolume" format={(v: any) => v?.toLocaleString()} isIgnored={ignoredChanges[i]?.has("deliveredVolume")} onToggle={toggleFieldChange} className="font-mono" />
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                         <div className="flex flex-col gap-1">
                                            <DiffCell row={row} rowIndex={i} field="buyFormula" isIgnored={ignoredChanges[i]?.has("buyFormula")} onToggle={toggleFieldChange} className="text-[10px]" />
                                            <div className="h-px bg-slate-100 my-0.5" />
                                            <DiffCell row={row} rowIndex={i} field="sellFormula" isIgnored={ignoredChanges[i]?.has("sellFormula")} onToggle={toggleFieldChange} className="text-[10px]" />
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex flex-col gap-1">
                                            <DiffCell row={row} rowIndex={i} field="absoluteBuyPrice" format={(v: any) => Number(v || 0).toFixed(3)} isIgnored={ignoredChanges[i]?.has("absoluteBuyPrice")} onToggle={toggleFieldChange} className="font-mono" />
                                            <div className="h-px bg-slate-100 my-0.5" />
                                            <DiffCell row={row} rowIndex={i} field="absoluteSellPrice" format={(v: any) => Number(v || 0).toFixed(3)} isIgnored={ignoredChanges[i]?.has("absoluteSellPrice")} onToggle={toggleFieldChange} className="font-mono" />
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <DiffCell row={row} rowIndex={i} field="finalTotalPnL" format={(v: any) => v?.toLocaleString(undefined, { maximumFractionDigits: 0 })} isIgnored={ignoredChanges[i]?.has("finalTotalPnL")} onToggle={toggleFieldChange} className={`font-mono font-bold ${row.finalTotalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
        <div className="p-6 border-t border-slate-100 bg-white flex justify-between items-center">
             <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
                {step === 'preview' && (
                    <>
                        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-400"></span> New</div>
                        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-blue-400"></span> Updated</div>
                    </>
                )}
            </div>
             <div className="flex gap-3">
                <button onClick={onClose} className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-50 rounded-xl border border-slate-200 transition-all">Cancel</button>
                {step === 'paste' ? (
                    <button onClick={handleParse} className="px-8 py-2.5 bg-indigo-600 text-white font-black rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">Review Changes</button>
                ) : (
                    <button onClick={handleFinish} className="px-8 py-2.5 bg-emerald-600 text-white font-black rounded-xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 disabled:opacity-50 transition-all" disabled={selectedIndices.size === 0}>
                        Import {selectedIndices.size} Updates
                    </button>
                )}
             </div>
        </div>
      </motion.div>
    </div>
  );
};
