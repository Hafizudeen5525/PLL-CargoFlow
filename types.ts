
export enum PnLBucket {
  Realized = 'Realized',
  Unrealized = 'Unrealized',
  Unspecified = 'Unspecified'
}

export interface CargoProfile {
  id: string;
  source: string;
  strategyName: string;
  manualGroup?: string;
  buyer: string;
  optimized: boolean;
  deliveryDate: string;
  deliveryMonth: string;
  deliveredVolume: number;
  sellFormula: string;
  absoluteSellPrice: number;
  salesRevenue: number;
  loadedVolume: number;
  loadingDate: string;
  loadingMonth: string;
  buyFormula: string;
  absoluteBuyPrice: number;
  incoterms: string;
  src: string;
  pnlBucket: PnLBucket;
  reconciledPurchaseCost: number;
  finalSalesRevenue: number;
  reconciledSalesRevenue: number;
  finalTotalCost: number;
  finalPhysicalPnL: number;
  totalHedgingPnL: number;
  finalTotalPnL: number;
  volumeUnit?: string;
  pricingEndDate?: string;
  
  loadingWindowStart?: string;
  loadingWindowEnd?: string;
  deliveryWindowStart?: string;
  deliveryWindowEnd?: string;

  // --- Jarvis Specific Detail Columns ---
  // Purchase Components
  buyPrice1Weightage?: string;
  buyPrice1Slope?: string;
  buyPriceIndex1?: string;
  buyPrice1MonthDef?: string;
  buyPrice1Constant?: string;
  buyPrice2Weightage?: string;
  buyPrice2Slope?: string;
  buyPriceIndex2?: string;
  buyPrice2MonthDef?: string;
  buyPrice2Constant?: string;

  // Sales Components
  sellPrice1Weightage?: string;
  sellPrice1Value?: number;
  sellPrice1Slope?: string;
  sellPriceIndex1?: string;
  sellPrice1MonthDef?: string;
  sellPrice1Constant?: string;
  sellPrice2Weightage?: string;
  sellPrice2Value?: number;
  sellPrice2Slope?: string;
  sellPriceIndex2?: string;
  sellPrice2MonthDef?: string;
  sellPrice2Constant?: string;
  
  jarvisNo?: string;
}

export interface DealLeg {
  id: string;
  type: 'Buy' | 'Sell';
  counterparty: string;
  date: string;
  volume: number;
  formula: string;
  absolutePrice: number;
  totalValue: number;
  volumeUnit: string;
  status: PnLBucket;
  incoterms?: string;
  windowStart?: string;
  windowEnd?: string;
}

export interface ShipmentStrategy {
  id: string;
  strategyName: string;
  manualGroup?: string;
  pnlBucket: PnLBucket;
  buyLeg: DealLeg;
  sellLeg: DealLeg;
  totalPnL: number;
}

export const EmptyCargoProfile: Omit<CargoProfile, 'id'> = {
  source: '',
  strategyName: '',
  manualGroup: '',
  buyer: '',
  optimized: false,
  deliveryDate: '',
  deliveryMonth: '',
  deliveredVolume: 0,
  sellFormula: '',
  absoluteSellPrice: 0,
  salesRevenue: 0,
  loadedVolume: 0,
  loadingDate: '',
  loadingMonth: '',
  buyFormula: '',
  absoluteBuyPrice: 0,
  incoterms: '',
  src: '',
  pnlBucket: PnLBucket.Unrealized,
  reconciledPurchaseCost: 0,
  finalSalesRevenue: 0,
  reconciledSalesRevenue: 0,
  finalTotalCost: 0,
  finalPhysicalPnL: 0,
  totalHedgingPnL: 0,
  finalTotalPnL: 0,
  volumeUnit: 'MMBtu',
  loadingWindowStart: '',
  loadingWindowEnd: '',
  deliveryWindowStart: '',
  deliveryWindowEnd: ''
};
