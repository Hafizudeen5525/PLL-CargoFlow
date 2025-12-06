import React, { useState, useEffect, useCallback } from 'react';
import { CargoProfile, EmptyCargoProfile, PnLBucket } from '../types';
import { recalculateProfile, actualizeProfile, getMarketData, evaluateFormula, generateStrategyName, detectUnit } from '../services/calculationService';
import { apiClient } from '../services/apiClient';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
// @ts-ignore
import mammoth from 'mammoth';

interface CargoFormProps {
  initialData?: CargoProfile;
  onSave: (data: CargoProfile) => void;
  onCancel: () => void;
}

// -- Extracted Components --

interface InputGroupProps {
    label: string;
    name: string;
    value: any;
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    type?: string;
    step?: string;
    readOnly?: boolean;
    hint?: string;
    children?: React.ReactNode;
}

const InputGroup: React.FC<InputGroupProps> = React.memo(({ label, name, value, onChange, type = "text", step, readOnly = false, hint, children }) => (
    <div className="flex flex-col group relative">
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5 ml-1">{label}</label>
      <div className="relative">
        <input
            type={type}
            step={step}
            name={name}
            value={value ?? ''}
            onChange={onChange}
            readOnly={readOnly}
            className={`w-full px-3 py-2.5 rounded-lg border text-sm transition-all shadow-sm ${
                readOnly 
                ? 'bg-slate-50 border-slate-200 text-slate-500 font-mono' 
                : 'bg-white border-slate-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800'
            }`}
        />
        {children}
      </div>
      {hint && <p className="text-[10px] text-slate-400 mt-1 ml-1">{hint}</p>}
    </div>
));

interface FormulaInputProps {
    label: string;
    name: 'sellFormula' | 'buyFormula';
    value: string;
    resultValue: number;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onIndexClick: (index: string, field: 'sellFormula' | 'buyFormula') => void;
    availableIndices: string[];
}

const FormulaInput: React.FC<FormulaInputProps> = React.memo(({ label, name, value, resultValue, onChange, onIndexClick, availableIndices }) => (
    <div className="space-y-2 p-4 rounded-xl bg-slate-50 border border-slate-100">
        <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-bold text-slate-500 uppercase">{label}</label>
            <span className="text-xs font-mono font-medium text-slate-400">
                Current: <span className={resultValue ? 'text-blue-600' : ''}>${(resultValue || 0).toFixed(2)}</span>
            </span>
        </div>
        <div className="relative">
            <input 
                type="text"
                name={name}
                value={value ?? ''}
                onChange={onChange}
                placeholder="e.g. 95% NBP"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
            />
            <div className="absolute right-3 top-2.5">
                {resultValue ? (
                    <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"></div>
                ) : (
                    <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                )}
            </div>
        </div>
        
        <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-[10px] text-slate-400 flex items-center mr-1">Available:</span>
            {availableIndices.slice(0, 5).map(idx => (
                <button
                    key={idx}
                    type="button"
                    onClick={() => onIndexClick(idx, name)}
                    className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600 hover:shadow-sm transition-all active:scale-95"
                >
                    {idx}
                </button>
            ))}
            <button type="button" onClick={() => onIndexClick('+', name)} className="px-2 py-0.5 bg-slate-100 rounded text-[10px] text-slate-500 hover:bg-slate-200">+</button>
            <button type="button" onClick={() => onIndexClick('-', name)} className="px-2 py-0.5 bg-slate-100 rounded text-[10px] text-slate-500 hover:bg-slate-200">-</button>
            <button type="button" onClick={() => onIndexClick('20%', name)} className="px-2 py-0.5 bg-slate-100 rounded text-[10px] text-slate-500 hover:bg-slate-200">%</button>
        </div>
    </div>
));

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

