
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
    warning?: string; 
}

const INDEX_ALIASES: Record<string, string> = {
    'DUTCH TTF': 'TTF',
    'TTF': 'TTF',
    'HENRY HUB': 'HH',
    'HH': 'HH',
    'JKM': 'JKM',
    'NBP': 'NBP',
    'BRENT': 'BRIPE',
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
    'TB': 1000000, 
    'MT': 52,      
    'M3': 24,      
    'CBM': 24,
    'BBL': 5.8
};

// --- Helper Functions ---

const getMonthStr = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 7);
};

function generateMockCurve(): ForwardCurveRow[] {
    const today = new Date();
    const rows: ForwardCurveRow[] = [];
    for (let i = 0; i < 24; i++) {
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
    const mmbtu = val * fromFactor;
    return mmbtu / toFactor;
}

// --- Exported Functions ---

export function getAvailableCurveDates(): string[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_CURVES);
        if (!raw) return [];
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return [];
        return Object.keys(data).sort().reverse();
    } catch { return []; }
}

export function saveForwardCurve(date: string, curve: ForwardCurveRow[]) {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_CURVES);
        const data = raw ? JSON.parse(raw) : {};
        const safeData = (data && typeof data === 'object') ? data : {};
        safeData[date] = curve;
        localStorage.setItem(STORAGE_KEY_CURVES, JSON.stringify(safeData));
    } catch (e) { console.error(e); }
}

export function deleteForwardCurve(date: string) {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_CURVES);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return;
        delete data[date];
        localStorage.setItem(STORAGE_KEY_CURVES, JSON.stringify(data));
    } catch (e) { console.error(e); }
}

export function getForwardCurve(dateStr?: string): ForwardCurveRow[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_CURVES);
        if (!raw) return generateMockCurve();
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return generateMockCurve();
        if (dateStr && data[dateStr]) return data[dateStr];
        const dates = Object.keys(data).sort().reverse();
        if (dates.length > 0) return data[dates[0]];
        return generateMockCurve();
    } catch {
        return generateMockCurve();
    }
}

export function getMarketData(): Record<string, number> {
    const curve = getForwardCurve();
    if (curve.length > 0) return curve[0].prices;
    return {};
}

export function getPricesSnapshot(dateStr?: string): Record<string, number> {
    const curve = getForwardCurve(dateStr);
    if (curve.length > 0) return curve[0].prices;
    return {};
}

export function detectUnit(formula?: string): string {
    if (!formula) return 'MMBtu';
    const upper = formula.toUpperCase();
    if (upper.includes('BRENT') || upper.includes('JCC') || upper.includes('BBL')) return 'bbl';
    if (upper.includes('MT') || upper.includes('TONNE')) return 'MT';
    return 'MMBtu';
}

function getIndexPrice(index: string, dateStr: string, monthDef: string, curveDate?: string): number {
    const curve = getForwardCurve(curveDate);
    if (!dateStr) return 0;
    
    // Logic for monthDef: (n-1), (3,0,1), etc.
    const d = new Date(dateStr);
    const targetMonth = d.toISOString().slice(0, 7);
    
    const row = curve.find(r => r.month === targetMonth);
    return row?.prices[index] || 0;
}

