
import { CargoProfile, PnLBucket, ShipmentStrategy, DealLeg } from '../types';

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
    warning?: string; 
    details?: string; // New field to explain averaging
}

const INDEX_ALIASES: Record<string, string> = {
    'DUTCH TTF': 'TTF',
    'TTF': 'TTF',
    'HENRY HUB': 'HH',
    'HH': 'HH',
    'HH LAST DAY': 'HH',
    'JKM': 'JKM',
    'NBP': 'NBP',
    'BRENT': 'Dated Brent',
    'DATED BRENT': 'Dated Brent',
    'BRIPE': 'BRIPE',
    'JCC': 'JCC',
    'AECO': 'AECO',
    'STN 2': 'STN 2',
    'STATION 2': 'STN 2',
    'WTI': 'WTI'
};

const OIL_INDICES = ['Dated Brent', 'JCC', 'WTI', 'BRIPE'];
const STORAGE_KEY_CURVES = 'forward_curves_data';

const UNIT_TO_MMBTU: Record<string, number> = {
    'MMBTU': 1,
    'TBTU': 1000000,
    'MT': 52,      
    'M3': 24,      
    'BBL': 5.8
};

// --- Helper Functions ---

function generateMockCurve(): ForwardCurveRow[] {
    const today = new Date();
    const rows: ForwardCurveRow[] = [];
    // Generate 12 months back and 24 months forward for testing averages
    for (let i = -12; i < 24; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
        const month = d.toISOString().slice(0, 7);
        rows.push({
            month,
            prices: {
                'TTF': 10 + Math.random() * 5,
                'JKM': 12 + Math.random() * 5,
                'HH': 2.5 + Math.random(),
                'NBP': 9 + Math.random() * 4,
                'Dated Brent': 75 + Math.random() * 10,
                'JCC': 80 + Math.random() * 10,
                'BRIPE': 78 + Math.random() * 10,
                'AECO': 1.5 + Math.random(),
                'STN 2': 1.4 + Math.random()
            }
        });
    }
    return rows;
}

function convertVolume(val: number, fromUnit: string, toUnit: string): number {
    const fromFactor = UNIT_TO_MMBTU[fromUnit.toUpperCase()] || 1;
    const toFactor = UNIT_TO_MMBTU[toUnit.toUpperCase()] || 1;
    return (val * fromFactor) / toFactor;
}

// --- Pricing Engine Core ---

/**
 * Calculates the average price for a list of months defined by the n-offset or A,B,C notation.
 */
function getIndexPrice(index: string, refDateStr: string, monthDef: string, curveDate?: string): { price: number, details: string } {
    const curve = getForwardCurve(curveDate);
    if (!refDateStr) return { price: 0, details: 'Missing Ref Date' };
    
    const d = new Date(refDateStr);
    const targetMonths: string[] = [];
    let label = monthDef || 'n';

    // 1. Parse Definition
    const cleanDef = (monthDef || 'n').toLowerCase().replace(/\s/g, '');
    
    // Case A: (A, B, C) notation -> 3,0,1 or 6,0,3
    const avgMatch = cleanDef.match(/(\d+),(\d+),(\d+)/);
    if (avgMatch) {
        const count = parseInt(avgMatch[1]);
        const lag = parseInt(avgMatch[2]);
        // Iterate backward to find the averaging window
        for (let i = 0; i < count; i++) {
            const date = new Date(d.getFullYear(), d.getMonth() - lag - i, 1);
            targetMonths.push(date.toISOString().slice(0, 7));
        }
    } 
    // Case B: n+/-x notation
    else {
        let offset = 0;
        if (cleanDef.includes('n-')) offset = -parseInt(cleanDef.split('n-')[1] || '0');
        else if (cleanDef.includes('n+')) offset = parseInt(cleanDef.split('n+')[1] || '0');
        
        const date = new Date(d.getFullYear(), d.getMonth() + offset, 1);
        targetMonths.push(date.toISOString().slice(0, 7));
    }

    // 2. Fetch prices and average
    let total = 0;
    let foundCount = 0;
    const priceDetails: string[] = [];

    targetMonths.forEach(m => {
        const row = curve.find(r => r.month === m);
        const p = row?.prices[index] || 0;
        if (p > 0) {
            total += p;
            foundCount++;
            priceDetails.push(`${m}: $${p.toFixed(2)}`);
        } else {
            priceDetails.push(`${m}: No Data`);
        }
    });

    const finalPrice = foundCount > 0 ? total / foundCount : 0;
    return {
        price: finalPrice,
        details: `${label} Avg (${foundCount}/${targetMonths.length} mo): ${priceDetails.join(', ')}`
    };
}

