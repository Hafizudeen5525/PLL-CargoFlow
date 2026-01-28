
import React, { useState, useMemo } from 'react';
import { CargoProfile, PnLBucket } from '../types';
import { motion } from 'framer-motion';
import { getFixationDate } from '../services/calculationService';

interface CalendarViewProps {
    profiles: CargoProfile[];
    onCargoClick?: (profile: CargoProfile) => void;
}

const INDEX_COLORS: Record<string, string> = {
    'Brent': 'bg-rose-500',
    'JCC': 'bg-orange-500',
    'HH': 'bg-amber-500',
    'TTF': 'bg-blue-500',
    'NBP': 'bg-indigo-500',
    'JKM': 'bg-emerald-500',
    'Oil': 'bg-rose-500',
    'Other': 'bg-slate-500'
};

export const CalendarView: React.FC<CalendarViewProps> = ({ profiles, onCargoClick }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const year = currentDate.getUTCFullYear();
    const month = currentDate.getUTCMonth();

    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();

    const prevMonth = () => setCurrentDate(new Date(Date.UTC(year, month - 1, 1)));
    const nextMonth = () => setCurrentDate(new Date(Date.UTC(year, month + 1, 1)));

    const monthName = currentDate.toLocaleString('default', { month: 'long', timeZone: 'UTC' });

    // Calculate all index expiries that PHYSICALLY land in this calendar view
    const indexExpiries = useMemo(() => {
        const expiries: Record<string, { label: string, index: string }[]> = {};
        const indices = ['Dated Brent', 'JCC', 'BRIPE', 'HH', 'TTF', 'NBP', 'JKM', 'AECO'];
        
        // We check fixation dates for M-1, M, and M+1 pricing periods 
        // because their fixation dates might shift into the current calendar month.
        const pricingMonthsToCheck = [
            new Date(Date.UTC(year, month - 1, 1)),
            new Date(Date.UTC(year, month, 1)),
            new Date(Date.UTC(year, month + 1, 1)),
            new Date(Date.UTC(year, month + 2, 1))
        ];

        pricingMonthsToCheck.forEach(pDate => {
            const mKey = `${pDate.getUTCFullYear()}-${String(pDate.getUTCMonth() + 1).padStart(2, '0')}`;
            const mNameShort = pDate.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
            
            indices.forEach(idx => {
                const fixD = getFixationDate(idx, mKey);
                // If this pricing period's fixation lands in the month we are looking at:
                if (fixD.getUTCFullYear() === year && fixD.getUTCMonth() === month) {
                    const dateStr = fixD.toISOString().split('T')[0];
                    if (!expiries[dateStr]) expiries[dateStr] = [];
                    
                    const shortName = idx.includes('Brent') ? 'BRENT' : idx.split(' ')[0];
                    expiries[dateStr].push({
                        label: `${shortName} ${mNameShort} EXP`,
                        index: shortName
                    });
                }
            });
        });
        return expiries;
    }, [year, month]);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
                <div className="flex flex-col">
                    <h2 className="text-lg font-bold text-slate-800 leading-tight">{monthName} {year}</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Logistics & Market Settlement Schedule</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <button onClick={() => setCurrentDate(new Date())} className="px-4 py-1 text-xs font-black uppercase hover:bg-white border border-slate-200 rounded-lg text-slate-600 shadow-sm transition-all">
                        Today
                    </button>
                    <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-7 gap-2 text-center h-full min-h-[600px]">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                        <div key={d} className="text-[10px] font-black text-slate-400 uppercase pb-2 tracking-widest">{d}</div>
                    ))}

                    {Array.from({ length: firstDay }).map((_, i) => (
                        <div key={`empty-${i}`} className="bg-slate-50/30 rounded-lg border border-dashed border-slate-100" />
                    ))}

                    {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const isToday = new Date().toISOString().split('T')[0] === dateStr;
                        
                        const dayEvents = profiles.flatMap(p => {
                            const evts = [];
                            if (p.loadingDate === dateStr) evts.push({ ...p, _evtType: 'load' });
                            if (p.deliveryDate === dateStr) evts.push({ ...p, _evtType: 'del' });
                            return evts;
                        });

                        const dayExpiries = indexExpiries[dateStr] || [];

                        return (
                            <div key={day} className={`border rounded-xl p-2 flex flex-col gap-2 min-h-[140px] transition-all relative group ${isToday ? 'border-indigo-300 ring-4 ring-indigo-50 bg-indigo-50/10' : 'border-slate-100 hover:border-slate-200 hover:shadow-sm'}`}>
                                <div className="flex justify-between items-start">
                                    <div className={`text-[11px] font-bold w-6 h-6 flex items-center justify-center rounded-lg transition-colors ${isToday ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'}`}>
                                        {day}
                                    </div>
                                    
                                    {/* Index Expiries */}
                                    <div className="flex flex-col items-end gap-1 max-w-[70%]">
                                        {dayExpiries.map((exp, idx) => (
                                            <div 
                                                key={idx} 
                                                className={`text-[7px] px-1.5 py-0.5 rounded text-white font-black uppercase tracking-tighter shadow-sm leading-none text-right ${INDEX_COLORS[exp.index] || 'bg-slate-500'}`}
                                                title={`${exp.label} Date`}
                                            >
                                                {exp.label}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                                    {dayEvents.map((e, idx) => (
                                        <motion.div 
                                            key={`${e.id}-${idx}`}
                                            initial={{ opacity: 0, x: -5 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onCargoClick?.(e);
                                            }}
                                            className={`text-[9px] px-2 py-1 rounded-lg truncate border-l-4 cursor-pointer transition-all hover:scale-[1.02] active:scale-95 shadow-sm font-bold flex items-center gap-1.5 ${
                                                e._evtType === 'load' 
                                                ? 'bg-blue-50 border-blue-500 text-blue-800' 
                                                : 'bg-indigo-50 border-indigo-500 text-indigo-800'
                                            }`}
                                        >
                                            <span className="opacity-50 shrink-0">{e._evtType === 'load' ? 'L' : 'D'}</span>
                                            <span className="truncate">{e.strategyName}</span>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-wrap gap-4 items-center">
                 <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    <span>SETTLEMENT LEGEND:</span>
                    <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-500"></span> HH Expiry</div>
                    <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500"></span> JKM Expiry</div>
                    <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-500"></span> Oil Expiry</div>
                    <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-500"></span> TTF Expiry</div>
                </div>
            </div>
        </div>
    );
};
