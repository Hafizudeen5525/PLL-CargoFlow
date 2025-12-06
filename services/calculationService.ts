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

// STORAGE: Map of "Curve Date" (YYYY-MM-DD) -> Curve Data
let CURVE_HISTORY: Record<string, ForwardCurveRow[]> = {};

// Initialize from LocalStorage if available
try {
    const saved = localStorage.getItem('forward_curve_history');
    if (saved) {
        CURVE_HISTORY = JSON.parse(saved);
    }
} catch (e) {
    console.warn("Failed to load curve history");
}

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

// Get the curve for a specific "As Of" date, or the most recent one if not specified
export const getForwardCurve = (asOfDate?: string): ForwardCurveRow[] => {
    if (asOfDate && CURVE_HISTORY[asOfDate]) {
        return CURVE_HISTORY[asOfDate];
    }
    
    // Find latest
    const dates = Object.keys(CURVE_HISTORY).sort().reverse();
    if (dates.length > 0) return CURVE_HISTORY[dates[0]];
    
    return [];
};

export const getAvailableCurveDates = (): string[] => {
    return Object.keys(CURVE_HISTORY).sort().reverse();
};

export const updateMarketData = (newData: Record<string, number>) => {
  LIVE_MARKET_DATA = { ...LIVE_MARKET_DATA, ...newData };
};

// Save a curve for a specific date (Historical Tracking)
export const saveForwardCurve = (date: string, newCurve: ForwardCurveRow[]) => {
  CURVE_HISTORY[date] = newCurve;
  // Persist to LocalStorage (Mock DB)
  localStorage.setItem('forward_curve_history', JSON.stringify(CURVE_HISTORY));
};

export const deleteForwardCurve = (date: string) => {
    delete CURVE_HISTORY[date];
    localStorage.setItem('forward_curve_history', JSON.stringify(CURVE_HISTORY));
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
 * Estimates when the price for a cargo will be "fixed" (no longer floating).
 */
export function estimatePricingDate(formula: string, deliveryDate: string): string {
    if (!deliveryDate) return '';
    if (!formula) return deliveryDate;
    
    const d = new Date(deliveryDate);
    const idx = formula.toLowerCase();
    
    // JKM: ~15th of previous month
    if (idx.includes('jkm')) {
        d.setMonth(d.getMonth() - 1);
        d.setDate(15);
    }
    // Gas Indices (TTF, NBP, HH): End of previous month usually (or during delivery month for spot)
    // For exposure tracking, let's assume end of previous month is when 'forward' becomes 'spot'
    else if (idx.includes('ttf') || idx.includes('nbp') || idx.includes('hh')) {
         d.setDate(0); // Last day of previous month
    }
    // Oil: Average of delivery month, so fixes at end of delivery month
    else if (detectUnit(formula) === 'bbl') {
        d.setMonth(d.getMonth() + 1);
        d.setDate(0);
    }
    
    return d.toISOString().split('T')[0];
}

/**
 * Aggregates Volume Exposure by Pricing Month
 */
export function getExposureChartData(profiles: CargoProfile[]) {
    const exposureMap = new Map<string, Record<string, number>>();
    
    profiles.forEach(p => {
        // Only Unrealized counts as "Exposure"
        if (p.pnlBucket === PnLBucket.Realized) return;
        
        const dateStr = p.pricingEndDate || estimatePricingDate(p.sellFormula || p.buyFormula, p.deliveryDate);
        if (!dateStr) return;
        
        // Filter out past dates (no longer exposed)
        if (new Date(dateStr) < new Date()) return; 
        
        const month = dateStr.slice(0, 7); // YYYY-MM
        
        if (!exposureMap.has(month)) {
            exposureMap.set(month, { date: month } as any);
        }
        
        const entry = exposureMap.get(month)!;
        
        // Identify Index
        let index = 'Other';
        const formula = (p.sellFormula || p.buyFormula || '').toUpperCase();
        if (formula.includes('JKM')) index = 'JKM';
        else if (formula.includes('TTF')) index = 'TTF';
        else if (formula.includes('NBP')) index = 'NBP';
        else if (formula.includes('HH')) index = 'HH';
        else if (formula.includes('BRENT') || formula.includes('JCC')) index = 'Oil';
        else if (formula.includes('AECO')) index = 'AECO';
        
        // Normalize Volume to MMBtu for aggregation
        let vol = p.deliveredVolume || 0;
        const unit = p.volumeUnit || detectUnit(formula);
        if (unit === 'bbl') vol = vol * 5.8;
        else if (unit === 'm3') vol = vol * 24; // LNG m3 to MMBtu approx (depends on density)
        else if (unit === 'MT') vol = vol * 52; // LNG MT to MMBtu approx
        
        entry[index] = (entry[index] || 0) + vol;
    });
    
    return Array.from(exposureMap.values()).sort((a: any, b: any) => a.date.localeCompare(b.date));
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
    
    // Use the LATEST forward curve for pricing unless specific logic is added to find "Curve As Of X Date"
    // In this implementation, we assume we want the *Latest* view of the market.
    const latestCurve = getForwardCurve(); 

    if (referenceDate && latestCurve.length > 0) {
        const targetMonth = normalizeDateToMonth(referenceDate);
        const forwardRow = latestCurve.find(r => r.month === targetMonth);
        
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
    
    // Update Pricing End Date automatically based on formula if missing
    if (!updated.pricingEndDate && updated.deliveryDate) {
        updated.pricingEndDate = estimatePricingDate(updated.sellFormula || updated.buyFormula || '', updated.deliveryDate);
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