function normalizeFormula(formula: string): string {
    return formula
        .replace(/\[/g, '(')
        .replace(/\]/g, ')')
        .replace(/\$/g, '')
        .replace(/(\d+(?:\.\d+)?)\s*%/g, (_match, num) => (parseFloat(num) / 100).toString())
        .replace(/(\d|\))(?=\s*\()/g, '$1 * ')
        .trim();
}

export function evaluateFormula(
    formula: string, 
    dateStr?: string, 
    curveDate?: string,
    volume: number = 0,
    volumeUnit: string = 'MMBtu'
): number | null {
    if (!formula) return null;
    const cleanFormula = formula.trim();

    // Handle Tiered Pricing (> 65000 MT ? JKM; HH)
    const tieredMatch = cleanFormula.match(/^>\s*([\d\.]+)\s*([a-zA-Z]+)\s*\?\s*([^;]+);\s*(.+)$/);
    if (tieredMatch) {
        const thresholdVal = parseFloat(tieredMatch[1]);
        const thresholdUnit = tieredMatch[2];
        const overFormula = tieredMatch[3];
        const underFormula = tieredMatch[4];
        const volInThresholdUnit = convertVolume(volume, volumeUnit, thresholdUnit);

        if (volInThresholdUnit <= thresholdVal) return evaluateSimpleFormula(underFormula, dateStr, curveDate);
        
        const priceUnder = evaluateSimpleFormula(underFormula, dateStr, curveDate) || 0;
        const priceOver = evaluateSimpleFormula(overFormula, dateStr, curveDate) || 0;
        return ((thresholdVal * priceUnder) + ((volInThresholdUnit - thresholdVal) * priceOver)) / volInThresholdUnit;
    }

    return evaluateSimpleFormula(cleanFormula, dateStr, curveDate);
}

function evaluateSimpleFormula(formula: string, dateStr?: string, curveDate?: string): number | null {
    if (!formula) return null;
    let expression = normalizeFormula(formula);
    const sortedAliases = Object.keys(INDEX_ALIASES).sort((a, b) => b.length - a.length);
    
    for (const alias of sortedAliases) {
        const canonical = INDEX_ALIASES[alias];
        const regex = new RegExp(`\\b${alias.replace(/\s+/g, '\\s+')}\\b(?:\\s*\\(([^)]+)\\))?`, 'gi');
        
        expression = expression.replace(regex, (match, monthDef) => {
            const { price } = getIndexPrice(canonical, dateStr || '', monthDef, curveDate);
            return price.toString();
        });
    }

    expression = expression.replace(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/g, '$1 * $2').replace(/[a-zA-Z]+/g, '0');

    try {
        const func = new Function(`return ${expression}`);
        const result = func();
        return isNaN(result) ? null : result;
    } catch { return null; }
}

// Updated signature to accept volume and volumeUnit for consistent tiered evaluation
export function analyzeFormulaStructure(
    formula: string, 
    dateStr?: string, 
    curveDate?: string,
    volume: number = 0,
    volumeUnit: string = 'MMBtu'
): { parts: PricingMetadata[], globalConstant: string, warnings: string[] } {
    if (!formula) return { parts: [], globalConstant: '0', warnings: [] };
    const warnings: string[] = [];
    
    // Evaluates formula using standard logic without the invalid 4th argument
    const globalConstantVal = evaluateFormula(formula, dateStr, curveDate, volume, volumeUnit);
    
    let workingFormula = formula.replace(/\[/g, '(').replace(/\]/g, ')');
    const sortedAliases = Object.keys(INDEX_ALIASES).sort((a, b) => b.length - a.length);
    const foundIndices: any[] = [];

    for (const alias of sortedAliases) {
        const regex = new RegExp(`\\b${alias.replace(/\s+/g, '\\s+')}\\b`, 'gi');
        let m;
        while ((m = regex.exec(workingFormula)) !== null) {
            if (!foundIndices.some(f => m!.index >= f.index && m!.index < f.index + f.length)) {
                foundIndices.push({ index: m.index, length: m[0].length, alias });
            }
        }
    }
    foundIndices.sort((a, b) => a.index - b.index);

    const parts: PricingMetadata[] = [];
    foundIndices.forEach(item => {
        const preceding = workingFormula.substring(0, item.index).trim();
        const suffix = workingFormula.substring(item.index + item.length);
        const monthMatch = suffix.match(/^\s*\(([^)]+)\)/);
        const monthDef = monthMatch ? monthMatch[1] : 'n';

        const numRegex = /((?:\d+(?:\.\d+)?%?))\s*\*?\s*$/;
        let slope = '', weightage = '100%', scanned = preceding;
        const slopeMatch = scanned.match(numRegex);
        if (slopeMatch) { slope = slopeMatch[1]; scanned = scanned.substring(0, slopeMatch.index).trim(); }
        if (scanned.endsWith('(')) {
            const wMatch = scanned.substring(0, scanned.length - 1).trim().match(numRegex);
            if (wMatch) weightage = wMatch[1];
        }

        const canonical = INDEX_ALIASES[item.alias.toUpperCase()];
        const { price, details } = getIndexPrice(canonical, dateStr || '', monthDef, curveDate);

        parts.push({
            weightage, slope, index: canonical, monthDef, constant: '0',
            rawText: item.alias, componentValue: price, details
        });
    });

    return { parts, globalConstant: (globalConstantVal || 0).toString(), warnings };
}

