
import React, { useState, useEffect, useMemo } from 'react';
import { saveForwardCurve, getForwardCurve, getAvailableCurveDates, deleteForwardCurve, ForwardCurveRow, getHistoricalCurve, saveHistoricalCurve } from '../services/calculationService';
import { toast } from 'react-hot-toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ForwardCurveModalProps {
  onClose: () => void;
  onSave: () => void;
}

// The exact column order requested
const COLUMNS = ['Month', 'BRIPE', 'JCC', 'Dated Brent', 'HH', 'NBP', 'JKM', 'TTF', 'AECO', 'STN 2'];
const INDICES = COLUMNS.slice(1);

export const ForwardCurveModal: React.FC<ForwardCurveModalProps> = ({ onClose, onSave }) => {
  const [activeTab, setActiveTab] = useState<'manage' | 'analyze' | 'evolution' | 'historical'>('manage');
  
  // Manage Tab State
  const [curveDate, setCurveDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [inputText, setInputText] = useState('');
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [parsedData, setParsedData] = useState<ForwardCurveRow[]>([]);
  const [previewMode, setPreviewMode] = useState(false);

  // Historical Tab State
  const [historicalInput, setHistoricalInput] = useState('');
  const [historicalParsed, setHistoricalParsed] = useState<ForwardCurveRow[]>([]);
  const [historicalPreview, setHistoricalPreview] = useState(false);

  // Analyze Tab State
  const [compareDateA, setCompareDateA] = useState<string>('');
  const [compareDateB, setCompareDateB] = useState<string>('');
  const [selectedAnalysisIndex, setSelectedAnalysisIndex] = useState('TTF');

  // Evolution Tab State
  const [evolutionIndex, setEvolutionIndex] = useState('TTF');
  const [evolutionContract, setEvolutionContract] = useState<string>('');

  useEffect(() => {
    refreshDates();
    loadCurveForDate(new Date().toISOString().split('T')[0]);
    loadHistorical();
  }, []);

  const refreshDates = () => {
    const dates = getAvailableCurveDates();
    setAvailableDates(dates);
    if (dates.length >= 1) setCompareDateA(dates[0]);
    if (dates.length >= 2) setCompareDateB(dates[1]);
    else setCompareDateB(dates[0]);
  };

  const loadCurveForDate = (date: string) => {
      const data = getForwardCurve(date);
      if (data && data.length > 0) {
          const tsv = data.map(row => {
              const vals = INDICES.map(idx => row.prices[idx] !== undefined ? row.prices[idx] : '');
              return `${row.month}\t${vals.join('\t')}`;
          }).join('\n');
          setInputText(tsv);
          setParsedData(data);
          setPreviewMode(true);
      } else {
          setInputText('');
          setParsedData([]);
          setPreviewMode(false);
      }
      setCurveDate(date);
  };

  const loadHistorical = () => {
      const data = getHistoricalCurve();
      if (data && data.length > 0) {
          const tsv = data.map(row => {
              const vals = INDICES.map(idx => row.prices[idx] !== undefined ? row.prices[idx] : '');
              return `${row.month}\t${vals.join('\t')}`;
          }).join('\n');
          setHistoricalInput(tsv);
          setHistoricalParsed(data);
          setHistoricalPreview(true);
      }
  };

  const parseCurveDate = (raw: string): string => {
    const str = raw.trim();
    if (!str) return '';

    const months: Record<string, string> = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
        january: '01', february: '02', march: '03', april: '04', june: '06',
        july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
    };

    const mmmYy = str.match(/^([a-zA-Z]+)[\s\-\']+(\d{2,4})$/);
    if (mmmYy) {
        const mStr = mmmYy[1].toLowerCase().slice(0, 3);
        const yStr = mmmYy[2];
        const month = months[mStr] || months[mmmYy[1].toLowerCase()];
        
        if (month) {
            let year = parseInt(yStr);
            if (year < 100) year += 2000;
            return `${year}-${month}`;
        }
    }

    const mmYy = str.match(/^(\d{1,2})[\/\-](\d{2})$/);
    if (mmYy) {
        const m = parseInt(mmYy[1]);
        let y = parseInt(mmYy[2]);
        if (m >= 1 && m <= 12) {
            if (y < 100) y += 2000;
            return `${y}-${String(m).padStart(2, '0')}`;
        }
    }

    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    return '';
  };

  const handleGenericParse = (input: string, setter: (data: ForwardCurveRow[]) => void, previewSetter: (val: boolean) => void) => {
    if (!input.trim()) {
        toast.error("Please paste some data first.");
        return;
    }

    try {
        const rawRows = input.trim().split('\n');
        const curveData: ForwardCurveRow[] = [];
        const firstRow = rawRows[0];
        const hasTab = firstRow.includes('\t');
        const delimiter = hasTab ? '\t' : ',';
        let startIndex = 0;
        if (firstRow.toLowerCase().includes('month') || firstRow.toLowerCase().includes('date')) {
            startIndex = 1;
        }

        for (let i = startIndex; i < rawRows.length; i++) {
            const line = rawRows[i].trim();
            if (!line) continue;
            const values = line.split(delimiter).map(v => v.trim());
            if (values.length < 2) continue;
            const rawDate = values[0];
            const formattedMonth = parseCurveDate(rawDate);
            if (!formattedMonth) continue;

            const prices: Record<string, number> = {};
            const mapVal = (idx: number, key: string) => {
                if (values[idx]) {
                    const numStr = values[idx].replace(/[^0-9.-]/g, '');
                    if (!numStr) return;
                    const num = parseFloat(numStr);
                    if (!isNaN(num) && Math.abs(num) > 0.0001) {
                        prices[key] = num;
                    }
                }
            };
            mapVal(1, 'BRIPE');
            mapVal(2, 'JCC');
            mapVal(3, 'Dated Brent');
            mapVal(4, 'HH');
            mapVal(5, 'NBP');
            mapVal(6, 'JKM');
            mapVal(7, 'TTF');
            mapVal(8, 'AECO');
            mapVal(9, 'STN 2');

            curveData.push({ month: formattedMonth, prices });
        }
        if (curveData.length === 0) {
            toast.error("Could not parse valid rows. Check date format.");
            return;
        }
        setter(curveData);
        previewSetter(true);
        toast.success(`Parsed ${curveData.length} rows successfully.`);
    } catch (e) {
        console.error(e);
        toast.error("Error parsing data. Check format.");
    }
  };

  const handleSaveCurve = () => {
    if (!curveDate) {
        toast.error("Please select a date for this curve");
        return;
    }
    saveForwardCurve(curveDate, parsedData);
    toast.success(`Forward Curve saved for ${curveDate}`);
    refreshDates();
    onSave(); 
  };

  const handleSaveHistorical = () => {
    saveHistoricalCurve(historicalParsed);
    toast.success("Historical Market Data updated.");
    onSave();
  };

  const handleDelete = (date: string) => {
      if (window.confirm(`Are you sure you want to delete the curve for ${date}?`)) {
          deleteForwardCurve(date);
          refreshDates();
          if (date === curveDate) {
              setPreviewMode(false);
              setInputText('');
              setParsedData([]);
          }
          toast.success("Curve deleted");
          onSave(); 
      }
  };

  const analysisChartData = useMemo(() => {
      const curveA = getForwardCurve(compareDateA);
      const curveB = getForwardCurve(compareDateB);
      const allMonths = new Set([...curveA.map(r => r.month), ...curveB.map(r => r.month)]);
      const sortedMonths = Array.from(allMonths).sort();
      return sortedMonths.map(month => {
          const rowA = curveA.find(r => r.month === month);
          const rowB = curveB.find(r => r.month === month);
          const valA = rowA?.prices[selectedAnalysisIndex] || null;
          const valB = rowB?.prices[selectedAnalysisIndex] || null;
          return {
              month,
              [`Curve A (${compareDateA})`]: valA,
              [`Curve B (${compareDateB})`]: valB,
              diff: (valA !== null && valB !== null) ? valA - valB : null
          };
      });
  }, [compareDateA, compareDateB, selectedAnalysisIndex]);

  const allContractMonths = useMemo(() => {
      const dates = getAvailableCurveDates();
      const contracts = new Set<string>();
      dates.forEach(d => {
          const curve = getForwardCurve(d);
          curve.forEach(r => contracts.add(r.month));
      });
      return Array.from(contracts).sort();
  }, [availableDates]); 

  const evolutionChartData = useMemo(() => {
      if (!evolutionContract) return [];
      const dataPoints: { date: string, price: number | null }[] = [];
      const dates = getAvailableCurveDates().sort(); 
      dates.forEach(curveDate => {
          const curve = getForwardCurve(curveDate);
          const row = curve.find(r => r.month === evolutionContract);
          if (row) {
              dataPoints.push({
                  date: curveDate,
                  price: row.prices[evolutionIndex] || null
              });
          }
      });
      return dataPoints;
  }, [evolutionContract, evolutionIndex, availableDates]);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden">
        
        <div className="p-0 border-b border-slate-200 bg-white flex flex-col">
            <div className="flex justify-between items-center p-6 pb-2">
                <h2 className="text-xl font-bold text-slate-800">Forward Curve Manager</h2>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            <div className="flex px-6 gap-6">
                <button 
                    onClick={() => setActiveTab('manage')}
                    className={`pb-3 px-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'manage' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    Projected Curves
                </button>
                <button 
                    onClick={() => setActiveTab('historical')}
                    className={`pb-3 px-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'historical' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    Historical Prices
                </button>
                <button 
                    onClick={() => setActiveTab('analyze')}
                    className={`pb-3 px-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'analyze' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    Curve Comparison
                </button>
                <button 
                    onClick={() => setActiveTab('evolution')}
                    className={`pb-3 px-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'evolution' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    Contract Evolution
                </button>
            </div>
        </div>

        <div className="flex-1 overflow-hidden bg-slate-50 flex">
            {activeTab === 'manage' && (
                <>
                    <div className="w-64 bg-white border-r border-slate-200 flex flex-col">
                        <div className="p-4 border-b border-slate-100 bg-slate-50">
                            <h3 className="text-xs font-bold text-slate-500 uppercase">Available Dates</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                            {availableDates.map(date => (
                                <div key={date} className="flex group items-center justify-between hover:bg-slate-50 rounded-lg p-1 pr-2 cursor-default">
                                    <button 
                                        onClick={() => loadCurveForDate(date)}
                                        className={`flex-1 text-left px-3 py-2 text-sm rounded-lg transition-colors ${curveDate === date ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600'}`}
                                    >
                                        {date}
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleDelete(date); }}
                                        className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-all"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-bold text-slate-700">Editing Curve As Of:</label>
                                <input type="date" value={curveDate} onChange={(e) => setCurveDate(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => { setPreviewMode(false); setInputText(''); setParsedData([]); }} className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Clear</button>
                                {previewMode ? (
                                     <button onClick={() => setPreviewMode(false)} className="px-4 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200">Edit Raw Data</button>
                                ) : (
                                     <button onClick={() => handleGenericParse(inputText, setParsedData, setPreviewMode)} className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Parse</button>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">
                            {!previewMode ? (
                                <textarea className="flex-1 w-full h-full p-4 border border-slate-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 whitespace-pre leading-relaxed" placeholder="Month | BRIPE | JCC | Dated Brent | HH | NBP | JKM | TTF | AECO | Station 2" value={inputText} onChange={(e) => setInputText(e.target.value)} />
                            ) : (
                                <PreviewTable data={parsedData} />
                            )}
                        </div>
                        <div className="p-4 border-t border-slate-200 bg-white flex justify-end">
                            <button onClick={handleSaveCurve} disabled={!previewMode} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg shadow-lg disabled:opacity-50">Save Current Projection</button>
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'historical' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-bold text-slate-800">Historical Market Realized Prices</label>
                            <p className="text-xs text-slate-500">(Monthly averages for realized months)</p>
                        </div>
                        <div className="flex gap-2">
                            {historicalPreview ? (
                                 <button onClick={() => setHistoricalPreview(false)} className="px-4 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200">Edit Raw Data</button>
                            ) : (
                                 <button onClick={() => handleGenericParse(historicalInput, setHistoricalParsed, setHistoricalPreview)} className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Parse</button>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6">
                        {!historicalPreview ? (
                            <textarea className="flex-1 w-full h-full p-4 border border-slate-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 whitespace-pre leading-relaxed" placeholder="Month | BRIPE | JCC | Dated Brent | HH | NBP | JKM | TTF | AECO | Station 2" value={historicalInput} onChange={(e) => setHistoricalInput(e.target.value)} />
                        ) : (
                            <PreviewTable data={historicalParsed} />
                        )}
                    </div>
                    <div className="p-4 border-t border-slate-200 bg-white flex justify-end">
                        <button onClick={handleSaveHistorical} disabled={!historicalPreview} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg shadow-lg disabled:opacity-50">Update Historical Data</button>
                    </div>
                </div>
            )}

            {activeTab === 'analyze' && (
                <div className="flex-1 flex flex-col p-6 space-y-6 overflow-y-auto">
                    <div className="flex flex-wrap gap-4 items-end bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-slate-400 uppercase">Index</label>
                            <select value={selectedAnalysisIndex} onChange={(e) => setSelectedAnalysisIndex(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-slate-700">{INDICES.map(idx => <option key={idx} value={idx}>{idx}</option>)}</select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-slate-400 uppercase">Curve A (Baseline)</label>
                            <select value={compareDateA} onChange={(e) => setCompareDateA(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">{availableDates.map(d => <option key={d} value={d}>{d}</option>)}</select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-slate-400 uppercase">Curve B (Comparison)</label>
                            <select value={compareDateB} onChange={(e) => setCompareDateB(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">{availableDates.map(d => <option key={d} value={d}>{d}</option>)}</select>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 bg-white p-4 rounded-xl border border-slate-200 shadow-sm h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={analysisChartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="month" tick={{fontSize: 10}} />
                                    <YAxis domain={['auto', 'auto']} />
                                    <Tooltip />
                                    <Legend />
                                    <Line type="monotone" dataKey={`Curve A (${compareDateA})`} stroke="#3b82f6" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey={`Curve B (${compareDateB})`} stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'evolution' && (
                <div className="flex-1 flex flex-col p-6 space-y-6 overflow-y-auto">
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm min-h-[400px]">
                        {evolutionChartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={evolutionChartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="date" tick={{fontSize: 11}} />
                                    <YAxis domain={['auto', 'auto']} />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="price" stroke="#8b5cf6" strokeWidth={3} />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : <div className="flex items-center justify-center h-full text-slate-400">No evolutionary data.</div>}
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

const PreviewTable = ({ data }: { data: ForwardCurveRow[] }) => (
    <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-sm">
        <table className="w-full text-sm text-left bg-white">
            <thead className="text-xs text-slate-500 uppercase bg-slate-100 border-b border-slate-200 sticky top-0">
                <tr>{COLUMNS.map(col => <th key={col} className="px-4 py-3 font-bold">{col}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {data.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-mono font-bold text-slate-700">{row.month}</td>
                        {COLUMNS.slice(1).map((col) => {
                            const key = col === 'Station 2' ? 'STN 2' : col;
                            const val = row.prices[key];
                            return <td key={col} className={`px-4 py-2 ${val !== undefined ? 'text-slate-600' : 'text-slate-300 italic'}`}>{val !== undefined ? val.toFixed(3) : '-'}</td>;
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);
