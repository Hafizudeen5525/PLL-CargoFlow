export function isUnallocatedBuyer(buyerName?: string): boolean {
  if (!buyerName || !buyerName.trim()) return true;
  const b = buyerName.trim().toUpperCase();
  if (['SPOT', 'UA', 'UNALLOCATED', 'TBD', 'NONE', 'OPEN', 'NO BUYER', 'SPOT/UA', 'UA/SPOT', 'SPOT / UA', 'UA / SPOT', 'OPEN ON SELL', 'OPEN ON SELL LEG'].includes(b)) {
    return true;
  }
  const tokens = b.split(/[\s/\\_-]+/).filter(Boolean);
  if (tokens.length > 0 && tokens.every(t => ['SPOT', 'UA', 'UNALLOCATED', 'TBD', 'OPEN', 'CARGO', 'NO', 'BUYER'].includes(t))) {
    return true;
  }
  if (tokens.includes('SPOT') || tokens.includes('UA') || tokens.includes('UNALLOCATED') || tokens.includes('TBD')) {
    const nonUnallocTokens = tokens.filter(t => !['SPOT', 'UA', 'UNALLOCATED', 'TBD', 'CARGO', 'SALE', 'SALES', 'LEG', 'OPEN', 'TRADE', 'NO', 'BUYER'].includes(t));
    if (nonUnallocTokens.length === 0) return true;
  }
  return false;
}

export function getEstimatedSellRows(underlyingRows: any[]): any[] {
  if (!underlyingRows || underlyingRows.length === 0) return [];

  // Filter criteria:
  // Buy/Sell = Buy
  // Instrument Type = COMM-PHYS
  // Cashflow Type = Commodity
  // Settlement Type = Physical Settlement
  const buyPhysRows = underlyingRows.filter(r => {
    const bs = String(r['Buy_Sell'] || r['BuySell'] || '').trim().toLowerCase();
    const ins = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
    const cflow = String(r['Cflow Type'] || '').trim().toLowerCase();
    const sett = String(r['Settlement Type'] || '').trim().toLowerCase();

    return (bs === 'buy' || bs === 'buys') &&
           ins === 'COMM-PHYS' &&
           cflow === 'commodity' &&
           sett === 'physical settlement';
  });

  if (buyPhysRows.length > 0) {
    // Prefer using Optimization LNG over Base LNG. If there's no Optimization then use Base
    const optRows = buyPhysRows.filter(r => {
      const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
      return port === 'optimization lng' || port.includes('optimization');
    });

    if (optRows.length > 0) {
      return optRows;
    }

    const baseRows = buyPhysRows.filter(r => {
      const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
      return port === 'base lng' || port.includes('base');
    });

    if (baseRows.length > 0) {
      return baseRows;
    }

    return buyPhysRows;
  }

  // Fallback if no explicit "Physical Settlement" match: try Buy + COMM-PHYS + Commodity
  const fallbackBuyRows = underlyingRows.filter(r => {
    const bs = String(r['Buy_Sell'] || r['BuySell'] || '').trim().toLowerCase();
    const ins = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
    const cflow = String(r['Cflow Type'] || '').trim().toLowerCase();
    return (bs === 'buy' || bs === 'buys') && ins === 'COMM-PHYS' && cflow === 'commodity';
  });

  if (fallbackBuyRows.length > 0) {
    const optRows = fallbackBuyRows.filter(r => {
      const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
      return port === 'optimization lng' || port.includes('optimization');
    });
    if (optRows.length > 0) return optRows;

    const baseRows = fallbackBuyRows.filter(r => {
      const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
      return port === 'base lng' || port.includes('base');
    });
    return baseRows.length > 0 ? baseRows : fallbackBuyRows;
  }

  return [];
}

export function normalizeStrategyKey(name: string): string {
  if (!name) return '';
  return name
    .trim()
    .toUpperCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')');
}

export function getMidpointDate(rawStart: any, rawEnd: any): { year: number; month: number; day: number } | null {
  const pStart = parseFlexibleDate(rawStart);
  const pEnd = parseFlexibleDate(rawEnd);

  if (pStart && pEnd) {
    const startMs = Date.UTC(pStart.year, pStart.month, pStart.day);
    const endMs = Date.UTC(pEnd.year, pEnd.month, pEnd.day);
    const midMs = Math.floor((startMs + endMs) / 2);
    const midDate = new Date(midMs);
    return {
      year: midDate.getUTCFullYear(),
      month: midDate.getUTCMonth(),
      day: midDate.getUTCDate()
    };
  } else if (pStart) {
    return pStart;
  } else if (pEnd) {
    return pEnd;
  }
  return null;
}

