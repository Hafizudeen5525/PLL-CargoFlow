import React, { useState, useMemo } from 'react';
import { CargoProfile } from '../types';
import { recalculateProfile, getGroupName, getPortfolioYear, formatCurrency } from '../services/calculationService';
import * as XLSX from 'xlsx';
import { Download, FileSpreadsheet, FileCode, X, Calendar, Check, Copy } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface PortfolioSummaryExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: CargoProfile[];
  targetDate?: string;
}

export interface SummaryRowData {
  category: string;
  year: number;
  groupKey: string;
  cargoCount: number;
  loadedVolume: number;
  deliveredVolume: number;
  finalPurchaseCost: number;
  finalSalesRevenue: number;
  finalTotalCost: number;
  finalPhysicalPnL: number;
  isYearTotal?: boolean;
  isGrandTotal?: boolean;
  isCarvedOut?: boolean;
}

const GROUP_DEFINITIONS: Array<{ label: string; groupKey: string }> = [
  { label: 'Total LNGC', groupKey: 'LNGC' },
  { label: 'Total PFLNG1', groupKey: 'FLNG1' },
  { label: 'Total PFLNG2', groupKey: 'FLNG2' },
  { label: 'Total PL9SB', groupKey: 'PL9SB' },
  { label: 'Total Cheniere', groupKey: 'Cheniere' },
  { label: 'Total Others', groupKey: 'Others' },
  { label: 'Total Spot', groupKey: 'Spot' },
];

const TARGET_YEARS = [2026, 2027, 2028];

