
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CargoProfile, PnLBucket } from '../types';
import { estimatePricingDate, detectUnit, getGroupName } from '../services/calculationService';
import { motion, AnimatePresence } from 'framer-motion';

interface ExposureViewProps {
    profiles: CargoProfile[];
}

// Helper to determine Index Type
const getIndexType = (formula: string) => {
    const f = (formula || '').toUpperCase();
    if (f.includes('HH')) return 'HH';
    if (f.includes('TTF')) return 'TTF';
    if (f.includes('NBP')) return 'NBP';
    if (f.includes('JKM')) return 'JKM';
    if (f.includes('BRENT') || f.includes('DATED')) return 'Brent';
    if (f.includes('JCC')) return 'JCC';
    if (f.includes('AECO')) return 'AECO';
    return 'Other';
};

export const ExposureView: React.FC<ExposureViewProps> = ({ profiles }) => {
    // 1. Determine Timeline Boundaries
    const { minDate, maxDate } = useMemo(() => {
        const now = new Date().getTime();
        let min = now;
        let max = now + 1000 * 60 * 60 * 24 * 365 * 1.5; // Default 1.5 years ahead

        profiles.forEach(p => {
            const d = p.deliveryDate ? new Date(p.deliveryDate).getTime() : now;
            if (d < min) min = d;
            if (d > max) max = d;
        });
        
        // Add buffer
        return { 
            minDate: min - 1000 * 60 * 60 * 24 * 30, // -1 Month
            maxDate: max + 1000 * 60 * 60 * 24 * 30  // +1 Month
        };
    }, [profiles]);

    const [simDate, setSimDate] = useState<number>(new Date().getTime());
    const [isPlaying, setIsPlaying] = useState(false);
    
    // Filters & Configuration
    const [groupByMode, setGroupByMode] = useState<'group' | 'source'>('group');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedIndex, setSelectedIndex] = useState<string | null>(null);
    
    // Dynamic Grouping Config
    const [groupThreshold, setGroupThreshold] = useState<number>(2);
    const [showConfig, setShowConfig] = useState(false);
    
    const animationRef = useRef<number>(0);

    // Reset selected category when grouping mode changes
    useEffect(() => {
        setSelectedCategory(null);
    }, [groupByMode]);

    // 2. Animation Loop
    useEffect(() => {
        if (isPlaying) {
            const range = maxDate - minDate;
            const step = range / 300; // Complete loop in ~5 seconds
            const animate = () => {
                setSimDate(prev => {
                    if (prev >= maxDate) {
                        setIsPlaying(false);
                        return maxDate;
                    }
                    return prev + step;
                });
                animationRef.current = requestAnimationFrame(animate);
            };
            animationRef.current = requestAnimationFrame(animate);
        } else {
            cancelAnimationFrame(animationRef.current);
        }
        return () => cancelAnimationFrame(animationRef.current);
    }, [isPlaying, minDate, maxDate]);

    const formatDate = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', year: 'numeric', day: 'numeric' });

    // 3. Dynamic Source Categorization Logic
    const getDynamicSourceCategory = useMemo(() => {
        const counts: Record<string, number> = {};
        profiles.forEach(p => {
            const s = (p.source || 'Unknown').trim();
            counts[s] = (counts[s] || 0) + 1;
        });

        return (sourceName: string) => {
            const s = (sourceName || 'Unknown').trim();
            // If the source appears often enough, it is its own category. Otherwise "Others".
            if ((counts[s] || 0) >= groupThreshold) {
                return s;
            }
            return 'Others';
        };
    }, [profiles, groupThreshold]);

    // Unified Category Getter based on Mode
    const getProfileCategory = (p: CargoProfile) => {
        if (groupByMode === 'group') {
            return getGroupName(p.strategyName);
        }
        return getDynamicSourceCategory(p.source);
    };

    // 4. Classify Cargoes based on SimDate
    const { floatingCargoes, fixedCargoes, totalExposure } = useMemo(() => {
        const floating: any[] = [];
        const fixed: any[] = [];
        let exposure = 0;

        profiles.forEach(p => {
            if (p.pnlBucket === PnLBucket.Realized) return; // Ignore realized history for future risk view

            const pricingEndStr = p.pricingEndDate || estimatePricingDate(p.sellFormula || p.buyFormula, p.deliveryDate);
            const pricingEnd = pricingEndStr ? new Date(pricingEndStr).getTime() : 0;
            
            // Normalize Volume
            let vol = p.deliveredVolume || 0;
            const unit = p.volumeUnit || detectUnit(p.sellFormula || p.buyFormula);
            let displayVol = vol;
            
            // Normalize for aggregation (MMBtu)
            if (unit === 'bbl') vol *= 5.8;
            else if (unit === 'm3') vol *= 24;
            else if (unit === 'MT') vol *= 52;

            const isExposed = simDate < pricingEnd;
            const daysToFix = Math.ceil((pricingEnd - simDate) / (1000 * 60 * 60 * 24));

            const item = { ...p, _volMMBtu: vol, _displayVol: displayVol, _daysToFix: daysToFix, _unit: unit };

            if (isExposed) {
                floating.push(item);
                exposure += vol;
            } else {
                fixed.push(item);
            }
        });

        floating.sort((a, b) => a._daysToFix - b._daysToFix);
        fixed.sort((a, b) => b._daysToFix - a._daysToFix);

        return { floatingCargoes: floating, fixedCargoes: fixed, totalExposure: exposure };
    }, [profiles, simDate]);

    // 5. Source Breakdown & Available Indices
    const { categoryBreakdown, availableIndices } = useMemo(() => {
        const groups: Record<string, { total: number, indices: Record<string, number> }> = {};
        const indicesSet = new Set<string>();

        floatingCargoes.forEach((p: any) => {
            const cat = getProfileCategory(p);
            if (!groups[cat]) groups[cat] = { total: 0, indices: {} };
            
            const idx = getIndexType(p.sellFormula || p.buyFormula);
            indicesSet.add(idx);
            
            const vol = Number(p._volMMBtu || 0);
            groups[cat].total += vol;
            groups[cat].indices[idx] = (groups[cat].indices[idx] || 0) + vol;
        });

        const sortedGroups = Object.entries(groups).sort((a, b) => {
            if (a[0] === 'Others') return 1;
            if (b[0] === 'Others') return -1;
            return b[1].total - a[1].total;
        });

        const sortedIndices = Array.from(indicesSet).sort();

        return { categoryBreakdown: sortedGroups, availableIndices: sortedIndices };
    }, [floatingCargoes, groupByMode, getDynamicSourceCategory]);

    // 6. Apply Interactive Filters to Lists
    const filteredFloating = useMemo(() => {
        return floatingCargoes.filter((p: any) => {
            if (selectedCategory && getProfileCategory(p) !== selectedCategory) return false;
            if (selectedIndex && getIndexType(p.sellFormula || p.buyFormula) !== selectedIndex) return false;
            return true;
        });
    }, [floatingCargoes, selectedCategory, selectedIndex, groupByMode, getDynamicSourceCategory]);

    const filteredFixed = useMemo(() => {
        return fixedCargoes.filter((p: any) => {
            if (selectedCategory && getProfileCategory(p) !== selectedCategory) return false;
            if (selectedIndex && getIndexType(p.sellFormula || p.buyFormula) !== selectedIndex) return false;
            return true;
        });
    }, [fixedCargoes, selectedCategory, selectedIndex, groupByMode, getDynamicSourceCategory]);

    const getIndexColorStr = (idx: string) => {
         if (!idx) return 'bg-slate-400';
         const f = idx.toUpperCase();
         if (f === 'JKM') return 'bg-emerald-500';
         if (f === 'TTF') return 'bg-blue-500';
         if (f === 'NBP') return 'bg-indigo-500';
         if (f === 'HH') return 'bg-amber-500';
         if (f === 'BRENT') return 'bg-rose-500';
         if (f === 'JCC') return 'bg-orange-500';
         return 'bg-slate-400';
    };

    const getIndexColor = (formula: string) => {
        const f = (formula || '').toUpperCase();
        if (f.includes('JKM')) return 'bg-emerald-500 border-emerald-400';
        if (f.includes('TTF')) return 'bg-blue-500 border-blue-400';
        if (f.includes('NBP')) return 'bg-indigo-500 border-indigo-400';
        if (f.includes('HH')) return 'bg-amber-500 border-amber-400';
        if (f.includes('BRENT')) return 'bg-rose-500 border-rose-400';
        if (f.includes('JCC')) return 'bg-orange-500 border-orange-400';
        return 'bg-slate-500 border-slate-400';
    };

    return (
        <div className="h-full flex flex-col md:flex-row gap-6 p-2 overflow-hidden">
            <div className="w-full md:w-[380px] flex flex-col gap-4 h-full min-w-0">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex-shrink-0">
                    <div className="flex justify-between items-center mb-3">
                         <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Filter by Index</h3>
                         {selectedIndex && (
                            <button onClick={() => setSelectedIndex(null)} className="text-[10px] text-rose-500 font-bold hover:underline">Clear</button>
                         )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                         <button 
                            onClick={() => setSelectedIndex(null)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                                selectedIndex === null 
                                ? 'bg-slate-800 text-white border-slate-800' 
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                            }`}
                        >
                            All
                        </button>
                        {availableIndices.map(idx => (
                            <button
                                key={idx}
                                onClick={() => setSelectedIndex(idx === selectedIndex ? null : idx)}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center gap-1.5 ${
                                    selectedIndex === idx 
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-1 ring-blue-200' 
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                                }`}
                            >
                                <span className={`w-2 h-2 rounded-full ${getIndexColorStr(idx)}`}></span>
                                {idx}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                     <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                    <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                    Exposure Breakdown
                                </h3>
                                <p className="text-[10px] text-slate-500 mt-1">
                                    By {groupByMode === 'group' ? 'Strategy Mapped Group' : 'Source Facility'}
                                </p>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <div className="flex bg-white p-0.5 rounded-lg border border-slate-200">
                                    <button 
                                        onClick={() => setGroupByMode('group')}
                                        className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${groupByMode === 'group' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                        title="Auto-map by Strategy String"
                                    >
                                        Auto-Group
                                    </button>
                                    <button 
                                        onClick={() => setGroupByMode('source')}
                                        className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${groupByMode === 'source' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                        title="Strictly Source Port"
                                    >
                                        Source
                                    </button>
                                </div>

                                {groupByMode === 'source' && (
                                    <button 
                                        onClick={() => setShowConfig(!showConfig)}
                                        className={`p-1.5 rounded transition-colors ${showConfig ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:bg-slate-100'}`}
                                        title="Grouping Settings"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    </button>
                                )}
                            </div>
                        </div>

                        <AnimatePresence>
                            {showConfig && groupByMode === 'source' && (
                                <motion.div 
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="bg-indigo-50/50 rounded-lg p-3 border border-indigo-100 text-xs">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-bold text-slate-700">Min. Sources for Group</span>
                                            <span className="bg-white px-2 py-0.5 rounded border border-indigo-100 font-mono text-indigo-600">{groupThreshold}</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="1" 
                                            max="10" 
                                            value={groupThreshold} 
                                            onChange={(e) => setGroupThreshold(Number(e.target.value))}
                                            className="w-full h-1.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                        />
                                        <p className="text-[10px] text-slate-500 mt-2 leading-tight">
                                            Sources with fewer than {groupThreshold} cargoes will be grouped into "Others".
                                        </p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 bg-slate-50/30">
                        {categoryBreakdown.length === 0 ? (
                            <div className="text-center text-slate-400 py-10 text-xs">No active exposure.</div>
                        ) : (
                            categoryBreakdown.map(([category, data]) => {
                                const isSelected = selectedCategory === category;
                                return (
                                    <div 
                                        key={category} 
                                        onClick={() => setSelectedCategory(isSelected ? null : category)}
                                        className={`group relative bg-white rounded-xl border p-4 shadow-sm cursor-pointer transition-all hover:shadow-md ${
                                            isSelected 
                                            ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50/10' 
                                            : 'border-slate-200 hover:border-blue-300'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex flex-col">
                                                <span className={`font-bold text-base ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>{category}</span>
                                                <span className="text-[9px] text-slate-400">
                                                    {groupByMode === 'group' ? 'Strategy String' : 'Facility Source'}
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm font-mono font-bold text-rose-500">{(Number(data.total)/1000000).toFixed(2)}m</div>
                                                <div className="text-[9px] text-slate-400">Floating</div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-slate-100 mb-3">
                                            {Object.entries(data.indices).map(([idx, vol], i) => (
                                                <div 
                                                    key={i} 
                                                    className={`${getIndexColorStr(idx)} h-full`} 
                                                    style={{ width: `${(Number(vol) / Number(data.total)) * 100}%` }}
                                                />
                                            ))}
                                        </div>

                                        <div className="space-y-1">
                                            {Object.entries(data.indices).map(([idx, vol]) => (
                                                <div key={idx} className="flex justify-between items-center text-xs">
                                                     <div className="flex items-center gap-1.5">
                                                        <div className={`w-1.5 h-1.5 rounded-full ${getIndexColorStr(idx)}`}></div>
                                                        <span className="text-slate-500">{idx}</span>
                                                     </div>
                                                     <span className="font-mono text-slate-600">{(Number(vol)/1000000).toFixed(2)}m</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col gap-4 min-w-0 h-full">
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 flex-shrink-0">
                    <button 
                        onClick={() => setIsPlaying(!isPlaying)}
                        className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-sm ${isPlaying ? 'bg-amber-100 text-amber-600' : 'bg-white text-blue-600 border border-slate-200 hover:border-blue-400'}`}
                    >
                        {isPlaying ? (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                        ) : (
                            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        )}
                    </button>
                    
                    <div className="flex-1 relative">
                        <input 
                            type="range" 
                            min={minDate} 
                            max={maxDate} 
                            step={1000 * 60 * 60 * 24}
                            value={simDate}
                            onChange={(e) => {
                                setSimDate(Number(e.target.value));
                                setIsPlaying(false);
                            }}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 relative z-10"
                        />
                    </div>

                    <div className="shrink-0 text-right min-w-[100px] border-l border-slate-100 pl-4">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Sim Date</div>
                        <div className="text-sm font-bold text-blue-600">{formatDate(simDate)}</div>
                    </div>
                </div>

                <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
                    <div className={`flex-[2] bg-white/60 rounded-xl border flex flex-col relative overflow-hidden backdrop-blur-sm transition-all shadow-sm ${
                        (selectedCategory || selectedIndex) ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200'
                    }`}>
                        <div className="bg-white/50 p-4 border-b border-slate-100 flex justify-between items-center sticky top-0 z-10 backdrop-blur-md">
                            <h3 className="text-sm font-bold text-slate-700 uppercase flex items-center gap-2">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-rose-100 text-rose-500">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                </span>
                                Floating Exposure
                            </h3>
                            <div className="flex items-center gap-2">
                                {(selectedCategory || selectedIndex) && (
                                    <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                                        Filtered: {filteredFloating.length}
                                    </span>
                                )}
                                <span className="text-xs font-mono font-bold text-slate-400">{filteredFloating.length} Cargoes</span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
                            <AnimatePresence mode="popLayout">
                                {filteredFloating.length === 0 && (
                                    <motion.div initial={{opacity:0}} animate={{opacity:1}} className="text-center text-slate-400 mt-20 text-sm">
                                        No floating exposure matches your filter.
                                    </motion.div>
                                )}
                                {filteredFloating.map((p: any) => (
                                    <CargoCard key={p.id} profile={p} status="floating" colorClass={getIndexColor(p.sellFormula || p.buyFormula)} />
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>

                    <div className="flex-1 bg-slate-50 rounded-xl border border-slate-200 flex flex-col relative overflow-hidden">
                        <div className="bg-slate-100/50 p-4 border-b border-slate-200 flex justify-between items-center sticky top-0 z-10">
                            <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                </span>
                                Fixed Price
                            </h3>
                             <span className="text-xs font-mono font-bold text-slate-400">{filteredFixed.length}</span>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
                            <AnimatePresence mode="popLayout">
                                {filteredFixed.length === 0 && (
                                    <motion.div initial={{opacity:0}} animate={{opacity:1}} className="text-center text-slate-400 mt-20 text-xs">
                                        No fixed cargoes.
                                    </motion.div>
                                )}
                                {filteredFixed.map((p: any) => (
                                    <CargoCard key={p.id} profile={p} status="fixed" colorClass={getIndexColor(p.sellFormula || p.buyFormula)} />
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const CargoCard: React.FC<{ profile: any, status: 'floating' | 'fixed', colorClass: string }> = ({ profile, status, colorClass }) => {
    return (
        <motion.div
            layoutId={profile.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`relative p-4 rounded-xl border shadow-sm flex items-center justify-between group overflow-hidden transition-all ${
                status === 'floating' 
                ? 'bg-white border-slate-200 hover:shadow-md hover:border-blue-300 min-h-[80px]' 
                : 'bg-white/80 border-slate-200 opacity-80 min-h-[70px]'
            }`}
        >
            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${colorClass.split(' ')[0]}`}></div>
            
            <div className="flex items-center gap-4 pl-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm text-xs font-bold ${colorClass.split(' ')[0]}`}>
                    {status === 'floating' ? (
                        <motion.svg 
                            animate={{ rotate: [0, 10, -10, 0] }}
                            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                            className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </motion.svg>
                    ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    )}
                </div>
                <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-800 truncate max-w-[180px]">{profile.strategyName}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">{getGroupName(profile.strategyName)}</span>
                        <span className="truncate max-w-[100px]">{profile.source}</span>
                        <span className="text-slate-300">→</span>
                        <span className="truncate max-w-[100px]">{profile.buyer}</span>
                    </div>
                </div>
            </div>

            <div className="text-right shrink-0">
                <div className="text-sm font-bold text-slate-800 font-mono">
                    {(Number(profile._displayVol)/1000).toFixed(0)}k <span className="text-[10px] font-sans font-normal text-slate-400">{profile._unit}</span>
                </div>
                
                {status === 'floating' ? (
                    <div className="text-xs font-medium text-rose-500 flex items-center justify-end gap-1.5 mt-1">
                         <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                        </span>
                        Fix in {profile._daysToFix}d
                    </div>
                ) : (
                    <div className="text-xs font-medium text-emerald-600 flex items-center justify-end gap-1 mt-1">
                        Fixed
                    </div>
                )}
            </div>
        </motion.div>
    );
};
