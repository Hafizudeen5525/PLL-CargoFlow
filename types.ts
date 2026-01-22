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
  
  // Manual Overrides & Rounding
  isBuyPriceManual?: boolean;
  isSellPriceManual?: boolean;
  buyPriceRounding?: number;
  sellPriceRounding?: number;
  
  loadingWindowStart?: string;
  loadingWindowEnd?: string;
  deliveryWindowStart?: string;
  deliveryWindowEnd?: string;

  // --- Jarvis Specific Granular Pricing Columns ---
  // Purchase Components
  buyPrice1Weightage?: number;
  buyPrice1Slope?: number;
  buyPriceIndex1?: string;
  buyPrice1MonthDef?: string;
  buyPrice1Constant?: number;
  
  buyPrice2Weightage?: number;
  buyPrice2Slope?: number;
  buyPriceIndex2?: string;
  buyPrice2MonthDef?: string;
  buyPrice2Constant?: number;

  buyPrice3Weightage?: number;
  buyPrice3Slope?: number;
  buyPriceIndex3?: string;
  buyPrice3MonthDef?: string;
  buyPrice3Constant?: number;

  buyPriceOverallConstant?: number;
  buyPriceOverallConstantWeightage?: number;

  // Sales Components
  sellPrice1Weightage?: number;
  sellPrice1Slope?: number;
  sellPriceIndex1?: string;
  sellPrice1MonthDef?: string;
  sellPrice1Constant?: number;
  
  sellPrice2Weightage?: number;
  sellPrice2Slope?: number;
  sellPriceIndex2?: string;
  sellPrice2MonthDef?: string;
  sellPrice2Constant?: number;

  sellPrice3Weightage?: number;
  sellPrice3Slope?: number;
  sellPriceIndex3?: string;
  sellPrice3MonthDef?: string;
  sellPrice3Constant?: number;

  sellPriceOverallConstant?: number;
  sellPriceOverallConstantWeightage?: number;
  
  jarvisNo?: string;
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
  deliveryWindowEnd: '',
  isBuyPriceManual: false,
  isSellPriceManual: false,
  buyPriceRounding: 3,
  sellPriceRounding: 3
};