export const PortfolioSummaryExportModal: React.FC<PortfolioSummaryExportModalProps> = ({
  isOpen,
  onClose,
  profiles,
  targetDate
}) => {
  const [selectedYears, setSelectedYears] = useState<number[]>(TARGET_YEARS);
  const [copied, setCopied] = useState(false);

  // Recalculate all profiles using targetDate if provided
  const recalculatedProfiles = useMemo(() => {
    return profiles.map(p => recalculateProfile(p, true, targetDate) as CargoProfile);
  }, [profiles, targetDate]);

  // Compute summarized rows per year
  const summaryData = useMemo(() => {
    const rows: SummaryRowData[] = [];
    let grandCount = 0;
    let grandLoaded = 0;
    let grandDelivered = 0;
    let grandPurchase = 0;
    let grandRevenue = 0;
    let grandTotalCost = 0;
    let grandPnL = 0;

    selectedYears.forEach(year => {
      const yearProfiles = recalculatedProfiles.filter(p => getPortfolioYear(p) === year.toString());

      let yearCount = 0;
      let yearLoaded = 0;
      let yearDelivered = 0;
      let yearPurchase = 0;
      let yearRevenue = 0;
      let yearTotalCost = 0;
      let yearPnL = 0;

      GROUP_DEFINITIONS.forEach(def => {
        const groupProfiles = yearProfiles.filter(p => getGroupName(p.strategyName, p.strategyGroup) === def.groupKey);

        const count = groupProfiles.length;
        const loaded = groupProfiles.reduce((sum, p) => sum + (p.loadedVolume || 0) + (p.tier2LoadedVolume || 0), 0);
        const delivered = groupProfiles.reduce((sum, p) => sum + (p.deliveredVolume || 0) + (p.tier2DeliveredVolume || 0), 0);
        const purchase = groupProfiles.reduce((sum, p) => {
          const t1Purchase = (p.loadedVolume || 0) * (p.absoluteBuyPrice || 0);
          const t2Purchase = p.isTieredPricing ? (p.tier2LoadedVolume || 0) * (p.absoluteTier2BuyPrice || 0) : 0;
          return sum + ((p.reconciledPurchaseCost && p.reconciledPurchaseCost > 0) ? p.reconciledPurchaseCost : (t1Purchase + t2Purchase));
        }, 0);
        const revenue = groupProfiles.reduce((sum, p) => sum + (p.finalSalesRevenue || 0), 0);
        const totalCost = groupProfiles.reduce((sum, p) => sum + (p.finalTotalCost || 0), 0);
        const pnl = groupProfiles.reduce((sum, p) => {
          const calcPnL = p.finalPhysicalPnL !== undefined ? p.finalPhysicalPnL : ((p.finalSalesRevenue || 0) - (p.finalTotalCost || 0));
          return sum + calcPnL;
        }, 0);

        yearCount += count;
        yearLoaded += loaded;
        yearDelivered += delivered;
        yearPurchase += purchase;
        yearRevenue += revenue;
        yearTotalCost += totalCost;
        yearPnL += pnl;

        rows.push({
          category: `${def.label} ${year}`,
          year,
          groupKey: def.groupKey,
          cargoCount: count,
          loadedVolume: loaded,
          deliveredVolume: delivered,
          finalPurchaseCost: purchase,
          finalSalesRevenue: revenue,
          finalTotalCost: totalCost,
          finalPhysicalPnL: pnl
        });
      });

      // Main Year Total Row (Excluding CarvedOut)
      rows.push({
        category: `Total ${year}`,
        year,
        groupKey: 'ALL',
        cargoCount: yearCount,
        loadedVolume: yearLoaded,
        deliveredVolume: yearDelivered,
        finalPurchaseCost: yearPurchase,
        finalSalesRevenue: yearRevenue,
        finalTotalCost: yearTotalCost,
        finalPhysicalPnL: yearPnL,
        isYearTotal: true
      });

      // Separate CarvedOut Row for Year (Not in main total)
      const carvedOutProfiles = yearProfiles.filter(p => getGroupName(p.strategyName, p.strategyGroup) === 'CarvedOut');
      const coCount = carvedOutProfiles.length;
      const coLoaded = carvedOutProfiles.reduce((sum, p) => sum + (p.loadedVolume || 0) + (p.tier2LoadedVolume || 0), 0);
      const coDelivered = carvedOutProfiles.reduce((sum, p) => sum + (p.deliveredVolume || 0) + (p.tier2DeliveredVolume || 0), 0);
      const coPurchase = carvedOutProfiles.reduce((sum, p) => {
        const t1Purchase = (p.loadedVolume || 0) * (p.absoluteBuyPrice || 0);
        const t2Purchase = p.isTieredPricing ? (p.tier2LoadedVolume || 0) * (p.absoluteTier2BuyPrice || 0) : 0;
        return sum + ((p.reconciledPurchaseCost && p.reconciledPurchaseCost > 0) ? p.reconciledPurchaseCost : (t1Purchase + t2Purchase));
      }, 0);
      const coRevenue = carvedOutProfiles.reduce((sum, p) => sum + (p.finalSalesRevenue || 0), 0);
      const coTotalCost = carvedOutProfiles.reduce((sum, p) => sum + (p.finalTotalCost || 0), 0);
      const coPnL = carvedOutProfiles.reduce((sum, p) => {
        const calcPnL = p.finalPhysicalPnL !== undefined ? p.finalPhysicalPnL : ((p.finalSalesRevenue || 0) - (p.finalTotalCost || 0));
        return sum + calcPnL;
      }, 0);

      rows.push({
        category: `Total CarvedOut ${year}`,
        year,
        groupKey: 'CarvedOut',
        cargoCount: coCount,
        loadedVolume: coLoaded,
        deliveredVolume: coDelivered,
        finalPurchaseCost: coPurchase,
        finalSalesRevenue: coRevenue,
        finalTotalCost: coTotalCost,
        finalPhysicalPnL: coPnL,
        isCarvedOut: true
      });

      grandCount += yearCount;
      grandLoaded += yearLoaded;
      grandDelivered += yearDelivered;
      grandPurchase += yearPurchase;
      grandRevenue += yearRevenue;
      grandTotalCost += yearTotalCost;
      grandPnL += yearPnL;
    });

    return { rows, grand: { count: grandCount, loaded: grandLoaded, delivered: grandDelivered, purchase: grandPurchase, revenue: grandRevenue, totalCost: grandTotalCost, pnl: grandPnL } };
  }, [recalculatedProfiles, selectedYears]);

  if (!isOpen) return null;

  const toggleYear = (y: number) => {
    if (selectedYears.includes(y)) {
      if (selectedYears.length > 1) {
        setSelectedYears(selectedYears.filter(item => item !== y));
      } else {
        toast.error("At least one year must be selected");
      }
    } else {
      setSelectedYears([...selectedYears, y].sort());
    }
  };

  const handleExportExcel = () => {
    try {
      const excelRows: any[] = [];

      // Build rows for each year
      selectedYears.forEach(year => {
        const yearRows = summaryData.rows.filter(r => r.year === year);
        yearRows.forEach(r => {
          excelRows.push({
            'Category': r.category,
            'No. of Cargoes': r.cargoCount,
            'Loaded Volume (MMBtu)': r.loadedVolume,
            'Delivered Volume (MMBtu)': r.deliveredVolume,
            'Final Purchase Cost ($)': r.finalPurchaseCost,
            'Final Sales Revenue ($)': r.finalSalesRevenue,
            'Final Total Cost ($)': r.finalTotalCost,
            'Final Physical P&L ($)': r.finalPhysicalPnL
          });
        });
        // Blank row between years
        excelRows.push({});
      });

      // Add Grand Total
      excelRows.push({
        'Category': `Grand Total (${selectedYears.join(', ')})`,
        'No. of Cargoes': summaryData.grand.count,
        'Loaded Volume (MMBtu)': summaryData.grand.loaded,
        'Delivered Volume (MMBtu)': summaryData.grand.delivered,
        'Final Purchase Cost ($)': summaryData.grand.purchase,
        'Final Sales Revenue ($)': summaryData.grand.revenue,
        'Final Total Cost ($)': summaryData.grand.totalCost,
        'Final Physical P&L ($)': summaryData.grand.pnl
      });

      const ws = XLSX.utils.json_to_sheet(excelRows);

      // Set column widths
      ws['!cols'] = [
        { wch: 25 }, // Category
        { wch: 15 }, // No. of Cargoes
        { wch: 24 }, // Loaded Volume
        { wch: 24 }, // Delivered Volume
        { wch: 24 }, // Final Purchase Cost
        { wch: 24 }, // Final Sales Revenue
        { wch: 22 }, // Final Total Cost
        { wch: 22 }  // Final Physical P&L
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Portfolio Summary');

      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `Portfolio_Summarized_Data_${selectedYears.join('_')}_${dateStr}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast.success(`Exported ${filename}`);
    } catch (err) {
      console.error('Excel Export Error:', err);
      toast.error('Failed to generate Excel file');
    }
  };

  const generateHtmlContent = (): string => {
    const dateStr = new Date().toLocaleString();
    const asOfStr = targetDate ? `As of Curve: ${targetDate}` : 'Live Curve Evaluation';

    const renderTableRows = (year: number) => {
      const yearRows = summaryData.rows.filter(r => r.year === year);
      return yearRows.map(r => {
        const isTotal = r.isYearTotal;
        const rowClass = isTotal ? 'year-total-row' : '';
        const pnlColor = r.finalPhysicalPnL >= 0 ? '#059669' : '#dc2626';
        return `
          <tr class="${rowClass}">
            <td class="category-cell">${r.category}</td>
            <td class="num-cell">${r.cargoCount}</td>
            <td class="num-cell">${r.loadedVolume.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
            <td class="num-cell">${r.deliveredVolume.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
            <td class="num-cell">${formatCurrency(r.finalPurchaseCost)}</td>
            <td class="num-cell">${formatCurrency(r.finalSalesRevenue)}</td>
            <td class="num-cell">${formatCurrency(r.finalTotalCost)}</td>
            <td class="num-cell" style="color: ${pnlColor}; font-weight: ${isTotal ? '700' : '600'};">${formatCurrency(r.finalPhysicalPnL)}</td>
          </tr>
        `;
      }).join('');
    };

    const grandPnLColor = summaryData.grand.pnl >= 0 ? '#059669' : '#dc2626';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Portfolio Summarized Data (${selectedYears.join(', ')})</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0;
      padding: 30px;
      background-color: #f8fafc;
      color: #1e293b;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: #ffffff;
      padding: 32px;
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .title {
      font-size: 24px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 6px 0;
    }
    .subtitle {
      font-size: 13px;
      color: #64748b;
      margin: 0;
    }
    .meta {
      text-align: right;
      font-size: 12px;
      color: #64748b;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 32px;
      font-size: 13px;
    }
    th {
      background-color: #0f172a;
      color: #ffffff;
      font-weight: 600;
      text-align: right;
      padding: 10px 14px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    th:first-child {
      text-align: left;
      border-top-left-radius: 6px;
    }
    th:last-child {
      border-top-right-radius: 6px;
    }
    td {
      padding: 9px 14px;
      border-bottom: 1px solid #f1f5f9;
      white-space: nowrap;
    }
    tr:nth-child(even):not(.year-total-row) {
      background-color: #f8fafc;
    }
    tr:hover:not(.year-total-row) {
      background-color: #f1f5f9;
    }
    .category-cell {
      text-align: left;
      font-weight: 500;
      color: #334155;
    }
    .num-cell {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .year-total-row {
      background-color: #e2e8f0 !important;
      font-weight: 700;
      border-top: 2px solid #cbd5e1;
      border-bottom: 2px solid #cbd5e1;
    }
    .year-total-row td {
      color: #0f172a;
    }
    .grand-total-section {
      background-color: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      padding: 16px 20px;
      margin-top: 20px;
    }
    .grand-total-title {
      font-size: 14px;
      font-weight: 700;
      color: #166534;
      margin-bottom: 12px;
    }
    .footer {
      margin-top: 30px;
      text-align: center;
      font-size: 11px;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
      padding-top: 16px;
    }
    @media print {
      body { background-color: #ffffff; padding: 0; }
      .container { box-shadow: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1 class="title">Portfolio Summarized Data</h1>
        <p class="subtitle">Detailed breakdown by cargo strategy group for ${selectedYears.join(', ')}</p>
      </div>
      <div class="meta">
        <div><strong>Generated:</strong> ${dateStr}</div>
        <div>${asOfStr}</div>
      </div>
    </div>

    ${selectedYears.map(year => `
      <div style="margin-bottom: 28px;">
        <h2 style="font-size: 16px; font-weight: 700; color: #1e293b; margin: 0 0 10px 0; border-left: 4px solid #3b82f6; padding-left: 8px;">
          Summary Year ${year}
        </h2>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>No. of Cargoes</th>
              <th>Loaded Volume</th>
              <th>Delivered Volume</th>
              <th>Final Purchase Cost</th>
              <th>Final Sales Revenue</th>
              <th>Final Total Cost</th>
              <th>Final Physical P&L</th>
            </tr>
          </thead>
          <tbody>
            ${renderTableRows(year)}
          </tbody>
        </table>
      </div>
    `).join('')}

    <div class="grand-total-section">
      <div class="grand-total-title">Combined Grand Total (${selectedYears.join(', ')})</div>
      <table>
        <thead>
          <tr style="background-color: #166534;">
            <th>Metric</th>
            <th>No. of Cargoes</th>
            <th>Loaded Volume</th>
            <th>Delivered Volume</th>
            <th>Final Purchase Cost</th>
            <th>Final Sales Revenue</th>
            <th>Final Total Cost</th>
            <th>Final Physical P&L</th>
          </tr>
        </thead>
        <tbody>
          <tr style="font-weight: 700; font-size: 14px; background: #ffffff;">
            <td class="category-cell">All Selected Years</td>
            <td class="num-cell">${summaryData.grand.count}</td>
            <td class="num-cell">${summaryData.grand.loaded.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
            <td class="num-cell">${summaryData.grand.delivered.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
            <td class="num-cell">${formatCurrency(summaryData.grand.purchase)}</td>
            <td class="num-cell">${formatCurrency(summaryData.grand.revenue)}</td>
            <td class="num-cell">${formatCurrency(summaryData.grand.totalCost)}</td>
            <td class="num-cell" style="color: ${grandPnLColor};">${formatCurrency(summaryData.grand.pnl)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="footer">
      CargoFlow Analytics Engine • Confidential Portfolio Report • Generated automatically
    </div>
  </div>
</body>
</html>`;
  };

  const handleExportHtml = () => {
    try {
      const htmlContent = generateHtmlContent();
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `Portfolio_Summarized_Data_${selectedYears.join('_')}_${dateStr}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Exported HTML report');
    } catch (err) {
      console.error('HTML Export Error:', err);
      toast.error('Failed to generate HTML report');
    }
  };

  const handleCopyTable = () => {
    try {
      const headers = ['Category', 'No. of Cargoes', 'Loaded Volume', 'Delivered Volume', 'Final Purchase Cost', 'Final Sales Revenue', 'Final Total Cost', 'Final Physical P&L'];
      const rows = summaryData.rows.map(r => [
        r.category,
        r.cargoCount,
        r.loadedVolume,
        r.deliveredVolume,
        r.finalPurchaseCost,
        r.finalSalesRevenue,
        r.finalTotalCost,
        r.finalPhysicalPnL
      ].join('\t'));

      const tsv = [headers.join('\t'), ...rows].join('\n');
      navigator.clipboard.writeText(tsv);
      setCopied(true);
      toast.success('Summary data copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      toast.error('Could not copy to clipboard');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Portfolio Summarized Data Download</h2>
              <p className="text-xs text-slate-500">
                Annual group breakdown for 2026, 2027, and 2028 {targetDate ? `• Basis Curve: ${targetDate}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Filters */}
        <div className="px-6 py-3 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              Years:
            </span>
            <div className="flex gap-1.5">
              {TARGET_YEARS.map(year => {
                const isSelected = selectedYears.includes(year);
                return (
                  <button
                    key={year}
                    onClick={() => toggleYear(year)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleCopyTable}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied!' : 'Copy TSV'}</span>
            </button>

            <button
              onClick={handleExportHtml}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-all shadow-sm"
            >
              <FileCode className="w-4 h-4" />
              <span>Download HTML</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Download Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* Table Preview */}
        <div className="flex-1 overflow-auto p-6 space-y-6 bg-slate-50/50">
          {selectedYears.map(year => {
            const yearRows = summaryData.rows.filter(r => r.year === year);
            return (
              <div key={year} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {year} Summary Table
                  </h3>
                  <span className="text-[11px] font-medium text-slate-500">
                    {yearRows.find(r => r.isYearTotal)?.cargoCount || 0} Total Cargoes
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                        <th className="py-2.5 px-4">Category</th>
                        <th className="py-2.5 px-3 text-right">No. of Cargoes</th>
                        <th className="py-2.5 px-3 text-right">Loaded Volume</th>
                        <th className="py-2.5 px-3 text-right">Delivered Volume</th>
                        <th className="py-2.5 px-3 text-right">Final Purchase Cost</th>
                        <th className="py-2.5 px-3 text-right">Final Sales Revenue</th>
                        <th className="py-2.5 px-3 text-right">Final Total Cost</th>
                        <th className="py-2.5 px-4 text-right">Final Physical P&L</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {yearRows.map((row, idx) => {
                        const isTotal = row.isYearTotal;
                        const isCO = row.isCarvedOut;
                        const pnlColor = row.finalPhysicalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600';
                        return (
                          <tr
                            key={idx}
                            className={`transition-colors ${
                              isTotal
                                ? 'bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300'
                                : isCO
                                ? 'bg-purple-50/50 text-purple-900 italic hover:bg-purple-50'
                                : 'hover:bg-slate-50/80 text-slate-700'
                            }`}
                          >
                            <td className="py-2.5 px-4 font-medium flex items-center gap-2">
                              <span>{row.category}</span>
                              {isCO && (
                                <span className="not-italic text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-bold uppercase">
                                  Separate / Excluded
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">{row.cargoCount}</td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              {row.loadedVolume.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              {row.deliveredVolume.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              {formatCurrency(row.finalPurchaseCost)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              {formatCurrency(row.finalSalesRevenue)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              {formatCurrency(row.finalTotalCost)}
                            </td>
                            <td className={`py-2.5 px-4 text-right font-mono font-bold ${pnlColor}`}>
                              {formatCurrency(row.finalPhysicalPnL)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {/* Grand Total Summary Box */}
          <div className="bg-slate-900 text-white rounded-xl p-4 shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Combined Portfolio Total</div>
              <div className="text-sm font-bold text-slate-200">
                Years {selectedYears.join(', ')} • {summaryData.grand.count} Total Cargoes
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-6 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Total Revenue</span>
                <span className="font-mono font-bold text-slate-100">{formatCurrency(summaryData.grand.revenue)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Total Cost</span>
                <span className="font-mono font-bold text-slate-100">{formatCurrency(summaryData.grand.totalCost)}</span>
              </div>
              <div className="border-l border-slate-700 pl-6">
                <span className="text-slate-400 block text-[10px] uppercase">Net Physical P&L</span>
                <span className={`font-mono font-bold text-sm ${summaryData.grand.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatCurrency(summaryData.grand.pnl)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Export generates exact summarized groups with all formula calculations applied.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
