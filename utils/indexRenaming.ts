/**
 * Index Name & Month Definition Renaming Rules for TRMS / Jarvis Data
 */

export const INDEX_RENAMING_MAP: Record<string, string> = {
  // Crude Dated Brent / JCC / Dtd Brent
  "Crude_Dated_Brent -- LNG_Detailed JCC (M)": "JCC (n)",
  "Crude_Dated_Brent -- LNG_Dtd Brent (M)": "Dtd Brent (n)",
  "Crude_Dated_Brent -- LNG_Dtd Brent (M-1)": "Dtd Brent (n-1)",
  "Crude_Dated_Brent -- LNG_Dtd Brent (M-2)": "Dtd Brent (n-2)",
  "Crude_Dated_Brent -- LNG_Dtd Brent (M-3)": "Dtd Brent (n-3)",
  "Crude_Dated_Brent -- LNG_Dtd Brent (M-4)": "Dtd Brent (n-4)",
  "Crude_Dated_Brent -- LNG_Dtd Brent (M-6)": "Dtd Brent (n-6)",
  "Crude_Dated_Brent -- LNG_Swap month": "Crude_Dated_Brent -- LNG_Swap month",
  "Crude_Dated_Brent -- None": "Crude_Dated_Brent -- None",

  // AECO
  "FUT_AECO_7A_USD_STTLEMT -- LNG_Range pricing_Fut_AECO": "FUT_AECO_7A_USD_STTLEMT -- LNG_Range pricing_Fut_AECO",
  "FUT_AECO_ICE_CAD -- LNG_Range pricing_Fut_AECO": "FUT_AECO_ICE_CAD -- LNG_Range pricing_Fut_AECO",
  "FUT_AECO_ICE_CAD -- Physical Value": "FUT_AECO_ICE_CAD -- Physical Value",
  "FUT_AECO_ICE_USD -- LNG_Nymex HH - Bullet DelvPeriod": "HH Last Day",
  "FUT_AECO_ICE_USD -- LNG_Range pricing_Fut_AECO": "FUT_AECO_ICE_USD -- LNG_Range pricing_Fut_AECO",
  "FUT_AECO_ICE_USD -- None": "FUT_AECO_ICE_USD -- None",
  "FUT_AECO_ICE_USD -- Physical Value": "FUT_AECO_ICE_USD -- Physical Value",

  // FUT Brent Crude ICE
  "FUT_Brent_Crude_ICE -- LNG_BRIPE (M) ICE Brent FL": "Brent (n)",
  "FUT_Brent_Crude_ICE -- LNG_BRIPE (M-1) ICE Brent FL": "Brent (n-1)",
  "FUT_Brent_Crude_ICE -- LNG_BRIPE (M-2) ICE Brent FL": "Brent (n-2)",
  "FUT_Brent_Crude_ICE -- LNG_BRIPE (M-3) ICE Brent FL": "Brent (n-3)",
  "FUT_Brent_Crude_ICE -- LNG_BRIPE (M-4) ICE Brent FL": "Brent (n-4)",
  "FUT_Brent_Crude_ICE -- LNG_BRIPE (M-5) ICE Brent FL": "Brent (n-5)",
  "FUT_Brent_Crude_ICE -- LNG_BRIPE (M-6) ICE Brent FL": "Brent (n-6)",
  "FUT_Brent_Crude_ICE -- LNG_BRIPE (M-6) ICE Brent Trafi": "Brent (n-6)",
  "FUT_Brent_Crude_ICE -- LNG_BRIPE (M-7) ICE Brent FL": "Brent (n-7)",
  "FUT_Brent_Crude_ICE -- LNG_Dtd Brent (M)": "Dtd Brent (n)",
  "FUT_Brent_Crude_ICE -- LNG_Dtd Brent (M-1)": "Dtd Brent (n-1)",
  "FUT_Brent_Crude_ICE -- LNG_Dtd Brent (M-2)": "Dtd Brent (n-2)",
  "FUT_Brent_Crude_ICE -- LNG_Dtd Brent (M-3)": "Dtd Brent (n-3)",
  "FUT_Brent_Crude_ICE -- None": "FUT_Brent_Crude_ICE -- None",
  "FUT_Brent_Crude_ICE_BRN -- LNG_BRIPE (M-1) ICE Brent FL": "Brent (n-1)",
  "FUT_Brent_Crude_ICE_BRN -- LNG_ICEBrent Swap month": "FUT_Brent_Crude_ICE_BRN -- LNG_ICEBrent Swap month",
  "FUT_Brent_Crude_ICE_BRN -- None": "FUT_Brent_Crude_ICE_BRN -- None",

  // FUT HH NYMEX
  "FUT_HH_NYMEX -- LNG M-1 average": "FUT_HH_NYMEX -- LNG M-1 average",
  "FUT_HH_NYMEX -- LNG_Nymex HH - Bullet (M+!)": "HH (n+1)",
  "FUT_HH_NYMEX -- LNG_Nymex HH - Bullet (M+1)": "HH (n+1)",
  "FUT_HH_NYMEX -- LNG_Nymex HH - Bullet DelvPeriod": "HH Last Day",
  "FUT_HH_NYMEX -- LNG_Nymex HH - Bullet DP (M)": "HH (n)",
  "FUT_HH_NYMEX -- LNG_Nymex HH - Bullet DP (M-1)": "HH (n-1)",
  "FUT_HH_NYMEX -- LNG_Nymex HH - Contract Average": "FUT_HH_NYMEX -- LNG_Nymex HH - Contract Average",
  "FUT_HH_NYMEX -- LNG_Nymex HH - Swap Contract": "FUT_HH_NYMEX -- LNG_Nymex HH - Swap Contract",
  "FUT_HH_NYMEX -- None": "FUT_HH_NYMEX -- None",
  "FUT_HH_NYMEX -- PETCO_Range pricing phys": "FUT_HH_NYMEX -- PETCO_Range pricing phys",

  // JKM
  "FUT_JKM_ICE -- None": "FUT_JKM_ICE -- None",

  // NBP / TTF
  "FUT_NBP_M_ICE -- LNG_ICE NBP/TTF - Contract Avg": "FUT_NBP_M_ICE -- LNG_ICE NBP/TTF - Contract Avg",
  "FUT_NBP_M_ICE -- LNG_ICE NBP/TTF-Trade M Avg Spot": "NBP (n)",
  "FUT_NBP_M_ICE -- LNG_NBP_ICE_Swap month": "NBP (n)",
  "FUT_NBP_M_ICE -- None": "FUT_NBP_M_ICE -- None",
  "FUT_NBP_M_ICE_USD -- LNG_NBP_ICE_Swap month": "NBP (n)",
  "FUT_TTF_M_ICE_Endex -- LNG_TTF_ICE_Swap month": "TTF(n)",
  "FUT_TTF_M_ICE_Endex -- None": "FUT_TTF_M_ICE_Endex -- None",
  "FUT_TTF_M_ICE_Endex_USD.MMBTU -- LNG_TTF_ICE_Swap month": "TTF(n)",
  "FUT_TTF_M_ICE_Endex_USD.MMBTU -- None": "FUT_TTF_M_ICE_Endex_USD.MMBTU -- None",

  // FX
  "FX_BOE_GBP.USD -- LNG_BOE": "FX_BOE_GBP.USD -- LNG_BOE",
  "FX_USD.MYR -- Invoice_FX": "FX_USD.MYR -- Invoice_FX",

  // LNG DES JKM
  "LNG_DES_JKM -- LNG_JKM - Swap Contract": "JKM (n)",
  "LNG_DES_JKM -- LNG_JKM (M) Contract Avg": "JKM (n)",
  "LNG_DES_JKM -- LNG_JKM (M+1) Contract Avg": "JKM (n+1)",
  "LNG_DES_JKM -- LNG_JKM (M+2) Contract Avg": "JKM (n+2)",
  "LNG_DES_JKM -- LNG_JKM (M-1) Contract Avg": "JKM (n-1)",
  "LNG_DES_JKM -- None": "LNG_DES_JKM -- None",
  "LNG_DES_JKM -- Physical Value": "JKM (n)",

  // LNG DES JKM PHYS 1lom
  "LNG_DES_JKM_PHYS_1lom -- LNG_BRIPE (M-1) ICE Brent FL": "Brent (n-1)",
  "LNG_DES_JKM_PHYS_1lom -- LNG_BRIPE (M-2) ICE Brent FL": "Brent (n-2)",
  "LNG_DES_JKM_PHYS_1lom -- LNG_BRIPE (M-3) ICE Brent FL": "Brent (n-3)",
  "LNG_DES_JKM_PHYS_1lom -- LNG_JKM - Swap Contract": "JKM (n)",
  "LNG_DES_JKM_PHYS_1lom -- LNG_JKM (M) Contract Avg": "JKM (n)",
  "LNG_DES_JKM_PHYS_1lom -- LNG_Nymex HH - Bullet (M+!)": "HH (n+1)",
  "LNG_DES_JKM_PHYS_1lom -- LNG_Nymex HH - Bullet (M+1)": "HH (n+1)",
  "LNG_DES_JKM_PHYS_1lom -- None": "LNG_DES_JKM_PHYS_1lom -- None",
  "LNG_DES_JKM_PHYS_1lom -- Physical Value": "JKM (n)",

  // Other LNG Physicals
  "LNG_DES_MEM -- Physical Value": "LNG_DES_MEM -- Physical Value",
  "LNG_DES_SE_ASIA -- LNG_JKM - Swap Contract": "JKM (n)",
  "LNG_DES_SE_ASIA -- Physical Value": "JKM (n)",
  "LNG_DES_SWE -- Physical Value": "LNG_DES_SWE -- Physical Value",
  "LNG_DES_WEST_IND -- Physical Value": "LNG_DES_WEST_IND -- Physical Value",
  "LNG_FOB_ALGERIA -- Physical Value": "LNG_FOB_ALGERIA -- Physical Value",
  "LNG_FOB_AUSTRALIA -- Physical Value": "LNG_FOB_AUSTRALIA -- Physical Value",
  "LNG_FOB_NIGERIA -- Physical Value": "LNG_FOB_NIGERIA -- Physical Value",
  "LNG_FOB_SPAIN -- Physical Value": "LNG_FOB_SPAIN -- Physical Value",
  "LNG_FOB_US_GULF_COAST -- Physical Value": "LNG_FOB_US_GULF_COAST -- Physical Value",

  // LNG JCC
  "LNG_JCC -- LNG_Detailed JCC (M)": "JCC (n)",
  "LNG_JCC -- LNG_Detailed JCC (M) Swap": "LNG_JCC -- LNG_Detailed JCC (M) Swap",
  "LNG_JCC -- LNG_Detailed JCC (M-1)": "JCC (n-1)",
  "LNG_JCC -- LNG_Detailed JCC (M-2)": "JCC (n-2)",
  "LNG_JCC -- LNG_Detailed JCC (M-3)": "JCC (n-3)",
  "LNG_JCC -- LNG_Detailed JCC (M-4)": "JCC (n-4)",
  "LNG_JCC -- LNG_Detailed JCC (M-5)": "JCC (n-5)",
  "LNG_JCC -- LNG_Detailed JCC (M-6)": "JCC (n-6)",
  "LNG_JCC -- LNG_Detailed JCC (M-7)": "JCC (n-7)",
  "LNG_JCC -- LNG_Provisional JCC (M)": "JCC (n)",
  "LNG_JCC -- LNG_Provisional JCC (M-2)": "JCC (n-2)",
  "LNG_JCC -- LNG_Provisional JCC (M-3)": "JCC (n-3)",
  "LNG_JCC -- None": "LNG_JCC -- None",

  // LNG JCC SETTLEMENT
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M)": "JCC (n)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M) Swap": "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M) Swap",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M+1)": "JCC (n+1)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M+2)": "JCC (n+2)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M+3)": "JCC (n+3)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M+4)": "JCC (n+4)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M+5)": "JCC (n+5)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M+6)": "JCC (n+6)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M+7)": "JCC (n+7)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-1)": "JCC (n-1)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-10)": "JCC (n-10)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-11)": "JCC (n-11)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-12)": "JCC (n-12)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-13)": "JCC (n-13)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-2)": "JCC (n-2)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-3)": "JCC (n-3)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-4)": "JCC (n-4)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-5)": "JCC (n-5)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-6)": "JCC (n-6)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-7)": "JCC (n-7)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-8)": "JCC (n-8)",
  "LNG_JCC_SETTLEMENT -- LNG_Detailed JCC (M-9)": "JCC (n-9)",
  "LNG_JCC_SETTLEMENT -- LNG_Provisional JCC (M-3)": "JCC (n-3)",
  "LNG_JCC_SETTLEMENT -- LNG_Provisional JCC (M-4)": "JCC (n-4)",
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
 * Normalizes month tag string from M to n (e.g. M -> n, M-1 -> n-1, M+1 -> n+1)
 */
