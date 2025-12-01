import React, { useState } from 'react';
import { updateForwardCurve, ForwardCurveRow } from '../services/calculationService';
import { toast } from 'react-hot-toast';

interface ForwardCurveModalProps {
  onClose: () => void;
  onSave: () => void;
}

// The exact column order requested
const COLUMNS = ['Month', 'BRIPE', 'JCC', 'Dated Brent', 'HH', 'NBP', 'JKM', 'TTF', 'AECO', 'STN 2'];

export const ForwardCurveModal: React.FC<ForwardCurveModalProps> = ({ onClose, onSave }) => {
  const [inputText, setInputText] = useState('');
  const [parsedData, setParsedData] = useState<ForwardCurveRow[]>([]);
  const [previewMode, setPreviewMode] = useState(false);

  // Robust date parser for "Nov-25", "Nov 25", "11/25" -> "2025-11"
  const parseCurveDate = (raw: string): string => {
    const str = raw.trim();
    if (!str) return '';

    const months: Record<string, string> = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
        january: '01', february: '02', march: '03', april: '04', june: '06',
        july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
    };

    // 1. Try MMM-YY or MMM YY or MMM 'YY (e.g. Nov-25, Nov 25, Nov '25)
    // Regex breakdown: 
    // ^([a-zA-Z]+) : Start with letters (Month)
    // [\s\-\']+    : Separator (space, dash, quote)
    // (\d{2,4})$   : End with 2 or 4 digits (Year)
    const mmmYy = str.match(/^([a-zA-Z]+)[\s\-\']+(\d{2,4})$/);
    if (mmmYy) {
        const mStr = mmmYy[1].toLowerCase().slice(0, 3);
        const yStr = mmmYy[2];
        const month = months[mStr] || months[mmmYy[1].toLowerCase()];
        
        if (month) {
            let year = parseInt(yStr);
            if (year < 100) year += 2000; // Assume 21st century logic
            return `${year}-${month}`;
        }
    }

    // 2. Try MM-YY or MM/YY (e.g. 11-25, 11/25)
    // In Forward Curve context, this usually means Month-Year, not Day-Month or Month-Day.
    const mmYy = str.match(/^(\d{1,2})[\/\-](\d{2})$/);
    if (mmYy) {
        const m = parseInt(mmYy[1]);
        let y = parseInt(mmYy[2]);
        if (m >= 1 && m <= 12) {
            if (y < 100) y += 2000;
            return `${y}-${String(m).padStart(2, '0')}`;
        }
    }

    // 3. Fallback to native Date parser (good for YYYY-MM-DD or full dates)
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        // CAUTION: new Date('Nov-25') often defaults to Nov 25th, Current Year.
        // We only trust this if it parsed a full year or distinct format.
        // For our purpose, if regex #1 failed, this is the last resort.
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    return '';
  };

  const handleParse = () => {
    if (!inputText.trim()) {
        toast.error("Please paste some data first.");
        return;
    }

    try {
        const rows = inputText.trim().split('\n');
        const curveData: ForwardCurveRow[] = [];

        // Try to identify if first row is header. If it contains "Month", skip it.
        let startIndex = 0;
        if (rows[0].toLowerCase().includes('month')) {
            startIndex = 1;
        }

        for (let i = startIndex; i < rows.length; i++) {
            const line = rows[i].trim();
            if (!line) continue;
            
            // Split by tab or comma
            const values = line.split(/[\t,]/).map(v => v.trim());
            
            // Need at least Month + 1 value
            if (values.length < 2) continue;

            // Parse Date (Column 0)
            const rawDate = values[0];
            const formattedMonth = parseCurveDate(rawDate);

            if (!formattedMonth) {
                 console.warn("Could not parse date:", rawDate);
                 continue;
            }

            const prices: Record<string, number> = {};
            
            // Map remaining columns to Indices
            // Order: BRIPE (1), JCC (2), Dated Brent (3), HH (4), NBP (5), JKM (6), TTF (7), AECO (8), STN 2 (9)
            // Using 1-based index for values array
            
            const mapVal = (idx: number, key: string) => {
                if (values[idx]) {
                    const num = parseFloat(values[idx].replace(/[^0-9.-]/g, ''));
                    if (!isNaN(num)) prices[key] = num;
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

        setParsedData(curveData);
        setPreviewMode(true);
        toast.success(`Parsed ${curveData.length} rows successfully.`);

    } catch (e) {
        console.error(e);
        toast.error("Error parsing data. Check format.");
    }
  };

  const handleConfirm = () => {
    updateForwardCurve(parsedData);
    onSave();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
            <h2 className="text-xl font-bold text-slate-800">Forward Curve Manager</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
            {!previewMode ? (
                <div className="space-y-4 h-full flex flex-col">
                    <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm border border-blue-100">
                        <strong>Instructions:</strong> Paste your Excel data below. Ensure columns match this exact order:
                        <div className="mt-2 font-mono text-xs bg-white p-2 rounded border border-blue-100 overflow-x-auto">
                            Month | BRIPE | JCC | Dated Brent | HH | NBP | JKM | TTF | AECO | Station 2
                        </div>
                        <p className="mt-2 text-xs opacity-75">Supported Date Formats: <code>Nov-25</code>, <code>Nov 25</code>, <code>11/25</code></p>
                    </div>
                    <textarea 
                        className="flex-1 w-full p-4 border border-slate-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        placeholder={`Nov-25\t80.5\t82.1\t...\nDec-25\t81.0\t83.5\t...`}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                    />
                </div>
            ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-sm">
                    <table className="w-full text-sm text-left bg-white">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-100 border-b border-slate-200">
                            <tr>
                                {COLUMNS.map(col => <th key={col} className="px-4 py-3 font-bold">{col}</th>)}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {parsedData.map((row, i) => (
                                <tr key={i} className="hover:bg-slate-50">
                                    <td className="px-4 py-2 font-mono font-medium text-slate-700">{row.month}</td>
                                    {COLUMNS.slice(1).map((col, idx) => {
                                        // Map column name to key
                                        const key = col === 'Station 2' ? 'STN 2' : col;
                                        return (
                                            <td key={col} className="px-4 py-2 text-slate-600">
                                                {row.prices[key] !== undefined ? row.prices[key].toFixed(2) : '-'}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-white flex justify-end gap-3">
             {!previewMode ? (
                <button 
                    onClick={handleParse}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-lg shadow-blue-600/20"
                >
                    Parse Data
                </button>
             ) : (
                <>
                    <button 
                        onClick={() => setPreviewMode(false)}
                        className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg"
                    >
                        Back to Edit
                    </button>
                    <button 
                        onClick={handleConfirm}
                        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg shadow-lg shadow-emerald-600/20"
                    >
                        Save Curve
                    </button>
                </>
             )}
        </div>
      </div>
    </div>
  );
};