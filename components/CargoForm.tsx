import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CargoProfile, EmptyCargoProfile, PnLBucket } from '../types';
import { recalculateProfile, actualizeProfile, getMarketData, evaluateFormula, generateStrategyName, detectUnit, analyzeFormulaStructure, getIndexPrice } from '../services/calculationService';
import { apiClient } from '../services/apiClient';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
// @ts-ignore
import mammoth from 'mammoth';

interface CargoFormProps {
  initialData?: CargoProfile;
  onSave: (data: CargoProfile) => void;
  onCancel: () => void;
}

const INDEX_OPTIONS = ['HH', 'TTF', 'JKM', 'Dated Brent', 'JCC', 'BRIPE', 'NBP', 'AECO', 'STN 2'];

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
}> = React.memo(({ label, name, value, onChange, type = "text", step, readOnly = false, disabled = false, hint, children, className = "" }) => (
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
            className={`w-full px-3 py-2.5 rounded-lg border text-sm transition-all shadow-sm ${
                readOnly || disabled
                ? 'bg-slate-50 border-slate-200 text-slate-500 font-mono cursor-not-allowed' 
                : 'bg-white border-slate-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800'
            }`}
        />
        {children}
      </div>
      {hint && <p className="text-[10px] text-slate-400 mt-1 ml-1">{hint}</p>}
    </div>
));

