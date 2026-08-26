import * as XLSX from 'xlsx';

function shiftEodDatePlusOne(val: any): string {
  if (val === undefined || val === null || val === '') return '';
  if (val instanceof Date) {
    const d = new Date(val.getTime());
    d.setUTCDate(d.getUTCDate() + 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  if (typeof val === 'number') {
    const jsDate = new Date(Math.round((val - 25569) * 86400 * 1000));
    jsDate.setUTCDate(jsDate.getUTCDate() + 1);
    return `${jsDate.getUTCFullYear()}-${String(jsDate.getUTCMonth() + 1).padStart(2, '0')}-${String(jsDate.getUTCDate()).padStart(2, '0')}`;
  }

  const strVal = String(val).trim();
  if (!strVal) return '';

  const isoMatch = strVal.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[\sT].*)?$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const d = new Date(Date.UTC(y, m, day + 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  const parsed = Date.parse(strVal);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    d.setUTCDate(d.getUTCDate() + 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  return strVal;
}

function normalizeIndexNameForImport(raw: string): string {
  if (!raw) return '';
  const clean = raw.trim();
  const upper = clean.toUpperCase();
  if (upper.includes('BRIPE') || upper.includes('BRENT INDEX')) return 'BRIPE';
  if (upper.includes('DATED BRENT') || upper === 'BRENT') return 'Dated Brent';
  if (upper.includes('JCC') || upper.includes('JAPAN CRUDE')) return 'JCC';
  if (upper.includes('JKM')) return 'JKM';
  if (upper.includes('TTF') || upper.includes('DUTCH')) return 'TTF';
  if (upper.includes('NBP')) return 'NBP';
  if (upper.includes('HH LAST DAY') || upper.includes('HENRY HUB LAST DAY')) return 'HH Last Day';
  if (upper.includes('HH') || upper.includes('HENRY HUB')) return 'HH';
  if (upper.includes('AECO')) return 'AECO';
  if (upper.includes('STATION 2') || upper.includes('STATION2') || upper.includes('STN 2') || upper.includes('STN2')) return 'STN 2';
  return clean;
}

function parseContractMonth(val: any): string | null {
  if (val === undefined || val === null || val === '') return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  if (typeof val === 'number') {
    if (val > 20000 && val < 90000) {
      const date = new Date(Math.round((Math.floor(val) - 25569) * 86400 * 1000));
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    }
    return null;
  }
  const raw = String(val).trim();
  if (!raw) return null;

  // YYYY-MM or YYYY/MM or YYYY.MM
  const isoMatch = raw.match(/^(\d{4})[-/.](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${String(parseInt(isoMatch[2], 10)).padStart(2, '0')}`;
  }

  // MM/YYYY or MM-YYYY
  const mmyyyyMatch = raw.match(/^(0?[1-9]|1[0-2])[-/.](20\d{2}|\d{2})$/);
  if (mmyyyyMatch) {
    let y = parseInt(mmyyyyMatch[2], 10);
    if (y < 100) y += 2000;
    return `${y}-${String(parseInt(mmyyyyMatch[1], 10)).padStart(2, '0')}`;
  }

  // Full date DD/MM/YYYY or DD-MM-YYYY -> YYYY-MM
  const fullDateMatch = raw.match(/^(?:0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2}|\d{2})$/);
  if (fullDateMatch) {
    let y = parseInt(fullDateMatch[2], 10);
    if (y < 100) y += 2000;
    return `${y}-${String(parseInt(fullDateMatch[1], 10)).padStart(2, '0')}`;
  }

  const monthsMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  const mMatch = raw.match(/([a-zA-Z]{3,})[-/.\s,'`]+(\d{2,4})|(\d{2,4})[-/.\s,'`]+([a-zA-Z]{3,})/);
  if (mMatch) {
    const mStr = (mMatch[1] || mMatch[4] || '').toLowerCase().slice(0, 3);
    const yStr = mMatch[2] || mMatch[3] || '';
    if (monthsMap[mStr] && yStr) {
      let y = parseInt(yStr, 10);
      if (y < 100) y += 2000;
      return `${y}-${monthsMap[mStr]}`;
    }
  }
  return null;
}

function parseAnyDateString(rawStr: string): string | null {
  if (!rawStr) return null;
  let str = String(rawStr).trim();
  if (!str) return null;

  // Clean out common prefixes
  str = str.replace(/^(?:EOD(?:\s*Date)?|As\s*of(?:\s*Date)?|Curve(?:\s*Date)?|Date|Forward\s*Curve(?:\s*as\s*of)?|Market\s*Data\s*(?:as\s*of)?)[:\s-]*/i, '').trim();

  // Strip ordinals like 21st, 22nd, 23rd, 1st, 2nd, 3rd, 4th -> 21, 22, 23, 1, 2, 3, 4
  const normalizedStr = str.replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/gi, '$1');

  const monthNames: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    january: '01', february: '02', march: '03', april: '04', may_: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
    sept: '09'
  };

  // 1. ISO format: YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD or YYYY_MM_DD
  const isoMatch = normalizedStr.match(/\b(20\d{2})[-/._](0?[1-9]|1[0-2])[-/._](0?[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  // 2. DD-MMM-YYYY or DD MMM YYYY or DD-MMM-YY or DD/MMM/YYYY or DD.MMM.YYYY (e.g. 21-Aug-2026, 21-Aug-26, 21 Aug 2026, 31-May-2024, 21-August-2026)
  const dMmmYMatch = normalizedStr.match(/\b(0?[1-9]|[12]\d|3[01])[-/\s._]([a-zA-Z]{3,})[-/\s._](\d{2,4})\b/);
  if (dMmmYMatch) {
    const day = dMmmYMatch[1].padStart(2, '0');
    const mStr = dMmmYMatch[2].toLowerCase().slice(0, 3);
    let y = parseInt(dMmmYMatch[3], 10);
    if (y < 100) y += 2000;
    if (monthNames[mStr]) {
      return `${y}-${monthNames[mStr]}-${day}`;
    }
  }

  // 3. MMM-DD-YYYY or MMM DD, YYYY or MMM DD YYYY (e.g. Aug 21, 2026, August 21 2026)
  const mmmDYMatch = normalizedStr.match(/\b([a-zA-Z]{3,})[-/\s._](0?[1-9]|[12]\d|3[01])(?:,)?[-/\s._](\d{2,4})\b/);
  if (mmmDYMatch) {
    const mStr = mmmDYMatch[1].toLowerCase().slice(0, 3);
    const day = mmmDYMatch[2].padStart(2, '0');
    let y = parseInt(mmmDYMatch[3], 10);
    if (y < 100) y += 2000;
    if (monthNames[mStr]) {
      return `${y}-${monthNames[mStr]}-${day}`;
    }
  }

  // 4. Slash/dash/dot date with year at end: e.g. 21/08/2026 or 08/21/2026 or 21/8/26 or 21-08-2026 or 21.08.2026
  const genericDmyMatch = normalizedStr.match(/\b(0?[1-9]|[12]\d|3[01])[-/._](0?[1-9]|[12]\d|3[01])[-/._](20\d{2}|\d{2})\b/);
  if (genericDmyMatch) {
    const p1 = parseInt(genericDmyMatch[1], 10);
    const p2 = parseInt(genericDmyMatch[2], 10);
    let y = parseInt(genericDmyMatch[3], 10);
    if (y < 100) y += 2000;

    if (p1 > 12 && p2 <= 12) {
      // Definitely DD/MM/YYYY
      return `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
    } else if (p1 <= 12 && p2 > 12) {
      // Definitely MM/DD/YYYY
      return `${y}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
    } else if (p1 <= 12 && p2 <= 12) {
      // Default to DD/MM/YYYY for commodities TRMS standard
      return `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
    }
  }

  // 5. 8-digit date string DDMMYYYY (e.g. 21082026 -> 2026-08-21)
  const ddmmyyyy = normalizedStr.match(/\b(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(20\d{2})\b/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  }

  // 6. 8-digit date string YYYYMMDD (e.g. 20260821 -> 2026-08-21)
  const yyyymmdd = normalizedStr.match(/\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/);
  if (yyyymmdd) {
    return `${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}`;
  }

  // 7. Standard Date.parse fallback
  const parsed = Date.parse(normalizedStr);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    const uy = d.getUTCFullYear();
    const um = String(d.getUTCMonth() + 1).padStart(2, '0');
    const uday = String(d.getUTCDate()).padStart(2, '0');
    if (uy >= 2000 && uy <= 2050) {
      return `${uy}-${um}-${uday}`;
    }
    const ly = d.getFullYear();
    const lm = String(d.getMonth() + 1).padStart(2, '0');
    const lday = String(d.getDate()).padStart(2, '0');
    if (ly >= 2000 && ly <= 2050) {
      return `${ly}-${lm}-${lday}`;
    }
  }

  return null;
}

function tryExtractDateString(val: any, cellObj?: any): string | null {
  if (val === undefined && cellObj === undefined) return null;
  if (val === null && cellObj === null) return null;

  // 1. Check formatted text cellObj.w first if available
  const formattedStr = cellObj?.w ? String(cellObj.w).trim() : '';
  if (formattedStr && formattedStr !== 'undefined' && formattedStr !== 'null' && formattedStr !== 'Unknown') {
    const res = parseAnyDateString(formattedStr);
    if (res) return res;
  }

  // 2. Check Date object (cellObj.v or val)
  const dateObj = (cellObj?.v instanceof Date) ? cellObj.v : (val instanceof Date ? val : null);
  if (dateObj && !isNaN(dateObj.getTime())) {
    const uy = dateObj.getUTCFullYear();
    const um = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const ud = String(dateObj.getUTCDate()).padStart(2, '0');
    if (uy >= 2000 && uy <= 2050) {
      return `${uy}-${um}-${ud}`;
    }
    const ly = dateObj.getFullYear();
    const lm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const ld = String(dateObj.getDate()).padStart(2, '0');
    if (ly >= 2000 && ly <= 2050) {
      return `${ly}-${lm}-${ld}`;
    }
  }

  // 3. Excel numeric date serial (e.g. 20000 - 90000)
  const numCandidate = (cellObj && cellObj.t === 'n' && typeof cellObj.v === 'number') 
    ? cellObj.v 
    : (typeof val === 'number' ? val : (typeof val === 'string' && /^\d+(\.\d+)?$/.test(val.trim()) ? parseFloat(val.trim()) : NaN));

  if (!isNaN(numCandidate) && numCandidate > 20000 && numCandidate < 90000) {
    const integerDay = Math.floor(numCandidate);
    const d = new Date(Math.round((integerDay - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) {
      const uy = d.getUTCFullYear();
      const um = String(d.getUTCMonth() + 1).padStart(2, '0');
      const ud = String(d.getUTCDate()).padStart(2, '0');
      if (uy >= 2000 && uy <= 2050) {
        return `${uy}-${um}-${ud}`;
      }
    }
  }

  // 4. Raw string candidates
  const strCandidates = [cellObj?.v, val, cellObj?.f];
  for (const raw of strCandidates) {
    if (!raw) continue;
    const str = String(raw).trim();
    if (!str || str === 'undefined' || str === 'null' || str === 'Unknown') continue;
    const res = parseAnyDateString(str);
    if (res) return res;
  }

  return null;
}

function parseCurveAsOfDate(
  sheet: XLSX.WorkSheet, 
  rows: any[][], 
  defaultAsOfDate: string = 'Unknown',
  fileName?: string
): string {
  // Priority 1: Cell A2 (EOD date in Jarvis Forward Curve cell A2)
  const a2Val = tryExtractDateString(rows[1]?.[0], sheet['A2'] || sheet['a2']);
  if (a2Val) return a2Val;

  if (sheet['A2']) {
    const directA2 = tryExtractDateString(sheet['A2'].v, sheet['A2']);
    if (directA2) return directA2;
  }

  // Priority 2: Cell A1
  const a1Val = tryExtractDateString(rows[0]?.[0], sheet['A1'] || sheet['a1']);
  if (a1Val) return a1Val;

  if (sheet['A1']) {
    const directA1 = tryExtractDateString(sheet['A1'].v, sheet['A1']);
    if (directA1) return directA1;
  }

  // Priority 3: Cell B2
  const b2Val = tryExtractDateString(rows[1]?.[1], sheet['B2'] || sheet['b2']);
  if (b2Val) return b2Val;

  // Priority 4: Cell B1
  const b1Val = tryExtractDateString(rows[0]?.[1], sheet['B1'] || sheet['b1']);
  if (b1Val) return b1Val;

  // Priority 5: Cell C2, C1, D2, D1, A3, B3
  const c2Val = tryExtractDateString(rows[1]?.[2], sheet['C2']);
  if (c2Val) return c2Val;
  const c1Val = tryExtractDateString(rows[0]?.[2], sheet['C1']);
  if (c1Val) return c1Val;
  const a3Val = tryExtractDateString(rows[2]?.[0], sheet['A3']);
  if (a3Val) return a3Val;
  const b3Val = tryExtractDateString(rows[2]?.[1], sheet['B3']);
  if (b3Val) return b3Val;

  // Priority 6: Scan first 15 rows and first 10 cols for any cell containing an EOD date
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    for (let c = 0; c < Math.min(rows[r]?.length || 0, 10); c++) {
      const cellAddress = XLSX.utils.encode_cell({ r, c });
      const cellVal = tryExtractDateString(rows[r]?.[c], sheet[cellAddress]);
      if (cellVal) return cellVal;
    }
  }

  // Priority 7: Master Sheet EOD Date if available
  if (defaultAsOfDate && defaultAsOfDate !== 'Unknown' && defaultAsOfDate !== 'Historical') {
    return defaultAsOfDate;
  }

  // Priority 8: Filename date (e.g. 2026_JARVISv3_CarvedOut_21082026.xlsx)
  if (fileName) {
    const fnVal = parseAnyDateString(fileName);
    if (fnVal) return fnVal;
  }

  return defaultAsOfDate;
}

function extractCurveSheet(
  sheet: XLSX.WorkSheet | null | undefined, 
  defaultAsOfDate: string = 'Unknown',
  fileName?: string
): { asOfDate: string; curves: any[] } | null {
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as any[][];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as any[][];
  if (!rows || rows.length === 0) return null;

  const asOfDate = parseCurveAsOfDate(sheet, rawRows.length > 0 ? rawRows : rows, defaultAsOfDate, fileName);

  // Step 1: Detect header row containing indices
  let headerRowIdx = -1;
  let indexColMap: Array<{ colIdx: number; indexName: string }> = [];

  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r];
    if (!row || !Array.isArray(row)) continue;
    const potential: Array<{ colIdx: number; indexName: string }> = [];
    
    for (let c = 0; c < row.length; c++) {
      const cellVal = String(row[c] || '').trim();
      if (!cellVal) continue;
      const norm = normalizeIndexNameForImport(cellVal);
      if (['BRIPE', 'JCC', 'Dated Brent', 'HH', 'HH Last Day', 'NBP', 'JKM', 'TTF', 'AECO', 'STN 2'].includes(norm)) {
        potential.push({ colIdx: c, indexName: norm });
      }
    }

    if (potential.length >= 1) {
      headerRowIdx = r;
      indexColMap = potential;
      break;
    }
  }

  // Fallback: If no recognized header row, check row 1 or row 0 (0-indexed) with fallback names
  if (headerRowIdx === -1) {
    headerRowIdx = 1;
    const fallback = ['BRIPE', 'JCC', 'Dated Brent', 'HH', 'NBP', 'JKM', 'TTF', 'AECO', 'STN 2'];
    for (let c = 1; c <= 10; c++) {
      const cellVal = rows[1]?.[c] || rows[0]?.[c];
      const raw = cellVal ? String(cellVal).trim() : '';
      const norm = raw ? normalizeIndexNameForImport(raw) : (c >= 2 ? fallback[c - 2] : '');
      if (norm) {
        indexColMap.push({ colIdx: c, indexName: norm });
      }
    }
  }

  // Step 2: Determine Contract Month column
  let monthColIdx = 0;
  for (let r = headerRowIdx + 1; r < Math.min(rows.length, headerRowIdx + 10); r++) {
    const row = rows[r];
    if (!row) continue;
    let found = false;
    for (let c = 0; c < Math.min(row.length, 4); c++) {
      const valToTest = rawRows[r]?.[c] !== undefined ? rawRows[r][c] : row[c];
      if (parseContractMonth(valToTest)) {
        monthColIdx = c;
        found = true;
        break;
      }
    }
    if (found) break;
  }

  const curves: Record<string, { index: string; points: Array<{ month: string; value: number }> }> = {};
  indexColMap.forEach(({ indexName }) => {
    if (!curves[indexName]) {
      curves[indexName] = { index: indexName, points: [] };
    }
  });

  // Step 3: Dynamically scan from row immediately following header (headerRowIdx + 1)
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const rawRow = rawRows[r] || [];
    if (!row || !Array.isArray(row)) continue;

    const monthVal = rawRow[monthColIdx] !== undefined ? rawRow[monthColIdx] : row[monthColIdx];
    const monthStr = parseContractMonth(monthVal);
    if (!monthStr) continue;

    indexColMap.forEach(({ colIdx, indexName }) => {
      const rawVal = rawRow[colIdx] !== undefined ? rawRow[colIdx] : row[colIdx];
      if (rawVal === undefined || rawVal === null || rawVal === '') return;
      const numVal = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal).replace(/[$,]/g, ''));
      if (!isNaN(numVal) && numVal !== 0) {
        const existing = curves[indexName].points.find(p => p.month === monthStr);
        if (existing) {
          existing.value = numVal;
        } else {
          curves[indexName].points.push({ month: monthStr, value: numVal });
        }
      }
    });
  }

  const curveList = Object.values(curves);
  if (curveList.every(c => c.points.length === 0)) return null;

  return {
    asOfDate,
    curves: curveList
  };
}

self.onmessage = (e: MessageEvent) => {
  const { data, fileName, whitelistColumns, priorityColumns } = e.data;
  
  try {
    const wb = XLSX.read(data, { type: 'array', cellDates: true, cellNF: true, cellText: true });
    
    // Robust sheet selection
    const sheetNames = wb.SheetNames;
    const masterSheetName = sheetNames.find(n => 
        ['master sheet', 'mastersheet', 'master', 'jarvis master'].includes(n.toLowerCase())
    );
    const mainSheet = masterSheetName ? wb.Sheets[masterSheetName] : wb.Sheets[sheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(mainSheet);
    
    // Check for Jarvis Purchase and Sales sheets if present
    const purchaseSheetName = sheetNames.find(n => n.toLowerCase().trim() === 'purchase');
    const salesSheetName = sheetNames.find(n => n.toLowerCase().trim() === 'sales');
    const jarvisBuyFormulas: Record<string, string> = {};
    const jarvisSellFormulas: Record<string, string> = {};

    const findValue = (row: any, aliases: string[]) => {
        for (const alias of aliases) {
            if (row[alias] !== undefined) return row[alias];
            const norm = alias.toLowerCase().replace(/[\s_]/g, '');
            for (const key of Object.keys(row)) {
                if (key.toLowerCase().replace(/[\s_]/g, '') === norm) return row[key];
            }
        }
        return undefined;
    };

    if (purchaseSheetName) {
      const pRows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[purchaseSheetName]);
      pRows.forEach(r => {
        const sn = String(findValue(r, ['Strategy Name', 'Strategy', 'Deal Name', 'No.', 'Deal No']) || '').trim();
        const f = String(findValue(r, ['Buy Formula', 'Buy Price Formula', 'Formula', 'Pricing Formula']) || '').trim();
        if (sn && f) jarvisBuyFormulas[sn] = f;
      });
    }

    if (salesSheetName) {
      const sRows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[salesSheetName]);
      sRows.forEach(r => {
        const sn = String(findValue(r, ['Strategy Name', 'Strategy', 'Deal Name', 'No.', 'Deal No']) || '').trim();
        const f = String(findValue(r, ['Sell Formula', 'Sales Formula', 'Sell Price Formula', 'Formula', 'Pricing Formula']) || '').trim();
        if (sn && f) jarvisSellFormulas[sn] = f;
      });
    }

    const srcRows: any[] = [];
    const hedgingRows: any[] = [];
    const paperRows: any[] = [];
    const trmsAgg: any = {};
    let portfolioName = 'Unknown';
    let portfolioYear = 'Unknown';

    const extractIndexFromRef = (ref: string): string => {
        const r = String(ref || '').toUpperCase();
        if (r.includes('HH')) return 'HH';
        if (r.includes('NBP')) return 'NBP';
        if (r.includes('TTF')) return 'TTF';
        if (r.includes('JKM')) return 'JKM';
        if (r.includes('BRENT')) return 'Brent';
        return 'Other';
    };

    const stringCache = new Map<string, string>();
    const intern = (val: any) => {
        if (typeof val !== 'string') return val;
        if (!stringCache.has(val)) stringCache.set(val, val);
        return stringCache.get(val);
    };

    const extractedRows: any[] = [];
    const targetColumns = [
      'Deal Num', 'Reference', 'Internal Portfolio', 'External Legal Entity',
      'Trade Date', 'Start Date', 'End Date', 'Buy_Sell', 'Price', 'Strike', 
      'Base_Total_Value_USD', 'Change_in_Total_PnL', 'Payment Date', 
      'Plsb Year Bucket', 'Volume', 'Unit', 'Strategy Name', 'Ins Type', 
      'Event Source', 'Settlement Type', 'Cflow Type', 'Volume Type', 
      'Price Status', 'EOD Date', 'Tran_Status', 'Yday_Tran_Status', 
      'Incoterm', 'BU_L1', 'BU_L2', 'BU_L3', 'BU_L4', 'BU_L5', 'BU_L6', 
      'Trader', 'IndexName_ProjectionMethod', 'Formula', 'Buy Formula', 'Sell Formula',
      'Pricing Formula', 'Pricing Expression'
    ];

    rawData.forEach((row: any) => {
      // Find internal portfolio
      const rawPort = findValue(row, ['Internal Portfolio', 'InternalPortfolio', 'Internal_Portfolio', 'Portfolio']);
      const iPort = typeof rawPort === 'string' ? rawPort.trim() : (rawPort !== undefined ? String(rawPort).trim() : '');
      const iPortUpper = iPort.toUpperCase();
      const isAllowedPortfolio = 
          iPortUpper === 'BASE LNG' || 
          iPortUpper === 'NTLB LNG' || 
          iPortUpper === 'OPTIMIZATION LNG' || 
          iPortUpper === 'DH LNG' || 
          iPortUpper === 'DFT LNG' || 
          iPortUpper === 'HEDGING LNG';

      // Find PLSB Year Bucket
      const rawY = findValue(row, ['Plsb Year Bucket', 'Plsb_Year_Bucket', 'Year Bucket', 'Year', 'PlsbYearBucket']);
      const y = typeof rawY === 'number' ? rawY : parseInt(String(rawY || '').replace(/[^0-9]/g, ''));
      const allowedYears = [2026, 2027, 2028];
      const isAllowedYear = allowedYears.includes(y);

      // Filter: if not matching both, completely discard the row
      if (!isAllowedPortfolio || !isAllowedYear) return;

      if (portfolioYear === 'Unknown') portfolioYear = String(y);

      const sName = intern(String(findValue(row, ['Strategy Name', 'Strategy', 'Deal Name']) || '').trim());
      if (!sName || sName.includes("GLNG") || (sName.includes("CSPA") && !sName.includes("CSPA Opt"))) return;

      if (portfolioName === 'Unknown' && iPort && iPortUpper !== 'HEDGING LNG' && iPortUpper !== 'DH LNG' && iPortUpper !== 'DFT LNG') {
          portfolioName = iPort;
      }

      // Create whitelisted row immediately to save memory (discard unused columns)
      const cleanRow: any = {};
      targetColumns.forEach((col: string) => {
        let val = row[col];
        if (val === undefined) {
          // try aliases
          if (col === 'Deal Num') {
             val = findValue(row, ['Deal_No', 'Deal No', 'Deal_Num', 'Deal Num', 'Deal ID', 'DealId', 'Deal_ID']);
          } else if (col === 'EOD Date') {
             val = findValue(row, ['EOD_Date', 'EOD Date', 'EODDate']);
          } else if (col === 'Base_Total_Value_USD') {
             val = findValue(row, ['Base_Total_Value_USD', 'Base Total Value USD', 'Total_Value_USD', 'Total Value USD']);
          } else if (col === 'Change_in_Total_PnL') {
             val = findValue(row, ['Change_in_Total_PnL', 'Change in Total PnL', 'Change_in_PnL', 'Change in PnL']);
          } else if (col === 'Buy_Sell') {
             val = findValue(row, ['BuySell', 'Buy/Sell', 'Buy_Sell', 'Buy_or_Sell']);
          } else if (col === 'Plsb Year Bucket') {
             val = findValue(row, ['Plsb Year Bucket', 'Plsb_Year_Bucket', 'Year Bucket', 'Year', 'PlsbYearBucket']);
          } else if (col === 'IndexName_ProjectionMethod') {
             val = findValue(row, [
               'IndexName_ProjectionMethod',
               'IndexName ProjectionMethod',
               'IndexName_Projection_Method',
               'Index Name Projection Method',
               'Index_Name_Projection_Method',
               'Projection Method',
               'ProjectionMethod',
               'Index Name',
               'IndexName',
               'Price Index',
               'Index'
             ]);
          } else {
             const normCol = col.toLowerCase().replace(/[\s_]/g, '');
             for (const key of Object.keys(row)) {
                 if (key.toLowerCase().replace(/[\s_]/g, '') === normCol) {
                     val = row[key];
                     break;
                 }
             }
          }
        }

        if (val !== undefined) {
          if (col === 'EOD Date') {
            const shifted = intern(shiftEodDatePlusOne(val));
            cleanRow[col] = shifted;
            cleanRow['EOD_Date'] = shifted;
          } else if (val instanceof Date) { 
              cleanRow[col] = intern(`${val.getUTCFullYear()}-${String(val.getUTCMonth()+1).padStart(2,'0')}-${String(val.getUTCDate()).padStart(2,'0')}`); 
          } else {
              cleanRow[col] = intern(val);
          }
        } else {
          cleanRow[col] = '';
        }
      });

      extractedRows.push(cleanRow);

      if (!trmsAgg[sName]) {
          trmsAgg[sName] = { 
              commodityLegs: [], 
              srcValue: 0, 
              srcLegs: [],
              hedgingPnL: 0,
              hedgingTrades: 0,
              hedgingIndices: [],
              loadingDate: '',
              deliveryDate: '',
              volumeType: 'Estimate',
              priceStatus: 'Estimate',
              commodityValue: 0,
              trmsPurchaseValue: 0,
              trmsSalesValue: 0,
              reconciledPurchaseCost: 0,
              reconciledSalesRevenue: 0,
              commWindowEndDate: '',
              buyFormula: jarvisBuyFormulas[sName] || '',
              sellFormula: jarvisSellFormulas[sName] || '',
              rawRows: []
          };
      }
      
      if (!trmsAgg[sName].buyFormula && jarvisBuyFormulas[sName]) {
          trmsAgg[sName].buyFormula = jarvisBuyFormulas[sName];
      }
      if (!trmsAgg[sName].sellFormula && jarvisSellFormulas[sName]) {
          trmsAgg[sName].sellFormula = jarvisSellFormulas[sName];
      }
      
      // Store clean row for deep dive
      trmsAgg[sName].rawRows.push(cleanRow);

      // Extract reconciled values if present (Jarvis Master Sheet)
      const recPurchaseRaw = findValue(row, [
          'Reconciled Purchase Cost', 
          'Finance Purchase Cost', 
          'Actual Purchase Cost', 
          'Purchase Cost Reconciled'
      ]);
      const recSalesRaw = findValue(row, [
          'Reconciled Sales Revenue', 
          'Finance Sales Revenue', 
          'Finance Revenue', 
          'Actual Sales Revenue', 
          'Sales Revenue Reconciled'
      ]);

      const recPurchase = typeof recPurchaseRaw === 'number' ? recPurchaseRaw : parseFloat(String(recPurchaseRaw || '').replace(/[^0-9.-]/g, '')) || 0;
      const recSales = typeof recSalesRaw === 'number' ? recSalesRaw : parseFloat(String(recSalesRaw || '').replace(/[^0-9.-]/g, '')) || 0;

      if (recPurchase > 0) trmsAgg[sName].reconciledPurchaseCost = recPurchase;
      if (recSales > 0) trmsAgg[sName].reconciledSalesRevenue = recSales;

      const rowSettlementType = intern(String(cleanRow['Settlement Type'] || row['Settlement Type'] || '').trim());

      const getRowValue = (keys: string[]) => {
          for (const k of keys) {
              if (row[k] !== undefined) {
                  const v = row[k];
                  if (typeof v === 'number') return v;
                  if (typeof v === 'string') return parseFloat(v.replace(/[^0-9.-]/g, '')) || 0;
                  return Number(v) || 0;
              }
          }
          return 0;
      };

      const cType = intern(String(cleanRow['Cflow Type'] || row['Cflow Type'] || '').trim());
      const cTypeLower = cType.toLowerCase();
      const valUSD = getRowValue(['Base_Total_Value_USD', 'Base Total Value USD', 'Total_Value_USD', 'Total Value USD', 'Base_Total_Value', 'Total_Value']);
      
      if (cTypeLower === "commodity" || cTypeLower === "physical" || cTypeLower === "base value" || cTypeLower === "cargo value") {
          trmsAgg[sName].commodityValue += valUSD;
          const buySell = intern(String(cleanRow['Buy_Sell'] || row['Buy_Sell'] || '').trim());
          if (buySell === 'Buy') trmsAgg[sName].trmsPurchaseValue += Math.abs(valUSD);
          if (buySell === 'Sell') trmsAgg[sName].trmsSalesValue += Math.abs(valUSD);
      }
      const pnlChange = Number(cleanRow['Change_in_Total_PnL'] || row['Change_in_Total_PnL'] || 0);
      const ref = intern(String(cleanRow['Reference'] || row['Reference'] || ''));

      const formatDate = (val: any) => {
          if (val instanceof Date) return intern(val.toISOString().split('T')[0]);
          return intern(String(val || ''));
      };

      const sDate = formatDate(cleanRow['Start Date'] || row['Start Date'] || row['Comm Window Start Date']);
      const eDate = formatDate(cleanRow['End Date'] || row['End Date'] || row['Comm Window End Date']);
      const commWindowEndDate = formatDate(row['Comm Window End Date'] || row['End Date']);
      
      if (commWindowEndDate) {
          trmsAgg[sName].commWindowEndDate = commWindowEndDate;
      }
      
      if (cTypeLower.includes("src") || cTypeLower.includes("shipping")) {
          const absVal = Math.abs(valUSD);
          trmsAgg[sName].srcValue += absVal;
          trmsAgg[sName].srcLegs.push({ 
              value: absVal, 
              description: intern(cType || 'SRC'),
              rawRow: cleanRow
          });
      } else if (cTypeLower === "commodity" || cTypeLower === "physical") {
          const buySell = intern(String(cleanRow['Buy_Sell'] || row['Buy_Sell'] || '').trim());
          const priceStatus = intern(String(cleanRow['Price Status'] || row['Price Status'] || 'Unknown'));
          const volumeType = intern(String(cleanRow['Volume Type'] || row['Volume Type'] || 'Estimate'));
          trmsAgg[sName].commodityLegs.push({ 
              price: Number(cleanRow['Price'] || row['Price'] || 0), 
              vol: Math.abs(Number(cleanRow['Volume'] || row['Volume'] || 0)), 
              buySell,
              startDate: sDate,
              endDate: eDate,
              priceStatus,
              volumeType,
              settlementType: rowSettlementType,
              valueUSD: valUSD,
              rawRow: cleanRow
          });
          if (buySell === 'Buy' && sDate) trmsAgg[sName].loadingDate = sDate;
          if (buySell === 'Sell' && eDate) {
              trmsAgg[sName].deliveryDate = eDate;
              trmsAgg[sName].commWindowEndDate = eDate;
          }
      }

      if (iPortUpper === "HEDGING LNG") {
          const dealStatus = String(row['Deal Status'] || '').trim().toLowerCase();
          // Only count live/active hedging trades as "Open Trades"
          if (dealStatus === 'live' || dealStatus === 'open' || dealStatus === 'active' || !dealStatus) {
              trmsAgg[sName].hedgingPnL += pnlChange;
              trmsAgg[sName].hedgingTrades += 1;
              const idx = intern(extractIndexFromRef(ref));
              if (!trmsAgg[sName].hedgingIndices.includes(idx)) {
                  trmsAgg[sName].hedgingIndices.push(idx);
              }
          }
      }
      
      if (cTypeLower.includes("src") || cTypeLower.includes("shipping")) srcRows.push(cleanRow);
      if (iPortUpper === "HEDGING LNG") hedgingRows.push(cleanRow);
      if (iPortUpper === "DH LNG" || iPortUpper === "DFT LNG") paperRows.push(cleanRow);
    });

    // Post-process trmsAgg to set final volumeType and priceStatus based on both legs
    Object.keys(trmsAgg).forEach(sName => {
        const agg = trmsAgg[sName];
        const buyLegs = agg.commodityLegs.filter((l: any) => l.buySell === 'Buy');
        const sellLegs = agg.commodityLegs.filter((l: any) => l.buySell === 'Sell');

        const hasBuy = buyLegs.length > 0;
        const hasSell = sellLegs.length > 0;

        // Volume Type: Actual only if both exist and all are Actual
        const allBuyActual = hasBuy && buyLegs.every((l: any) => l.volumeType === 'Actual');
        const allSellActual = hasSell && sellLegs.every((l: any) => l.volumeType === 'Actual');
        
        if (hasBuy && hasSell) {
            agg.volumeType = (allBuyActual && allSellActual) ? 'Actual' : 'Estimate';
        } else if (hasBuy) {
            agg.volumeType = allBuyActual ? 'Actual' : 'Estimate';
        } else if (hasSell) {
            agg.volumeType = allSellActual ? 'Actual' : 'Estimate';
        } else {
            agg.volumeType = 'Estimate';
        }

        // Price Status: Fixed only if both exist and all are Fixed
        const allBuyFixed = hasBuy && buyLegs.every((l: any) => l.priceStatus === 'Fixed');
        const allSellFixed = hasSell && sellLegs.every((l: any) => l.priceStatus === 'Fixed');

        if (hasBuy && hasSell) {
            agg.priceStatus = (allBuyFixed && allSellFixed) ? 'Fixed' : 'Estimate';
        } else if (hasBuy) {
            agg.priceStatus = allBuyFixed ? 'Fixed' : 'Estimate';
        } else if (hasSell) {
            agg.priceStatus = allSellFixed ? 'Fixed' : 'Estimate';
        } else {
            agg.priceStatus = 'Estimate';
        }
    });

    // Determine EOD date from Master Sheet if available
    let masterEodDate = 'Unknown';
    for (const r of extractedRows) {
        if (r['EOD Date'] && r['EOD Date'] !== 'Unknown') {
            masterEodDate = r['EOD Date'];
            break;
        }
        if (r['EOD_Date'] && r['EOD_Date'] !== 'Unknown') {
            masterEodDate = r['EOD_Date'];
            break;
        }
    }

    // Extract Forward Curve if exists
    let forwardCurveData = null;
    const fcSheetName = wb.SheetNames.find(n => {
        const lower = n.trim().toLowerCase();
        if (lower.includes('hist')) return false;
        return lower === "forward curve" || lower === "forward curves" || lower === "forward_curve" || lower === "forwardcurve" || lower === "fc" || lower === "forward" || lower === "curves" || lower === "curve" || (lower.includes("forward") && lower.includes("curve")) || lower === "price curve" || lower === "price curves" || lower === "market curve" || lower === "market curves" || lower === "market data";
    });
    const fcSheet = fcSheetName ? wb.Sheets[fcSheetName] : null;
    if (fcSheet) {
        forwardCurveData = extractCurveSheet(fcSheet, masterEodDate, fileName);
    }

    // Extract Historical Curve if exists
    let historicalCurveData = null;
    const histSheetName = wb.SheetNames.find(n => {
        const lower = n.trim().toLowerCase();
        return lower === "historical curve" || lower === "historical curves" || lower === "historical" || lower === "history" || lower === "historical prices" || lower === "historical price" || lower === "hist curve" || lower === "hist curves" || lower === "historical data" || lower === "hist data" || lower === "hist prices" || lower === "hist price" || lower === "hist" || lower === "hist_curve" || lower === "historical_curve" || lower.includes("hist") || lower.includes("history");
    });
    const histSheet = histSheetName ? wb.Sheets[histSheetName] : null;
    if (histSheet) {
        historicalCurveData = extractCurveSheet(histSheet, 'Historical', fileName);
    }

    self.postMessage({
      success: true,
      src: srcRows,
      hedging: hedgingRows,
      paper: paperRows,
      trmsAgg,
      extractedRows,
      forwardCurve: forwardCurveData,
      historicalCurve: historicalCurveData,
      debugInfo: {
        sheetNames: wb.SheetNames,
        foundFcSheet: fcSheetName || 'None',
        foundHistSheet: histSheetName || 'None'
      },
      summary: {
        total: rawData.length,
        src: srcRows.length,
        hedging: hedgingRows.length,
        paper: paperRows.length
      }
    });
  } catch (error) {
    self.postMessage({ success: false, error: String(error) });
  }
};
