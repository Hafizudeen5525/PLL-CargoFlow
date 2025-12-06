
import React, { useState, useRef, useEffect } from 'react';
import { CargoProfile, PnLBucket } from '../types';
import { getCoordinates } from '../services/locationService';
import { motion, AnimatePresence } from 'framer-motion';

interface WorldMapProps {
    profiles: CargoProfile[];
    height?: number | string;
}

// Simple simplified World Map SVG Path
const WORLD_PATH = "M158 152c-4-2-7-6-6-10 0-4-3-7-7-9-2-1-4-1-6 2-1 2-4 3-6 4-3 0-5 3-5 5 0 2-2 4-5 4-2 0-4 1-5 2-2 2-3 4-5 6 0 2-1 5-3 6-1 2 0 4-2 5-1 2-4 3-6 2-3-1-5-3-7-4-1-2-1-4-2-6-2-2-5-2-7-1-2 1-4 3-5 4-1 1-2 3-3 4-2 1-4 0-5-1-2-1-3-3-4-5-2-1-4-2-5-3-2-2-3-5-3-7 0-3-1-5-2-8-2-2-4-3-6-3-2-1-4-1-5-2-2-1-3-3-4-5-2-1-3-2-5-3-2-1-4 0-6 1-2 1-3 3-3 5 0 3 0 5-2 7-1 2-2 4-3 6-2 2-2 4-4 5-1 1-3 2-4 2-3 1-5 0-7 0-2-1-4-2-5-3-2-1-4-2-6-1-2 1-3 3-4 5-1 2 0 5-2 7-1 2-3 3-5 4-2 1-4 2-6 2-2 1-3 3-3 6 0 2 0 5-1 7-2 2-4 3-6 3-2 0-4-1-6-1-2-1-3-2-5-2-2 0-3 2-4 4-1 2-2 4-3 6-1 2 0 5-2 7-1 2-3 4-5 5-1 2 0 4-2 6-1 2-3 3-5 3-2 0-5-1-7-1-3-1-5-2-7-3-1-2-1-4-2-6-1-2-3-3-5-3-2 0-5 1-7 2-1 1-2 3-4 4-2 1-4 1-6 1-2 0-4-2-5-3-2-2-3-4-3-7 0-2-1-4-2-6-1-1-3-2-5-2-2 0-4 1-5 2 2 1 3 3 5 5 1 2 2 4 4 6 1 2 1 5 3 6 1 1 3 2 5 2 2 0 4-1 6-2 1-1 3-2 5-2 2 0 4 1 6 2 1 1 3 2 5 2 2 0 4-1 6-2 2-1 3-2 5-2 2 0 4 1 6 2 2 1 4 2 6 2 1 1 3 1 5 0 2-1 4-2 5-3 2-1 3-3 4-5 1-2 2-4 2-7 0-2-1-4-2-6 0-2 1-4 2-6 1-2 2-4 3-6 1-1 3-2 5-2 1-1 2-2 3-3 2-1 3 0 5 0 2 0 4 1 6 2 1 1 3 2 5 2 1 0 3 0 4-1 1-1 2-3 3-4 1-2 2-4 3-6 1-1 3-2 5-2 2-1 4 0 6 1 1 1 2 3 3 5 1 1 2 1 3-1 2-2 3-4 4-6 1-2 2-4 3-6 1-2 2-4 2-6 1-2 1-4 2-6 1-2 2-3 4-4 2-1 4-1 6-1 2 0 4 1 6 2 2 1 3 3 5 4 1 2 1 4 1 6 0 2-1 4-2 6-1 2-2 3-4 4-6 1-1 2-2 3-3 2-1 4-1 6-1 2 1 4 2 6 3 1 1 2 2 2 4 1 1 1 3 2 4 1 2 1 3 0 5-1 2-1 3-3 4-5 0-2-1-5-2-7-1-2-3-4-5-5-2-1-4-2-6-2-2 0-4 1-6 2-1 1-3 2-5 3-2 1-4 1-6 1-2 0-4-1-6-2-2-1-3-2-5-3-1-1-3-2-5-2-2 0-4 1-6 2-2 1-4 2-6 2-2 0-4-1-6-2-1-1-3-2-5-3-1-1-3-2-5-2-2 0-4 1-6 2-2 1-4 2-6 2-2 0-4-1-6-2-1-1-3-2-5-2-2-1-4-2-6-2-2 0-4 1-6 2-2 1-4 2-6 2-2 0-4-1-6-2-1-1-3-2-5-2-2-1-4-2-6-2-2 0-4 1-6 2-2 1-4 2-6 2-2 0-4-1-6-2-1-1-3-2-5-2-2-1-4-2-6-2-2 0-4 1-6 2-2 1-4 2-6 2-2 0-4-1-6-2-1-1-3-2-5-2-2-1-4-2-6-2-2 0-4 1-6 2-2 1-4 2-6 2-2 0-4-1-6-2-1-1-3-2-5-2-2-1-4-2-6-2-2 0-4 1-6 2-2 1-4 2-6 2-2 0-4-1-6-2-1-1-3-2-5-2-2-1-4-2-6-2-2 0-4 1-6 2-2 1-4 2-6 2-2 0-4-1-6-2-1-1-3-2-5-3-1-2-3-3-5-3-1-1-3-2-5-2-2 0-4 1-6 2-2 1-4 2-6 2-2 0-4-1-6-2-1-1-3-2-5-2-2-1-4-2-6-2-2 0-4 1-6 2-2 1-4 2-6 2-2 0-4-1-6-2-1-1-3-2-5-2-2-1-4-2-6-2-2 0-4 1-6 2-2 1-4 2-6 2-2 0-4-1-6-2-1-1-3-2-5-2z";

