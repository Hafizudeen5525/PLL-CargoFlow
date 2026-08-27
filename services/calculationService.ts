
import { CargoProfile, PnLBucket, EmptyCargoProfile, ForwardCurveData, ForwardCurve, ForwardCurvePoint } from '../types';
import { db, handleFirestoreError, FirestoreOperation, auth, isFirebaseConfigured } from '../firebase';
import { doc, setDoc, getDoc, collection, getDocs, deleteDoc, query, orderBy, limit } from 'firebase/firestore';

export interface ForwardCurveRow {
    month: string; // YYYY-MM
    prices: Record<string, number>;
}

export const normalizeStrategyName = (name?: string): string => {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/\s*\(?t[12]?\)?$/i, '')
    .replace(/\s*tier\s*[12]?$/i, '')
    .replace(/t\(/i, '(')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * MARKET INTELLIGENCE (2024-2025 GROUNDED)
 */
export const MARKET_INTELLIGENCE = {
    volatilities: {
        'Dated Brent': 0.018,
        'JCC': 0.016,
        'BRIPE': 0.017,
        'HH': 0.032,
        'HH Last Day': 0.035,
        'TTF': 0.042,
        'NBP': 0.040,
        'JKM': 0.038,
        'AECO': 0.045,
        'STN 2': 0.048,
        'Fix and Firm': 0,
        'Other': 0.030
    } as Record<string, number>,
    
    correlations: {
        'Dated Brent': { 'Dated Brent': 1.0, 'JKM': 0.78, 'TTF': 0.72, 'HH': 0.25, 'JCC': 0.95 },
        'JKM': { 'Dated Brent': 0.78, 'JKM': 1.0, 'TTF': 0.92, 'HH': 0.35 },
        'TTF': { 'Dated Brent': 0.72, 'JKM': 0.92, 'TTF': 1.0, 'HH': 0.38 },
        'HH': { 'Dated Brent': 0.25, 'JKM': 0.35, 'TTF': 0.38, 'HH': 1.0 },
    } as Record<string, Record<string, number>>
};

/**
 * GENERATE 256-DAY HISTORICAL SHOCKS
 */
export function generateHistoricalShocks(days: number = 256): Record<string, number[]> {
    const indices = ['Dated Brent', 'JKM', 'TTF', 'HH'];
    const results: Record<string, number[]> = {};
    indices.forEach((idx: string) => results[idx] = []);

    let seed = 0.12345;
    const rnd = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return (seed / 233280) * 2 - 1;
    };

    for (let d = 0; d < days; d++) {
        const commonShock = rnd();
        indices.forEach((idx: string) => {
            const vol = MARKET_INTELLIGENCE.volatilities[idx] || 0.03;
            const idiosyncratic = rnd();
            const correlationFactor = idx === 'HH' ? 0.3 : 0.85;
            const shock = (commonShock * correlationFactor) + (idiosyncratic * (1 - correlationFactor));
            results[idx].push(shock * vol);
        });
    }

    results['HH Last Day'] = results['HH'];
    results['NBP'] = results['TTF'].map((v: number) => v * 0.95);
    results['JCC'] = results['Dated Brent'].map((v: number) => v * 1.02);
    results['BRIPE'] = results['Dated Brent'];
    results['AECO'] = results['HH'].map((v: number) => v * 1.2);
    results['STN 2'] = results['HH'].map((v: number) => v * 1.3);
    results['Station 2'] = results['STN 2'];
    results['Other'] = results['HH'].map((v: number) => v * 0.5);

    return results;
}

export function getCorrelation(idxA: string, idxB: string): number {
    if (idxA === idxB) return 1.0;
    const a = idxA.includes('Brent') ? 'Dated Brent' : idxA;
    const b = idxB.includes('Brent') ? 'Dated Brent' : idxB;
    return MARKET_INTELLIGENCE.correlations[a]?.[b] || 
           MARKET_INTELLIGENCE.correlations[b]?.[a] || 
           0.4;
}

export interface PricingMetadata {
    weightage: string;
    slope: string;
    index: string;
    monthDef: string;
    constant: string;
    rawText: string;
    componentValue?: number;
    details?: string;
}

export interface DataGap {
    index: string;
    month: string;
    affectedStrategies: string[];
}

const INDEX_ALIASES: Record<string, string> = {
    'DUTCH TTF': 'TTF',
    'TTF': 'TTF',
    'HENRY HUB': 'HH',
    'HH': 'HH',
    'JKM': 'JKM',
    'JAPAN KOREA MARKER': 'JKM',
    'DES JKM': 'JKM',
    'JKM DES': 'JKM',
    'NBP': 'NBP',
    'BRENT': 'Dated Brent',
    'DATED BRENT': 'Dated Brent',
    'BRENT INDEX': 'BRIPE',
    'BRIPE': 'BRIPE',
    'JCC': 'JCC',
    'JAPAN CRUDE COCKTAIL': 'JCC',
    'AECO': 'AECO',
    'WTI': 'WTI',
    'STATION 2': 'STN 2',
    'STATION2': 'STN 2',
    'STN 2': 'STN 2',
    'STN2': 'STN 2',
    'HH LAST DAY': 'HH Last Day',
    'HENRY HUB LAST DAY': 'HH Last Day',
    'FIX AND FIRM': 'Fix and Firm'
};

export function normalizeMonthKey(input: string | Date | number | undefined | null): string {
    if (input === undefined || input === null || input === '') return '';
    if (input instanceof Date) {
        if (isNaN(input.getTime())) return '';
        const y = input.getUTCFullYear();
        const m = String(input.getUTCMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    }
    if (typeof input === 'number') {
        if (input > 20000) {
            const date = new Date(Math.round((input - 25569) * 86400 * 1000));
            const y = date.getUTCFullYear();
            const m = String(date.getUTCMonth() + 1).padStart(2, '0');
            return `${y}-${m}`;
        }
        return String(input);
    }

    const str = String(input).trim();
    if (!str) return '';

    // Match YYYY-MM or YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
    const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.].*)?$/);
    if (isoMatch) {
        const y = parseInt(isoMatch[1], 10);
        const m = String(parseInt(isoMatch[2], 10)).padStart(2, '0');
        return `${y}-${m}`;
    }

    // Match MM/YYYY or MM-YYYY
    const mmYyyyMatch = str.match(/^(\d{1,2})[-/.](\d{4})$/);
    if (mmYyyyMatch) {
        const m = String(parseInt(mmYyyyMatch[1], 10)).padStart(2, '0');
        const y = parseInt(mmYyyyMatch[2], 10);
        return `${y}-${m}`;
    }

    const monthsMap: Record<string, string> = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };

    const monthNameMatch = str.match(/([a-zA-Z]{3,})[-/.\s,]+(\d{2,4})|(\d{2,4})[-/.\s,]+([a-zA-Z]{3,})/);
    if (monthNameMatch) {
        const mStr = (monthNameMatch[1] || monthNameMatch[4] || '').toLowerCase().slice(0, 3);
        const yStr = monthNameMatch[2] || monthNameMatch[3] || '';
        if (monthsMap[mStr] && yStr) {
            let y = parseInt(yStr, 10);
            if (y < 100) y += 2000;
            return `${y}-${monthsMap[mStr]}`;
        }
    }

    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    }

    return str;
}