export const CargoForm: React.FC<CargoFormProps> = ({ initialData, onSave, onCancel }) => {
  const [formData, setFormData] = useState<any>({ ...EmptyCargoProfile });
  const [isProcessing, setIsProcessing] = useState(false);
  
  const marketData = getMarketData();
  const availableIndices = Object.keys(marketData);

  const unit = formData.volumeUnit || detectUnit(formData.sellFormula || formData.buyFormula);

  useEffect(() => {
    if (initialData) {
      const { id, ...rest } = initialData;
      setFormData(rest);
    }
  }, [initialData]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    const newValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    
    setFormData((prev: any) => {
      const tempProfile = {
        ...prev,
        [name]: newValue
      };

      // Auto-Populate Month
      if (name === 'deliveryDate' && typeof newValue === 'string' && newValue) {
          const monthStr = formatMonthStr(newValue);
          if (monthStr) tempProfile.deliveryMonth = monthStr;
          // Auto set window to single day if empty
          if (!tempProfile.deliveryWindowStart) tempProfile.deliveryWindowStart = newValue;
          if (!tempProfile.deliveryWindowEnd) tempProfile.deliveryWindowEnd = newValue;
      }
      if (name === 'loadingDate' && typeof newValue === 'string' && newValue) {
          const monthStr = formatMonthStr(newValue);
          if (monthStr) tempProfile.loadingMonth = monthStr;
          if (!tempProfile.loadingWindowStart) tempProfile.loadingWindowStart = newValue;
          if (!tempProfile.loadingWindowEnd) tempProfile.loadingWindowEnd = newValue;
      }
      
      // Auto-sync window end if start changes
      if (name === 'loadingWindowStart' && !tempProfile.loadingWindowEnd) {
          tempProfile.loadingWindowEnd = newValue;
      }
      if (name === 'deliveryWindowStart' && !tempProfile.deliveryWindowEnd) {
          tempProfile.deliveryWindowEnd = newValue;
      }

      // Recalc logic
      if (name === 'sellFormula' || name === 'deliveryDate') {
          const formula = name === 'sellFormula' ? newValue : prev.sellFormula;
          const date = name === 'deliveryDate' ? newValue : prev.deliveryDate;
          const price = evaluateFormula(formula, date);
          if (price !== null) {
              tempProfile.absoluteSellPrice = price;
              if (tempProfile.deliveredVolume) tempProfile.salesRevenue = tempProfile.deliveredVolume * price;
          }
      }

      if (name === 'buyFormula' || name === 'loadingDate') {
          const formula = name === 'buyFormula' ? newValue : prev.buyFormula;
          const date = name === 'loadingDate' ? newValue : (prev.loadingDate || prev.deliveryDate);
          const price = evaluateFormula(formula, date);
          if (price !== null) {
              tempProfile.absoluteBuyPrice = price;
              if (tempProfile.loadedVolume) tempProfile.reconciledPurchaseCost = tempProfile.loadedVolume * price;
          }
      }

      const calcProfile = { ...tempProfile };
      if (type === 'number' && typeof newValue === 'string') {
         if (newValue === '') {
             calcProfile[name] = 0;
         } else {
             const parsed = parseFloat(newValue);
             if (!isNaN(parsed)) calcProfile[name] = parsed;
         }
      }

      if ((name === 'source' || name === 'deliveryDate' || name === 'loadingDate') && !tempProfile.strategyName) {
        if (tempProfile.source && (tempProfile.deliveryDate || tempProfile.loadingDate)) {
             const autoName = generateStrategyName(tempProfile);
             tempProfile.strategyName = autoName;
             calcProfile.strategyName = autoName;
        }
      }

      const calculated = recalculateProfile(calcProfile);

      return {
          ...calculated,
          [name]: newValue 
      };
    });
  }, []);

  const handleIndexClick = useCallback((indexName: string, targetField: 'sellFormula' | 'buyFormula') => {
    setFormData((prev: any) => {
        const currentVal = prev[targetField] || '';
        const needsSpace = currentVal.length > 0 && !currentVal.endsWith(' ');
        let suffix = indexName;
        if (indexName === '20%') suffix = '+ 20%';
        const updatedVal = `${currentVal}${needsSpace ? ' ' : ''}${suffix}`;
        
        const updatedProfile = { ...prev, [targetField]: updatedVal };
        const date = targetField === 'sellFormula' ? prev.deliveryDate : (prev.loadingDate || prev.deliveryDate);
        const price = evaluateFormula(updatedVal, date);
        
        if (price !== null) {
            if (targetField === 'sellFormula') {
                updatedProfile.absoluteSellPrice = price;
                if (updatedProfile.deliveredVolume) updatedProfile.salesRevenue = updatedProfile.deliveredVolume * price;
            } else {
                updatedProfile.absoluteBuyPrice = price;
                if (updatedProfile.loadedVolume) updatedProfile.reconciledPurchaseCost = updatedProfile.loadedVolume * price;
            }
        }
        return recalculateProfile(updatedProfile);
    });
  }, []);

  const handleGenerateName = () => {
    setFormData((prev: any) => ({
        ...prev,
        strategyName: generateStrategyName(prev)
    }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    const loadingToast = toast.loading('Processing document...');

    try {
      const isDocx = file.name.endsWith('.docx') || file.name.endsWith('.doc');
      const isPdfOrImage = file.type.startsWith('image/') || file.type === 'application/pdf';

      if (isDocx) {
        const arrayBuffer = await file.arrayBuffer();
        try {
          const result = await mammoth.extractRawText({ arrayBuffer });
          const textContent = result.value;
          if (!textContent) throw new Error("Could not extract text.");

          // Use apiClient for extraction
          const aiData = await apiClient.parseDocument(textContent, 'text/plain', true);
          mergeData(aiData);
          toast.success('Document parsed successfully!', { id: loadingToast });

        } catch (docxErr) {
          console.error(docxErr);
          toast.error("Failed to read Word document.", { id: loadingToast });
        }
      } else if (isPdfOrImage) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64String = event.target?.result as string;
          const base64Data = base64String.split(',')[1];
          try {
            const aiData = await apiClient.parseDocument(base64Data, file.type, false);
            mergeData(aiData);
            toast.success('Document parsed successfully!', { id: loadingToast });
          } catch (err) {
            toast.error("AI parsing failed.", { id: loadingToast });
          }
        };
        reader.readAsDataURL(file);
      } else {
        toast.error("Unsupported format. Use PDF, DOCX, or Image.", { id: loadingToast });
      }
    } catch (err) {
      console.error(err);
      toast.error("Error reading file.", { id: loadingToast });
    } finally {
      setIsProcessing(false);
    }
  };

  const mergeData = (aiData: Partial<CargoProfile>) => {
    setFormData((prev: any) => {
      let merged = {
        ...prev,
        ...Object.fromEntries(
            Object.entries(aiData).filter(([_, v]) => v !== null && v !== undefined && v !== '')
        )
      };
      if (merged.deliveryDate && !merged.deliveryMonth) merged.deliveryMonth = formatMonthStr(merged.deliveryDate);
      if (merged.loadingDate && !merged.loadingMonth) merged.loadingMonth = formatMonthStr(merged.loadingDate);
      if (!merged.strategyName) merged.strategyName = generateStrategyName(merged);
      return recalculateProfile(merged);
    });
  };

  const handleActualizeClick = () => {
    toast((t) => (
        <div className="flex flex-col gap-2">
            <span className="font-medium">Confirm Actualization?</span>
            <span className="text-xs text-slate-500">This will lock pricing formulas.</span>
            <div className="flex gap-2 mt-2">
                <button 
                    onClick={() => {
                        setFormData((prev: any) => actualizeProfile(prev));
                        toast.dismiss(t.id);
                        toast.success('Profile actualized');
                    }}
                    className="bg-emerald-600 text-white px-3 py-1 rounded text-xs"
                >
                    Confirm
                </button>
                <button 
                    onClick={() => toast.dismiss(t.id)}
                    className="bg-slate-200 px-3 py-1 rounded text-xs"
                >
                    Cancel
                </button>
            </div>
        </div>
    ), { duration: 4000 });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalData = { ...formData };
    const toNum = (val: any) => (val === '' || val === undefined) ? 0 : parseFloat(val);

    finalData.deliveredVolume = toNum(finalData.deliveredVolume);
    finalData.loadedVolume = toNum(finalData.loadedVolume);
    finalData.salesRevenue = toNum(finalData.salesRevenue);
    
    onSave({ id: initialData?.id || '', ...finalData });
  };

  return (
    <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden"
    >
      <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white z-10">
        <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800">
            {initialData ? 'Edit Cargo Profile' : 'New Cargo Profile'}
            </h2>
            {initialData && formData.pnlBucket !== PnLBucket.Realized && (
                <button 
                    type="button"
                    onClick={handleActualizeClick}
                    className="ml-4 px-3 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 text-xs font-bold uppercase rounded hover:bg-emerald-100 transition-colors"
                >
                    Actualize
                </button>
            )}
        </div>
        
        <div className="flex items-center gap-4">
            {!initialData && (
                <div className="relative group">
                    <input 
                        type="file" 
                        accept="image/*,application/pdf,.doc,.docx"
                        onChange={handleFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        disabled={isProcessing}
                    />
                    <button 
                        type="button" 
                        className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow-sm ${
                            isProcessing ? 'bg-indigo-50 text-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'
                        }`}
                    >
                        {isProcessing ? 'Analyzing...' : 'Upload KTS'}
                    </button>
                </div>
            )}
        </div>
      </div>
      
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-slate-50/50">
        <div className="space-y-8 max-w-5xl mx-auto">
            
            {/* General Info */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-6">
                    <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
                    Logistics Overview
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <InputGroup label="Strategy Name" name="strategyName" value={formData.strategyName} onChange={handleChange}>
                        <button 
                            type="button" 
                            onClick={handleGenerateName} 
                            className="absolute right-2 top-2 text-slate-400 hover:text-blue-500"
                            title="Auto-Generate Name"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        </button>
                    </InputGroup>
                    <InputGroup label="Source" name="source" value={formData.source} onChange={handleChange} />
                    <InputGroup label="Buyer" name="buyer" value={formData.buyer} onChange={handleChange} />
                    
                    <div className="flex flex-col group">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5 ml-1">Optimized</label>
                        <div className="flex items-center h-[42px]">
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" name="optimized" checked={!!formData.optimized} onChange={handleChange} className="sr-only peer" />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 transition-colors"></div>
                                <span className="ml-3 text-sm font-medium text-slate-700">{formData.optimized ? 'Yes' : 'No'}</span>
                            </label>
                        </div>
                    </div>

                    <InputGroup label="Incoterms" name="incoterms" value={formData.incoterms} onChange={handleChange} />
                    <InputGroup label="SRC Code" name="src" value={formData.src} onChange={handleChange} />
                </div>
            </div>

            {/* Dates & Volumes */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                 <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-6">
                    <span className="w-1 h-4 bg-purple-500 rounded-full"></span>
                    Schedule & Volume
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <InputGroup label="Loading Date" name="loadingDate" type="date" value={formData.loadingDate} onChange={handleChange} />
                    <InputGroup label="Window Start" name="loadingWindowStart" type="date" value={formData.loadingWindowStart} onChange={handleChange} />
                    <InputGroup label="Window End" name="loadingWindowEnd" type="date" value={formData.loadingWindowEnd} onChange={handleChange} />
                    <InputGroup label={`Loaded Vol`} name="loadedVolume" type="number" value={formData.loadedVolume} onChange={handleChange}>
                        <div className="absolute right-0 top-0 bottom-0 flex items-center px-2 bg-slate-50 border-l border-slate-200 text-xs text-slate-500">
                           {unit}
                        </div>
                    </InputGroup>

                    <InputGroup label="Delivery Date" name="deliveryDate" type="date" value={formData.deliveryDate} onChange={handleChange} />
                    <InputGroup label="Window Start" name="deliveryWindowStart" type="date" value={formData.deliveryWindowStart} onChange={handleChange} />
                    <InputGroup label="Window End" name="deliveryWindowEnd" type="date" value={formData.deliveryWindowEnd} onChange={handleChange} />
                    <InputGroup label={`Delivered Vol`} name="deliveredVolume" type="number" value={formData.deliveredVolume} onChange={handleChange}>
                        <div className="absolute right-0 top-0 bottom-0 flex items-center px-2 bg-slate-50 border-l border-slate-200 text-xs text-slate-500">
                           {unit}
                        </div>
                    </InputGroup>

                    <div className="md:col-span-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5 ml-1">Volume Unit</label>
                        <select
                            name="volumeUnit"
                            value={formData.volumeUnit || unit}
                            onChange={handleChange}
                            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm"
                        >
                            <option value="MMBtu">MMBtu</option>
                            <option value="m3">m3</option>
                            <option value="MT">MT</option>
                            <option value="bbl">bbl</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Pricing Formulas */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-6">
                    <span className="w-1 h-4 bg-indigo-500 rounded-full"></span>
                    Pricing & Formulas
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FormulaInput 
                        label="Sell Formula" 
                        name="sellFormula" 
                        value={formData.sellFormula} 
                        resultValue={formData.absoluteSellPrice} 
                        onChange={handleChange} 
                        onIndexClick={handleIndexClick}
                        availableIndices={availableIndices}
                    />
                    <FormulaInput 
                        label="Buy Formula" 
                        name="buyFormula" 
                        value={formData.buyFormula} 
                        resultValue={formData.absoluteBuyPrice} 
                        onChange={handleChange} 
                        onIndexClick={handleIndexClick}
                        availableIndices={availableIndices}
                    />
                </div>
            </div>

            {/* Financials */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-6">
                    <span className="w-1 h-4 bg-emerald-500 rounded-full"></span>
                    Financial Reconciliation
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="flex flex-col">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5 ml-1">Status</label>
                        <select
                            name="pnlBucket"
                            value={formData.pnlBucket}
                            onChange={handleChange}
                            className="px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800"
                        >
                            <option value={PnLBucket.Realized}>Realized</option>
                            <option value={PnLBucket.Unrealized}>Unrealized</option>
                            <option value={PnLBucket.Unspecified}>Unspecified</option>
                        </select>
                    </div>
                    
                    <InputGroup label="Sales Revenue" name="salesRevenue" type="number" step="0.01" value={formData.salesRevenue} onChange={handleChange} />
                    <InputGroup label="Final Sales Rev" name="finalSalesRevenue" type="number" step="0.01" value={formData.finalSalesRevenue} onChange={handleChange} />
                    
                    <InputGroup label="Rec. Sales Rev" name="reconciledSalesRevenue" type="number" step="0.01" value={formData.reconciledSalesRevenue} onChange={handleChange} />
                    <InputGroup label="Rec. Purch Cost" name="reconciledPurchaseCost" type="number" step="0.01" value={formData.reconciledPurchaseCost} onChange={handleChange} />
                    <InputGroup label="Final Total Cost" name="finalTotalCost" type="number" step="0.01" value={formData.finalTotalCost} onChange={handleChange} />
                    
                    <InputGroup label="Physical P&L" name="finalPhysicalPnL" type="number" step="0.01" value={formData.finalPhysicalPnL} onChange={handleChange} />
                    <InputGroup label="Hedging P&L" name="totalHedgingPnL" type="number" step="0.01" value={formData.totalHedgingPnL} onChange={handleChange} />
                    
                    <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 -m-1 mt-0">
                         <InputGroup label="Final Total P&L" name="finalTotalPnL" type="number" step="0.01" value={formData.finalTotalPnL} onChange={handleChange} readOnly />
                    </div>
                </div>
            </div>
        </div>
      </form>
      
      <div className="p-6 border-t border-slate-100 bg-white flex justify-end gap-3 z-10">
        <button 
            type="button" 
            onClick={onCancel}
            className="px-4 py-2 text-slate-500 font-medium hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
        >
            Cancel
        </button>
        <button 
            onClick={handleSubmit}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-lg shadow-blue-600/20 transition-all transform active:scale-95 flex items-center gap-2"
        >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Save Profile
        </button>
      </div>
    </motion.div>
  );
};