const ComponentRow: React.FC<{
    type: 'buy' | 'sell';
    idx: number;
    formData: any;
    onChange: (e: any) => void;
}> = ({ type, idx, formData, onChange }) => {
    const w = formData[`${type}Price${idx}Weightage`];
    const s = formData[`${type}Price${idx}Slope`];
    const index = formData[`${type}PriceIndex${idx}`];
    const mDef = formData[`${type}Price${idx}MonthDef`];
    const c = formData[`${type}Price${idx}Constant`];
    
    const { price } = getIndexPrice(index, type === 'buy' ? formData.loadingDate : formData.deliveryDate, mDef);
    const componentValue = s * price + c;

    return (
        <div className="grid grid-cols-12 gap-2 items-end bg-slate-50/50 p-3 rounded-lg border border-slate-100 mb-2">
            <div className="col-span-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Weight</label>
                <input type="number" step="0.01" name={`${type}Price${idx}Weightage`} value={w} onChange={onChange} className="w-full text-xs p-1.5 border rounded" />
            </div>
            <div className="col-span-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Slope</label>
                <input type="number" step="0.0001" name={`${type}Price${idx}Slope`} value={s} onChange={onChange} className="w-full text-xs p-1.5 border rounded" />
            </div>
            <div className="col-span-3">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Index</label>
                <select name={`${type}PriceIndex${idx}`} value={index} onChange={onChange} className="w-full text-xs p-1.5 border rounded">
                    <option value="">(None)</option>
                    {INDEX_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            </div>
            <div className="col-span-3">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Month Def</label>
                <input type="text" placeholder="n, n-1, 3,0,1" name={`${type}Price${idx}MonthDef`} value={mDef} onChange={onChange} className="w-full text-xs p-1.5 border rounded" />
            </div>
            <div className="col-span-2">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Constant</label>
                <input type="number" step="0.01" name={`${type}Price${idx}Constant`} value={c} onChange={onChange} className="w-full text-xs p-1.5 border rounded" />
            </div>
            <div className="col-span-2 text-right">
                <div className="text-[9px] font-bold text-slate-400 uppercase">Result</div>
                <div className="text-xs font-bold text-blue-600 truncate">${componentValue.toFixed(3)}</div>
            </div>
        </div>
    );
};

export const CargoForm: React.FC<CargoFormProps> = ({ initialData, onSave, onCancel }) => {
  const [formData, setFormData] = useState<any>({ ...EmptyCargoProfile });
  const [isProcessing, setIsProcessing] = useState(false);
  const [pricingMode, setPricingMode] = useState<'formula' | 'component'>('formula');

  useEffect(() => {
    if (initialData) {
      setFormData({ ...initialData });
      if (initialData.buyPriceIndex1 || initialData.sellPriceIndex1) {
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

  const handleManualPriceToggle = (type: 'buy' | 'sell') => {
      const field = type === 'buy' ? 'isBuyPriceManual' : 'isSellPriceManual';
      setFormData((prev: any) => {
          const up = { ...prev, [field]: !prev[field] };
          return recalculateProfile(up);
      });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    const loadingToast = toast.loading('Processing KTS document...');
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64String = event.target?.result as string;
        const base64Data = base64String.split(',')[1];
        const aiData = await apiClient.parseDocument(base64Data, file.type, false);
        setFormData((prev: any) => recalculateProfile({ ...prev, ...aiData }));
        toast.success('Extracted successfully', { id: loadingToast });
      };
      reader.readAsDataURL(file);
    } catch (err) {
      toast.error("Extraction failed", { id: loadingToast });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...formData, id: initialData?.id || '' });
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col w-full max-w-5xl max-h-[90vh] overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">{initialData ? 'Edit Cargo' : 'New Cargo Profile'}</h2>
        <div className="flex gap-2">
            <input type="file" accept="image/*,application/pdf" onChange={handleFileUpload} className="hidden" id="kts-upload" />
            <label htmlFor="kts-upload" className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg shadow-sm cursor-pointer hover:bg-indigo-700">Auto-populate via KTS</label>
        </div>
      </div>
      
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 bg-slate-50/50 space-y-8">
        {/* Logistics Section */}
        <div className="bg-white p-6 rounded-xl border border-slate-100 space-y-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">Logistics & Schedule</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <InputGroup label="Strategy Name" name="strategyName" value={formData.strategyName} onChange={handleChange} className="md:col-span-2" />
                <InputGroup label="Source" name="source" value={formData.source} onChange={handleChange} />
                <InputGroup label="Buyer" name="buyer" value={formData.buyer} onChange={handleChange} />
                <InputGroup label="Loading Date" name="loadingDate" type="date" value={formData.loadingDate} onChange={handleChange} />
                <InputGroup label="Delivery Date" name="deliveryDate" type="date" value={formData.deliveryDate} onChange={handleChange} />
                <InputGroup label="Volume Unit" name="volumeUnit" value={formData.volumeUnit} onChange={handleChange} />
                <InputGroup label="Loaded Vol" name="loadedVolume" type="number" value={formData.loadedVolume} onChange={handleChange} />
                <InputGroup label="Delivered Vol" name="deliveredVolume" type="number" value={formData.deliveredVolume} onChange={handleChange} />
            </div>
        </div>

        {/* Pricing Section */}
        <div className="bg-white p-6 rounded-xl border border-slate-100 space-y-6 shadow-sm">
            <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-800">Pricing Definition</h3>
                <div className="flex bg-slate-100 p-1 rounded-lg text-[10px] font-bold">
                    <button type="button" onClick={() => setPricingMode('formula')} className={`px-3 py-1 rounded ${pricingMode === 'formula' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>Text Formula</button>
                    <button type="button" onClick={() => setPricingMode('component')} className={`px-3 py-1 rounded ${pricingMode === 'component' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>Advanced Components</button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Buy Side */}
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h4 className="text-xs font-bold text-emerald-600 uppercase border-l-2 border-emerald-500 pl-2">Purchase Side (Buy)</h4>
                        <div className="flex items-center gap-2">
                            <label className="text-[10px] font-bold text-slate-400">ROUNDING</label>
                            <input type="number" name="buyPriceRounding" value={formData.buyPriceRounding} onChange={handleChange} className="w-12 text-xs border rounded p-1" min="0" max="6" />
                        </div>
                    </div>
                    
                    {pricingMode === 'formula' ? (
                        <InputGroup label="Purchase Formula" name="buyFormula" value={formData.buyFormula} onChange={handleChange} hint="e.g. JKM - 0.50" />
                    ) : (
                        <div className="space-y-3">
                            {[1, 2, 3].map(i => <ComponentRow key={i} idx={i} type="buy" formData={formData} onChange={handleChange} />)}
                            <InputGroup label="Overall Buy Constant" name="buyPriceOverallConstant" type="number" step="0.001" value={formData.buyPriceOverallConstant} onChange={handleChange} />
                        </div>
                    )}

                    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl space-y-4">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-bold text-emerald-700 uppercase">Unit Buy Price ($/Unit)</label>
                            <button 
                                type="button" 
                                onClick={() => handleManualPriceToggle('buy')}
                                className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase transition-colors ${formData.isBuyPriceManual ? 'bg-amber-100 text-amber-700' : 'bg-white text-emerald-600 border border-emerald-200'}`}
                            >
                                {formData.isBuyPriceManual ? 'Manual Mode' : 'Switch to Manual'}
                            </button>
                        </div>
                        <InputGroup 
                            label="" 
                            name="absoluteBuyPrice" 
                            type="number" 
                            step="0.0001" 
                            value={formData.absoluteBuyPrice} 
                            onChange={handleChange} 
                            disabled={!formData.isBuyPriceManual}
                            className="!mb-0"
                        >
                            {!formData.isBuyPriceManual && <div className="absolute right-3 top-2.5 text-[10px] text-emerald-400 font-bold">CALCULATED</div>}
                        </InputGroup>
                        
                        <div className="border-t border-emerald-100 pt-3 flex justify-between items-center">
                            <div>
                                <p className="text-[10px] font-bold text-emerald-600 uppercase">Calculated Cost</p>
                                <p className="text-sm font-mono font-bold text-emerald-800">{formatCurrency(formData.salesRevenue / (formData.absoluteSellPrice || 1) * (formData.absoluteBuyPrice || 0))}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-bold text-amber-600 uppercase">Reconciled Cost Override</p>
                                <input 
                                    type="number" 
                                    name="reconciledPurchaseCost" 
                                    value={formData.reconciledPurchaseCost} 
                                    onChange={handleChange} 
                                    placeholder="Enter total cost..."
                                    className="bg-white border border-amber-200 rounded p-1 text-xs w-32 font-mono text-right focus:ring-1 focus:ring-amber-300"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sell Side */}
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h4 className="text-xs font-bold text-blue-600 uppercase border-l-2 border-blue-500 pl-2">Sales Side (Sell)</h4>
                        <div className="flex items-center gap-2">
                            <label className="text-[10px] font-bold text-slate-400">ROUNDING</label>
                            <input type="number" name="sellPriceRounding" value={formData.sellPriceRounding} onChange={handleChange} className="w-12 text-xs border rounded p-1" min="0" max="6" />
                        </div>
                    </div>

                    {pricingMode === 'formula' ? (
                        <InputGroup label="Sales Formula" name="sellFormula" value={formData.sellFormula} onChange={handleChange} hint="e.g. 115% HH + 2.50" />
                    ) : (
                        <div className="space-y-3">
                            {[1, 2, 3].map(i => <ComponentRow key={i} idx={i} type="sell" formData={formData} onChange={handleChange} />)}
                            <InputGroup label="Overall Sell Constant" name="sellPriceOverallConstant" type="number" step="0.001" value={formData.sellPriceOverallConstant} onChange={handleChange} />
                        </div>
                    )}

                    <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-4">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-bold text-blue-700 uppercase">Unit Sell Price ($/Unit)</label>
                            <button 
                                type="button" 
                                onClick={() => handleManualPriceToggle('sell')}
                                className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase transition-colors ${formData.isSellPriceManual ? 'bg-amber-100 text-amber-700' : 'bg-white text-blue-600 border border-blue-200'}`}
                            >
                                {formData.isSellPriceManual ? 'Manual Mode' : 'Switch to Manual'}
                            </button>
                        </div>
                        <InputGroup 
                            label="" 
                            name="absoluteSellPrice" 
                            type="number" 
                            step="0.0001" 
                            value={formData.absoluteSellPrice} 
                            onChange={handleChange} 
                            disabled={!formData.isSellPriceManual}
                            className="!mb-0"
                        >
                            {!formData.isSellPriceManual && <div className="absolute right-3 top-2.5 text-[10px] text-blue-400 font-bold">CALCULATED</div>}
                        </InputGroup>

                        <div className="border-t border-blue-100 pt-3 flex justify-between items-center">
                            <div>
                                <p className="text-[10px] font-bold text-blue-600 uppercase">Calculated Revenue</p>
                                <p className="text-sm font-mono font-bold text-blue-800">{formatCurrency(formData.salesRevenue)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-bold text-amber-600 uppercase">Reconciled Sales Override</p>
                                <input 
                                    type="number" 
                                    name="reconciledSalesRevenue" 
                                    value={formData.reconciledSalesRevenue} 
                                    onChange={handleChange} 
                                    placeholder="Enter total revenue..."
                                    className="bg-white border border-amber-200 rounded p-1 text-xs w-32 font-mono text-right focus:ring-1 focus:ring-amber-300"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Summary Footer Section */}
        <div className="bg-slate-900 text-white p-6 rounded-xl shadow-xl border border-slate-800 flex justify-between items-center">
            <div className="grid grid-cols-3 gap-12">
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Final Sales Revenue</p>
                    <p className="text-xl font-bold">{formatCurrency(formData.finalSalesRevenue)}</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Final Total Cost</p>
                    <p className="text-xl font-bold text-rose-300">{formatCurrency(formData.finalTotalCost)}</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Physical P&L</p>
                    <p className={`text-xl font-bold ${formData.finalPhysicalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatCurrency(formData.finalPhysicalPnL)}
                    </p>
                </div>
            </div>
            <div className="text-right">
                <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Pricing Bucket</p>
                <select 
                    name="pnlBucket" 
                    value={formData.pnlBucket} 
                    onChange={handleChange} 
                    className="bg-slate-800 border-none rounded text-sm font-bold text-white focus:ring-1 focus:ring-indigo-500 mt-1"
                >
                    <option value={PnLBucket.Unrealized}>Unrealized</option>
                    <option value={PnLBucket.Realized}>Realized</option>
                </select>
            </div>
        </div>
      </form>
      
      <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-white">
        <button onClick={onCancel} className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-lg">Cancel</button>
        <button onClick={handleSubmit} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg shadow-lg hover:bg-indigo-700">Save Cargo Profile</button>
      </div>
    </motion.div>
  );
};