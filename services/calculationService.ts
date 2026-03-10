
import { CargoProfile, PnLBucket, EmptyCargoProfile } from '../types';

export interface ForwardCurveRow {
    month: string; // YYYY-MM
    prices: Record<string, number>;
}

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
    'NBP': 'NBP',
    'BRENT': 'Dated Brent',
    'DATED BRENT': 'Dated Brent',
    'BRIPE': 'BRIPE',
    'JCC': 'JCC',
    'AECO': 'AECO',
    'WTI': 'WTI',
    'STATION 2': 'STN 2',
    'STN 2': 'STN 2',
    'HH LAST DAY': 'HH Last Day',
    'HENRY HUB LAST DAY': 'HH Last Day'
};

const STORAGE_KEY_CURVES = 'forward_curves_data';
const STORAGE_KEY_HISTORICAL = 'historical_market_data';

export const GROUPS = ['PL9SB', 'PFLNG1', 'PFLNG2', 'LNGC', 'Spot', 'Cheniere'];

export function getGroupName(strategyName: string = ''): string {
    const sn = strategyName.toUpperCase();
    for (const group of GROUPS) {
        if (sn.includes(group.toUpperCase())) return group;
    }
    return 'Others';
}

/**
 * SHARED FIXATION & BUSINESS DAY LOGIC
 */

