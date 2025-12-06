
import React, { useState, useEffect, useMemo } from 'react';
import { CargoProfile, PnLBucket } from './types';
import { CargoForm } from './components/CargoForm';
import { CargoList } from './components/CargoList';
import { Dashboard } from './components/Dashboard';
import { TradeMatching } from './components/TradeMatching';
import { ForwardCurveModal } from './components/ForwardCurveModal';
import { BulkImportModal } from './components/BulkImportModal';
import { actualizeProfile, getMarketData, updateMarketData, recalculateProfile, getForwardCurve, ForwardCurveRow } from './services/calculationService';
import { authService, User } from './services/authService';
import { Toaster, toast } from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { ExposureView } from './components/ExposureView';

// Comprehensive Mock Data spanning Past (2023), Present (2024), and Future (2025-2026)
const MOCK_DATA_RAW: CargoProfile[] = [
  // --- PAST REALIZED CARGOES ---
  {
    id: '1',
    source: 'US Gulf',
    strategyName: 'SN2023_Cheniere_Long_01',
    buyer: 'UK',
    optimized: true,
    deliveryDate: '2023-11-15',
    deliveryMonth: 'Nov-23',
    deliveryWindowStart: '2023-11-14',
    deliveryWindowEnd: '2023-11-16',
    deliveredVolume: 3600000,
    volumeUnit: 'MMBtu',
    sellFormula: '95% NBP - 0.25',
    absoluteSellPrice: 11.25, 
    salesRevenue: 40500000,
    loadedVolume: 3600000,
    loadingDate: '2023-10-25',
    loadingMonth: 'Oct-23',
    loadingWindowStart: '2023-10-24',
    loadingWindowEnd: '2023-10-26',
    buyFormula: '115% HH + 2.5',
    absoluteBuyPrice: 6.50, 
    incoterms: 'DES',
    src: 'SRC-USG-001',
    pnlBucket: PnLBucket.Realized,
    reconciledPurchaseCost: 23400000,
    finalSalesRevenue: 40500000,
    reconciledSalesRevenue: 40500000,
    finalTotalCost: 24000000,
    finalPhysicalPnL: 16500000,
    totalHedgingPnL: -1000000,
    finalTotalPnL: 15500000,
  },
  {
    id: '2',
    source: 'Australia',
    strategyName: 'SN2024_Gladstone_Q1_Spot',
    buyer: 'China',
    optimized: true,
    deliveryDate: '2024-02-10',
    deliveryMonth: 'Feb-24',
    deliveryWindowStart: '2024-02-08',
    deliveryWindowEnd: '2024-02-12',
    deliveredVolume: 3400000,
    volumeUnit: 'MMBtu',
    sellFormula: 'JKM - 0.10',
    absoluteSellPrice: 9.80,
    salesRevenue: 33320000,
    loadedVolume: 3400000,
    loadingDate: '2024-01-20',
    loadingMonth: 'Jan-24',
    loadingWindowStart: '2024-01-18',
    loadingWindowEnd: '2024-01-22',
    buyFormula: '13.5% Brent',
    absoluteBuyPrice: 10.50, // Approx $78 Brent
    incoterms: 'DES',
    src: 'SRC-AUS-099',
    pnlBucket: PnLBucket.Realized,
    reconciledPurchaseCost: 35700000,
    finalSalesRevenue: 33320000,
    reconciledSalesRevenue: 33320000,
    finalTotalCost: 36000000,
    finalPhysicalPnL: -2680000,
    totalHedgingPnL: 3000000, // Hedged well
    finalTotalPnL: 320000,
  },

  // --- CURRENT / NEAR TERM (Loading Now) ---
  {
    id: '3',
    source: 'Qatar',
    strategyName: 'SN2024_RasLaffan_Current_OilLink',
    buyer: 'Japan',
    optimized: false,
    deliveryDate: '2024-11-20',
    deliveryMonth: 'Nov-24',
    deliveryWindowStart: '2024-11-19',
    deliveryWindowEnd: '2024-11-21',
    deliveredVolume: 3500000,
    volumeUnit: 'MMBtu',
    sellFormula: '14.5% JCC + 0.5',
    absoluteSellPrice: 0,
    salesRevenue: 0,
    loadedVolume: 3500000,
    loadingDate: '2024-10-28',
    loadingMonth: 'Oct-24',
    loadingWindowStart: '2024-10-27',
    loadingWindowEnd: '2024-10-29',
    buyFormula: 'JKM - 0.3',
    absoluteBuyPrice: 0,
    incoterms: 'DES',
    src: 'SRC-QAT-055',
    pnlBucket: PnLBucket.Unrealized,
    reconciledPurchaseCost: 0,
    finalSalesRevenue: 0,
    reconciledSalesRevenue: 0,
    finalTotalCost: 0,
    finalPhysicalPnL: 0,
    totalHedgingPnL: 0,
    finalTotalPnL: 0,
  },
  {
    id: '4',
    source: 'Nigeria',
    strategyName: 'SN2024_Bonny_Active_Spot',
    buyer: 'Spain',
    optimized: false,
    deliveryDate: '2024-12-05',
    deliveryMonth: 'Dec-24',
    deliveryWindowStart: '2024-12-04',
    deliveryWindowEnd: '2024-12-06',
    deliveredVolume: 160000,
    volumeUnit: 'm3', // Approx 3.8M MMBtu
    sellFormula: 'TTF - 0.45',
    absoluteSellPrice: 0,
    salesRevenue: 0,
    loadedVolume: 160000,
    loadingDate: '2024-11-15',
    loadingMonth: 'Nov-24',
    loadingWindowStart: '2024-11-14',
    loadingWindowEnd: '2024-11-16',
    buyFormula: 'NBP - 1.2',
    absoluteBuyPrice: 0,
    incoterms: 'FOB',
    src: 'SRC-NIG-02',
    pnlBucket: PnLBucket.Unrealized,
    reconciledPurchaseCost: 0,
    finalSalesRevenue: 0,
    reconciledSalesRevenue: 0,
    finalTotalCost: 0,
    finalPhysicalPnL: 0,
    totalHedgingPnL: 0,
    finalTotalPnL: 0,
  },

  // --- FUTURE 2025 EXPOSURE ---
  {
    id: '5',
    source: 'US Gulf',
    strategyName: 'SN2025_Sabine_India_Feb',
    buyer: 'India',
    optimized: true,
    deliveryDate: '2025-02-15',
    deliveryMonth: 'Feb-25',
    deliveryWindowStart: '2025-02-14',
    deliveryWindowEnd: '2025-02-16',
    deliveredVolume: 3600000,
    volumeUnit: 'MMBtu',
    sellFormula: '115% HH + 3.5', // Fixed/Formula hybrid
    absoluteSellPrice: 0,
    salesRevenue: 0,
    loadedVolume: 3600000,
    loadingDate: '2025-01-10',
    loadingMonth: 'Jan-25',
    loadingWindowStart: '2025-01-09',
    loadingWindowEnd: '2025-01-11',
    buyFormula: '115% HH',
    absoluteBuyPrice: 0,
    incoterms: 'DES',
    src: 'SRC-USG-88',
    pnlBucket: PnLBucket.Unrealized,
    reconciledPurchaseCost: 0,
    finalSalesRevenue: 0,
    reconciledSalesRevenue: 0,
    finalTotalCost: 0,
    finalPhysicalPnL: 0,
    totalHedgingPnL: 0,
    finalTotalPnL: 0,
  },
  {
    id: '6',
    source: 'North Sea',
    strategyName: 'SN2025_Brent_Arb_Apr',
    buyer: 'Rotterdam',
    optimized: false,
    deliveryDate: '2025-04-10',
    deliveryMonth: 'Apr-25',
    deliveryWindowStart: '2025-04-09',
    deliveryWindowEnd: '2025-04-11',
    deliveredVolume: 600000,
    volumeUnit: 'bbl', // Oil cargo
    sellFormula: 'Dated Brent + 1.2',
    absoluteSellPrice: 0,
    salesRevenue: 0,
    loadedVolume: 600000,
    loadingDate: '2025-04-01',
    loadingMonth: 'Apr-25',
    loadingWindowStart: '2025-04-01',
    loadingWindowEnd: '2025-04-02',
    buyFormula: 'Dated Brent - 0.5',
    absoluteBuyPrice: 0,
    incoterms: 'CIF',
    src: 'SRC-NS-OIL',
    pnlBucket: PnLBucket.Unrealized,
    reconciledPurchaseCost: 0,
    finalSalesRevenue: 0,
    reconciledSalesRevenue: 0,
    finalTotalCost: 0,
    finalPhysicalPnL: 0,
    totalHedgingPnL: 0,
    finalTotalPnL: 0,
  },
  {
    id: '7',
    source: 'Australia',
    strategyName: 'SN2025_Gladstone_JKM_Jun',
    buyer: 'Korea',
    optimized: true,
    deliveryDate: '2025-06-20',
    deliveryMonth: 'Jun-25',
    deliveryWindowStart: '2025-06-18',
    deliveryWindowEnd: '2025-06-22',
    deliveredVolume: 3550000,
    volumeUnit: 'MMBtu',
    sellFormula: 'JKM + 0.20',
    absoluteSellPrice: 0,
    salesRevenue: 0,
    loadedVolume: 3550000,
    loadingDate: '2025-06-01',
    loadingMonth: 'Jun-25',
    loadingWindowStart: '2025-05-30',
    loadingWindowEnd: '2025-06-02',
    buyFormula: '12% Brent',
    absoluteBuyPrice: 0,
    incoterms: 'DES',
    src: 'SRC-AUS-202',
    pnlBucket: PnLBucket.Unrealized,
    reconciledPurchaseCost: 0,
    finalSalesRevenue: 0,
    reconciledSalesRevenue: 0,
    finalTotalCost: 0,
    finalPhysicalPnL: 0,
    totalHedgingPnL: 0,
    finalTotalPnL: 0,
  },
  {
    id: '8',
    source: 'US Gulf',
    strategyName: 'SN2025_Sabine_Eur_Aug',
    buyer: 'France', // TTF
    optimized: false,
    deliveryDate: '2025-08-25',
    deliveryMonth: 'Aug-25',
    deliveryWindowStart: '2025-08-24',
    deliveryWindowEnd: '2025-08-26',
    deliveredVolume: 3700000,
    volumeUnit: 'MMBtu',
    sellFormula: 'TTF - 0.50',
    absoluteSellPrice: 0,
    salesRevenue: 0,
    loadedVolume: 3700000,
    loadingDate: '2025-08-05',
    loadingMonth: 'Aug-25',
    loadingWindowStart: '2025-08-04',
    loadingWindowEnd: '2025-08-06',
    buyFormula: '115% HH',
    absoluteBuyPrice: 0,
    incoterms: 'DES',
    src: 'SRC-USG-105',
    pnlBucket: PnLBucket.Unrealized,
    reconciledPurchaseCost: 0,
    finalSalesRevenue: 0,
    reconciledSalesRevenue: 0,
    finalTotalCost: 0,
    finalPhysicalPnL: 0,
    totalHedgingPnL: 0,
    finalTotalPnL: 0,
  },

  // --- FUTURE 2026 EXPOSURE (Long Term) ---
  {
    id: '9',
    source: 'Qatar',
    strategyName: 'SN2026_RasLaffan_China_Jan',
    buyer: 'China',
    optimized: true,
    deliveryDate: '2026-01-15',
    deliveryMonth: 'Jan-26',
    deliveryWindowStart: '2026-01-14',
    deliveryWindowEnd: '2026-01-16',
    deliveredVolume: 3600000,
    volumeUnit: 'MMBtu',
    sellFormula: '13% Brent + 0.8',
    absoluteSellPrice: 0,
    salesRevenue: 0,
    loadedVolume: 3600000,
    loadingDate: '2025-12-20',
    loadingMonth: 'Dec-25',
    loadingWindowStart: '2025-12-19',
    loadingWindowEnd: '2025-12-21',
    buyFormula: 'JKM - 0.5',
    absoluteBuyPrice: 0,
    incoterms: 'DES',
    src: 'SRC-QAT-26',
    pnlBucket: PnLBucket.Unrealized,
    reconciledPurchaseCost: 0,
    finalSalesRevenue: 0,
    reconciledSalesRevenue: 0,
    finalTotalCost: 0,
    finalPhysicalPnL: 0,
    totalHedgingPnL: 0,
    finalTotalPnL: 0,
  },
  {
    id: '10',
    source: 'Malaysia',
    strategyName: 'SN2026_Bintulu_Japan_Mar',
    buyer: 'Japan',
    optimized: false,
    deliveryDate: '2026-03-20',
    deliveryMonth: 'Mar-26',
    deliveryWindowStart: '2026-03-19',
    deliveryWindowEnd: '2026-03-21',
    deliveredVolume: 3400000,
    volumeUnit: 'MMBtu',
    sellFormula: 'JCC + 1.0',
    absoluteSellPrice: 0,
    salesRevenue: 0,
    loadedVolume: 3400000,
    loadingDate: '2026-03-05',
    loadingMonth: 'Mar-26',
    loadingWindowStart: '2026-03-04',
    loadingWindowEnd: '2026-03-06',
    buyFormula: 'JCC - 0.5',
    absoluteBuyPrice: 0,
    incoterms: 'DES',
    src: 'SRC-MAL-26',
    pnlBucket: PnLBucket.Unrealized,
    reconciledPurchaseCost: 0,
    finalSalesRevenue: 0,
    reconciledSalesRevenue: 0,
    finalTotalCost: 0,
    finalPhysicalPnL: 0,
    totalHedgingPnL: 0,
    finalTotalPnL: 0,
  },
  {
    id: '11',
    source: 'US Gulf',
    strategyName: 'SN2026_CovePoint_UK_Jun',
    buyer: 'UK', // NBP
    optimized: true,
    deliveryDate: '2026-06-15',
    deliveryMonth: 'Jun-26',
    deliveryWindowStart: '2026-06-14',
    deliveryWindowEnd: '2026-06-16',
    deliveredVolume: 3650000,
    volumeUnit: 'MMBtu',
    sellFormula: 'NBP - 0.35',
    absoluteSellPrice: 0,
    salesRevenue: 0,
    loadedVolume: 3650000,
    loadingDate: '2026-05-25',
    loadingMonth: 'May-26',
    loadingWindowStart: '2026-05-24',
    loadingWindowEnd: '2026-05-26',
    buyFormula: '115% HH',
    absoluteBuyPrice: 0,
    incoterms: 'DES',
    src: 'SRC-USG-26',
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

const LoginScreen = ({ onLogin }: { onLogin: () => void }) => {
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        setLoading(true);
        try {
            await authService.login();
            onLogin();
        } catch (e) {
            toast.error("Login Failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl text-center">
                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                     <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                </div>
                <h1 className="text-2xl font-bold text-slate-800 mb-2">Welcome to CargoFlow</h1>
                <p className="text-slate-500 mb-8">Secure Logistics Management System</p>
                
                <button 
                    onClick={handleLogin}
                    disabled={loading}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg shadow-blue-500/30 transition-all flex items-center justify-center gap-2"
                >
                    {loading ? (
                        <>
                            <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            Authenticating...
                        </>
                    ) : (
                        <>
                            <span>Sign in with SSO</span>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        </>
                    )}
                </button>
                <p className="text-xs text-slate-400 mt-6">
                    Protected by Azure Entra ID (Mock Mode)
                </p>
            </div>
        </div>
    );
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const [profiles, setProfiles] = useState<CargoProfile[]>(() => {
    const saved = localStorage.getItem('cargo_profiles');
    if (saved) return JSON.parse(saved);
    // Recalculate on init to ensure prices match formulas vs mock market data
    return MOCK_DATA_RAW.map(p => recalculateProfile(p) as CargoProfile);
  });
  
  const [view, setView] = useState<'dashboard' | 'list' | 'matching' | 'exposure'>('dashboard');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isForwardCurveOpen, setIsForwardCurveOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<CargoProfile | undefined>(undefined);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Realized' | 'Unrealized'>('All');
  
  const [marketData, setMarketData] = useState<Record<string, number>>(getMarketData());
  const [forwardCurve, setForwardCurve] = useState<ForwardCurveRow[]>(getForwardCurve());

  useEffect(() => {
    const checkAuth = async () => {
        const isAuthenticated = authService.isAuthenticated();
        if (isAuthenticated) {
            setUser(authService.getUser());
        }
        setIsInitializing(false);
    };
    checkAuth();
  }, []);

  useEffect(() => {
    localStorage.setItem('cargo_profiles', JSON.stringify(profiles));
  }, [profiles]);

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

  const handleMarketRefresh = () => {
    const current = getMarketData();
    const updated: Record<string, number> = {};
    Object.keys(current).forEach(key => {
        const change = 1 + (Math.random() * 0.04 - 0.02);
        updated[key] = Number((current[key] * change).toFixed(2));
    });
    updateMarketData(updated);
    setMarketData(updated);
    setProfiles(prev => prev.map(p => {
        if (p.pnlBucket === PnLBucket.Realized) return p;
        return recalculateProfile(p) as CargoProfile;
    }));
    toast.success('Market data updated', { position: 'bottom-right', icon: '📈' });
  };

  const handleCurveSaved = () => {
    setForwardCurve(getForwardCurve());
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

  const handleBulkDelete = (ids: Set<string>) => {
    setProfiles(prev => prev.filter(p => !ids.has(p.id)));
    toast.success(`Deleted ${ids.size} profiles`);
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
          const profileMap = new Map(prev.map(p => [p.id, p]));
          importedProfiles.forEach(p => {
              profileMap.set(p.id, p);
          });
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
        deliveryWindowStart: sellProfile.deliveryWindowStart || buyProfile.deliveryWindowStart,
        deliveryWindowEnd: sellProfile.deliveryWindowEnd || buyProfile.deliveryWindowEnd,
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

  if (isInitializing) return null;

  if (!user) {
      return (
          <>
             <Toaster />
             <LoginScreen onLogin={() => setUser(authService.getUser())} />
          </>
      );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-900">
      <Toaster position="top-center" toastOptions={{ style: { borderRadius: '10px', background: '#333', color: '#fff' } }} />
      
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
            <button 
                onClick={() => setView('exposure')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${view === 'exposure' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                Exposure Analysis
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
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                     <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center font-bold text-white text-[10px]">{user.name.charAt(0)}</div>
                     <span className="truncate max-w-[80px]">{user.name}</span>
                </div>
                <button onClick={() => { authService.logout(); setUser(null); }} className="hover:text-white">Sign Out</button>
            </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm z-10 sticky top-0">
            <div className="flex items-center gap-6">
                <h2 className="text-xl font-bold text-slate-800">
                    {view === 'dashboard' ? 'Overview' : view === 'matching' ? 'Trade Reconciliation' : view === 'exposure' ? 'Exposure Analysis' : 'Cargo Management'}
                </h2>
                
                {(view === 'list' || view === 'dashboard') && (
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <svg className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <input 
                                type="text"
                                placeholder="Search cargo..."
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

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative bg-slate-50">
            <AnimatePresence mode="wait">
                {view === 'dashboard' ? (
                    <motion.div key="dashboard" initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:20}} transition={{duration:0.2}}>
                        <Dashboard 
                            profiles={filteredProfiles} 
                            marketData={marketData}
                            forwardCurve={forwardCurve}
                            onRefreshMarket={handleMarketRefresh}
                            onCargoClick={handleEdit}
                        />
                    </motion.div>
                ) : view === 'matching' ? (
                     <motion.div key="matching" initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:-20}} transition={{duration:0.2}} className="h-full">
                        <TradeMatching profiles={profiles} onMatch={handleMatch} />
                     </motion.div>
                ) : view === 'exposure' ? (
                     <motion.div key="exposure" initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:-20}} transition={{duration:0.2}} className="h-full">
                        <ExposureView profiles={profiles} />
                     </motion.div>
                ) : (
                    <motion.div key="list" initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:-20}} transition={{duration:0.2}} className="h-full">
                        <CargoList 
                            profiles={filteredProfiles} 
                            onEdit={handleEdit} 
                            onDelete={handleDelete}
                            onActualize={handleActualize}
                            onBulkDelete={handleBulkDelete}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
      </main>

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

      <AnimatePresence>
      {isImportModalOpen && (
        <BulkImportModal 
            existingProfiles={profiles}
            onClose={() => setIsImportModalOpen(false)}
            onImport={handleBulkImport}
        />
      )}
      </AnimatePresence>

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
