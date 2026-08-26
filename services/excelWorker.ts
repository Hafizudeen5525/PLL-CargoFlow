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
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    }
    return null;
  }
  const raw = String(val).trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})[-/.](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${String(parseInt(isoMatch[2], 10)).padStart(2, '0')}`;
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

function parseCurveAsOfDate(
  sheet: XLSX.WorkSheet, 
  rows: any[][], 
  defaultAsOfDate: string = 'Unknown',
  fileName?: string
): string {
  const tryParseValue = (val: any, cellObj?: any): string | null => {
    if (!val && !cellObj) return null;

    // 1. Check Date object
    if (cellObj && cellObj.t === 'd' && cellObj.v instanceof Date) {
      const d = cellObj.v;
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }
    if (val instanceof Date) {
      if (!isNaN(val.getTime())) {
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, '0');
        const day = String(val.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }

    // 2. Excel numeric date serial (>20000 and <90000, i.e. 1954 to 2146)
    const num = (cellObj && cellObj.t === 'n' && typeof cellObj.v === 'number') 
      ? cellObj.v 
      : (typeof val === 'number' ? val : parseFloat(String(val).trim()));

    if (!isNaN(num) && num > 20000 && num < 90000 && (typeof val === 'number' || /^\d+(\.\d+)?$/.test(String(val).trim()))) {
      const d = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }

    // 3. String representation (w: formatted, v: value, or raw val)
    const str = String(cellObj?.w || cellObj?.v || val || '').trim();
    if (!str || str === 'undefined' || str === 'null' || str === 'Unknown') return null;

    // ISO format: YYYY-MM-DD or YYYY/MM/DD
    const isoMatch = str.match(/\b(20\d{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

    // DD-MMM-YYYY or DD MMM YYYY or DD-MMM-YY (e.g. 19-Aug-2026, 19-Aug-26, 19 Aug 2026, 31-May-2024)
    const monthNames: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    const dMmmYMatch = str.match(/\b(0?[1-9]|[12]\d|3[01])[-/\s.]([a-zA-Z]{3,})[-/\s.](\d{2,4})\b/);
    if (dMmmYMatch) {
      const day = dMmmYMatch[1].padStart(2, '0');
      const mStr = dMmmYMatch[2].toLowerCase().slice(0, 3);
      let y = parseInt(dMmmYMatch[3], 10);
      if (y < 100) y += 2000;
      if (monthNames[mStr]) {
        return `${y}-${monthNames[mStr]}-${day}`;
      }
    }

    // MMM-DD-YYYY or MMM DD, YYYY (e.g. Aug 19, 2026)
    const mmmDYMatch = str.match(/\b([a-zA-Z]{3,})[-/\s.](0?[1-9]|[12]\d|3[01])(?:,)?[-/\s.](\d{2,4})\b/);
    if (mmmDYMatch) {
      const mStr = mmmDYMatch[1].toLowerCase().slice(0, 3);
      const day = mmmDYMatch[2].padStart(2, '0');
      let y = parseInt(mmmDYMatch[3], 10);
      if (y < 100) y += 2000;
      if (monthNames[mStr]) {
        return `${y}-${monthNames[mStr]}-${day}`;
      }
    }

    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (e.g. 19/08/2026, 31/05/2024, 19.08.2026)
    const dmyMatch = str.match(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2}|\d{2})\b/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      let y = parseInt(dmyMatch[3], 10);
      if (y < 100) y += 2000;
      return `${y}-${month}-${day}`;
    }

    // 8-digit date string DDMMYYYY (e.g. 19082026 -> 2026-08-19)
    const ddmmyyyy = str.match(/\b(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(20\d{2})\b/);
    if (ddmmyyyy) {
      return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
    }

    // 8-digit date string YYYYMMDD (e.g. 20260819 -> 2026-08-19)
    const yyyymmdd = str.match(/\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/);
    if (yyyymmdd) {
      return `${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}`;
    }

    return null;
  };

  // Priority 1: Cell A2 (EOD date in Jarvis Forward Curve cell A2)
  const a2Val = tryParseValue(rows[1]?.[0], sheet['A2']);
  if (a2Val) return a2Val;

  // Priority 2: Cell A1
  const a1Val = tryParseValue(rows[0]?.[0], sheet['A1']);
  if (a1Val) return a1Val;

  // Priority 3: Cell B2
  const b2Val = tryParseValue(rows[1]?.[1], sheet['B2']);
  if (b2Val) return b2Val;

  // Priority 4: Cell B1
  const b1Val = tryParseValue(rows[0]?.[1], sheet['B1']);
  if (b1Val) return b1Val;

  // Priority 5: Scan first 3 rows for any date
  for (let r = 0; r < Math.min(rows.length, 3); r++) {
    for (let c = 0; c < (rows[r]?.length || 0); c++) {
      const cellAddress = XLSX.utils.encode_cell({ r, c });
      const cellVal = tryParseValue(rows[r][c], sheet[cellAddress]);
      if (cellVal) return cellVal;
    }
  }

  // Priority 6: Filename date (e.g. 2026_JARVISv3_CarvedOut_19082026)
  if (fileName) {
    const fnVal = tryParseValue(fileName);
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
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  if (!rows || rows.length === 0) return null;

  const asOfDate = parseCurveAsOfDate(sheet, rows, defaultAsOfDate, fileName);

  // Step 1: Detect header row containing indices
  let headerRowIdx = -1;
  let indexColMap: Array<{ colIdx: number; indexName: string }> = [];

  for (let r = 0; r < Math.min(rows.length, 10); r++) {
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

    if (potential.length >= 2) {
      headerRowIdx = r;
      indexColMap = potential;
      break;
    }
  }

  // Fallback: If no recognized header row, check row 1 (0-indexed) with fallback names
  if (headerRowIdx === -1) {
    headerRowIdx = 1;
    const fallback = ['BRIPE', 'JCC', 'Dated Brent', 'HH', 'NBP', 'JKM', 'TTF', 'AECO', 'STN 2'];
    for (let c = 2; c <= 10; c++) {
      const cellVal = rows[1]?.[c];
      const raw = cellVal ? String(cellVal).trim() : '';
      const norm = raw ? normalizeIndexNameForImport(raw) : fallback[c - 2];
      indexColMap.push({ colIdx: c, indexName: norm || `Index ${c - 1}` });
    }
  }

  // Step 2: Determine Contract Month column (column B / index 1 or column A / index 0)
  let monthColIdx = 1;
  for (let r = headerRowIdx + 1; r < Math.min(rows.length, headerRowIdx + 10); r++) {
    const row = rows[r];
    if (!row) continue;
    if (parseContractMonth(row[1])) {
      monthColIdx = 1;
      break;
    } else if (parseContractMonth(row[0])) {
      monthColIdx = 0;
      break;
    }
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
    if (!row || !Array.isArray(row)) continue;

    const monthVal = row[monthColIdx];
    const monthStr = parseContractMonth(monthVal);
    if (!monthStr) continue;

    indexColMap.forEach(({ colIdx, indexName }) => {
      const val = row[colIdx];
      if (val === undefined || val === null || val === '') return;
      const numVal = typeof val === 'number' ? val : parseFloat(String(val).replace(/[$,]/g, ''));
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
    const wb = XLSX.read(data, { type: 'array', cellDates: true });
    
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

    // Extract Forward Curve if exists
    let forwardCurveData = null;
    const fcSheetName = wb.SheetNames.find(n => {
        const lower = n.trim().toLowerCase();
        return lower === "forward curve" || (lower.includes("forward") && lower.includes("curve"));
    });
    const fcSheet = fcSheetName ? wb.Sheets[fcSheetName] : null;
    if (fcSheet) {
        forwardCurveData = extractCurveSheet(fcSheet, 'Unknown', fileName);
    }

    // Extract Historical Curve if exists
    let historicalCurveData = null;
    const histSheetName = wb.SheetNames.find(n => {
        const lower = n.trim().toLowerCase();
        return lower === "historical curve" || lower === "historical" || lower === "historical prices" || lower === "hist curve" || lower === "historical data" || (lower.includes("hist") && lower.includes("curve"));
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