// --- Persistence Helpers ---

export function getAvailableCurveDates(): string[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_CURVES);
        return raw ? Object.keys(JSON.parse(raw)).sort().reverse() : [];
    } catch { return []; }
}

export function getForwardCurve(dateStr?: string): ForwardCurveRow[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_CURVES);
        if (!raw) return generateMockCurve();
        const data = JSON.parse(raw);
        if (dateStr && data[dateStr]) return data[dateStr];
        const dates = Object.keys(data).sort().reverse();
        return dates.length > 0 ? data[dates[0]] : generateMockCurve();
    } catch { return generateMockCurve(); }
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

export function getMarketData() { return getForwardCurve()[0]?.prices || {}; }
export function getPricesSnapshot(d?: string) { return getForwardCurve(d)[0]?.prices || {}; }
export function getPortfolioYear(p: CargoProfile) { return new Date(p.deliveryDate || p.loadingDate || Date.now()).getFullYear(); }

// Added missing helper to estimate pricing end dates for exposure analysis
export function estimatePricingDate(formula: string, baseDate?: string): string {
    if (!baseDate) return new Date().toISOString().split('T')[0];
    const d = new Date(baseDate);
    // Pricing usually concludes by delivery or shortly after
    return d.toISOString().split('T')[0];
}

export function recalculateProfile(p: Partial<CargoProfile>, useMarket: boolean = true, dateOverride?: string): Partial<CargoProfile> {
    const up = { ...p };
    const dDate = dateOverride || up.deliveryDate || up.deliveryWindowStart;
    const lDate = dateOverride || up.loadingDate || up.loadingWindowStart || dDate;
    const unit = up.volumeUnit || detectUnit(up.sellFormula || up.buyFormula);

    if (up.pnlBucket !== PnLBucket.Realized && useMarket) {
        if (up.sellFormula) up.absoluteSellPrice = evaluateFormula(up.sellFormula, dDate, undefined, up.deliveredVolume, unit) || 0;
        if (up.buyFormula) up.absoluteBuyPrice = evaluateFormula(up.buyFormula, lDate, undefined, up.loadedVolume, unit) || 0;
    }

    up.salesRevenue = (up.deliveredVolume || 0) * (up.absoluteSellPrice || 0);
    up.reconciledPurchaseCost = (up.loadedVolume || 0) * (up.absoluteBuyPrice || 0);
    up.finalSalesRevenue = up.salesRevenue;
    up.finalTotalCost = up.reconciledPurchaseCost;
    up.finalPhysicalPnL = up.finalSalesRevenue - up.finalTotalCost;
    up.finalTotalPnL = up.finalPhysicalPnL + (up.totalHedgingPnL || 0);
    return up;
}

export function actualizeProfile(p: CargoProfile): CargoProfile {
    return { ...recalculateProfile(p, true), pnlBucket: PnLBucket.Realized } as CargoProfile;
}

export function generateStrategyName(p: Partial<CargoProfile>): string {
    const d = new Date(p.loadingDate || p.deliveryDate || Date.now());
    const m = d.toLocaleString('default', { month: 'short' }).toUpperCase();
    const y = d.getFullYear().toString().slice(-2);
    return `${m}${y}-${(p.source || 'UNK').slice(0, 3).toUpperCase()}-${(p.buyer || 'SPT').slice(0, 3).toUpperCase()}-${Math.floor(Math.random() * 999)}`;
}

