
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CargoProfile, EmptyCargoProfile, PnLBucket } from '../types';
import { recalculateProfile, evaluateFormula, getIndexPrice, formatCurrency, formatPrice } from '../services/calculationService';
import { apiClient } from '../services/apiClient';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { ReconciliationData } from './DiscrepancyCheck';

interface CargoFormProps {
  initialData?: CargoProfile;
  source?: 'dashboard' | 'list';
  trmsData?: ReconciliationData;
  onSave: (data: CargoProfile) => void;
  onCancel: () => void;
  userRole?: 'admin' | 'trader' | 'viewer';
  existingSources?: string[];
}

const INDEX_OPTIONS = ['HH', 'HH Last Day', 'TTF', 'JKM', 'Dated Brent', 'JCC', 'BRIPE', 'NBP', 'AECO', 'STN 2', 'Fix and Firm'];
const INCOTERM_OPTIONS = ['FOB', 'DES', 'CIF', 'CFR', 'DAT'];
const VOLUME_UNIT_OPTIONS = ['MMBtu', 'CBM', 'MT', 'Bbl', 'Gal'];

const formatWithCommas = (val: number | string) => {
    if (val === undefined || val === null || val === '') return '';
    const num = Number(val);
    if (isNaN(num)) return String(val);
    // Use a fixed precision for display if it's a small number, or standard locale string
    return num.toLocaleString('en-US', { maximumFractionDigits: 4 });
};

const parseCommas = (val: string) => {
    return val.replace(/,/g, '');
};

const InputGroup: React.FC<{
    label: string;
    name: string;
    value: any;
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    type?: string;
    step?: string;
    readOnly?: boolean;
    disabled?: boolean;
    hint?: string;
    children?: React.ReactNode;
    className?: string;
    footer?: React.ReactNode;
    isFormatted?: boolean;
}> = React.memo(({ label, name, value, onChange, type = "text", step, readOnly = false, disabled = false, hint, children, className = "", footer, isFormatted = false }) => {
    const displayValue = isFormatted ? formatWithCommas(value) : value;

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const target = e.target as HTMLInputElement;

        if (isFormatted && target.type === 'text') {
            const val = target.value;
            const start = target.selectionStart || 0;
            
            // Count non-comma characters before the cursor to track "logical" position
            const rawBeforeCursor = val.slice(0, start).replace(/,/g, '');
            const logicalPos = rawBeforeCursor.length;

            const raw = parseCommas(val);
            // Only allow numbers, one decimal point, and leading minus
            if (raw !== '' && isNaN(Number(raw)) && raw !== '-' && raw !== '.') return;
            
            const fakeEvent = {
                ...e,
                target: {
                    ...e.target,
                    name: e.target.name,
                    value: raw
                }
            } as React.ChangeEvent<HTMLInputElement>;
            onChange(fakeEvent);
            
            // Restore cursor position after re-render/formatting
            // We count the same number of logical digits in the new value
            requestAnimationFrame(() => {
                const newVal = target.value;
                let newPos = 0;
                let foundDigits = 0;
                
                while (newPos < newVal.length && foundDigits < logicalPos) {
                    if (newVal[newPos] !== ',') {
                        foundDigits++;
                    }
                    newPos++;
                }
                
                target.setSelectionRange(newPos, newPos);
            });
        } else {
            onChange(e);
        }
    };

    return (
        <div className={`flex flex-col group relative ${className}`}>
          {label && <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5 ml-1">{label}</label>}
          <div className="relative">
            <input
                type={isFormatted ? 'text' : type}
                step={step}
                name={name}
                value={displayValue ?? ''}
                onChange={handleInputChange}
                readOnly={readOnly}
                disabled={disabled}
                className={`w-full px-3 py-2.5 sm:py-2.5 rounded-lg border text-sm transition-all shadow-sm ${
                    readOnly || disabled
                    ? 'bg-slate-50 border-slate-200 text-slate-500 font-mono cursor-not-allowed' 
                    : 'bg-white border-slate-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800'
                }`}
            />
            {children}
          </div>
          {hint && <p className="text-[10px] text-slate-400 mt-1 ml-1">{hint}</p>}
          {footer && <div className="mt-1.5">{footer}</div>}
        </div>
    );
});

const FormulaIndicesDisplay: React.FC<{ formula: string, refDate: string }> = ({ formula, refDate }) => {
    const [indices, setIndices] = useState<{ name: string, mDef: string, price: number }[]>([]);

    useEffect(() => {
        const fetchIndices = async () => {
            if (!formula || !refDate) {
                setIndices([]);
                return;
            }
            const found: { name: string, mDef: string, price: number }[] = [];
            const regex = /([a-zA-Z0-9\s]+?)(?:\(([^)]+)\))?\b/g;
            let match;
            const seen = new Set();
            const standardNames = [...INDEX_OPTIONS, 'HENRY HUB', 'DUTCH TTF', 'BRENT'];

            while ((match = regex.exec(formula)) !== null) {
                const rawName = match[1].trim().toUpperCase();
                const mDef = match[2] || 'n';
                const isKnown = standardNames.some(s => rawName === s || rawName.includes(s));
                if (isKnown && !seen.has(`${rawName}_${mDef}`)) {
                    const { price } = await getIndexPrice(rawName, refDate, mDef);
                    if (price > 0) {
                        found.push({ name: rawName, mDef, price });
                        seen.add(`${rawName}_${mDef}`);
                    }
                }
            }
            setIndices(found);
        };
        fetchIndices();
    }, [formula, refDate]);

    if (indices.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-2">
            {indices.map((idx, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">{idx.name} ({idx.mDef}):</span>
                    <span className="text-[10px] font-black text-blue-600 font-mono">${idx.price.toFixed(3)}</span>
                </div>
            ))}
        </div>
    );
};

const MONTH_OPTIONS = ['n', 'n+1', 'n-1', 'n-2', 'n-3', '(3,0,1)', '(3,2,1)', '(6,0,1)', '(3,0,3)', '(6,0,3)', 'None'];

