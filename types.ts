
export enum PnLBucket {
  Realized = 'Realized',
  Unrealized = 'Unrealized',
  Unspecified = 'Unspecified'
}

export interface CargoProfile {
  id: string;
  source: string;
  strategyName: string;
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

  // SRC (Shipping Related Cost) for DES cargoes
  srcUnitFee?: number;
  reconciledSrcCost?: number;

  loadingWindowStart?: string;
  loadingWindowEnd?: string;
  deliveryWindowStart?: string;
  deliveryWindowEnd?: string;

  // --- Two-Tier Pricing Support (Sales) ---
  isTieredPricing?: boolean;
  tier2DeliveredVolume?: number;
  tier2SellFormula?: string;
  absoluteTier2SellPrice?: number;
  tier2SellPriceRounding?: number;
  isTier2SellPriceManual?: boolean;

  tier2SellPrice1Weightage?: number;
  tier2SellPrice1Slope?: number;
  tier2SellPriceIndex1?: string;
  tier2SellPrice1MonthDef?: string;
  tier2SellPrice1Constant?: number;
  tier2SellPrice2Weightage?: number;
  tier2SellPrice2Slope?: number;
  tier2SellPriceIndex2?: string;
  tier2SellPrice2MonthDef?: string;
  tier2SellPrice2Constant?: number;
  tier2SellPrice3Weightage?: number;
  tier2SellPrice3Slope?: number;
  tier2SellPriceIndex3?: string;
  tier2SellPrice3MonthDef?: string;
  tier2SellPrice3Constant?: number;
  tier2SellPriceOverallConstant?: number;

  // --- Two-Tier Pricing Support (Purchase) ---
  tier2LoadedVolume?: number;
  tier2BuyFormula?: string;
  absoluteTier2BuyPrice?: number;
  tier2BuyPriceRounding?: number;
  isTier2BuyPriceManual?: boolean;

  tier2BuyPrice1Weightage?: number;
  tier2BuyPrice1Slope?: number;
  tier2BuyPriceIndex1?: string;
  tier2BuyPrice1MonthDef?: string;
  tier2BuyPrice1Constant?: number;
  tier2BuyPrice2Weightage?: number;
  tier2BuyPrice2Slope?: number;
  tier2BuyPriceIndex2?: string;
  tier2BuyPrice2MonthDef?: string;
  tier2BuyPrice2Constant?: number;
  tier2BuyPrice3Weightage?: number;
  tier2BuyPrice3Slope?: number;
  tier2BuyPriceIndex3?: string;
  tier2BuyPrice3MonthDef?: string;
  tier2BuyPrice3Constant?: number;
  tier2BuyPriceOverallConstant?: number;

  // --- Tier 1 Granular Components (Existing) ---
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
  incoterms: 'FOB',
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
  sellPriceRounding: 3,
  srcUnitFee: 0,
  reconciledSrcCost: 0,
  isTieredPricing: false,
  tier2DeliveredVolume: 0,
  tier2SellFormula: '',
  absoluteTier2SellPrice: 0,
  tier2SellPriceRounding: 3,
  isTier2SellPriceManual: false,
  tier2LoadedVolume: 0,
  tier2BuyFormula: '',
  absoluteTier2BuyPrice: 0,
  tier2BuyPriceRounding: 3,
  isTier2BuyPriceManual: false
};
