import React, { useState } from 'react';
import { CargoProfile, PnLBucket, EmptyCargoProfile } from '../types';
import { recalculateProfile, generateStrategyName } from '../services/calculationService';
import { toast } from 'react-hot-toast';

interface BulkImportModalProps {
  existingProfiles: CargoProfile[];
  onClose: () => void;
  onImport: (profiles: CargoProfile[]) => void;
}

// Maps likely header names to CargoProfile keys
const COLUMN_MAPPING: Record<string, string[]> = {
  strategyName: ['strategy', 'name', 'deal', 'id', 'ref'],
  source: ['source', 'origin', 'load port', 'loading port'],
  buyer: ['buyer', 'customer', 'client', 'destination', 'disport'],
  deliveryDate: ['delivery', 'arrival', 'end date', 'del date', 'delivery month'],
  loadingDate: ['loading', 'load date', 'start date', 'bl date', 'loading month'],
  deliveredVolume: ['volume', 'vol', 'quantity', 'qty', 'mmbtu', 'bbl'],
  
  // Formulas vs Explicit Prices
  sellFormula: ['sell formula', 'sales formula'],
  absoluteSellPrice: ['sell price', 'sales price', 'unit price', 'final price'],
  buyFormula: ['buy formula', 'purchase formula'],
  absoluteBuyPrice: ['buy price', 'purchase price', 'cost price'],
  
  // Financials
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

export const BulkImportModal: React.FC<BulkImportModalProps> = ({ existingProfiles, onClose, onImport }) => {
  const [inputText, setInputText] = useState('');
  const [parsedRows, setParsedRows] = useState<(CargoProfile & { _status: 'New' | 'Update' })[]>([]);
  const [step, setStep] = useState<'paste' | 'preview'>('paste');

  const parseDate = (raw: string): string => {
    if (!raw) return '';
    const str = raw.trim();

    // Helper for months
    const months: Record<string, string> = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
        january: '01', february: '02', march: '03', april: '04', june: '06',
        july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
    };

    // 1. Check for DD-MMM-YY or DD-MMM-YYYY (e.g. 15-Jan-25)
    const ddMmmYy = str.match(/^(\d{1,2})[\s\-\/]+([a-zA-Z]{3,})[\s\-\/]+(\d{2,4})$/);
    if (ddMmmYy) {
        const d = ddMmmYy[1].padStart(2, '0');
        const mStr = ddMmmYy[2].toLowerCase().slice(0, 3);
        let y = ddMmmYy[3];
        if (y.length === 2) y = `20${y}`;
        const m = months[mStr];
        if (m) return `${y}-${m}-${d}`;
    }

    // 2. Check for MMM-YY (e.g. Jan-25) -> Treat as 1st of month
    const mmmYy = str.match(/^([a-zA-Z]{3,})[\s\-\']+(\d{2})$/);
    if (mmmYy) {
        const mStr = mmmYy[1].toLowerCase().slice(0, 3);
        const yStr = mmmYy[2];
        const m = months[mStr];
        if (m) return `20${yStr}-${m}-01`;
    }

    // 3. Try standard Date constructor
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
         return d.toISOString().split('T')[0];
    }
    
    // 4. Try DD/MM/YYYY or MM/DD/YYYY numeric formats
    const parts = str.split(/[\/\-\.]/);
    if (parts.length === 3) {
        // Heuristic: If last part is year
        const p2 = parseInt(parts[2]); // Year part
        
        if (p2 > 31 || parts[2].length === 4) {
             const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
             return `${y}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`; 
        }
    }
    
    return '';
  };

  const handleParse = () => {
    if (!inputText.trim()) {
        toast.error("Clipboard is empty");
        return;
    }

    try {
        const rows = inputText.trim().split('\n');
        if (rows.length < 2) {
             toast.error("Need at least a header row and one data row");
             return;
        }

        // 1. Identify Headers
        const headers = rows[0].split(/\t|,/).map(h => h.trim().toLowerCase().replace(/['"]+/g, ''));
        
        // 2. Map Headers to Keys
        const mapIndices: Record<string, number> = {};
        
        headers.forEach((h, index) => {
            // Prioritize exact matches first?
            // Simple iteration through map
            for (const [key, aliases] of Object.entries(COLUMN_MAPPING)) {
                if (aliases.some(alias => h.includes(alias))) {
                    // Only assign if not already assigned (First Match Wins)
                    // Or prioritize specific ones? e.g. "Sell Price" vs "Sell Formula"
                    // Our mapping keys are distinct enough now.
                    if (mapIndices[key] === undefined) mapIndices[key] = index;
                }
            }
        });

        if (Object.keys(mapIndices).length === 0) {
            toast.error("Could not match any columns. Please check your headers.");
            return;
        }

        // 3. Process Rows
        const processedProfiles: (CargoProfile & { _status: 'New' | 'Update' })[] = [];
        
        for (let i = 1; i < rows.length; i++) {
            const rowStr = rows[i].trim();
            if (!rowStr) continue;
            
            const isTab = rowStr.includes('\t');
            const cells = rowStr.split(isTab ? '\t' : ',').map(c => c.trim().replace(/^"|"$/g, ''));
            
            // Extract fields from row
            const parsedFields: Partial<CargoProfile> = {};
            
            Object.entries(mapIndices).forEach(([key, index]) => {
                if (cells[index]) {
                    const rawVal = cells[index];
                    
                    if (['deliveredVolume', 'loadedVolume', 'absoluteSellPrice', 'absoluteBuyPrice', 
                         'salesRevenue', 'reconciledPurchaseCost', 'finalTotalPnL'].includes(key)) {
                        // Numeric Fields
                        const cleanNum = parseFloat(rawVal.replace(/[^0-9.-]/g, ''));
                        if (!isNaN(cleanNum)) (parsedFields as any)[key] = cleanNum;
                    } 
                    else if (key === 'deliveryDate' || key === 'loadingDate') {
                        (parsedFields as any)[key] = parseDate(rawVal);
                    } 
                    else if (key === 'pnlBucket') {
                        const val = rawVal.toLowerCase();
                        // CRITICAL FIX: Check 'unreal' before 'real'
                        if (val.includes('unreal')) parsedFields.pnlBucket = PnLBucket.Unrealized;
                        else if (val.includes('real')) parsedFields.pnlBucket = PnLBucket.Realized;
                    } 
                    else {
                        (parsedFields as any)[key] = rawVal;
                    }
                }
            });

            // Post-Process: Auto-Derive Month Strings if missing
            if (parsedFields.deliveryDate && !parsedFields.deliveryMonth) {
                parsedFields.deliveryMonth = formatMonthStr(parsedFields.deliveryDate);
            }
            if (parsedFields.loadingDate && !parsedFields.loadingMonth) {
                parsedFields.loadingMonth = formatMonthStr(parsedFields.loadingDate);
            }

            // Logic to Merge with Existing or Create New
            let baseProfile: CargoProfile;
            let status: 'New' | 'Update';

            const strategyName = parsedFields.strategyName;
            const existingMatch = strategyName 
                ? existingProfiles.find(p => p.strategyName?.toLowerCase() === strategyName.toLowerCase())
                : undefined;

            if (existingMatch) {
                // UPDATE: Merge parsed fields on top of existing profile
                baseProfile = { ...existingMatch, ...parsedFields };
                status = 'Update';
            } else {
                // NEW: Use defaults
                baseProfile = { 
                    ...EmptyCargoProfile, 
                    id: Date.now().toString() + Math.random().toString().slice(2, 6),
                    ...parsedFields 
                };
                if (!baseProfile.strategyName) {
                    baseProfile.strategyName = generateStrategyName(baseProfile);
                }
                status = 'New';
            }

            // Fallbacks for Volume linkage if creating new
            if (status === 'New') {
                if (!baseProfile.loadedVolume && baseProfile.deliveredVolume) baseProfile.loadedVolume = baseProfile.deliveredVolume;
            }

            // Pricing Logic:
            // If Unrealized: FORCE calc (use formulas + market data).
            // If Realized: DO NOT FORCE calc (keep pasted prices/revenues).
            const isRealized = baseProfile.pnlBucket === PnLBucket.Realized;
            const forceCalc = !isRealized; 

            const finalProfile = recalculateProfile(baseProfile, forceCalc) as (CargoProfile & { _status: 'New' | 'Update' });
            finalProfile._status = status;
            
            processedProfiles.push(finalProfile);
        }

        setParsedRows(processedProfiles);
        setStep('preview');
        toast.success(`Parsed ${processedProfiles.length} rows`);

    } catch (e) {
        console.error(e);
        toast.error("Failed to parse table data");
    }
  };

  const handleFinish = () => {
      // Strip the temporary _status field before returning
      const cleanProfiles = parsedRows.map(({ _status, ...rest }) => rest as CargoProfile);
      onImport(cleanProfiles);
      onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
            <h2 className="text-xl font-bold text-slate-800">Bulk Import & Update</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
            {step === 'paste' ? (
                <div className="space-y-4 h-full flex flex-col">
                    <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm border border-blue-100">
                        <strong>Instructions:</strong> Paste your table from Excel below.
                        <ul className="list-disc ml-5 mt-2 opacity-80">
                            <li>To <strong>Update</strong> existing cargos, ensure the <strong>Strategy Name</strong> matches exactly.</li>
                            <li>To <strong>Create</strong> new cargos, use a new or empty Strategy Name.</li>
                            <li><strong>Realized Cargos:</strong> Pasted prices/revenues/P&L are preserved. Formulas are ignored.</li>
                            <li><strong>Unrealized Cargos:</strong> Formulas are used to calculate fresh prices from Market Data.</li>
                        </ul>
                    </div>
                    <textarea 
                        className="flex-1 w-full p-4 border border-slate-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 whitespace-pre"
                        placeholder={`Strategy Name\tSource\tVolume\tSell Formula\tStatus\nSN2024_Existing\t\t55000\tJKM + 0.1\tUnrealized\t(Recalculates Price)\nPast_Cargo\tQatar\t60000\t\tRealized\t(Uses existing/pasted numbers)`}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                    />
                </div>
            ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-sm">
                    <table className="w-full text-xs text-left bg-white whitespace-nowrap">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-100 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 font-bold text-center">Status</th>
                                <th className="px-4 py-3 font-bold">Strategy</th>
                                <th className="px-4 py-3 font-bold">Source</th>
                                <th className="px-4 py-3 font-bold">Buyer</th>
                                <th className="px-4 py-3 font-bold">Date</th>
                                <th className="px-4 py-3 font-bold text-right">Vol</th>
                                <th className="px-4 py-3 font-bold">Sell Formula</th>
                                <th className="px-4 py-3 font-bold text-right">Price</th>
                                <th className="px-4 py-3 font-bold text-right">P&L</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {parsedRows.map((row, i) => (
                                <tr key={i} className={`hover:bg-slate-50 ${row._status === 'Update' ? 'bg-blue-50/30' : ''}`}>
                                    <td className="px-4 py-2 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                            row._status === 'Update' 
                                            ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                                            : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                        }`}>
                                            {row._status}
                                        </span>
                                        <div className="mt-1 text-[9px] text-slate-400 uppercase">{row.pnlBucket}</div>
                                    </td>
                                    <td className="px-4 py-2 font-medium text-slate-700">{row.strategyName}</td>
                                    <td className="px-4 py-2 text-slate-600">{row.source}</td>
                                    <td className="px-4 py-2 text-slate-600">{row.buyer}</td>
                                    <td className="px-4 py-2 text-slate-600">{row.deliveryDate}</td>
                                    <td className="px-4 py-2 text-slate-600 text-right">{row.deliveredVolume?.toLocaleString()}</td>
                                    <td className="px-4 py-2 text-slate-600 font-mono text-[10px]">{row.sellFormula}</td>
                                    <td className="px-4 py-2 text-slate-600 text-right font-mono text-[10px]">
                                        {row.absoluteSellPrice ? `$${row.absoluteSellPrice.toFixed(2)}` : '-'}
                                    </td>
                                    <td className={`px-4 py-2 font-bold text-right ${row.finalTotalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {row.finalTotalPnL?.toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-white flex justify-end gap-3">
             {step === 'paste' ? (
                <button 
                    onClick={handleParse}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-lg shadow-blue-600/20"
                >
                    Parse Table
                </button>
             ) : (
                <>
                    <button 
                        onClick={() => setStep('paste')}
                        className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg"
                    >
                        Back
                    </button>
                    <button 
                        onClick={handleFinish}
                        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg shadow-lg shadow-emerald-600/20"
                    >
                        Process {parsedRows.length} Cargos
                    </button>
                </>
             )}
        </div>
      </div>
    </div>
  );
};