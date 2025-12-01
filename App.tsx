import React, { useState, useEffect, useMemo } from 'react';
import { CargoProfile, PnLBucket } from './types';
import { CargoForm } from './components/CargoForm';
import { CargoList } from './components/CargoList';
import { Dashboard } from './components/Dashboard';
import { TradeMatching } from './components/TradeMatching';
import { ForwardCurveModal } from './components/ForwardCurveModal';
import { BulkImportModal } from './components/BulkImportModal';
import { actualizeProfile, getMarketData, updateMarketData, recalculateProfile, getForwardCurve, ForwardCurveRow } from './services/calculationService';
import { Toaster, toast } from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';

// Mock Data with raw formulas - prices will be recalculated on load
const MOCK_DATA_RAW: CargoProfile[] = [
  {
    id: '1',
    source: 'North Sea',
    strategyName: 'SN2023_NorthSea_01(PLL)',
    buyer: 'Global Energy Corp',
    optimized: true,
    deliveryDate: '2023-11-15',
    deliveryMonth: 'Nov-23',
    deliveredVolume: 50000,
    sellFormula: '95% NBP',
    absoluteSellPrice: 0, // Will calculate
    salesRevenue: 0,
    loadedVolume: 50000,
    loadingDate: '2023-10-20',
    loadingMonth: 'Oct-23',
    buyFormula: 'TTF - 1.5',
    absoluteBuyPrice: 0, // Will calculate
    incoterms: 'DES',
    src: 'SRC-001',
    pnlBucket: PnLBucket.Realized,
    reconciledPurchaseCost: 5260000,
    finalSalesRevenue: 0,
    reconciledSalesRevenue: 0,
    finalTotalCost: 5300000,
    finalPhysicalPnL: 0,
    totalHedgingPnL: -50000,
    finalTotalPnL: 0,
  },
  {
    id: '2',
    source: 'US Gulf',
    strategyName: 'SN2024_USGulf_05(PLL)',
    buyer: 'EuroGas Ltd',
    optimized: false,
    deliveryDate: '2024-01-10',
    deliveryMonth: 'Jan-24',
    deliveredVolume: 75000,
    sellFormula: 'JKM + 0.5',
    absoluteSellPrice: 0,
    salesRevenue: 0,
    loadedVolume: 75000,
    loadingDate: '2023-12-15',
    loadingMonth: 'Dec-23',
    buyFormula: 'HH + 20%',
    absoluteBuyPrice: 0,
    incoterms: 'FOB',
    src: 'SRC-002',
    pnlBucket: PnLBucket.Unrealized,
    reconciledPurchaseCost: 0,
    finalSalesRevenue: 0,
    reconciledSalesRevenue: 0,
    finalTotalCost: 0,
    finalPhysicalPnL: 0,
    totalHedgingPnL: 0,
    finalTotalPnL: 0,
  }
];

