
import React, { useState } from 'react';
import { CargoProfile, PnLBucket } from '../types';
import { motion } from 'framer-motion';

interface CalendarViewProps {
    profiles: CargoProfile[];
}

export const CalendarView: React.FC<CalendarViewProps> = ({ profiles }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Sun

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

    // Get events for this month
    const getEventsForDay = (day: number) => {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return profiles.filter(p => p.deliveryDate === dateStr || p.loadingDate === dateStr);
    };

    const monthName = currentDate.toLocaleString('default', { month: 'long' });

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-lg font-bold text-slate-800">{monthName} {year}</h2>
                <div className="flex gap-2">
                    <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-sm font-medium hover:bg-slate-100 rounded-lg text-slate-600">
                        Today
                    </button>
                    <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 p-4">
                <div className="grid grid-cols-7 gap-2 h-full text-center">
                    {/* Weekdays */}
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                        <div key={d} className="text-xs font-bold text-slate-400 uppercase pb-2">{d}</div>
                    ))}

                    {/* Empty slots */}
                    {Array.from({ length: firstDay }).map((_, i) => (
                        <div key={`empty-${i}`} className="bg-slate-50/50 rounded-lg" />
                    ))}

                    {/* Days */}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const isToday = new Date().toISOString().split('T')[0] === dateStr;
                        
                        // Find events
                        const events = profiles.flatMap(p => {
                            const evts = [];
                            if (p.loadingDate === dateStr) evts.push({ type: 'load', ...p });
                            if (p.deliveryDate === dateStr) evts.push({ type: 'del', ...p });
                            return evts;
                        });

                        return (
                            <div key={day} className={`border rounded-lg p-2 flex flex-col gap-1 min-h-[80px] ${isToday ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-100'}`}>
                                <div className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>
                                    {day}
                                </div>
                                <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
                                    {events.map((e, idx) => (
                                        <div 
                                            key={`${e.id}-${idx}`}
                                            className={`text-[9px] px-1.5 py-1 rounded truncate border-l-2 ${
                                                e.type === 'load' 
                                                ? 'bg-blue-50 border-blue-500 text-blue-700' 
                                                : 'bg-purple-50 border-purple-500 text-purple-700'
                                            }`}
                                            title={`${e.type === 'load' ? 'Load' : 'Del'}: ${e.strategyName} (${e.type === 'load' ? e.source : e.buyer})`}
                                        >
                                            {e.type === 'load' ? 'L: ' : 'D: '}
                                            {e.type === 'load' ? e.source : e.buyer}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
