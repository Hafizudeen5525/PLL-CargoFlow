import React, { useState } from 'react';
import { CargoProfile, PnLBucket, EmptyCargoProfile } from '../types';
import { recalculateProfile, generateStrategyName } from '../services/calculationService';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';

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
  loadingDate: ['loading date', 'load date', 'bl date'],
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

interface DiffCellProps {
    row: any;
    field: string;
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
                onClick={() => onToggle(rowIndex, field)}
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
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [step, setStep] = useState<'paste' | 'preview'>('paste');
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [ignoredChanges, setIgnoredChanges] = useState<Record<number, Set<string>>>({});

  const parseDate = (raw: string): string => {
    if (!raw) return '';
    const d = new Date(raw);
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
        const headers = rows[0].split(/\t|,/).map(h => h.trim().toLowerCase().replace(/['"]+/g, ''));
        const mapIndices: Record<string, number> = {};
        
        headers.forEach((h, index) => {
            for (const [key, aliases] of Object.entries(COLUMN_MAPPING)) {
                if (aliases.some(alias => h.includes(alias))) {
                    if (mapIndices[key] === undefined) mapIndices[key] = index;
                }
            }
        });

        const processedProfiles: any[] = [];
        
        for (let i = 1; i < rows.length; i++) {
            const rowStr = rows[i].trim();
            if (!rowStr) continue;
            const cells = rowStr.split(rowStr.includes('\t') ? '\t' : ',').map(c => c.trim().replace(/^"|"$/g, ''));
            const parsedFields: Partial<CargoProfile> = {};
            
            Object.entries(mapIndices).forEach(([key, index]) => {
                if (cells[index]) {
                    const rawVal = cells[index];
                    if (key.includes('Volume')) {
                        const volNum = parseFloat(rawVal.replace(/[^0-9.-]/g, ''));
                        if (!isNaN(volNum)) (parsedFields as any)[key] = volNum;
                    } else if (key.includes('Date')) {
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

            const strategyName = parsedFields.strategyName;
            const existingMatch = strategyName ? existingProfiles.find(p => p.strategyName?.toLowerCase() === strategyName.toLowerCase()) : undefined;

            let finalProfile: CargoProfile;
            let status: 'New' | 'Update' | 'No Change' = 'New';
            let changes: Record<string, { old: any, new: any }> = {};

            if (existingMatch) {
                const merged = { ...existingMatch, ...parsedFields };
                
                // --- Robust Tiered Volume Splitting Logic ---
                if (existingMatch.isTieredPricing) {
                    // Purchase Volume Split
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
                    // Sales Volume Split
                    if (parsedFields.deliveredVolume !== undefined) {
                        const incomingTotal = parsedFields.deliveredVolume;
                        const t1Threshold = existingMatch.deliveredVolume || 0;
                        if (t1Threshold > 0 && incomingTotal > t1Threshold) {
                            merged.deliveredVolume = t1Threshold;
                            merged.tier2DeliveredVolume = incomingTotal - t1Threshold;
                        } else {
                            merged.deliveredVolume = incomingTotal;
                            merged.tier2DeliveredVolume = 0;
                        }
                    }
                }

                const isRealized = merged.pnlBucket === PnLBucket.Realized;
                finalProfile = recalculateProfile(merged, !isRealized) as CargoProfile;
                status = 'Update';

                // Detect changes
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

                // Add virtual "Total Volume" tracking for visual feedback in the preview table
                const oldTotalDel = (existingMatch.deliveredVolume || 0) + (existingMatch.tier2DeliveredVolume || 0);
                const newTotalDel = (finalProfile.deliveredVolume || 0) + (finalProfile.tier2DeliveredVolume || 0);
                if (Math.abs(oldTotalDel - newTotalDel) > 0.1) {
                    changes['totalDeliveredVolume'] = { old: oldTotalDel, new: newTotalDel };
                }
                const oldTotalLoad = (existingMatch.loadedVolume || 0) + (existingMatch.tier2LoadedVolume || 0);
                const newTotalLoad = (finalProfile.loadedVolume || 0) + (finalProfile.tier2LoadedVolume || 0);
                if (Math.abs(oldTotalLoad - newTotalLoad) > 0.1) {
                    changes['totalLoadedVolume'] = { old: oldTotalLoad, new: newTotalLoad };
                }

                if (Object.keys(changes).length === 0) status = 'No Change';

            } else {
                const baseProfile = { ...EmptyCargoProfile, id: Date.now().toString() + Math.random().toString().slice(2, 6), ...parsedFields };
                if (!baseProfile.strategyName) baseProfile.strategyName = generateStrategyName(baseProfile);
                finalProfile = recalculateProfile(baseProfile, true) as CargoProfile;
            }
            
            processedProfiles.push({ 
                ...finalProfile, 
                _status: status, 
                _changes: changes,
                totalLoadedVolume: (finalProfile.loadedVolume || 0) + (finalProfile.tier2LoadedVolume || 0),
                totalDeliveredVolume: (finalProfile.deliveredVolume || 0) + (finalProfile.tier2DeliveredVolume || 0)
            });
        }

        setParsedRows(processedProfiles);
        const defaultSelected = new Set<number>();
        processedProfiles.forEach((row, idx) => { if (row._status !== 'No Change') defaultSelected.add(idx); });
        setSelectedIndices(defaultSelected);
        setStep('preview');
    } catch (e) {
        toast.error("Failed to parse table data");
    }
  };

  const handleFinish = () => {
      const finalImports: CargoProfile[] = [];
      parsedRows.forEach((row: any, idx: number) => {
          if (!selectedIndices.has(idx)) return;
          const { _status, _changes, totalLoadedVolume, totalDeliveredVolume, ...rest } = row;
          
          if (row._status === 'Update') {
              const ignoredFields = ignoredChanges[idx] || new Set();
              const original = existingProfiles.find(p => p.id === row.id);
              if (original && ignoredFields.size > 0) {
                  const mixed: any = { ...row };
                  ignoredFields.forEach((field: string) => {
                      if (field === 'totalDeliveredVolume') {
                          mixed.deliveredVolume = original.deliveredVolume;
                          mixed.tier2DeliveredVolume = original.tier2DeliveredVolume;
                      } else if (field === 'totalLoadedVolume') {
                          mixed.loadedVolume = original.loadedVolume;
                          mixed.tier2LoadedVolume = original.tier2LoadedVolume;
                      } else {
                          mixed[field] = (original as any)[field];
                      }
                  });
                  finalImports.push(recalculateProfile(mixed, true) as CargoProfile);
                  return;
              }
          }
          finalImports.push(rest as CargoProfile);
      });
      onImport(finalImports);
      onClose();
  };

  const isAllSelected = parsedRows.length > 0 && selectedIndices.size === parsedRows.filter(r => r._status !== 'No Change').length;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
            <h2 className="text-xl font-bold text-slate-800">Bulk Import: {step === 'paste' ? 'Paste Data' : 'Review Splits & P&L'}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
            {step === 'paste' ? (
                <textarea 
                    className="w-full h-64 p-4 border border-slate-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-blue-500/20"
                    placeholder="Paste Strategy Name | Source | Volume | Status"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                />
            ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm min-w-max">
                    <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-slate-100 text-slate-500 uppercase font-black text-[10px] tracking-widest border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-4 text-center w-12"><input type="checkbox" checked={isAllSelected} onChange={() => { if (isAllSelected) setSelectedIndices(new Set()); else setSelectedIndices(new Set(parsedRows.map((_, i) => i))); }} /></th>
                                <th className="px-4 py-4 text-center w-24">Status</th>
                                <th className="px-6 py-4 w-48">Strategy Name</th>
                                <th className="px-4 py-4">Loading Date</th>
                                <th className="px-4 py-4">Delivery Date</th>
                                <th className="px-4 py-4 text-right">Total Vol (MT/U)</th>
                                <th className="px-4 py-4 text-right">P&L</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {parsedRows.map((row: any, i: number) => (
                                <tr key={i} className={`hover:bg-indigo-50/20 group ${!selectedIndices.has(i) ? 'opacity-40 grayscale' : ''}`}>
                                    <td className="px-4 py-3 text-center"><input type="checkbox" checked={selectedIndices.has(i)} onChange={() => { const s = new Set(selectedIndices); if (s.has(i)) s.delete(i); else s.add(i); setSelectedIndices(s); }} /></td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${row._status === 'Update' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>{row._status}</span>
                                    </td>
                                    <td className="px-6 py-3 font-bold text-slate-700">{row.strategyName}</td>
                                    <td className="px-4 py-3 font-mono">{row.loadingDate}</td>
                                    <td className="px-4 py-3 font-mono">{row.deliveryDate}</td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex flex-col gap-1">
                                            <DiffCell row={row} rowIndex={i} field="totalLoadedVolume" format={(v) => v?.toLocaleString()} isIgnored={ignoredChanges[i]?.has("totalLoadedVolume")} onToggle={(idx, f) => { const s = new Set(ignoredChanges[idx] || []); if (s.has(f)) s.delete(f); else s.add(f); setIgnoredChanges({ ...ignoredChanges, [idx]: s }); }} className="font-mono" />
                                            <div className="h-px bg-slate-100 my-0.5" />
                                            <DiffCell row={row} rowIndex={i} field="totalDeliveredVolume" format={(v) => v?.toLocaleString()} isIgnored={ignoredChanges[i]?.has("totalDeliveredVolume")} onToggle={(idx, f) => { const s = new Set(ignoredChanges[idx] || []); if (s.has(f)) s.delete(f); else s.add(f); setIgnoredChanges({ ...ignoredChanges, [idx]: s }); }} className="font-mono" />
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <DiffCell row={row} rowIndex={i} field="finalTotalPnL" format={(v) => Number(v).toLocaleString()} isIgnored={ignoredChanges[i]?.has("finalTotalPnL")} onToggle={(idx, f) => { const s = new Set(ignoredChanges[idx] || []); if (s.has(f)) s.delete(f); else s.add(f); setIgnoredChanges({ ...ignoredChanges, [idx]: s }); }} className={`font-mono font-bold ${row.finalTotalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
        <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
            <button onClick={onClose} className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-50 rounded-xl">Cancel</button>
            {step === 'paste' ? (
                <button onClick={handleParse} className="px-8 py-2.5 bg-indigo-600 text-white font-black rounded-xl">Review Changes</button>
            ) : (
                <button onClick={handleFinish} className="px-8 py-2.5 bg-emerald-600 text-white font-black rounded-xl" disabled={selectedIndices.size === 0}>Import {selectedIndices.size} Updates</button>
            )}
        </div>
      </motion.div>
    </div>
  );
};
