
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { CargoProfile, PnLBucket, EmptyCargoProfile } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { detectUnit, recalculateProfile, getGroupName, GROUPS, getPortfolioYear, saveForwardCurve, ForwardCurveRow, formatCurrency, formatPrice } from '../services/calculationService';
import { WorldMap } from './WorldMap';
import { CalendarView } from './CalendarView';
import { JarvisPreviewModal } from './JarvisPreviewModal';
import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';
import { ReconciliationData } from './DiscrepancyCheck';

interface CargoListProps {
  profiles: CargoProfile[];
  onEdit: (profile: CargoProfile) => void;
  onDelete: (id: string) => void;
  onActualize: (profile: CargoProfile) => void;
  onBulkDelete: (ids: Set<string>) => void;
  onBulkUpdate?: (ids: Set<string>, updates: Partial<CargoProfile>) => void;
  onBulkImport?: (profiles: CargoProfile[]) => void;
  onForwardCurveUpdate?: () => void;
  trmsData?: ReconciliationData;
  userRole?: 'admin' | 'trader' | 'viewer';
}

type ViewMode = 'table' | 'map' | 'calendar';

const COLUMN_WIDTH = 180;
const STRATEGY_COL_WIDTH = 210;

export const CargoList: React.FC<CargoListProps> = ({ 
    profiles, onEdit, onDelete, onActualize, onBulkDelete, onBulkUpdate, onBulkImport, onForwardCurveUpdate, trmsData, userRole 
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isImportingJarvis, setIsImportingJarvis] = useState(false);
  const [pendingJarvisRows, setPendingJarvisRows] = useState<any[]>([]);
  const [isJarvisPreviewOpen, setIsJarvisPreviewOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const exportPopoverRef = useRef<HTMLDivElement>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string | null; direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });
  
  // Advanced Filtering State
  const [activeFilters, setActiveFilters] = useState<Record<string, Set<any>>>({});
  const [openFilterMenu, setOpenFilterMenu] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Export Configuration State
  const [isExportPopoverOpen, setIsExportPopoverOpen] = useState(false);
  const [exportYear, setExportYear] = useState<string>('All');
  const [exportGroup, setExportGroup] = useState<string>('All');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setOpenFilterMenu(null);
        setFilterSearch('');
      }
      if (exportPopoverRef.current && !exportPopoverRef.current.contains(event.target as Node)) {
        setIsExportPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const headerKeys = useMemo(() => [
    'strategyName', 'buyer', 'source', 'deliveryDate', 'loadingDate', 
    'absoluteBuyPrice', 'loadedVolume', 'purchaseCost', 
    'absoluteSellPrice', 'deliveredVolume', 'salesRevenue', 
    'reconciledSrcCost', 'trmsHedging', 'finalTotalPnL', 'pnlBucket'
  ], []);

  const processedProfiles = useMemo(() => {
    let result = [...profiles];
    if (debouncedSearch) {
      const lower = debouncedSearch.toLowerCase();
      result = result.filter((p: CargoProfile) => Object.values(p).some((v: any) => String(v || '').toLowerCase().includes(lower)));
    }
    Object.entries(activeFilters).forEach(([column, selectedValues]) => {
      const values = selectedValues as Set<any>;
      if (values.size > 0) {
        result = result.filter((p: CargoProfile) => values.has((p as any)[column]));
      }
    });
    if (sortConfig.key) {
      const { key, direction } = sortConfig;
      result.sort((a: CargoProfile, b: CargoProfile) => {
        let aVal = (a as any)[key!];
        let bVal = (b as any)[key!];
        
        if (key === 'purchaseCost') {
            aVal = ((a.absoluteBuyPrice || 0) * (a.loadedVolume || 0)) + (a.isTieredPricing ? ((a.absoluteTier2BuyPrice || 0) * (a.tier2LoadedVolume || 0)) : 0);
            bVal = ((b.absoluteBuyPrice || 0) * (b.loadedVolume || 0)) + (b.isTieredPricing ? ((b.absoluteTier2BuyPrice || 0) * (b.tier2LoadedVolume || 0)) : 0);
        }

        if (aVal === bVal) return 0;
        if (aVal === undefined || aVal === null) return 1;
        if (bVal === undefined || bVal === null) return -1;
        if (typeof aVal === 'number' && typeof bVal === 'number') return direction === 'asc' ? aVal - bVal : bVal - aVal;
        return direction === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
      });
    }
    return result;
  }, [profiles, debouncedSearch, activeFilters, sortConfig]);

  const filterData = useMemo(() => {
    const values: Record<string, any[]> = {};
    const strategyHierarchy: Record<string, string[]> = {};
    const dateHierarchies: Record<string, any> = {};

    headerKeys.forEach((header: string) => {
      if (header === 'strategyName') {
        profiles.forEach((p: CargoProfile) => {
          const group = getGroupName(p.strategyName);
          if (!strategyHierarchy[group]) strategyHierarchy[group] = [];
          if (!strategyHierarchy[group].includes(p.strategyName)) strategyHierarchy[group].push(p.strategyName);
        });
        Object.keys(strategyHierarchy).forEach((g: string) => strategyHierarchy[g].sort());
      } else if (header === 'deliveryDate' || header === 'loadingDate') {
        const hierarchy: any = {};
        profiles.forEach((p: CargoProfile) => {
          const dStr = (p as any)[header] as string;
          if (!dStr) return;
          const [y, m, d] = dStr.split('-');
          const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleString('default', { month: 'long' });
          if (!hierarchy[y]) hierarchy[y] = {};
          if (!hierarchy[y][monthName]) hierarchy[y][monthName] = new Set();
          hierarchy[y][monthName].add(dStr);
        });
        dateHierarchies[header] = hierarchy;
      } else if (!['purchaseCost', 'salesRevenue', 'trmsHedging'].includes(header)) {
        const uniqueSet = new Set(profiles.map((p: CargoProfile) => (p as any)[header]));
        values[header] = Array.from(uniqueSet).sort();
      }
    });
    return { values, strategyHierarchy, dateHierarchies };
  }, [profiles, headerKeys]);

  const availableExportYears = useMemo(() => {
    const years = new Set<string>();
    profiles.forEach((p: CargoProfile) => years.add(getPortfolioYear(p).toString()));
    return ['All', ...Array.from(years).sort().reverse()];
  }, [profiles]);

  const availableExportGroups = useMemo(() => {
    return ['All', ...GROUPS, 'Others'];
  }, []);

  const toggleValueFilter = (header: string, value: any) => {
    setActiveFilters((prev: Record<string, Set<any>>) => {
      const next = { ...prev };
      const currentSet = new Set(next[header] || []);
      if (currentSet.has(value)) currentSet.delete(value); else currentSet.add(value);
      if (currentSet.size === 0) delete next[header]; else next[header] = currentSet;
      return next;
    });
  };

  const bulkToggle = (column: string, values: any[], shouldSelect: boolean) => {
    setActiveFilters((prev: Record<string, Set<any>>) => {
        const next = { ...prev };
        const currentSet = new Set(next[column] || []);
        values.forEach((v: any) => { if (shouldSelect) currentSet.add(v); else currentSet.delete(v); });
        if (currentSet.size === 0) delete next[column]; else next[column] = currentSet;
        return next;
    });
  };

  const handleJarvisImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsImportingJarvis(true);
    const loadingToast = toast.loading(`Extracting ${files.length} Jarvis Workbook(s)...`);
    
    const mergedData: Record<string, Partial<CargoProfile>> = {};
    const foundForwardCurves: Array<{ date: string, curve: ForwardCurveRow[], fileName: string }> = [];

    const cleanNumeric = (val: any): number => {
        if (val === undefined || val === null || val === '' || val === '-' || String(val).trim() === '-') return 0;
        if (typeof val === 'number') return val;
        const str = String(val).replace(/,/g, '').trim();
        if (str.endsWith('%')) return parseFloat(str.slice(0, -1)) / 100;
        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
    };

    const normalizeDate = (val: any): string => {
        if (!val) return '';
        
        // If it's already a Date object (likely from XLSX), use UTC methods
        if (val instanceof Date) {
            const y = val.getUTCFullYear();
            const m = String(val.getUTCMonth() + 1).padStart(2, '0');
            const d = String(val.getUTCDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }

        // If it's a string, try to match YYYY-MM-DD (ISO) first
        const isoMatch = String(val).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

        const d = new Date(val);
        if (!isNaN(d.getTime())) {
            // Use local methods for other string formats
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }
        return '';
    };

    const processFile = (file: File): Promise<void> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const data = evt.target?.result as string;
                    const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
                    
                    const extractSheetData = (sheetName: string, mapping: Record<string, string>) => {
                        const sheet = workbook.Sheets[sheetName];
                        if (!sheet) return;
                        const json: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                        if (json.length === 0) return;
                        
                        let headerRowIndex = -1;
                        for (let i = 0; i < Math.min(json.length, 100); i++) {
                            const row = json[i];
                            if (row.some((cell: any) => String(cell || '').toLowerCase().trim() === 'strategy name')) {
                                headerRowIndex = i;
                                break;
                            }
                        }
                        if (headerRowIndex === -1) return;
                        const headersArr = json[headerRowIndex].map((h: any) => String(h || '').toLowerCase().trim());
                        const dataRows = json.slice(headerRowIndex + 1);

                        const seenInSheetCount = new Map<string, number>();

                        dataRows.forEach((row: any[]) => {
                            const stratIdx = headersArr.indexOf('strategy name');
                            const stratName = row[stratIdx];
                            if (!stratName || String(stratName).trim() === '') return;
                            
                            const cleanStratName = String(stratName).trim();
                            const count = (seenInSheetCount.get(cleanStratName) || 0) + 1;
                            seenInSheetCount.set(cleanStratName, count);

                            const isTier2Leg = count > 1 || cleanStratName.toLowerCase().includes('t(') || cleanStratName.toLowerCase().endsWith('t');
                            const lookupName = cleanStratName.replace(/t\(/i, '(').replace(/t$/i, '');

                            if (!mergedData[lookupName]) mergedData[lookupName] = { strategyName: lookupName };
                            
                            if (isTier2Leg) {
                                mergedData[lookupName].isTieredPricing = true;
                            }

                            Object.entries(mapping).forEach(([excelHeader, profileKey]) => {
                                const idx = headersArr.indexOf(excelHeader.toLowerCase().trim());
                                if (idx !== -1 && row[idx] !== undefined && row[idx] !== '') {
                                    const rawVal = row[idx];
                                    
                                    const isStringData = 
                                        profileKey.toLowerCase().includes('index') || 
                                        profileKey.toLowerCase().includes('monthdef') ||
                                        profileKey.toLowerCase().includes('formula') ||
                                        ['source', 'buyer', 'strategyName', 'manualGroup', 'deliveryDate', 'loadingDate', 'incoterms', 'pnlBucket'].includes(profileKey);

                                    let val = isStringData ? String(rawVal).trim() : cleanNumeric(rawVal);
                                    
                                    if (profileKey === 'loadingDate' || profileKey === 'deliveryDate') {
                                        val = normalizeDate(rawVal);
                                    }

                                    // Special handling for P&L Bucket
                                    if (profileKey === 'pnlBucket') {
                                        const bucketStr = String(val).toLowerCase();
                                        if (bucketStr.includes('realized') && !bucketStr.includes('unrealized')) {
                                            val = PnLBucket.Realized;
                                        } else if (bucketStr.includes('unrealized')) {
                                            val = PnLBucket.Unrealized;
                                        }
                                    }

                                    if (isTier2Leg && (sheetName === 'Purchase' || sheetName === 'Sales')) {
                                         mergedData[lookupName].isTieredPricing = true;
                                         if (profileKey === 'deliveredVolume') {
                                             mergedData[lookupName].tier2DeliveredVolume = val as number;
                                         } else if (profileKey === 'loadedVolume') {
                                             mergedData[lookupName].tier2LoadedVolume = val as number;
                                         } else if (profileKey === 'sellFormula') {
                                             mergedData[lookupName].tier2SellFormula = val as string;
                                         } else if (profileKey === 'buyFormula') {
                                             mergedData[lookupName].tier2BuyFormula = val as string;
                                         } else if (profileKey.startsWith('sellPrice') || profileKey.startsWith('buyPrice')) {
                                             const tier2Key = profileKey.replace('sellPrice', 'tier2SellPrice').replace('buyPrice', 'tier2BuyPrice');
                                             (mergedData[lookupName] as any)[tier2Key] = val;
                                         }
                                    } else {
                                         // Aggregate reconciled values if multiple lines exist (two-tier pricing in Master Sheet)
                                         if (['reconciledSrcCost', 'reconciledPurchaseCost', 'reconciledSalesRevenue'].includes(profileKey)) {
                                            (mergedData[lookupName] as any)[profileKey] = ((mergedData[lookupName] as any)[profileKey] || 0) + (val as number);
                                         } else if (rawVal instanceof Date) {
                                             const adjustedDate = new Date(rawVal.getTime() + (12 * 60 * 60 * 1000));
                                             const y = adjustedDate.getUTCFullYear();
                                             const m = String(adjustedDate.getUTCMonth() + 1).padStart(2, '0');
                                             const d = String(adjustedDate.getUTCDate()).padStart(2, '0');
                                             (mergedData[lookupName] as any)[profileKey] = `${y}-${m}-${d}`;
                                         } else if (profileKey === 'optimized') {
                                             mergedData[lookupName].optimized = String(rawVal).toLowerCase().includes('yes') || rawVal === true;
                                         } else if (profileKey === 'strategyName') {
                                             (mergedData[lookupName] as any)[profileKey] = lookupName;
                                         } else {
                                             (mergedData[lookupName] as any)[profileKey] = val;
                                         }
                                    }
                                }
                            });
                        });
                    };

                    const purchaseMap: Record<string, string> = {
                        'Source': 'source', 'No.': 'jarvisNo', 'Buyer': 'buyer', 'Optimized': 'optimized', 'Loading Date': 'loadingDate', 'Loaded Volume': 'loadedVolume', 'Buy Formula': 'buyFormula', 'Buy Price Overall Constant': 'buyPriceOverallConstant'
                    };
                    for (let i = 1; i <= 3; i++) {
                        purchaseMap[`Buy Price ${i} Weightage`] = `buyPrice${i}Weightage`;
                        purchaseMap[`Buy Price ${i} slope`] = `buyPrice${i}Slope`;
                        purchaseMap[`Buy Price Index ${i}`] = `buyPriceIndex${i}`;
                        purchaseMap[`Buy Price ${i} Month Definition`] = `buyPrice${i}MonthDef`;
                        purchaseMap[`Buy Price ${i} constant`] = `buyPrice${i}Constant`;
                    }
                    extractSheetData('Purchase', purchaseMap);

                    const salesMap: Record<string, string> = {
                        'Buyer': 'buyer', 'Delivery Date': 'deliveryDate', 'Delivered Volume': 'deliveredVolume', 'Sell Formula': 'sellFormula', 'Sell Price Overall Constant': 'sellPriceOverallConstant'
                    };
                    for (let i = 1; i <= 3; i++) {
                        salesMap[`Sell Price ${i} Weightage`] = `sellPrice${i}Weightage`;
                        salesMap[`Sell Price ${i} slope`] = `sellPrice${i}Slope`;
                        salesMap[`Sell Price Index ${i}`] = `sellPriceIndex${i}`;
                        salesMap[`Sell Price ${i} Month Definition`] = `sellPrice${i}MonthDef`;
                        salesMap[`Sell Price ${i} constant`] = `sellPrice${i}Constant`;
                    }
                    extractSheetData('Sales', salesMap);

                    extractSheetData('Cost', { 'Incoterm': 'incoterms', 'SRC': 'reconciledSrcCost' });

                    const masterMap: Record<string, string> = {
                        'Strategy Name': 'strategyName',
                        'P&L Bucket': 'pnlBucket',
                        'Reconciled Purchase Cost': 'reconciledPurchaseCost',
                        'Reconciled Sales Revenue': 'reconciledSalesRevenue'
                    };
                    extractSheetData('Master Sheet', masterMap);

                    // Extract Forward Curve if exists
                    const fcSheetName = workbook.SheetNames.find(n => {
                        const lower = n.trim().toLowerCase();
                        return lower === "forward curve" || (lower.includes("forward") && lower.includes("curve"));
                    });
                    const fcSheet = fcSheetName ? workbook.Sheets[fcSheetName] : null;
                    if (fcSheet) {
                        let asOfDate = new Date().toISOString().split('T')[0];
                        const asOfCell = fcSheet['B1'];
                        if (asOfCell) {
                            if (asOfCell.t === 'd') asOfDate = asOfCell.v.toISOString().split('T')[0];
                            else if (typeof asOfCell.v === 'number') {
                                const d = new Date(Math.round((asOfCell.v - 25569) * 86400 * 1000));
                                asOfDate = d.toISOString().split('T')[0];
                            } else asOfDate = String(asOfCell.v);
                        }

                        const indexes: string[] = [];
                        for (let i = 2; i <= 11; i++) {
                            const cell = fcSheet[XLSX.utils.encode_cell({ r: 1, c: i })];
                            if (cell) indexes.push(String(cell.v).trim());
                            else {
                                const fallback = ['BRIPE', 'JCC', 'Dated Brent', 'HH', 'NBP', 'JKM', 'TTF', 'AECO', 'Station 2', 'HH Last Day'];
                                indexes.push(fallback[i-2] || `Index ${i-1}`);
                            }
                        }

                        const monthToPrices: Record<string, Record<string, number>> = {};
                        const fcRows = XLSX.utils.sheet_to_json(fcSheet, { header: 1 }) as any[][];
                        
                        for (let r = 3; r < fcRows.length; r++) {
                            const row = fcRows[r];
                            const monthVal = row[1]; // Column B
                            if (monthVal === undefined || monthVal === null) continue;
                            
                            let monthStr = '';
                            if (monthVal instanceof Date) {
                                const y = monthVal.getUTCFullYear();
                                const m = String(monthVal.getUTCMonth() + 1).padStart(2, '0');
                                monthStr = `${y}-${m}`;
                            } else if (typeof monthVal === 'number') {
                                const date = new Date(Math.round((monthVal - 25569) * 86400 * 1000));
                                const y = date.getUTCFullYear();
                                const m = String(date.getUTCMonth() + 1).padStart(2, '0');
                                monthStr = `${y}-${m}`;
                            } else {
                                monthStr = String(monthVal).trim();
                            }

                            if (!monthToPrices[monthStr]) monthToPrices[monthStr] = {};

                            for (let i = 0; i < indexes.length; i++) {
                                const val = row[i + 2]; // Columns C onwards
                                const numVal = typeof val === 'number' ? val : parseFloat(String(val || '').replace(/[$,]/g, ''));
                                if (!isNaN(numVal) && numVal !== 0) {
                                    monthToPrices[monthStr][indexes[i]] = numVal;
                                }
                            }
                        }

                        const fcRowsToSave: ForwardCurveRow[] = Object.entries(monthToPrices).map(([month, prices]) => ({
                            month,
                            prices
                        })).sort((a, b) => a.month.localeCompare(b.month));

                        if (fcRowsToSave.length > 0) {
                            foundForwardCurves.push({
                                date: asOfDate,
                                curve: fcRowsToSave,
                                fileName: file.name
                            });
                        }
                    }
                    
                    resolve();
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
            reader.readAsBinaryString(file);
        });
    };

    try {
        // Process all files sequentially to avoid memory issues with large workbooks
        for (let i = 0; i < files.length; i++) {
            await processFile(files[i]);
        }

        // Handle Forward Curves found
        if (foundForwardCurves.length > 0) {
            const importPrices = window.confirm(
                `Found Forward Curve data in ${foundForwardCurves.length} file(s).\n\n` +
                `Do you want to import these prices into the Forward Curve manager?`
            );

            if (importPrices) {
                // If multiple files, suggest taking the latest one or just import all (they are keyed by date)
                // We'll import all, but if multiple files have the same date, the last one processed wins.
                foundForwardCurves.forEach(fc => {
                    saveForwardCurve(fc.date, fc.curve);
                });
                toast.success(`Imported Forward Curves from ${foundForwardCurves.length} file(s)`);
                if (onForwardCurveUpdate) onForwardCurveUpdate();
            }
        }

        const processedJarvisRows = Object.values(mergedData).map((parsedFields: any) => {
            const existingMatch = profiles.find((p: CargoProfile) => p.strategyName?.toLowerCase() === parsedFields.strategyName?.toLowerCase());
            let finalProfile: CargoProfile;
            let status: 'New' | 'Update' | 'No Change';
            const changes: Record<string, { old: any, new: any }> = {};

            if (existingMatch) {
                const merged = { ...existingMatch, ...parsedFields };
                
                // --- Robust Tiered Volume Splitting Logic (Sync with BulkImportModal) ---
                if (existingMatch.isTieredPricing) {
                    // Purchase Volume Split - only if not already explicitly provided in the import (Jarvis often has separate lines)
                    if (parsedFields.loadedVolume !== undefined && parsedFields.tier2LoadedVolume === undefined) {
                        const incomingTotal = parsedFields.loadedVolume;
                        const t1Threshold = existingMatch.loadedVolume || 0;
                        if (t1Threshold > 0 && incomingTotal > t1Threshold) {
                            merged.loadedVolume = t1Threshold;
                            merged.tier2LoadedVolume = incomingTotal - t1Threshold;
                        } else {
                            merged.loadedVolume = incomingTotal;
                            merged.tier2LoadedVolume = 0;
                        }
                    }
                    // Sales Volume Split - only if not already explicitly provided in the import
                    if (parsedFields.deliveredVolume !== undefined && parsedFields.tier2DeliveredVolume === undefined) {
                        const incomingTotal = parsedFields.deliveredVolume;
                        const t1Threshold = existingMatch.deliveredVolume || 0;
                        if (t1Threshold > 0 && incomingTotal > t1Threshold) {
                            merged.deliveredVolume = t1Threshold;
                            merged.tier2DeliveredVolume = incomingTotal - t1Threshold;
                        } else {
                            merged.deliveredVolume = incomingTotal;
                            merged.tier2DeliveredVolume = 0;
                        }
                    }
                }

                finalProfile = recalculateProfile(merged, true) as CargoProfile;
                status = 'Update';

                (Object.keys(finalProfile) as Array<keyof CargoProfile>).forEach((key: keyof CargoProfile) => {
                    if (key === 'id') return;
                    const oldVal = existingMatch[key];
                    const newVal = (finalProfile as any)[key];
                    if (oldVal !== newVal) {
                        if (typeof oldVal === 'number' && typeof newVal === 'number' && Math.abs(oldVal - newVal) < 0.001) return;
                        if (!oldVal && !newVal) return;
                        changes[key] = { old: oldVal, new: newVal };
                    }
                });

                // Add virtual "Total Volume" tracking for visual feedback in the preview table
                const oldTotalDel = (existingMatch.deliveredVolume || 0) + (existingMatch.tier2DeliveredVolume || 0);
                const newTotalDel = (finalProfile.deliveredVolume || 0) + (finalProfile.tier2DeliveredVolume || 0);
                if (Math.abs(oldTotalDel - newTotalDel) > 0.1) {
                    changes['totalDeliveredVolume'] = { old: oldTotalDel, new: newTotalDel };
                }
                const oldTotalLoad = (existingMatch.loadedVolume || 0) + (existingMatch.tier2LoadedVolume || 0);
                const newTotalLoad = (finalProfile.loadedVolume || 0) + (finalProfile.tier2LoadedVolume || 0);
                if (Math.abs(oldTotalLoad - newTotalLoad) > 0.1) {
                    changes['totalLoadedVolume'] = { old: oldTotalLoad, new: newTotalLoad };
                }

                if (Object.keys(changes).length === 0) status = 'No Change';
            } else {
                const baseProfile = { ...EmptyCargoProfile, id: Date.now().toString() + Math.random().toString().slice(2, 6), ...parsedFields };
                finalProfile = recalculateProfile(baseProfile, true) as CargoProfile;
                status = 'New';
            }
            return { 
                ...finalProfile, 
                _status: status, 
                _changes: changes,
                totalLoadedVolume: (finalProfile.loadedVolume || 0) + (finalProfile.tier2LoadedVolume || 0),
                totalDeliveredVolume: (finalProfile.deliveredVolume || 0) + (finalProfile.tier2DeliveredVolume || 0)
            };
        });

        setPendingJarvisRows(processedJarvisRows);
        setIsJarvisPreviewOpen(true);
        toast.dismiss(loadingToast);
    } catch (err) {
        console.error(err);
        toast.error('Failed to parse Jarvis Macro workbook(s)');
        toast.dismiss(loadingToast);
    } finally {
        setIsImportingJarvis(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFinishJarvisImport = (finalImports: CargoProfile[]) => {
      if (onBulkImport) onBulkImport(finalImports);
      setIsJarvisPreviewOpen(false);
      setPendingJarvisRows([]);
  };

  /* 
   * Fix: Added handleJarvisExport to generate an XLSM file in the format expected by Jarvis.
   * This resolves the 'Cannot find name handleJarvisExport' error.
   */
  const handleJarvisExport = () => {
    let filtered = profiles;
    if (exportYear !== 'All') {
      filtered = filtered.filter(p => getPortfolioYear(p).toString() === exportYear);
    }
    if (exportGroup !== 'All') {
      filtered = filtered.filter(p => getGroupName(p.strategyName) === exportGroup);
    }

    if (filtered.length === 0) {
      toast.error("No data to export for selected filters.");
      return;
    }

    const purchaseData = filtered.flatMap(p => {
      const rows = [];
      // Row 1 (Tier 1)
      const row1: any = {
        'Strategy Name': p.strategyName,
        'No.': p.jarvisNo || '',
        'Source': p.source,
        'Buyer': p.buyer,
        'Optimized': p.optimized ? 'Yes' : 'No',
        'Loading Date': p.loadingDate,
        'Loaded Volume': p.loadedVolume,
        'Buy Formula': p.buyFormula,
        'Buy Price Overall Constant': p.buyPriceOverallConstant || 0
      };
      for (let i = 1; i <= 3; i++) {
        row1[`Buy Price ${i} Weightage`] = (p as any)[`buyPrice${i}Weightage`] || 0;
        row1[`Buy Price ${i} slope`] = (p as any)[`buyPrice${i}Slope`] || 0;
        row1[`Buy Price Index ${i}`] = (p as any)[`buyPriceIndex${i}`] || '';
        row1[`Buy Price ${i} Month Definition`] = (p as any)[`buyPrice${i}MonthDef`] || '';
        row1[`Buy Price ${i} constant`] = (p as any)[`buyPrice${i}Constant`] || 0;
      }
      rows.push(row1);

      // Row 2 (Tier 2) - if tiered
      if (p.isTieredPricing && (p.tier2LoadedVolume || 0) > 0) {
        const row2: any = {
            'Strategy Name': `${p.strategyName}t`,
            'No.': p.jarvisNo || '',
            'Source': p.source,
            'Buyer': p.buyer,
            'Optimized': p.optimized ? 'Yes' : 'No',
            'Loading Date': p.loadingDate,
            'Loaded Volume': p.tier2LoadedVolume,
            'Buy Formula': p.tier2BuyFormula || p.buyFormula,
            'Buy Price Overall Constant': p.tier2BuyPriceOverallConstant || 0
        };
        for (let i = 1; i <= 3; i++) {
            row2[`Buy Price ${i} Weightage`] = (p as any)[`tier2BuyPrice${i}Weightage`] || 0;
            row2[`Buy Price ${i} slope`] = (p as any)[`tier2BuyPrice${i}Slope`] || 0;
            row2[`Buy Price Index ${i}`] = (p as any)[`tier2BuyPriceIndex${i}`] || '';
            row2[`Buy Price ${i} Month Definition`] = (p as any)[`tier2BuyPrice${i}MonthDef`] || '';
            row2[`Buy Price ${i} constant`] = (p as any)[`tier2BuyPrice${i}Constant`] || 0;
        }
        rows.push(row2);
      }
      return rows;
    });

    const salesData = filtered.flatMap(p => {
      const rows = [];
      // Row 1 (Tier 1)
      const row1: any = {
        'Strategy Name': p.strategyName,
        'Buyer': p.buyer,
        'Delivery Date': p.deliveryDate,
        'Delivered Volume': p.deliveredVolume,
        'Sell Formula': p.sellFormula,
        'Sell Price Overall Constant': p.sellPriceOverallConstant || 0
      };
      for (let i = 1; i <= 3; i++) {
        row1[`Sell Price ${i} Weightage`] = (p as any)[`sellPrice${i}Weightage`] || 0;
        row1[`Sell Price ${i} slope`] = (p as any)[`sellPrice${i}Slope`] || 0;
        row1[`Sell Price Index ${i}`] = (p as any)[`sellPriceIndex${i}`] || '';
        row1[`Sell Price ${i} Month Definition`] = (p as any)[`sellPrice${i}MonthDef`] || '';
        row1[`Sell Price ${i} constant`] = (p as any)[`sellPrice${i}Constant`] || 0;
      }
      rows.push(row1);

      // Row 2 (Tier 2) - if tiered
      if (p.isTieredPricing && (p.tier2DeliveredVolume || 0) > 0) {
        const row2: any = {
            'Strategy Name': `${p.strategyName}t`,
            'Buyer': p.buyer,
            'Delivery Date': p.deliveryDate,
            'Delivered Volume': p.tier2DeliveredVolume,
            'Sell Formula': p.tier2SellFormula || p.sellFormula,
            'Sell Price Overall Constant': p.tier2SellPriceOverallConstant || 0
        };
        for (let i = 1; i <= 3; i++) {
            row2[`Sell Price ${i} Weightage`] = (p as any)[`tier2SellPrice${i}Weightage`] || 0;
            row2[`Sell Price ${i} slope`] = (p as any)[`tier2SellPrice${i}Slope`] || 0;
            row2[`Sell Price Index ${i}`] = (p as any)[`tier2SellPriceIndex${i}`] || '';
            row2[`Sell Price ${i} Month Definition`] = (p as any)[`tier2SellPrice${i}MonthDef`] || '';
            row2[`Sell Price ${i} constant`] = (p as any)[`tier2SellPrice${i}Constant`] || 0;
        }
        rows.push(row2);
      }
      return rows;
    });

    const costData = filtered.map(p => ({
      'Strategy Name': p.strategyName,
      'Incoterm': p.incoterms,
      'SRC': p.reconciledSrcCost || 0
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(purchaseData), 'Purchase');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesData), 'Sales');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(costData), 'Cost');
    
    const fileName = `Jarvis_Export_${exportYear}_${exportGroup}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success(`Exported ${filtered.length} strategies to Jarvis format.`);
    setIsExportPopoverOpen(false);
  };

  const handleSort = (key: string) => {
    setSortConfig((prev: any) => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const toggleSelectAll = useCallback(() => {
    const allVisibleSelected = processedProfiles.every((p: CargoProfile) => selectedIds.has(p.id));
    if (allVisibleSelected && processedProfiles.length > 0) {
      setSelectedIds((prev: Set<string>) => {
        const next = new Set(prev);
        processedProfiles.forEach((p: CargoProfile) => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedIds((prev: Set<string>) => {
        const next = new Set(prev);
        processedProfiles.forEach((p: CargoProfile) => next.add(p.id));
        return next;
      });
    }
  }, [processedProfiles, selectedIds]);

  const isAllVisibleSelected = processedProfiles.length > 0 && processedProfiles.every((p: CargoProfile) => selectedIds.has(p.id));
  const isSomeVisibleSelected = processedProfiles.some((p: CargoProfile) => selectedIds.has(p.id)) && !isAllVisibleSelected;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-4 lg:px-6 py-3 border-b border-slate-200 flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <div className="flex bg-slate-100 p-1 rounded-lg">
                {(['table', 'map', 'calendar'] as ViewMode[]).map((mode: ViewMode) => (
                    <button key={mode} onClick={() => setViewMode(mode)} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold rounded-md transition-all capitalize ${viewMode === mode ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{mode}</button>
                ))}
            </div>
            <div className="relative flex-1 sm:w-64">
                <input type="text" placeholder="Search cargo..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20" />
                <svg className="absolute left-3 top-2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 w-full lg:w-auto custom-scrollbar">
            {userRole !== 'viewer' && (
              <>
                <input type="file" accept=".xlsm, .xlsx" multiple onChange={handleJarvisImport} className="hidden" ref={fileInputRef} />
                <button onClick={() => fileInputRef.current?.click()} className="whitespace-nowrap text-[10px] sm:text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-colors flex items-center gap-2 shadow-sm">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    Import Jarvis
                </button>
              </>
            )}
            <div className="relative">
                <button 
                    onClick={() => setIsExportPopoverOpen(!isExportPopoverOpen)} 
                    className={`whitespace-nowrap text-[10px] sm:text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-2 shadow-sm ${isExportPopoverOpen ? 'bg-indigo-600 text-white border-indigo-600' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'}`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Export Jarvis
                </button>

                <AnimatePresence>
                    {isExportPopoverOpen && (
                        <motion.div 
                            ref={exportPopoverRef}
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 shadow-2xl rounded-xl p-5 z-[100] text-slate-700"
                        >
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Export Configuration</h4>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Portfolio Year</label>
                                    <select value={exportYear} onChange={(e) => setExportYear(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium p-2 focus:ring-2 focus:ring-indigo-500/20">
                                        {availableExportYears.map((y: string) => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Portfolio Group</label>
                                    <select value={exportGroup} onChange={(e) => setExportGroup(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium p-2 focus:ring-2 focus:ring-indigo-500/20">
                                        {availableExportGroups.map((g: string) => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>
                                <div className="pt-2">
                                    <button onClick={handleJarvisExport} className="w-full py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                        Generate XLSM
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative bg-slate-50/30">
        <AnimatePresence mode="wait">
            {viewMode === 'table' ? (
                <>
                  <div className="hidden lg:block h-full overflow-auto custom-scrollbar">
                      <div className="min-w-max relative h-full">
                          <div className="sticky top-0 bg-white z-40 border-b-2 border-slate-200 flex shadow-sm">
                              <div className="px-4 py-3 bg-slate-50 border-r border-slate-200 flex items-center w-12 shrink-0">
                                  <input type="checkbox" className="rounded border-slate-300 text-indigo-600 cursor-pointer" checked={isAllVisibleSelected} ref={el => { if (el) el.indeterminate = isSomeVisibleSelected; }} onChange={toggleSelectAll} />
                              </div>
                              {headerKeys.map((header: string, idx: number) => {
                                  const isStrat = header === 'strategyName';
                                  const isSorted = sortConfig.key === header;
                                  const hasActiveFilter = (activeFilters[header]?.size ?? 0) > 0;
                                  return (
                                      <div key={header} className={`px-4 py-3 bg-slate-50 border-r border-slate-100 flex items-center justify-between gap-2 relative shrink-0 ${isStrat ? 'sticky left-12 z-50 bg-slate-100 border-r-2 border-slate-200' : ''}`} style={{ width: isStrat ? STRATEGY_COL_WIDTH : COLUMN_WIDTH }}>
                                          <span className={`font-bold truncate uppercase tracking-tight text-[10px] ${isSorted ? 'text-indigo-600' : 'text-slate-600'}`}>
                                              {header === 'trmsHedging' ? 'TRMS Hedging' : (header === 'finalTotalPnL' ? 'Physical P&L' : header.replace(/([A-Z])/g, ' $1').trim())}
                                          </span>
                                          {!['purchaseCost', 'salesRevenue', 'trmsHedging'].includes(header) && (
                                              <div className="flex items-center gap-1">
                                                  <button onClick={() => setOpenFilterMenu(header === openFilterMenu ? null : header)} className={`p-1 rounded ${hasActiveFilter ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:bg-slate-200'}`}><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg></button>
                                                  <button onClick={() => handleSort(header)} className={`p-1 rounded ${isSorted ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`}><svg className={`w-3 h-3 transition-transform ${isSorted && sortConfig.direction === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></button>
                                              </div>
                                          )}
                                          <AnimatePresence>
                                              {openFilterMenu === header && (
                                                  <motion.div ref={filterMenuRef} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} className="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 shadow-2xl rounded-xl p-3 z-[100] text-slate-700 font-normal normal-case">
                                                      <div className="space-y-3">
                                                          <input autoFocus type="text" placeholder="Search..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} className="w-full text-[10px] px-2 py-1.5 border border-slate-200 rounded bg-slate-50 focus:ring-1 focus:ring-indigo-500" />
                                                          <div className="max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                                              {isStrat ? (
                                                                  <div className="space-y-1">
                                                                      {Object.keys(filterData.strategyHierarchy).sort().map((group: string) => {
                                                                          const strats = filterData.strategyHierarchy[group].filter((s: string) => s.toLowerCase().includes(filterSearch.toLowerCase()));
                                                                          if (strats.length === 0) return null;
                                                                          const isExp = expandedNodes.has(`filter-strat-${group}`);
                                                                          const currentSet = activeFilters[header] || new Set();
                                                                          const allSel = strats.every((s: string) => currentSet.has(s));
                                                                          const someSel = strats.some((s: string) => currentSet.has(s));
                                                                          return (
                                                                              <div key={group} className="text-[10px]">
                                                                                  <div className="flex items-center gap-2 px-1 py-1 hover:bg-slate-50 rounded">
                                                                                      <button onClick={() => setExpandedNodes((prev: Set<string>) => { const n = new Set(prev); if (n.has(`filter-strat-${group}`)) n.delete(`filter-strat-${group}`); else n.add(`filter-strat-${group}`); return n; })} className="p-0.5 hover:bg-slate-200 rounded text-slate-400"><svg className={`w-3 h-3 transition-transform ${isExp ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                                                                                      <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = someSel && !allSel; }} onChange={() => bulkToggle(header, strats, !allSel)} className="rounded border-slate-300 text-indigo-600 w-3 h-3" />
                                                                                      <span className="font-bold cursor-pointer">{group}</span>
                                                                                  </div>
                                                                                  {isExp && (
                                                                                      <div className="ml-4 border-l border-slate-200 pl-2">
                                                                                          {strats.map((s: string) => (
                                                                                              <label key={s} className="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer">
                                                                                                  <input type="checkbox" checked={currentSet.has(s)} onChange={() => toggleValueFilter(header, s)} className="rounded border-slate-300 text-indigo-600 w-2.5 h-2.5" />
                                                                                                  <span className="text-slate-500 truncate">{s}</span>
                                                                                              </label>
                                                                                          ))}
                                                                                      </div>
                                                                                  )}
                                                                              </div>
                                                                          );
                                                                      })}
                                                                  </div>
                                                              ) : (header === 'deliveryDate' || header === 'loadingDate') ? (
                                                                  <div className="space-y-1">
                                                                      {Object.keys(filterData.dateHierarchies[header]).sort().map((year: string) => {
                                                                          const monthsObj = filterData.dateHierarchies[header][year];
                                                                          const isExpYear = expandedNodes.has(`filter-${header}-${year}`);
                                                                          return (
                                                                              <div key={year} className="text-[10px]">
                                                                                  <div className="flex items-center gap-2 px-1 py-1 hover:bg-slate-50 rounded">
                                                                                      <button onClick={() => setExpandedNodes((prev: Set<string>) => { const n = new Set(prev); if (n.has(`filter-${header}-${year}`)) n.delete(`filter-${header}-${year}`); else n.add(`filter-${header}-${year}`); return n; })} className="p-0.5 hover:bg-slate-200 rounded text-slate-400"><svg className={`w-3 h-3 transition-transform ${isExpYear ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                                                                                      <span className="font-bold">{year}</span>
                                                                                  </div>
                                                                                  {isExpYear && (
                                                                                      <div className="ml-4 border-l border-slate-200 pl-2">
                                                                                          {Object.keys(monthsObj).sort((a,b) => new Date(`${a} 1, 2025`).getMonth() - new Date(`${b} 1, 2025`).getMonth()).map((month: string) => {
                                                                                              const days = Array.from(monthsObj[month] as Set<string>).sort();
                                                                                              const isExpMonth = expandedNodes.has(`filter-${header}-${year}-${month}`);
                                                                                              const currentSet = activeFilters[header] || new Set();
                                                                                              const allSel = days.every((d: string) => currentSet.has(d));
                                                                                              const someSel = days.some((d: string) => currentSet.has(d));
                                                                                              return (
                                                                                                  <div key={month} className="mt-1">
                                                                                                      <div className="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-50 rounded">
                                                                                                          <button onClick={() => setExpandedNodes((prev: Set<string>) => { const n = new Set(prev); if (n.has(`filter-${header}-${year}-${month}`)) n.delete(`filter-${header}-${year}-${month}`); else n.add(`filter-${header}-${year}-${month}`); return n; })} className="p-0.5 hover:bg-slate-200 rounded text-slate-400"><svg className={`w-3 h-3 transition-transform ${isExpMonth ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                                                                                                          <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = someSel && !allSel; }} onChange={() => bulkToggle(header, days, !allSel)} className="rounded border-slate-300 text-indigo-600 w-2.5 h-2.5" />
                                                                                                          <span className="text-slate-600">{month}</span>
                                                                                                      </div>
                                                                                                      {isExpMonth && (
                                                                                                          <div className="ml-4 border-l border-slate-200 pl-2 flex flex-col gap-1 mt-1">
                                                                                                              {days.map((dStr: string) => (
                                                                                                                  <label key={dStr} className="flex items-center gap-2 px-1 hover:bg-slate-50 rounded cursor-pointer"><input type="checkbox" checked={currentSet.has(dStr)} onChange={() => toggleValueFilter(header, dStr)} className="rounded border-slate-300 text-indigo-600 w-2 h-2" /><span className="text-slate-500 font-mono">{dStr.split('-')[2]}</span></label>
                                                                                                              ))}
                                                                                                          </div>
                                                                                                      )}
                                                                                                  </div>
                                                                                              )
                                                                                          })}
                                                                                      </div>
                                                                                  )}
                                                                              </div>
                                                                          );
                                                                      })}
                                                                  </div>
                                                              ) : (
                                                                  filterData.values[header]?.filter((v: any) => String(v).toLowerCase().includes(filterSearch.toLowerCase())).map((v: any) => (
                                                                      <label key={String(v)} className="flex items-center gap-2 px-1 py-1 hover:bg-slate-50 rounded cursor-pointer"><input type="checkbox" checked={(activeFilters[header] as Set<any> | undefined)?.has(v)} onChange={() => toggleValueFilter(header, v)} className="rounded border-slate-300 text-indigo-600 w-3 h-3" /><span className="text-[10px] truncate">{String(v ?? '(Blank)')}</span></label>
                                                                  ))
                                                              )}
                                                          </div>
                                                          <div className="pt-2 border-t border-slate-100 flex justify-end">
                                                              <button onClick={() => { setOpenFilterMenu(null); setFilterSearch(''); }} className="text-[10px] font-bold text-indigo-600 px-3 py-1 bg-indigo-50 rounded-lg hover:bg-indigo-100">Close</button>
                                                          </div>
                                                      </div>
                                                  </motion.div>
                                              )}
                                          </AnimatePresence>
                                      </div>
                                  );
                              })}
                              <div className="px-4 py-3 bg-slate-100 border-l border-slate-200 sticky right-0 z-[60] w-32 shrink-0 font-bold text-[10px] text-slate-600 uppercase text-center shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">Actions</div>
                          </div>
                          <div className="bg-white">
                              {processedProfiles.length === 0 ? (
                                  <div className="p-12 text-center text-slate-500 bg-white border-b border-slate-100 flex flex-col items-center justify-center gap-3">
                                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                      </div>
                                      <div className="font-bold text-slate-700 text-sm">No Cargo Profiles Displayed</div>
                                      <p className="text-xs text-slate-400 max-w-md">
                                          There are no cargoes matching the current portfolio year or active column filters ({profiles.length} total cargoes exist in the system).
                                      </p>
                                      {Object.keys(activeFilters).length > 0 && (
                                          <button onClick={() => setActiveFilters({})} className="mt-2 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors">
                                              Reset Column Filters
                                          </button>
                                      )}
                                  </div>
                              ) : (
                                  processedProfiles.map((p: CargoProfile) => {
                                      const buyPrice = p.absoluteBuyPrice || 0;
                                      const loadVol = p.loadedVolume || 0;
                                      const sellPrice = p.absoluteSellPrice || 0;
                                      const delivVol = p.deliveredVolume || 0;

                                      const purchaseT1 = buyPrice * loadVol;
                                      const purchaseT2 = p.isTieredPricing ? ((p.absoluteTier2BuyPrice || 0) * (p.tier2LoadedVolume || 0)) : 0;
                                      const totalPurchase = purchaseT1 + purchaseT2;

                                      const salesT1 = sellPrice * delivVol;
                                      const salesT2 = p.isTieredPricing ? ((p.absoluteTier2SellPrice || 0) * (p.tier2DeliveredVolume || 0)) : 0;
                                      const totalSales = salesT1 + salesT2;

                                  const srcVal = p.reconciledSrcCost || 0;
                                  
                                  const trmsAgg = trmsData?.trmsAgg[p.strategyName];

                                  return (
                                      <div key={p.id} className="flex border-b border-slate-100 transition-colors hover:bg-indigo-50/30 group">
                                          <div className="px-4 py-3 border-r border-slate-100 w-12 shrink-0 flex items-center bg-white">
                                              <input type="checkbox" checked={selectedIds.has(p.id)} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                                  const next = new Set(selectedIds);
                                                  if (e.target.checked) next.add(p.id); else next.delete(p.id);
                                                  setSelectedIds(next);
                                              }} className="rounded border-slate-300 text-indigo-600 cursor-pointer" />
                                          </div>
                                          
                                          <div className="px-4 py-3 shrink-0 truncate text-[11px] font-bold text-slate-900 border-r-2 border-slate-200 sticky left-12 bg-white group-hover:bg-indigo-50/30 z-30" style={{ width: STRATEGY_COL_WIDTH }}>
                                              {p.strategyName}
                                              {p.isTieredPricing && <span className="ml-2 px-1 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[9px]">2 TIER</span>}
                                          </div>

                                          <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50" style={{ width: COLUMN_WIDTH }}>{p.buyer || '-'}</div>
                                          <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50" style={{ width: COLUMN_WIDTH }}>{p.source || '-'}</div>
                                          <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50" style={{ width: COLUMN_WIDTH }}>{p.deliveryDate || '-'}</div>
                                          <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50" style={{ width: COLUMN_WIDTH }}>{p.loadingDate || '-'}</div>
                                          
                                          <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50 text-right font-mono" style={{ width: COLUMN_WIDTH }}>{formatPrice(p.absoluteBuyPrice, p.buyPriceRounding)}</div>
                                          <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50 text-right font-mono" style={{ width: COLUMN_WIDTH }}>{p.loadedVolume?.toLocaleString()}</div>
                                          
                                          <div className="px-4 py-3 shrink-0 border-r border-slate-50 text-right font-mono flex flex-col justify-center" style={{ width: COLUMN_WIDTH }}>
                                              {p.isTieredPricing && (
                                                  <div className="text-[9px] text-slate-400 font-bold flex flex-col -space-y-1">
                                                      <span>T1: {formatCurrency(purchaseT1)}</span>
                                                      <span>T2: {formatCurrency(purchaseT2)}</span>
                                                  </div>
                                              )}
                                              <span className="text-[11px] font-bold text-slate-700">{formatCurrency(totalPurchase)}</span>
                                          </div>

                                          <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50 text-right font-mono" style={{ width: COLUMN_WIDTH }}>{formatPrice(p.absoluteSellPrice, p.sellPriceRounding)}</div>
                                          <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50 text-right font-mono" style={{ width: COLUMN_WIDTH }}>{p.deliveredVolume?.toLocaleString()}</div>
                                          
                                          <div className="px-4 py-3 shrink-0 border-r border-slate-50 text-right font-mono flex flex-col justify-center" style={{ width: COLUMN_WIDTH }}>
                                              {p.isTieredPricing && (
                                                  <div className="text-[9px] text-slate-400 font-bold flex flex-col -space-y-1">
                                                      <span>T1: {formatCurrency(salesT1)}</span>
                                                      <span>T2: {formatCurrency(salesT2)}</span>
                                                  </div>
                                              )}
                                              <span className="text-[11px] font-bold text-slate-700">{formatCurrency(totalSales)}</span>
                                          </div>

                                          <div className="px-4 py-3 shrink-0 truncate text-[11px] text-slate-600 border-r border-slate-50 text-right font-mono" style={{ width: COLUMN_WIDTH }}>
                                              {formatCurrency(srcVal)}
                                          </div>

                                          <div className="px-4 py-3 shrink-0 border-r border-slate-50 flex flex-col justify-center" style={{ width: COLUMN_WIDTH }}>
                                              {trmsAgg && trmsAgg.hedgingTrades > 0 ? (
                                                  <div className="flex flex-col text-right">
                                                      <span className={`text-[10px] font-bold font-mono ${trmsAgg.hedgingPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(trmsAgg.hedgingPnL)}</span>
                                                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                                                          {trmsAgg.hedgingTrades} Hedges • Non-Additive
                                                      </span>
                                                  </div>
                                              ) : (
                                                  <div className="text-right text-[10px] text-slate-300 italic">No Hedges</div>
                                              )}
                                          </div>

                                          <div className={`px-4 py-3 shrink-0 truncate text-[11px] font-bold border-r border-slate-50 text-right ${p.finalTotalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`} style={{ width: COLUMN_WIDTH }}>{formatCurrency(p.finalTotalPnL)}</div>
                                          <div className="px-4 py-3 shrink-0 text-center border-r border-slate-50" style={{ width: COLUMN_WIDTH }}><span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase ${p.pnlBucket === PnLBucket.Realized ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{p.pnlBucket}</span></div>
                                          
                                          <div className="px-4 py-3 border-l border-slate-100 sticky right-0 z-40 bg-white group-hover:bg-slate-50 w-32 shrink-0 flex items-center justify-center gap-1 shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">
                                              <button onClick={() => onEdit(p)} className={`p-1 ${userRole === 'viewer' ? 'text-slate-400' : 'text-blue-600'} hover:bg-blue-50 rounded`} title={userRole === 'viewer' ? 'View Details' : 'Edit Cargo'}>
                                                {userRole === 'viewer' ? (
                                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                ) : (
                                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                )}
                                              </button>
                                              {userRole !== 'viewer' && (
                                                <button onClick={() => onDelete(p.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded" title="Delete Cargo"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                              )}
                                          </div>
                                      </div>
                                  );
                              }))}
                          </div>
                      </div>
                  </div>

                  <div className="lg:hidden h-full overflow-y-auto p-2 space-y-3 bg-slate-50">
                    {processedProfiles.map((p: CargoProfile) => (
                      <motion.div 
                        key={p.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={() => onEdit(p)}
                        className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3 active:bg-slate-50 transition-colors"
                      >
                        <div className="flex justify-between items-start">
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-slate-800 truncate">{p.strategyName}</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight truncate">{p.source} → {p.buyer}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[8px] uppercase ${p.pnlBucket === PnLBucket.Realized ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                            {p.pnlBucket}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[8px] font-black text-slate-400 uppercase">Volume</p>
                            <p className="text-xs font-mono text-slate-700 font-bold">{p.deliveredVolume?.toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[8px] font-black text-slate-400 uppercase">Physical P&L</p>
                            <p className={`text-sm font-black font-mono ${p.finalTotalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {formatCurrency(p.finalTotalPnL)}
                            </p>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-[10px]">
                          <span className="text-slate-400 font-medium">ETA: {p.deliveryDate || '-'}</span>
                          <div className="flex gap-4">
                            {userRole !== 'viewer' && (
                              <button onClick={(e) => { e.stopPropagation(); onDelete(p.id); }} className="text-rose-500 font-bold uppercase transition-colors hover:text-rose-600">Delete</button>
                            )}
                            <button className="text-blue-600 font-bold uppercase transition-colors hover:text-blue-700">
                              {userRole === 'viewer' ? 'View' : 'Edit'}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    {processedProfiles.length === 0 && (
                      <div className="py-20 text-center text-slate-400 text-sm">No cargo matches found.</div>
                    )}
                  </div>
                </>
            ) : viewMode === 'map' ? (
                <WorldMap profiles={processedProfiles} height="100%" />
            ) : (
                <CalendarView profiles={processedProfiles} onCargoClick={onEdit} />
            )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isJarvisPreviewOpen && (
            <JarvisPreviewModal 
                existingProfiles={profiles}
                parsedRows={pendingJarvisRows}
                onClose={() => setIsJarvisPreviewOpen(false)}
                onImport={handleFinishJarvisImport}
            />
        )}
      </AnimatePresence>
    </div>
  );
};