const PercentageInput: React.FC<{
    name: string;
    value: any;
    onChange: (e: any) => void;
    readOnly?: boolean;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
}> = ({ name, value, onChange, readOnly, disabled, placeholder, className }) => {
    const [localValue, setLocalValue] = useState('');
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        if (!isFocused) {
            let nextLocal = '';
            if (value !== undefined && value !== null && value !== '') {
                const num = Number(value);
                if (isNaN(num)) {
                    nextLocal = String(value);
                } else {
                    // Display as percentage: 0.12 -> 12%
                    nextLocal = `${(num * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
                }
            }
            if (nextLocal !== localValue) {
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setLocalValue(nextLocal);
            }
        }
    }, [value, isFocused, localValue]);

    const handleBlur = () => {
        setIsFocused(false);
    };

    const handleFocus = () => {
        setIsFocused(true);
        if (value !== undefined && value !== null) {
            setLocalValue(String(value));
        }
    };

    return (
        <input 
            type="text" 
            name={name} 
            value={isFocused ? localValue : localValue} 
            onChange={(e) => {
                setLocalValue(e.target.value);
                onChange(e);
            }} 
            onFocus={handleFocus}
            onBlur={handleBlur}
            readOnly={readOnly} 
            disabled={disabled} 
            className={className} 
            placeholder={placeholder} 
        />
    );
};

const ComponentRow: React.FC<{
    type: 'buy' | 'sell' | 'tier2Sell' | 'tier2Buy';
    idx: number;
    formData: any;
    onChange: (e: any) => void;
    readOnly?: boolean;
    onIssueChange?: (id: string, message: string | null) => void;
}> = ({ type, idx, formData, onChange, readOnly = false, onIssueChange }) => {
    const [price, setPrice] = useState(0);
    const s = formData[`${type}Price${idx}Slope`];
    const index = formData[`${type}PriceIndex${idx}`];
    const mDef = formData[`${type}Price${idx}MonthDef`] || 'n';
    const c = formData[`${type}Price${idx}Constant`];
    
    const refDate = (type === 'buy' || type === 'tier2Buy') ? formData.loadingDate : formData.deliveryDate;

    useEffect(() => {
        const fetchPrice = async () => {
            const { price: p } = await getIndexPrice(index, refDate, mDef);
            setPrice(p);
        };
        fetchPrice();
    }, [index, refDate, mDef]);

    const hasPriceIssue = index && index !== 'Fix and Firm' && price === 0;
    const issueId = `${type}Price${idx}`;

    useEffect(() => {
        if (onIssueChange) {
            if (hasPriceIssue) {
                onIssueChange(issueId, `Price not found for ${index} (${mDef})`);
            } else {
                onIssueChange(issueId, null);
            }
        }
    }, [hasPriceIssue, index, mDef, issueId, onIssueChange]);

    const componentValue = (Number(s) || 0) * price + (Number(c) || 0);

    return (
        <div className={`grid grid-cols-12 gap-2 items-end p-3 rounded-lg border mb-2 transition-colors ${hasPriceIssue ? 'bg-red-50 border-red-200' : 'bg-slate-50/50 border-slate-100'}`}>
            <div className="col-span-4 sm:col-span-2">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Weight</label>
                <PercentageInput name={`${type}Price${idx}Weightage`} value={formData[`${type}Price${idx}Weightage`]} onChange={onChange} readOnly={readOnly} disabled={readOnly} className="w-full text-xs p-1.5 border rounded bg-white disabled:bg-slate-50 disabled:text-slate-500" placeholder="e.g. 0.5 or 50%" />
            </div>
            <div className="col-span-4 sm:col-span-2">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Slope</label>
                <PercentageInput name={`${type}Price${idx}Slope`} value={s} onChange={onChange} readOnly={readOnly} disabled={readOnly} className="w-full text-xs p-1.5 border rounded bg-white disabled:bg-slate-50 disabled:text-slate-500" placeholder="e.g. 0.12 or 12%" />
            </div>
            <div className="col-span-4 sm:col-span-2">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Index</label>
                <select name={`${type}PriceIndex${idx}`} value={index} onChange={onChange} disabled={readOnly} className="w-full text-xs p-1.5 border rounded bg-white disabled:bg-slate-50 disabled:text-slate-500">
                    <option value="">(None)</option>
                    {INDEX_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            </div>
            <div className="col-span-6 sm:col-span-2">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Month Def</label>
                <select name={`${type}Price${idx}MonthDef`} value={mDef} onChange={onChange} disabled={readOnly} className="w-full text-xs p-1.5 border rounded bg-white disabled:bg-slate-50 disabled:text-slate-500">
                    {MONTH_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            </div>
            <div className="col-span-6 sm:col-span-2">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Constant</label>
                <input type="text" name={`${type}Price${idx}Constant`} value={c} onChange={onChange} readOnly={readOnly} disabled={readOnly} className="w-full text-xs p-1.5 border rounded bg-white disabled:bg-slate-50 disabled:text-slate-500" />
            </div>
            <div className="col-span-12 sm:col-span-2 text-right border-t sm:border-t-0 border-slate-200 mt-1 pt-1 sm:mt-0 sm:pt-0">
                <div className="text-[9px] font-bold text-slate-400 uppercase">Result</div>
                <div className="text-[9px] text-slate-400 font-mono mb-0.5">Base: ${price.toFixed(3)}</div>
                <div className="text-xs font-bold text-blue-600 truncate">${componentValue.toFixed(3)}</div>
            </div>
        </div>
    );
};

export const CargoForm: React.FC<CargoFormProps> = ({ initialData, source = 'list', trmsData, onSave, onCancel, userRole, existingSources = [] }) => {
  const [formData, setFormData] = useState<any>({ ...EmptyCargoProfile });
  const [history, setHistory] = useState<{ past: any[], future: any[] }>({ past: [], future: [] });
  const skipHistoryRef = React.useRef(false);

  // Record history debounced to avoid lag during typing
  useEffect(() => {
    if (skipHistoryRef.current) {
        skipHistoryRef.current = false;
        return;
    }

    const timer = setTimeout(() => {
      setHistory(h => {
        // Only record if current formData is different from last recorded past
        const lastPast = h.past[h.past.length - 1];
        if (lastPast && JSON.stringify(lastPast) === JSON.stringify(formData)) return h;
        
        return {
          past: [...h.past, formData].slice(-50),
          future: []
        };
      });
    }, 1000); // 1 second debounce for history
    return () => clearTimeout(timer);
  }, [formData]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pricingMode, setPricingMode] = useState<'formula' | 'component'>('formula');
  const [showHedgingDetails, setShowHedgingDetails] = useState(false);
  const [showTrmsModal, setShowTrmsModal] = useState(false);
  const [asyncIssues, setAsyncIssues] = useState<Record<string, string>>({});

  const handleIssueChange = useCallback((id: string, message: string | null) => {
    setAsyncIssues(prev => {
        if (message === null) {
            if (!prev[id]) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
        }
        if (prev[id] === message) return prev;
        return { ...prev, [id]: message };
    });
  }, []);

  useEffect(() => {
    if (initialData) {
      const data = { ...initialData };
      setFormData(data);
      setHistory({ past: [], future: [] }); // Reset history on load
      if (initialData.buyPriceIndex1 || initialData.sellPriceIndex1 || initialData.tier2SellPriceIndex1 || initialData.tier2BuyPriceIndex1) {
          setPricingMode('component');
      }
    }
  }, [initialData]);

  const undoForm = useCallback(() => {
    if (history.past.length === 0) return;
    const prev = history.past[history.past.length - 1];
    const current = formData;
    
    skipHistoryRef.current = true;
    setHistory(h => ({
      past: h.past.slice(0, -1),
      future: [current, ...h.future]
    }));
    setFormData(prev);
    toast.success('Edit undone (local)', { icon: '↩️', duration: 1000 });
  }, [history.past, formData]);

  const redoForm = useCallback(() => {
    if (history.future.length === 0) return;
    const next = history.future[0];
    const current = formData;

    skipHistoryRef.current = true;
    setHistory(h => ({
      past: [...h.past, current],
      future: h.future.slice(1)
    }));
    setFormData(next);
    toast.success('Edit redone (local)', { icon: '↪️', duration: 1000 });
  }, [history.future, formData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        const isZ = e.key.toLowerCase() === 'z';
        const isY = e.key.toLowerCase() === 'y';
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const cmdKey = isMac ? e.metaKey : e.ctrlKey;
        
        if (cmdKey && isZ) {
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey) redoForm();
            else undoForm();
        } else if (cmdKey && isY) {
            e.preventDefault();
            e.stopPropagation();
            redoForm();
        }
    };
    window.addEventListener('keydown', handleKeyDown, true); // Use capture to intercept before App.tsx
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [undoForm, redoForm]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let newValue: any = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    
    // Fields that should be numeric but might come as strings
    const numericFields = [
      'tierLimit', 'totalLoadedVolume', 'totalDeliveredVolume', 
      'loadedVolume', 'deliveredVolume', 'tier2LoadedVolume', 'tier2DeliveredVolume',
      'absoluteBuyPrice', 'absoluteSellPrice', 'absoluteTier2BuyPrice', 'absoluteTier2SellPrice',
      'reconciledPurchaseCost', 'reconciledSalesRevenue', 'reconciledSrcCost', 'srcUnitFee'
    ];

    const isPercentageField = name.endsWith('Slope') || name.endsWith('Weightage');

    if (numericFields.includes(name) || type === 'number' || isPercentageField) {
        const raw = typeof value === 'string' ? parseCommas(value) : value;
        
        if (isPercentageField && typeof raw === 'string' && raw.includes('%')) {
            const num = parseFloat(raw.replace('%', ''));
            if (!isNaN(num)) {
                newValue = num / 100;
            } else {
                newValue = 0;
            }
        } else if (typeof raw === 'string' && raw.endsWith('.')) {
            newValue = raw; 
        } else {
            newValue = raw === '' ? 0 : parseFloat(raw);
            if (isNaN(newValue)) newValue = 0;
        }
    }
    
    // Immediate state update ONLY for the changed field
    setFormData((prev: any) => ({ ...prev, [name]: newValue }));
  }, []);

  // Debounced recalculation to avoid lag during rapid typing
  useEffect(() => {
    const timer = setTimeout(() => {
        setFormData((prev: any) => {
            const updated = recalculateProfile(prev);
            // Only update if something actually changed (primitive comparison of key metrics)
            if (updated.finalTotalPnL === prev.finalTotalPnL && 
                updated.absoluteBuyPrice === prev.absoluteBuyPrice && 
                updated.absoluteSellPrice === prev.absoluteSellPrice &&
                updated.totalLoadedVolume === prev.totalLoadedVolume &&
                updated.totalDeliveredVolume === prev.totalDeliveredVolume &&
                updated.loadedVolume === prev.loadedVolume &&
                updated.deliveredVolume === prev.deliveredVolume) {
                return prev;
            }
            return updated as any;
        });
    }, 150); // Small 150ms delay is enough to keep typing smooth
    return () => clearTimeout(timer);
  }, [
    formData.strategyName, formData.loadingDate, formData.deliveryDate,
    formData.totalLoadedVolume, formData.totalDeliveredVolume, formData.tierLimit,
    formData.buyFormula, formData.sellFormula, formData.isTieredPricing,
    formData.tier2BuyFormula, formData.tier2SellFormula,
    formData.buyPrice1Slope, formData.buyPrice1Weightage, formData.buyPriceIndex1,
    formData.sellPrice1Slope, formData.sellPrice1Weightage, formData.sellPriceIndex1,
    formData.isBuyPriceManual, formData.isSellPriceManual,
    formData.buyPriceOverallConstant, formData.sellPriceOverallConstant,
    formData.buyPriceRounding, formData.sellPriceRounding,
    formData.tier2BuyPriceRounding, formData.tier2SellPriceRounding
    // Add other critical fields that trigger recalculation
  ]);

  const handleManualPriceToggle = async (type: 'buy' | 'sell' | 'tier2sell' | 'tier2buy') => {
      const fieldMap: Record<string, string> = {
          buy: 'isBuyPriceManual',
          sell: 'isSellPriceManual',
          tier2sell: 'isTier2SellPriceManual',
          tier2buy: 'isTier2BuyPriceManual'
      };
      const up = { ...formData, [fieldMap[type]]: !formData[fieldMap[type]] };
      const recalculated = await recalculateProfile(up);
      
      setHistory(h => ({
        past: [...h.past, formData].slice(-50),
        future: []
      }));
      setFormData(recalculated);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    const loadingToast = toast.loading('AI Analysis in progress...');
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64String = event.target?.result as string;
        const base64Data = base64String.split(',')[1];
        const aiData = await apiClient.parseDocument(base64Data, file.type, false);
        const recalculated = await recalculateProfile({ ...formData, ...aiData });
        setFormData(recalculated);
        toast.success('Strategy successfully extracted', { id: loadingToast });
      };
      reader.readAsDataURL(file);
    } catch (err) {
      toast.error("AI Extraction failed", { id: loadingToast });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...formData, id: initialData?.id || '' });
  };

    const totalDeliveredVolume = (formData.deliveredVolume || 0) + (formData.tier2DeliveredVolume || 0);
    const totalLoadedVolume = (formData.loadedVolume || 0) + (formData.tier2LoadedVolume || 0);

    const calculatedSrcCost = formData.incoterms === 'DES' ? (formData.srcUnitFee || 0) * totalDeliveredVolume : 0;

    // Hedging Lookup from TRMS
    const trmsHedgingSummary = useMemo(() => {
        if (!trmsData || !formData.strategyName) return null;
        return trmsData.trmsAgg[formData.strategyName] || null;
    }, [trmsData, formData.strategyName]);

    const trmsDetailedTrades = useMemo(() => {
        if (!trmsData || !formData.strategyName) return [];
        return trmsData.hedging.filter(h => h['Strategy Name'] === formData.strategyName);
    }, [trmsData, formData.strategyName]);

    const physicalPnL = formData.finalPhysicalPnL || 0;
    const hedgingPnL = trmsHedgingSummary ? trmsHedgingSummary.hedgingPnL : 0;
    const displayPnL = physicalPnL;

    const issues = useMemo(() => {
        const i: { field: string, message: string }[] = [];
        if (!formData.strategyName) i.push({ field: 'strategyName', message: 'Strategy Name is missing' });
        if (!formData.loadingDate) i.push({ field: 'loadingDate', message: 'Loading Date is missing' });
        if (!formData.deliveryDate) i.push({ field: 'deliveryDate', message: 'Delivery Date is missing' });
        if (totalLoadedVolume <= 0) i.push({ field: 'totalLoadedVolume', message: 'Loaded Volume is zero' });
        if (totalDeliveredVolume <= 0) i.push({ field: 'totalDeliveredVolume', message: 'Delivered Volume is zero' });
        
        // Add async issues (like missing prices)
        Object.values(asyncIssues).forEach(msg => {
            i.push({ field: 'async', message: msg });
        });

        return i;
    }, [formData, totalLoadedVolume, totalDeliveredVolume, asyncIssues]);

    return (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-none sm:rounded-xl shadow-2xl border border-slate-200 flex flex-col w-full max-w-5xl h-full sm:max-h-[90vh] overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-stretch sm:items-center bg-white z-10 gap-4">
        <div className="flex items-center gap-4">
            <button 
                onClick={onCancel}
                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all"
                title={`Back to ${source === 'dashboard' ? 'Drilldown' : 'List'}`}
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <h2 className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight truncate">{initialData ? `Edit: ${initialData.strategyName}` : 'New Cargo Profile'}</h2>
        </div>
            
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200 ml-2">
                <button 
                    type="button"
                    onClick={undoForm}
                    disabled={history.past.length === 0}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                    title="Undo Change (Ctrl+Z)"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                </button>
                <div className="w-px h-3 bg-slate-200" />
                <button 
                    type="button"
                    onClick={redoForm}
                    disabled={history.future.length === 0}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                    title="Redo Change (Ctrl+Y)"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" /></svg>
                </button>
            </div>
        <div className="flex items-center gap-3">
            {userRole !== 'viewer' && (
              <>
                <input type="file" accept="image/*,application/pdf" onChange={handleFileUpload} className="hidden" id="kts-upload" />
                <label 
                    htmlFor="kts-upload" 
                    className={`flex-1 sm:flex-none justify-center px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-black rounded-xl shadow-xl cursor-pointer transition-all flex items-center gap-2 group relative overflow-hidden ${isProcessing ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white hover:shadow-indigo-200 hover:-translate-y-0.5 active:translate-y-0'}`}
                >
                    <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none"></div>
                    <svg className={`w-4 h-4 shrink-0 ${isProcessing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    {isProcessing ? 'Analyzing...' : 'Autopopulate via KTS'}
                </label>
              </>
            )}
        </div>
      </div>
      
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-50/50 space-y-6 sm:space-y-8 custom-scrollbar">
        {/* Validation Warnings Summary */}
        {issues.length > 0 && (
            <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <div className="flex-1">
                    <h4 className="text-xs font-bold text-red-800 uppercase tracking-tight mb-1">Form Data Issues Detected</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                        {issues.map((i, idx) => (
                            <div key={idx} className="text-[10px] text-red-600 flex items-center gap-1.5">
                                <div className="w-1 h-1 bg-red-400 rounded-full" />
                                {i.message}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* Physical Details Section */}
        <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-100 space-y-4 sm:space-y-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Physical Logistics & Schedule
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="sm:col-span-2 flex flex-col gap-2">
                    <div className="flex items-end gap-2">
                        <InputGroup label="Strategy Name" name="strategyName" value={formData.strategyName} onChange={handleChange} className="flex-1" readOnly={userRole === 'viewer'} />
                        {trmsData && formData.strategyName && (
                            <button 
                                type="button"
                                onClick={() => setShowTrmsModal(true)}
                                className="mb-0.5 p-2.5 bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-600 rounded-lg transition-all border border-slate-200 shrink-0"
                                title="View TRMS Raw Data"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5 ml-1">Source</label>
                    <input 
                      list="sources-list"
                      name="source" 
                      value={formData.source} 
                      onChange={handleChange} 
                      readOnly={userRole === 'viewer'}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-slate-50"
                    />
                    <datalist id="sources-list">
                      {existingSources.map(s => <option key={s} value={s} />)}
                    </datalist>
                </div>
                <InputGroup label="Buyer" name="buyer" value={formData.buyer} onChange={handleChange} readOnly={userRole === 'viewer'} />
                <InputGroup label="Loading Date" name="loadingDate" type="date" value={formData.loadingDate} onChange={handleChange} readOnly={userRole === 'viewer'} />
                <InputGroup label="Delivery Date" name="deliveryDate" type="date" value={formData.deliveryDate} onChange={handleChange} readOnly={userRole === 'viewer'} />
                <div className="flex flex-col">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5 ml-1">Volume Unit</label>
                  <select 
                    name="volumeUnit" 
                    value={formData.volumeUnit} 
                    onChange={handleChange} 
                    disabled={userRole === 'viewer'}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-slate-50"
                  >
                    <option value="">Select Unit</option>
                    {VOLUME_UNIT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5 ml-1">Incoterms</label>
                  <select name="incoterms" value={formData.incoterms} onChange={handleChange} disabled={userRole === 'viewer'} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed">
                    {INCOTERM_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
            </div>
        </div>

        <div className="bg-indigo-50/30 p-3 sm:p-4 rounded-xl border border-indigo-100/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${formData.isTieredPricing ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200/50' : 'bg-slate-200 text-slate-400'}`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                </div>
                <div>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-800">Two-Tier Pricing</h4>
                    <p className="text-[8px] sm:text-[10px] text-slate-500 uppercase font-bold tracking-tight">Split physical pricing based on threshold</p>
                </div>
            </div>
            
            <div className="flex items-center gap-3">
                {formData.isTieredPricing && (
                    <InputGroup 
                        label="Tier 1 Limit" 
                        name="tierLimit" 
                        value={formData.tierLimit} 
                        onChange={handleChange} 
                        isFormatted={true} 
                        readOnly={userRole === 'viewer'}
                        className="w-40"
                    />
                )}
                <label className="relative inline-flex items-center cursor-pointer mt-4">
                    <input type="checkbox" name="isTieredPricing" checked={formData.isTieredPricing} onChange={handleChange} className="sr-only peer" disabled={userRole === 'viewer'} />
                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
            </div>
        </div>

        {/* Volume Comparison Warning */}
        {formData.totalDeliveredVolume > formData.totalLoadedVolume && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex items-center gap-3">
                <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <div className="text-xs text-amber-800">
                    <span className="font-bold">Attention:</span> Delivered volume ({formatWithCommas(formData.totalDeliveredVolume)}) is greater than Loaded volume ({formatWithCommas(formData.totalLoadedVolume)}). 
                    Please ensure this is intentional (e.g. thermal expansion or inventory release).
                </div>
            </motion.div>
        )}

        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center bg-white p-4 rounded-xl border border-slate-100 shadow-sm gap-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                Pricing Mode
            </h3>
            <div className="flex bg-slate-100 p-1 rounded-lg text-[10px] font-bold">
                <button type="button" onClick={() => setPricingMode('formula')} className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md transition-all ${pricingMode === 'formula' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>Formula</button>
                <button type="button" onClick={() => setPricingMode('component')} className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md transition-all ${pricingMode === 'component' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>Components</button>
            </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-100 space-y-6 shadow-sm overflow-hidden">
            <h3 className="text-sm font-bold text-slate-800">Pricing {formData.isTieredPricing && '(Tier 1)'}</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6 overflow-x-auto pb-2">
                    <div className="flex justify-between items-center min-w-[300px]">
                        <h4 className="text-xs font-bold text-emerald-600 uppercase border-l-2 border-emerald-500 pl-2">Purchase Tier 1</h4>
                        {userRole !== 'viewer' && (
                          <div className="flex items-center gap-2">
                              <label className="text-[10px] font-bold text-slate-400">RND</label>
                              <input type="number" name="buyPriceRounding" value={formData.buyPriceRounding} onChange={handleChange} className="w-10 text-xs border rounded p-1" min="0" max="6" />
                          </div>
                        )}
                    </div>
                    <InputGroup 
                        label="Loaded Volume (Total)" 
                        name="totalLoadedVolume" 
                        value={formData.totalLoadedVolume} 
                        onChange={handleChange} 
                        isFormatted={true} 
                        readOnly={userRole === 'viewer'} 
                        footer={formData.isTieredPricing && (
                            <div className="flex gap-2">
                                <span className="text-[8px] font-black text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 uppercase">T1: {formatWithCommas(formData.loadedVolume)}</span>
                                <span className="text-[8px] font-black text-indigo-500 bg-indigo-50/50 px-1.5 py-0.5 rounded border border-indigo-100 uppercase">T2: {formatWithCommas(formData.tier2LoadedVolume)}</span>
                            </div>
                        )}
                    />
                    {pricingMode === 'formula' ? (
                        <InputGroup label="Formula" name="buyFormula" value={formData.buyFormula} onChange={handleChange} hint="e.g. JKM(n) - 0.50" readOnly={userRole === 'viewer'} footer={<FormulaIndicesDisplay formula={formData.buyFormula} refDate={formData.loadingDate} />} />
                    ) : (
                        <div className="space-y-3">
                            {[1, 2, 3].map(i => <ComponentRow key={i} idx={i} type="buy" formData={formData} onChange={handleChange} readOnly={userRole === 'viewer'} onIssueChange={handleIssueChange} />)}
                            <InputGroup label="Overall Buy Constant" name="buyPriceOverallConstant" type="number" step="0.001" value={formData.buyPriceOverallConstant} onChange={handleChange} readOnly={userRole === 'viewer'} />
                        </div>
                    )}
                    <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Unit Buy Price</span>
                                <div className="relative">
                                    <InputGroup 
                                        label="" 
                                        name="absoluteBuyPrice" 
                                        type="number" 
                                        step="0.0001" 
                                        value={formData.absoluteBuyPrice} 
                                        onChange={handleChange} 
                                        disabled={!formData.isBuyPriceManual} 
                                        className="!mb-0"
                                    />
                                    {!formData.isBuyPriceManual && (
                                        <div className="absolute right-2 top-2.5 px-1.5 py-0.5 bg-emerald-100 text-emerald-600 text-[8px] font-black rounded border border-emerald-200">AUTO</div>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Buy Price</span>
                                <div className="flex-1 flex items-center justify-center bg-white border border-slate-200 rounded-lg font-mono font-bold text-slate-700 text-sm shadow-inner">
                                    {formatCurrency(formData.finalPurchaseCostT1)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="space-y-6 overflow-x-auto pb-2">
                    <div className="flex justify-between items-center min-w-[300px]">
                        <h4 className="text-xs font-bold text-blue-600 uppercase border-l-2 border-blue-500 pl-2">Sales Tier 1</h4>
                        {userRole !== 'viewer' && (
                          <div className="flex items-center gap-2">
                              <label className="text-[10px] font-bold text-slate-400">RND</label>
                              <input type="number" name="sellPriceRounding" value={formData.sellPriceRounding} onChange={handleChange} className="w-10 text-xs border rounded p-1" min="0" max="6" />
                          </div>
                        )}
                    </div>
                    <InputGroup 
                        label="Delivered Volume (Total)" 
                        name="totalDeliveredVolume" 
                        value={formData.totalDeliveredVolume} 
                        onChange={handleChange} 
                        isFormatted={true} 
                        readOnly={userRole === 'viewer'} 
                        footer={formData.isTieredPricing && (
                            <div className="flex gap-2">
                                <span className="text-[8px] font-black text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 uppercase">T1: {formatWithCommas(formData.deliveredVolume)}</span>
                                <span className="text-[8px] font-black text-indigo-500 bg-indigo-50/50 px-1.5 py-0.5 rounded border border-indigo-100 uppercase">T2: {formatWithCommas(formData.tier2DeliveredVolume)}</span>
                            </div>
                        )}
                    />
                    {pricingMode === 'formula' ? (
                        <InputGroup label="Formula" name="sellFormula" value={formData.sellFormula} onChange={handleChange} hint="e.g. 115% HH(301) + 2.50" readOnly={userRole === 'viewer'} footer={<FormulaIndicesDisplay formula={formData.sellFormula} refDate={formData.deliveryDate} />} />
                    ) : (
                        <div className="space-y-3">
                            {[1, 2, 3].map(i => <ComponentRow key={i} idx={i} type="sell" formData={formData} onChange={handleChange} readOnly={userRole === 'viewer'} onIssueChange={handleIssueChange} />)}
                            <InputGroup label="Overall Sell Constant" name="sellPriceOverallConstant" type="number" step="0.001" value={formData.sellPriceOverallConstant} onChange={handleChange} readOnly={userRole === 'viewer'} />
                        </div>
                    )}
                    <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest">Unit Sales Price</span>
                                <div className="relative">
                                    <InputGroup 
                                        label="" 
                                        name="absoluteSellPrice" 
                                        type="number" 
                                        step="0.0001" 
                                        value={formData.absoluteSellPrice} 
                                        onChange={handleChange} 
                                        disabled={!formData.isSellPriceManual} 
                                        className="!mb-0"
                                    />
                                    {!formData.isSellPriceManual && (
                                        <div className="absolute right-2 top-2.5 px-1.5 py-0.5 bg-blue-100 text-blue-600 text-[8px] font-black rounded border border-blue-200">AUTO</div>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Sales Revenue</span>
                                <div className="flex-1 flex items-center justify-center bg-white border border-slate-200 rounded-lg font-mono font-bold text-slate-700 text-sm shadow-inner">
                                    {formatCurrency(formData.finalSalesRevenueT1)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {formData.isTieredPricing && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-4 sm:p-6 rounded-xl border border-indigo-100 space-y-6 shadow-sm border-dashed overflow-hidden">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <h3 className="text-sm font-bold text-indigo-800">Second Tier</h3>
                        <div className="flex items-center gap-4 w-full sm:w-auto">
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">T2 Purchase Price</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">{formatPrice(formData.absoluteBuyPriceTier2 || 0, formData.buyPriceRounding)}</span>
                                    <span className="text-xs font-bold text-slate-500">({formatCurrency(formData.finalPurchaseCostT2 || 0)})</span>
                                </div>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">T2 Sales Price</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{formatPrice(formData.absoluteSellPriceTier2 || 0, formData.sellPriceRounding)}</span>
                                    <span className="text-xs font-bold text-slate-500">({formatCurrency(formData.finalSalesRevenueT2 || 0)})</span>
                                </div>
                            </div>
                         <div className="flex-1 sm:flex-none flex items-center gap-2">
                            <label className="text-[9px] font-bold text-slate-400 uppercase">Buy RND</label>
                            <input type="number" name="tier2BuyPriceRounding" value={formData.tier2BuyPriceRounding} onChange={handleChange} className="w-10 text-xs border rounded p-1" />
                        </div>
                        <div className="flex-1 sm:flex-none flex items-center gap-2">
                            <label className="text-[9px] font-bold text-slate-400 uppercase">Sell RND</label>
                            <input type="number" name="tier2SellPriceRounding" value={formData.tier2SellPriceRounding} onChange={handleChange} className="w-10 text-xs border rounded p-1" />
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-6 overflow-x-auto pb-2">
                        <h4 className="text-xs font-bold text-emerald-600 uppercase border-l-2 border-emerald-500 pl-2 min-w-[300px]">Purchase Tier 2</h4>
                        {pricingMode === 'formula' ? (
                            <InputGroup label="Tier 2 Formula" name="tier2BuyFormula" value={formData.tier2BuyFormula} onChange={handleChange} readOnly={userRole === 'viewer'} footer={<FormulaIndicesDisplay formula={formData.tier2BuyFormula} refDate={formData.loadingDate} />} />
                        ) : (
                            <div className="space-y-3">
                                {[1, 2, 3].map(i => <ComponentRow key={i} idx={i} type="tier2Buy" formData={formData} onChange={handleChange} readOnly={userRole === 'viewer'} />)}
                                <InputGroup label="Overall Constant" name="tier2BuyPriceOverallConstant" type="number" step="0.001" value={formData.tier2BuyPriceOverallConstant} onChange={handleChange} readOnly={userRole === 'viewer'} />
                            </div>
                        )}
                        <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Unit Price (T2)</span>
                                    <div className="relative">
                                        <InputGroup label="" name="absoluteTier2BuyPrice" type="number" step="0.0001" value={formData.absoluteTier2BuyPrice} onChange={handleChange} disabled={!formData.isTier2BuyPriceManual} className="!mb-0 w-full">
                                            {!formData.isTier2BuyPriceManual && <div className="absolute right-2 top-2.5 px-1.5 py-0.5 bg-emerald-100 text-emerald-600 text-[8px] font-black rounded border border-emerald-200">AUTO</div>}
                                        </InputGroup>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total cost (T2)</span>
                                    <div className="flex-1 flex items-center justify-center bg-white border border-slate-200 rounded-lg font-mono font-bold text-slate-700 text-sm shadow-inner">
                                        {formatCurrency(formData.finalPurchaseCostT2)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-6 overflow-x-auto pb-2">
                        <h4 className="text-xs font-bold text-blue-600 uppercase border-l-2 border-blue-500 pl-2 min-w-[300px]">Sales Tier 2</h4>
                        {pricingMode === 'formula' ? (
                            <InputGroup label="Tier 2 Formula" name="tier2SellFormula" value={formData.tier2SellFormula} onChange={handleChange} readOnly={userRole === 'viewer'} footer={<FormulaIndicesDisplay formula={formData.tier2SellFormula} refDate={formData.deliveryDate} />} />
                        ) : (
                            <div className="space-y-3">
                                {[1, 2, 3].map(i => <ComponentRow key={i} idx={i} type="tier2Sell" formData={formData} onChange={handleChange} readOnly={userRole === 'viewer'} />)}
                                <InputGroup label="Overall Constant" name="tier2SellPriceOverallConstant" type="number" step="0.001" value={formData.tier2SellPriceOverallConstant} onChange={handleChange} readOnly={userRole === 'viewer'} />
                            </div>
                        )}
                        <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest">Unit Price (T2)</span>
                                    <div className="relative">
                                        <InputGroup label="" name="absoluteTier2SellPrice" type="number" step="0.0001" value={formData.absoluteTier2SellPrice} onChange={handleChange} disabled={!formData.isTier2SellPriceManual} className="!mb-0 w-full">
                                            {!formData.isTier2SellPriceManual && <div className="absolute right-2 top-2.5 px-1.5 py-0.5 bg-blue-100 text-blue-600 text-[8px] font-black rounded border border-blue-200">AUTO</div>}
                                        </InputGroup>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Rev (T2)</span>
                                    <div className="flex-1 flex items-center justify-center bg-white border border-slate-200 rounded-lg font-mono font-bold text-slate-700 text-sm shadow-inner">
                                        {formatCurrency(formData.finalSalesRevenueT2)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        )}

        {formData.incoterms === 'DES' && (
          <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-100 space-y-4 shadow-sm relative overflow-hidden">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                Shipping Related Cost (SRC)
            </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-end">
                  <InputGroup label="SRC Fee ($/U)" name="srcUnitFee" type="number" step="0.001" value={formData.srcUnitFee} onChange={handleChange} readOnly={userRole === 'viewer'} />
                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Calculated SRC</label>
                    <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono font-bold text-slate-700">
                      {formatCurrency(calculatedSrcCost)}
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-amber-600 uppercase mb-1.5 ml-1">Override SRC</label>
                    <InputGroup label="" name="reconciledSrcCost" value={formData.reconciledSrcCost} onChange={handleChange} isFormatted={true} readOnly={userRole === 'viewer'} className="!mb-0" />
                  </div>
                </div>
          </div>
        )}

        {/* Hedging Summary */}
        {trmsHedgingSummary && (
            <div className="bg-white rounded-xl border border-indigo-100 shadow-sm overflow-hidden transition-all">
                <div 
                    onClick={() => setShowHedgingDetails(!showHedgingDetails)}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50 cursor-pointer hover:bg-indigo-50/30 group"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <h3 className="text-xs sm:text-sm font-bold text-slate-800">Hedging Insight</h3>
                                <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-500 rounded text-[7px] font-black uppercase border border-indigo-100">MATCHED</span>
                            </div>
                            <p className="text-[8px] sm:text-[10px] text-slate-500 font-bold uppercase truncate max-w-[150px] sm:max-w-none">
                                {trmsHedgingSummary.hedgingTrades} Open Trades
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-8 w-full sm:w-auto">
                        <div className="text-left sm:text-right border-l sm:border-l border-slate-200 pl-4 sm:pl-6">
                            <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">Matched Derivatives P&L</p>
                            <p className={`text-base sm:text-lg font-black font-mono leading-none ${trmsHedgingSummary.hedgingPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {formatCurrency(trmsHedgingSummary.hedgingPnL)}
                            </p>
                            <p className="text-[7px] text-slate-400 font-bold uppercase mt-1">* Non-Additive to Total</p>
                        </div>
                        <div className={`p-2 rounded-full transition-all ${showHedgingDetails ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                            <svg className={`w-4 h-4 transition-transform ${showHedgingDetails ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </div>
                    </div>
                </div>

                <AnimatePresence>
                    {showHedgingDetails && (
                        <motion.div 
                            initial={{ height: 0 }} 
                            animate={{ height: 'auto' }} 
                            exit={{ height: 0 }} 
                            className="overflow-hidden bg-white"
                        >
                            <div className="p-3 sm:p-4 border-t border-indigo-50">
                                <div className="rounded-lg border border-slate-100 overflow-x-auto">
                                    <table className="w-full text-left text-[9px] sm:text-[10px]">
                                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-100">
                                            <tr>
                                                <th className="px-3 py-2">Date</th>
                                                <th className="px-3 py-2">Type</th>
                                                <th className="px-3 py-2">Volume</th>
                                                <th className="px-3 py-2 text-right">Var</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {trmsDetailedTrades.map((trade: any, idx: number) => {
                                                const pnl = Number(trade['Change_in_Total_PnL'] || 0);
                                                return (
                                                    <tr key={idx}>
                                                        <td className="px-3 py-2 font-mono whitespace-nowrap">{trade['Trade Date'] || trade['Start Date']}</td>
                                                        <td className="px-3 py-2">
                                                            <span className={`px-1 rounded font-bold ${trade['Buy_Sell'] === 'Buy' ? 'text-emerald-600' : 'text-blue-600'}`}>
                                                                {trade['Buy_Sell']}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2 font-mono">{Number(trade['Volume'] || 0).toLocaleString()}</td>
                                                        <td className={`px-3 py-2 text-right font-mono font-bold ${pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                            {formatCurrency(pnl)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        )}

        {/* Finance Reconciliation Section */}
        <div className="bg-slate-50 p-4 sm:p-6 rounded-xl border border-slate-200 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                <h3 className="text-sm font-bold text-slate-800">Finance Reconciliation (Jarvis)</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Reconciled Sales Revenue</label>
                    <div className="relative">
                        <InputGroup 
                            label=""
                            name="reconciledSalesRevenue" 
                            value={formData.reconciledSalesRevenue} 
                            onChange={handleChange} 
                            isFormatted={true}
                            readOnly={userRole === 'viewer'}
                            className="!mb-0"
                        />
                        <span className="absolute left-3 top-2.5 text-slate-400 text-xs">$</span>
                    </div>
                    <p className="text-[9px] text-slate-400">If set, this overrides the calculated sales revenue.</p>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Reconciled Purchase Cost</label>
                    <div className="relative">
                        <InputGroup 
                            label=""
                            name="reconciledPurchaseCost" 
                            value={formData.reconciledPurchaseCost} 
                            onChange={handleChange} 
                            isFormatted={true}
                            readOnly={userRole === 'viewer'}
                            className="!mb-0"
                        />
                        <span className="absolute left-3 top-2.5 text-slate-400 text-xs">$</span>
                    </div>
                    <p className="text-[9px] text-slate-400">If set, this overrides the calculated purchase cost.</p>
                </div>
            </div>
        </div>

        {/* Financial Footer */}
        <div className="bg-slate-900 text-white p-4 sm:p-6 rounded-xl shadow-xl flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-12 flex-1">
                <div>
                    <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Sales Rev</p>
                    <p className="text-base sm:text-xl font-bold">{formatCurrency(formData.finalSalesRevenue)}</p>
                </div>
                <div>
                    <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Cost</p>
                    <p className="text-base sm:text-xl font-bold text-rose-300">{formatCurrency(formData.finalTotalCost)}</p>
                </div>
                <div className="sm:col-span-1 opacity-60 grayscale-[0.5]">
                    <p className="text-[8px] sm:text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                        Derivatives
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </p>
                    <p className={`text-base sm:text-xl font-bold ${hedgingPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(hedgingPnL)}</p>
                </div>
                <div className="sm:col-span-1">
                    <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Physical P&L</p>
                    <p className={`text-xl sm:text-2xl font-black ${displayPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(displayPnL)}</p>
                </div>
            </div>
            <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 flex flex-col shrink-0">
                <p className="text-[8px] sm:text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-1">Pricing Bucket</p>
                <select name="pnlBucket" value={formData.pnlBucket} onChange={handleChange} disabled={userRole === 'viewer'} className="bg-transparent border-none p-0 rounded text-xs sm:text-sm font-bold text-white focus:ring-0 disabled:opacity-50">
                    <option value={PnLBucket.Unrealized}>Unrealized</option>
                    <option value={PnLBucket.Realized}>Realized</option>
                </select>
            </div>
        </div>
      </form>
      
      <div className="p-4 sm:p-6 border-t border-slate-100 flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 bg-white z-10">
        <button 
            onClick={onCancel} 
            className="w-full sm:w-auto px-6 py-3 sm:py-2.5 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-all border border-slate-200 text-sm sm:text-base"
        >
            Cancel
        </button>
        <button 
            disabled={userRole === 'viewer'}
            onClick={handleSubmit} 
            className={`w-full sm:w-auto px-8 py-3 sm:py-2.5 font-black rounded-xl shadow-lg transition-all text-sm sm:text-base flex items-center justify-center gap-2 ${userRole === 'viewer' ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : 'bg-indigo-600 text-white shadow-indigo-100 hover:bg-indigo-700'}`}
        >
            {userRole === 'viewer' ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  Read Only Mode
                </>
            ) : initialData ? 'Save Changes' : 'Create Cargo'}
        </button>
      </div>

      <AnimatePresence>
        {showTrmsModal && trmsData && (
            <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[85vh] flex flex-col overflow-hidden"
                >
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">TRMS & Jarvis Data Extraction</h3>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Strategy: {formData.strategyName}</p>
                        </div>
                        <button onClick={() => setShowTrmsModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                        <div className="space-y-8">
                            {[
                                { label: 'SRC Lines', data: trmsData.src.filter(r => r['Strategy Name'] === formData.strategyName) },
                                { label: 'Hedging Lines', data: trmsData.hedging.filter(r => r['Strategy Name'] === formData.strategyName) },
                                { label: 'Paper Lines (DH/DFT)', data: trmsData.paper.filter(r => r['Strategy Name'] === formData.strategyName) }
                            ].map((section, sIdx) => (
                                <section key={sIdx} className="space-y-3">
                                    <div className="flex items-center gap-3">
                                        <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest">{section.label}</h4>
                                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-bold">{section.data.length} Rows</span>
                                    </div>
                                    {section.data.length > 0 ? (
                                        <div className="rounded-xl border border-slate-200 overflow-hidden">
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left text-[10px]">
                                                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                                                        <tr>
                                                            {Object.keys(section.data[0]).map(k => (
                                                                <th key={k} className="px-3 py-2 whitespace-nowrap">{k}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {section.data.map((row, rIdx) => (
                                                            <tr key={rIdx} className="hover:bg-slate-50 transition-colors">
                                                                {Object.values(row).map((v: any, vIdx) => (
                                                                    <td key={vIdx} className="px-3 py-2 whitespace-nowrap font-mono text-slate-600">
                                                                        {typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 4 }) : String(v ?? '')}
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-8 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center">
                                            <p className="text-xs text-slate-400 font-medium italic">No data found for this category</p>
                                        </div>
                                    )}
                                </section>
                            ))}
                        </div>
                    </div>
                    
                    <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                        <button onClick={() => setShowTrmsModal(false)} className="px-6 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-900 transition-all">Close Viewer</button>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