// Helper to sanitize and prepare formula for JS Evaluation
function normalizeFormula(formula: string): string {
    let expr = formula
        .replace(/\[/g, '(')
        .replace(/\]/g, ')')
        .replace(/\$/g, '')
        .replace(/Fixed:\s*/i, '')
        .trim();

    // 1. Convert percentages: 50% -> 0.5
    // Regex matches numbers ending in %
    expr = expr.replace(/(\d+(?:\.\d+)?)\s*%/g, (_match, num) => {
        return (parseFloat(num) / 100).toString();
    });

    // 2. Insert implicit multiplication for parens
    // "0.5(" -> "0.5 * ("
    expr = expr.replace(/(\d|\))(?=\s*\()/g, '$1 * ');
    
    return expr;
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

    const tieredMatch = cleanFormula.match(/^>\s*([\d\.]+)\s*([a-zA-Z]+)\s*\?\s*([^;]+);\s*(.+)$/);
    
    if (tieredMatch) {
        const thresholdVal = parseFloat(tieredMatch[1]);
        const thresholdUnit = tieredMatch[2];
        const overFormula = tieredMatch[3];
        const underFormula = tieredMatch[4];

        const volInThresholdUnit = convertVolume(volume, volumeUnit, thresholdUnit);

        if (volInThresholdUnit <= 0) {
            return evaluateSimpleFormula(underFormula, dateStr, curveDate);
        }

        const underVol = Math.min(volInThresholdUnit, thresholdVal);
        const overVol = Math.max(0, volInThresholdUnit - thresholdVal);

        const priceUnder = evaluateSimpleFormula(underFormula, dateStr, curveDate) || 0;
        const priceOver = evaluateSimpleFormula(overFormula, dateStr, curveDate) || 0;

        if (volume > 0) {
            return ((underVol * priceUnder) + (overVol * priceOver)) / volInThresholdUnit;
        } else {
            return priceUnder;
        }
    }

    return evaluateSimpleFormula(cleanFormula, dateStr, curveDate);
}

function evaluateSimpleFormula(formula: string, dateStr?: string, curveDate?: string, priceOverride?: Record<string, number>): number | null {
    if (!formula) return null;
    
    let expression = normalizeFormula(formula);

    if (!isNaN(parseFloat(expression)) && !/[a-zA-Z]/.test(expression)) {
        return parseFloat(expression);
    }

    const sortedAliases = Object.keys(INDEX_ALIASES).sort((a, b) => b.length - a.length);
    
    for (const alias of sortedAliases) {
        const canonical = INDEX_ALIASES[alias];
        const regex = new RegExp(`\\b${alias}\\b(?:\\s*\\(([^)]+)\\))?`, 'gi');
        
        expression = expression.replace(regex, (match, monthDef) => {
            let price = 0;
            if (priceOverride && priceOverride[canonical] !== undefined) {
                price = priceOverride[canonical];
            } else if (dateStr) {
                price = getIndexPrice(canonical, dateStr, monthDef, curveDate);
            }
            
            return price.toString();
        });
    }

    // Insert implicit multiplication between Number and Number
    expression = expression.replace(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/g, '$1 * $2');

    // Cleanup
    expression = expression.replace(/[a-zA-Z]+/g, '0');

    try {
        if (/[^0-9\.\+\-\*\/\(\)\s]/.test(expression)) {
            return null;
        }
        // eslint-disable-next-line no-new-func
        const func = new Function(`return ${expression}`);
        const result = func();
        return isNaN(result) ? null : result;
    } catch (e) {
        return null;
    }
}

export function analyzeFormulaStructure(
    formula: string, 
    dateStr?: string, 
    curveDate?: string,
    volume: number = 0,
    volumeUnit: string = 'MMBtu'
): { parts: PricingMetadata[], globalConstant: string, warnings: string[] } {
    if (!formula) return { parts: [], globalConstant: '0', warnings: [] };

    const tieredMatch = formula.trim().match(/^>\s*([\d\.]+)\s*([a-zA-Z]+)\s*\?\s*([^;]+);\s*(.+)$/);
    
    if (tieredMatch) {
        const thresholdVal = parseFloat(tieredMatch[1]);
        const thresholdUnit = tieredMatch[2];
        const overFormula = tieredMatch[3];
        const underFormula = tieredMatch[4];
        
        const under = analyzeSimpleStructure(underFormula, dateStr, curveDate);
        const over = analyzeSimpleStructure(overFormula, dateStr, curveDate);
        
        return { 
            parts: [...under.parts, ...over.parts], 
            globalConstant: under.globalConstant, 
            warnings: [...under.warnings, ...over.warnings] 
        };
    }

    return analyzeSimpleStructure(formula, dateStr, curveDate);
}

