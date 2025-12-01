import React, { useState, useMemo } from 'react';
import { CargoProfile } from '../types';
import { motion, AnimatePresence } from 'framer-motion';

interface TradeMatchingProps {
  profiles: CargoProfile[];
  onMatch: (buyProfile: CargoProfile, sellProfile: CargoProfile) => void;
}

export const TradeMatching: React.FC<TradeMatchingProps> = ({ profiles, onMatch }) => {
  const [selectedBuyId, setSelectedBuyId] = useState<string | null>(null);
  const [selectedSellId, setSelectedSellId] = useState<string | null>(null);

  // Filter for Orphan positions
  const unmatchedBuys = useMemo(() => 
    profiles.filter(p => p.source && (!p.buyer || p.buyer.trim() === '')), 
  [profiles]);

  const unmatchedSells = useMemo(() => 
    profiles.filter(p => p.buyer && (!p.source || p.source.trim() === '')), 
  [profiles]);

  const handleAutoMatch = () => {
    // Simple heuristic: Match if volumes are within 10% and dates within 30 days
    // This is just a suggestion engine
    const suggestions: {buy: CargoProfile, sell: CargoProfile}[] = [];
    const usedBuyIds = new Set<string>();
    const usedSellIds = new Set<string>();

    unmatchedBuys.forEach(buy => {
        const buyDate = new Date(buy.loadingDate || buy.deliveryDate || Date.now());
        
        const match = unmatchedSells.find(sell => {
            if (usedSellIds.has(sell.id)) return false;
            
            const sellDate = new Date(sell.deliveryDate || sell.loadingDate || Date.now());
            const daysDiff = Math.abs(buyDate.getTime() - sellDate.getTime()) / (1000 * 3600 * 24);
            
            // Check Volume (within 10%)
            const volDiff = Math.abs((buy.loadedVolume || 0) - (sell.deliveredVolume || 0));
            const volThreshold = (buy.loadedVolume || 0) * 0.1;
            
            return daysDiff < 30 && volDiff < volThreshold;
        });

        if (match) {
            suggestions.push({ buy, sell: match });
            usedBuyIds.add(buy.id);
            usedSellIds.add(match.id);
        }
    });
    
    // Auto-select the first suggestion if available
    if (suggestions.length > 0) {
        setSelectedBuyId(suggestions[0].buy.id);
        setSelectedSellId(suggestions[0].sell.id);
    }
  };

  const handleConfirmMatch = () => {
    const buy = unmatchedBuys.find(p => p.id === selectedBuyId);
    const sell = unmatchedSells.find(p => p.id === selectedSellId);
    if (buy && sell) {
        onMatch(buy, sell);
        setSelectedBuyId(null);
        setSelectedSellId(null);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col">
        <div className="mb-6 flex justify-between items-end">
            <div>
                <h2 className="text-2xl font-bold text-slate-800">Trade Matching</h2>
                <p className="text-slate-500 text-sm mt-1">Link orphan Buy (Source) cargos with Sell (Buyer) cargos.</p>
            </div>
            <button 
                onClick={handleAutoMatch}
                className="px-4 py-2 bg-indigo-100 text-indigo-700 font-bold rounded-lg text-sm hover:bg-indigo-200 transition-colors flex items-center gap-2"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                Auto-Suggest Match
            </button>
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 min-h-0">
            {/* Long Positions (Buys) */}
            <div className="flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-emerald-50/50 p-4 border-b border-emerald-100 flex justify-between items-center">
                    <h3 className="font-bold text-emerald-800 flex items-center gap-2">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                        Unmatched Buys (Longs)
                    </h3>
                    <span className="text-xs font-mono bg-white px-2 py-1 rounded border border-emerald-100 text-emerald-600">{unmatchedBuys.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {unmatchedBuys.length === 0 && (
                        <div className="text-center text-slate-400 py-10 text-sm">No unmatched buys found.</div>
                    )}
                    {unmatchedBuys.map(profile => (
                        <div 
                            key={profile.id}
                            onClick={() => setSelectedBuyId(profile.id)}
                            className={`p-4 rounded-lg border cursor-pointer transition-all ${
                                selectedBuyId === profile.id 
                                ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500' 
                                : 'bg-white border-slate-100 hover:border-emerald-200 hover:shadow-md'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-bold text-slate-700">{profile.source || 'Unknown Source'}</span>
                                <span className="text-xs font-mono text-slate-400">{profile.loadingDate}</span>
                            </div>
                            <div className="flex justify-between text-xs text-slate-500">
                                <span>Vol: {profile.loadedVolume.toLocaleString()} MT</span>
                                <span className="font-mono">{profile.strategyName}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Short Positions (Sells) */}
            <div className="flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-rose-50/50 p-4 border-b border-rose-100 flex justify-between items-center">
                    <h3 className="font-bold text-rose-800 flex items-center gap-2">
                        <span className="w-2 h-2 bg-rose-500 rounded-full"></span>
                        Unmatched Sells (Shorts)
                    </h3>
                    <span className="text-xs font-mono bg-white px-2 py-1 rounded border border-rose-100 text-rose-600">{unmatchedSells.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {unmatchedSells.length === 0 && (
                         <div className="text-center text-slate-400 py-10 text-sm">No unmatched sells found.</div>
                    )}
                    {unmatchedSells.map(profile => (
                        <div 
                            key={profile.id}
                            onClick={() => setSelectedSellId(profile.id)}
                            className={`p-4 rounded-lg border cursor-pointer transition-all ${
                                selectedSellId === profile.id 
                                ? 'bg-rose-50 border-rose-500 ring-1 ring-rose-500' 
                                : 'bg-white border-slate-100 hover:border-rose-200 hover:shadow-md'
                            }`}
                        >
                             <div className="flex justify-between items-start mb-2">
                                <span className="font-bold text-slate-700">{profile.buyer || 'Unknown Buyer'}</span>
                                <span className="text-xs font-mono text-slate-400">{profile.deliveryDate}</span>
                            </div>
                            <div className="flex justify-between text-xs text-slate-500">
                                <span>Vol: {profile.deliveredVolume.toLocaleString()} MT</span>
                                <span className="font-mono">{profile.strategyName}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* Action Bar */}
        <AnimatePresence>
            {selectedBuyId && selectedSellId && (
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="mt-6 bg-slate-900 text-white p-4 rounded-xl flex items-center justify-between shadow-2xl"
                >
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-400 uppercase font-bold">Merging</span>
                            <span className="font-medium text-emerald-400">{unmatchedBuys.find(b => b.id === selectedBuyId)?.source}</span>
                        </div>
                        <div className="text-slate-500">→</div>
                        <div className="flex flex-col">
                             <span className="text-xs text-slate-400 uppercase font-bold">Into</span>
                             <span className="font-medium text-rose-400">{unmatchedSells.find(s => s.id === selectedSellId)?.buyer}</span>
                        </div>
                    </div>
                    <button 
                        onClick={handleConfirmMatch}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors shadow-lg shadow-blue-900/50"
                    >
                        Confirm Match
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
    </div>
  );
};