export function explainPricing(f: string | undefined, d: string | undefined, c?: string) {
    if (!f || !d) return { pricingMode: 'Error', details: 'Missing formula or date' };
    const { parts, globalConstant } = analyzeFormulaStructure(f, d, c);
    if (parts.length === 0) return globalConstant !== '0' ? { pricingMode: 'Fixed', details: `Price: ${globalConstant}` } : { pricingMode: 'Error', details: 'Unparseable' };
    return { pricingMode: 'Indexed', details: parts.map(p => `${p.index}(${p.monthDef})`).join(', ') };
}

export function getExposureChartData(profiles: CargoProfile[]) {
    const map: Record<string, any> = {};
    profiles.forEach(p => {
        if (p.pnlBucket === PnLBucket.Realized) return;
        const month = (p.deliveryDate || p.loadingDate || '').slice(0, 7);
        if (!month) return;
        if (!map[month]) map[month] = { date: month };
        const { parts } = analyzeFormulaStructure(p.sellFormula || p.buyFormula, p.deliveryDate || p.loadingDate);
        parts.forEach(part => {
            const vol = (p.deliveredVolume || 0) * (parseFloat(part.weightage) / 100 || 1);
            map[month][part.index] = (map[month][part.index] || 0) + vol;
        });
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

export function detectUnit(f?: string) {
    if (!f) return 'MMBtu';
    const u = f.toUpperCase();
    if (u.includes('BRENT') || u.includes('JCC') || u.includes('BBL')) return 'bbl';
    if (u.includes('MT')) return 'MT';
    return 'MMBtu';
}

// Updated to return typed ShipmentStrategy and include missing DealLeg fields
export function convertProfileToStrategy(p: CargoProfile): ShipmentStrategy {
    return {
        id: p.id,
        strategyName: p.strategyName,
        manualGroup: p.manualGroup,
        pnlBucket: p.pnlBucket,
        buyLeg: { 
            id: p.id + '_buy',
            type: 'Buy', 
            counterparty: p.source, 
            date: p.loadingDate, 
            volume: p.loadedVolume, 
            formula: p.buyFormula, 
            absolutePrice: p.absoluteBuyPrice, 
            totalValue: p.reconciledPurchaseCost, 
            volumeUnit: p.volumeUnit || 'MMBtu',
            status: p.pnlBucket,
            incoterms: p.incoterms,
            windowStart: p.loadingWindowStart,
            windowEnd: p.loadingWindowEnd
        },
        sellLeg: { 
            id: p.id + '_sell',
            type: 'Sell', 
            counterparty: p.buyer, 
            date: p.deliveryDate, 
            volume: p.deliveredVolume, 
            formula: p.sellFormula, 
            absolutePrice: p.absoluteSellPrice, 
            totalValue: p.salesRevenue, 
            volumeUnit: p.volumeUnit || 'MMBtu',
            status: p.pnlBucket,
            incoterms: p.incoterms,
            windowStart: p.deliveryWindowStart,
            windowEnd: p.deliveryWindowEnd
        },
        totalPnL: p.finalTotalPnL
    };
}

export function flattenStrategy(s: any): CargoProfile {
    return {
        id: s.id,
        strategyName: s.strategyName,
        manualGroup: s.manualGroup,
        source: s.buyLeg.counterparty,
        buyer: s.sellLeg.counterparty,
        deliveryDate: s.sellLeg.date,
        loadingDate: s.buyLeg.date,
        deliveredVolume: s.sellLeg.volume,
        loadedVolume: s.buyLeg.volume,
        sellFormula: s.sellLeg.formula,
        buyFormula: s.buyLeg.formula,
        absoluteSellPrice: s.sellLeg.absolutePrice,
        absoluteBuyPrice: s.buyLeg.absolutePrice,
        salesRevenue: s.sellLeg.totalValue,
        reconciledPurchaseCost: s.buyLeg.totalValue,
        finalTotalPnL: s.totalPnL,
        pnlBucket: s.pnlBucket,
        volumeUnit: s.sellLeg.volumeUnit,
        src: '', optimized: false, deliveryMonth: '', incoterms: '', reconciledSalesRevenue: 0, finalSalesRevenue: 0, finalTotalCost: 0, finalPhysicalPnL: 0, totalHedgingPnL: 0
    } as any;
}

export function calculateStrategyPnL(s: any): any {
    const flat = flattenStrategy(s);
    const updated = recalculateProfile(flat);
    return convertProfileToStrategy(updated as CargoProfile);
}
