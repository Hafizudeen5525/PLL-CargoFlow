/**
 * Index Name & Month Definition Renaming Rules for TRMS / Jarvis Data
 */

export const INDEX_RENAMING_MAP: Record<string, string> = {
  // Crude Dated Brent / JCC / Dtd Brent
  "Crude_Dated_Brent -- LNG_Detailed JCC (M)": "JCC (M)",
  "Crude_Dated_Brent -- LNG_Dtd Brent (M)": "Dtd Brent (M)",
  "Crude_Dated_Brent -- LNG_Dtd Brent (M-1)": "Dtd Brent (M-1)",
  "Crude_Dated_Brent -- LNG_Dtd Brent (M-2)": "Dtd Brent (M-2)",
  "Crude_Dated_Brent -- LNG_Dtd Brent (M-3)": "Dtd Brent (M-3)",
  "Crude_Dated_Brent -- LNG_Dtd Brent (M-4)": "Dtd Brent (M-4)",
  "Crude_Dated_Brent -- LNG_Dtd Brent (M-6)": "Dtd Brent (M-6)",
  "Crude_Dated_Brent -- LNG_Swap month": "Crude_Dated_Brent -- LNG_Swap month",
  "Crude_Dated_Brent -- None": "Crude_Dated_Brent -- None",

  // AECO
  "FUT_AECO_7A_USD_STTLEMT -- LNG_Range pricing_Fut_AECO": "FUT_AECO_7A_USD_STTLEMT -- LNG_Range pricing_Fut_AECO",
  "FUT_AECO_ICE_CAD -- LNG_Range pricing_Fut_AECO": "FUT_AECO_ICE_CAD -- LNG_Range pricing_Fut_AECO",
  "FUT_AECO_ICE_CAD -- Physical Value": "FUT_AECO_ICE_CAD -- Physical Value",
  "FUT_AECO_ICE_USD -- LNG_Nymex HH - Bullet DelvPeriod": "FUT_AECO_ICE_USD -- LNG_Nymex HH - Bullet DelvPeriod",
  "FUT_AECO_ICE_USD -- LNG_Range pricing_Fut_AECO": "FUT_AECO_ICE_USD -- LNG_Range pricing_Fut_AECO",
  "FUT_AECO_ICE_USD -- None": "FUT_AECO_ICE_USD -- None",
  "FUT_AECO_ICE_USD -- Physical Value": "FUT_AECO_ICE_USD -- Physical Value",

  // FUT Brent Crude ICE
  "FUT_Brent_Crude_ICE -- LNG_BRIPE (M) ICE Brent FL": "Brent (M)",
  "FUT_Brent_Crude_ICE -- LNG_BRIPE (M-1) ICE Brent FL": "Brent (M-1)",
  "FUT_Brent_Crude_ICE -- LNG_BRIPE (M-2) ICE Brent FL": "Brent (M-2)",
  "FUT_Brent_Crude_ICE -- LNG_BRIPE (M-3) ICE Brent FL": "Brent (M-3)",
  "FUT_Brent_Crude_ICE -- LNG_BRIPE (M-4) ICE Brent FL": "Brent (M-4)",
  "FUT_Brent_Crude_ICE -- LNG_BRIPE (M-5) ICE Brent FL": "Brent (M-5)",
  "FUT_Brent_Crude_ICE -- LNG_BRIPE (M-6) ICE Brent FL": "Brent (M-6)",
  "FUT_Brent_Crude_ICE -- LNG_BRIPE (M-6) ICE Brent Trafi": "Brent (M-6)",
  "FUT_Brent_Crude_ICE -- LNG_BRIPE (M-7) ICE Brent FL": "Brent (M-7)",
  "FUT_Brent_Crude_ICE -- LNG_Dtd Brent (M)": "Dtd Brent (M)",
  "FUT_Brent_Crude_ICE -- LNG_Dtd Brent (M-1)": "Dtd Brent (M-1)",
  "FUT_Brent_Crude_ICE -- LNG_Dtd Brent (M-2)": "Dtd Brent (M-2)",
  "FUT_Brent_Crude_ICE -- LNG_Dtd Brent (M-3)": "Dtd Brent (M-3)",
  "FUT_Brent_Crude_ICE -- None": "FUT_Brent_Crude_ICE -- None",
  "FUT_Brent_Crude_ICE_BRN -- LNG_BRIPE (M-1) ICE Brent FL": "Brent (M-1)",
  "FUT_Brent_Crude_ICE_BRN -- LNG_ICEBrent Swap month": "FUT_Brent_Crude_ICE_BRN -- LNG_ICEBrent Swap month",
  "FUT_Brent_Crude_ICE_BRN -- None": "FUT_Brent_Crude_ICE_BRN -- None",

  // FUT HH NYMEX
  "FUT_HH_NYMEX -- LNG M-1 average": "FUT_HH_NYMEX -- LNG M-1 average",
  "FUT_HH_NYMEX -- LNG_Nymex HH - Bullet (M+!)": "HH (M+1)",
  "FUT_HH_NYMEX -- LNG_Nymex HH - Bullet (M+1)": "HH (M+1)",
  "FUT_HH_NYMEX -- LNG_Nymex HH - Bullet DelvPeriod": "FUT_HH_NYMEX -- LNG_Nymex HH - Bullet DelvPeriod",
  "FUT_HH_NYMEX -- LNG_Nymex HH - Bullet DP (M)": "HH (M)",
  "FUT_HH_NYMEX -- LNG_Nymex HH - Bullet DP (M-1)": "HH (M-1)",
  "FUT_HH_NYMEX -- LNG_Nymex HH - Contract Average": "FUT_HH_NYMEX -- LNG_Nymex HH - Contract Average",
  "FUT_HH_NYMEX -- LNG_Nymex HH - Swap Contract": "FUT_HH_NYMEX -- LNG_Nymex HH - Swap Contract",
  "FUT_HH_NYMEX -- None": "FUT_HH_NYMEX -- None",
  "FUT_HH_NYMEX -- PETCO_Range pricing phys": "FUT_HH_NYMEX -- PETCO_Range pricing phys",

  // JKM
  "FUT_JKM_ICE -- None": "FUT_JKM_ICE -- None",

  // NBP / TTF
  "FUT_NBP_M_ICE -- LNG_ICE NBP/TTF - Contract Avg": "FUT_NBP_M_ICE -- LNG_ICE NBP/TTF - Contract Avg",
  "FUT_NBP_M_ICE -- LNG_ICE NBP/TTF-Trade M Avg Spot": "NBP (M)",
  "FUT_NBP_M_ICE -- LNG_NBP_ICE_Swap month": "FUT_NBP_M_ICE -- LNG_NBP_ICE_Swap month",
  "FUT_NBP_M_ICE -- None": "FUT_NBP_M_ICE -- None",
  "FUT_NBP_M_ICE_USD -- LNG_NBP_ICE_Swap month": "FUT_NBP_M_ICE_USD -- LNG_NBP_ICE_Swap month",
  "FUT_TTF_M_ICE_Endex -- LNG_TTF_ICE_Swap month": "FUT_TTF_M_ICE_Endex -- LNG_TTF_ICE_Swap month",
  "FUT_TTF_M_ICE_Endex -- None": "FUT_TTF_M_ICE_Endex -- None",
  "FUT_TTF_M_ICE_Endex_USD.MMBTU -- LNG_TTF_ICE_Swap month": "FUT_TTF_M_ICE_Endex_USD.MMBTU -- LNG_TTF_ICE_Swap month",
  "FUT_TTF_M_ICE_Endex_USD.MMBTU -- None": "FUT_TTF_M_ICE_Endex_USD.MMBTU -- None",

  // FX
  "FX_BOE_GBP.USD -- LNG_BOE": "FX_BOE_GBP.USD -- LNG_BOE",
  "FX_USD.MYR -- Invoice_FX": "FX_USD.MYR -- Invoice_FX",

  // LNG DES JKM
  "LNG_DES_JKM -- LNG_JKM - Swap Contract": "LNG_DES_JKM -- LNG_JKM - Swap Contract",
  "LNG_DES_JKM -- LNG_JKM (M) Contract Avg": "JKM (M)",
  "LNG_DES_JKM -- LNG_JKM (M+1) Contract Avg": "JKM (M+1)",
  "LNG_DES_JKM -- LNG_JKM (M+2) Contract Avg": "JKM (M+2)",
  "LNG_DES_JKM -- LNG_JKM (M-1) Contract Avg": "JKM (M-1)",
  "LNG_DES_JKM -- None": "LNG_DES_JKM -- None",
  "LNG_DES_JKM -- Physical Value": "LNG_DES_JKM -- Physical Value",

  // LNG DES JKM PHYS 1lom
  "LNG_DES_JKM_PHYS_1lom -- LNG_BRIPE (M-1) ICE Brent FL": "Brent (M-1)",
  "LNG_DES_JKM_PHYS_1lom -- LNG_BRIPE (M-2) ICE Brent FL": "Brent (M-2)",
  "LNG_DES_JKM_PHYS_1lom -- LNG_BRIPE (M-3) ICE Brent FL": "Brent (M-3)",
  "LNG_DES_JKM_PHYS_1lom -- LNG_JKM - Swap Contract": "LNG_DES_JKM_PHYS_1lom -- LNG_JKM - Swap Contract",
  "LNG_DES_JKM_PHYS_1lom -- LNG_JKM (M) Contract Avg": "JKM (M)",
  "LNG_DES_JKM_PHYS_1lom -- LNG_Nymex HH - Bullet (M+!)": "HH (M+1)",
  "LNG_DES_JKM_PHYS_1lom -- LNG_Nymex HH - Bullet (M+1)": "HH (M+1)",
  "LNG_DES_JKM_PHYS_1lom -- None": "LNG_DES_JKM_PHYS_1lom -- None",
  "LNG_DES_JKM_PHYS_1lom -- Physical Value": "LNG_DES_JKM_PHYS_1lom -- Physical Value",

  // Other LNG Physicals
  "LNG_DES_MEM -- Physical Value": "LNG_DES_MEM -- Physical Value",
  "LNG_DES_SE_ASIA -- LNG_JKM - Swap Contract": "LNG_DES_SE_ASIA -- LNG_JKM - Swap Contract",
  "LNG_DES_SE_ASIA -- Physical Value": "LNG_DES_SE_ASIA -- Physical Value",
  "LNG_DES_SWE -- Physical Value": "LNG_DES_SWE -- Physical Value",
  "LNG_DES_WEST_IND -- Physical Value": "LNG_DES_WEST_IND -- Physical Value",
  "LNG_FOB_ALGERIA -- Physical Value": "LNG_FOB_ALGERIA -- Physical Value",
  "LNG_FOB_AUSTRALIA -- Physical Value": "LNG_FOB_AUSTRALIA -- Physical Value",
  "LNG_FOB_NIGERIA -- Physical Value": "LNG_FOB_NIGERIA -- Physical Value",
  "LNG_FOB_SPAIN -- Physical Value": "LNG_FOB_SPAIN -- Physical Value",
  "LNG_FOB_US_GULF_COAST -- Physical Value": "LNG_FOB_US_GULF_COAST -- Physical Value",

  // LNG JCC
  "LNG_JCC -- LNG_Detailed JCC (M)": "JCC (M)",
  "LNG_JCC -- LNG_Detailed JCC (M) Swap": "LNG_JCC -- LNG_Detailed JCC (M) Swap",
  "LNG_JCC -- LNG_Detailed JCC (M-1)": "JCC (M-1)",
  "LNG_JCC -- LNG_Detailed JCC (M-2)": "JCC (M-2)",
  "LNG_JCC -- LNG_Detailed JCC (M-3)": "JCC (M-3)",
  "LNG_JCC -- LNG_Detailed JCC (M-4)": "JCC (M-4)",
  "LNG_JCC -- LNG_Detailed JCC (M-5)": "JCC (M-5)",
  "LNG_JCC -- LNG_Detailed JCC (M-6)": "JCC (M-6)",
  "LNG_JCC -- LNG_Detailed JCC (M-7)": "JCC (M-7)",
  "LNG_JCC -- LNG_Provisional JCC (M)": "JCC (M)",
  "LNG_JCC -- LNG_Provisional JCC (M-2)": "JCC (M-2)",
  "LNG_JCC -- LNG_Provisional JCC (M-3)": "JCC (M-3)",
  "LNG_JCC -- None": "LNG_JCC -- None",

  // LNG JCC SETTLEMENT
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M)": "JCC (M)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M) Swap": "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M) Swap",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M+1)": "JCC (M+1)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M+2)": "JCC (M+2)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M+3)": "JCC (M+3)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M+4)": "JCC (M+4)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M+5)": "JCC (M+5)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M+6)": "JCC (M+6)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M+7)": "JCC (M+7)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-1)": "JCC (M-1)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-10)": "JCC (M-10)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-11)": "JCC (M-11)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-12)": "JCC (M-12)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-13)": "JCC (M-13)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-2)": "JCC (M-2)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-3)": "JCC (M-3)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-4)": "JCC (M-4)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-5)": "JCC (M-5)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-6)": "JCC (M-6)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-7)": "JCC (M-7)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-8)": "JCC (M-8)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-9)": "JCC (M-9)",
  "LNG_JCC_SETTLEMENT -- LNG_Provisional JCC (M-3)": "JCC (M-3)",
  "LNG_JCC_SETTLEMENT -- LNG_Provisional JCC (M-4)": "JCC (M-4)",
  "LNG_JCC_SETTLEMENT -- None": "LNG_JCC_SETTLEMENT -- None",
  "LNG_JCC_SETTLEMENT -- Physical Value": "LNG_JCC_SETTLEMENT -- Physical Value"
};