export function getPriceForIndex(prices: Record<string, number> | undefined, requestedIndex: string): number {
    if (!prices) return 0;
    
    // 1. Exact match
    if (prices[requestedIndex] !== undefined && typeof prices[requestedIndex] === 'number' && prices[requestedIndex] > 0) {
        return prices[requestedIndex];
    }

    const cleanReq = requestedIndex.trim();
    const reqUpper = cleanReq.toUpperCase();
    const canonicalReq = INDEX_ALIASES[reqUpper] || cleanReq;
    const canonicalReqUpper = canonicalReq.toUpperCase();

    // 2. Canonicalized match across all price keys
    for (const [key, val] of Object.entries(prices)) {
        if (typeof val !== 'number' || isNaN(val) || val <= 0) continue;
        const keyUpper = key.trim().toUpperCase();
        const keyCanonical = (INDEX_ALIASES[keyUpper] || keyUpper).toUpperCase();

        if (keyUpper === reqUpper || keyCanonical === canonicalReqUpper) {
            return val;
        }
    }

    // 3. Substring / fuzzy match
    for (const [key, val] of Object.entries(prices)) {
        if (typeof val !== 'number' || isNaN(val) || val <= 0) continue;
        const keyUpper = key.trim().toUpperCase();

        if (
            (canonicalReqUpper === 'HH' && (keyUpper.includes('HH') || keyUpper.includes('HENRY'))) ||
            (canonicalReqUpper === 'TTF' && (keyUpper.includes('TTF') || keyUpper.includes('DUTCH'))) ||
            (canonicalReqUpper === 'JKM' && keyUpper.includes('JKM')) ||
            (canonicalReqUpper === 'DATED BRENT' && keyUpper.includes('BRENT')) ||
            (canonicalReqUpper === 'NBP' && keyUpper.includes('NBP')) ||
            (canonicalReqUpper === 'JCC' && keyUpper.includes('JCC')) ||
            (canonicalReqUpper === 'BRIPE' && keyUpper.includes('BRIPE')) ||
            (canonicalReqUpper === 'STN 2' && (keyUpper.includes('STATION') || keyUpper.includes('STN'))) ||
            (canonicalReqUpper === 'AECO' && keyUpper.includes('AECO'))
        ) {
            return val;
        }
    }

    if (canonicalReqUpper === 'HH LAST DAY' || reqUpper.includes('LAST DAY')) {
        return getPriceForIndex(prices, 'HH');
    }

    return 0;
}

const STORAGE_KEY_CURVES = 'forward_curves_data';
const STORAGE_KEY_HISTORICAL = 'historical_market_data';

export const STORAGE_KEY_SN_GROUP_OVERRIDES = 'sn_group_overrides';
export const STORAGE_KEY_CUSTOM_GROUPS = 'custom_portfolio_groups';

export const DEFAULT_GROUPS = ['PL9SB', 'FLNG1', 'FLNG2', 'LNGC', 'Spot', 'Cheniere', 'CarvedOut'];
export const GROUPS = ['PL9SB', 'FLNG1', 'FLNG2', 'LNGC', 'Spot', 'Cheniere', 'CarvedOut'];

/**
 * Parses Jarvis Excel file name to automatically extract:
 * 1. Portfolio Year (e.g. 2026, 2027, 2028)
 * 2. Portfolio Strategy Group (e.g. CarvedOut, PL9SB, LNGC, FLNG2, FLNG1, Cheniere, Spot)
 * 
 * Example file names:
 * - 2026_JARVISv3_CarvedOut_19082026 -> Year: '2026', Group: 'CarvedOut'
 * - 2026_JARVISv3_Train9_19082026    -> Year: '2026', Group: 'PL9SB'
 * - 2026_JARVISv2_LNGC_19082026      -> Year: '2026', Group: 'LNGC'
 * - 2027_JARVISv3_PFLNG2_19082026    -> Year: '2027', Group: 'FLNG2'
 */
export function parseJarvisFilename(fileName: string): { portfolioYear: string; groupName: string } {
    if (!fileName) return { portfolioYear: 'Unassigned', groupName: 'Unassigned' };
    
    const cleanName = fileName.replace(/\.[^/.]+$/, ''); // Remove extension
    
    // Extract Year (e.g. starts with 2026 or has 2026/2027/2028 as token)
    const yearMatch = cleanName.match(/(?:^|[_\s-])(20\d{2})(?:[_\s-]|$)/i) || cleanName.match(/(20\d{2})/);
    const portfolioYear = yearMatch ? yearMatch[1] : 'Unassigned';

    // Extract Group
    const upper = cleanName.toUpperCase();
    let groupName = 'Unassigned';
    
    if (upper.includes('CARVEDOUT') || upper.includes('CARVED_OUT') || upper.includes('CARVED OUT')) {
        groupName = 'CarvedOut';
    } else if (upper.includes('TRAIN9') || upper.includes('TRAIN 9') || upper.includes('TRAIN_9') || upper.includes('PL9SB') || upper.includes('PL9') || upper.includes('T9')) {
        groupName = 'PL9SB';
    } else if (upper.includes('PFLNG1') || upper.includes('FLNG1')) {
        groupName = 'FLNG1';
    } else if (upper.includes('PFLNG2') || upper.includes('FLNG2')) {
        groupName = 'FLNG2';
    } else if (upper.includes('LNGC')) {
        groupName = 'LNGC';
    } else if (upper.includes('CHENIERE') || upper.includes('SPL') || upper.includes('CCL')) {
        groupName = 'Cheniere';
    } else if (upper.includes('SPOT')) {
        groupName = 'Spot';
    }

    return { portfolioYear, groupName };
}

export function getCustomGroups(): string[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY_CUSTOM_GROUPS);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (e) {
        console.error('Error reading custom groups:', e);
    }
    return DEFAULT_GROUPS;
}

export function saveCustomGroups(groups: string[]): void {
    try {
        localStorage.setItem(STORAGE_KEY_CUSTOM_GROUPS, JSON.stringify(groups));
        window.dispatchEvent(new Event('sn_groups_updated'));
    } catch (e) {
        console.error('Error saving custom groups:', e);
    }
}

export function getSnGroupOverrides(): Record<string, string> {
    try {
        const stored = localStorage.getItem(STORAGE_KEY_SN_GROUP_OVERRIDES);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.error('Error reading SN group overrides:', e);
    }
    return {};
}

export function saveSnGroupOverrides(overrides: Record<string, string>): void {
    try {
        localStorage.setItem(STORAGE_KEY_SN_GROUP_OVERRIDES, JSON.stringify(overrides));
        window.dispatchEvent(new Event('sn_groups_updated'));
    } catch (e) {
        console.error('Error saving SN group overrides:', e);
    }
}