const App: React.FC = () => {
  const [profiles, setProfiles] = useState<CargoProfile[]>(() => {
    const saved = localStorage.getItem('cargo_profiles');
    if (saved) return JSON.parse(saved);
    
    // Initial Recalculation to sync formulas with prices
    return MOCK_DATA_RAW.map(p => recalculateProfile(p) as CargoProfile);
  });
  
  const [view, setView] = useState<'dashboard' | 'list' | 'matching'>('dashboard');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isForwardCurveOpen, setIsForwardCurveOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<CargoProfile | undefined>(undefined);
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Realized' | 'Unrealized'>('All');
  
  // State for Market Data
  const [marketData, setMarketData] = useState<Record<string, number>>(getMarketData());
  const [forwardCurve, setForwardCurve] = useState<ForwardCurveRow[]>(getForwardCurve());

  useEffect(() => {
    localStorage.setItem('cargo_profiles', JSON.stringify(profiles));
  }, [profiles]);

  // Derived filtered list
  const filteredProfiles = useMemo(() => {
      return profiles.filter(p => {
          const name = p.strategyName || '';
          const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                (p.buyer && p.buyer.toLowerCase().includes(searchQuery.toLowerCase())) ||
                                (p.source && p.source.toLowerCase().includes(searchQuery.toLowerCase()));
          
          const matchesStatus = statusFilter === 'All' || p.pnlBucket === statusFilter;
          return matchesSearch && matchesStatus;
      });
  }, [profiles, searchQuery, statusFilter]);

  // Simulate Live Feed
  const handleMarketRefresh = () => {
    const current = getMarketData();
    const updated: Record<string, number> = {};
    
    // Randomly fluctuate prices by +/- 2%
    Object.keys(current).forEach(key => {
        const change = 1 + (Math.random() * 0.04 - 0.02);
        updated[key] = Number((current[key] * change).toFixed(2));
    });

    updateMarketData(updated);
    setMarketData(updated); // Trigger UI update

    // Auto-Recalculate Unrealized Profiles
    setProfiles(prev => prev.map(p => {
        if (p.pnlBucket === PnLBucket.Realized) return p;
        return recalculateProfile(p) as CargoProfile;
    }));
    toast.success('Market data updated', { position: 'bottom-right', icon: '📈' });
  };

  const handleCurveSaved = () => {
    // Refresh Curve State
    setForwardCurve(getForwardCurve());

    // Recalculate all unrealized profiles to use new forward prices
    setProfiles(prev => prev.map(p => {
        if (p.pnlBucket === PnLBucket.Realized) return p;
        return recalculateProfile(p) as CargoProfile;
    }));
    toast.success('Forward curve updated and applied');
  };

  const handleAdd = () => {
    setEditingProfile(undefined);
    setIsModalOpen(true);
  };

  const handleEdit = (profile: CargoProfile) => {
    setEditingProfile(profile);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    toast((t) => (
        <div className="flex flex-col gap-2">
            <span>Delete this profile?</span>
            <div className="flex gap-2 mt-2">
                <button 
                    onClick={() => {
                        setProfiles(prev => prev.filter(p => p.id !== id));
                        toast.dismiss(t.id);
                        toast.error('Profile deleted');
                    }}
                    className="bg-rose-600 text-white px-3 py-1 rounded text-sm"
                >
                    Delete
                </button>
                <button onClick={() => toast.dismiss(t.id)} className="bg-slate-200 px-3 py-1 rounded text-sm">Cancel</button>
            </div>
        </div>
    ));
  };

  const handleSave = (data: CargoProfile) => {
    if (data.id) {
      setProfiles(prev => prev.map(p => p.id === data.id ? data : p));
      toast.success('Profile updated successfully');
    } else {
      const newProfile = { ...data, id: Date.now().toString() };
      setProfiles(prev => [newProfile, ...prev]);
      toast.success('New cargo profile created');
    }
    setIsModalOpen(false);
  };

  const handleBulkImport = (importedProfiles: CargoProfile[]) => {
      setProfiles(prev => {
          // Create a Map of existing profiles by ID for easy update
          const profileMap = new Map(prev.map(p => [p.id, p]));
          
          // Merge imported profiles (some may have existing IDs, some new IDs)
          importedProfiles.forEach(p => {
              profileMap.set(p.id, p);
          });
          
          // Convert back to array (Sorting by date or creation time could be added here if needed)
          return Array.from(profileMap.values());
      });
      setIsImportModalOpen(false);
      toast.success(`${importedProfiles.length} Cargoes Processed`);
  };

  const handleActualize = (profile: CargoProfile) => {
     toast((t) => (
        <div className="flex flex-col gap-2">
            <span className="font-semibold">Actualize "{profile.strategyName}"?</span>
            <span className="text-xs text-slate-500">Locks current prices as final.</span>
            <div className="flex gap-2 mt-2">
                <button 
                    onClick={() => {
                        const updated = actualizeProfile(profile) as CargoProfile;
                        setProfiles(prev => prev.map(p => p.id === updated.id ? updated : p));
                        toast.dismiss(t.id);
                        toast.success('Cargo actualized');
                    }}
                    className="bg-emerald-600 text-white px-3 py-1 rounded text-sm"
                >
                    Confirm
                </button>
                <button onClick={() => toast.dismiss(t.id)} className="bg-slate-200 px-3 py-1 rounded text-sm">Cancel</button>
            </div>
        </div>
    ));
  };

  const handleMatch = (buyProfile: CargoProfile, sellProfile: CargoProfile) => {
    const merged: CargoProfile = {
        ...buyProfile,
        buyer: sellProfile.buyer,
        deliveryDate: sellProfile.deliveryDate || buyProfile.deliveryDate,
        deliveryMonth: sellProfile.deliveryMonth || buyProfile.deliveryMonth,
        deliveredVolume: sellProfile.deliveredVolume || buyProfile.loadedVolume,
        sellFormula: sellProfile.sellFormula,
        absoluteSellPrice: sellProfile.absoluteSellPrice,
        salesRevenue: sellProfile.salesRevenue,
        finalSalesRevenue: sellProfile.finalSalesRevenue,
    };
    
    const finalMerged = recalculateProfile(merged) as CargoProfile;

    setProfiles(prev => prev.map(p => p.id === buyProfile.id ? finalMerged : p).filter(p => p.id !== sellProfile.id));
    toast.success('Trades successfully matched!', { icon: '🔗' });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-900">
      <Toaster position="top-center" toastOptions={{ style: { borderRadius: '10px', background: '#333', color: '#fff' } }} />
      
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-900 text-white flex flex-col z-20 shadow-2xl">
        <div className="p-6 border-b border-slate-700">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">CargoFlow</h1>
            <p className="text-xs text-slate-400 mt-1">Smart Logistics AI</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
            <button 
                onClick={() => setView('dashboard')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${view === 'dashboard' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                Dashboard
            </button>
            <button 
                onClick={() => setView('list')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${view === 'list' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Cargo Profiles
            </button>
            <button 
                onClick={() => setView('matching')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${view === 'matching' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                Trade Matching
            </button>

            <div className="pt-4 mt-4 border-t border-slate-700">
                <button 
                    onClick={() => setIsForwardCurveOpen(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
                    Forward Curve
                </button>
            </div>
        </nav>

        <div className="p-4 border-t border-slate-800 text-xs text-slate-500">
            &copy; 2024 CargoFlow AI Inc.
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Top Header */}
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm z-10 sticky top-0">
            <div className="flex items-center gap-6">
                <h2 className="text-xl font-bold text-slate-800">
                    {view === 'dashboard' ? 'Overview' : view === 'matching' ? 'Trade Reconciliation' : 'Cargo Management'}
                </h2>
                
                {view === 'list' && (
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <svg className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <input 
                                type="text"
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 w-64 transition-all"
                            />
                        </div>
                        <select 
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as any)}
                            className="px-3 py-2 bg-slate-100 border-none rounded-lg text-sm text-slate-600 focus:ring-2 focus:ring-blue-500/20"
                        >
                            <option value="All">All Status</option>
                            <option value="Realized">Realized</option>
                            <option value="Unrealized">Unrealized</option>
                        </select>
                    </div>
                )}
            </div>
            
            <div className="flex gap-3">
                 <button 
                    onClick={() => setIsImportModalOpen(true)}
                    className="bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200 px-4 py-2.5 rounded-lg text-sm font-medium transition-all shadow-sm flex items-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    Import Table
                </button>
                <button 
                    onClick={handleAdd}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium shadow-md shadow-blue-500/30 transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    New Cargo
                </button>
            </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative bg-slate-50">
            <AnimatePresence mode="wait">
                {view === 'dashboard' ? (
                    <motion.div key="dashboard" initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:20}} transition={{duration:0.2}}>
                        <Dashboard 
                            profiles={profiles} 
                            marketData={marketData}
                            forwardCurve={forwardCurve}
                            onRefreshMarket={handleMarketRefresh}
                        />
                    </motion.div>
                ) : view === 'matching' ? (
                     <motion.div key="matching" initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:-20}} transition={{duration:0.2}} className="h-full">
                        <TradeMatching profiles={profiles} onMatch={handleMatch} />
                     </motion.div>
                ) : (
                    <motion.div key="list" initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:-20}} transition={{duration:0.2}}>
                        <CargoList 
                            profiles={filteredProfiles} 
                            onEdit={handleEdit} 
                            onDelete={handleDelete}
                            onActualize={handleActualize}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
      </main>

      {/* Cargo Modal */}
      <AnimatePresence>
      {isModalOpen && (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
        >
            <div className="w-full max-w-4xl max-h-full">
                <CargoForm 
                    initialData={editingProfile}
                    onSave={handleSave}
                    onCancel={() => setIsModalOpen(false)}
                />
            </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Import Modal */}
      <AnimatePresence>
      {isImportModalOpen && (
        <BulkImportModal 
            existingProfiles={profiles}
            onClose={() => setIsImportModalOpen(false)}
            onImport={handleBulkImport}
        />
      )}
      </AnimatePresence>

      {/* Forward Curve Modal */}
      <AnimatePresence>
      {isForwardCurveOpen && (
          <ForwardCurveModal 
            onClose={() => setIsForwardCurveOpen(false)}
            onSave={handleCurveSaved}
          />
      )}
      </AnimatePresence>
    </div>
  );
};

export default App;