export const WorldMap: React.FC<WorldMapProps> = ({ profiles, height = 400 }) => {
    const [hoveredProfile, setHoveredProfile] = useState<string | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const [isExpanded, setIsExpanded] = useState(false);
    
    // Zoom & Pan State
    const [scale, setScale] = useState(1);
    const [translate, setTranslate] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    const handleHover = (e: React.MouseEvent, profileId: string) => {
        // In expanded mode, we need to adjust for the container
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        
        // Calculate relative position inside the container
        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;

        setTooltipPos({ x, y });
        setHoveredProfile(profileId);
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        const delta = -e.deltaY * 0.001;
        const newScale = Math.min(Math.max(1, scale + delta), 8); // Max zoom 8x
        setScale(newScale);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        dragStart.current = { x: e.clientX - translate.x, y: e.clientY - translate.y };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        e.preventDefault();
        setTranslate({
            x: e.clientX - dragStart.current.x,
            y: e.clientY - dragStart.current.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    // Reset view when toggling expand
    useEffect(() => {
        setScale(1);
        setTranslate({ x: 0, y: 0 });
    }, [isExpanded]);

    const activeProfiles = profiles; // Can filter here if needed

    return (
        <motion.div 
            layout
            ref={containerRef}
            className={`relative bg-slate-50 border border-slate-200 overflow-hidden shadow-sm transition-all ${
                isExpanded ? 'fixed inset-4 z-50 rounded-2xl shadow-2xl border-indigo-200' : 'rounded-xl'
            }`} 
            style={{ height: isExpanded ? 'auto' : height }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {/* Controls */}
            <div className="absolute top-4 right-4 flex flex-col gap-2 z-20">
                <button 
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="p-2 bg-white rounded-lg shadow-md border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200"
                    title={isExpanded ? "Minimize" : "Maximize"}
                >
                    {isExpanded ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                    )}
                </button>
                <button 
                    onClick={() => setScale(Math.min(scale + 0.5, 8))}
                    className="p-2 bg-white rounded-lg shadow-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                    title="Zoom In"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                </button>
                <button 
                    onClick={() => setScale(Math.max(scale - 0.5, 1))}
                    className="p-2 bg-white rounded-lg shadow-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                    title="Zoom Out"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                </button>
                <button 
                    onClick={() => { setScale(1); setTranslate({x:0, y:0}); }}
                    className="p-2 bg-white rounded-lg shadow-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                    title="Reset View"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
            </div>

            {/* SVG Map Layer */}
            <motion.div 
                className="w-full h-full cursor-grab active:cursor-grabbing"
                style={{ 
                    x: translate.x, 
                    y: translate.y, 
                    scale: scale,
                    originX: 0.5, 
                    originY: 0.5 
                }}
            >
                <svg 
                    viewBox="0 0 800 400" 
                    preserveAspectRatio="xMidYMid slice" 
                    className="w-full h-full bg-indigo-50/30"
                >
                    {/* World Landmass */}
                    <path 
                        d={WORLD_PATH} 
                        fill="#cbd5e1" 
                        fillOpacity="0.4"
                        stroke="none"
                        transform="scale(2.8) translate(-20, -10)"
                    />

                    {/* Connections (Routes) */}
                    {activeProfiles.map(p => {
                        const source = getCoordinates(p.source);
                        const dest = getCoordinates(p.buyer);
                        
                        if (source.region === 'Unknown' || dest.region === 'Unknown') return null;

                        const x1 = source.x * 8;
                        const y1 = source.y * 4;
                        const x2 = dest.x * 8;
                        const y2 = dest.y * 4;

                        const isSelected = hoveredProfile === p.id;

                        return (
                            <g key={`route-${p.id}`} className="pointer-events-none">
                                <motion.path
                                    d={`M${x1},${y1} Q${(x1+x2)/2},${Math.min(y1,y2)-50} ${x2},${y2}`}
                                    fill="none"
                                    stroke={isSelected ? "#6366f1" : "#94a3b8"}
                                    strokeWidth={isSelected ? (2 / scale) : (1 / scale)} // Keep stroke width consistent
                                    strokeDasharray="4 4"
                                    opacity={isSelected ? 1 : 0.3}
                                    initial={{ pathLength: 0 }}
                                    animate={{ pathLength: 1 }}
                                    transition={{ duration: 1.5, delay: 0.2 }}
                                />
                            </g>
                        );
                    })}

                    {/* Markers */}
                    {activeProfiles.map(p => {
                        const source = getCoordinates(p.source);
                        const dest = getCoordinates(p.buyer);
                        const isSelected = hoveredProfile === p.id;

                        if (source.region === 'Unknown' && dest.region === 'Unknown') return null;

                        const renderMarker = (xPct: number, yPct: number, type: 'source' | 'dest') => (
                            <motion.circle
                                key={`${p.id}-${type}`}
                                cx={xPct * 8}
                                cy={yPct * 4}
                                r={(isSelected ? 6 : 3) / scale} // Keep size consistent
                                fill={type === 'source' ? '#3b82f6' : '#a855f7'}
                                stroke="white"
                                strokeWidth={1 / scale}
                                className="cursor-pointer hover:opacity-100"
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                whileHover={{ scale: 1.5 }}
                                onMouseEnter={(e: any) => handleHover(e, p.id)}
                                onMouseLeave={() => setHoveredProfile(null)}
                            />
                        );

                        return (
                            <g key={`markers-${p.id}`}>
                                {source.region !== 'Unknown' && renderMarker(source.x, source.y, 'source')}
                                {dest.region !== 'Unknown' && renderMarker(dest.x, dest.y, 'dest')}
                            </g>
                        );
                    })}
                </svg>
            </motion.div>

            {/* Tooltip Overlay */}
            <AnimatePresence>
                {hoveredProfile && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="absolute bg-white/95 backdrop-blur-md p-3 rounded-lg shadow-xl border border-slate-200 text-xs z-30 pointer-events-none"
                        style={{ left: tooltipPos.x + 10, top: tooltipPos.y + 10 }}
                    >
                        {(() => {
                            const p = profiles.find(pr => pr.id === hoveredProfile);
                            if (!p) return null;
                            return (
                                <div className="space-y-1 min-w-[150px]">
                                    <div className="font-bold text-slate-800">{p.strategyName}</div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                        <span className="text-slate-500 truncate">{p.source}</span>
                                        <span className="text-slate-300">→</span>
                                        <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                                        <span className="text-slate-500 truncate">{p.buyer}</span>
                                    </div>
                                    <div className="border-t border-slate-100 my-1 pt-1 flex justify-between gap-4">
                                        <span className="text-slate-400">Vol: {p.deliveredVolume?.toLocaleString()}</span>
                                        <span className={`font-bold ${p.finalTotalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            ${(p.finalTotalPnL/1000).toFixed(0)}k
                                        </span>
                                    </div>
                                </div>
                            );
                        })()}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-white/80 backdrop-blur p-2 rounded-lg border border-slate-100 text-[10px] flex gap-3 shadow-sm z-20 pointer-events-none">
                <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span className="text-slate-600 font-medium">Loading Port</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                    <span className="text-slate-600 font-medium">Delivery Port</span>
                </div>
                 <div className="flex items-center gap-1 text-slate-400">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
                    <span>Scroll to Zoom, Drag to Pan</span>
                </div>
            </div>
        </motion.div>
    );
};