function analyzeSimpleStructure(formula: string, dateStr?: string, curveDate?: string): { parts: PricingMetadata[], globalConstant: string, warnings: string[] } {
    const cleanFormula = normalizeFormula(formula);
    const warnings: string[] = [];

    // Check for Unbalanced Parentheses
    const openP = (formula.match(/\(/g) || []).length + (formula.match(/\[/g) || []).length;
    const closeP = (formula.match(/\)/g) || []).length + (formula.match(/\]/g) || []).length;
    if (openP !== closeP) {
        warnings.push(`Unbalanced parentheses: ${openP} opening vs ${closeP} closing.`);
    }

    // Check for Unknown Tokens (Potential typos or weird formulations)
    let textCheck = formula.toUpperCase();
    
    // Sort aliases by length to remove longest matches first
    const sortedAliases = Object.keys(INDEX_ALIASES).sort((a, b) => b.length - a.length);
    sortedAliases.forEach(alias => {
        // Regex to replace whole words or phrases with word boundaries
        textCheck = textCheck.replace(new RegExp(`\\b${alias.replace(/ /g, '\\s+')}\\b`, 'g'), ' ');
    });
    
    // Remove "Fixed", "n", "m" (common variables)
    textCheck = textCheck.replace(/\bFIXED\b/g, ' ');
    textCheck = textCheck.replace(/\bN\b/g, ' ');
    textCheck = textCheck.replace(/\bM\b/g, ' ');

    // Remove math chars and numbers
    textCheck = textCheck.replace(/[0-9\.\+\-\*\/\%\(\)\[\]:;]/g, ' ');
    
    // If anything remains, it's likely weird text
    const unknownWords = textCheck.trim().split(/\s+/).filter(w => w.length > 0);
    if (unknownWords.length > 0) {
        const unique = Array.from(new Set(unknownWords));
        warnings.push(`Unknown term(s): "${unique.join(', ')}". Is this a typo?`);
    }

    // 1. Calculate Global Constant using Mathematical Probing
    const globalConstantVal = evaluateSimpleFormula(formula, dateStr, curveDate, 
        Object.fromEntries(Object.keys(INDEX_ALIASES).map(k => [k, 0]))
    );
    const globalConstantStr = globalConstantVal !== null ? globalConstantVal.toFixed(4).replace(/\.?0+$/, '') : '0';

    // 2. Identify Components via Backward Scanning
    let workingFormula = formula.replace(/\[/g, '(').replace(/\]/g, ')');
    
    const foundIndices: { index: number, length: number, alias: string }[] = [];

    for (const alias of sortedAliases) {
        const regex = new RegExp(`\\b${alias}\\b`, 'gi');
        let match;
        while ((match = regex.exec(workingFormula)) !== null) {
            const isOverlap = foundIndices.some(f => 
                (match!.index >= f.index && match!.index < f.index + f.length) ||
                (match!.index + match![0].length > f.index && match!.index + match![0].length <= f.index + f.length)
            );
            if (!isOverlap) {
                foundIndices.push({ index: match.index, length: match[0].length, alias });
            }
        }
    }
    foundIndices.sort((a, b) => a.index - b.index);

    const parts: PricingMetadata[] = [];

    foundIndices.forEach(item => {
        const precedingText = workingFormula.substring(0, item.index).trim();
        const suffixText = workingFormula.substring(item.index + item.length);
        
        const monthMatch = suffixText.match(/^\s*\(([^)]+)\)/);
        const monthDef = monthMatch ? monthMatch[1] : '';

        let slope = '';
        let weightage = '100%';
        let warning = '';

        const numRegex = /((?:\d+(?:\.\d+)?%?))\s*\*?\s*$/;
        
        let scanned = precedingText;
        const slopeMatch = scanned.match(numRegex);
        if (slopeMatch) {
            slope = slopeMatch[1];
            scanned = scanned.substring(0, slopeMatch.index).trim();
        }

        if (scanned.endsWith('(')) {
            scanned = scanned.substring(0, scanned.length - 1).trim(); 
            const weightMatch = scanned.match(numRegex);
            if (weightMatch) {
                weightage = weightMatch[1];
            }
        }

        const numericSlope = parseFloat(slope);
        const canonical = INDEX_ALIASES[item.alias.toUpperCase()];
        const isOil = OIL_INDICES.includes(canonical);
        
        if (isOil && slope && !slope.includes('%') && !isNaN(numericSlope)) {
            if (numericSlope >= 7 && numericSlope <= 25) {
                warning = `Possible Typo: ${slope} ${item.alias} might be a gas conversion slope. Did you mean ${numericSlope}%?`;
                warnings.push(warning);
            }
        }

        let compVal = 0;
        if (dateStr) {
            const price = getIndexPrice(canonical, dateStr, monthDef, curveDate);
            
            let sVal = 1;
            if (slope) sVal = slope.includes('%') ? parseFloat(slope)/100 : parseFloat(slope);
            
            let wVal = 1;
            if (weightage) wVal = weightage.includes('%') ? parseFloat(weightage)/100 : parseFloat(weightage);
            
            compVal = price * sVal * wVal;
        }

        parts.push({
            weightage,
            slope,
            index: canonical,
            monthDef,
            constant: '0', 
            rawText: item.alias,
            componentValue: compVal,
            warning
        });
    });

    if (Math.abs(parseFloat(globalConstantStr)) > 0.0001) {
        if (parts.length > 0) {
            parts[0].constant = globalConstantStr;
            if (parts[0].componentValue !== undefined) {
                parts[0].componentValue += parseFloat(globalConstantStr);
            }
        } else {
            parts.push({
                weightage: '100%',
                slope: '',
                index: 'FIXED',
                monthDef: '',
                constant: globalConstantStr,
                rawText: formula,
                componentValue: parseFloat(globalConstantStr)
            });
        }
    }

    return { parts, globalConstant: globalConstantStr, warnings };
}