// Normalized lookup map for resilient case/whitespace/bracket matching
const NORMALIZED_LOOKUP = new Map<string, string>();

Object.entries(INDEX_RENAMING_MAP).forEach(([key, val]) => {
  const norm = key.toLowerCase().replace(/[\s<>_/-]/g, '');
  NORMALIZED_LOOKUP.set(norm, val);
  // Also register key without prefix before '--'
  if (key.includes('--')) {
    const rhs = key.split('--')[1].trim();
    const rhsNorm = rhs.toLowerCase().replace(/[\s<>_/-]/g, '');
    if (!NORMALIZED_LOOKUP.has(rhsNorm)) {
      NORMALIZED_LOOKUP.set(rhsNorm, val);
    }
  }
});

/**
 * Normalizes a single index token (e.g. `<Crude_Dated_Brent -- LNG_Detailed JCC (M)>`)
 */
export function normalizeSingleIndexToken(rawToken: string): string {
  if (!rawToken) return '';
  let token = String(rawToken).trim();
  if (token === '-' || token === '—' || token === 'None') return token;

  // Strip enclosing quotes and angle brackets
  token = token.replace(/^["'<]+|["'>]+$/g, '').trim();

  // 1. Direct exact match in dictionary
  if (INDEX_RENAMING_MAP[token]) {
    return INDEX_RENAMING_MAP[token];
  }

  // 2. Normalized dictionary match
  const normKey = token.toLowerCase().replace(/[\s<>_/-]/g, '');
  if (NORMALIZED_LOOKUP.has(normKey)) {
    return NORMALIZED_LOOKUP.get(normKey)!;
  }

  // 3. Heuristic / Pattern-based conversions for unmapped variations
  // JCC
  if (/JCC\s*\((M[+-]?\d*)\)/i.test(token) || /LNG_(?:Detailed|Provisional)\s+JCC\s*\((M[+-]?\d*)\)/i.test(token)) {
    const match = token.match(/\((M[+-]?\d*)\)/i);
    const m = match ? match[1].toUpperCase() : 'M';
    return `JCC (${m})`;
  }

  // Dtd Brent
  if (/Dtd\s*Brent\s*\((M[+-]?\d*)\)/i.test(token) || /LNG_Dtd\s+Brent\s*\((M[+-]?\d*)\)/i.test(token)) {
    const match = token.match(/\((M[+-]?\d*)\)/i);
    const m = match ? match[1].toUpperCase() : 'M';
    return `Dtd Brent (${m})`;
  }

  // Brent ICE / BRIPE
  if (/BRIPE\s*\((M[+-]?\d*)\)/i.test(token) || /ICE\s+Brent\s*\((M[+-]?\d*)\)/i.test(token)) {
    const match = token.match(/\((M[+-]?\d*)\)/i);
    const m = match ? match[1].toUpperCase() : 'M';
    return `Brent (${m})`;
  }

  // JKM
  if (/JKM\s*\((M[+-]?\d*)\)/i.test(token) || /LNG_JKM\s*\((M[+-]?\d*)\)/i.test(token)) {
    const match = token.match(/\((M[+-]?\d*)\)/i);
    const m = match ? match[1].toUpperCase() : 'M';
    return `JKM (${m})`;
  }

  // Henry Hub / NYMEX HH
  if (/HH\s*-\s*Bullet\s*(?:DP\s*)?\((M[+-]?\d*|M\+!)\)/i.test(token) || /HH\s*\((M[+-]?\d*)\)/i.test(token)) {
    let m = 'M';
    const match = token.match(/\((M[+-]?\d*|M\+!)\)/i);
    if (match) {
      m = match[1].toUpperCase().replace('M+!', 'M+1');
    }
    return `HH (${m})`;
  }

  // NBP
  if (/NBP.*Avg\s*Spot/i.test(token) || /LNG_ICE\s+NBP.*\(M\)/i.test(token)) {
    return 'NBP (M)';
  }

  return token;
}

/**
 * Parses and formats composite index strings like:
 * `<Crude_Dated_Brent -- LNG_Dtd Brent (M-1)>::<Crude_Dated_Brent -- LNG_Dtd Brent (M-2)>::<Crude_Dated_Brent -- LNG_Dtd Brent (M-3)>`
 * -> `Dtd Brent (3,0,1)`
 */
export function formatTrmsIndexName(rawVal: any): string {
  if (rawVal === undefined || rawVal === null) return '—';
  const str = String(rawVal).trim();
  if (!str || str === '—' || str === '-') return '—';

  // Check if string contains multiple segments separated by :: or <...> or commas
  let segments: string[] = [];

  if (str.includes('::')) {
    segments = str.split('::').map(s => s.trim()).filter(Boolean);
  } else {
    const angleMatches = Array.from(str.matchAll(/<([^>]+)>/g)).map(m => m[1].trim());
    if (angleMatches.length > 1) {
      segments = angleMatches;
    } else if (str.includes(';') || str.includes(',')) {
      // Split by comma/semicolon only if multiple discrete indices
      segments = str.split(/[;,]/).map(s => s.trim()).filter(Boolean);
    } else {
      segments = [str];
    }
  }

  if (segments.length <= 1) {
    return normalizeSingleIndexToken(segments[0] || str);
  }

  // Map each individual segment
  const mappedSegments = segments.map(s => normalizeSingleIndexToken(s));

  // Check for multi-month average structure, e.g. Dtd Brent (M-1), Dtd Brent (M-2), Dtd Brent (M-3)
  // Extract base index name and monthly offset for each segment
  const parsedItems: Array<{ base: string; monthOffset: number; raw: string }> = [];
  let allParsed = true;

  for (const seg of mappedSegments) {
    const match = seg.match(/^(.+?)\s*\((M(?:-|\+)?\d*)\)$/i);
    if (match) {
      const base = match[1].trim();
      const mStr = match[2].toUpperCase();
      let offset = 0;
      if (mStr === 'M') {
        offset = 0;
      } else if (mStr.startsWith('M-')) {
        offset = -parseInt(mStr.slice(2), 10);
      } else if (mStr.startsWith('M+')) {
        offset = parseInt(mStr.slice(2), 10);
      }
      parsedItems.push({ base, monthOffset: offset, raw: seg });
    } else {
      allParsed = false;
      break;
    }
  }

  if (allParsed && parsedItems.length >= 2) {
    const firstBase = parsedItems[0].base;
    const sameBase = parsedItems.every(p => p.base.toLowerCase() === firstBase.toLowerCase());

    if (sameBase) {
      // Sort offsets descending or ascending (e.g. -1, -2, -3)
      const offsets = parsedItems.map(p => p.monthOffset);
      const isNegativeSequence = offsets.every(o => o < 0);
      
      if (isNegativeSequence) {
        // e.g. [-1, -2, -3] -> positive abs [1, 2, 3]
        const posOffsets = offsets.map(o => Math.abs(o)).sort((a, b) => a - b);
        const minOffset = posOffsets[0];
        const count = posOffsets.length;
        
        // Check if strictly consecutive (e.g., 1, 2, 3)
        let isConsecutive = true;
        for (let i = 0; i < count; i++) {
          if (posOffsets[i] !== minOffset + i) {
            isConsecutive = false;
            break;
          }
        }

        if (isConsecutive) {
          // Standard LNG contract notation: (Count, 0, StartingLagMonth)
          // e.g. M-1, M-2, M-3 -> (3, 0, 1)
          // e.g. M-2, M-3, M-4 -> (3, 0, 2)
          return `${firstBase} (${count},0,${minOffset})`;
        }
      }

      // If not consecutive, format as e.g. Dtd Brent (M-1, M-3)
      const monthTags = parsedItems.map(p => {
        if (p.monthOffset === 0) return 'M';
        return p.monthOffset < 0 ? `M-${Math.abs(p.monthOffset)}` : `M+${p.monthOffset}`;
      });
      return `${firstBase} (${monthTags.join(', ')})`;
    }
  }

  // Deduplicate distinct mapped segments and join
  const uniqueMapped = Array.from(new Set(mappedSegments));
  return uniqueMapped.join(', ');
}
