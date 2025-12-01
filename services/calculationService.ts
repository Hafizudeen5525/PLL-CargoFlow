import { CargoProfile, PnLBucket } from '../types';

// Live Market Data State (Spot Prices) - Updated to more realistic 2024/2025 ranges
let LIVE_MARKET_DATA: Record<string, number> = {
  'BRIPE': 78.50,       
  'JCC': 81.00,         
  'Dated Brent': 79.20, 
  'HH': 3.10,           
  'NBP': 11.50,         
  'JKM': 13.50,         
  'TTF': 12.00,         
  'AECO': 1.85,         
  'STN 2': 2.10        
};

export interface ForwardCurveRow {
  month: string; // Standardized YYYY-MM
  prices: Record<string, number>;
}

let FORWARD_CURVE: ForwardCurveRow[] = [];

// Aliases to map natural language to Market Data Keys
const INDEX_ALIASES: Record<string, string> = {
  'henry hub': 'HH',
  'nymex hh': 'HH',
  'us gas': 'HH',
  'japan korea marker': 'JKM',
  'asian spot': 'JKM',
  'dutch ttf': 'TTF',
  'title transfer facility': 'TTF',
  'eur gas': 'TTF',
  'national balancing point': 'NBP',
  'uk gas': 'NBP',
  'japan crude cocktail': 'JCC',
  'brent': 'Dated Brent',
  'dated brent': 'Dated Brent',
  'ice brent': 'BRIPE',
  'stn2': 'STN 2',
  'stn 2': 'STN 2',
  'station 2': 'STN 2'
};

// Keywords that imply the unit is Barrels (bbl)
// Removed 'stn' as Station 2 is a gas index
const OIL_INDICES = ['brent', 'bripe', 'jcc'];

export const getMarketData = () => ({ ...LIVE_MARKET_DATA });

export const getForwardCurve = () => [...FORWARD_CURVE];

export const updateMarketData = (newData: Record<string, number>) => {
  LIVE_MARKET_DATA = { ...LIVE_MARKET_DATA, ...newData };
};

export const updateForwardCurve = (newCurve: ForwardCurveRow[]) => {
  FORWARD_CURVE = newCurve;
};

/**
 * Detects the volume unit based on the formula's index.
 * Returns 'bbl' for oil indices, 'MMBtu' for gas indices.
 */
export function detectUnit(formula: string): 'bbl' | 'MMBtu' {
  if (!formula) return 'MMBtu';
  const lower = formula.toLowerCase();
  if (OIL_INDICES.some(idx => lower.includes(idx))) {
    return 'bbl';
  }
  return 'MMBtu';
}

/**
 * Generates a standardized Strategy Name.
 * Format: SN<Year>_<Portfolio/Source>_<RandomID>(PLL)
 */
export function generateStrategyName(data: Partial<CargoProfile>): string {
  const dateStr = data.deliveryDate || data.loadingDate;
  const year = dateStr ? new Date(dateStr).getFullYear() : new Date().getFullYear();
  
  let portfolio = (data.source || 'Portfolio').split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
  if (portfolio.length < 3) portfolio = 'Global';

  const id = Math.floor(Math.random() * 90 + 10); 

  return `SN${year}_${portfolio}_${id}(PLL)`;
}

/**
 * Helper to normalize a date string (YYYY-MM-DD or Month-Year) to YYYY-MM
 * CRITICAL FIX: String slicing to avoid Timezone shifts (e.g. Nov 1 -> Oct 31)
 */
