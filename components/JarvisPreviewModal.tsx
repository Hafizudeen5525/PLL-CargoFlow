
import React, { useState } from 'react';
import { CargoProfile, PnLBucket } from '../types';
import { recalculateProfile } from '../services/calculationService';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';

interface JarvisPreviewModalProps {
  existingProfiles: CargoProfile[];
  parsedRows: any[];
  onClose: () => void;
  onImport: (profiles: CargoProfile[]) => void;
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
             return <div className={`text-slate-600 ${className}`}>{format ? format(val) : val}</div>;
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

export const JarvisPreviewModal: React.FC<JarvisPreviewModalProps> = ({ existingProfiles, parsedRows, onClose, onImport }) => {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set(parsedRows.map((_, i) => i).filter(i => parsedRows[i]._status !== 'No Change')));
  const [ignoredChanges, setIgnoredChanges] = useState<Record<number, Set<string>>>({});

  const toggleFieldChange = (rowIndex: number, field: string) => {
      setIgnoredChanges(prev => {
          const rowSet = new Set(prev[rowIndex] || []);
          if (rowSet.has(field)) rowSet.delete(field); else rowSet.add(field);
          return { ...prev, [rowIndex]: rowSet };
      });
  };

  const handleFinish = () => {
      const finalImports: CargoProfile[] = [];
      parsedRows.forEach((row, idx) => {
          if (!selectedIndices.has(idx)) return;
          
          if (row._status === 'Update') {
              const ignoredFields = ignoredChanges[idx] || new Set();
              const original = existingProfiles.find(p => p.strategyName === row.strategyName);
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
                  const { _status, _changes, totalLoadedVolume, totalDeliveredVolume, ...cleanMixed } = mixed;
                  finalImports.push(recalculateProfile(cleanMixed, true) as CargoProfile);
                  return;
              }
          }
          const { _status, _changes, totalLoadedVolume, totalDeliveredVolume, ...rest } = row;
          finalImports.push(rest as CargoProfile);
      });
      onImport(finalImports);
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
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[200]">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
            <div>
                <h2 className="text-xl font-bold text-slate-800">Jarvis Macro Import: Preview Changes</h2>
                <p className="text-xs text-slate-400 font-medium">Verify differences between current app state and the uploaded Jarvis SNs.</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>

        <div className="flex-1 overflow-auto p-6 bg-slate-50/50 custom-scrollbar">
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
                            <th className="px-4 py-4 text-right">Total Vol (MT/U)</th>
                            <th className="px-4 py-4">Formula</th>
                            <th className="px-4 py-4 text-right">Price</th>
                            <th className="px-4 py-4">P&L Bucket</th>
                            <th className="px-4 py-4 text-right">Reconciled Cost/Rev</th>
                            <th className="px-4 py-4 text-right">SRC</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {parsedRows.map((row, i) => (
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
                                        <DiffCell row={row} rowIndex={i} field="totalLoadedVolume" format={(v) => v?.toLocaleString()} isIgnored={ignoredChanges[i]?.has("totalLoadedVolume")} onToggle={toggleFieldChange} className="font-mono" />
                                        <div className="h-px bg-slate-100 my-0.5" />
                                        <DiffCell row={row} rowIndex={i} field="totalDeliveredVolume" format={(v) => v?.toLocaleString()} isIgnored={ignoredChanges[i]?.has("totalDeliveredVolume")} onToggle={toggleFieldChange} className="font-mono" />
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
                                        <DiffCell row={row} rowIndex={i} field="absoluteBuyPrice" format={(v) => Number(v || 0).toFixed(3)} isIgnored={ignoredChanges[i]?.has("absoluteBuyPrice")} onToggle={toggleFieldChange} className="font-mono" />
                                        <div className="h-px bg-slate-100 my-0.5" />
                                        <DiffCell row={row} rowIndex={i} field="absoluteSellPrice" format={(v) => Number(v || 0).toFixed(3)} isIgnored={ignoredChanges[i]?.has("absoluteSellPrice")} onToggle={toggleFieldChange} className="font-mono" />
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <DiffCell 
                                        row={row} 
                                        rowIndex={i} 
                                        field="pnlBucket" 
                                        isIgnored={ignoredChanges[i]?.has("pnlBucket")} 
                                        onToggle={toggleFieldChange} 
                                        format={(v) => (
                                            <span className={`px-2 py-0.5 rounded-full font-bold text-[8px] uppercase ${v === PnLBucket.Realized ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {v}
                                            </span>
                                        )}
                                    />
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <div className="flex flex-col gap-1">
                                        <DiffCell row={row} rowIndex={i} field="reconciledPurchaseCost" format={(v) => v > 0 ? v.toLocaleString() : '-'} isIgnored={ignoredChanges[i]?.has("reconciledPurchaseCost")} onToggle={toggleFieldChange} className="font-mono" />
                                        <div className="h-px bg-slate-100 my-0.5" />
                                        <DiffCell row={row} rowIndex={i} field="reconciledSalesRevenue" format={(v) => v > 0 ? v.toLocaleString() : '-'} isIgnored={ignoredChanges[i]?.has("reconciledSalesRevenue")} onToggle={toggleFieldChange} className="font-mono" />
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <DiffCell row={row} rowIndex={i} field="reconciledSrcCost" format={(v) => v?.toLocaleString()} isIgnored={ignoredChanges[i]?.has("reconciledSrcCost")} onToggle={toggleFieldChange} className="font-mono" />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-white flex justify-between items-center">
            <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-400"></span> New</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-blue-400"></span> Updated</div>
                <div className="flex items-center gap-1.5 opacity-50"><span className="w-2.5 h-2.5 rounded bg-slate-200"></span> Deselected</div>
            </div>
            <div className="flex gap-3">
                <button onClick={onClose} className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-50 rounded-xl border border-slate-200 transition-all">Cancel</button>
                <button onClick={handleFinish} disabled={selectedIndices.size === 0} className="px-8 py-2.5 bg-indigo-600 text-white font-black rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                    Import {selectedIndices.size} Strategies
                </button>
            </div>
        </div>
      </motion.div>
    </div>
  );
};
