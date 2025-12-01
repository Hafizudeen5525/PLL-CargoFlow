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
  src: string; // Assuming SRC is a code or identifier
  pnlBucket: PnLBucket;
  reconciledPurchaseCost: number;
  finalSalesRevenue: number;
  reconciledSalesRevenue: number;
  finalTotalCost: number;
  finalPhysicalPnL: number;
  totalHedgingPnL: number;
  finalTotalPnL: number;
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
};