function normalizeDateToMonth(dateStr: string): string {
    if (!dateStr) return '';
    
    // 1. If strict ISO format YYYY-MM-DD, slice it directly
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})/);
    if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2]}`;
    }

    // 2. Fallback to Date parsing, using UTC to avoid local timezone offset
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Safely evaluates a pricing formula string against market data.
 * If referenceDate is provided, it attempts to find a matching month in the Forward Curve.
 */
export function evaluateFormula(formula: string, referenceDate?: string): number | null {
  if (!formula || !formula.trim()) return null;

  try {
    let parsed = formula.toLowerCase();

    // 1. Determine Pricing Context (Spot vs Forward)
    let pricingContext = { ...LIVE_MARKET_DATA };
    
    if (referenceDate && FORWARD_CURVE.length > 0) {
        const targetMonth = normalizeDateToMonth(referenceDate);
        const forwardRow = FORWARD_CURVE.find(r => r.month === targetMonth);
        
        if (forwardRow) {
            // Merge forward prices on top of spot prices. 
            // Forward curve takes precedence for that month.
            pricingContext = { ...pricingContext, ...forwardRow.prices };
        }
    }

    // 2. Normalization & Cleanup
    parsed = parsed.replace(/–/g, '-'); 
    parsed = parsed.replace(/[£$€¥]/g, ''); 
    parsed = parsed.replace(/,/g, ''); 
    
    // Convert common word operators
    parsed = parsed.replace(/\bplus\b/g, '+');
    parsed = parsed.replace(/\bminus\b/g, '-');

    // 3. Pre-process Aliases
    const aliasKeys = Object.keys(INDEX_ALIASES).sort((a, b) => b.length - a.length);
    aliasKeys.forEach(alias => {
        const targetKey = INDEX_ALIASES[alias];
        // Ensure we match whole words or boundaries for aliases to prevent partial replacements
        const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        parsed = parsed.replace(regex, targetKey);
    });

    // 4. Handle Percentage Syntax (Before value substitution to preserve structure)
    // "HH + 20%" -> "HH * (1 + 0.2)"
    parsed = parsed.replace(/\+\s*(\d+(\.\d+)?)%(\s|$)/g, (_, p1) => `* (1 + ${parseFloat(p1)/100}) `);
    // "- 20%" -> "* (1 - 0.2)"
    parsed = parsed.replace(/\-\s*(\d+(\.\d+)?)%(\s|$)/g, (_, p1) => `* (1 - ${parseFloat(p1)/100}) `);
    // "20% Index" -> "0.2 * Index"
    parsed = parsed.replace(/(\d+(\.\d+)?)%/g, (_, p1) => `${parseFloat(p1) / 100} *`);

    // 5. Handle "+/-" text (e.g. "Index +/- Alpha")
    // We treat "+/-" as "+" for pricing estimation if Alpha is numeric, or ignore if Alpha is text
    parsed = parsed.replace(/\+\/-/g, '+'); 

    // 6. Replace Market Indices with values from Context
    const keys = Object.keys(pricingContext).sort((a, b) => b.length - a.length);
    keys.forEach(key => {
        const val = pricingContext[key];
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match whole word logic to avoid replacing "NBP" inside "NBPlus" if that existed
        const regex = new RegExp(`\\b${escapedKey}\\b`, 'gi');
        parsed = parsed.replace(regex, val.toString());
    });

    // 7. Jargon Removal (After substitution)
    // Remove parentheses that still contain letters (likely contract terms like (n), (m+1))
    // We assume valid variables have been replaced by numbers already.
    // Example: "(95.5 + 0.5)" -> kept. "(n)" -> removed.
    parsed = parsed.replace(/\([^)]*[a-z][^)]*\)/gi, '');
    
    // 8. Aggressive Cleanup of leftover text (e.g. "Alpha", "Beta", units)
    parsed = parsed.replace(/[a-z]+/gi, '');

    // 9. Cleanup dangling operators
    parsed = parsed.replace(/[\+\-\*\/]\s*$/g, '');
    parsed = parsed.replace(/^\s*[\+\-\*\/]/g, '');
    // Fix multiple operators
    parsed = parsed.replace(/\+\+/g, '+');
    parsed = parsed.replace(/\-\-/g, '+');
    parsed = parsed.replace(/\+\-/g, '-');
    parsed = parsed.replace(/\-\+/g, '-');

    // 10. Final Validation
    if (!/^[\d\.\s\+\-\*\/\(\)]+$/.test(parsed)) {
      return null;
    }

    // eslint-disable-next-line no-new-func
    const result = new Function(`return ${parsed}`)();
    return isFinite(result) ? Number(result.toFixed(3)) : null;
  } catch (err) {
    return null;
  }
}

/**
 * Recalculates all derived fields for a cargo profile based on dependencies.
 * @param forceCalc - If true, recalculates prices even if status is Realized (useful for bulk imports/edits)
 */
export function recalculateProfile(profile: Partial<CargoProfile>, forceCalc: boolean = false): Partial<CargoProfile> {
  const updated = { ...profile };
  const isRealized = updated.pnlBucket === PnLBucket.Realized;

  // 1. Calculate Prices from Formulas
  // We calculate if it's NOT realized, OR if we are forcing calculation (e.g. bulk update or form edit)
  if (!isRealized || forceCalc) {
    if (updated.sellFormula) {
        // Use Delivery Date for Sell Side
        const derivedSell = evaluateFormula(updated.sellFormula, updated.deliveryDate);
        if (derivedSell !== null) updated.absoluteSellPrice = derivedSell;
    }

    if (updated.buyFormula) {
        // Use Loading Date for Buy Side (if available), otherwise Delivery Date
        const refDate = updated.loadingDate || updated.deliveryDate;
        const derivedBuy = evaluateFormula(updated.buyFormula, refDate);
        if (derivedBuy !== null) updated.absoluteBuyPrice = derivedBuy;
    }
  }

  // 2. Calculate Sales Revenue
  if (updated.deliveredVolume && updated.absoluteSellPrice) {
    updated.salesRevenue = updated.deliveredVolume * updated.absoluteSellPrice;
  }

  // 3. Calculate Purchase Cost
  if (updated.loadedVolume && updated.absoluteBuyPrice) {
     if (!updated.reconciledPurchaseCost || !isRealized || forceCalc) {
         updated.reconciledPurchaseCost = updated.loadedVolume * updated.absoluteBuyPrice;
     }
  }

  // 4. Default "Final" values
  if (!updated.finalSalesRevenue && updated.salesRevenue) {
    updated.finalSalesRevenue = updated.salesRevenue;
  }
  
  if (!updated.reconciledSalesRevenue && updated.finalSalesRevenue) {
    updated.reconciledSalesRevenue = updated.finalSalesRevenue;
  }

  if (!updated.finalTotalCost && updated.reconciledPurchaseCost) {
    updated.finalTotalCost = updated.reconciledPurchaseCost;
  }

  // 5. Calculate Physical P&L
  const revenue = updated.finalSalesRevenue || 0;
  const cost = updated.finalTotalCost || 0;
  updated.finalPhysicalPnL = revenue - cost;

  // 6. Calculate Final Total P&L
  const physicalPnL = updated.finalPhysicalPnL || 0;
  const hedgingPnL = updated.totalHedgingPnL || 0;
  updated.finalTotalPnL = physicalPnL + hedgingPnL;

  return updated;
}

export function actualizeProfile(profile: Partial<CargoProfile>): Partial<CargoProfile> {
    const updated = { ...profile };
    updated.pnlBucket = PnLBucket.Realized;
    if (!updated.reconciledSalesRevenue) updated.reconciledSalesRevenue = updated.salesRevenue;
    if (!updated.finalSalesRevenue) updated.finalSalesRevenue = updated.reconciledSalesRevenue;
    if (!updated.reconciledPurchaseCost && updated.loadedVolume && updated.absoluteBuyPrice) {
        updated.reconciledPurchaseCost = updated.loadedVolume * updated.absoluteBuyPrice;
    }
    if (!updated.finalTotalCost) updated.finalTotalCost = updated.reconciledPurchaseCost;
    return recalculateProfile(updated);
}