export const isBusinessDay = (date: Date, holidayMap?: Record<string, string>): boolean => {
    let holidays: string[] = [];
    if (holidayMap) {
        holidays = Object.keys(holidayMap);
    } else {
        const holidaysRaw = localStorage.getItem('exposure_holidays_named');
        holidays = holidaysRaw ? Object.keys(JSON.parse(holidaysRaw)) : [];
    }
    
    const day = date.getUTCDay();
    if (day === 0 || day === 6) return false;
    
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dayOfMonth = String(date.getUTCDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${dayOfMonth}`;
    
    return !holidays.includes(dateStr);
};

export const getOffsetBusinessDay = (baseDate: Date, offset: number, holidayMap?: Record<string, string>): Date => {
    let d = new Date(baseDate);
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
    let d = new Date(Date.UTC(year, month + 1, 0));
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
        let d = new Date(Date.UTC(y, pricingMonthIndex - 1, 15));
        while (!isBusinessDay(d, holidayMap)) {
            d.setUTCDate(d.getUTCDate() - 1);
        }
        return d;
    }
    
    return new Date(Date.UTC(y, pricingMonthIndex, 1));
};

export const getPricingMonths = (refDateStr: string | undefined, monthDef: string = 'n'): string[] => {
    if (!refDateStr) return [];
    const base = new Date(refDateStr);
    const d = new Date(base.getFullYear(), base.getMonth(), 15);
    const results: string[] = [];
    const cleanDef = (monthDef || 'n').toLowerCase().replace(/\s/g, '');
    
    const avgMatch = cleanDef.match(/\(?(\d+),(\d+),(\d+)\)?/);
    if (avgMatch) {
        const count = parseInt(avgMatch[1]);
        const lag = parseInt(avgMatch[2]);
        for (let i = 0; i < count; i++) {
            const t = new Date(d.getFullYear(), d.getMonth() - lag - i, 15);
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
    
    let curr = new Date(startOfMonth);
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

export function getIndexPrice(index: string, refDateStr: string, monthDef: string, curveDate?: string): { price: number, details: string, monthUsed: string } {
    const curve = getForwardCurve(curveDate);
    const historical = getHistoricalCurve();
    
    if (!index || !refDateStr) return { price: 0, details: 'Missing Index or Ref Date', monthUsed: '' };
    
    const baseDate = new Date(refDateStr);
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), 15);
    
    const targetMonths: string[] = [];
    let label = monthDef || 'n';
    const cleanDef = (monthDef || 'n').toLowerCase().replace(/\s/g, '');
    
    const avgMatch = cleanDef.match(/\(?(\d+),(\d+),(\d+)\)?/);
    if (avgMatch) {
        const count = parseInt(avgMatch[1]);
        const lag = parseInt(avgMatch[2]);
        for (let i = 1; i <= count; i++) {
            const date = new Date(d.getFullYear(), d.getMonth() - lag - i, 15);
            targetMonths.push(toMonthKey(date));
        }
    } else {
        let offset = 0;
        if (cleanDef.includes('n-')) {
            const val = cleanDef.split('n-')[1];
            offset = -parseInt(val || '0');
        } else if (cleanDef.includes('n+')) {
            const val = cleanDef.split('n+')[1];
            offset = parseInt(val || '0');
        } else if (cleanDef === 'n') {
            offset = 0;
        }
        
        const date = new Date(d.getFullYear(), d.getMonth() + offset, 15);
        targetMonths.push(toMonthKey(date));
    }

    let total = 0;
    let foundCount = 0;
    const priceDetails: string[] = [];
    const canonicalIndex = INDEX_ALIASES[index.toUpperCase()] || index;

    targetMonths.forEach((m: string) => {
        let p = 0;
        const curveRow = curve.find((r: ForwardCurveRow) => r.month === m);
        const histRow = historical.find((r: ForwardCurveRow) => r.month === m);
        
        if (histRow?.prices[canonicalIndex]) {
            p = histRow.prices[canonicalIndex];
        } else if (curveRow?.prices[canonicalIndex]) {
            p = curveRow.prices[canonicalIndex];
        }

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
    const hasComponents = (p as any)[`${prefix}PriceIndex1`] || (p as any)[`${prefix}Price1Weightage`] || (p as any)[`${prefix}PriceOverallConstant`];

    if (hasComponents) {
        let totalPrice = 0;
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
            } else if (w > 0 && c !== 0) {
                totalPrice += w * c;
            }
        }
        const overallC = Number((p as any)[`${prefix}PriceOverallConstant`] ?? 0);
        totalPrice += overallC;
        return totalPrice;
    }

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

    return evaluateFormula(formulaMap[type] || '', refDate, curveDate, volMap[type] || 0) || 0;
}

export function evaluateFormula(formula: string, dateStr?: string, curveDate?: string, volume: number = 0, unit?: string): number | null {
    if (!formula) return null;
    let expression = formula
        .replace(/\[/g, '(').replace(/\]/g, ')')
        .replace(/\$/g, '')
        .replace(/(\d+(?:\.\d+)?)\s*%/g, (_, num) => (parseFloat(num) / 100).toString());

    const sortedAliases = Object.keys(INDEX_ALIASES).sort((a: string, b: string) => b.length - a.length);
    for (const alias of sortedAliases) {
        const canonical = INDEX_ALIASES[alias];
        const regex = new RegExp(`\\b${alias.replace(/\s+/g, '\\s+')}\\b(?:\\s*\\(([^)]+)\\))?`, 'gi');
        expression = expression.replace(regex, (match, monthDef) => {
            const { price } = getIndexPrice(canonical, dateStr || '', monthDef || 'n', curveDate);
            return price.toString();
        });
    }

    expression = expression.replace(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/g, '$1 * $2').replace(/[a-zA-Z]+/g, '0');
    try {
        const result = new Function(`return ${expression}`)();
        return isNaN(result) ? null : result;
    } catch { return null; }
}

function applyRounding(val: number, decimals: number | undefined): number {
    if (decimals === undefined || decimals === null || isNaN(decimals)) return val;
    const factor = Math.pow(10, decimals);
    return Math.round(val * factor) / factor;
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

export function recalculateProfile(p: Partial<CargoProfile>, useMarket: boolean = true, curveDate?: string): Partial<CargoProfile> {
    const up: CargoProfile = { ...EmptyCargoProfile, ...(p as any), id: (p as any).id || '' };
    
    if (useMarket) {
        if (!up.isBuyPriceManual) {
            const rawBuyPrice = calculateLegPrice(up, 'buy', curveDate);
            up.absoluteBuyPrice = applyRounding(rawBuyPrice, up.buyPriceRounding);
        }
        if (!up.isSellPriceManual) {
            const rawSellPrice = calculateLegPrice(up, 'sell', curveDate);
            up.absoluteSellPrice = applyRounding(rawSellPrice, up.sellPriceRounding);
        }
        
        if (up.isTieredPricing) {
            if (!up.isTier2SellPriceManual) {
                const rawTier2Sell = calculateLegPrice(up, 'tier2Sell', curveDate);
                up.absoluteTier2SellPrice = applyRounding(rawTier2Sell, up.tier2SellPriceRounding);
            }
            if (!up.isTier2BuyPriceManual) {
                const rawTier2Buy = calculateLegPrice(up, 'tier2Buy', curveDate);
                up.absoluteTier2BuyPrice = applyRounding(rawTier2Buy, up.tier2BuyPriceRounding);
            }
        }
    }

    up.deliveryMonth = formatMonthStr(up.deliveryDate) || '';
    up.loadingMonth = formatMonthStr(up.loadingDate) || '';

    const t1Revenue = (up.deliveredVolume || 0) * (up.absoluteSellPrice || 0);
    const t2Revenue = up.isTieredPricing ? (up.tier2DeliveredVolume || 0) * (up.absoluteTier2SellPrice || 0) : 0;
    up.salesRevenue = t1Revenue + t2Revenue;
    
    const t1PurchaseCost = (up.loadedVolume || 0) * (up.absoluteBuyPrice || 0);
    const t2PurchaseCost = up.isTieredPricing ? (up.tier2LoadedVolume || 0) * (up.absoluteTier2BuyPrice || 0) : 0;
    const totalPurchaseCost = t1PurchaseCost + t2PurchaseCost;

    const totalDelVol = (up.deliveredVolume || 0) + (up.tier2DeliveredVolume || 0);
    const calcSrcCost = (up.incoterms === 'DES') ? (up.srcUnitFee || 0) * totalDelVol : 0;
    const finalSrcCost = (up.reconciledSrcCost && up.reconciledSrcCost > 0) ? up.reconciledSrcCost : calcSrcCost;

    up.finalSalesRevenue = (up.reconciledSalesRevenue > 0) ? up.reconciledSalesRevenue : up.salesRevenue;
    const basePurchaseCost = (up.reconciledPurchaseCost > 0) ? up.reconciledPurchaseCost : totalPurchaseCost;
    up.finalTotalCost = basePurchaseCost + finalSrcCost;

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
            if (idx && date) {
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

export function getForwardCurve(dateStr?: string): ForwardCurveRow[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_CURVES);
        if (!raw) return [];
        const data = JSON.parse(raw);
        if (dateStr) {
            return data[dateStr] || [];
        }
        const dates = Object.keys(data).sort().reverse();
        return dates.length > 0 ? data[dates[0]] : [];
    } catch { return []; }
}

export function getHistoricalCurve(): ForwardCurveRow[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_HISTORICAL);
        if (!raw) return [];
        return JSON.parse(raw);
    } catch { return []; }
}

export function saveHistoricalCurve(curve: ForwardCurveRow[]) {
    localStorage.setItem(STORAGE_KEY_HISTORICAL, JSON.stringify(curve));
}

export function getAvailableCurveDates(): string[] {
    const raw = localStorage.getItem(STORAGE_KEY_CURVES);
    return raw ? Object.keys(JSON.parse(raw)).sort().reverse() : [];
}

export function saveForwardCurve(date: string, curve: ForwardCurveRow[]) {
    const raw = localStorage.getItem(STORAGE_KEY_CURVES);
    const data = raw ? JSON.parse(raw) : {};
    data[date] = curve;
    localStorage.setItem(STORAGE_KEY_CURVES, JSON.stringify(data));
}

export function deleteForwardCurve(date: string) {
    const raw = localStorage.getItem(STORAGE_KEY_CURVES);
    if (!raw) return;
    const data = JSON.parse(raw);
    delete data[date];
    localStorage.setItem(STORAGE_KEY_CURVES, JSON.stringify(data));
}

export function getPricesSnapshot(d?: string) { return getForwardCurve(d)[0]?.prices || {}; }
export function getMarketData() { return getPricesSnapshot(); }
export function getPortfolioYear(p: CargoProfile) { return new Date(p.deliveryDate || p.loadingDate || Date.now()).getFullYear(); }

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
    if (price === null || price <= 0) return { pricingMode: 'Error', details: 'No valid price found in curve' };
    return { pricingMode: 'Calculated', details: 'Using Formula/Components' };
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
