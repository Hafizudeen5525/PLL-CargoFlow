import * as XLSX from 'xlsx';

self.onmessage = (e: MessageEvent) => {
  const { data, whitelistColumns, priorityColumns } = e.data;
  
  try {
    const wb = XLSX.read(data, { type: 'binary', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(ws);
    
    const srcRows: any[] = [];
    const hedgingRows: any[] = [];
    const paperRows: any[] = [];
    const trmsAgg: any = {};

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
      const rawY = row['Plsb Year Bucket'];
      let y = typeof rawY === 'number' ? rawY : parseInt(String(rawY || '').replace(/[^0-9]/g, ''));
      if (isNaN(y) || y < 2025) return;
      
      const sName = String(row['Strategy Name'] || '').trim();
      if (!sName || sName.includes("GLNG") || sName.includes("CSPA")) return;
      
      if (!trmsAgg[sName]) {
          trmsAgg[sName] = { 
              commodityLegs: [], 
              srcValue: 0, 
              srcLegs: [],
              hedgingPnL: 0,
              hedgingTrades: 0,
              hedgingIndices: [], // Use array instead of Set for serialization
              loadingDate: '',
              deliveryDate: '',
              volumeType: 'Estimate',
              priceStatus: 'Estimate',
              commodityValue: 0
          };
      }

      const rowVolType = String(row['Volume Type'] || 'Estimate');
      if (rowVolType === 'Actual') {
          trmsAgg[sName].volumeType = 'Actual';
      }

      const rowPriceStatus = String(row['Price Status'] || 'Estimate');
      if (rowPriceStatus === 'Fixed') {
          trmsAgg[sName].priceStatus = 'Fixed';
      }
      
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
      const iPort = String(row['Internal Portfolio'] || '').trim();
      const valUSD = getRowValue(['Base_Total_Value_USD', 'Base Total Value USD', 'Total_Value_USD', 'Total Value USD', 'Base_Total_Value', 'Total_Value']);
      
      if (cTypeLower === "commodity" || cTypeLower === "physical" || cTypeLower === "base value" || cTypeLower === "cargo value") {
          trmsAgg[sName].commodityValue += valUSD;
      }
      const pnlChange = Number(row['Change_in_Total_PnL'] || 0);
      const ref = String(row['Reference'] || '');

      const formatDate = (val: any) => {
          if (val instanceof Date) return val.toISOString().split('T')[0];
          return String(val || '');
      };

      const sDate = formatDate(row['Start Date'] || row['Comm Window Start Date']);
      const eDate = formatDate(row['End Date'] || row['Comm Window End Date']);
      
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
          trmsAgg[sName].commodityLegs.push({ 
              price: Number(row['Price'] || 0), 
              vol: Math.abs(Number(row['Volume'] || 0)), 
              buySell,
              startDate: sDate,
              endDate: eDate,
              priceStatus,
              settlementType: rowSettlementType,
              valueUSD: valUSD
          });
          if (buySell === 'Buy' && sDate) trmsAgg[sName].loadingDate = sDate;
          if (buySell === 'Sell' && eDate) trmsAgg[sName].deliveryDate = eDate;
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

    // Extract Forward Curve if exists
    let forwardCurveData = null;
    const fcSheet = wb.Sheets["Forward Curve"];
    if (fcSheet) {
        const asOfDate = fcSheet['A2'] ? (fcSheet['A2'].w || String(fcSheet['A2'].v)) : 'Unknown';
        
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
                monthStr = monthVal.toISOString().split('T')[0];
            } else if (typeof monthVal === 'number') {
                const date = new Date(Math.round((monthVal - 25569) * 86400 * 1000));
                monthStr = date.toISOString().split('T')[0];
            } else {
                monthStr = String(monthVal);
            }

            for (let i = 0; i < indexes.length; i++) {
                const val = row[i + 2]; // Columns C to K
                if (typeof val === 'number') {
                    curves[i].points.push({ month: monthStr, value: val });
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
