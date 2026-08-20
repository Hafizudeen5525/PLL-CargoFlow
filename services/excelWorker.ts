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

self.onmessage = (e: MessageEvent) => {
  const { data, whitelistColumns, priorityColumns } = e.data;
  
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
        let asOfDate = 'Unknown';
        const a2 = fcSheet['A2'];
        if (a2) {
            if (a2.t === 'd' || (a2.t === 'n' && a2.v > 20000)) {
                const d = a2.v instanceof Date ? a2.v : new Date(Math.round((a2.v - 25569) * 86400 * 1000));
                asOfDate = d.toISOString().split('T')[0];
            } else {
                asOfDate = a2.w || String(a2.v);
            }
        }
        
        // Read indexes from C2:K2
        const indexes: string[] = [];
        for (let i = 2; i <= 10; i++) {
            const cell = fcSheet[XLSX.utils.encode_cell({ r: 1, c: i })];
            if (cell) indexes.push(String(cell.v).trim());
            else {
                // Fallback to expected sequence if cell is empty
                const fallback = ['BRIPE', 'JCC', 'Dated Brent', 'HH', 'NBP', 'JKM', 'TTF', 'AECO', 'Station 2'];
                indexes.push(fallback[i-2] || `Index ${i-1}`);
            }
        }

        const curves: any[] = indexes.map((idx) => ({
            index: idx,
            points: []
        }));

        const fcRows = XLSX.utils.sheet_to_json(fcSheet, { header: 1 }) as any[][];
        
        for (let r = 3; r < fcRows.length; r++) {
            const row = fcRows[r];
            const monthVal = row[1]; // Column B
            if (monthVal === undefined || monthVal === null) continue;
            
            let monthStr = '';
            if (monthVal instanceof Date) {
                const y = monthVal.getUTCFullYear();
                const m = String(monthVal.getUTCMonth() + 1).padStart(2, '0');
                monthStr = `${y}-${m}`;
            } else if (typeof monthVal === 'number') {
                const date = new Date(Math.round((monthVal - 25569) * 86400 * 1000));
                const y = date.getUTCFullYear();
                const m = String(date.getUTCMonth() + 1).padStart(2, '0');
                monthStr = `${y}-${m}`;
            } else {
                const raw = String(monthVal).trim();
                const isoMatch = raw.match(/^(\d{4})[-/.](\d{1,2})/);
                if (isoMatch) {
                    monthStr = `${isoMatch[1]}-${String(parseInt(isoMatch[2], 10)).padStart(2, '0')}`;
                } else {
                    const monthsMap: Record<string, string> = {
                        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
                        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
                    };
                    const mMatch = raw.match(/([a-zA-Z]{3,})[-/.\s,]+(\d{2,4})|(\d{2,4})[-/.\s,]+([a-zA-Z]{3,})/);
                    if (mMatch) {
                        const mStr = (mMatch[1] || mMatch[4] || '').toLowerCase().slice(0, 3);
                        const yStr = mMatch[2] || mMatch[3] || '';
                        if (monthsMap[mStr] && yStr) {
                            let y = parseInt(yStr, 10);
                            if (y < 100) y += 2000;
                            monthStr = `${y}-${monthsMap[mStr]}`;
                        } else {
                            monthStr = raw;
                        }
                    } else {
                        monthStr = raw;
                    }
                }
            }

            for (let i = 0; i < indexes.length; i++) {
                const val = row[i + 2]; // Columns C to K
                const numVal = typeof val === 'number' ? val : parseFloat(String(val || '').replace(/[$,]/g, ''));
                if (!isNaN(numVal) && numVal !== 0) {
                    curves[i].points.push({ month: monthStr, value: numVal });
                }
            }
        }
        forwardCurveData = { asOfDate, curves };
    }

    self.postMessage({
      success: true,
      src: srcRows,
      hedging: hedgingRows,
      paper: paperRows,
      trmsAgg,
      extractedRows,
      forwardCurve: forwardCurveData,
      debugInfo: {
        sheetNames: wb.SheetNames,
        foundFcSheet: fcSheetName || 'None'
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
