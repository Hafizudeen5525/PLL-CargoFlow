
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CargoProfile, PnLBucket } from '../types';
import { estimatePricingDate, detectUnit } from '../services/calculationService';
import { motion, AnimatePresence } from 'framer-motion';

interface ExposureViewProps {
    profiles: CargoProfile[];
}

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
    const animationRef = useRef<number>(0);

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

    // 3. Classify Cargoes based on SimDate
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
            let displayVol = vol; // Keep original for display
            
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

        // Sort floating by urgency (pricing soonest)
        floating.sort((a, b) => a._daysToFix - b._daysToFix);
        // Sort fixed by recency
        fixed.sort((a, b) => b._daysToFix - a._daysToFix);

        return { floatingCargoes: floating, fixedCargoes: fixed, totalExposure: exposure };
    }, [profiles, simDate]);

    // Color helpers
    const getIndexColor = (formula: string) => {
        const f = (formula || '').toUpperCase();
        if (f.includes('JKM')) return 'bg-emerald-500 border-emerald-400';
        if (f.includes('TTF')) return 'bg-blue-500 border-blue-400';
        if (f.includes('NBP')) return 'bg-indigo-500 border-indigo-400';
        if (f.includes('HH')) return 'bg-amber-500 border-amber-400';
        if (f.includes('BRENT') || f.includes('JCC')) return 'bg-rose-500 border-rose-400';
        return 'bg-slate-500 border-slate-400';
    };

    return (
        <div className="h-full flex flex-col space-y-4 overflow-hidden">
            {/* --- Control Deck --- */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 z-10">
                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                    
                    {/* Stats Ticker */}
                    <div className="flex items-center gap-4 min-w-[200px]">
                        <div className="p-3 bg-rose-50 rounded-lg">
                             <svg className="w-6 h-6 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                        <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Total Floating Exposure</div>
                            <motion.div 
                                key={totalExposure} // Triggers animation on change
                                initial={{ scale: 1.2, color: '#f43f5e' }}
                                animate={{ scale: 1, color: '#1e293b' }}
                                className="text-2xl font-bold font-mono"
                            >
                                {(totalExposure / 1000000).toFixed(2)}m <span className="text-sm font-sans text-slate-400">MMBtu</span>
                            </motion.div>
                        </div>
                    </div>

                    {/* Timeline Controls */}
                    <div className="flex-1 w-full max-w-2xl bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center gap-4">
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
                            {/* Tick Marks could go here */}
                        </div>

                        <div className="shrink-0 text-right min-w-[90px]">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Sim Date</div>
                            <div className="text-sm font-bold text-blue-600">{formatDate(simDate)}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- The Visual Stage --- */}
            <div className="flex-1 flex gap-6 min-h-0 overflow-hidden relative">
                
                {/* 1. THE STORM (Floating Exposure) */}
                <div className="flex-1 bg-white/50 rounded-xl border border-slate-200/60 p-4 flex flex-col relative overflow-hidden backdrop-blur-sm">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-400 to-amber-400 z-10"></div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-4 flex justify-between">
                        <span>🌊 The Market (Unfixed Price)</span>
                        <span className="text-rose-500">{floatingCargoes.length} Cargoes</span>
                    </h3>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-3">
                         <AnimatePresence>
                             {floatingCargoes.length === 0 && (
                                 <motion.div initial={{opacity:0}} animate={{opacity:1}} className="text-center text-slate-400 mt-20 text-sm">
                                     No floating exposure. The waters are calm.
                                 </motion.div>
                             )}
                            {floatingCargoes.map((p) => (
                                <CargoCard 
                                    key={p.id} 
                                    profile={p} 
                                    status="floating" 
                                    colorClass={getIndexColor(p.sellFormula || p.buyFormula)} 
                                />
                            ))}
                         </AnimatePresence>
                    </div>
                </div>

                {/* Arrow Connector */}
                <div className="flex flex-col items-center justify-center text-slate-300 gap-1">
                    <div className="h-full w-[2px] bg-slate-200/50 rounded-full"></div>
                    <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                    <div className="h-full w-[2px] bg-slate-200/50 rounded-full"></div>
                </div>

                {/* 2. THE HARBOR (Fixed Price) */}
                <div className="flex-1 bg-slate-50/80 rounded-xl border border-slate-200 p-4 flex flex-col relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-blue-400 z-10"></div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-4 flex justify-between">
                        <span>⚓ Safe Harbor (Price Fixed)</span>
                        <span className="text-emerald-600">{fixedCargoes.length} Cargoes</span>
                    </h3>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-3">
                         <AnimatePresence>
                             {fixedCargoes.length === 0 && (
                                 <motion.div initial={{opacity:0}} animate={{opacity:1}} className="text-center text-slate-400 mt-20 text-sm">
                                     No fixed cargoes yet.
                                 </motion.div>
                             )}
                            {fixedCargoes.map((p) => (
                                <CargoCard 
                                    key={p.id} 
                                    profile={p} 
                                    status="fixed" 
                                    colorClass={getIndexColor(p.sellFormula || p.buyFormula)} 
                                />
                            ))}
                         </AnimatePresence>
                    </div>
                </div>

            </div>
        </div>
    );
};

// --- Subcomponent: The Animated Card ---
const CargoCard = ({ profile, status, colorClass }: { profile: any, status: 'floating' | 'fixed', colorClass: string }) => {
    return (
        <motion.div
            layoutId={profile.id} // <--- MAGIC: This creates the flying animation between lists
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className={`relative p-3 rounded-lg border shadow-sm flex items-center justify-between group overflow-hidden ${
                status === 'floating' 
                ? 'bg-white border-slate-200 hover:shadow-md' 
                : 'bg-white/60 border-slate-100 opacity-80'
            }`}
        >
            {/* Visual Flair Bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${colorClass.split(' ')[0]}`}></div>
            
            <div className="flex items-center gap-3 pl-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white shadow-sm text-[10px] font-bold ${colorClass.split(' ')[0]}`}>
                    {status === 'floating' ? (
                        <motion.svg 
                            animate={{ rotate: [0, 5, -5, 0] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                            className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </motion.svg>
                    ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    )}
                </div>
                <div>
                    <div className="text-xs font-bold text-slate-700">{profile.strategyName}</div>
                    <div className="text-[10px] text-slate-400">{profile.source} → {profile.buyer}</div>
                </div>
            </div>

            <div className="text-right">
                <div className="text-xs font-bold text-slate-800">{profile._displayVol.toLocaleString()} <span className="text-[9px] font-normal text-slate-400">{profile._unit}</span></div>
                
                {status === 'floating' ? (
                    <div className="text-[10px] font-medium text-rose-500 flex items-center justify-end gap-1">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                        </span>
                        <span>Fixing in {profile._daysToFix}d</span>
                    </div>
                ) : (
                    <div className="text-[10px] font-medium text-emerald-600 flex items-center justify-end gap-1">
                        Fixed {Math.abs(profile._daysToFix)}d ago
                    </div>
                )}
            </div>
        </motion.div>
    );
};
