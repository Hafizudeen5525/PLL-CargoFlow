
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CargoProfile, EmptyCargoProfile, PnLBucket } from '../types';
import { recalculateProfile, evaluateFormula, getIndexPrice } from '../services/calculationService';
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
}

const INDEX_OPTIONS = ['HH', 'HH Last Day', 'TTF', 'JKM', 'Dated Brent', 'JCC', 'BRIPE', 'NBP', 'AECO', 'STN 2'];
const INCOTERM_OPTIONS = ['FOB', 'DES', 'CIF', 'CFR', 'DAT'];

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
}> = React.memo(({ label, name, value, onChange, type = "text", step, readOnly = false, disabled = false, hint, children, className = "", footer }) => (
    <div className={`flex flex-col group relative ${className}`}>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5 ml-1">{label}</label>
        <div className="relative">
            <input
                type={type}
                step={step}
                name={name}
                value={value ?? ''}
                onChange={onChange}
                readOnly={readOnly}
                disabled={disabled}
                className={`w-full px-3 py-2.5 sm:py-2.5 rounded-lg border text-sm transition-all shadow-sm ${readOnly || disabled
                    ? 'bg-slate-50 border-slate-200 text-slate-500 font-mono cursor-not-allowed'
                    : 'bg-white border-slate-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800'
                    }`}
            />
            {children}
        </div>
        {hint && <p className="text-[10px] text-slate-400 mt-1 ml-1">{hint}</p>}
        {footer && <div className="mt-1.5">{footer}</div>}
    </div>
));

const FormulaIndicesDisplay: React.FC<{ formula: string, refDate: string }> = ({ formula, refDate }) => {
    const indices = useMemo(() => {
        if (!formula || !refDate) return [];
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
                const { price } = getIndexPrice(rawName, refDate, mDef);
                if (price > 0) {
                    found.push({ name: rawName, mDef, price });
                    seen.add(`${rawName}_${mDef}`);
                }
            }
        }
        return found;
    }, [formula, refDate]);

    if (indices.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-2">
            {indices.map((idx, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">{idx.name} ({idx.mDef}):</span>
                    <span className="text-[10px] font-black text-blue-600 font-mono">${idx.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span>
                </div>
            ))}
        </div>
    );
};