export function parseFlexibleDate(val: any): { year: number; month: number; day: number } | null {
  if (val === null || val === undefined || val === '') return null;

  if (typeof val === 'number' || (typeof val === 'string' && /^\d{5}(\.\d+)?$/.test(val.trim()))) {
    const num = Number(val);
    if (num > 20000 && num < 90000) {
      const utcDays = Math.floor(num - 25569);
      const utcMs = utcDays * 86400 * 1000;
      const d = new Date(utcMs);
      return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth(),
        day: d.getUTCDate()
      };
    }
  }

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return {
      year: val.getUTCFullYear(),
      month: val.getUTCMonth(),
      day: val.getUTCDate()
    };
  }

  const str = String(val).trim();
  if (!str) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    if (year > 1900 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  // Month name formats like DD-MMM-YYYY or MMM-DD-YYYY or DD/MMM/YYYY
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const alphaMatch1 = str.match(/^(\d{1,2})[-/\s]+([a-zA-Z]{3,})[-/\s]+(\d{2,4})/);
  if (alphaMatch1) {
    const day = parseInt(alphaMatch1[1], 10);
    const mStr = alphaMatch1[2].toLowerCase().slice(0, 3);
    const month = monthNames.indexOf(mStr);
    let year = parseInt(alphaMatch1[3], 10);
    if (year < 100) year += 2000;
    if (month >= 0 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  const alphaMatch2 = str.match(/^([a-zA-Z]{3,})[-/\s]+(\d{1,2})[-/\s,]+(\d{2,4})/);
  if (alphaMatch2) {
    const mStr = alphaMatch2[1].toLowerCase().slice(0, 3);
    const month = monthNames.indexOf(mStr);
    const day = parseInt(alphaMatch2[2], 10);
    let year = parseInt(alphaMatch2[3], 10);
    if (year < 100) year += 2000;
    if (month >= 0 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  // MM/DD/YYYY or DD/MM/YYYY
  const slashMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (slashMatch) {
    const p1 = parseInt(slashMatch[1], 10);
    const p2 = parseInt(slashMatch[2], 10);
    let year = parseInt(slashMatch[3], 10);
    if (year < 100) year += 2000;

    let month = -1;
    let day = -1;
    if (p1 > 12) {
      day = p1;
      month = p2 - 1;
    } else {
      month = p1 - 1;
      day = p2;
    }
    if (year > 1900 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
      day: d.getUTCDate()
    };
  }

  return null;
}

const formatToMonthYear = (dateStr: any) => {
  if (!dateStr) return '—';
  const parsed = parseFlexibleDate(dateStr);
  if (!parsed) return String(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parsed.month]}-${String(parsed.year).slice(-2)}`;
};

const addUnitVolume = (acc: { [unit: string]: number }, vol: number, unit?: string): { [unit: string]: number } => {
  const absVol = Math.abs(vol);
  if (isNaN(absVol) || !absVol) return acc;
  const u = String(unit || 'MMBtu').trim().toUpperCase();
  let normUnit = 'MMBtu';
  if (u === 'BBL' || u === 'BBLS' || u === 'BARREL' || u === 'BARRELS') {
    normUnit = 'Bbl';
  } else if (u === 'MMBTU' || u === 'MMBTUS') {
    normUnit = 'MMBtu';
  } else if (u === 'MWH' || u === 'MWHS' || u === 'MEGAWATT HOUR' || u === 'MEGAWATT HOURS') {
    normUnit = 'MWh';
  } else if (u === 'GJ' || u === 'GJS' || u === 'GIGAJOULE' || u === 'GIGAJOULES') {
    normUnit = 'GJ';
  } else if (u === 'CARGO' || u === 'CARGOES') {
    normUnit = 'Cargo';
  } else if (u === 'CURRENCY' || u === 'USD' || u === 'EUR' || u === '$') {
    return acc;
  } else if (unit) {
    normUnit = unit.trim();
  }
  acc[normUnit] = (acc[normUnit] || 0) + absVol;
  return acc;
};

export interface TrmsStrategySummary {
  strategyName: string;
  physicalPnLStatus: 'Realized' | 'Unrealized';
  optimisationStatus: 'Yes' | 'No' | 'Alert' | '';
  unallocatedCargo: 'Matched' | 'Open on Sell Leg' | 'Open on Buy Leg' | '';
  buyer: string;
  seller: string;
  exposureMonths: string;
  loadingMonth: string;
  deliveryMonth: string;
  purchaseVolume: number;
  purchaseVolumeByUnit: { [unit: string]: number };
  salesVolume: number;
  salesVolumeByUnit: { [unit: string]: number };
  purchasePrice: number;
  salesPrice: number;
  purchaseCost: number;
  salesRevenue: number;
  shippingRelatedCosts: number;
  hedgingPnL: number;
  hedgingVolume: number;
  hedgingVolumeByUnit: { [unit: string]: number };
  paperVolume: number;
  paperVolumeByUnit: { [unit: string]: number };
  buyTiers: Array<{ vol: number; unit: string; val: number; price: number }>;
  sellTiers: Array<{ vol: number; unit: string; val: number; price: number }>;
  buyCalcRows: any[];
  sellCalcRows: any[];
  underlyingRows: any[];
}

export function computeTrmsSummaryRows(
  rows: any[],
  selectedEodDate: string = 'all',
  selectedYear: string | string[] | Set<string> = 'all'
): TrmsStrategySummary[] {
  if (!rows || rows.length === 0) return [];

  // Filter rows by selected EOD date AND selected PLSB year bucket
  let dateAndYearFilteredRows = rows;
  
  if (selectedEodDate !== 'all') {
    dateAndYearFilteredRows = dateAndYearFilteredRows.filter((row: any) => {
      const dt = String(row['EOD Date'] || row['EOD_Date'] || row['As At Date'] || row['Extract Date'] || row['Run Date'] || '').trim();
      return dt === selectedEodDate;
    });
  }

  if (selectedYear && selectedYear !== 'all') {
    const yearsArr = Array.isArray(selectedYear)
      ? selectedYear
      : (selectedYear instanceof Set ? Array.from(selectedYear) : [selectedYear]);

    if (yearsArr.length > 0 && !yearsArr.includes('all')) {
      dateAndYearFilteredRows = dateAndYearFilteredRows.filter((row: any) => {
        const yr = String(row['Plsb Year Bucket'] || row['Plsb_Year_Bucket'] || row['PLSB Year'] || row['Year'] || '').trim();
        return yearsArr.some(selectedYr => yr.includes(selectedYr));
      });
    }
  }

  const map: Record<string, { strategyName: string; underlyingRows: any[] }> = {};

  dateAndYearFilteredRows.forEach((row: any) => {
    const sn = String(row['Strategy Name'] || row['Strategy'] || row['Strategy_Name'] || row['StrategyName'] || row['SN'] || '').trim();
    if (!sn) return;

    const normKey = normalizeStrategyKey(sn);
    if (!map[normKey]) {
      map[normKey] = { strategyName: sn, underlyingRows: [] };
    }
    map[normKey].underlyingRows.push(row);
  });

  return Object.values(map).map(item => {
    const { strategyName, underlyingRows } = item;

    // Physical P&L Bucket
    const physRows = underlyingRows.filter(r => 
      String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase() === 'COMM-PHYS' && 
      String(r['Cflow Type'] || '').trim().toLowerCase() === 'commodity'
    );
    
    let physicalPnLStatus: 'Realized' | 'Unrealized' = 'Unrealized';
    if (physRows.length > 0) {
      const allActual = physRows.every(r => String(r['Volume Type'] || r['Vol Type'] || '').trim().toLowerCase() === 'actual');
      physicalPnLStatus = allActual ? 'Realized' : 'Unrealized';
    }

    // Optimisation Status
    const hasBase = underlyingRows.some(r => {
      const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
      return port === 'base lng' || port.includes('base');
    });
    const hasOpt = underlyingRows.some(r => {
      const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
      return port === 'optimization lng' || port.includes('optimization');
    });

    let optimisationStatus: 'Yes' | 'No' | 'Alert' | '' = '';
    if (hasBase && hasOpt) {
      optimisationStatus = 'Yes';
    } else if (hasBase && !hasOpt) {
      optimisationStatus = 'No';
    } else if (!hasBase && hasOpt) {
      optimisationStatus = 'Alert';
    } else {
      optimisationStatus = '';
    }

    // Physical cargo rows (Base LNG or Optimization LNG only, excluding DH LNG, DFT LNG, Hedging LNG)
    const physicalCargoRows = underlyingRows.filter(r => {
      const ins = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
      const cflow = String(r['Cflow Type'] || '').trim().toLowerCase();
      const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();

      const isCommodityPhys = ins === 'COMM-PHYS' && cflow === 'commodity';
      const isPaperOrHedge = port === 'dh lng' || port === 'dft lng' || port === 'hedging lng' || port.includes('dh') || port.includes('dft') || port.includes('hedging');

      return isCommodityPhys && !isPaperOrHedge;
    });

    const hasBuy = physicalCargoRows.some(r => {
      const buySell = String(r['Buy_Sell'] || r['BuySell'] || '').trim().toLowerCase();
      return buySell === 'buy' || buySell === 'buys';
    });

    const hasSell = physicalCargoRows.some(r => {
      const buySell = String(r['Buy_Sell'] || r['BuySell'] || '').trim().toLowerCase();
      if (buySell !== 'sell' && buySell !== 'sells') return false;
      const entity = String(r['External Legal Entity'] || r['Buyer'] || r['Legal Entity'] || '').trim();
      return !isUnallocatedBuyer(entity);
    });

    let unallocatedCargo: 'Matched' | 'Open on Sell Leg' | 'Open on Buy Leg' | '' = '';
    if (hasBuy && hasSell) {
      unallocatedCargo = 'Matched';
    } else if (hasBuy && !hasSell) {
      unallocatedCargo = 'Open on Sell Leg';
    } else if (!hasBuy && hasSell) {
      unallocatedCargo = 'Open on Buy Leg';
    } else {
      unallocatedCargo = '';
    }

    let purchaseVolume = 0;
    const purchaseVolumeByUnit: { [unit: string]: number } = {};
    let salesVolume = 0;
    const salesVolumeByUnit: { [unit: string]: number } = {};
    let shippingRelatedCosts = 0;
    let hedgingPnL = 0;
    let hedgingVolume = 0;
    const hedgingVolumeByUnit: { [unit: string]: number } = {};
    let paperVolume = 0;
    const paperVolumeByUnit: { [unit: string]: number } = {};

    let weightedBuyPriceSum = 0;
    let buyPriceVolSum = 0;
    let buyPriceCount = 0;
    let simpleBuyPriceSum = 0;

    let weightedSellPriceSum = 0;
    let sellPriceVolSum = 0;
    let sellPriceCount = 0;
    let simpleSellPriceSum = 0;

    let purchaseCost = 0;
    let salesRevenue = 0;

    let buyCalcRows: any[] = [];
    let sellCalcRows: any[] = [];

    if (hasOpt) {
      if (unallocatedCargo === 'Matched') {
        buyCalcRows = underlyingRows.filter(r => {
          const isBuy = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || '').toLowerCase() === 'buys';
          const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
          const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
          const sett = String(r['Settlement Type'] || '').trim();
          const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
          const isOpt = port === 'optimization lng' || port.includes('optimization');
          return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS' && isOpt && sett !== 'Physical Settlement';
        });
        if (buyCalcRows.length === 0) {
          buyCalcRows = underlyingRows.filter(r => {
            const isBuy = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || '').toLowerCase() === 'buys';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            const isOpt = port === 'optimization lng' || port.includes('optimization');
            return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS' && isOpt;
          });
        }

        sellCalcRows = underlyingRows.filter(r => {
          const isSell = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || '').toLowerCase() === 'sells';
          const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
          const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
          const sett = String(r['Settlement Type'] || '').trim();
          const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
          const isOpt = port === 'optimization lng' || port.includes('optimization');
          return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS' && isOpt && sett !== 'Physical Settlement';
        });
        if (sellCalcRows.length === 0) {
          sellCalcRows = underlyingRows.filter(r => {
            const isSell = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || '').toLowerCase() === 'sells';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            const isOpt = port === 'optimization lng' || port.includes('optimization');
            return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS' && isOpt;
          });
        }
      } else if (unallocatedCargo === 'Open on Buy Leg') {
        buyCalcRows = [];
        sellCalcRows = underlyingRows.filter(r => {
          const isSell = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || '').toLowerCase() === 'sells';
          const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
          const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
          const sett = String(r['Settlement Type'] || '').trim();
          const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
          const isOpt = port === 'optimization lng' || port.includes('optimization');
          return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS' && isOpt && sett !== 'Physical Settlement';
        });
        if (sellCalcRows.length === 0) {
          sellCalcRows = underlyingRows.filter(r => {
            const isSell = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || '').toLowerCase() === 'sells';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            const isOpt = port === 'optimization lng' || port.includes('optimization');
            return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS' && isOpt;
          });
        }
      } else if (unallocatedCargo === 'Open on Sell Leg') {
        sellCalcRows = [];
        buyCalcRows = underlyingRows.filter(r => {
          const isBuy = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || '').toLowerCase() === 'buys';
          const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
          const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
          const sett = String(r['Settlement Type'] || '').trim();
          const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
          const isOpt = port === 'optimization lng' || port.includes('optimization');
          return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS' && isOpt && sett !== 'Physical Settlement';
        });
        if (buyCalcRows.length === 0) {
          buyCalcRows = underlyingRows.filter(r => {
            const isBuy = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || '').toLowerCase() === 'buys';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            const isOpt = port === 'optimization lng' || port.includes('optimization');
            return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS' && isOpt;
          });
        }
      } else {
        buyCalcRows = underlyingRows.filter(r => {
          const isBuy = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || '').toLowerCase() === 'buys';
          const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
          const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
          const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
          return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS' && (port === 'optimization lng' || port.includes('optimization'));
        });
        sellCalcRows = underlyingRows.filter(r => {
          const isSell = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || '').toLowerCase() === 'sells';
          const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
          const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
          const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
          return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS' && (port === 'optimization lng' || port.includes('optimization'));
        });
      }
    } else {
      if (unallocatedCargo === 'Open on Buy Leg' || (!hasBuy && hasSell)) {
        buyCalcRows = [];
        sellCalcRows = underlyingRows.filter(r => {
          const isSell = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || '').toLowerCase() === 'sells';
          const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
          const sett = String(r['Settlement Type'] || '').trim();
          const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
          return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS' && sett !== 'Physical Settlement';
        });
        if (sellCalcRows.length === 0) {
          sellCalcRows = underlyingRows.filter(r => {
            const isSell = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || '').toLowerCase() === 'sells';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS';
          });
        }
      } else if (unallocatedCargo === 'Open on Sell Leg' || (hasBuy && !hasSell)) {
        sellCalcRows = [];
        buyCalcRows = underlyingRows.filter(r => {
          const isBuy = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || '').toLowerCase() === 'buys';
          const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
          const sett = String(r['Settlement Type'] || '').trim();
          const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
          return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS' && sett !== 'Physical Settlement';
        });
        if (buyCalcRows.length === 0) {
          buyCalcRows = underlyingRows.filter(r => {
            const isBuy = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || '').toLowerCase() === 'buys';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS';
          });
        }
      } else if (hasBuy && hasSell) {
        buyCalcRows = underlyingRows.filter(r => {
          const isBuy = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || '').toLowerCase() === 'buys';
          const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
          const sett = String(r['Settlement Type'] || '').trim();
          const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
          return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS' && sett !== 'Physical Settlement';
        });
        if (buyCalcRows.length === 0) {
          buyCalcRows = underlyingRows.filter(r => {
            const isBuy = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'buy' || String(r['Buy_Sell'] || '').toLowerCase() === 'buys';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            return isBuy && cflowType === 'commodity' && insType === 'COMM-PHYS';
          });
        }

        sellCalcRows = underlyingRows.filter(r => {
          const isSell = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || '').toLowerCase() === 'sells';
          const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
          const sett = String(r['Settlement Type'] || '').trim();
          const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
          return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS' && sett !== 'Physical Settlement';
        });
        if (sellCalcRows.length === 0) {
          sellCalcRows = underlyingRows.filter(r => {
            const isSell = String(r['Buy_Sell'] || r['BuySell'] || '').toLowerCase() === 'sell' || String(r['Buy_Sell'] || '').toLowerCase() === 'sells';
            const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
            const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
            return isSell && cflowType === 'commodity' && insType === 'COMM-PHYS';
          });
        }
      }
    }

    if (sellCalcRows.length === 0) {
      sellCalcRows = getEstimatedSellRows(underlyingRows);
    }

    const getVolType = (r: any) => String(r['Volume Type'] || r['Vol Type'] || r['VolType'] || r['Volume_Type'] || '').trim();

    if (buyCalcRows.some(r => getVolType(r) === 'Actual')) {
      buyCalcRows = buyCalcRows.filter(r => getVolType(r) === 'Actual');
    }
    if (sellCalcRows.some(r => getVolType(r) === 'Actual')) {
      sellCalcRows = sellCalcRows.filter(r => getVolType(r) === 'Actual');
    }

    const relevantCalcRows = [...buyCalcRows, ...sellCalcRows];
    if (relevantCalcRows.length > 0) {
      const allActual = relevantCalcRows.every(r => getVolType(r) === 'Actual');
      physicalPnLStatus = allActual ? 'Realized' : 'Unrealized';
    }

    underlyingRows.forEach(r => {
      const rawVol = Number(String(r['Volume'] || '').replace(/[^0-9.-]/g, ''));
      const absVol = isNaN(rawVol) ? 0 : Math.abs(rawVol);
      const unit = r['Unit'] || r['unit'];
      const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));

      const cflowType = String(r['Cflow Type'] || '').trim().toLowerCase();
      const internalPortfolio = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();
      const insType = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();

      const isCommodity = cflowType === 'commodity' && insType === 'COMM-PHYS';
      const isHedgingLng = internalPortfolio === 'hedging lng';
      const isPaperLng = internalPortfolio === 'dh lng' || internalPortfolio === 'dft lng';

      let includeCommodityVol = true;
      if (isCommodity) {
        if (!buyCalcRows.includes(r) && !sellCalcRows.includes(r)) {
          includeCommodityVol = false;
        }
      }

      if (absVol > 0 && includeCommodityVol) {
        if (isHedgingLng) {
          hedgingVolume += absVol;
          addUnitVolume(hedgingVolumeByUnit, absVol, unit);
        } else if (isPaperLng) {
          paperVolume += absVol;
          addUnitVolume(paperVolumeByUnit, absVol, unit);
        }
      }
      if (!isNaN(val)) {
        if (cflowType === 'src- shipping related cost' || cflowType.includes('shipping related cost')) {
          if (hasOpt) {
            const isOptRow = internalPortfolio === 'optimization lng' || internalPortfolio.includes('optimization');
            if (isOptRow) {
              shippingRelatedCosts += val;
            }
          } else {
            shippingRelatedCosts += val;
          }
        }

        if (isHedgingLng) {
          hedgingPnL += val;
        }
      }
    });

    let buyTiers: Array<{ vol: number; unit: string; val: number; price: number }> = [];
    if (buyCalcRows.length >= 2) {
      buyTiers = buyCalcRows.map(r => {
        const rawVol = Number(String(r['Volume'] || '').replace(/[^0-9.-]/g, ''));
        const absVol = isNaN(rawVol) ? 0 : Math.abs(rawVol);
        const unit = String(r['Unit'] || r['unit'] || 'MMBtu').trim();
        const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
        const price = Number(String(r['Price'] || '').replace(/[^0-9.-]/g, ''));
        return {
          vol: absVol,
          unit,
          val: isNaN(val) ? 0 : Math.abs(val),
          price: isNaN(price) ? 0 : Math.abs(price)
        };
      });
    }

    buyCalcRows.forEach(r => {
      const rawVol = Number(String(r['Volume'] || '').replace(/[^0-9.-]/g, ''));
      const absVol = isNaN(rawVol) ? 0 : Math.abs(rawVol);
      const unit = r['Unit'] || r['unit'];
      const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
      const price = Number(String(r['Price'] || '').replace(/[^0-9.-]/g, ''));

      if (absVol > 0) {
        purchaseVolume += absVol;
        addUnitVolume(purchaseVolumeByUnit, absVol, unit);
      }
      if (!isNaN(val)) {
        purchaseCost += Math.abs(val);
      }
      if (!isNaN(price) && Math.abs(price) > 0) {
        if (absVol > 0) {
          weightedBuyPriceSum += Math.abs(price) * absVol;
          buyPriceVolSum += absVol;
        }
        simpleBuyPriceSum += Math.abs(price);
        buyPriceCount++;
      }
    });

    let sellTiers: Array<{ vol: number; unit: string; val: number; price: number }> = [];
    if (sellCalcRows.length >= 2) {
      sellTiers = sellCalcRows.map(r => {
        const rawVol = Number(String(r['Volume'] || '').replace(/[^0-9.-]/g, ''));
        const absVol = isNaN(rawVol) ? 0 : Math.abs(rawVol);
        const unit = String(r['Unit'] || r['unit'] || 'MMBtu').trim();
        const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
        const price = Number(String(r['Price'] || '').replace(/[^0-9.-]/g, ''));
        return {
          vol: absVol,
          unit,
          val: isNaN(val) ? 0 : Math.abs(val),
          price: isNaN(price) ? 0 : Math.abs(price)
        };
      });
    }

    sellCalcRows.forEach(r => {
      const rawVol = Number(String(r['Volume'] || '').replace(/[^0-9.-]/g, ''));
      const absVol = isNaN(rawVol) ? 0 : Math.abs(rawVol);
      const unit = r['Unit'] || r['unit'];
      const val = Number(String(r['Base_Total_Value_USD'] || '').replace(/[^0-9.-]/g, ''));
      const price = Number(String(r['Price'] || '').replace(/[^0-9.-]/g, ''));

      if (absVol > 0) {
        salesVolume += absVol;
        addUnitVolume(salesVolumeByUnit, absVol, unit);
      }
      if (!isNaN(val) && Math.abs(val) > 0) {
        salesRevenue += Math.abs(val);
      } else if (absVol > 0 && !isNaN(price) && Math.abs(price) > 0) {
        salesRevenue += absVol * Math.abs(price);
      }
      if (!isNaN(price) && Math.abs(price) > 0) {
        if (absVol > 0) {
          weightedSellPriceSum += Math.abs(price) * absVol;
          sellPriceVolSum += absVol;
        }
        simpleSellPriceSum += Math.abs(price);
        sellPriceCount++;
      }
    });

    const purchasePrice = buyPriceVolSum > 0 
      ? weightedBuyPriceSum / buyPriceVolSum 
      : (buyPriceCount > 0 ? simpleBuyPriceSum / buyPriceCount : 0);

    const salesPrice = sellPriceVolSum > 0 
      ? weightedSellPriceSum / sellPriceVolSum 
      : (sellPriceCount > 0 ? simpleSellPriceSum / sellPriceCount : 0);

    const explicitMonths = new Set<string>();
    underlyingRows.forEach((r: any) => {
      const aliases = ['Exposure Month', 'ExposureMonth', 'Pricing Month', 'PricingMonth', 'Month', 'Delivery Month', 'DeliveryMonth'];
      for (const alias of aliases) {
        const val = r[alias];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          explicitMonths.add(String(val).trim());
          break;
        }
      }
    });

    let exposureMonths = '—';
    if (explicitMonths.size > 0) {
      exposureMonths = Array.from(explicitMonths).join(', ');
    }

    // EXCEL FORMULA MATCHING FOR LOADING MONTH:
    // =IFERROR(EOMONTH(IF(BG12="No",
    //   IF(BJ12="Open on Buy Leg",
    //     GETPIVOTDATA("Min of Start Date",..., "Buy_Sell","Sell","Ins Type","COMM-PHYS","Cflow Type","Commodity","Settlement Type","Physical Settlement","Internal Portfolio","Base LNG"),
    //     GETPIVOTDATA("Min of Start Date",..., "Buy_Sell","Buy","Ins Type","COMM-PHYS","Cflow Type","Commodity","Settlement Type","Cash Settlement","Internal Portfolio","Base LNG")
    //   ),
    //   IF(BJ12="Open on Buy Leg",
    //     GETPIVOTDATA("Min of Start Date",..., "Buy_Sell","Sell","Ins Type","COMM-PHYS","Cflow Type","Commodity","Settlement Type","Physical Settlement","Internal Portfolio","Optimization LNG"),
    //     GETPIVOTDATA("Min of Start Date",..., "Buy_Sell","Buy","Ins Type","COMM-PHYS","Cflow Type","Commodity","Settlement Type","Cash Settlement","Internal Portfolio","Optimization LNG")
    //   )
    // ),0),"")

    const calcLoadingMonth = (): string => {
      const targetPort = (optimisationStatus === 'No') ? 'base lng' : 'optimization lng';
      const isOpenOnBuyLeg = unallocatedCargo === 'Open on Buy Leg';
      const targetBuySell = isOpenOnBuyLeg ? 'sell' : 'buy';

      // 1. Try with portfolio and Buy/Sell
      let matchedRows = underlyingRows.filter((r: any) => {
        const bs = String(r['Buy_Sell'] || r['BuySell'] || '').trim().toLowerCase();
        const ins = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
        const cflow = String(r['Cflow Type'] || '').trim().toLowerCase();
        const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();

        const bsMatch = bs === targetBuySell || bs === targetBuySell + 's';
        const insMatch = ins === 'COMM-PHYS';
        const cflowMatch = cflow === 'commodity';
        const portMatch = port === targetPort || port.includes(targetPort === 'base lng' ? 'base' : 'optimization');

        return bsMatch && insMatch && cflowMatch && portMatch;
      });

      // 2. Fallback matching target Buy/Sell leg in any portfolio
      if (matchedRows.length === 0) {
        matchedRows = underlyingRows.filter((r: any) => {
          const bs = String(r['Buy_Sell'] || r['BuySell'] || '').trim().toLowerCase();
          const ins = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
          const cflow = String(r['Cflow Type'] || '').trim().toLowerCase();

          const bsMatch = bs === targetBuySell || bs === targetBuySell + 's';
          const insMatch = ins === 'COMM-PHYS';
          const cflowMatch = cflow === 'commodity';

          return bsMatch && insMatch && cflowMatch;
        });
      }

      // 3. Fallback: match any COMM-PHYS commodity row
      if (matchedRows.length === 0) {
        matchedRows = underlyingRows.filter((r: any) => {
          const ins = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
          const cflow = String(r['Cflow Type'] || '').trim().toLowerCase();
          return ins === 'COMM-PHYS' && cflow === 'commodity';
        });
      }

      let minParsed: { year: number; month: number; day: number } | null = null;
      let minVal = Infinity;

      matchedRows.forEach((r: any) => {
        const rawStart = r['Start Date'] || r['Start_Date'] || r['Comm Window Start Date'] || r['Comm_Window_Start_Date'] || r['CommWindowStartDate'];
        const rawEnd = r['End Date'] || r['End_Date'] || r['Comm Window End Date'] || r['Comm_Window_End_Date'] || r['CommWindowEndDate'];
        const parsed = getMidpointDate(rawStart, rawEnd);
        if (parsed) {
          const val = parsed.year * 10000 + (parsed.month + 1) * 100 + parsed.day;
          if (val < minVal) {
            minVal = val;
            minParsed = parsed;
          }
        }
      });

      if (!minParsed) return '—';

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[(minParsed as { year: number; month: number; day: number }).month]}-${String((minParsed as { year: number; month: number; day: number }).year).slice(-2)}`;
    };

    const calcDeliveryMonth = (): string => {
      const targetPort = (optimisationStatus === 'No') ? 'base lng' : 'optimization lng';
      const isOpenOnSellLeg = unallocatedCargo === 'Open on Sell Leg';
      const targetBuySell = isOpenOnSellLeg ? 'buy' : 'sell';

      let matchedRows = underlyingRows.filter((r: any) => {
        const bs = String(r['Buy_Sell'] || r['BuySell'] || '').trim().toLowerCase();
        const ins = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
        const cflow = String(r['Cflow Type'] || '').trim().toLowerCase();
        const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();

        const bsMatch = bs === targetBuySell || bs === targetBuySell + 's';
        const insMatch = ins === 'COMM-PHYS';
        const cflowMatch = cflow === 'commodity';
        const portMatch = port === targetPort || port.includes(targetPort === 'base lng' ? 'base' : 'optimization');

        return bsMatch && insMatch && cflowMatch && portMatch;
      });

      if (matchedRows.length === 0) {
        matchedRows = underlyingRows.filter((r: any) => {
          const bs = String(r['Buy_Sell'] || r['BuySell'] || '').trim().toLowerCase();
          const ins = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
          const cflow = String(r['Cflow Type'] || '').trim().toLowerCase();

          const bsMatch = bs === targetBuySell || bs === targetBuySell + 's';
          const insMatch = ins === 'COMM-PHYS';
          const cflowMatch = cflow === 'commodity';

          return bsMatch && insMatch && cflowMatch;
        });
      }

      if (matchedRows.length === 0) {
        matchedRows = underlyingRows.filter((r: any) => {
          const ins = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
          const cflow = String(r['Cflow Type'] || '').trim().toLowerCase();
          return ins === 'COMM-PHYS' && cflow === 'commodity';
        });
      }

      let minParsed: { year: number; month: number; day: number } | null = null;
      let minVal = Infinity;

      matchedRows.forEach((r: any) => {
        const rawStart = r['Start Date'] || r['Start_Date'] || r['Comm Window Start Date'] || r['Comm_Window_Start_Date'] || r['CommWindowStartDate'];
        const rawEnd = r['End Date'] || r['End_Date'] || r['Comm Window End Date'] || r['Comm_Window_End_Date'] || r['CommWindowEndDate'];
        const parsed = getMidpointDate(rawStart, rawEnd);
        if (parsed) {
          const val = parsed.year * 10000 + (parsed.month + 1) * 100 + parsed.day;
          if (val < minVal) {
            minVal = val;
            minParsed = parsed;
          }
        }
      });

      if (!minParsed) return '—';

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[(minParsed as { year: number; month: number; day: number }).month]}-${String((minParsed as { year: number; month: number; day: number }).year).slice(-2)}`;
    };

    const loadingMonth = calcLoadingMonth();
    const deliveryMonth = calcDeliveryMonth();

    const extractEntity = (calcRows: any[], fallbackRows: any[], targetBs: 'sell' | 'buy'): string => {
      let sourceRows = (calcRows || []).filter((r: any) => {
        const bs = String(r['Buy_Sell'] || r['BuySell'] || '').trim().toLowerCase();
        return bs === targetBs || bs === targetBs + 's';
      });

      if (!sourceRows || sourceRows.length === 0) {
        sourceRows = (fallbackRows || []).filter((r: any) => {
          const bs = String(r['Buy_Sell'] || r['BuySell'] || '').trim().toLowerCase();
          const ins = String(r['Ins Type'] || r['Instrument Type'] || '').trim().toUpperCase();
          const cflow = String(r['Cflow Type'] || '').trim().toLowerCase();
          const port = String(r['Internal Portfolio'] || r['Portfolio'] || '').trim().toLowerCase();

          const bsMatch = bs === targetBs || bs === targetBs + 's';
          const isCommodityPhys = ins === 'COMM-PHYS' && cflow === 'commodity';
          const isPaperOrHedge = port === 'dh lng' || port === 'dft lng' || port === 'hedging lng' || port.includes('dh') || port.includes('dft') || port.includes('hedging');

          return bsMatch && isCommodityPhys && !isPaperOrHedge;
        });
      }

      const entities = new Set<string>();
      sourceRows.forEach((r: any) => {
        const ent = String(
          r['External Legal Entity'] ||
          r['External_Legal_Entity'] ||
          r['External Legal Entity Name'] ||
          r['Legal Entity'] ||
          r['Counterparty'] ||
          (targetBs === 'sell' ? (r['Buyer'] || r['Customer']) : (r['Seller'] || r['Supplier'])) ||
          ''
        ).trim();

        if (ent && !isUnallocatedBuyer(ent)) {
          entities.add(ent);
        }
      });

      if (entities.size > 0) {
        return Array.from(entities).join(', ');
      }
      return 'Spot';
    };

    const buyer = extractEntity(sellCalcRows, underlyingRows, 'sell');
    const seller = extractEntity(buyCalcRows, underlyingRows, 'buy');

    return {
      strategyName,
      physicalPnLStatus,
      optimisationStatus,
      unallocatedCargo,
      buyer,
      seller,
      exposureMonths,
      loadingMonth,
      deliveryMonth,
      purchaseVolume,
      purchaseVolumeByUnit,
      salesVolume,
      salesVolumeByUnit,
      purchasePrice,
      salesPrice,
      purchaseCost,
      salesRevenue,
      shippingRelatedCosts,
      hedgingPnL,
      hedgingVolume,
      hedgingVolumeByUnit,
      paperVolume,
      paperVolumeByUnit,
      buyTiers,
      sellTiers,
      buyCalcRows,
      sellCalcRows,
      underlyingRows
    };
  });
}
