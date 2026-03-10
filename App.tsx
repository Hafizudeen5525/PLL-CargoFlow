
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Dashboard } from './components/Dashboard';
import { CargoList } from './components/CargoList';
import { CargoForm } from './components/CargoForm';
import { ForwardCurveModal } from './components/ForwardCurveModal';
import { BulkImportModal } from './components/BulkImportModal';
import { ExposureView } from './components/ExposureView';
import { DiscrepancyCheck, ReconciliationData } from './components/DiscrepancyCheck';
import { CargoProfile, PnLBucket, ForwardCurveData, ForwardCurve, ForwardCurvePoint } from './types';
import { getMarketData, getForwardCurve, recalculateProfile, getPortfolioYear, saveForwardCurve } from './services/calculationService';

// Navigation Items
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-1 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-1 2h-2a2 2 0 01-2-2v-2z' },
  { id: 'cargos', label: 'Cargo List', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 002-2M9 5a2 2 0 012 2h2a2 2 0 012 2' },
  { id: 'exposure', label: 'Exposure View', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2v-6a2 2 0 01-2-2h-2a2 2 0 01-2 v6' },
  { id: 'discrepancy', label: 'Reconciliation', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 002-2M9 5a2 2 0 012 2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
];

const MAX_HISTORY = 50;

const App: React.FC = () => {
  const [view, setView] = useState('dashboard');
  const [profiles, setProfiles] = useState<CargoProfile[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // History Stacks
  const [past, setPast] = useState<CargoProfile[][]>([]);
  const [future, setFuture] = useState<CargoProfile[][]>([]);

  const [marketData, setMarketData] = useState(getMarketData());
  const [forwardCurve, setForwardCurve] = useState(getForwardCurve());
  const [portfolioYear, setPortfolioYear] = useState<string>(new Date().getFullYear().toString());
  
  // Persisted TRMS Data for discrepancy check
  const [trmsData, setTrmsData] = useState<ReconciliationData>({
    src: [],
    hedging: [],
    paper: [],
    trmsAgg: {}, 
    forwardCurves: [],
    uniqueValues: { src: {}, hedging: {}, paper: {} },
    summary: { total: 0, src: 0, hedging: 0, paper: 0 }
  });

  // Modals
  const [isEditing, setIsEditing] = useState(false);
  const [editingProfile, setEditingProfile] = useState<CargoProfile | undefined>(undefined);
  const [formSource, setFormSource] = useState<'dashboard' | 'list'>('dashboard');
  const [isImporting, setIsImporting] = useState(false);
  const [isForwardCurveOpen, setIsForwardCurveOpen] = useState(false);

  // Load initial data
  useEffect(() => {
    const savedProfiles = localStorage.getItem('cargo_profiles');
    if (savedProfiles) {
      setProfiles(JSON.parse(savedProfiles));
    }

    const savedTrms = localStorage.getItem('trms_data');
    if (savedTrms) {
      try {
        const parsed = JSON.parse(savedTrms);
        // Ensure all required fields exist for backward compatibility
        const merged = {
          src: [],
          hedging: [],
          paper: [],
          trmsAgg: {},
          forwardCurves: [],
          uniqueValues: { src: {}, hedging: {}, paper: {} },
          summary: { total: 0, src: 0, hedging: 0, paper: 0 },
          ...parsed
        };
        // Restore Sets from Arrays in trmsAgg
        if (merged.trmsAgg) {
          Object.keys(merged.trmsAgg).forEach(key => {
            if (merged.trmsAgg[key] && Array.isArray(merged.trmsAgg[key].hedgingIndices)) {
              merged.trmsAgg[key].hedgingIndices = new Set(merged.trmsAgg[key].hedgingIndices);
            }
          });
        }
        setTrmsData(merged as ReconciliationData);
        if (localStorage.getItem('trms_data_is_lite') === 'true') {
          toast('TRMS raw lines were not saved due to size limits. Aggregated data is available.', { icon: 'ℹ️', duration: 4000 });
        }
      } catch (e) {
        console.error("Failed to load TRMS data from storage", e);
      }
    }
  }, []);

  // Save profiles on change
  useEffect(() => {
    localStorage.setItem('cargo_profiles', JSON.stringify(profiles));
  }, [profiles]);

  // Save TRMS data on change
  useEffect(() => {
    if (trmsData.summary.total > 0) {
      const serializeTrms = (data: ReconciliationData, includeRaw: boolean) => {
        const toSave = { ...data };
        if (!includeRaw) {
          toSave.src = [];
          toSave.hedging = [];
          toSave.paper = [];
        }
        
        const trmsAggClone = { ...toSave.trmsAgg };
        Object.keys(trmsAggClone).forEach(key => {
          trmsAggClone[key] = { 
            ...trmsAggClone[key],
            hedgingIndices: Array.from(trmsAggClone[key].hedgingIndices) as any
          };
        });
        toSave.trmsAgg = trmsAggClone;
        return JSON.stringify(toSave);
      };

      try {
        // Attempt 1: Full Save
        localStorage.setItem('trms_data', serializeTrms(trmsData, true));
        localStorage.removeItem('trms_data_is_lite');
      } catch (e) {
        console.warn("Full TRMS data too large for localStorage, attempting lite save...", e);
        try {
          // Attempt 2: Lite Save (Summary & Aggregated only)
          localStorage.setItem('trms_data', serializeTrms(trmsData, false));
          localStorage.setItem('trms_data_is_lite', 'true');
          toast.success('TRMS data saved (Summary only due to size)', { icon: '⚠️', duration: 3000 });
        } catch (e2) {
          console.error("TRMS data even in lite mode exceeds localStorage quota", e2);
          toast.error('TRMS data too large to persist. It will be lost on refresh.', { duration: 5000 });
        }
      }
    }
  }, [trmsData]);

  // Populate Forward Curves from Jarvis data
  useEffect(() => {
    if (trmsData.forwardCurves && trmsData.forwardCurves.length > 0) {
      let updated = false;
      trmsData.forwardCurves.forEach((fcData: ForwardCurveData) => {
        const monthMap: Record<string, Record<string, number>> = {};
        fcData.curves.forEach((curve: ForwardCurve) => {
          curve.points.forEach((point: ForwardCurvePoint) => {
            if (!monthMap[point.month]) monthMap[point.month] = {};
            monthMap[point.month][curve.index] = point.value;
          });
        });
        const rows = Object.entries(monthMap).map(([month, prices]) => ({
          month,
          prices
        })).sort((a, b) => a.month.localeCompare(b.month));

        if (rows.length > 0) {
          saveForwardCurve(fcData.asOfDate, rows);
          updated = true;
        }
      });
      
      if (updated) {
        handleMarketRefresh();
        toast.success('Forward Curves populated from Jarvis data', { icon: '📈' });
      }
    }
  }, [trmsData.forwardCurves]);

  // Auto-sync from Jarvis based on options
  useEffect(() => {
    if (Object.keys(trmsData.trmsAgg).length > 0) {
      const options = trmsData.syncOptions || { syncReconciled: true, syncPrices: false, overwriteManual: false };
      let syncCount = 0;
      
      updateProfiles((prev: CargoProfile[]) => {
        return prev.map(p => {
          const trms = trmsData.trmsAgg[p.strategyName];
          if (!trms) return p;

          const updated = { ...p };
          let changed = false;

          // 1. Sync Reconciled Values
          if (options.syncReconciled) {
            if (trms.reconciledPurchaseCost > 0 && trms.reconciledPurchaseCost !== p.reconciledPurchaseCost) {
              updated.reconciledPurchaseCost = trms.reconciledPurchaseCost;
              changed = true;
            }
            if (trms.reconciledSalesRevenue > 0 && trms.reconciledSalesRevenue !== p.reconciledSalesRevenue) {
              updated.reconciledSalesRevenue = trms.reconciledSalesRevenue;
              changed = true;
            }
          }

          // 2. Sync Absolute Prices
          if (options.syncPrices) {
            const buyLegs = trms.commodityLegs.filter(l => l.buySell === 'Buy');
            const sellLegs = trms.commodityLegs.filter(l => l.buySell === 'Sell');

            if (buyLegs.length > 0) {
              // Use weighted average if volume is available, otherwise simple average
              const totalVol = buyLegs.reduce((acc, l) => acc + l.vol, 0);
              const avgBuyPrice = totalVol > 0 
                ? buyLegs.reduce((acc, l) => acc + (l.price * l.vol), 0) / totalVol
                : buyLegs.reduce((acc, l) => acc + l.price, 0) / buyLegs.length;

              if ((!p.isBuyPriceManual || options.overwriteManual) && Math.abs(avgBuyPrice - (p.absoluteBuyPrice || 0)) > 0.001) {
                updated.absoluteBuyPrice = avgBuyPrice;
                // We no longer automatically set isBuyPriceManual to true here
                // to avoid overriding the formula-based calculation mode.
                changed = true;
              }
            }

            if (sellLegs.length > 0) {
              const totalVol = sellLegs.reduce((acc, l) => acc + l.vol, 0);
              const avgSellPrice = totalVol > 0 
                ? sellLegs.reduce((acc, l) => acc + (l.price * l.vol), 0) / totalVol
                : sellLegs.reduce((acc, l) => acc + l.price, 0) / sellLegs.length;

              if ((!p.isSellPriceManual || options.overwriteManual) && Math.abs(avgSellPrice - (p.absoluteSellPrice || 0)) > 0.001) {
                updated.absoluteSellPrice = avgSellPrice;
                // We no longer automatically set isSellPriceManual to true here
                changed = true;
              }
            }
          }

          if (changed) {
            syncCount++;
            return recalculateProfile(updated, true) as CargoProfile;
          }
          return p;
        });
      });
      
      if (syncCount > 0) {
        const msg = options.syncPrices ? `Synced reconciliation & prices for ${syncCount} cargo(es)` : `Synced reconciled values for ${syncCount} cargo(es)`;
        toast.success(msg, { icon: '💰' });
      }
    }
  }, [trmsData.trmsAgg, trmsData.syncOptions]);

  // History Helper
  const updateProfiles = useCallback((newProfiles: CargoProfile[] | ((prev: CargoProfile[]) => CargoProfile[])) => {
    setProfiles((prev: CargoProfile[]) => {
      const next = typeof newProfiles === 'function' ? newProfiles(prev) : newProfiles;
      if (JSON.stringify(next) === JSON.stringify(prev)) return prev;
      setPast(history => [...history, prev].slice(-MAX_HISTORY));
      setFuture([]); 
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    setFuture(f => [profiles, ...f]);
    setPast(newPast);
    setProfiles(previous);
    toast.success('Action undone', { icon: '↩️', duration: 1500 });
  }, [past, profiles]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);
    setPast(p => [...p, profiles]);
    setFuture(newFuture);
    setProfiles(next);
    toast.success('Action redone', { icon: '↪️', duration: 1500 });
  }, [future, profiles]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isZ = e.key.toLowerCase() === 'z';
      const isY = e.key.toLowerCase() === 'y';
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdKey = isMac ? e.metaKey : e.ctrlKey;
      if (cmdKey && isZ) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (cmdKey && isY) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const handleSaveProfile = (profile: CargoProfile) => {
    updateProfiles((prev: CargoProfile[]) => {
      const idx = prev.findIndex((p: CargoProfile) => p.id === profile.id);
      if (idx >= 0) {
        const newProfiles = [...prev];
        newProfiles[idx] = profile;
        return newProfiles;
      } else {
        return [...prev, { ...profile, id: profile.id || Date.now().toString() }];
      }
    });
    setIsEditing(false);
    setEditingProfile(undefined);
  };

  const handleDeleteProfile = (id: string) => {
    if (confirm('Delete this cargo?')) {
      updateProfiles((prev: CargoProfile[]) => prev.filter((p: CargoProfile) => p.id !== id));
    }
  };

  const handleBulkDelete = (ids: Set<string>) => {
    if (confirm(`Delete ${ids.size} cargoes?`)) {
      updateProfiles((prev: CargoProfile[]) => prev.filter((p: CargoProfile) => !ids.has(p.id)));
    }
  };

  const handleBulkUpdate = (ids: Set<string>, updates: Partial<CargoProfile>) => {
    updateProfiles((prev: CargoProfile[]) => prev.map((p: CargoProfile) => {
      if (ids.has(p.id)) {
        return recalculateProfile({ ...p, ...updates }, true) as CargoProfile;
      }
      return p;
    }));
  };

  const handleBulkImport = (newProfiles: CargoProfile[]) => {
    updateProfiles((prev: CargoProfile[]) => {
        const existingMap = new Map<string, CargoProfile>(prev.map((p: CargoProfile) => [p.strategyName, p]));
        newProfiles.forEach((np: CargoProfile) => {
            const existing = existingMap.get(np.strategyName);
            if (existing) {
                existingMap.set(np.strategyName, { ...(existing as CargoProfile), ...np });
            } else {
                existingMap.set(np.strategyName, np);
            }
        });
        return Array.from(existingMap.values());
    });
  };

  const handleMarketRefresh = () => {
    setMarketData(getMarketData());
    setForwardCurve(getForwardCurve());
    updateProfiles((prev: CargoProfile[]) => prev.map((p: CargoProfile) => 
      recalculateProfile(p, true) as CargoProfile
    ));
  };

  const handleEdit = (p?: CargoProfile, source: 'dashboard' | 'list' = 'list') => {
    setEditingProfile(p);
    setFormSource(source);
    setIsEditing(true);
  };

  const filteredProfiles = useMemo(() => {
    if (portfolioYear === 'All') return profiles;
    return profiles.filter((p: CargoProfile) => getPortfolioYear(p).toString() === portfolioYear);
  }, [profiles, portfolioYear]);

  const availableYears = useMemo(() => {
      const years = new Set<string>();
      profiles.forEach((p: CargoProfile) => years.add(getPortfolioYear(p).toString()));
      const sorted = Array.from(years).sort().reverse();
      return ['All', ...sorted];
  }, [profiles]);

  const NavigationContent = () => (
    <>
      <div className="p-6 flex items-center gap-3 text-white">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-lg shadow-lg shadow-blue-900/50">C</div>
        <span className="font-bold text-xl tracking-tight">CargoFlow AI</span>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
        {NAV_ITEMS.map((item: any) => (
          <button
            key={item.id}
            onClick={() => {
              setView(item.id);
              setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              view === item.id 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
                : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
            </svg>
            <span className="font-medium text-sm">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800 space-y-3">
           <div className="px-2">
               <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Portfolio Year</label>
               <select 
                  value={portfolioYear} 
                  onChange={(e) => setPortfolioYear(e.target.value)}
                  className="w-full bg-slate-800 border-none rounded-lg text-sm text-slate-300 focus:ring-1 focus:ring-blue-500"
               >
                   {availableYears.map((y: string) => <option key={y} value={y}>{y}</option>)}
               </select>
           </div>

           <button 
              onClick={() => {
                setIsForwardCurveOpen(true);
                setIsMobileMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors"
           >
               <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
               Forward Curve
           </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-slate-100 font-sans text-slate-900 overflow-hidden relative">
      <Toaster position="top-right" />
      
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 bg-slate-900 text-slate-300 flex-col flex-shrink-0">
        <NavigationContent />
      </aside>

      {/* Mobile Menu Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] lg:hidden"
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-72 bg-slate-900 text-slate-300 flex flex-col z-[110] lg:hidden shadow-2xl"
            >
              <NavigationContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-16 bg-white border-b border-slate-200 flex justify-between items-center px-4 lg:px-6 flex-shrink-0 z-10">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="lg:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-lg"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <h1 className="text-lg lg:text-xl font-bold text-slate-800 capitalize truncate">{NAV_ITEMS.find((n: any) => n.id === view)?.label}</h1>
            </div>
            
            <div className="flex items-center gap-2 lg:gap-4">
                <div className="hidden sm:flex items-center gap-1 bg-slate-100 rounded-lg p-1 mr-2">
                    <button 
                        onClick={undo}
                        disabled={past.length === 0}
                        className={`p-1.5 rounded transition-all ${past.length > 0 ? 'text-slate-600 hover:bg-white hover:shadow-sm' : 'text-slate-300 cursor-not-allowed'}`}
                        title="Undo (Ctrl+Z)"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                    </button>
                    <button 
                        onClick={redo}
                        disabled={future.length === 0}
                        className={`p-1.5 rounded transition-all ${future.length > 0 ? 'text-slate-600 hover:bg-white hover:shadow-sm' : 'text-slate-300 cursor-not-allowed'}`}
                        title="Redo (Ctrl+Y)"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" /></svg>
                    </button>
                </div>

                {view !== 'discrepancy' && (
                  <>
                    <button 
                        onClick={() => setIsImporting(true)}
                        className="hidden md:block text-slate-500 hover:text-blue-600 text-sm font-medium transition-colors"
                    >
                        Bulk Import
                    </button>
                    <button 
                        onClick={() => handleEdit()}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 lg:px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-all flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        <span className="hidden sm:inline">New Cargo</span>
                        <span className="sm:hidden">New</span>
                    </button>
                  </>
                )}
            </div>
        </header>

        <div className="flex-1 flex flex-col min-h-0 p-3 lg:p-6 bg-slate-100 overflow-y-auto custom-scrollbar">
            <AnimatePresence mode="wait">
                {view === 'dashboard' ? (
                    <motion.div key="dashboard" initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:20}} transition={{duration:0.2}} className="flex-1 flex flex-col min-h-0">
                        <Dashboard 
                            profiles={filteredProfiles} 
                            marketData={marketData}
                            forwardCurve={forwardCurve}
                            onRefreshMarket={handleMarketRefresh}
                            onCargoClick={(p: CargoProfile) => handleEdit(p, 'dashboard')}
                            portfolioYear={portfolioYear}
                            editingProfileId={editingProfile?.id}
                        />
                    </motion.div>
                ) : view === 'cargos' ? (
                    <motion.div key="cargos" initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:20}} className="flex-1 flex flex-col min-h-0">
                        <CargoList 
                            profiles={filteredProfiles} 
                            onEdit={(p: CargoProfile) => handleEdit(p, 'list')} 
                            onDelete={handleDeleteProfile}
                            onActualize={(p: CargoProfile) => handleSaveProfile({...p, pnlBucket: PnLBucket.Realized})}
                            onBulkDelete={handleBulkDelete}
                            onBulkUpdate={handleBulkUpdate}
                            onBulkImport={handleBulkImport}
                            onForwardCurveUpdate={() => setForwardCurve(getForwardCurve())}
                            trmsData={trmsData}
                        />
                    </motion.div>
                ) : view === 'exposure' ? (
                    <motion.div key="exposure" initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:20}} className="flex-1 flex flex-col min-h-0">
                         <ExposureView 
                            profiles={filteredProfiles} 
                            onCargoClick={(p: CargoProfile) => handleEdit(p, 'list')}
                            editingProfileId={editingProfile?.id}
                            portfolioYear={portfolioYear}
                        />
                    </motion.div>
                ) : view === 'discrepancy' ? (
                    <motion.div key="discrepancy" initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:20}} className="w-full">
                         <DiscrepancyCheck 
                            profiles={profiles} 
                            trmsData={trmsData}
                            onTrmsUpload={setTrmsData}
                            onEditProfile={(p: CargoProfile) => handleEdit(p, 'list')}
                            onForwardCurveUpdate={() => setForwardCurve(getForwardCurve())}
                        />
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>

        <AnimatePresence>
            {isEditing && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[400] flex items-center justify-center p-0 sm:p-4">
                     <CargoForm 
                        initialData={editingProfile} 
                        source={formSource}
                        trmsData={trmsData}
                        onSave={handleSaveProfile} 
                        onCancel={() => {
                            setIsEditing(false);
                            setEditingProfile(undefined);
                        }} 
                    />
                </div>
            )}
            {isImporting && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[400] flex items-center justify-center p-0 sm:p-4">
                  <BulkImportModal 
                      existingProfiles={profiles}
                      onClose={() => setIsImporting(false)}
                      onImport={(newProfiles: CargoProfile[]) => {
                          updateProfiles((prev: CargoProfile[]) => {
                              const map = new Map(prev.map((p: CargoProfile) => [p.id, p]));
                              newProfiles.forEach((p: CargoProfile) => map.set(p.id, p));
                              return Array.from(map.values());
                          });
                      }}
                  />
                </div>
            )}
            {isForwardCurveOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[400] flex items-center justify-center p-0 sm:p-4">
                    <ForwardCurveModal 
                        onClose={() => setIsForwardCurveOpen(false)}
                        onSave={() => {
                            handleMarketRefresh(); 
                        }}
                    />
                </div>
            )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default App;