const ComponentRow: React.FC<{
    type: 'buy' | 'sell' | 'tier2Sell' | 'tier2Buy';
    idx: number;
    formData: any;
    onChange: (e: any) => void;
}> = ({ type, idx, formData, onChange }) => {
    const s = formData[`${type}Price${idx}Slope`];
    const index = formData[`${type}PriceIndex${idx}`];
    const mDef = formData[`${type}Price${idx}MonthDef`];
    const c = formData[`${type}Price${idx}Constant`];

    const refDate = (type === 'buy' || type === 'tier2Buy') ? formData.loadingDate : formData.deliveryDate;
    const { price } = getIndexPrice(index, refDate, mDef);
    const componentValue = (Number(s) || 0) * price + (Number(c) || 0);

    return (
        <div className="grid grid-cols-12 gap-2 items-end bg-slate-50/50 p-3 rounded-lg border border-slate-100 mb-2">
            <div className="col-span-4 sm:col-span-2">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Weight</label>
                <input type="number" step="0.01" name={`${type}Price${idx}Weightage`} value={formData[`${type}Price${idx}Weightage`]} onChange={onChange} className="w-full text-xs p-1.5 border rounded bg-white" />
            </div>
            <div className="col-span-4 sm:col-span-2">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Slope</label>
                <input type="number" step="0.0001" name={`${type}Price${idx}Slope`} value={s} onChange={onChange} className="w-full text-xs p-1.5 border rounded bg-white" />
            </div>
            <div className="col-span-4 sm:col-span-2">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Index</label>
                <select name={`${type}PriceIndex${idx}`} value={index} onChange={onChange} className="w-full text-xs p-1.5 border rounded bg-white">
                    <option value="">(None)</option>
                    {INDEX_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            </div>
            <div className="col-span-6 sm:col-span-2">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Month Def</label>
                <input type="text" placeholder="n" name={`${type}Price${idx}MonthDef`} value={mDef} onChange={onChange} className="w-full text-xs p-1.5 border rounded bg-white" />
            </div>
            <div className="col-span-6 sm:col-span-2">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Constant</label>
                <input type="number" step="0.01" name={`${type}Price${idx}Constant`} value={c} onChange={onChange} className="w-full text-xs p-1.5 border rounded bg-white" />
            </div>
            <div className="col-span-12 sm:col-span-2 text-right border-t sm:border-t-0 border-slate-200 mt-1 pt-1 sm:mt-0 sm:pt-0">
                <div className="text-[9px] font-bold text-slate-400 uppercase">Result</div>
                <div className="text-[9px] text-slate-400 font-mono mb-0.5">Base: ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</div>
                <div className="text-xs font-bold text-blue-600 truncate">${componentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</div>
            </div>
        </div>
    );
};

export const CargoForm: React.FC<CargoFormProps> = ({ initialData, source = 'list', trmsData, onSave, onCancel }) => {
    const [formData, setFormData] = useState<any>({ ...EmptyCargoProfile });
    const [isProcessing, setIsProcessing] = useState(false);
    const [pricingMode, setPricingMode] = useState<'formula' | 'component'>('formula');
    const [showHedgingDetails, setShowHedgingDetails] = useState(false);

    useEffect(() => {
        if (initialData) {
            setFormData({ ...initialData });
            if (initialData.buyPriceIndex1 || initialData.sellPriceIndex1 || initialData.tier2SellPriceIndex1 || initialData.tier2BuyPriceIndex1) {
                setPricingMode('component');
            }
        }
    }, [initialData]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        let newValue: any = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        if (type === 'number') newValue = value === '' ? 0 : parseFloat(value);

        setFormData((prev: any) => {
            const up = { ...prev, [name]: newValue };
            return recalculateProfile(up);
        });
    }, []);

    const handleManualPriceToggle = (type: 'buy' | 'sell' | 'tier2sell' | 'tier2buy') => {
        const fieldMap: Record<string, string> = {
            buy: 'isBuyPriceManual',
            sell: 'isSellPriceManual',
            tier2sell: 'isTier2SellPriceManual',
            tier2buy: 'isTier2BuyPriceManual'
        };
        setFormData((prev: any) => {
            const up = { ...prev, [fieldMap[type]]: !prev[fieldMap[type]] };
            return recalculateProfile(up);
        });
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
                setFormData((prev: any) => recalculateProfile({ ...prev, ...aiData }));
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

    const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

    const totalDeliveredVolume = (formData.deliveredVolume || 0) + (formData.tier2DeliveredVolume || 0);
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

    // NOTE: DECISION - Combined P&L in the footer now strictly reflects physical P&L 
    // Hedges are kept as separate informative cards but are non-additive.
    const displayPnL = physicalPnL;

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
                <div className="flex items-center gap-3">
                    <input type="file" accept="image/*,application/pdf" onChange={handleFileUpload} className="hidden" id="kts-upload" />
                    <label
                        htmlFor="kts-upload"
                        className={`flex-1 sm:flex-none justify-center px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-black rounded-xl shadow-xl cursor-pointer transition-all flex items-center gap-2 group relative overflow-hidden ${isProcessing ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white hover:shadow-indigo-200 hover:-translate-y-0.5 active:translate-y-0'}`}
                    >
                        <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none"></div>
                        <svg className={`w-4 h-4 shrink-0 ${isProcessing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        {isProcessing ? 'Analyzing...' : 'Autopopulate via KTS'}
                    </label>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-50/50 space-y-6 sm:space-y-8 custom-scrollbar">
                {/* Physical Details Section */}
                <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-100 space-y-4 sm:space-y-6 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Physical Logistics & Schedule
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        <InputGroup label="Strategy Name" name="strategyName" value={formData.strategyName} onChange={handleChange} className="sm:col-span-2" />
                        <InputGroup label="Source" name="source" value={formData.source} onChange={handleChange} />
                        <InputGroup label="Buyer" name="buyer" value={formData.buyer} onChange={handleChange} />
                        <InputGroup label="Loading Date" name="loadingDate" type="date" value={formData.loadingDate} onChange={handleChange} />
                        <InputGroup label="Delivery Date" name="deliveryDate" type="date" value={formData.deliveryDate} onChange={handleChange} />
                        <InputGroup label="Volume Unit" name="volumeUnit" value={formData.volumeUnit} onChange={handleChange} />
                        <div className="flex flex-col">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5 ml-1">Incoterms</label>
                            <select name="incoterms" value={formData.incoterms} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                                {INCOTERM_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="bg-indigo-50/30 p-4 rounded-xl border border-indigo-100/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center ${formData.isTieredPricing ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-slate-200 text-slate-400'}`}>
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        </div>
                        <div>
                            <h4 className="text-xs sm:text-sm font-bold text-slate-800">Two-Tier Pricing</h4>
                            <p className="text-[8px] sm:text-[10px] text-slate-500 uppercase font-bold">Split physically</p>
                        </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" name="isTieredPricing" checked={formData.isTieredPricing} onChange={handleChange} className="sr-only peer" />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                </div>

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

                <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-100 space-y-6 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800">Pricing Definition {formData.isTieredPricing && '(Tier 1)'}</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h4 className="text-xs font-bold text-emerald-600 uppercase border-l-2 border-emerald-500 pl-2">Purchase Tier 1</h4>
                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] font-bold text-slate-400">RND</label>
                                    <input type="number" name="buyPriceRounding" value={formData.buyPriceRounding} onChange={handleChange} className="w-10 text-xs border rounded p-1" min="0" max="6" />
                                </div>
                            </div>
                            <InputGroup label="Loaded Volume" name="loadedVolume" type="number" value={formData.loadedVolume} onChange={handleChange} />
                            {pricingMode === 'formula' ? (
                                <InputGroup label="Formula" name="buyFormula" value={formData.buyFormula} onChange={handleChange} hint="e.g. JKM - 0.50" footer={<FormulaIndicesDisplay formula={formData.buyFormula} refDate={formData.loadingDate} />} />
                            ) : (
                                <div className="space-y-3">
                                    {[1, 2, 3].map(i => <ComponentRow key={i} idx={i} type="buy" formData={formData} onChange={handleChange} />)}
                                    <InputGroup label="Overall Buy Constant" name="buyPriceOverallConstant" type="number" step="0.001" value={formData.buyPriceOverallConstant} onChange={handleChange} />
                                </div>
                            )}
                            <div className="p-3 sm:p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-bold text-emerald-700 uppercase">Unit Buy Price</label>
                                    <button type="button" onClick={() => handleManualPriceToggle('buy')} className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase transition-colors ${formData.isBuyPriceManual ? 'bg-amber-100 text-amber-700' : 'bg-white text-emerald-600 border border-emerald-200'}`}>
                                        {formData.isBuyPriceManual ? 'Manual' : 'Set Manual'}
                                    </button>
                                </div>
                                <InputGroup label="" name="absoluteBuyPrice" type="number" step="0.0001" value={formData.absoluteBuyPrice} onChange={handleChange} disabled={!formData.isBuyPriceManual} className="!mb-0">
                                    {!formData.isBuyPriceManual && <div className="absolute right-3 top-2.5 text-[9px] text-emerald-400 font-bold">AUTO</div>}
                                </InputGroup>
                            </div>
                        </div>
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h4 className="text-xs font-bold text-blue-600 uppercase border-l-2 border-blue-500 pl-2">Sales Tier 1</h4>
                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] font-bold text-slate-400">RND</label>
                                    <input type="number" name="sellPriceRounding" value={formData.sellPriceRounding} onChange={handleChange} className="w-10 text-xs border rounded p-1" min="0" max="6" />
                                </div>
                            </div>
                            <InputGroup label="Delivered Volume" name="deliveredVolume" type="number" value={formData.deliveredVolume} onChange={handleChange} />
                            {pricingMode === 'formula' ? (
                                <InputGroup label="Formula" name="sellFormula" value={formData.sellFormula} onChange={handleChange} hint="e.g. 115% HH + 2.50" footer={<FormulaIndicesDisplay formula={formData.sellFormula} refDate={formData.deliveryDate} />} />
                            ) : (
                                <div className="space-y-3">
                                    {[1, 2, 3].map(i => <ComponentRow key={i} idx={i} type="sell" formData={formData} onChange={handleChange} />)}
                                    <InputGroup label="Overall Sell Constant" name="sellPriceOverallConstant" type="number" step="0.001" value={formData.sellPriceOverallConstant} onChange={handleChange} />
                                </div>
                            )}
                            <div className="p-3 sm:p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-bold text-blue-700 uppercase">Unit Sell Price</label>
                                    <button type="button" onClick={() => handleManualPriceToggle('sell')} className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase transition-colors ${formData.isSellPriceManual ? 'bg-amber-100 text-amber-700' : 'bg-white text-blue-600 border border-blue-200'}`}>
                                        {formData.isSellPriceManual ? 'Manual' : 'Set Manual'}
                                    </button>
                                </div>
                                <InputGroup label="" name="absoluteSellPrice" type="number" step="0.0001" value={formData.absoluteSellPrice} onChange={handleChange} disabled={!formData.isSellPriceManual} className="!mb-0">
                                    {!formData.isSellPriceManual && <div className="absolute right-3 top-2.5 text-[9px] text-blue-400 font-bold">AUTO</div>}
                                </InputGroup>
                            </div>
                        </div>
                    </div>
                </div>

                {formData.isTieredPricing && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-4 sm:p-6 rounded-xl border border-indigo-100 space-y-6 shadow-sm border-dashed">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <h3 className="text-sm font-bold text-indigo-800">Second Tier Definition</h3>
                            <div className="flex items-center gap-4 w-full sm:w-auto">
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
                            <div className="space-y-6">
                                <h4 className="text-xs font-bold text-emerald-600 uppercase border-l-2 border-emerald-500 pl-2">Purchase Tier 2</h4>
                                <InputGroup label="Tier 2 Loaded Volume" name="tier2LoadedVolume" type="number" value={formData.tier2LoadedVolume} onChange={handleChange} />
                                {pricingMode === 'formula' ? (
                                    <InputGroup label="Tier 2 Formula" name="tier2BuyFormula" value={formData.tier2BuyFormula} onChange={handleChange} footer={<FormulaIndicesDisplay formula={formData.tier2BuyFormula} refDate={formData.loadingDate} />} />
                                ) : (
                                    <div className="space-y-3">
                                        {[1, 2, 3].map(i => <ComponentRow key={i} idx={i} type="tier2Buy" formData={formData} onChange={handleChange} />)}
                                        <InputGroup label="Overall Constant" name="tier2BuyPriceOverallConstant" type="number" step="0.001" value={formData.tier2BuyPriceOverallConstant} onChange={handleChange} />
                                    </div>
                                )}
                                <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-3">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-bold text-emerald-700 uppercase">Tier 2 Price</label>
                                        <button type="button" onClick={() => handleManualPriceToggle('tier2buy')} className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${formData.isTier2BuyPriceManual ? 'bg-amber-100 text-amber-700' : 'bg-white text-emerald-600 border border-emerald-200'}`}>
                                            {formData.isTier2BuyPriceManual ? 'Manual' : 'Set Manual'}
                                        </button>
                                    </div>
                                    <InputGroup label="" name="absoluteTier2BuyPrice" type="number" step="0.0001" value={formData.absoluteTier2BuyPrice} onChange={handleChange} disabled={!formData.isTier2BuyPriceManual} className="!mb-0">
                                        {!formData.isTier2BuyPriceManual && <div className="absolute right-3 top-2.5 text-[9px] text-emerald-400 font-bold">AUTO</div>}
                                    </InputGroup>
                                </div>
                            </div>
                            <div className="space-y-6">
                                <h4 className="text-xs font-bold text-blue-600 uppercase border-l-2 border-blue-500 pl-2">Sales Tier 2</h4>
                                <InputGroup label="Tier 2 Delivered Volume" name="tier2DeliveredVolume" type="number" value={formData.tier2DeliveredVolume} onChange={handleChange} />
                                {pricingMode === 'formula' ? (
                                    <InputGroup label="Tier 2 Formula" name="tier2SellFormula" value={formData.tier2SellFormula} onChange={handleChange} footer={<FormulaIndicesDisplay formula={formData.tier2SellFormula} refDate={formData.deliveryDate} />} />
                                ) : (
                                    <div className="space-y-3">
                                        {[1, 2, 3].map(i => <ComponentRow key={i} idx={i} type="tier2Sell" formData={formData} onChange={handleChange} />)}
                                        <InputGroup label="Overall Constant" name="tier2SellPriceOverallConstant" type="number" step="0.001" value={formData.tier2SellPriceOverallConstant} onChange={handleChange} />
                                    </div>
                                )}
                                <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl space-y-3">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-bold text-blue-700 uppercase">Tier 2 Price</label>
                                        <button type="button" onClick={() => handleManualPriceToggle('tier2sell')} className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${formData.isTier2SellPriceManual ? 'bg-amber-100 text-amber-700' : 'bg-white text-blue-600 border border-blue-200'}`}>
                                            {formData.isTier2SellPriceManual ? 'Manual' : 'Set Manual'}
                                        </button>
                                    </div>
                                    <InputGroup label="" name="absoluteTier2SellPrice" type="number" step="0.0001" value={formData.absoluteTier2SellPrice} onChange={handleChange} disabled={!formData.isTier2SellPriceManual} className="!mb-0">
                                        {!formData.isTier2SellPriceManual && <div className="absolute right-3 top-2.5 text-[9px] text-blue-400 font-bold">AUTO</div>}
                                    </InputGroup>
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
                            <InputGroup label="SRC Fee ($/U)" name="srcUnitFee" type="number" step="0.001" value={formData.srcUnitFee} onChange={handleChange} />
                            <div className="flex flex-col">
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Calculated SRC</label>
                                <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono font-bold text-slate-700">
                                    {formatCurrency(calculatedSrcCost)}
                                </div>
                            </div>
                            <div className="flex flex-col">
                                <label className="text-[10px] font-bold text-amber-600 uppercase mb-1.5 ml-1">Override SRC</label>
                                <input type="number" name="reconciledSrcCost" value={formData.reconciledSrcCost} onChange={handleChange} className="w-full px-3 py-2.5 bg-white border border-amber-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
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
                        <select name="pnlBucket" value={formData.pnlBucket} onChange={handleChange} className="bg-transparent border-none p-0 rounded text-xs sm:text-sm font-bold text-white focus:ring-0">
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
                    onClick={handleSubmit}
                    className="w-full sm:w-auto px-8 py-3 sm:py-2.5 bg-indigo-600 text-white font-black rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all text-sm sm:text-base"
                >
                    Save Changes
                </button>
            </div>
        </motion.div>
    );
};
