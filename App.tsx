
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Dashboard } from './components/Dashboard';
import { CargoList } from './components/CargoList';
import { CargoForm } from './components/CargoForm';
import { ForwardCurveModal } from './components/ForwardCurveModal';
import { BulkImportModal } from './components/BulkImportModal';
import { ExposureView } from './components/ExposureView';
import { SettingsView } from './components/SettingsView';
import { UserManagement } from './components/UserManagement';
import { DiscrepancyCheck, ReconciliationData } from './components/DiscrepancyCheck';
import { CargoProfile, PnLBucket, ForwardCurveData, ForwardCurve, ForwardCurvePoint } from './types';
import { getMarketData, getForwardCurve, recalculateProfile, getPortfolioYear, saveForwardCurve, normalizeMonthKey, normalizeStrategyName } from './services/calculationService';
import { getFromDB, saveToDB } from './services/db';
import { auth, db, handleFirestoreError, FirestoreOperation, isFirebaseConfigured } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, onSnapshot, collection, query, where, getDoc } from 'firebase/firestore';

// Navigation Items
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-1 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-1 2h-2a2 2 0 01-2-2v-2z' },
  { id: 'cargos', label: 'Cargo List', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 002-2M9 5a2 2 0 012 2h2a2 2 0 012 2' },
  { id: 'exposure', label: 'Exposure View', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2v-6a2 2 0 01-2-2h-2a2 2 0 01-2 v6' },
  { id: 'discrepancy', label: 'Reconciliation', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 002-2M9 5a2 2 0 012 2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
];

const MAX_HISTORY = 50;

const App: React.FC = () => {
  // Hardcoded compliance guest session requested by user to remove Google Auth gate
  const [user, setUser] = useState<User>({
    uid: 'guest_user',
    displayName: 'Guest Trader',
    email: 'guest@cargoflow.local',
    photoURL: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150',
    emailVerified: true,
    isAnonymous: false,
    providerData: []
  } as any);
  const [userRole, setUserRole] = useState<'admin' | 'trader' | 'viewer'>('admin');
  const [testRole, setTestRole] = useState<'admin' | 'trader' | 'viewer' | null>(null);
  const activeRole = testRole || userRole;
  const [isAuthReady, setIsAuthReady] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState('dashboard');
  const [profiles, setProfiles] = useState<CargoProfile[]>([]);
  const [sharedProfiles, setSharedProfiles] = useState<CargoProfile[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // History Stacks
  const [past, setPast] = useState<CargoProfile[][]>([]);
  const [future, setFuture] = useState<CargoProfile[][]>([]);

  const [marketData, setMarketData] = useState<Record<string, number>>({});
  const [forwardCurve, setForwardCurve] = useState<any[]>([]);
  const [portfolioYear, setPortfolioYear] = useState<string>(new Date().getFullYear().toString());
  
  // Persisted TRMS Data for discrepancy check
  const [trmsData, setTrmsData] = useState<ReconciliationData>({
    src: [],
    hedging: [],
    paper: [],
    trmsAgg: {}, 
    forwardCurves: [],
    uniqueValues: { src: {}, hedging: {}, paper: {} },
    extractedRows: [],
    summary: { total: 0, src: 0, hedging: 0, paper: 0 }
  });

  // Guest profile loader & listener
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    // Basic user document initialization in Firestore
    const userRef = doc(db, 'users', 'guest_user');
    getDoc(userRef).then(snap => {
      if (!snap.exists()) {
        setDoc(userRef, {
          uid: 'guest_user',
          email: 'guest@cargoflow.local',
          role: 'admin',
          displayName: 'Guest Trader',
          photoURL: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150',
          lastLogin: new Date().toISOString()
        }, { merge: true }).catch(err => console.warn("Initial guest setup error:", err));
      } else {
        const data = snap.data();
        if (data.role) setUserRole(data.role);
        if (data.preferredYear) setPortfolioYear(data.preferredYear);
      }
    }).catch(err => {
      console.warn("Guest retrieval failed, staying local / guest session:", err);
    });
  }, []);

  // Firestore Sync: Profiles (Shared + Private)
  useEffect(() => {
    if (!user || !isFirebaseConfigured) {
      return;
    }

    // 1. Private Profiles
    const privateQ = query(collection(db, 'users', user.uid, 'cargo_profiles'), where('deleted', '!=', true));
    const unsubPrivate = onSnapshot(privateQ, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as CargoProfile));
      setProfiles(docs);
    }, (err) => {
        if (err.code !== 'permission-denied') {
            handleFirestoreError(err, FirestoreOperation.LIST, `users/${user.uid}/cargo_profiles`);
        }
    });

    // 2. Shared/Global Profiles (The Centralized Database feel)
    const sharedQ = query(collection(db, 'shared_cargo_profiles'), where('deleted', '!=', true));
    const unsubShared = onSnapshot(sharedQ, (snapshot) => {
       const docs = snapshot.docs.map(d => ({ ...d.data(), id: d.id, isShared: true } as CargoProfile));
       setSharedProfiles(docs);
    }, (err) => {
        if (err.code !== 'permission-denied') {
            handleFirestoreError(err, FirestoreOperation.LIST, `shared_cargo_profiles`);
        }
    });

    return () => {
      unsubPrivate();
      unsubShared();
    };
  }, [user]);

  // Combine for aggregated dashboard
  const allProfiles = useMemo(() => {
    // Deduplicate if needed, but here we just merge
    return [...profiles, ...sharedProfiles].filter(p => !p.deleted);
  }, [profiles, sharedProfiles]);

  // Firestore Sync: User Settings (Portfolio Year)
  useEffect(() => {
    if (!user || !isFirebaseConfigured) return;
    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.preferredYear) setPortfolioYear(data.preferredYear);
        if (data.role) setUserRole(data.role);
      }
    }, (err) => {
        if (err.code !== 'permission-denied') {
            handleFirestoreError(err, FirestoreOperation.GET, `users/${user.uid}`);
        }
    });
    return () => unsubscribe();
  }, [user]);

  // History Helper
  const updateProfiles = useCallback((newProfiles: CargoProfile[] | ((prev: CargoProfile[]) => CargoProfile[])) => {
    if (!user) return;
    
    setProfiles((prev: CargoProfile[]) => {
      const next = typeof newProfiles === 'function' ? newProfiles(prev) : newProfiles;
      if (JSON.stringify(next) === JSON.stringify(prev)) return prev;
      
      // Update Firestore
      // For simplicity in this demo, we'll handle individual updates in handleSaveProfile
      // but for bulk operations we'd need a batch.
      
      setPast(history => [...history, prev].slice(-MAX_HISTORY));
      setFuture([]); 
      return next;
    });
  }, [user]);

  const handleLogin = async () => {
    // Session is persistently active for anyone in Guest Sandbox Mode
  };

  const handleLogout = async () => {
    toast.success('Session is persistently active in Sandbox Mode.');
  };

  const handleMarketRefresh = useCallback(async () => {
    const curve = await getForwardCurve();
    setForwardCurve(curve);
    if (curve.length > 0) {
      setMarketData(curve[0].prices);
    }
    updateProfiles((prev: CargoProfile[]) => prev.map((p: CargoProfile) => 
      recalculateProfile(p, true) as CargoProfile
    ));
  }, [updateProfiles]);

  // Modals
  const [isEditing, setIsEditing] = useState(false);
  const [editingProfile, setEditingProfile] = useState<CargoProfile | undefined>(undefined);
  const [formSource, setFormSource] = useState<'dashboard' | 'list'>('dashboard');
  const [isImporting, setIsImporting] = useState(false);
  const [isForwardCurveOpen, setIsForwardCurveOpen] = useState(false);

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      // 1. Try IndexedDB first
      let savedProfiles = await getFromDB('cargo_profiles');
      let savedTrms = await getFromDB('trms_data');
      let isLite = await getFromDB('trms_data_is_lite');

      // 2. Migration from localStorage if IndexedDB is empty
      if (!savedProfiles) {
        const localProfiles = localStorage.getItem('cargo_profiles');
        if (localProfiles) {
          savedProfiles = JSON.parse(localProfiles);
          await saveToDB('cargo_profiles', savedProfiles);
        }
      }

      if (!savedTrms) {
        const localTrms = localStorage.getItem('trms_data');
        if (localTrms) {
          savedTrms = JSON.parse(localTrms);
          await saveToDB('trms_data', savedTrms);
          isLite = localStorage.getItem('trms_data_is_lite') === 'true';
          await saveToDB('trms_data_is_lite', isLite);
        }
      }

      if (savedProfiles) {
        setProfiles(savedProfiles);
      }

      if (savedTrms) {
        try {
          const parsed = savedTrms;
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
          if (isLite === true) {
            toast('TRMS raw lines were not saved due to size limits. Aggregated data is available.', { icon: 'ℹ️', duration: 4000 });
          }
        } catch (e) {
          console.error("Failed to load TRMS data from storage", e);
        }
      }
    };

    loadInitialData();
  }, []);

  // Save profiles on change
  useEffect(() => {
    saveToDB('cargo_profiles', profiles);
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
          toSave.extractedRows = [];
        }
        
        const trmsAggClone = { ...toSave.trmsAgg };
        Object.keys(trmsAggClone).forEach(key => {
          trmsAggClone[key] = { 
            ...trmsAggClone[key],
            hedgingIndices: Array.from(trmsAggClone[key].hedgingIndices) as any
          };
        });
        toSave.trmsAgg = trmsAggClone;
        return toSave;
      };

      const saveTrms = async () => {
        try {
          // With IndexedDB, we can almost always save the full data
          await saveToDB('trms_data', serializeTrms(trmsData, true));
          await saveToDB('trms_data_is_lite', false);
        } catch (e) {
          console.warn("TRMS data too large even for IndexedDB, attempting lite save...", e);
          try {
            await saveToDB('trms_data', serializeTrms(trmsData, false));
            await saveToDB('trms_data_is_lite', true);
            toast.success('TRMS data saved (Summary only)', { icon: '⚠️', duration: 3000 });
          } catch (e2) {
            console.error("TRMS data exceeds storage quota", e2);
            toast.error('Storage quota exceeded. Some data may not be saved.', { duration: 5000 });
          }
        }
      };
      
      saveTrms();
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
            const normMonth = normalizeMonthKey(point.month) || point.month;
            if (!monthMap[normMonth]) monthMap[normMonth] = {};
            monthMap[normMonth][curve.index] = point.value;
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
  }, [trmsData.forwardCurves, handleMarketRefresh]);

  // Auto-sync from Jarvis based on options
  useEffect(() => {
    if (Object.keys(trmsData.trmsAgg).length > 0) {
      const options = trmsData.syncOptions || { syncReconciled: true, syncPrices: false, overwriteManual: false };
      let syncCount = 0;
      
      updateProfiles((prev: CargoProfile[]) => {
        return prev.map(p => {
          const trmsKey = Object.keys(trmsData.trmsAgg).find(k => normalizeStrategyName(k) === normalizeStrategyName(p.strategyName));
          const trms = trmsKey ? trmsData.trmsAgg[trmsKey] : undefined;
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
  }, [trmsData.trmsAgg, trmsData.syncOptions, updateProfiles]);

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

  const handleSaveProfile = async (profile: CargoProfile) => {
    if (!user || userRole === 'viewer') {
      toast.error('Permission denied: Viewer only access');
      return;
    }

    // "Modify the SN instead": Identify if a profile with this Strategy Name already exists in either collection
    const existingShared = sharedProfiles.find(p => p.strategyName.trim().toLowerCase() === profile.strategyName.trim().toLowerCase());
    const existingPrivate = profiles.find(p => p.strategyName.trim().toLowerCase() === profile.strategyName.trim().toLowerCase());
    
    // Determine the target ID and collection. If it exists in shared, we must update the shared one.
    const profileId = existingShared?.id || profile.id || existingPrivate?.id || Date.now().toString();
    const isNowShared = !!existingShared || profile.isShared; // Preserve shared status or upgrade if SN exists in shared
    
    const profileWithId = { 
        ...profile, 
        id: profileId, 
        userId: user.uid, 
        isShared: isNowShared 
    };
    
    const wasShared = allProfiles.find(p => p.id === profileId)?.isShared;

    const targetCollection = isNowShared ? 'shared_cargo_profiles' : 'cargo_profiles';

    // Update local state & IndexedDB first for instant responsiveness
    setProfiles(prev => {
      const exists = prev.some(p => p.id === profileWithId.id);
      const updated = exists 
        ? prev.map(p => p.id === profileWithId.id ? profileWithId : p)
        : [...prev, profileWithId];
      saveToDB('cargo_profiles', updated);
      return updated;
    });

    if (isFirebaseConfigured) {
      const profileRef = isNowShared 
        ? doc(db, 'shared_cargo_profiles', profileId)
        : doc(db, 'users', user.uid, 'cargo_profiles', profileId);

      try {
        await setDoc(profileRef, profileWithId);
        
        // If moving from private to shared (by matching an SN or previous toggle), delete the old private one
        if (isNowShared && existingPrivate && existingPrivate.id !== profileId) {
            const oldPrivateRef = doc(db, 'users', user.uid, 'cargo_profiles', existingPrivate.id);
            await setDoc(oldPrivateRef, { deleted: true }, { merge: true });
        }
        
        // Handle the case where we just updated an existing record but the ID was different (unlikely with SN logic but safe)
        if (profile.id && profile.id !== profileId) {
            const oldRef = wasShared 
                ? doc(db, 'shared_cargo_profiles', profile.id)
                : doc(db, 'users', user.uid, 'cargo_profiles', profile.id);
            await setDoc(oldRef, { deleted: true }, { merge: true });
        }
      } catch (err) {
        console.warn("Firestore save fallback to local:", err);
      }
    }

    setIsEditing(false);
    setEditingProfile(undefined);
    toast.success(isNowShared ? 'Saved to Shared Portfolio' : 'Saved to Private Portfolio');
  };

  const handleDeleteProfile = (id: string) => {
    if (!user || userRole === 'viewer') {
      toast.error('Permission denied: Viewer only access');
      return;
    }
    const profileToDelete = allProfiles.find(p => p.id === id);
    if (!profileToDelete) return;

    if (confirm(`Delete ${profileToDelete.strategyName}?`)) {
      setProfiles(prev => {
        const updated = prev.filter(p => p.id !== id);
        saveToDB('cargo_profiles', updated);
        return updated;
      });
      setSharedProfiles(prev => prev.filter(p => p.id !== id));

      if (isFirebaseConfigured) {
        const profileRef = profileToDelete.isShared
          ? doc(db, 'shared_cargo_profiles', id)
          : doc(db, 'users', user.uid, 'cargo_profiles', id);

        setDoc(profileRef, { deleted: true }, { merge: true })
          .then(() => toast.success('Cargo deleted'))
          .catch(err => console.warn("Firestore delete fallback to local:", err));
      } else {
        toast.success('Cargo deleted');
      }
    }
  };

  const handleBulkDelete = (ids: Set<string>) => {
    if (userRole === 'viewer') {
      toast.error('Permission denied: Viewer only access');
      return;
    }
    if (confirm(`Delete ${ids.size} cargoes?`)) {
      updateProfiles((prev: CargoProfile[]) => prev.filter((p: CargoProfile) => !ids.has(p.id)));
    }
  };

  const handleBulkUpdate = (ids: Set<string>, updates: Partial<CargoProfile>) => {
    if (userRole === 'viewer') {
      toast.error('Permission denied: Viewer only access');
      return;
    }
    updateProfiles((prev: CargoProfile[]) => prev.map((p: CargoProfile) => {
      if (ids.has(p.id)) {
        return recalculateProfile({ ...p, ...updates }, true) as CargoProfile;
      }
      return p;
    }));
  };

  const handleBulkImport = (newProfiles: CargoProfile[]) => {
    if (userRole === 'viewer') {
      toast.error('Permission denied: Viewer only access');
      return;
    }
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

  const handleEdit = (p?: CargoProfile, source: 'dashboard' | 'list' = 'list') => {
    setEditingProfile(p);
    setFormSource(source);
    setIsEditing(true);
  };

  const filteredProfiles = useMemo(() => {
    if (portfolioYear === 'All') return allProfiles;
    return allProfiles.filter((p: CargoProfile) => getPortfolioYear(p).toString() === portfolioYear);
  }, [allProfiles, portfolioYear]);

  const availableYears = useMemo(() => {
      const years = new Set<string>();
      allProfiles.forEach((p: CargoProfile) => years.add(getPortfolioYear(p).toString()));
      const sorted = Array.from(years).sort().reverse();
      return ['All', ...sorted];
  }, [allProfiles]);

  const existingSources = useMemo(() => {
    const sources = new Set<string>();
    allProfiles.forEach(p => {
      if (p.source) sources.add(p.source);
    });
    return Array.from(sources).sort();
  }, [allProfiles]);

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
                  onChange={(e) => {
                    const year = e.target.value;
                    setPortfolioYear(year);
                    if (user) {
                      setDoc(doc(db, 'users', user.uid), { preferredYear: year }, { merge: true });
                    }
                  }}
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

            {/*
             <div className="pt-4 border-t border-slate-800">
               <div className="flex items-center justify-between px-2 mb-4 group">
                 <div className="flex items-center gap-3 min-w-0">
                    <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-slate-700 flex-shrink-0" referrerPolicy="no-referrer" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{user.displayName}</div>
                      <div className="text-[10px] text-slate-500 truncate">{user.email}</div>
                    </div>
                 </div>
                 <button 
                    onClick={() => {
                      setView('settings');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`p-1.5 rounded-lg transition-colors ${view === 'settings' ? 'text-blue-400 bg-blue-500/10' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
                    title="Settings"
                 >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                 </button>
               </div>
               <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg text-xs font-bold uppercase transition-colors"
               >
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                 Sign Out
               </button>
             </div>
           */}
          <button 
             onClick={() => {
               setView('settings');
               setIsMobileMenuOpen(false);
             }}
             className={`w-full flex items-center gap-2 px-4 py-2 mt-2 bg-slate-800/60 hover:bg-slate-700/80 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all ${view === 'settings' ? 'text-blue-400 bg-slate-700/90 border border-slate-700' : 'text-slate-400'}`}
          >
             <svg className="w-4 h-4 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
             System Settings
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
              <div className="flex items-baseline gap-2">
                <h1 className="text-lg lg:text-xl font-bold text-slate-800 capitalize truncate">
                  {view === 'settings' ? 'System Settings' : (NAV_ITEMS.find((n: any) => n.id === view)?.label || view)}
                </h1>
              </div>
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

                {view !== 'discrepancy' && activeRole !== 'viewer' && (
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
                            userRole={activeRole}
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
                            onForwardCurveUpdate={async () => setForwardCurve(await getForwardCurve())}
                            trmsData={trmsData}
                            userRole={activeRole}
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
                            onForwardCurveUpdate={async () => setForwardCurve(await getForwardCurve())}
                        />
                    </motion.div>
                ) : view === 'settings' ? (
                  <motion.div key="settings" initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:20}} className="w-full">
                      <SettingsView 
                        user={user} 
                        userRole={userRole} 
                        testRole={testRole}
                        setTestRole={setTestRole}
                        preferredYear={portfolioYear}
                        onSetPreferredYear={(y) => {
                          setPortfolioYear(y);
                          setDoc(doc(db, 'users', user.uid), { preferredYear: y }, { merge: true });
                        }}
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
                        existingSources={existingSources}
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