function normalizeMonthTag(rawTag: string): string {
  if (!rawTag) return 'n';
  const t = rawTag.trim().toUpperCase().replace('M+!', 'M+1');
  if (t === 'M' || t === 'N') return 'n';
  if (t.startsWith('M')) {
    return `n${t.slice(1).toLowerCase()}`;
  }
  if (t.startsWith('N')) {
    return t.toLowerCase();
  }
  return t;
}

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

  // Special explicit mappings for keywords
  if (/LNG_Nymex\s+HH\s*-\s*Bullet\s+DelvPeriod/i.test(token)) {
    return 'HH Last Day';
  }
  if (/LNG_DES_JKM.*Swap\s*Contract/i.test(token) || /LNG_DES_JKM.*Physical\s*Value/i.test(token)) {
    return 'JKM (n)';
  }
  if (/TTF.*(?:Swap\s*month|ICE)/i.test(token) || /LNG_TTF/i.test(token)) {
    return 'TTF(n)';
  }

  // 2. Normalized dictionary match
  const normKey = token.toLowerCase().replace(/[\s<>_/-]/g, '');
  if (NORMALIZED_LOOKUP.has(normKey)) {
    return NORMALIZED_LOOKUP.get(normKey)!;
  }

  // 3. Heuristic / Pattern-based conversions for unmapped variations
  // JCC
  if (/JCC\s*\(([Mn][+-]?\d*)\)/i.test(token) || /LNG_(?:Detailed|Provisional)\s+JCC\s*\(([Mn][+-]?\d*)\)/i.test(token)) {
    const match = token.match(/\(([Mn][+-]?\d*)\)/i);
    const n = match ? normalizeMonthTag(match[1]) : 'n';
    return `JCC (${n})`;
  }

  // Dtd Brent
  if (/Dtd\s*Brent\s*\(([Mn][+-]?\d*)\)/i.test(token) || /LNG_Dtd\s+Brent\s*\(([Mn][+-]?\d*)\)/i.test(token)) {
    const match = token.match(/\(([Mn][+-]?\d*)\)/i);
    const n = match ? normalizeMonthTag(match[1]) : 'n';
    return `Dtd Brent (${n})`;
  }

  // Brent ICE / BRIPE
  if (/BRIPE\s*\(([Mn][+-]?\d*)\)/i.test(token) || /ICE\s+Brent\s*\(([Mn][+-]?\d*)\)/i.test(token)) {
    const match = token.match(/\(([Mn][+-]?\d*)\)/i);
    const n = match ? normalizeMonthTag(match[1]) : 'n';
    return `Brent (${n})`;
  }

  // JKM
  if (/JKM\s*\(([Mn][+-]?\d*)\)/i.test(token) || /LNG_JKM\s*\(([Mn][+-]?\d*)\)/i.test(token)) {
    const match = token.match(/\(([Mn][+-]?\d*)\)/i);
    const n = match ? normalizeMonthTag(match[1]) : 'n';
    return `JKM (${n})`;
  }

  // Henry Hub / NYMEX HH
  if (/HH\s*-\s*Bullet\s*(?:DP\s*)?\(([Mn][+-]?\d*|M\+!)\)/i.test(token) || /HH\s*\(([Mn][+-]?\d*)\)/i.test(token)) {
    const match = token.match(/\(([Mn][+-]?\d*|M\+!)\)/i);
    const n = match ? normalizeMonthTag(match[1]) : 'n';
    return `HH (${n})`;
  }

  // NBP
  if (/NBP.*(?:Avg\s*Spot|Swap\s*month)/i.test(token) || /LNG_ICE\s+NBP/i.test(token) || /LNG_NBP_ICE/i.test(token)) {
    return 'NBP (n)';
  }

  // TTF
  if (/TTF\s*\(([Mn][+-]?\d*)\)/i.test(token)) {
    const match = token.match(/\(([Mn][+-]?\d*)\)/i);
    const n = match ? normalizeMonthTag(match[1]) : 'n';
    return `TTF(${n})`;
  }

  return token;
}

