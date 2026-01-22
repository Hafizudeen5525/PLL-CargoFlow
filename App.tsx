
import React, { useState, useEffect, useMemo } from 'react';
import { Toaster } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Dashboard } from './components/Dashboard';
import { CargoList } from './components/CargoList';
import { CargoForm } from './components/CargoForm';
import { TradeMatching } from './components/TradeMatching';
import { ForwardCurveModal } from './components/ForwardCurveModal';
import { BulkImportModal } from './components/BulkImportModal';
import { ExposureView } from './components/ExposureView';
import { DiscrepancyCheck } from './components/DiscrepancyCheck';
import { CargoProfile, PnLBucket } from './types';
import { getMarketData, getForwardCurve, recalculateProfile, getPortfolioYear } from './services/calculationService';

// Navigation Items
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
  { id: 'cargos', label: 'Cargo List', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { id: 'matching', label: 'Trade Matching', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
  { id: 'exposure', label: 'Exposure View', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2v-6a2 2 0 01-2-2h-2a2 2 0 01-2 2v6' },
  { id: 'discrepancy', label: 'TRMS Reconcile', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
];

const App: React.FC = () => {
  const [view, setView] = useState('dashboard');
  const [profiles, setProfiles] = useState<CargoProfile[]>([]);
  const [marketData, setMarketData] = useState(getMarketData());
  const [forwardCurve, setForwardCurve] = useState(getForwardCurve());
  const [portfolioYear, setPortfolioYear] = useState<string>('All');
  
  // Modals
  const [isEditing, setIsEditing] = useState(false);
  const [editingProfile, setEditingProfile] = useState<CargoProfile | undefined>(undefined);
  const [isImporting, setIsImporting] = useState(false);
  const [isForwardCurveOpen, setIsForwardCurveOpen] = useState(false);

  // Load initial data
  useEffect(() => {
    const saved = localStorage.getItem('cargo_profiles');
    if (saved) {
      setProfiles(JSON.parse(saved));
    }
  }, []);

  // Save profiles on change
  useEffect(() => {
    localStorage.setItem('cargo_profiles', JSON.stringify(profiles));
  }, [profiles]);

  const handleSaveProfile = (profile: CargoProfile) => {
    setProfiles(prev => {
      const idx = prev.findIndex(p => p.id === profile.id);
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
      setProfiles(prev => prev.filter(p => p.id !== id));
    }
  };

  const handleBulkDelete = (ids: Set<string>) => {
    if (confirm(`Delete ${ids.size} cargoes?`)) {
      setProfiles(prev => prev.filter(p => !ids.has(p.id)));
    }
  };

  const handleBulkUpdate = (ids: Set<string>, updates: Partial<CargoProfile>) => {
    setProfiles(prev => prev.map(p => {
      if (ids.has(p.id)) {
        return recalculateProfile({ ...p, ...updates }, p.pnlBucket !== PnLBucket.Realized) as CargoProfile;
      }
      return p;
    }));
  };

  const handleBulkImport = (newProfiles: CargoProfile[]) => {
    setProfiles(prev => {
        const existingMap = new Map(prev.map(p => [p.strategyName, p]));
        newProfiles.forEach(np => {
            // If strategy exists, merge updates, otherwise add new
            const existing = existingMap.get(np.strategyName);
            if (existing) {
                existingMap.set(np.strategyName, { ...existing, ...np });
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
    setProfiles(prev => prev.map(p => 
      p.pnlBucket === PnLBucket.Realized ? p : (recalculateProfile(p, true) as CargoProfile)
    ));
  };

  const handleMatch = (buy: CargoProfile, sell: CargoProfile) => {
    const updatedBuy = { ...buy, buyer: sell.buyer, pnlBucket: PnLBucket.Realized }; 
    handleSaveProfile(updatedBuy as CargoProfile); 
    alert(`Matched ${buy.strategyName} with ${sell.strategyName}`);
  };

  const handleEdit = (p?: CargoProfile) => {
    setEditingProfile(p);
    setIsEditing(true);
  };

  const filteredProfiles = useMemo(() => {
    if (portfolioYear === 'All') return profiles;
    return profiles.filter(p => getPortfolioYear(p).toString() === portfolioYear);
  }, [profiles, portfolioYear]);

  const availableYears = useMemo(() => {
      const years = new Set<string>();
      profiles.forEach(p => years.add(getPortfolioYear(p).toString()));
      const sorted = Array.from(years).sort().reverse();
      return ['All', ...sorted];
  }, [profiles]);

  return (
    <div className="flex h-screen bg-slate-100 font-sans text-slate-900 overflow-hidden">
      <Toaster position="top-right" />
      
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col flex-shrink-0">
        <div className="p-6 flex items-center gap-3 text-white">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-lg shadow-lg shadow-blue-900/50">C</div>
          <span className="font-bold text-xl tracking-tight">CargoFlow AI</span>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
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
                     {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                 </select>
             </div>

             <button 
                onClick={() => setIsForwardCurveOpen(true)}
                className="w-full flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors"
             >
                 <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
                 Forward Curve
             </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-16 bg-white border-b border-slate-200 flex justify-between items-center px-6 flex-shrink-0 z-10">
            <h1 className="text-xl font-bold text-slate-800 capitalize">{NAV_ITEMS.find(n => n.id === view)?.label}</h1>
            
            <div className="flex items-center gap-4">
                {view !== 'discrepancy' && (
                  <>
                    <button 
                        onClick={() => setIsImporting(true)}
                        className="text-slate-500 hover:text-blue-600 text-sm font-medium transition-colors"
                    >
                        Bulk Import
                    </button>
                    <button 
                        onClick={() => handleEdit()}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-all flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        New Cargo
                    </button>
                  </>
                )}
            </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-100">
            <AnimatePresence mode="wait">
                {view === 'dashboard' ? (
                    <motion.div key="dashboard" initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:20}} transition={{duration:0.2}}>
                        <Dashboard 
                            profiles={filteredProfiles} 
                            marketData={marketData}
                            forwardCurve={forwardCurve}
                            onRefreshMarket={handleMarketRefresh}
                            onCargoClick={handleEdit}
                            portfolioYear={portfolioYear}
                        />
                    </motion.div>
                ) : view === 'cargos' ? (
                    <motion.div key="cargos" initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:20}} className="h-full">
                        <CargoList 
                            profiles={filteredProfiles} 
                            onEdit={handleEdit} 
                            onDelete={handleDeleteProfile}
                            onActualize={(p) => handleSaveProfile({...p, pnlBucket: PnLBucket.Realized})}
                            onBulkDelete={handleBulkDelete}
                            onBulkUpdate={handleBulkUpdate}
                            onBulkImport={handleBulkImport}
                        />
                    </motion.div>
                ) : view === 'matching' ? (
                    <motion.div key="matching" initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:20}} className="h-full">
                        <TradeMatching profiles={filteredProfiles} onMatch={handleMatch} />
                    </motion.div>
                ) : view === 'exposure' ? (
                    <motion.div key="exposure" initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:20}} className="h-full">
                         <ExposureView profiles={filteredProfiles} />
                    </motion.div>
                ) : view === 'discrepancy' ? (
                    <motion.div key="discrepancy" initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:20}} className="h-full">
                         <DiscrepancyCheck profiles={profiles} />
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>

        <AnimatePresence>
            {isEditing && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                     <CargoForm 
                        initialData={editingProfile} 
                        onSave={handleSaveProfile} 
                        onCancel={() => setIsEditing(false)} 
                    />
                </div>
            )}
            {isImporting && (
                <BulkImportModal 
                    existingProfiles={profiles}
                    onClose={() => setIsImporting(false)}
                    onImport={(newProfiles) => {
                        setProfiles(prev => {
                            const map = new Map(prev.map(p => [p.id, p]));
                            newProfiles.forEach(p => map.set(p.id, p));
                            return Array.from(map.values());
                        });
                    }}
                />
            )}
            {isForwardCurveOpen && (
                <ForwardCurveModal 
                    onClose={() => setIsForwardCurveOpen(false)}
                    onSave={() => {
                        handleMarketRefresh(); 
                    }}
                />
            )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default App;