// ... (Rest of exported functions: recalculateProfile, actualizeProfile, etc. remain unchanged) ...
// Re-exporting them to ensure file integrity

export function recalculateProfile(profile: Partial<CargoProfile>, useMarketData: boolean = true, dateOverride?: string): Partial<CargoProfile> {
    const updated = { ...profile };
    const getEffectiveDate = (dateField: string | undefined, windowStart: string | undefined): string | undefined => {
        if (dateOverride) return dateOverride;
        if (dateField) return dateField;
        if (windowStart) return windowStart;
        return undefined;
    };
    const deliveryDate = getEffectiveDate(updated.deliveryDate, updated.deliveryWindowStart);
    const loadingDate = getEffectiveDate(updated.loadingDate, updated.loadingWindowStart);
    const unit = updated.volumeUnit || detectUnit(updated.sellFormula || updated.buyFormula);
    updated.volumeUnit = unit;

    if (updated.pnlBucket !== PnLBucket.Realized && useMarketData && updated.sellFormula) {
        const price = evaluateFormula(updated.sellFormula, deliveryDate, undefined, updated.deliveredVolume || 0, unit);
        if (price !== null) updated.absoluteSellPrice = price;
    }
    if (updated.pnlBucket !== PnLBucket.Realized && useMarketData && updated.buyFormula) {
        const price = evaluateFormula(updated.buyFormula, loadingDate || deliveryDate, undefined, updated.loadedVolume || 0, unit);
        if (price !== null) updated.absoluteBuyPrice = price;
    }

    const sellPrice = updated.absoluteSellPrice || 0;
    const buyPrice = updated.absoluteBuyPrice || 0;
    const delVol = updated.deliveredVolume || 0;
    const loadVol = updated.loadedVolume || 0;

    updated.salesRevenue = delVol * sellPrice;
    updated.reconciledPurchaseCost = loadVol * buyPrice; 
    updated.finalSalesRevenue = updated.salesRevenue; 
    updated.reconciledSalesRevenue = updated.salesRevenue;
    updated.finalTotalCost = updated.reconciledPurchaseCost;
    updated.finalPhysicalPnL = (updated.finalSalesRevenue || 0) - (updated.finalTotalCost || 0);
    updated.finalTotalPnL = (updated.finalPhysicalPnL || 0) + (updated.totalHedgingPnL || 0);

    return updated;
}

export function actualizeProfile(profile: CargoProfile): CargoProfile {
    const recalculated = recalculateProfile(profile, true) as CargoProfile;
    return { ...recalculated, pnlBucket: PnLBucket.Realized };
}