/**
 * Parses and formats composite index strings like:
 * `<Crude_Dated_Brent -- LNG_Dtd Brent (M-1)>::<Crude_Dated_Brent -- LNG_Dtd Brent (M-2)>::<Crude_Dated_Brent -- LNG_Dtd Brent (M-3)>`
 * -> `Dtd Brent (3,0,1)`
 * or:
 * `JCC(n-3), JCC(n-4), JKM (n), JCC(n-5)`
 * -> `JCC (3,2,1), JKM (n)`
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

  if (segments.length === 0) return '—';

  if (segments.length === 1) {
    return normalizeSingleIndexToken(segments[0]);
  }

  // Map each individual segment
  const mappedSegments = segments.map(s => normalizeSingleIndexToken(s));

  interface ParsedItem {
    base: string;
    monthOffset: number | null;
    raw: string;
  }

  const parsedList: ParsedItem[] = mappedSegments.map(seg => {
    const match = seg.match(/^(.+?)\s*\(([Mn](?:-|\+)?\d*)\)$/i);
    if (match) {
      const base = match[1].trim();
      const mStr = match[2].toUpperCase().replace('M+!', 'M+1');
      let offset = 0;
      if (mStr === 'M' || mStr === 'N') {
        offset = 0;
      } else if (mStr.startsWith('M-') || mStr.startsWith('N-')) {
        offset = -parseInt(mStr.slice(2), 10);
      } else if (mStr.startsWith('M+') || mStr.startsWith('N+')) {
        offset = parseInt(mStr.slice(2), 10);
      }
      return { base, monthOffset: offset, raw: seg };
    }
    return { base: seg, monthOffset: null, raw: seg };
  });

  // Group items by base name preserving first-appearance order
  const groupMap = new Map<string, ParsedItem[]>();
  const groupOrder: string[] = [];

  for (const item of parsedList) {
    const key = item.base.toLowerCase();
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
      groupOrder.push(key);
    }
    groupMap.get(key)!.push(item);
  }

  const formattedGroups: string[] = [];

  for (const key of groupOrder) {
    const items = groupMap.get(key)!;
    const firstBase = items[0].base;

    // Single item in group
    if (items.length === 1) {
      formattedGroups.push(items[0].raw);
      continue;
    }

    // Check if all items in group have numeric offsets
    const allHaveOffsets = items.every(it => it.monthOffset !== null);
    if (!allHaveOffsets) {
      const uniqueRaws = Array.from(new Set(items.map(it => it.raw)));
      formattedGroups.push(...uniqueRaws);
      continue;
    }

    const offsets = items.map(it => it.monthOffset as number);
    const isNegativeSequence = offsets.every(o => o < 0);

    if (isNegativeSequence) {
      // e.g. [-3, -4, -5] -> positive sorted [3, 4, 5]
      const posOffsets = Array.from(new Set(offsets.map(o => Math.abs(o)))).sort((a, b) => a - b);
      const minOffset = posOffsets[0];
      const count = posOffsets.length;

      // Check if strictly consecutive with step = 1
      let isConsecutive = true;
      for (let i = 0; i < count; i++) {
        if (posOffsets[i] !== minOffset + i) {
          isConsecutive = false;
          break;
        }
      }

      if (isConsecutive && count >= 2) {
        // Standard LNG pricing notation: (Count, Lag, Step)
        // For delivery month n:
        // n-1, n-2, n-3 -> minOffset=1, lag=0, step=1 -> (3,0,1)
        // n-2, n-3, n-4 -> minOffset=2, lag=1, step=1 -> (3,1,1)
        // n-3, n-4, n-5 -> minOffset=3, lag=2, step=1 -> (3,2,1)
        // n-4, n-5, n-6 -> minOffset=4, lag=3, step=1 -> (3,3,1)
        const lag = minOffset - 1;
        const step = 1;
        formattedGroups.push(`${firstBase} (${count},${lag},${step})`);
        continue;
      }

      // If not consecutive, format as e.g. JCC (n-1, n-3)
      formattedGroups.push(`${firstBase} (${posOffsets.map(o => `n-${o}`).join(', ')})`);
      continue;
    }

    // Mixed/zero/positive offsets
    const uniqueOffsets = Array.from(new Set(offsets));
    const monthTags = uniqueOffsets.map(o => (o === 0 ? 'n' : o < 0 ? `n-${Math.abs(o)}` : `n+${o}`));
    formattedGroups.push(`${firstBase} (${monthTags.join(', ')})`);
  }

  // Deduplicate distinct results if any
  const uniqueFormatted = Array.from(new Set(formattedGroups));
  return uniqueFormatted.join(', ');
}