export function normalizeSnKey(sn: string): string {
    return String(sn || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function getGroupName(strategyName: string = '', explicitGroup?: string): string {
    // If explicitly assigned group is valid, prioritize it
    if (explicitGroup && explicitGroup.trim() !== '' && explicitGroup !== 'Unassigned') {
        const eg = explicitGroup.trim();
        if (eg.toUpperCase().includes('CARVEDOUT') || eg.toUpperCase().includes('CARVED OUT')) return 'CarvedOut';
        if (eg.toUpperCase().includes('TRAIN9') || eg.toUpperCase().includes('PL9SB')) return 'PL9SB';
        if (eg.toUpperCase().includes('PFLNG1') || eg.toUpperCase().includes('FLNG1')) return 'FLNG1';
        if (eg.toUpperCase().includes('PFLNG2') || eg.toUpperCase().includes('FLNG2')) return 'FLNG2';
        return eg;
    }

    if (!strategyName) return 'Others';
    const cleanSn = String(strategyName).trim();
    const overrides = getSnGroupOverrides();
    
    // Check exact raw match or normalized key match
    if (overrides[cleanSn]) {
        return overrides[cleanSn];
    }
    const normKey = normalizeSnKey(cleanSn);
    if (overrides[normKey]) {
        return overrides[normKey];
    }

    const sn = cleanSn.toUpperCase();
    if (sn.includes('CARVEDOUT') || sn.includes('CARVED_OUT') || sn.includes('CARVED OUT')) return 'CarvedOut';
    if (sn.includes('PL9SB') || sn.includes('TRAIN9') || sn.includes('TRAIN 9') || sn.includes('PL9')) return 'PL9SB';
    if (sn.includes('FLNG1') || sn.includes('PFLNG1')) return 'FLNG1';
    if (sn.includes('FLNG2') || sn.includes('PFLNG2')) return 'FLNG2';
    if (sn.includes('LNGC')) return 'LNGC';
    if (sn.includes('SPOT')) return 'Spot';
    if (sn.includes('CHENIERE') || sn.includes('SPL') || sn.includes('CCL')) return 'Cheniere';

    return 'Others';
}

/**
 * SHARED FIXATION & BUSINESS DAY LOGIC
 */

export const isBusinessDay = (date: Date, holidayMap?: Record<string, string>): boolean => {
    const holidays = holidayMap 
        ? Object.keys(holidayMap)
        : (() => {
            const holidaysRaw = localStorage.getItem('exposure_holidays_named');
            return holidaysRaw ? Object.keys(JSON.parse(holidaysRaw)) : [];
        })();
    
    const day = date.getUTCDay();
    if (day === 0 || day === 6) return false;
    
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dayOfMonth = String(date.getUTCDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${dayOfMonth}`;
    
    return !holidays.includes(dateStr);
};

export const getOffsetBusinessDay = (baseDate: Date, offset: number, holidayMap?: Record<string, string>): Date => {
    const d = new Date(baseDate);
    let count = 0;
    const step = offset > 0 ? 1 : -1;
    const target = Math.abs(offset);
    while (count < target) {
        d.setUTCDate(d.getUTCDate() + step);
        if (isBusinessDay(d, holidayMap)) count++;
    }
    return d;
};

const getLastBusinessDayOfMonth = (year: number, month: number, holidayMap?: Record<string, string>): Date => {
    const d = new Date(Date.UTC(year, month + 1, 0));
    while (!isBusinessDay(d, holidayMap)) {
        d.setUTCDate(d.getUTCDate() - 1);
    }
    return d;
};

export const getFixationDate = (index: string, pricingMonthStr: string, holidayMap?: Record<string, string>): Date => {
    const [y, m] = pricingMonthStr.split('-').map(Number);
    const pricingMonthIndex = m - 1;
    const idx = index.toUpperCase();
    
    if (['BRIPE', 'JCC', 'DATED BRENT', 'BRENT'].includes(idx)) {
        return getLastBusinessDayOfMonth(y, pricingMonthIndex, holidayMap);
    }
    
    if (['HH', 'HH LAST DAY', 'AECO', 'STN 2', 'STATION 2'].includes(idx)) {
        return getOffsetBusinessDay(new Date(Date.UTC(y, pricingMonthIndex, 1)), -3, holidayMap);
    }
    
    // TTF Expiry: Two UK business days before the first day of the delivery month
    if (['NBP', 'TTF'].includes(idx)) {
        return getOffsetBusinessDay(new Date(Date.UTC(y, pricingMonthIndex, 1)), -2, holidayMap);
    }
    
    if (idx === 'JKM') {
        const d = new Date(Date.UTC(y, pricingMonthIndex - 1, 15));
        while (!isBusinessDay(d, holidayMap)) {
            d.setUTCDate(d.getUTCDate() - 1);
        }
        return d;
    }
    
    return new Date(Date.UTC(y, pricingMonthIndex, 1));
};

export function normalizeMonthDef(def?: string | number): string {
    if (def === undefined || def === null || def === '') return 'n';
    const str = String(def).trim();
    if (!str) return 'n';
    
    // Match 3-tuple like 6,0,1 or (6,0,1) or 6, 0, 1 or (6, 0, 1)
    const avgMatch = str.match(/\(?\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)?/);
    if (avgMatch) {
        return `(${avgMatch[1]},${avgMatch[2]},${avgMatch[3]})`;
    }

    const lower = str.toLowerCase();
    if (lower === 'none') return 'None';
    if (lower === 'n' || lower === 'm') return 'n';
    if (lower.startsWith('n-') || lower.startsWith('n+')) return lower;
    if (lower.startsWith('m-') || lower.startsWith('m+')) return `n${lower.slice(1)}`;

    return str;
}

export const getPricingMonths = (refDateStr: string | undefined, monthDef: string = 'n'): string[] => {
    if (!refDateStr) return [];
    const base = new Date(refDateStr);
    const d = new Date(base.getFullYear(), base.getMonth(), 15);
    const results: string[] = [];
    const cleanDef = (monthDef || 'n').toLowerCase().replace(/\s/g, '');
    
    if (cleanDef === 'none') {
        results.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        return results;
    }
    
    const avgMatch = cleanDef.match(/\(?(\d+),(\d+),(\d+)\)?/);
    if (avgMatch) {
        const count = parseInt(avgMatch[1], 10);
        const lag = parseInt(avgMatch[2], 10);
        const step = parseInt(avgMatch[3], 10) || 1;
        for (let i = 0; i < count; i++) {
            const t = new Date(d.getFullYear(), d.getMonth() - 1 - lag - (i * step), 15);
            results.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`);
        }
    } else {
        let offset = 0;
        if (cleanDef.includes('n-')) offset = -parseInt(cleanDef.split('n-')[1] || '0');
        else if (cleanDef.includes('n+')) offset = parseInt(cleanDef.split('n+')[1] || '0');
        const t = new Date(d.getFullYear(), d.getMonth() + offset, 15);
        results.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`);
    }
    return results;
};

/**
 * NEW: Calculate Exposure Decay based on actual Business Days in the month.
 * Handles 28, 30, and 31 day months precisely.
 */
export const getExposureMultiplier = (index: string, pricingMonthStr: string, simDate: number, holidays: Record<string, string>): number => {
    const fixD = getFixationDate(index, pricingMonthStr, holidays);
    const fixTs = fixD.getTime();
    
    // 1. If we are past the fixation date, it's 100% fixed (0% floating)
    if (simDate >= fixTs) return 0;
    
    // 2. Henry Hub Last Day is binary: 100% floating until the day of settlement.
    if (index === 'HH Last Day') return 1;

    // 3. For averages, calculate based on business days in the pricing period.
    // Standard logic: The month containing the fixation date is the pricing window.
    const startOfMonth = new Date(Date.UTC(fixD.getUTCFullYear(), fixD.getUTCMonth(), 1));
    const endOfMonth = new Date(Date.UTC(fixD.getUTCFullYear(), fixD.getUTCMonth() + 1, 0));

    let totalBusDays = 0;
    let busDaysRemaining = 0;
    
    const curr = new Date(startOfMonth);
    while (curr <= endOfMonth) {
        if (isBusinessDay(curr, holidays)) {
            totalBusDays++;
            // We count days that haven't happened yet (inclusive of today if market is open)
            if (curr.getTime() >= simDate) {
                busDaysRemaining++;
            }
        }
        curr.setUTCDate(curr.getUTCDate() + 1);
    }

    // Fallback if month has no business days (shouldn't happen)
    if (totalBusDays === 0) return 1;
    
    return busDaysRemaining / totalBusDays;
};

export const getIndexType = (formula: string): string => {
    const f = (formula || '').toUpperCase();
    if (f.includes('HH LAST DAY')) return 'HH Last Day';
    if (f.includes('HH')) return 'HH';
    if (f.includes('TTF')) return 'TTF';
    if (f.includes('NBP')) return 'NBP';
    if (f.includes('JKM')) return 'JKM';
    if (f.includes('BRENT') || f.includes('DATED')) return 'Dated Brent';
    if (f.includes('JCC')) return 'JCC';
    if (f.includes('BRIPE')) return 'BRIPE';
    if (f.includes('AECO')) return 'AECO';
    if (f.includes('STN 2') || f.includes('STATION 2')) return 'STN 2';
    return 'Other';
};

function toMonthKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

const priceLookupCache = new Map<string, { price: number, details: string, monthUsed: string }>();

export function clearPriceCache(): void {
    priceLookupCache.clear();
}

export function getIndexPrice(index: string, refDateStr: string, monthDef: string, curveDate?: string): { price: number, details: string, monthUsed: string } {
    const cacheKey = `${index}-${refDateStr}-${monthDef}-${curveDate || 'latest'}`;
    if (priceLookupCache.has(cacheKey)) {
        return priceLookupCache.get(cacheKey)!;
    }
    
    const result = getIndexPriceInternal(index, refDateStr, monthDef, curveDate);
    
    // Safety check to clear cache occasionally
    if (priceLookupCache.size > 1000) priceLookupCache.clear();
    priceLookupCache.set(cacheKey, result);
    
    return result;
}

function getIndexPriceInternal(index: string, refDateStr: string, monthDef: string, curveDate?: string): { price: number, details: string, monthUsed: string } {
    if (index === 'Fix and Firm') return { price: 0, details: 'Fixed Price', monthUsed: '' };
    const curve = getForwardCurveSync(curveDate);
    const historical = getHistoricalCurveSync();
    
    if (!index) return { price: 0, details: 'Missing Index', monthUsed: '' };
    
    const effectiveRefDate = refDateStr || curveDate || new Date().toISOString().split('T')[0];
    const baseMonthKey = normalizeMonthKey(effectiveRefDate);
    if (!baseMonthKey || !baseMonthKey.includes('-')) return { price: 0, details: 'Invalid Ref Date', monthUsed: '' };
    
    const [yStr, mStr] = baseMonthKey.split('-');
    const baseYear = parseInt(yStr, 10);
    const baseMonth0 = parseInt(mStr, 10) - 1; // 0-indexed month
    
    const targetMonths: string[] = [];
    const label = monthDef || 'n';
    const cleanDef = (monthDef || 'n').toLowerCase().replace(/\s/g, '');

    if (cleanDef === 'none') {
        targetMonths.push(`${baseYear}-${String(baseMonth0 + 1).padStart(2, '0')}`);
    } else {
        const avgMatch = cleanDef.match(/\(?(\d+),(\d+),(\d+)\)?/);
        if (avgMatch) {
            const count = parseInt(avgMatch[1], 10);
            const lag = parseInt(avgMatch[2], 10);
            const step = parseInt(avgMatch[3], 10) || 1;
            for (let i = 0; i < count; i++) {
                const date = new Date(Date.UTC(baseYear, baseMonth0 - 1 - lag - (i * step), 15));
                const y = date.getUTCFullYear();
                const m = String(date.getUTCMonth() + 1).padStart(2, '0');
                targetMonths.push(`${y}-${m}`);
            }
        } else {
            let offset = 0;
            if (cleanDef.includes('n-')) {
                const val = cleanDef.split('n-')[1];
                offset = -parseInt(val || '0', 10);
            } else if (cleanDef.includes('n+')) {
                const val = cleanDef.split('n+')[1];
                offset = parseInt(val || '0', 10);
            } else if (cleanDef === 'n') {
                offset = 0;
            }
            
            const date = new Date(Date.UTC(baseYear, baseMonth0 + offset, 15));
            const y = date.getUTCFullYear();
            const m = String(date.getUTCMonth() + 1).padStart(2, '0');
            targetMonths.push(`${y}-${m}`);
        }
    }

    let total = 0;
    let foundCount = 0;
    const priceDetails: string[] = [];
    const canonicalIndex = INDEX_ALIASES[index.toUpperCase()] || index;

    targetMonths.forEach((m: string) => {
        const normTarget = normalizeMonthKey(m);
        let p = 0;
        
        const histRow = historical.find((r: ForwardCurveRow) => normalizeMonthKey(r.month) === normTarget);
        const curveRow = curve.find((r: ForwardCurveRow) => normalizeMonthKey(r.month) === normTarget);
        
        // Prioritize Forward Curve over Historical Curve:
        // If forward curve has a value (> 0), use forward curve.
        // If forward curve is 0 or empty, then use historical curve.
        p = getPriceForIndex(curveRow?.prices, canonicalIndex);
        if (p === 0) p = getPriceForIndex(histRow?.prices, canonicalIndex);

        if (p > 0) {
            total += p;
            foundCount++;
            priceDetails.push(`${m}:$${p.toFixed(2)}`);
        }
    });

    const finalPrice = foundCount > 0 ? total / foundCount : 0;
    return {
        price: finalPrice,
        details: `${label} Avg: ${priceDetails.join(', ')}`,
        monthUsed: targetMonths.join(',')
    };
}

export function calculateLegPrice(p: CargoProfile, type: 'buy' | 'sell' | 'tier2Sell' | 'tier2Buy', curveDate?: string): number {
    const refDate = (type === 'buy' || type === 'tier2Buy') ? p.loadingDate : p.deliveryDate;
    const prefix = type;

    const formulaMap: Record<string, string> = {
        buy: p.buyFormula || '',
        sell: p.sellFormula || '',
        tier2Sell: p.tier2SellFormula || '',
        tier2Buy: p.tier2BuyFormula || ''
    };
    const volMap: Record<string, number> = {
        buy: p.loadedVolume || 0,
        sell: p.deliveredVolume || 0,
        tier2Sell: p.tier2DeliveredVolume || 0,
        tier2Buy: p.tier2LoadedVolume || 0
    };

    const hasFormula = Boolean(formulaMap[type] && formulaMap[type].trim().length > 0);
    const hasComponents = Boolean(
        (p as any)[`${prefix}PriceIndex1`] || 
        ((p as any)[`${prefix}Price1Weightage`] && Number((p as any)[`${prefix}Price1Weightage`]) > 0) || 
        ((p as any)[`${prefix}PriceOverallConstant`] && Number((p as any)[`${prefix}PriceOverallConstant`]) !== 0)
    );

    // If pricing mode is explicitly 'formula', or if formula exists and pricingMode is not 'component'
    if ((p.pricingMode === 'formula' && hasFormula) || (hasFormula && p.pricingMode !== 'component' && !hasComponents)) {
        const evalResult = evaluateFormula(formulaMap[type] || '', refDate, curveDate, volMap[type] || 0);
        if (evalResult !== null && !isNaN(evalResult)) {
            return evalResult;
        }
    }

    if (hasComponents || p.pricingMode === 'component') {
        let totalPrice = 0;
        let anyComponentCalculated = false;
        for (let i = 1; i <= 3; i++) {
            const w = Number((p as any)[`${prefix}Price${i}Weightage`] ?? 0);
            const s = Number((p as any)[`${prefix}Price${i}Slope`] ?? 0);
            const idx = String((p as any)[`${prefix}PriceIndex${i}`] ?? '').trim();
            const mDef = String((p as any)[`${prefix}Price${i}MonthDef`] ?? 'n');
            const c = Number((p as any)[`${prefix}Price${i}Constant`] ?? 0);

            if (idx) {
                const { price } = getIndexPrice(idx, refDate, mDef, curveDate);
                const componentPrice = (s * price) + c;
                totalPrice += w * componentPrice;
                anyComponentCalculated = true;
            } else if (w > 0 && c !== 0) {
                totalPrice += w * c;
                anyComponentCalculated = true;
            }
        }
        const overallC = Number((p as any)[`${prefix}PriceOverallConstant`] ?? 0);
        totalPrice += overallC;
        if (anyComponentCalculated || overallC !== 0 || !hasFormula) {
            return totalPrice;
        }
    }

    if (hasFormula) {
        return evaluateFormula(formulaMap[type] || '', refDate, curveDate, volMap[type] || 0) || 0;
    }

    return 0;
}

export function evaluateFormula(formula: string, dateStr?: string, curveDate?: string, volume: number = 0, unit?: string): number | null {
    if (!formula || typeof formula !== 'string') return null;
    const cleanFormula = formula.trim();
    if (!cleanFormula) return null;

    // Direct numeric literal check: e.g. "12.50" or "$12.50"
    const directNum = parseFloat(cleanFormula.replace(/^\$/, ''));
    if (!isNaN(directNum) && !/[a-zA-Z%]/.test(cleanFormula)) {
        return directNum;
    }

    const effectiveDate = dateStr || curveDate || new Date().toISOString().split('T')[0];

    let expression = cleanFormula
        .replace(/\[/g, '(').replace(/\]/g, ')')
        .replace(/\$/g, '')
        .replace(/(\d+(?:\.\d+)?)\s*%/g, (_, num) => (parseFloat(num) / 100).toString());

    const sortedAliases = Object.keys(INDEX_ALIASES).sort((a: string, b: string) => b.length - a.length);
    for (const alias of sortedAliases) {
        const canonical = INDEX_ALIASES[alias];
        const regex = new RegExp(`\\b${alias.replace(/\s+/g, '\\s+')}\\b(?:\\s*\\(([^)]+)\\))?`, 'gi');
        expression = expression.replace(regex, (match, monthDef) => {
            const { price } = getIndexPrice(canonical, effectiveDate, monthDef || 'n', curveDate);
            return price.toString();
        });
    }

    expression = expression
        .replace(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/g, '$1 * $2')
        .replace(/\)\s*\(/g, ') * (')
        .replace(/(\d+(?:\.\d+)?)\s*\(/g, '$1 * (')
        .replace(/\)\s*(\d+(?:\.\d+)?)/g, ') * $1')
        .replace(/[a-zA-Z]+/g, '0');

    try {
        const result = new Function(`return ${expression}`)();
        return isNaN(result) ? null : Number(result);
    } catch { return null; }
}

export function applyRounding(val: number, decimals: number | undefined): number {
    if (val === undefined || val === null || isNaN(val)) return 0;
    if (decimals === undefined || decimals === null || isNaN(Number(decimals))) return val;
    const dec = Math.max(0, Math.min(8, parseInt(String(decimals), 10)));
    const factor = Math.pow(10, dec);
    return Math.round((val + Number.EPSILON) * factor) / factor;
}

function formatMonthStr(dateStr: string): string {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        const monthShort = d.toLocaleString('en-US', { month: 'short' });
        const yearShort = d.getFullYear().toString().slice(2);
        return `${monthShort}-${yearShort}`;
    } catch { return ''; }
}

/** 
 * REUSABLE FORMATTERS (Performance Optimization)
 * Initializing these once avoids massive lag during render loops.
 */
export const currencyFormatter = new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD', 
    maximumFractionDigits: 0 
});

export const priceFormatter = new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD', 
    minimumFractionDigits: 4, 
    maximumFractionDigits: 4 
});

export const formatCurrency = (val: number) => currencyFormatter.format(val || 0);
export const formatPrice = (val: number, decimals: number = 4) => {
    if (decimals === 4) return priceFormatter.format(val || 0);
    return new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD', 
        minimumFractionDigits: decimals, 
        maximumFractionDigits: decimals 
    }).format(val || 0);
};

export function recalculateProfile(p: Partial<CargoProfile>, useMarket: boolean = true, curveDate?: string): Partial<CargoProfile> {
    const up: CargoProfile = { ...EmptyCargoProfile, ...(p as any), id: (p as any).id || '' };
    
    // Tiered Splitting Logic
    // Sync total volumes if they are missing or if granular tier volumes are provided
    if (up.isTieredPricing) {
        const sumLoaded = (up.loadedVolume || 0) + (up.tier2LoadedVolume || 0);
        const sumDelivered = (up.deliveredVolume || 0) + (up.tier2DeliveredVolume || 0);

        if (!up.totalLoadedVolume || ((up.loadedVolume || 0) > 0 && (up.tier2LoadedVolume || 0) > 0 && up.totalLoadedVolume !== sumLoaded)) {
            up.totalLoadedVolume = sumLoaded;
        }
        if (!up.totalDeliveredVolume || ((up.deliveredVolume || 0) > 0 && (up.tier2DeliveredVolume || 0) > 0 && up.totalDeliveredVolume !== sumDelivered)) {
            up.totalDeliveredVolume = sumDelivered;
        }

        // If tiered but no limit set (e.g. Jarvis import), initialize limit to T1 volume to avoid re-splitting everything into T1
        if (!up.tierLimit && up.loadedVolume && up.loadedVolume > 0) {
            up.tierLimit = up.loadedVolume;
        }
    } else {
        // Not tiered: Total MUST match Tier 1
        if (up.totalLoadedVolume && up.totalLoadedVolume > 0) {
            up.loadedVolume = up.totalLoadedVolume;
        } else if (up.loadedVolume && up.loadedVolume > 0) {
            up.totalLoadedVolume = up.loadedVolume;
        }
        
        if (up.totalDeliveredVolume && up.totalDeliveredVolume > 0) {
            up.deliveredVolume = up.totalDeliveredVolume;
        } else if (up.deliveredVolume && up.deliveredVolume > 0) {
            up.totalDeliveredVolume = up.deliveredVolume;
        }
    }

    if (up.isTieredPricing && (up.tierLimit || 0) > 0) {
        const limit = up.tierLimit || 0;
        const totalL = up.totalLoadedVolume || 0;
        const totalD = up.totalDeliveredVolume || 0;
        
        up.loadedVolume = Math.min(totalL, limit);
        up.tier2LoadedVolume = Math.max(0, totalL - limit);
        
        up.deliveredVolume = Math.min(totalD, limit);
        up.tier2DeliveredVolume = Math.max(0, totalD - limit);
    } else if (up.isTieredPricing && (up.tierLimit || 0) <= 0) {
        // If tiered but no limit, default to everything in T1 for safety 
        up.loadedVolume = up.totalLoadedVolume || 0;
        up.tier2LoadedVolume = 0;
        up.deliveredVolume = up.totalDeliveredVolume || 0;
        up.tier2DeliveredVolume = 0;
    } else {
        // If not tiered, tier 2 volumes should be 0
        up.tier2LoadedVolume = 0;
        up.tier2DeliveredVolume = 0;
        // Tier 1 volume should match Total (already synced above, but enforced here)
        up.loadedVolume = up.totalLoadedVolume || 0;
        up.deliveredVolume = up.totalDeliveredVolume || 0;
    }

    if (useMarket) {
        if (!up.isBuyPriceManual) {
            const rawBuyPrice = calculateLegPrice(up, 'buy', curveDate);
            if (rawBuyPrice > 0 || (up.buyFormula && up.buyFormula.trim() !== '') || (up as any).buyPriceIndex1) {
                up.absoluteBuyPrice = applyRounding(rawBuyPrice, up.buyPriceRounding);
            } else if (up.absoluteBuyPrice !== undefined && up.absoluteBuyPrice !== null) {
                up.absoluteBuyPrice = applyRounding(up.absoluteBuyPrice, up.buyPriceRounding);
            }
        } else if (up.absoluteBuyPrice !== undefined && up.absoluteBuyPrice !== null) {
            up.absoluteBuyPrice = applyRounding(up.absoluteBuyPrice, up.buyPriceRounding);
        }

        if (!up.isSellPriceManual) {
            const rawSellPrice = calculateLegPrice(up, 'sell', curveDate);
            if (rawSellPrice > 0 || (up.sellFormula && up.sellFormula.trim() !== '') || (up as any).sellPriceIndex1) {
                up.absoluteSellPrice = applyRounding(rawSellPrice, up.sellPriceRounding);
            } else if (up.absoluteSellPrice !== undefined && up.absoluteSellPrice !== null) {
                up.absoluteSellPrice = applyRounding(up.absoluteSellPrice, up.sellPriceRounding);
            }
        } else if (up.absoluteSellPrice !== undefined && up.absoluteSellPrice !== null) {
            up.absoluteSellPrice = applyRounding(up.absoluteSellPrice, up.sellPriceRounding);
        }
        
        if (up.isTieredPricing) {
            if (!up.isTier2SellPriceManual) {
                const rawTier2Sell = calculateLegPrice(up, 'tier2Sell', curveDate);
                if (rawTier2Sell > 0 || (up.tier2SellFormula && up.tier2SellFormula.trim() !== '') || (up as any).tier2SellPriceIndex1) {
                    up.absoluteTier2SellPrice = applyRounding(rawTier2Sell, up.tier2SellPriceRounding);
                } else if (up.absoluteTier2SellPrice !== undefined && up.absoluteTier2SellPrice !== null) {
                    up.absoluteTier2SellPrice = applyRounding(up.absoluteTier2SellPrice, up.tier2SellPriceRounding);
                }
            } else if (up.absoluteTier2SellPrice !== undefined && up.absoluteTier2SellPrice !== null) {
                up.absoluteTier2SellPrice = applyRounding(up.absoluteTier2SellPrice, up.tier2SellPriceRounding);
            }

            if (!up.isTier2BuyPriceManual) {
                const rawTier2Buy = calculateLegPrice(up, 'tier2Buy', curveDate);
                if (rawTier2Buy > 0 || (up.tier2BuyFormula && up.tier2BuyFormula.trim() !== '') || (up as any).tier2BuyPriceIndex1) {
                    up.absoluteTier2BuyPrice = applyRounding(rawTier2Buy, up.tier2BuyPriceRounding);
                } else if (up.absoluteTier2BuyPrice !== undefined && up.absoluteTier2BuyPrice !== null) {
                    up.absoluteTier2BuyPrice = applyRounding(up.absoluteTier2BuyPrice, up.tier2BuyPriceRounding);
                }
            } else if (up.absoluteTier2BuyPrice !== undefined && up.absoluteTier2BuyPrice !== null) {
                up.absoluteTier2BuyPrice = applyRounding(up.absoluteTier2BuyPrice, up.tier2BuyPriceRounding);
            }
        }
    }

    up.deliveryMonth = formatMonthStr(up.deliveryDate) || '';
    up.loadingMonth = formatMonthStr(up.loadingDate) || '';

    const t1Revenue = (up.deliveredVolume || 0) * (up.absoluteSellPrice || 0);
    const t2Revenue = up.isTieredPricing ? (up.tier2DeliveredVolume || 0) * (up.absoluteTier2SellPrice || 0) : 0;
    up.salesRevenue = t1Revenue + t2Revenue;
    up.finalSalesRevenueT1 = t1Revenue;
    up.finalSalesRevenueT2 = t2Revenue;
    
    const t1PurchaseCost = (up.loadedVolume || 0) * (up.absoluteBuyPrice || 0);
    const t2PurchaseCost = up.isTieredPricing ? (up.tier2LoadedVolume || 0) * (up.absoluteTier2BuyPrice || 0) : 0;
    const totalPurchaseCost = t1PurchaseCost + t2PurchaseCost;
    up.finalPurchaseCostT1 = t1PurchaseCost;
    up.finalPurchaseCostT2 = t2PurchaseCost;

    const totalDelVol = (up.deliveredVolume || 0) + (up.tier2DeliveredVolume || 0);
    const calcSrcCost = (up.incoterms === 'DES') ? (up.srcUnitFee || 0) * totalDelVol : 0;
    const finalSrcCost = (up.reconciledSrcCost !== undefined && up.reconciledSrcCost !== null && up.reconciledSrcCost !== 0 && !isNaN(Number(up.reconciledSrcCost)))
        ? Number(up.reconciledSrcCost)
        : (up.srcCost || calcSrcCost);
    const finalOtherCost = (up.reconciledOtherCost !== undefined && up.reconciledOtherCost !== null && up.reconciledOtherCost !== 0 && !isNaN(Number(up.reconciledOtherCost)))
        ? Number(up.reconciledOtherCost)
        : ((up.miscCost || 0) + (up.financeCost || 0));
    const totalNonCommodityCosts = finalSrcCost + finalOtherCost;

    const hasRecSales = up.reconciledSalesRevenue !== undefined && up.reconciledSalesRevenue !== null && up.reconciledSalesRevenue !== 0 && !isNaN(Number(up.reconciledSalesRevenue));
    const hasRecPurchase = up.reconciledPurchaseCost !== undefined && up.reconciledPurchaseCost !== null && up.reconciledPurchaseCost !== 0 && !isNaN(Number(up.reconciledPurchaseCost));

    // Dynamic vs Reconciled logic:
    // If formula / unit price / manual price or volume exists, use calculated sales revenue and purchase cost.
    // Reconciled amounts act as a static import baseline when no pricing/formula is set.
    const hasDynamicSales = (up.salesRevenue > 0) || (up.sellFormula && up.sellFormula.trim() !== '') || up.isSellPriceManual || (up.absoluteSellPrice || 0) > 0 || (up as any).sellPriceIndex1;
    up.finalSalesRevenue = (hasDynamicSales && (up.salesRevenue !== 0 || !hasRecSales)) ? up.salesRevenue : (hasRecSales ? Number(up.reconciledSalesRevenue) : up.salesRevenue);

    const hasDynamicPurchase = (totalPurchaseCost > 0) || (up.buyFormula && up.buyFormula.trim() !== '') || up.isBuyPriceManual || (up.absoluteBuyPrice || 0) > 0 || (up as any).buyPriceIndex1;
    const basePurchaseCost = (hasDynamicPurchase && (totalPurchaseCost !== 0 || !hasRecPurchase)) ? totalPurchaseCost : (hasRecPurchase ? Number(up.reconciledPurchaseCost) : totalPurchaseCost);
    
    up.finalTotalCost = basePurchaseCost + totalNonCommodityCosts;

    // Implied Unit Price Fallback:
    // If unit buy or sell price evaluated to 0 (e.g. missing curve or imported lump-sum data without index formulas),
    // derive the implied unit price from total purchase cost / sales revenue so unit prices are populated.
    if (!up.isBuyPriceManual && (!up.absoluteBuyPrice || up.absoluteBuyPrice === 0) && (up.loadedVolume || 0) > 0 && basePurchaseCost !== 0) {
        up.absoluteBuyPrice = applyRounding(basePurchaseCost / up.loadedVolume, up.buyPriceRounding);
        up.finalPurchaseCostT1 = (up.loadedVolume || 0) * up.absoluteBuyPrice;
    }
    if (!up.isSellPriceManual && (!up.absoluteSellPrice || up.absoluteSellPrice === 0) && (up.deliveredVolume || 0) > 0 && up.finalSalesRevenue !== 0) {
        up.absoluteSellPrice = applyRounding(up.finalSalesRevenue / up.deliveredVolume, up.sellPriceRounding);
        up.finalSalesRevenueT1 = (up.deliveredVolume || 0) * up.absoluteSellPrice;
    }

    if (up.isTieredPricing) {
        if (!up.isTier2BuyPriceManual && (!up.absoluteTier2BuyPrice || up.absoluteTier2BuyPrice === 0) && (up.tier2LoadedVolume || 0) > 0 && (up.finalPurchaseCostT2 || 0) !== 0) {
            up.absoluteTier2BuyPrice = applyRounding((up.finalPurchaseCostT2 || 0) / (up.tier2LoadedVolume || 1), up.tier2BuyPriceRounding);
        }
        if (!up.isTier2SellPriceManual && (!up.absoluteTier2SellPrice || up.absoluteTier2SellPrice === 0) && (up.tier2DeliveredVolume || 0) > 0 && (up.finalSalesRevenueT2 || 0) !== 0) {
            up.absoluteTier2SellPrice = applyRounding((up.finalSalesRevenueT2 || 0) / (up.tier2DeliveredVolume || 1), up.tier2SellPriceRounding);
        }
    }

    up.finalPhysicalPnL = up.finalSalesRevenue - up.finalTotalCost;
    up.finalTotalPnL = up.finalPhysicalPnL; 
    
    return up;
}

export function actualizeProfile(p: CargoProfile): CargoProfile {
  return { ...p, pnlBucket: PnLBucket.Realized };
}

export function generateStrategyName(p: Partial<CargoProfile>): string {
  const date = p.deliveryDate || p.loadingDate || new Date().toISOString().split('T')[0];
  const year = date.split('-')[0];
  const src = (p.source || 'UNK').slice(0, 3).toUpperCase();
  const buy = (p.buyer || 'TBD').slice(0, 3).toUpperCase();
  const rand = Math.floor(Math.random() * 900) + 100;
  return `${year}_${src}_${buy}_${rand}`;
}

export function findDataGaps(profiles: CargoProfile[], curveDate?: string): DataGap[] {
    const gaps: Record<string, DataGap> = {};
    profiles.forEach((p: CargoProfile) => {
        if (p.pnlBucket === PnLBucket.Realized) return;
        const checkComponent = (type: 'buy' | 'sell' | 'tier2Sell' | 'tier2Buy', i: number) => {
            const idx = (p as any)[`${type}PriceIndex${i}`];
            const mDef = (p as any)[`${type}Price${i}MonthDef`] || 'n';
            const date = (type === 'buy' || type === 'tier2Buy') ? p.loadingDate : p.deliveryDate;
            if (idx && date && idx !== 'Fix and Firm') {
                const { price, monthUsed } = getIndexPrice(idx, date, mDef, curveDate);
                if (price <= 0) {
                    const months = monthUsed.split(',');
                    months.forEach((m: string) => {
                        const gapKey = `${idx}_${m}`;
                        if (!gaps[gapKey]) gaps[gapKey] = { index: idx, month: m, affectedStrategies: [] };
                        if (!gaps[gapKey].affectedStrategies.includes(p.strategyName)) gaps[gapKey].affectedStrategies.push(p.strategyName);
                    });
                }
            }
        };
        for (let i = 1; i <= 3; i++) {
            checkComponent('buy', i);
            checkComponent('sell', i);
            if (p.isTieredPricing) {
                checkComponent('tier2Sell', i);
                checkComponent('tier2Buy', i);
            }
        }
    });
    return Object.values(gaps).sort((a: DataGap, b: DataGap) => a.month.localeCompare(b.month));
}

const STORAGE_KEY_ACTIVE_CURVE = 'active_forward_curve_date';

const curveCache: Record<string, ForwardCurveRow[]> = (() => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY_CURVES);
        return saved ? JSON.parse(saved) : {};
    } catch {
        return {};
    }
})();

let activeCurveDate: string | null = (() => {
    try {
        return localStorage.getItem(STORAGE_KEY_ACTIVE_CURVE) || null;
    } catch {
        return null;
    }
})();

export function getActiveCurveDate(): string {
    if (activeCurveDate && (curveCache[activeCurveDate] || Object.keys(curveCache).length === 0)) {
        return activeCurveDate;
    }
    // Find the latest date with non-empty curve rows
    const keysWithData = Object.entries(curveCache)
        .filter(([_, rows]) => Array.isArray(rows) && rows.length > 0 && rows.some(r => Object.keys(r.prices || {}).length > 0))
        .map(([k]) => k)
        .sort((a, b) => b.localeCompare(a));
    
    if (keysWithData.length > 0) {
        return keysWithData[0];
    }

    const allKeys = Object.keys(curveCache).sort((a, b) => b.localeCompare(a));
    if (allKeys.length > 0) {
        return allKeys[0];
    }
    return new Date().toISOString().split('T')[0];
}

export function setActiveCurveDate(date: string) {
    if (!date || date === 'Unknown') return;
    if (activeCurveDate === date) return;
    activeCurveDate = date;
    try {
        localStorage.setItem(STORAGE_KEY_ACTIVE_CURVE, date);
    } catch (e) {
        console.warn("Failed saving active curve date to localStorage", e);
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('forwardCurveDateChanged', { detail: { date } }));
    }
}

let historicalCache: ForwardCurveRow[] | null = (() => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY_HISTORICAL);
        return saved ? JSON.parse(saved) : null;
    } catch {
        return null;
    }
})();

export async function getForwardCurve(dateStr?: string): Promise<ForwardCurveRow[]> {
    const targetDate = dateStr || getActiveCurveDate();
    if (!auth.currentUser || !isFirebaseConfigured) {
        if (targetDate && curveCache[targetDate]) return curveCache[targetDate];
        const keys = Object.keys(curveCache).sort((a, b) => b.localeCompare(a));
        return keys.length > 0 ? curveCache[keys[0]] : [];
    }
    try {
        const userId = auth.currentUser.uid;
        if (targetDate) {
            if (curveCache[targetDate]) return curveCache[targetDate];
            const docRef = doc(db, 'users', userId, 'forward_curves', targetDate);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const data = (snap.data().rows || []) as ForwardCurveRow[];
                curveCache[targetDate] = data;
                return data;
            }
            // If specific target date wasn't found in DB, fallback to memory cache
            if (curveCache[targetDate]) return curveCache[targetDate];
        }

        const q = query(collection(db, 'users', userId, 'forward_curves'), orderBy('asOfDate', 'desc'), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const data = (snap.docs[0].data().rows || []) as ForwardCurveRow[];
            const date = snap.docs[0].id;
            curveCache[date] = data;
            return data;
        }
        const fallbackKeys = Object.keys(curveCache).sort((a, b) => b.localeCompare(a));
        return fallbackKeys.length > 0 ? curveCache[fallbackKeys[0]] : [];
    } catch (err) {
        handleFirestoreError(err, FirestoreOperation.GET, 'forward_curves');
        if (targetDate && curveCache[targetDate]) return curveCache[targetDate];
        const fallbackKeys = Object.keys(curveCache).sort((a, b) => b.localeCompare(a));
        return fallbackKeys.length > 0 ? curveCache[fallbackKeys[0]] : [];
    }
}

export async function getHistoricalCurve(): Promise<ForwardCurveRow[]> {
    if (!auth.currentUser || !isFirebaseConfigured) return historicalCache || [];
    if (historicalCache) return historicalCache;
    try {
        const docRef = doc(db, 'users', auth.currentUser.uid, 'market_data', 'historical');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const data = (snap.data().rows || []) as ForwardCurveRow[];
            historicalCache = data;
            return data;
        }
        return [];
    } catch (err) {
        handleFirestoreError(err, FirestoreOperation.GET, 'market_data/historical');
        return [];
    }
}

export async function saveHistoricalCurve(curve: ForwardCurveRow[]) {
    historicalCache = curve;
    priceLookupCache.clear();
    try {
        localStorage.setItem(STORAGE_KEY_HISTORICAL, JSON.stringify(curve));
    } catch (e) {
        console.warn("Failed saving historical curve to localStorage", e);
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('historicalCurveChanged', { detail: { curve } }));
    }
    if (!auth.currentUser || !isFirebaseConfigured) return;
    try {
        const docRef = doc(db, 'users', auth.currentUser.uid, 'market_data', 'historical');
        await setDoc(docRef, { rows: curve, updatedAt: new Date().toISOString() });
    } catch (err) {
        handleFirestoreError(err, FirestoreOperation.WRITE, 'market_data/historical');
    }
}

export async function getAvailableCurveDates(): Promise<string[]> {
    let dates: string[] = [];
    if (!auth.currentUser || !isFirebaseConfigured) {
        dates = Object.keys(curveCache);
    } else {
        try {
            const q = query(collection(db, 'users', auth.currentUser.uid, 'forward_curves'), orderBy('asOfDate', 'desc'));
            const snap = await getDocs(q);
            dates = snap.docs.map(d => d.id);
            if (dates.length === 0) {
                dates = Object.keys(curveCache);
            }
        } catch (err) {
            handleFirestoreError(err, FirestoreOperation.LIST, 'forward_curves');
            dates = Object.keys(curveCache);
        }
    }
    return Array.from(new Set(dates)).sort((a, b) => b.localeCompare(a));
}

export async function saveForwardCurve(date: string, curve: ForwardCurveRow[], makeActive: boolean = true) {
    if (!date || date === 'Unknown') return;
    curveCache[date] = curve;
    priceLookupCache.clear();
    try {
        localStorage.setItem(STORAGE_KEY_CURVES, JSON.stringify(curveCache));
    } catch (e) {
        console.warn("Failed saving forward curve to localStorage", e);
    }
    if (makeActive) {
        setActiveCurveDate(date);
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('forwardCurveSaved', { detail: { date, curve } }));
    }
    if (!auth.currentUser || !isFirebaseConfigured) return;
    try {
        const docRef = doc(db, 'users', auth.currentUser.uid, 'forward_curves', date);
        await setDoc(docRef, { asOfDate: date, rows: curve, userId: auth.currentUser.uid });
    } catch (err) {
        handleFirestoreError(err, FirestoreOperation.WRITE, `forward_curves/${date}`);
    }
}

export async function deleteForwardCurve(date: string) {
    delete curveCache[date];
    if (activeCurveDate === date) {
        const remaining = Object.keys(curveCache).sort((a, b) => b.localeCompare(a));
        setActiveCurveDate(remaining.length > 0 ? remaining[0] : '');
    }
    if (!auth.currentUser || !isFirebaseConfigured) return;
    try {
        const docRef = doc(db, 'users', auth.currentUser.uid, 'forward_curves', date);
        await deleteDoc(docRef);
    } catch (err) {
        handleFirestoreError(err, FirestoreOperation.DELETE, `forward_curves/${date}`);
    }
}

export function getAvailableCurveDatesSync(): string[] {
    return Object.keys(curveCache).sort((a, b) => b.localeCompare(a));
}

export function getForwardCurveSync(dateStr?: string): ForwardCurveRow[] {
    const target = dateStr || getActiveCurveDate();
    if (target && curveCache[target]) return curveCache[target];
    const keys = Object.keys(curveCache).sort((a, b) => b.localeCompare(a));
    return keys.length > 0 ? curveCache[keys[0]] : [];
}

export function getHistoricalCurveSync(): ForwardCurveRow[] {
    return historicalCache || [];
}

export function getPricesSnapshot(d?: string) { return getForwardCurveSync(d)[0]?.prices || {}; }
export function getMarketData() { return getPricesSnapshot(); }

export function getPortfolioYear(p: Partial<CargoProfile> | undefined | null): string {
    if (!p) return 'Unassigned';
    if (p.portfolioYear !== undefined && p.portfolioYear !== null && String(p.portfolioYear).trim() !== '') {
        return String(p.portfolioYear).trim();
    }
    if (p.importFileName) {
        const parsed = parseJarvisFilename(p.importFileName);
        if (parsed.portfolioYear && parsed.portfolioYear !== 'Unassigned') {
            return parsed.portfolioYear;
        }
    }
    if (p.deliveryDate || p.loadingDate) {
        try {
            const d = new Date(p.deliveryDate || p.loadingDate || '');
            if (!isNaN(d.getTime())) return d.getFullYear().toString();
        } catch {
            return 'Unassigned';
        }
    }
    return 'Unassigned';
}

export function detectUnit(f?: string) {
    if (!f) return 'MMBtu';
    const u = f.toUpperCase();
    if (u.includes('BRENT') || u.includes('JCC') || u.includes('BBL')) return 'bbl';
    if (u.includes('MT')) return 'MT';
    return 'MMBtu';
}

export function explainPricing(f: string | undefined, d: string | undefined, curveDate?: string) {
    if (!f || !d) return { pricingMode: 'Error', details: 'Missing data' };
    const price = evaluateFormula(f, d, curveDate);
    
    // Fix and Firm doesn't need a curve, so we don't treat price <= 0 as an error if it's present
    const isFixAndFirm = f.toUpperCase().includes('FIX AND FIRM');
    if (price === null || (price <= 0 && !isFixAndFirm)) return { pricingMode: 'Error', details: 'No valid price found in curve' };
    
    return { pricingMode: 'Calculated', details: isFixAndFirm ? 'Fixed Price' : 'Using Formula/Components' };
}

export function analyzeFormulaStructure(f: string, d?: string, curveDate?: string): { parts: PricingMetadata[], globalConstant: string, warnings: string[] } {
    return { parts: [], globalConstant: '0', warnings: [] };
}

export function getExposureChartData(profiles: CargoProfile[]) {
    const map: Record<string, any> = {};
    const simDate = new Date().getTime();
    
    const holidaysRaw = localStorage.getItem('exposure_holidays_named');
    const holidays = holidaysRaw ? JSON.parse(holidaysRaw) : {};

    profiles.forEach((p: CargoProfile) => {
        if (p.pnlBucket === PnLBucket.Realized) return;

        const processLegExposures = (formula: string | undefined, volume: number, dateStr: string | undefined, isBuy: boolean) => {
            if (!formula || volume <= 0 || !dateStr) return;
            const index = getIndexType(formula);
            const mDef = isBuy ? (p.buyPrice1MonthDef || 'n') : (p.sellPrice1MonthDef || 'n');
            
            // Correctly identify all months where this volume is priced
            const pricingMonths = getPricingMonths(dateStr, mDef);
            const volPerMonth = volume / pricingMonths.length;

            pricingMonths.forEach((mKey: string) => {
                if (!map[mKey]) map[mKey] = { date: mKey, Exposure: 0 };
                const mult = getExposureMultiplier(index, mKey, simDate, holidays);
                // We add/subtract based on sell/buy, but chart usually wants net or gross open.
                // For this chart, we show 'Open Open Risk' (Floating volume)
                map[mKey].Exposure += (volPerMonth * mult);
            });
        };

        // Standard Leg
        processLegExposures(p.sellFormula, p.deliveredVolume || 0, p.deliveryDate, false);
        // Tier 2 Leg
        if (p.isTieredPricing) {
            processLegExposures(p.tier2SellFormula, p.tier2DeliveredVolume || 0, p.deliveryDate, false);
        }
    });

    return Object.values(map).sort((a: any, b: any) => a.date.localeCompare(b.date));
}

export function estimatePricingDate(formula: string, baseDate?: string): string {
    return baseDate || new Date().toISOString().split('T')[0];
}
