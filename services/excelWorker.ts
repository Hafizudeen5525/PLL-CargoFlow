import * as XLSX from 'xlsx';

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
    
    const srcRows: any[] = [];
    const hedgingRows: any[] = [];
    const paperRows: any[] = [];
    const trmsAgg: any = {};
    let portfolioName = 'Unknown';
    let portfolioYear = 'Unknown';

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

    const extractIndexFromRef = (ref: string): string => {
        const r = String(ref || '').toUpperCase();
        if (r.includes('HH')) return 'HH';
        if (r.includes('NBP')) return 'NBP';
        if (r.includes('TTF')) return 'TTF';
        if (r.includes('JKM')) return 'JKM';
        if (r.includes('BRENT')) return 'Brent';
        return 'Other';
    };

    rawData.forEach((row: any) => {
      const rawY = findValue(row, ['Plsb Year Bucket', 'Year', 'Year Bucket']);
      const y = typeof rawY === 'number' ? rawY : parseInt(String(rawY || '').replace(/[^0-9]/g, ''));
      if (isNaN(y) || y < 2024) return;
      
      if (portfolioYear === 'Unknown') portfolioYear = String(y);
      
      const sName = String(findValue(row, ['Strategy Name', 'Strategy', 'Deal Name']) || '').trim();
      if (!sName || sName.includes("GLNG") || sName.includes("CSPA")) return;
      
      const iPort = String(row['Internal Portfolio'] || '').trim();
      if (portfolioName === 'Unknown' && iPort && iPort !== 'Hedging LNG' && iPort !== 'DH LNG' && iPort !== 'DFT LNG') {
          portfolioName = iPort;
      }

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
              commWindowEndDate: ''
          };
      }

      // Extract reconciled values if present (Jarvis Master Sheet)
      const recPurchaseRaw = findValue(row, [
          'Reconciled Purchase Cost', 
          'Finance Purchase Cost', 
          'Finance Cost', 
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

      const rowSettlementType = String(row['Settlement Type'] || '').trim();

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

      const cType = String(row['Cflow Type'] || '').trim();
      const cTypeLower = cType.toLowerCase();
      const valUSD = getRowValue(['Base_Total_Value_USD', 'Base Total Value USD', 'Total_Value_USD', 'Total Value USD', 'Base_Total_Value', 'Total_Value']);
      
      if (cTypeLower === "commodity" || cTypeLower === "physical" || cTypeLower === "base value" || cTypeLower === "cargo value") {
          trmsAgg[sName].commodityValue += valUSD;
          const buySell = String(row['Buy_Sell'] || '').trim();
          if (buySell === 'Buy') trmsAgg[sName].trmsPurchaseValue += Math.abs(valUSD);
          if (buySell === 'Sell') trmsAgg[sName].trmsSalesValue += Math.abs(valUSD);
      }
      const pnlChange = Number(row['Change_in_Total_PnL'] || 0);
      const ref = String(row['Reference'] || '');

      const formatDate = (val: any) => {
          if (val instanceof Date) return val.toISOString().split('T')[0];
          return String(val || '');
      };

      const sDate = formatDate(row['Start Date'] || row['Comm Window Start Date']);
      const eDate = formatDate(row['End Date'] || row['Comm Window End Date']);
      const commWindowEndDate = formatDate(row['Comm Window End Date']);
      
      if (commWindowEndDate) {
          trmsAgg[sName].commWindowEndDate = commWindowEndDate;
      }
      
      if (cTypeLower.includes("src") || cTypeLower.includes("shipping")) {
          const absVal = Math.abs(valUSD);
          trmsAgg[sName].srcValue += absVal;
          trmsAgg[sName].srcLegs.push({ 
              value: absVal, 
              description: String(row['Cflow Type'] || 'SRC') 
          });
      } else if (cTypeLower === "commodity" || cTypeLower === "physical") {
          const buySell = String(row['Buy_Sell'] || '').trim();
          const priceStatus = String(row['Price Status'] || 'Unknown');
          const volumeType = String(row['Volume Type'] || 'Estimate');
          trmsAgg[sName].commodityLegs.push({ 
              price: Number(row['Price'] || 0), 
              vol: Math.abs(Number(row['Volume'] || 0)), 
              buySell,
              startDate: sDate,
              endDate: eDate,
              priceStatus,
              volumeType,
              settlementType: rowSettlementType,
              valueUSD: valUSD
          });
          if (buySell === 'Buy' && sDate) trmsAgg[sName].loadingDate = sDate;
          if (buySell === 'Sell' && eDate) {
              trmsAgg[sName].deliveryDate = eDate;
              trmsAgg[sName].commWindowEndDate = eDate;
          }
      }

      if (iPort === "Hedging LNG") {
          trmsAgg[sName].hedgingPnL += pnlChange;
          trmsAgg[sName].hedgingTrades += 1;
          const idx = extractIndexFromRef(ref);
          if (!trmsAgg[sName].hedgingIndices.includes(idx)) {
              trmsAgg[sName].hedgingIndices.push(idx);
          }
      }
      
      const cleanRow: any = {};
      whitelistColumns.forEach((col: string) => {
        if (row[col] !== undefined) {
          if (row[col] instanceof Date) { 
              const d = row[col]; 
              cleanRow[col] = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`; 
          } else cleanRow[col] = row[col];
        }
      });
      
      if (cType === "SRC- Shipping Related Cost") srcRows.push(cleanRow);
      if (iPort === "Hedging LNG") hedgingRows.push(cleanRow);
      if (iPort === "DH LNG" || iPort === "DFT LNG") paperRows.push(cleanRow);
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
                monthStr = String(monthVal);
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
