
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
 * This creates a synthetic but grounded history of 256 daily returns
 * using Cholesky-like correlations and 2024-2025 benchmark volatilities.
 */
export function generateHistoricalShocks(days: number = 256): Record<string, number[]> {
    const indices = ['Dated Brent', 'JKM', 'TTF', 'HH'];
    const results: Record<string, number[]> = {};
    indices.forEach(idx => results[idx] = []);

    // Simple pseudo-random seed to keep shocks consistent per session
    let seed = 0.12345;
    const rnd = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return (seed / 233280) * 2 - 1;
    };

    for (let d = 0; d < days; d++) {
        // Generate common market factor (correlated move)
        const commonShock = rnd();

        indices.forEach(idx => {
            const vol = MARKET_INTELLIGENCE.volatilities[idx] || 0.03;
            const idiosyncratic = rnd();

            // Correlate based on benchmark (approx 70% common for gas, 30% idiosyncratic)
            // This ensures TTF/JKM move together in the simulation
            const correlationFactor = idx === 'HH' ? 0.3 : 0.85;
            const shock = (commonShock * correlationFactor) + (idiosyncratic * (1 - correlationFactor));

            results[idx].push(shock * vol);
        });
    }

    // Map all potential aliases to ensure no undefined lookups in UI
    results['HH Last Day'] = results['HH'];
    results['NBP'] = results['TTF'].map(v => v * 0.95); // High link to TTF
    results['JCC'] = results['Dated Brent'].map(v => v * 1.02);
    results['BRIPE'] = results['Dated Brent'];
    results['AECO'] = results['HH'].map(v => v * 1.2); // HH Proxy with higher vol
    results['STN 2'] = results['HH'].map(v => v * 1.3); // HH Proxy with higher vol
    results['Station 2'] = results['STN 2'];
    results['Other'] = results['HH'].map(v => v * 0.5);

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

export const isBusinessDay = (date: Date): boolean => {
    const holidaysRaw = localStorage.getItem('exposure_holidays_named');
    const holidays = holidaysRaw ? Object.keys(JSON.parse(holidaysRaw)) : [];

    const day = date.getUTCDay();
    if (day === 0 || day === 6) return false;

    const dateStr = date.toISOString().split('T')[0];
    return !holidays.includes(dateStr);
};

export const getOffsetBusinessDay = (baseDate: Date, offset: number): Date => {
    let d = new Date(baseDate);
    let count = 0;
    const step = offset > 0 ? 1 : -1;
    const target = Math.abs(offset);
    while (count < target) {
        d.setUTCDate(d.getUTCDate() + step);
        if (isBusinessDay(d)) count++;
    }
    return d;
};

const getLastBusinessDayOfMonth = (year: number, month: number): Date => {
    let d = new Date(Date.UTC(year, month + 1, 0));
    while (!isBusinessDay(d)) {
        d.setUTCDate(d.getUTCDate() - 1);
    }
    return d;
};

export const getFixationDate = (index: string, pricingMonthStr: string): Date => {
    const [y, m] = pricingMonthStr.split('-').map(Number);
    const pricingMonthIndex = m - 1;
    const idx = index.toUpperCase();

    if (['BRIPE', 'JCC', 'DATED BRENT', 'BRENT'].includes(idx)) {
        return getLastBusinessDayOfMonth(y, pricingMonthIndex);
    }

    if (['HH', 'HH LAST DAY', 'AECO', 'STN 2', 'STATION 2'].includes(idx)) {
        return getOffsetBusinessDay(new Date(Date.UTC(y, pricingMonthIndex, 1)), -3);
    }

    if (['NBP', 'TTF'].includes(idx)) {
        return getOffsetBusinessDay(new Date(Date.UTC(y, pricingMonthIndex, 1)), -1);
    }

    if (idx === 'JKM') {
        let d = new Date(Date.UTC(y, pricingMonthIndex - 1, 15));
        while (!isBusinessDay(d)) {
            d.setUTCDate(d.getUTCDate() - 1);
        }
        return d;
    }

    return new Date(Date.UTC(y, pricingMonthIndex, 1));
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

    targetMonths.forEach(m => {
        let p = 0;
        const curveRow = curve.find(r => r.month === m);
        const histRow = historical.find(r => r.month === m);

        if (histRow?.prices[canonicalIndex]) {
            p = histRow.prices[canonicalIndex];
        } else if (curveRow?.prices[canonicalIndex]) {
            p = curveRow.prices[canonicalIndex];
        }

        if (p > 0) {
            total += p;
            foundCount++;
            priceDetails.push(`${m}:$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`);
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

    const sortedAliases = Object.keys(INDEX_ALIASES).sort((a, b) => b.length - a.length);
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

    if (up.pnlBucket !== PnLBucket.Realized && useMarket) {
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
    if (up.reconciledSrcCost && up.reconciledSrcCost > 0 && (!up.srcUnitFee || up.srcUnitFee === 0) && totalDelVol > 0) {
        up.srcUnitFee = up.reconciledSrcCost / totalDelVol;
    }

    const calcSrcCost = (up.incoterms === 'DES') ? (up.srcUnitFee || 0) * totalDelVol : 0;
    const finalSrcCost = (up.reconciledSrcCost && up.reconciledSrcCost > 0) ? up.reconciledSrcCost : calcSrcCost;

    up.finalSalesRevenue = (up.reconciledSalesRevenue > 0) ? up.reconciledSalesRevenue : up.salesRevenue;
    const basePurchaseCost = (up.reconciledPurchaseCost > 0) ? up.reconciledPurchaseCost : totalPurchaseCost;
    up.finalTotalCost = basePurchaseCost + finalSrcCost;

    up.finalPhysicalPnL = up.finalSalesRevenue - up.finalTotalCost;

    // DECISION: Exclude Hedges from the reported bottom-line Net P&L.
    // They remain available in totalHedgingPnL for informative display.
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
    profiles.forEach(p => {
        if (p.pnlBucket === PnLBucket.Realized) return;
        const checkComponent = (type: 'buy' | 'sell' | 'tier2Sell' | 'tier2Buy', i: number) => {
            const idx = (p as any)[`${type}PriceIndex${i}`];
            const mDef = (p as any)[`${type}Price${i}MonthDef`] || 'n';
            const date = (type === 'buy' || type === 'tier2Buy') ? p.loadingDate : p.deliveryDate;
            if (idx && date) {
                const { price, monthUsed } = getIndexPrice(idx, date, mDef, curveDate);
                if (price <= 0) {
                    const months = monthUsed.split(',');
                    months.forEach(m => {
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
    return Object.values(gaps).sort((a, b) => a.month.localeCompare(b.month));
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
    profiles.forEach(p => {
        if (p.pnlBucket === PnLBucket.Realized) return;
        const month = (p.deliveryDate || p.loadingDate || '').slice(0, 7);
        if (!month) return;
        if (!map[month]) map[month] = { date: month };
        map[month]['Exposure'] = (map[month]['Exposure'] || 0) + (p.deliveredVolume || 0) + (p.tier2DeliveredVolume || 0);
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

export function estimatePricingDate(formula: string, baseDate?: string): string {
    return baseDate || new Date().toISOString().split('T')[0];
}