export function generateStrategyName(profile: Partial<CargoProfile>): string {
    const date = profile.loadingDate || profile.deliveryDate || new Date().toISOString().split('T')[0];
    const dateObj = new Date(date);
    const month = dateObj.toLocaleString('default', { month: 'short' }).toUpperCase();
    const year = dateObj.getFullYear().toString().slice(-2);
    const sourceCode = (profile.source || 'UNK').substring(0, 3).toUpperCase();
    const buyerCode = (profile.buyer || 'SPOT').substring(0, 3).toUpperCase();
    return `${month}${year}-${sourceCode}-${buyerCode}-${Math.floor(Math.random() * 1000)}`;
}

export function getPortfolioYear(profile: CargoProfile): number {
    const d = profile.deliveryDate || profile.loadingDate;
    if (!d) return new Date().getFullYear();
    return new Date(d).getFullYear();
}

export function explainPricing(formula: string | undefined, dateStr: string | undefined, curveDate?: string): { pricingMode: string, details: string } {
    if (!formula || !formula.trim()) return { pricingMode: 'Error', details: 'No formula provided' };
    if (!dateStr) return { pricingMode: 'Error', details: 'No date provided for pricing' };
    
    const analysis = analyzeFormulaStructure(formula, dateStr, curveDate);
    
    // Check for weird formulations or warnings
    if (analysis.warnings.length > 0) {
        return { pricingMode: 'Error', details: analysis.warnings[0] };
    }

    if (analysis.parts.length === 0) {
        if (analysis.globalConstant && analysis.globalConstant !== '0') {
            return { pricingMode: 'Fixed', details: `Fixed Price: ${analysis.globalConstant}` };
        }
        return { pricingMode: 'Error', details: 'Could not parse formula' };
    }
    const indices = analysis.parts.map(p => p.index).join(', ');
    return { pricingMode: 'Indexed', details: `Linked to: ${indices}` };
}

export function getExposureChartData(profiles: CargoProfile[]): any[] {
    const exposureMap: Record<string, Record<string, number>> = {};
    profiles.forEach(p => {
        if (p.pnlBucket === PnLBucket.Realized) return;
        const date = p.deliveryDate || p.loadingDate;
        if (!date) return;
        const monthKey = date.slice(0, 7); 
        if (!exposureMap[monthKey]) exposureMap[monthKey] = {};
        const unit = p.volumeUnit || detectUnit(p.sellFormula || p.buyFormula);
        const delVol = p.deliveredVolume || 0;
        const loadVol = p.loadedVolume || 0;

        if (p.sellFormula) {
            const analysis = analyzeFormulaStructure(p.sellFormula, date, undefined, delVol, unit);
            analysis.parts.forEach(part => {
                let w = 1;
                if (part.weightage && part.weightage.includes('%')) w = parseFloat(part.weightage) / 100;
                else if (part.weightage) w = parseFloat(part.weightage);
                exposureMap[monthKey][part.index] = (exposureMap[monthKey][part.index] || 0) + (delVol * w);
            });
        }
        if (p.buyFormula) {
            const analysis = analyzeFormulaStructure(p.buyFormula, date, undefined, loadVol, unit);
            analysis.parts.forEach(part => {
                let w = 1;
                if (part.weightage && part.weightage.includes('%')) w = parseFloat(part.weightage) / 100;
                else if (part.weightage) w = parseFloat(part.weightage);
                exposureMap[monthKey][part.index] = (exposureMap[monthKey][part.index] || 0) - (loadVol * w);
            });
        }
    });
    return Object.entries(exposureMap).map(([date, indices]) => ({ date, ...indices })).sort((a, b) => a.date.localeCompare(b.date));
}

export function estimatePricingDate(formula: string | undefined, refDate: string | undefined): string {
    if (!refDate) return new Date().toISOString();
    if (formula && formula.includes('-1')) {
         const d = new Date(refDate);
         d.setMonth(d.getMonth() - 1);
         return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString();
    }
    return refDate;
}
