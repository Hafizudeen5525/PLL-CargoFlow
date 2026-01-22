import { CargoProfile, PnLBucket } from '../types';

export interface ForwardCurveRow {
    month: string; // YYYY-MM
    prices: Record<string, number>;
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
    'HH LAST DAY': 'HH'
};

const STORAGE_KEY_CURVES = 'forward_curves_data';
const STORAGE_KEY_HISTORICAL = 'historical_market_data';

/**
 * Helper to generate a YYYY-MM string from a Date object without timezone shifts
 */
function toMonthKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

/**
 * Gets the price of a specific index for a target month (or average of months)
 */
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

export function calculateLegPrice(p: CargoProfile, type: 'buy' | 'sell', curveDate?: string): number {
    const refDate = type === 'buy' ? p.loadingDate : p.deliveryDate;
    
    const hasComponents = (p as any)[`${type}PriceIndex1`] || (p as any)[`${type}Price1Weightage`];

    if (hasComponents) {
        let totalPrice = 0;
        for (let i = 1; i <= 3; i++) {
            const w = Number((p as any)[`${type}Price${i}Weightage`] ?? 0);
            const s = Number((p as any)[`${type}Price${i}Slope`] ?? 0);
            const idx = String((p as any)[`${type}PriceIndex${i}`] ?? '').trim();
            const mDef = String((p as any)[`${type}Price${i}MonthDef`] ?? 'n');
            const c = Number((p as any)[`${type}Price${i}Constant`] ?? 0);

            if (idx) {
                const { price } = getIndexPrice(idx, refDate, mDef, curveDate);
                const componentPrice = (s * price) + c;
                totalPrice += w * componentPrice;
            } else if (w > 0 && c !== 0) {
                totalPrice += w * c;
            }
        }

        const overallC = Number((p as any)[`${type}PriceOverallConstant`] ?? 0);
        const overallW = Number((p as any)[`${type}PriceOverallConstantWeightage`] ?? 1);
        totalPrice += (overallW * overallC);

        return totalPrice;
    }

    const formula = type === 'buy' ? p.buyFormula : p.sellFormula;
    return evaluateFormula(formula, refDate, curveDate, type === 'buy' ? p.loadedVolume : p.deliveredVolume) || 0;
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

export function recalculateProfile(p: Partial<CargoProfile>, useMarket: boolean = true, curveDate?: string): Partial<CargoProfile> {
    const up = { ...p } as CargoProfile;
    
    if (up.pnlBucket !== PnLBucket.Realized && useMarket) {
        if (!up.isBuyPriceManual) {
            const rawBuyPrice = calculateLegPrice(up, 'buy', curveDate);
            up.absoluteBuyPrice = applyRounding(rawBuyPrice, up.buyPriceRounding);
        }
        if (!up.isSellPriceManual) {
            const rawSellPrice = calculateLegPrice(up, 'sell', curveDate);
            up.absoluteSellPrice = applyRounding(rawSellPrice, up.sellPriceRounding);
        }
    }

    // Calculated Revenue and Cost
    up.salesRevenue = (up.deliveredVolume || 0) * (up.absoluteSellPrice || 0);
    const purchaseCost = (up.loadedVolume || 0) * (up.absoluteBuyPrice || 0);

    // Final values respect manual reconciled overrides if they are non-zero
    up.finalSalesRevenue = (up.reconciledSalesRevenue > 0) ? up.reconciledSalesRevenue : up.salesRevenue;
    up.finalTotalCost = (up.reconciledPurchaseCost > 0) ? up.reconciledPurchaseCost : purchaseCost;

    up.finalPhysicalPnL = up.finalSalesRevenue - up.finalTotalCost;
    up.finalTotalPnL = up.finalPhysicalPnL + (up.totalHedgingPnL || 0);
    
    return up;
}

export function actualizeProfile(p: CargoProfile): CargoProfile {
  return {
    ...p,
    pnlBucket: PnLBucket.Realized
  };
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
        const checkComponent = (type: 'buy' | 'sell', i: number) => {
            const idx = (p as any)[`${type}PriceIndex${i}`];
            const mDef = (p as any)[`${type}Price${i}MonthDef`] || 'n';
            const date = type === 'buy' ? p.loadingDate : p.deliveryDate;
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
        }
    });
    return Object.values(gaps).sort((a, b) => a.month.localeCompare(b.month));
}

export function getForwardCurve(dateStr?: string): ForwardCurveRow[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_CURVES);
        if (!raw) return [];
        const data = JSON.parse(raw);
        if (dateStr && data[dateStr]) return data[dateStr];
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
        map[month]['Exposure'] = (map[month]['Exposure'] || 0) + p.deliveredVolume;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

export function estimatePricingDate(formula: string, baseDate?: string): string {
    return baseDate || new Date().toISOString().split('T')[0];
}