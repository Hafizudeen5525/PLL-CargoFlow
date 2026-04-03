
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { saveForwardCurve, getForwardCurve, getAvailableCurveDates, deleteForwardCurve, ForwardCurveRow, getHistoricalCurve, saveHistoricalCurve } from '../services/calculationService';
import { toast } from 'react-hot-toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ForwardCurveModalProps {
  onClose: () => void;
  onSave: () => void;
}

// Separate columns for different tabs
const HISTORICAL_COLUMNS = ['Month', 'BRIPE', 'JCC', 'Dated Brent', 'HH', 'HH Last Day', 'NBP', 'JKM', 'TTF', 'AECO', 'STN 2'];
const MANAGE_COLUMNS = ['Month', 'BRIPE', 'JCC', 'Dated Brent', 'HH', 'NBP', 'JKM', 'TTF', 'AECO', 'STN 2'];

interface Selection {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
}

export const ForwardCurveModal: React.FC<ForwardCurveModalProps> = ({ onClose, onSave }) => {
  const [activeTab, setActiveTab] = useState<'manage' | 'analyze' | 'evolution' | 'historical'>('manage');
  const [availableDates, setAvailableDates] = useState<string[]>(() => getAvailableCurveDates());
  const [curveDate, setCurveDate] = useState<string>(() => {
      const dates = getAvailableCurveDates();
      return dates.length > 0 ? dates[0] : new Date().toISOString().split('T')[0];
  });
  const [compareDateA, setCompareDateA] = useState<string>(() => {
      const dates = getAvailableCurveDates();
      return dates.length >= 1 ? dates[0] : '';
  });
  const [compareDateB, setCompareDateB] = useState<string>(() => {
      const dates = getAvailableCurveDates();
      return dates.length >= 2 ? dates[1] : '';
  });
  const [selectedAnalysisIndex, setSelectedAnalysisIndex] = useState('TTF');

  // Evolution State
  const [evolutionIndex, setEvolutionIndex] = useState('TTF');
  const [evolutionContract, setEvolutionContract] = useState<string>('');

  // Grid State
  const [manageGrid, setManageGrid] = useState<ForwardCurveRow[]>(() => {
      const dates = getAvailableCurveDates();
      const today = new Date().toISOString().split('T')[0];
      const latest = dates.length > 0 ? dates[0] : today;
      const data = getForwardCurve(latest);
      if (data.length === 0) {
          const skeleton: ForwardCurveRow[] = [];
          const start = new Date(latest);
          for (let i = 0; i < 12; i++) {
              const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
              const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              skeleton.push({ month: mKey, prices: {} });
          }
          return skeleton;
      }
      return data;
  });
  const [historicalGrid, setHistoricalGrid] = useState<ForwardCurveRow[]>(() => getHistoricalCurve());
  const [historyPast, setHistoryPast] = useState<ForwardCurveRow[][]>([]);
  const [historyFuture, setHistoryFuture] = useState<ForwardCurveRow[][]>([]);
  
  // Interaction State
  const [selection, setSelection] = useState<Selection | null>(null);
  const [editingCell, setEditingCell] = useState<{ r: number; c: number } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [isSelecting, setIsSelecting] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);

  const refreshDates = useCallback(() => {
      setAvailableDates(getAvailableCurveDates());
  }, []);

  // Current active columns based on tab
  const activeColumns = useMemo(() => {
    return activeTab === 'historical' ? HISTORICAL_COLUMNS : MANAGE_COLUMNS;
  }, [activeTab]);

  const activeIndices = useMemo(() => activeColumns.slice(1), [activeColumns]);

  const loadCurveData = useCallback((date: string) => {
      const data = getForwardCurve(date);
      let targetGrid: ForwardCurveRow[];
      if (data.length === 0) {
          const skeleton: ForwardCurveRow[] = [];
          const start = new Date(date);
          for (let i = 0; i < 12; i++) {
              const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
              const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              skeleton.push({ month: mKey, prices: {} });
          }
          targetGrid = skeleton;
      } else {
          targetGrid = data;
      }
      setManageGrid(targetGrid);
      setCurveDate(date);
      setSelection(null);
      setEditingCell(null);
      setHistoryPast([]);
      setHistoryFuture([]);
  }, []);

  const currentGrid = activeTab === 'manage' ? manageGrid : historicalGrid;
  
  const updateGridWithHistory = useCallback((next: ForwardCurveRow[]) => {
      setHistoryPast(prev => [...prev, JSON.parse(JSON.stringify(currentGrid))].slice(-50));
      setHistoryFuture([]);
      if (activeTab === 'manage') setManageGrid(next);
      else setHistoricalGrid(next);
  }, [currentGrid, activeTab]);

  const undo = useCallback(() => {
      if (historyPast.length === 0) return;
      const prev = historyPast[historyPast.length - 1];
      setHistoryFuture(f => [...f, JSON.parse(JSON.stringify(currentGrid))]);
      setHistoryPast(p => p.slice(0, -1));
      if (activeTab === 'manage') setManageGrid(prev);
      else setHistoricalGrid(prev);
      toast.success('Undo', { duration: 1000 });
  }, [historyPast, currentGrid, activeTab]);

  const redo = useCallback(() => {
      if (historyFuture.length === 0) return;
      const next = historyFuture[historyFuture.length - 1];
      setHistoryPast(p => [...p, JSON.parse(JSON.stringify(currentGrid))]);
      setHistoryFuture(f => f.slice(0, -1));
      if (activeTab === 'manage') setManageGrid(next);
      else setHistoricalGrid(next);
      toast.success('Redo', { duration: 1000 });
  }, [historyFuture, currentGrid, activeTab]);

  const parseCurveDate = (raw: string): string => {
    const str = raw.trim();
    if (!str) return '';
    const months: Record<string, string> = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    const mmmYy = str.match(/^([a-zA-Z]+)[\s\-']+(\d{2,4})$/);
    if (mmmYy) {
        const mStr = mmmYy[1].toLowerCase().slice(0, 3);
        const m = months[mStr];
        if (m) {
            let y = parseInt(mmmYy[2]);
            if (y < 100) y += 2000;
            return `${y}-${m}`;
        }
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return '';
  };

  const handleSave = () => {
    if (activeTab === 'manage') {
        // Automatically sync HH Last Day to HH for the forward curve before saving
        const syncedGrid = manageGrid.map(row => {
            const nextPrices = { ...row.prices };
            if (nextPrices['HH'] !== undefined) {
                nextPrices['HH Last Day'] = nextPrices['HH'];
            }
            return { ...row, prices: nextPrices };
        });
        saveForwardCurve(curveDate, syncedGrid.filter(r => r.month));
        toast.success(`Curve saved for ${curveDate} (HH Last Day synced to HH)`);
    } else {
        saveHistoricalCurve(historicalGrid.filter(r => r.month));
        toast.success(`Historical prices updated`);
    }
    refreshDates();
    onSave();
  };

  const handleDeleteSnapshot = (e: React.MouseEvent, date: string) => {
      e.stopPropagation();
      if (confirm(`Delete curve snapshot for ${date}?`)) {
          deleteForwardCurve(date);
          refreshDates();
          if (curveDate === date) loadCurveData(new Date().toISOString().split('T')[0]);
          toast.success(`Snapshot deleted`);
      }
  };

  // --- Grid Interaction Core ---

  const handleCellMouseDown = (r: number, c: number) => {
      setIsSelecting(true);
      setSelection({ startRow: r, startCol: c, endRow: r, endCol: c });
      setEditingCell(null);
      containerRef.current?.focus();
  };

  const handleCellMouseEnter = (r: number, c: number) => {
      if (isSelecting && selection) {
          setSelection({ ...selection, endRow: r, endCol: c });
      }
  };

  const handleCellDoubleClick = useCallback((r: number, c: number) => {
      setEditingCell({ r, c });
      const val = c === 0 ? currentGrid[r]?.month : currentGrid[r]?.prices[activeColumns[c]];
      setEditValue(String(val ?? ''));
  }, [currentGrid, activeColumns]);

  const finishEditing = useCallback(() => {
      if (!editingCell) return;
      const { r, c } = editingCell;
      const next = JSON.parse(JSON.stringify(currentGrid));
      if (c === 0) {
          next[r].month = editValue;
      } else {
          const num = parseFloat(editValue.replace(/[^0-9.-]/g, ''));
          next[r].prices[activeColumns[c]] = isNaN(num) ? 0 : num;
      }
      updateGridWithHistory(next);
      setEditingCell(null);
  }, [editingCell, currentGrid, editValue, activeColumns, updateGridWithHistory]);

  const isSelected = (r: number, c: number) => {
      if (!selection) return false;
      const rMin = Math.min(selection.startRow, selection.endRow);
      const rMax = Math.max(selection.startRow, selection.endRow);
      const cMin = Math.min(selection.startCol, selection.endCol);
      const cMax = Math.max(selection.startCol, selection.endCol);
      return r >= rMin && r <= rMax && c >= cMin && c <= cMax;
  };

  // Statistics for Status Bar
  const selectionStats = useMemo(() => {
      if (!selection) return null;
      const rMin = Math.min(selection.startRow, selection.endRow);
      const rMax = Math.max(selection.startRow, selection.endRow);
      const cMin = Math.min(selection.startCol, selection.endCol);
      const cMax = Math.max(selection.startCol, selection.endCol);
      
      let sum = 0, count = 0, numericCount = 0;
      for (let r = rMin; r <= rMax; r++) {
          for (let c = cMin; c <= cMax; c++) {
              count++;
              const val = c === 0 ? null : currentGrid[r]?.prices[activeColumns[c]];
              if (val !== null && val !== undefined && typeof val === 'number') {
                  sum += val;
                  numericCount++;
              }
          }
      }
      return { sum, count, numericCount, avg: numericCount > 0 ? sum / numericCount : 0 };
  }, [selection, currentGrid, activeColumns]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;

      if (editingCell) {
          if (e.key === 'Enter') {
              finishEditing();
              const nextR = Math.min(currentGrid.length - 1, editingCell.r + 1);
              setSelection({ startRow: nextR, startCol: editingCell.c, endRow: nextR, endCol: editingCell.c });
              containerRef.current?.focus();
          }
          if (e.key === 'Escape') setEditingCell(null);
          return;
      }

      // Undo/Redo
      if (isMod && e.key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (isMod && e.key === 'y') { e.preventDefault(); redo(); return; }

      // Range Management
      if (e.key === 'Delete' || e.key === 'Backspace') {
          if (!selection) return;
          const next = JSON.parse(JSON.stringify(currentGrid));
          const rMin = Math.min(selection.startRow, selection.endRow);
          const rMax = Math.max(selection.startRow, selection.endRow);
          const cMin = Math.min(selection.startCol, selection.endCol);
          const cMax = Math.max(selection.startCol, selection.endCol);
          for (let r = rMin; r <= rMax; r++) {
              for (let c = cMin; c <= cMax; c++) {
                  if (c === 0) next[r].month = '';
                  else delete next[r].prices[activeColumns[c]];
              }
          }
          updateGridWithHistory(next);
          e.preventDefault();
      }

      // Fill Down (Ctrl+D)
      if (isMod && e.key === 'd') {
          if (!selection) return;
          e.preventDefault();
          const rMin = Math.min(selection.startRow, selection.endRow);
          const rMax = Math.max(selection.startRow, selection.endRow);
          const cMin = Math.min(selection.startCol, selection.endCol);
          const cMax = Math.max(selection.startCol, selection.endCol);
          if (rMin === rMax) return;
          const next = JSON.parse(JSON.stringify(currentGrid));
          for (let c = cMin; c <= cMax; c++) {
              const baseVal = c === 0 ? next[rMin].month : next[rMin].prices[activeColumns[c]];
              for (let r = rMin + 1; r <= rMax; r++) {
                  if (c === 0) next[r].month = baseVal;
                  else if (baseVal !== undefined) next[r].prices[activeColumns[c]] = baseVal;
                  else delete next[r].prices[activeColumns[c]];
              }
          }
          updateGridWithHistory(next);
          toast.success('Filled Down');
      }

      // Fill Right (Ctrl+R)
      if (isMod && e.key === 'r') {
          if (!selection) return;
          e.preventDefault();
          const rMin = Math.min(selection.startRow, selection.endRow);
          const rMax = Math.max(selection.startRow, selection.endRow);
          const cMin = Math.min(selection.startCol, selection.endCol);
          const cMax = Math.max(selection.startCol, selection.endCol);
          if (cMin === cMax) return;
          const next = JSON.parse(JSON.stringify(currentGrid));
          for (let r = rMin; r <= rMax; r++) {
              const baseVal = cMin === 0 ? next[r].month : next[r].prices[activeColumns[cMin]];
              for (let c = cMin + 1; c <= cMax; c++) {
                  if (c === 0) next[r].month = String(baseVal);
                  else if (baseVal !== undefined) next[r].prices[activeColumns[c]] = Number(baseVal);
              }
          }
          updateGridWithHistory(next);
          toast.success('Filled Right');
      }

      // Copy
      if (isMod && e.key === 'c') {
          if (!selection) return;
          const rMin = Math.min(selection.startRow, selection.endRow);
          const rMax = Math.max(selection.startRow, selection.endRow);
          const cMin = Math.min(selection.startCol, selection.endCol);
          const cMax = Math.max(selection.startCol, selection.endCol);
          let tsv = '';
          for (let r = rMin; r <= rMax; r++) {
              const line = [];
              for (let c = cMin; c <= cMax; c++) {
                  const val = c === 0 ? currentGrid[r]?.month : currentGrid[r]?.prices[activeColumns[c]];
                  line.push(val ?? '');
              }
              tsv += line.join('\t') + '\n';
          }
          navigator.clipboard.writeText(tsv);
          toast.success('Copied selection');
          e.preventDefault();
      }

      // Navigation
      if (selection) {
          const { endRow, endCol } = selection;
          let nr = endRow, nc = endCol;
          if (e.key === 'ArrowUp') nr = Math.max(0, endRow - 1);
          if (e.key === 'ArrowDown') nr = Math.min(currentGrid.length - 1, endRow + 1);
          if (e.key === 'ArrowLeft') nc = Math.max(0, endCol - 1);
          if (e.key === 'ArrowRight') nc = Math.min(activeColumns.length - 1, endCol + 1);
          if (nr !== endRow || nc !== endCol) {
              setSelection(e.shiftKey ? { ...selection, endRow: nr, endCol: nc } : { startRow: nr, startCol: nc, endRow: nr, endCol: nc });
              e.preventDefault();
          }
          if (e.key === 'Enter') { handleCellDoubleClick(endRow, endCol); e.preventDefault(); }
          if (e.key === 'Tab') {
              e.preventDefault();
              const nextC = e.shiftKey ? Math.max(0, endCol - 1) : Math.min(activeColumns.length - 1, endCol + 1);
              setSelection({ startRow: endRow, startCol: nextC, endRow: endRow, endCol: nextC });
          }
      }
  }, [selection, editingCell, currentGrid, activeColumns, undo, redo, finishEditing, handleCellDoubleClick, updateGridWithHistory]);

  const handlePaste = (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData('Text');
      if (!text) return;
      const isTableData = text.includes('\t') || text.includes('\n');
      if (editingCell && !isTableData) return;

      let startR = 0, startC = 0;
      if (selection) {
          startR = Math.min(selection.startRow, selection.endRow);
          startC = Math.min(selection.startCol, selection.endCol);
      } else if (editingCell) {
          startR = editingCell.r; startC = editingCell.c;
      } else return;

      e.preventDefault();
      const lines = text.split(/\r?\n/).filter(l => l.trim() !== '' || l.includes('\t'));
      if (lines.length === 0) return;

      const next = JSON.parse(JSON.stringify(currentGrid));

      // Smart Excel Paste: If one value copied and multiple selected, fill selection
      if (lines.length === 1 && !lines[0].includes('\t') && selection && (selection.startRow !== selection.endRow || selection.startCol !== selection.endCol)) {
          const fillVal = lines[0].trim();
          const rMin = Math.min(selection.startRow, selection.endRow);
          const rMax = Math.max(selection.startRow, selection.endRow);
          const cMin = Math.min(selection.startCol, selection.endCol);
          const cMax = Math.max(selection.startCol, selection.endCol);
          for (let r = rMin; r <= rMax; r++) {
              for (let c = cMin; c <= cMax; c++) {
                  if (c === 0) { const m = parseCurveDate(fillVal); next[r].month = m || fillVal; }
                  else { const num = parseFloat(fillVal.replace(/[^0-9.-]/g, '')); if (!isNaN(num)) next[r].prices[activeColumns[c]] = num; }
              }
          }
      } else {
          lines.forEach((line, lineIdx) => {
              const r = startR + lineIdx;
              if (r >= next.length) next.push({ month: '', prices: {} });
              const cells = line.split('\t');
              cells.forEach((cell, cellIdx) => {
                  const c = startC + cellIdx;
                  if (c >= activeColumns.length) return;
                  const val = cell.trim();
                  if (c === 0) { const m = parseCurveDate(val); next[r].month = m || val; }
                  else {
                      const num = parseFloat(val.replace(/[^0-9.-]/g, ''));
                      if (!isNaN(num)) next[r].prices[activeColumns[c]] = num;
                      else if (val === '') delete next[r].prices[activeColumns[c]];
                  }
              });
          });
      }
      
      updateGridWithHistory(next);
      setEditingCell(null);
      toast.success(`Imported data`);
  };

  const analysisChartData = useMemo(() => {
      const curveA = getForwardCurve(compareDateA);
      const curveB = getForwardCurve(compareDateB);
      const allMonths = Array.from(new Set([...curveA.map(r => r.month), ...curveB.map(r => r.month)])).sort();
      return allMonths.map(month => ({
          month,
          [`A (${compareDateA})`]: curveA.find(r => r.month === month)?.prices[selectedAnalysisIndex] || null,
          [`B (${compareDateB})`]: curveB.find(r => r.month === month)?.prices[selectedAnalysisIndex] || null,
      }));
  }, [compareDateA, compareDateB, selectedAnalysisIndex]);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" onMouseUp={() => setIsSelecting(false)}>
      <div 
        ref={containerRef}
        className="bg-white rounded-xl shadow-2xl w-full max-w-7xl h-[92vh] flex flex-col overflow-hidden outline-none ring-1 ring-slate-200"
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        tabIndex={0}
      >
        <div className="shrink-0 border-b border-slate-200 bg-white">
            <div className="flex justify-between items-center p-5 pb-3">
                <h2 className="text-lg font-extrabold text-slate-800 tracking-tight">Forward Curve Manager</h2>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                        <button onClick={undo} disabled={historyPast.length === 0} className="p-2 text-slate-400 hover:text-blue-600 disabled:opacity-30"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></button>
                        <button onClick={redo} disabled={historyFuture.length === 0} className="p-2 text-slate-400 hover:text-blue-600 disabled:opacity-30"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" /></svg></button>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            </div>
            <div className="flex px-6 gap-8">
                {['manage', 'historical', 'analyze', 'evolution'].map((tab) => (
                    <button 
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`pb-3 px-1 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        {tab === 'manage' ? 'Forward Curves' : tab === 'historical' ? 'Historical Data' : tab === 'analyze' ? 'Curve Comparison' : 'Contract Evolution'}
                    </button>
                ))}
            </div>
        </div>

        <div className="flex-1 overflow-hidden bg-slate-50 flex">
            {activeTab === 'manage' && (
                <div className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saved Snapshots</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                        {availableDates.map(date => (
                            <div 
                                key={date} 
                                onClick={() => loadCurveData(date)}
                                className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${curveDate === date ? 'bg-blue-50 text-blue-700 font-bold border border-blue-100' : 'hover:bg-slate-50 text-slate-600'}`}
                            >
                                <span className="text-xs">{date}</span>
                                <button onClick={(e) => handleDeleteSnapshot(e, date)} className="p-1 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                            </div>
                        ))}
                    </div>
                    <div className="p-4 border-t border-slate-100">
                        <button onClick={() => loadCurveData(new Date().toISOString().split('T')[0])} className="w-full py-2 bg-slate-800 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider hover:bg-slate-900 shadow-sm">+ New Snapshot</button>
                    </div>
                </div>
            )}

            {(activeTab === 'manage' || activeTab === 'historical') && (
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between shadow-sm z-10">
                        <div className="flex items-center gap-6">
                            {activeTab === 'manage' && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black text-slate-400 uppercase">Curve As Of:</span>
                                    <input type="date" value={curveDate} onChange={(e) => setCurveDate(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold text-blue-600 outline-none hover:border-blue-300 focus:ring-2 focus:ring-blue-500/20" />
                                </div>
                            )}
                            <div className="hidden lg:flex items-center gap-4 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[9px] font-bold text-slate-500 uppercase">
                                <span>Ctrl+Z: Undo</span>
                                <span>Ctrl+D: Fill Down</span>
                                <span>Ctrl+R: Fill Right</span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                             <button onClick={() => updateGridWithHistory([...currentGrid, { month: '', prices: {} }])} className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all">Add Row</button>
                             <button onClick={handleSave} className="px-6 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg shadow-lg hover:bg-blue-700 transition-all">Save Grid</button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto custom-scrollbar p-6 bg-slate-100/30">
                        <div className="bg-white border border-slate-300 rounded shadow-md min-w-max flex flex-col select-none relative">
                            <div className="flex sticky top-0 bg-slate-200 border-b-2 border-slate-300 divide-x divide-slate-300 z-20">
                                {activeColumns.map((col, idx) => (
                                    <div key={col} className={`px-4 py-2 text-[9px] font-black text-slate-600 uppercase tracking-tighter text-center ${idx === 0 ? 'w-32' : 'w-24'}`}>
                                        {col}
                                    </div>
                                ))}
                            </div>

                            <div className="divide-y divide-slate-200">
                                {currentGrid.map((row, rIdx) => (
                                    <div key={rIdx} className="flex divide-x divide-slate-200">
                                        {activeColumns.map((col, cIdx) => {
                                            const isMonthCol = cIdx === 0;
                                            const active = editingCell?.r === rIdx && editingCell?.c === cIdx;
                                            const val = isMonthCol ? row.month : row.prices[activeColumns[cIdx]];
                                            const selected = isSelected(rIdx, cIdx);

                                            return (
                                                <div 
                                                    key={col} 
                                                    onMouseDown={() => handleCellMouseDown(rIdx, cIdx)}
                                                    onMouseEnter={() => handleCellMouseEnter(rIdx, cIdx)}
                                                    onDoubleClick={() => handleCellDoubleClick(rIdx, cIdx)}
                                                    className={`relative h-9 flex items-center transition-all ${isMonthCol ? 'w-32 bg-slate-50/80' : 'w-24'} ${selected ? 'bg-blue-50 ring-1 ring-blue-400 z-10' : ''}`}
                                                >
                                                    {active ? (
                                                        <input 
                                                            autoFocus
                                                            type="text"
                                                            value={editValue}
                                                            onChange={(e) => setEditValue(e.target.value)}
                                                            onBlur={finishEditing}
                                                            className="absolute inset-0 w-full h-full px-3 text-xs font-mono font-bold bg-white outline-none ring-2 ring-blue-500 z-30 shadow-lg"
                                                        />
                                                    ) : (
                                                        <div className={`px-3 text-xs font-mono truncate w-full ${isMonthCol ? 'font-bold text-slate-700' : 'text-right text-slate-600'}`}>
                                                            {isMonthCol ? (val || '-') : (val !== undefined ? Number(val).toFixed(4) : '')}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    
                    {/* Status Bar */}
                    <div className="h-8 bg-slate-800 text-white flex items-center px-4 justify-between shrink-0">
                        <div className="flex gap-4 items-center">
                             <span className="text-[10px] font-bold text-slate-400 uppercase">Internal History: {historyPast.length} Past | {historyFuture.length} Future</span>
                        </div>
                        {selectionStats && selectionStats.numericCount > 0 && (
                            <div className="flex gap-6 text-[10px] font-mono">
                                <div className="flex gap-1.5"><span className="text-slate-400">AVERAGE:</span> <span className="font-bold">{selectionStats.avg.toFixed(4)}</span></div>
                                <div className="flex gap-1.5"><span className="text-slate-400">COUNT:</span> <span className="font-bold">{selectionStats.numericCount}</span></div>
                                <div className="flex gap-1.5"><span className="text-slate-400">SUM:</span> <span className="font-bold">{selectionStats.sum.toFixed(4)}</span></div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'analyze' && (
                <div className="flex-1 flex flex-col p-8 space-y-6 overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase">Benchmark</label>
                            <select value={selectedAnalysisIndex} onChange={(e) => setSelectedAnalysisIndex(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700">{activeIndices.map(idx => <option key={idx} value={idx}>{idx}</option>)}</select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase">Baseline Curve</label>
                            <select value={compareDateA} onChange={(e) => setCompareDateA(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm">{availableDates.map(d => <option key={d} value={d}>{d}</option>)}</select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase">Comparison Curve</label>
                            <select value={compareDateB} onChange={(e) => setCompareDateB(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm">{availableDates.map(d => <option key={d} value={d}>{d}</option>)}</select>
                        </div>
                    </div>
                    <div className="flex-1 min-h-[450px] bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={analysisChartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="month" tick={{fontSize: 10, fontWeight: 700}} axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                                <Legend verticalAlign="top" align="right" />
                                <Line type="monotone" dataKey={`A (${compareDateA})`} stroke="#3b82f6" strokeWidth={4} dot={false} animationDuration={600} />
                                <Line type="monotone" dataKey={`B (${compareDateB})`} stroke="#ef4444" strokeWidth={4} dot={false} strokeDasharray="6 6" animationDuration={600} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {activeTab === 'evolution' && (
                <div className="flex-1 flex flex-col p-8 space-y-6 overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase">Index</label>
                            <select value={evolutionIndex} onChange={(e) => setEvolutionIndex(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700">{activeIndices.map(idx => <option key={idx} value={idx}>{idx}</option>)}</select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase">Contract Month</label>
                            <select value={evolutionContract} onChange={(e) => setEvolutionContract(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm">
                                <option value="">Select Target Month...</option>
                                {Array.from(new Set(availableDates.flatMap(d => getForwardCurve(d).map(r => r.month)))).sort().map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="flex-1 min-h-[450px] bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-center">
                        {evolutionContract ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={availableDates.sort().map(d => ({ date: d, price: getForwardCurve(d).find(r => r.month === evolutionContract)?.prices[evolutionIndex] || null }))}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="date" tick={{fontSize: 10, fontWeight: 700}} axisLine={false} tickLine={false} />
                                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="price" stroke="#8b5cf6" strokeWidth={4} dot={{ r: 4, fill: '#8b5cf6', strokeWidth: 2, stroke: '#fff' }} />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : <span className="text-slate-400 text-sm font-bold italic">Select a contract month to visualize its price history over time</span>}
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
