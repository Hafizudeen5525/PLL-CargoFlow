import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CargoProfile } from '../types';
import { toast } from 'react-hot-toast';

interface CustomRule {
  id: string;
  name: string;
  description: string;
  targetDataset?: 'Jarvis' | 'TRMS';
  category: 'Date Validation' | 'Missing Info' | 'Quantity Validation' | 'Pricing & Valuations' | 'Formula Integrity' | 'Shipping & SRC' | 'Other';
  field: string;
  condition: 'empty' | 'notEmpty' | 'greaterThan' | 'lessThan' | 'equals' | 'notEquals' | 'contains' | 'dateAfterField' | 'mathCompare';
  value: string;
  compareField?: string;
  severity: 'error' | 'warning' | 'info';
  enabled: boolean;
  lhsTransform?: 'none' | 'abs' | 'add' | 'subtract' | 'multiply' | 'power';
  lhsTransformValue?: string;
  rhsType?: 'constant' | 'field';
  rhsField?: string;
  rhsTransform?: 'none' | 'abs' | 'add' | 'subtract' | 'multiply' | 'power';
  rhsTransformValue?: string;
  mathOperator?: 'greaterThan' | 'lessThan' | 'equals' | 'notEquals' | 'percentDiffGreaterThan' | 'percentDiffLessThan';
}

const CARGO_PROFILE_FIELDS = [
  { value: 'strategyName', label: 'Strategy Name', type: 'string' },
  { value: 'buyer', label: 'Buyer / Counterparty', type: 'string' },
  { value: 'source', label: 'Internal Portfolio / Source', type: 'string' },
  { value: 'incoterms', label: 'Incoterms (FOB/DES)', type: 'string' },
  { value: 'loadedVolume', label: 'Loaded Volume (MMBtu)', type: 'number' },
  { value: 'deliveredVolume', label: 'Delivered Volume (MMBtu)', type: 'number' },
  { value: 'absoluteBuyPrice', label: 'Absolute Buy Price ($/MMBtu)', type: 'number' },
  { value: 'absoluteSellPrice', label: 'Absolute Sell Price ($/MMBtu)', type: 'number' },
  { value: 'loadingDate', label: 'Loading Date', type: 'date' },
  { value: 'deliveryDate', label: 'Delivery Date', type: 'date' },
  { value: 'reconciledSrcCost', label: 'Reconciled Shipping/SRC Cost ($)', type: 'number' },
  { value: 'srcUnitFee', label: 'Shipping Unit Fee ($/Unit)', type: 'number' },
  { value: 'finalPhysicalPnL', label: 'Physical PnL ($)', type: 'number' },
  { value: 'finalTotalPnL', label: 'Total PnL (incl. Hedging) ($)', type: 'number' },
  { value: 'pnlBucket', label: 'PnL Bucket (Realized/Unrealized)', type: 'string' },
  { value: 'jarvisNo', label: 'Jarvis No', type: 'string' },
];

const TRMS_PROFILE_FIELDS = [
  { value: 'strategyName', label: 'Strategy Name', type: 'string' },
  { value: 'volumeType', label: 'Volume Type', type: 'string' },
  { value: 'priceStatus', label: 'Price Status', type: 'string' },
  { value: 'commodityValue', label: 'Commodity Value ($)', type: 'number' },
  { value: 'srcValue', label: 'Shipping / SRC Cost ($)', type: 'number' },
  { value: 'hedgingPnL', label: 'Hedging PnL ($)', type: 'number' },
  { value: 'trmsPurchaseValue', label: 'Purchase Leg Value ($)', type: 'number' },
  { value: 'trmsSalesValue', label: 'Sales Leg Value ($)', type: 'number' },
  { value: 'loadingDate', label: 'Loading Date', type: 'date' },
  { value: 'deliveryDate', label: 'Delivery Date', type: 'date' },
  { value: 'commWindowEndDate', label: 'Comm Window End Date', type: 'date' }
];

const DEFAULT_CUSTOM_RULES: CustomRule[] = [
  {
    id: 'rule-negative-pnl',
    name: 'Negative Physical PnL Alert',
    description: 'Triggers when a strategy has a negative final physical PnL.',
    targetDataset: 'Jarvis',
    category: 'Pricing & Valuations',
    field: 'finalPhysicalPnL',
    condition: 'lessThan',
    value: '0',
    severity: 'warning',
    enabled: true
  },
  {
    id: 'rule-high-buy-price',
    name: 'Suspiciously High Buy Price',
    description: 'Triggers if the absolute buy price is set greater than $45.',
    targetDataset: 'Jarvis',
    category: 'Pricing & Valuations',
    field: 'absoluteBuyPrice',
    condition: 'greaterThan',
    value: '45',
    severity: 'warning',
    enabled: true
  },
  {
    id: 'rule-empty-jarvis',
    name: 'Missing Jarvis Number Check',
    description: 'Triggers if there is no Jarvis reference number captured.',
    targetDataset: 'Jarvis',
    category: 'Missing Info',
    field: 'jarvisNo',
    condition: 'empty',
    value: '',
    severity: 'info',
    enabled: true
  },
  {
    id: 'rule-fob-freight-check',
    name: 'FOB Shipping Unit Fee Warning',
    description: 'Triggers if Incoterm is FOB but a vessel unit fee is registered.',
    targetDataset: 'Jarvis',
    category: 'Shipping & SRC',
    field: 'srcUnitFee',
    condition: 'greaterThan',
    value: '0',
    severity: 'error',
    enabled: true
  },
  {
    id: 'rule-trms-unpriced',
    name: 'Unpriced TRMS Strategy Alert',
    description: 'Triggers when a TRMS aggregated strategy contains unpriced legs.',
    targetDataset: 'TRMS',
    category: 'Pricing & Valuations',
    field: 'priceStatus',
    condition: 'equals',
    value: 'unpriced',
    severity: 'warning',
    enabled: true
  }
];

const getTransformLabel = (field: string, transform: string | undefined, operand: string | undefined): string => {
  if (!transform || transform === 'none') return field;
  switch (transform) {
    case 'abs': return `abs(${field})`;
    case 'add': return `(${field} + ${operand})`;
    case 'subtract': return `(${field} - ${operand})`;
    case 'multiply': return `(${field} * ${operand})`;
    case 'power': return `(${field} ^ ${operand})`;
    default: return field;
  }
};

const getComparisonOperatorLabel = (op: string | undefined): string => {
  switch (op) {
    case 'greaterThan': return '>';
    case 'lessThan': return '<';
    case 'equals': return '==';
    case 'notEquals': return '!=';
    case 'percentDiffGreaterThan': return '% diff >';
    case 'percentDiffLessThan': return '% diff <';
    default: return '==';
  }
};

const evaluateMathTransform = (val: number, transform?: string, operandStr?: string): number => {
  if (isNaN(val)) return NaN;
  const operand = operandStr ? Number(operandStr) : 0;
  switch (transform) {
    case 'abs':
      return Math.abs(val);
    case 'add':
      return val + (isNaN(operand) ? 0 : operand);
    case 'subtract':
      return val - (isNaN(operand) ? 0 : operand);
    case 'multiply':
      return val * (isNaN(operand) ? 1 : operand);
    case 'power':
      return Math.pow(val, isNaN(operand) ? 1 : operand);
    default:
      return val;
  }
};

const evaluateMathRule = (
  fieldValRaw: any, 
  rule: CustomRule, 
  getFieldValue: (f: string) => any,
  fieldsSource: { value: string; label: string }[]
): { triggered: boolean; message: string } => {
  const lhsRaw = Number(fieldValRaw);
  const lhsVal = evaluateMathTransform(lhsRaw, rule.lhsTransform, rule.lhsTransformValue);
  
  let rhsVal = 0;
  let rhsDesc = '';
  
  const fieldsMap = new Map(fieldsSource.map(f => [f.value, f.label]));
  const lhsLabel = getTransformLabel(fieldsMap.get(rule.field) || rule.field, rule.lhsTransform, rule.lhsTransformValue);

  if (rule.rhsType === 'field' && rule.rhsField) {
    const rawRhs = Number(getFieldValue(rule.rhsField));
    rhsVal = evaluateMathTransform(rawRhs, rule.rhsTransform, rule.rhsTransformValue);
    rhsDesc = getTransformLabel(fieldsMap.get(rule.rhsField) || rule.rhsField, rule.rhsTransform, rule.rhsTransformValue);
  } else {
    rhsVal = Number(rule.value);
    rhsDesc = String(rule.value);
  }

  const op = rule.mathOperator || 'greaterThan';
  let triggered = false;
  let opSymbol = '';
  
  const compValue = Number(rule.value); // specifically used for percentDiff matching threshold
  
  if (isNaN(lhsVal) || isNaN(rhsVal)) {
    return { triggered: false, message: '' };
  }

  switch (op) {
    case 'greaterThan':
      triggered = lhsVal > rhsVal;
      opSymbol = '>';
      break;
    case 'lessThan':
      triggered = lhsVal < rhsVal;
      opSymbol = '<';
      break;
    case 'equals':
      triggered = Math.abs(lhsVal - rhsVal) < 1e-9;
      opSymbol = '==';
      break;
    case 'notEquals':
      triggered = Math.abs(lhsVal - rhsVal) >= 1e-9;
      opSymbol = '!=';
      break;
    case 'percentDiffGreaterThan': {
      if (rhsVal === 0) {
        triggered = lhsVal !== 0;
      } else {
        const pct = (Math.abs(lhsVal - rhsVal) / Math.abs(rhsVal)) * 100;
        triggered = pct > compValue;
      }
      opSymbol = `% diff > ${compValue}% with`;
      break;
    }
    case 'percentDiffLessThan': {
      if (rhsVal === 0) {
        triggered = lhsVal === 0;
      } else {
        const pct = (Math.abs(lhsVal - rhsVal) / Math.abs(rhsVal)) * 100;
        triggered = pct < compValue;
      }
      opSymbol = `% diff < ${compValue}% with`;
      break;
    }
    default:
      break;
  }

  let formattedLhs = isNaN(lhsRaw) ? '0' : String(lhsRaw);
  if (rule.lhsTransform && rule.lhsTransform !== 'none') {
    formattedLhs = `${getTransformLabel(formattedLhs, rule.lhsTransform, rule.lhsTransformValue)} = ${lhsVal.toFixed(2)}`;
  }
  
  let formattedRhs = '';
  if (rule.rhsType === 'field' && rule.rhsField) {
    const rawRhs = Number(getFieldValue(rule.rhsField));
    formattedRhs = `${getTransformLabel(isNaN(rawRhs) ? '0' : String(rawRhs), rule.rhsTransform, rule.rhsTransformValue)} = ${rhsVal.toFixed(2)}`;
  } else {
    formattedRhs = String(rhsVal);
  }

  const detailMsg = triggered 
    ? `(Evaluated: ${lhsLabel} [${formattedLhs}] is ${opSymbol} ${rhsDesc} [${formattedRhs}])`
    : '';

  return { triggered, message: detailMsg };
};

interface QualityIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  category: 'Date Validation' | 'Missing Info' | 'Quantity Validation' | 'Pricing & Valuations' | 'Formula Integrity' | 'Shipping & SRC' | 'Other';
  field: string;
  message: string;
  cargoId: string;
  cargoName: string;
}

interface TrmsDashboardData {
  trmsAgg?: Record<string, {
    volumeType?: string;
    priceStatus?: string;
    commodityValue?: number;
    srcValue?: number;
    hedgingPnL?: number;
    trmsPurchaseValue?: number;
    trmsSalesValue?: number;
    loadingDate?: string;
    deliveryDate?: string;
    commWindowEndDate?: string;
  }>;
}

interface DataQualityDashboardProps {
  profiles: CargoProfile[];
  trmsData?: TrmsDashboardData;
  onEditProfile?: (profile: CargoProfile) => void;
}


export const DataQualityDashboard: React.FC<DataQualityDashboardProps> = ({ profiles, trmsData, onEditProfile }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'issues' | 'rules'>('issues');

  // Custom Rules state
  const [customRules, setCustomRules] = useState<CustomRule[]>(() => {
    try {
      const saved = localStorage.getItem('cargo_custom_rules');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Could not load custom rules:", e);
    }
    return DEFAULT_CUSTOM_RULES;
  });

  // Save rules to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('cargo_custom_rules', JSON.stringify(customRules));
    } catch (e) {
      console.error("Could not save custom rules:", e);
    }
  }, [customRules]);

  // Helper to validate formula balanced parentheses
  const hasUnbalancedParentheses = (formula: string): boolean => {
    if (!formula) return false;
    let count = 0;
    for (const char of formula) {
      if (char === '(') count++;
      else if (char === ')') count--;
      if (count < 0) return true; // Closing before open is always invalid
    }
    return count !== 0;
  };

  // Run the data quality rule engine over all cargo profiles
  const qualityIssues = useMemo(() => {
    const issues: QualityIssue[] = [];

    profiles.filter(p => !p.deleted).forEach(p => {
      const cargoName = p.strategyName || 'Unnamed Strategy';

      // 1. Critical Date inversion
      if (p.loadingDate && p.deliveryDate) {
        const load = new Date(p.loadingDate);
        const del = new Date(p.deliveryDate);
        if (!isNaN(load.getTime()) && !isNaN(del.getTime()) && load.getTime() > del.getTime()) {
          issues.push({
            id: `${p.id}-date-invert`,
            type: 'error',
            category: 'Date Validation',
            field: 'Loading / Delivery Dates',
            message: `Loading Date (${p.loadingDate}) is set later than Delivery Date (${p.deliveryDate}).`,
            cargoId: p.id,
            cargoName
          });
        }
      }

      // 2. Missing primary dates
      if (!p.loadingDate) {
        issues.push({
          id: `${p.id}-load-missing`,
          type: 'error',
          category: 'Missing Info',
          field: 'Loading Date',
          message: 'Loading Date is missing.',
          cargoId: p.id,
          cargoName
        });
      }
      if (!p.deliveryDate) {
        issues.push({
          id: `${p.id}-del-missing`,
          type: 'error',
          category: 'Missing Info',
          field: 'Delivery Date',
          message: 'Delivery Date is missing.',
          cargoId: p.id,
          cargoName
        });
      }

      // 3. Strategy Name unnamed / empty
      if (!p.strategyName || p.strategyName.trim() === '' || p.strategyName.toLowerCase() === 'unnamed strategy' || p.strategyName.toLowerCase() === 'unnamed') {
        issues.push({
          id: `${p.id}-strat-unnamed`,
          type: 'warning',
          category: 'Missing Info',
          field: 'Strategy Name',
          message: 'Cargo profile has an unnamed or placeholder Strategy Name.',
          cargoId: p.id,
          cargoName
        });
      }

      // 4. Quantity/Volume Validation (Zeros, Negatives, or Unspecified volumes)
      const totalLoaded = p.totalLoadedVolume ?? p.loadedVolume;
      const totalDelivered = p.totalDeliveredVolume ?? p.deliveredVolume;

      if (totalLoaded === undefined || totalLoaded === null || totalLoaded <= 0) {
        issues.push({
          id: `${p.id}-loaded-zero`,
          type: 'error',
          category: 'Quantity Validation',
          field: 'Loaded Volume',
          message: `The total loaded quantity is ${totalLoaded === 0 ? 'zero' : totalLoaded < 0 ? 'negative' : 'missing'} (${totalLoaded ?? 'undefined'} MMBtu).`,
          cargoId: p.id,
          cargoName
        });
      }
      if (totalDelivered === undefined || totalDelivered === null || totalDelivered <= 0) {
        issues.push({
          id: `${p.id}-del-zero`,
          type: 'error',
          category: 'Quantity Validation',
          field: 'Delivered Volume',
          message: `The total delivered quantity is ${totalDelivered === 0 ? 'zero' : totalDelivered < 0 ? 'negative' : 'missing'} (${totalDelivered ?? 'undefined'} MMBtu).`,
          cargoId: p.id,
          cargoName
        });
      }

      // Two-tiered optional sub-volumes
      if (p.isTieredPricing) {
        if (p.tier2LoadedVolume === undefined || p.tier2LoadedVolume === null || p.tier2LoadedVolume < 0) {
          issues.push({
            id: `${p.id}-t2-load-neg`,
            type: 'warning',
            category: 'Quantity Validation',
            field: 'Tier 2 Loaded Volume',
            message: `Tier 2 Loaded Volume is negative or undefined (${p.tier2LoadedVolume ?? 'missing'}).`,
            cargoId: p.id,
            cargoName
          });
        }
        if (p.tier2DeliveredVolume === undefined || p.tier2DeliveredVolume === null || p.tier2DeliveredVolume < 0) {
          issues.push({
            id: `${p.id}-t2-del-neg`,
            type: 'warning',
            category: 'Quantity Validation',
            field: 'Tier 2 Delivered Volume',
            message: `Tier 2 Delivered Volume is negative or undefined (${p.tier2DeliveredVolume ?? 'missing'}).`,
            cargoId: p.id,
            cargoName
          });
        }
      }

      // 5. Two-Tier Volume checks
      if (p.isTieredPricing) {
        const sumLoaded = (p.loadedVolume || 0) + (p.tier2LoadedVolume || 0);
        const sumDelivered = (p.deliveredVolume || 0) + (p.tier2DeliveredVolume || 0);

        if (totalLoaded && Math.abs(sumLoaded - totalLoaded) > 0.05) {
          issues.push({
            id: `${p.id}-tier-load-mismatch`,
            type: 'warning',
            category: 'Quantity Validation',
            field: 'Tier 1/2 Load Mismatch',
            message: `Sum of T1 Loaded (${p.loadedVolume ?? 0}) and T2 Loaded (${p.tier2LoadedVolume ?? 0}) is ${sumLoaded} MMBtu, but Total Loaded Volume is set to ${totalLoaded} MMBtu.`,
            cargoId: p.id,
            cargoName
          });
        }
        if (totalDelivered && Math.abs(sumDelivered - totalDelivered) > 0.05) {
          issues.push({
            id: `${p.id}-tier-del-mismatch`,
            type: 'warning',
            category: 'Quantity Validation',
            field: 'Tier 1/2 Delivery Mismatch',
            message: `Sum of T1 Delivered (${p.deliveredVolume ?? 0}) and T2 Delivered (${p.tier2DeliveredVolume ?? 0}) is ${sumDelivered} MMBtu, but Total Delivered Volume is set to ${totalDelivered} MMBtu.`,
            cargoId: p.id,
            cargoName
          });
        }
        if (!p.tierLimit || p.tierLimit <= 0) {
          issues.push({
            id: `${p.id}-tier-limit-missing`,
            type: 'error',
            category: 'Quantity Validation',
            field: 'Tier Limit',
            message: 'Tiered Pricing is enabled, but Tier Limit is zero or missing.',
            cargoId: p.id,
            cargoName
          });
        }
      }

      // 6. Pricing Checks & Outliers (0, negative, or extremely high price checks)
      // Tier 1 Buy Price
      if (p.isBuyPriceManual) {
        if (p.absoluteBuyPrice === undefined || p.absoluteBuyPrice === null || p.absoluteBuyPrice <= 0) {
          issues.push({
            id: `${p.id}-buy-price-invalid`,
            type: 'error',
            category: 'Pricing & Valuations',
            field: 'Absolute Buy Price',
            message: `Manual buy price is invalid, zero, or negative ($${p.absoluteBuyPrice ?? 'missing'}).`,
            cargoId: p.id,
            cargoName
          });
        } else if (p.absoluteBuyPrice > 75) {
          issues.push({
            id: `${p.id}-buy-price-outlier`,
            type: 'warning',
            category: 'Pricing & Valuations',
            field: 'Absolute Buy Price',
            message: `Manual buy price ($${(p.absoluteBuyPrice || 0).toFixed(4)}) exceeds $75.00/MMBtu. Please verify if this high valuation is correct.`,
            cargoId: p.id,
            cargoName
          });
        }
      }

      // Tier 1 Sell Price
      if (p.isSellPriceManual) {
        if (p.absoluteSellPrice === undefined || p.absoluteSellPrice === null || p.absoluteSellPrice <= 0) {
          issues.push({
            id: `${p.id}-sell-price-invalid`,
            type: 'error',
            category: 'Pricing & Valuations',
            field: 'Absolute Sell Price',
            message: `Manual sell price is invalid, zero, or negative ($${p.absoluteSellPrice ?? 'missing'}).`,
            cargoId: p.id,
            cargoName
          });
        } else if (p.absoluteSellPrice > 75) {
          issues.push({
            id: `${p.id}-sell-price-outlier`,
            type: 'warning',
            category: 'Pricing & Valuations',
            field: 'Absolute Sell Price',
            message: `Manual sell price ($${(p.absoluteSellPrice || 0).toFixed(4)}) exceeds $75.00/MMBtu. Please verify if this high valuation is correct.`,
            cargoId: p.id,
            cargoName
          });
        }
      }

      // Tier 2 Buy Price
      if (p.isTieredPricing && p.isTier2BuyPriceManual) {
        if (p.absoluteTier2BuyPrice === undefined || p.absoluteTier2BuyPrice === null || p.absoluteTier2BuyPrice <= 0) {
          issues.push({
            id: `${p.id}-t2-buy-price-invalid`,
            type: 'error',
            category: 'Pricing & Valuations',
            field: 'Tier 2 Buy Price',
            message: `Manual Tier 2 buy price is invalid, zero, or negative ($${p.absoluteTier2BuyPrice ?? 'missing'}).`,
            cargoId: p.id,
            cargoName
          });
        }
      }

      // Tier 2 Sell Price
      if (p.isTieredPricing && p.isTier2SellPriceManual) {
        if (p.absoluteTier2SellPrice === undefined || p.absoluteTier2SellPrice === null || p.absoluteTier2SellPrice <= 0) {
          issues.push({
            id: `${p.id}-t2-sell-price-invalid`,
            type: 'error',
            category: 'Pricing & Valuations',
            field: 'Tier 2 Sell Price',
            message: `Manual Tier 2 sell price is invalid, zero, or negative ($${p.absoluteTier2SellPrice ?? 'missing'}).`,
            cargoId: p.id,
            cargoName
          });
        }
      }

      // 7. Formula Integrity & Parentheses Matching
      if (!p.isBuyPriceManual && p.buyFormula && hasUnbalancedParentheses(p.buyFormula)) {
        issues.push({
          id: `${p.id}-buy-formula-bracket`,
          type: 'error',
          category: 'Formula Integrity',
          field: 'Buy Formula',
          message: `Unbalanced parentheses detected in Buy formula: "${p.buyFormula}".`,
          cargoId: p.id,
          cargoName
        });
      }
      if (!p.isSellPriceManual && p.sellFormula && hasUnbalancedParentheses(p.sellFormula)) {
        issues.push({
          id: `${p.id}-sell-formula-bracket`,
          type: 'error',
          category: 'Formula Integrity',
          field: 'Sell Formula',
          message: `Unbalanced parentheses detected in Sell formula: "${p.sellFormula}".`,
          cargoId: p.id,
          cargoName
        });
      }
      if (p.isTieredPricing) {
        if (!p.isTier2BuyPriceManual && p.tier2BuyFormula && hasUnbalancedParentheses(p.tier2BuyFormula)) {
          issues.push({
            id: `${p.id}-t2-buy-formula-bracket`,
            type: 'error',
            category: 'Formula Integrity',
            field: 'Tier 2 Buy Formula',
            message: `Unbalanced parentheses detected in Tier 2 Buy formula: "${p.tier2BuyFormula}".`,
            cargoId: p.id,
            cargoName
          });
        }
        if (!p.isTier2SellPriceManual && p.tier2SellFormula && hasUnbalancedParentheses(p.tier2SellFormula)) {
          issues.push({
            id: `${p.id}-t2-sell-formula-bracket`,
            type: 'error',
            category: 'Formula Integrity',
            field: 'Tier 2 Sell Formula',
            message: `Unbalanced parentheses detected in Tier 2 Sell formula: "${p.tier2SellFormula}".`,
            cargoId: p.id,
            cargoName
          });
        }
      }

      // 8. Missing Buyer/Counterparty
      if (!p.buyer || p.buyer.trim() === '') {
        issues.push({
          id: `${p.id}-buyer-missing`,
          type: 'warning',
          category: 'Missing Info',
          field: 'Buyer / Counterparty',
          message: 'Buyer / counterparty field is empty.',
          cargoId: p.id,
          cargoName
        });
      }

      // 9. Shipping / SRC vs Incoterm Mismatches
      // Rule A: FOB having SRC
      if (p.incoterms === 'FOB') {
        const hasUnitFee = p.srcUnitFee && p.srcUnitFee > 0;
        const hasReconciledCost = p.reconciledSrcCost && p.reconciledSrcCost > 0;
        const hasSrcCodeIndicator = p.src && p.src.trim() !== '';

        if (hasUnitFee || hasReconciledCost || hasSrcCodeIndicator) {
          issues.push({
            id: `${p.id}-fob-with-src`,
            type: 'error',
            category: 'Shipping & SRC',
            field: 'Incoterm Alignment',
            message: `Incoterm is set to FOB (buyer bears freight risk/cost). However, this cargo contains active Shipping Related Costs (SRC Indicator: "${p.src || 'None'}"; SRC Fee: $${p.srcUnitFee ?? 0}/U, Reconciled Cost: $${p.reconciledSrcCost ?? 0}).`,
            cargoId: p.id,
            cargoName
          });
        }
      }

      // Rule B: DES doesn't have SRC
      if (p.incoterms === 'DES') {
        const lacksUnitFee = !p.srcUnitFee || p.srcUnitFee <= 0;
        const lacksReconciledCost = !p.reconciledSrcCost || p.reconciledSrcCost <= 0;

        if (lacksUnitFee && lacksReconciledCost) {
          issues.push({
            id: `${p.id}-des-without-src`,
            type: 'error',
            category: 'Shipping & SRC',
            field: 'Incoterm Alignment',
            message: `Incoterm is set to DES (seller responsible for vessel delivery). However, no Shipping Related Cost (SRC fee or budget cost) has been registered. Actual PnL will overstate margins due to missing freight charges.`,
            cargoId: p.id,
            cargoName
          });
        }
      }

      // Rule C: Incoterm is missing or unspecified
      if (!p.incoterms || p.incoterms.trim() === '') {
        issues.push({
          id: `${p.id}-incoterm-missing`,
          type: 'warning',
          category: 'Missing Info',
          field: 'Incoterms',
          message: 'Incoterms (FOB / DES / etc.) is blank. Standardize this to validate shipping cost integrity.',
          cargoId: p.id,
          cargoName
        });
      }
    });

    // Extract TRMS strategy summaries as checkable uniform objects
    const trmsStrategies: any[] = [];
    if (trmsData && trmsData.trmsAgg) {
      Object.entries(trmsData.trmsAgg).forEach(([strategyName, data]) => {
        trmsStrategies.push({
          id: `trms-${strategyName}`,
          strategyName: strategyName,
          volumeType: data.volumeType || '',
          priceStatus: data.priceStatus || '',
          commodityValue: data.commodityValue || 0,
          srcValue: data.srcValue || 0,
          hedgingPnL: data.hedgingPnL || 0,
          trmsPurchaseValue: data.trmsPurchaseValue || 0,
          trmsSalesValue: data.trmsSalesValue || 0,
          loadingDate: data.loadingDate || '',
          deliveryDate: data.deliveryDate || '',
          commWindowEndDate: data.commWindowEndDate || ''
        });
      });
    }

    // Execute custom user-defined rules
    customRules.forEach(rule => {
      if (!rule.enabled) return;

      const datasetType = rule.targetDataset || 'Jarvis';

      if (datasetType === 'TRMS') {
        trmsStrategies.forEach(s => {
          const cargoName = s.strategyName || 'Unnamed Strategy';
          const fieldValue = s[rule.field];
          
          let triggered = false;
          let ruleMessage = '';
          const fieldLabel = TRMS_PROFILE_FIELDS.find(f => f.value === rule.field)?.label || rule.field;

          try {
            if (rule.condition === 'empty') {
              triggered = fieldValue === undefined || fieldValue === null || String(fieldValue).trim() === '';
              ruleMessage = `Field "${fieldLabel}" is empty in TRMS.`;
            } else if (rule.condition === 'notEmpty') {
              triggered = fieldValue !== undefined && fieldValue !== null && String(fieldValue).trim() !== '';
              ruleMessage = `Field "${fieldLabel}" is populated with "${fieldValue}" in TRMS.`;
            } else if (rule.condition === 'greaterThan') {
              const num = Number(fieldValue);
              const comp = Number(rule.value);
              triggered = !isNaN(num) && num > comp;
              ruleMessage = `Field "${fieldLabel}" value (${fieldValue ?? '0'}) is greater than ${comp} in TRMS.`;
            } else if (rule.condition === 'lessThan') {
              const num = Number(fieldValue);
              const comp = Number(rule.value);
              triggered = !isNaN(num) && num < comp;
              ruleMessage = `Field "${fieldLabel}" value (${fieldValue ?? '0'}) is less than ${comp} in TRMS.`;
            } else if (rule.condition === 'equals') {
              triggered = String(fieldValue || '').trim().toLowerCase() === String(rule.value || '').trim().toLowerCase();
              ruleMessage = `Field "${fieldLabel}" equals "${rule.value}" in TRMS.`;
            } else if (rule.condition === 'notEquals') {
              triggered = String(fieldValue || '').trim().toLowerCase() !== String(rule.value || '').trim().toLowerCase();
              ruleMessage = `Field "${fieldLabel}" is "${fieldValue}" in TRMS (expected not equal to "${rule.value}").`;
            } else if (rule.condition === 'contains') {
              triggered = String(fieldValue || '').toLowerCase().includes(String(rule.value || '').toLowerCase());
              ruleMessage = `Field "${fieldLabel}" contains "${rule.value}" in TRMS.`;
            } else if (rule.condition === 'dateAfterField' && rule.compareField) {
              const d1Str = String(fieldValue || '');
              const d2Str = String(s[rule.compareField] || '');
              if (d1Str && d2Str) {
                const d1 = new Date(d1Str);
                const d2 = new Date(d2Str);
                triggered = !isNaN(d1.getTime()) && !isNaN(d2.getTime()) && d1.getTime() > d2.getTime();
                
                const compareLabel = TRMS_PROFILE_FIELDS.find(f => f.value === rule.compareField)?.label || rule.compareField;
                ruleMessage = `Date field "${fieldLabel}" (${d1Str}) is set after "${compareLabel}" (${d2Str}) in TRMS.`;
              }
            } else if (rule.condition === 'mathCompare') {
              const res = evaluateMathRule(fieldValue, rule, (f) => s[f], TRMS_PROFILE_FIELDS);
              triggered = res.triggered;
              ruleMessage = res.message;
            }
          } catch (err) {
            console.error("Error executing custom TRMS rule:", rule.name, err);
          }

          if (triggered) {
            issues.push({
              id: `custom-issue-${s.id}-${rule.id}`,
              type: rule.severity,
              category: rule.category,
              field: `TRMS: ${rule.field}`,
              message: `[TRMS] ${rule.name}: ${rule.description || ''} ${ruleMessage}`,
              cargoId: s.id,
              cargoName: `[TRMS] ${cargoName}`
            });
          }
        });
      } else {
        profiles.filter(p => !p.deleted).forEach(p => {
          const cargoName = p.strategyName || 'Unnamed Strategy';
          const fieldValue = p[rule.field as keyof CargoProfile];
          
          let triggered = false;
          let ruleMessage = '';
          const fieldLabel = CARGO_PROFILE_FIELDS.find(f => f.value === rule.field)?.label || rule.field;

          try {
            if (rule.condition === 'empty') {
              triggered = fieldValue === undefined || fieldValue === null || String(fieldValue).trim() === '';
              ruleMessage = `Field "${fieldLabel}" is empty.`;
            } else if (rule.condition === 'notEmpty') {
              triggered = fieldValue !== undefined && fieldValue !== null && String(fieldValue).trim() !== '';
              ruleMessage = `Field "${fieldLabel}" is populated with "${fieldValue}".`;
            } else if (rule.condition === 'greaterThan') {
              const num = Number(fieldValue);
              const comp = Number(rule.value);
              triggered = !isNaN(num) && num > comp;
              ruleMessage = `Field "${fieldLabel}" value (${fieldValue ?? '0'}) is greater than ${comp}.`;
            } else if (rule.condition === 'lessThan') {
              const num = Number(fieldValue);
              const comp = Number(rule.value);
              triggered = !isNaN(num) && num < comp;
              ruleMessage = `Field "${fieldLabel}" value (${fieldValue ?? '0'}) is less than ${comp}.`;
            } else if (rule.condition === 'equals') {
              triggered = String(fieldValue || '').trim().toLowerCase() === String(rule.value || '').trim().toLowerCase();
              ruleMessage = `Field "${fieldLabel}" equals "${rule.value}".`;
            } else if (rule.condition === 'notEquals') {
              triggered = String(fieldValue || '').trim().toLowerCase() !== String(rule.value || '').trim().toLowerCase();
              ruleMessage = `Field "${fieldLabel}" is "${fieldValue}" (expected not equal to "${rule.value}").`;
            } else if (rule.condition === 'contains') {
              triggered = String(fieldValue || '').toLowerCase().includes(String(rule.value || '').toLowerCase());
              ruleMessage = `Field "${fieldLabel}" contains "${rule.value}".`;
            } else if (rule.condition === 'dateAfterField' && rule.compareField) {
              const d1Str = String(fieldValue || '');
              const d2Str = String(p[rule.compareField as keyof CargoProfile] || '');
              if (d1Str && d2Str) {
                const d1 = new Date(d1Str);
                const d2 = new Date(d2Str);
                triggered = !isNaN(d1.getTime()) && !isNaN(d2.getTime()) && d1.getTime() > d2.getTime();
                
                const compareLabel = CARGO_PROFILE_FIELDS.find(f => f.value === rule.compareField)?.label || rule.compareField;
                ruleMessage = `Date field "${fieldLabel}" (${d1Str}) is set after "${compareLabel}" (${d2Str}).`;
              }
            } else if (rule.condition === 'mathCompare') {
              const res = evaluateMathRule(fieldValue, rule, (f) => p[f as keyof CargoProfile], CARGO_PROFILE_FIELDS);
              triggered = res.triggered;
              ruleMessage = res.message;
            }
          } catch (err) {
            console.error("Error executing custom rule:", rule.name, err);
          }

          if (triggered) {
            issues.push({
              id: `custom-issue-${p.id}-${rule.id}`,
              type: rule.severity,
              category: rule.category,
              field: rule.field,
              message: `${rule.name}: ${rule.description || ''} ${ruleMessage}`,
              cargoId: p.id,
              cargoName
            });
          }
        });
      }
    });

    return issues;
  }, [profiles, trmsData, customRules]);

  // Derived statistics
  const stats = useMemo(() => {
    const errors = qualityIssues.filter(i => i.type === 'error').length;
    const warnings = qualityIssues.filter(i => i.type === 'warning').length;
    const infos = qualityIssues.filter(i => i.type === 'info').length;

    // Health Score calculation (Max 100%, subtracts 12% per error and 4% per warning)
    const rawHealth = 100 - (errors * 12 + warnings * 4);
    const healthScore = Math.max(0, rawHealth);

    return {
      errors,
      warnings,
      infos,
      total: qualityIssues.length,
      healthScore
    };
  }, [qualityIssues]);

  // Categories list for checkboxes/quick filters
  const categories = useMemo(() => {
    const list = new Set<string>();
    qualityIssues.forEach(i => list.add(i.category));
    return Array.from(list);
  }, [qualityIssues]);

  // Filter issues list
  const filteredIssues = useMemo(() => {
    return qualityIssues.filter(i => {
      // 1. Search filter
      const matchesSearch = 
        i.cargoName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.field.toLowerCase().includes(searchTerm.toLowerCase());

      // 2. Severity filter
      const matchesType = selectedTypeFilter === 'all' || i.type === selectedTypeFilter;

      // 3. Category filter
      const matchesCategory = selectedCategoryFilter === 'all' || i.category === selectedCategoryFilter;

      return matchesSearch && matchesType && matchesCategory;
    });
  }, [qualityIssues, searchTerm, selectedTypeFilter, selectedCategoryFilter]);

  const handleEditCargoClick = (cargoId: string) => {
    if (cargoId.startsWith('trms-')) {
      toast.error("This diagnostic issue resides in your TRMS spreadsheet data. To fix, update your TRMS file or adjust this rule.", { id: 'trms-click-info' });
      return;
    }
    if (!onEditProfile) return;
    const target = profiles.find(p => p.id === cargoId);
    if (target) {
      onEditProfile(target);
    }
  };

  // Custom rules manager states
  const [isRuleFormOpen, setIsRuleFormOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleDataset, setRuleDataset] = useState<'Jarvis' | 'TRMS'>('Jarvis');
  const [ruleName, setRuleName] = useState('');
  const [ruleDescription, setRuleDescription] = useState('');
  const [ruleCategory, setRuleCategory] = useState<'Date Validation' | 'Missing Info' | 'Quantity Validation' | 'Pricing & Valuations' | 'Formula Integrity' | 'Shipping & SRC' | 'Other'>('Other');
  const [ruleField, setRuleField] = useState('absoluteSellPrice');
  const [ruleCondition, setRuleCondition] = useState<'empty' | 'notEmpty' | 'greaterThan' | 'lessThan' | 'equals' | 'notEquals' | 'contains' | 'dateAfterField' | 'mathCompare'>('greaterThan');
  const [ruleValue, setRuleValue] = useState('');
  const [ruleCompareField, setRuleCompareField] = useState('loadingDate');
  const [ruleSeverity, setRuleSeverity] = useState<'error' | 'warning' | 'info'>('warning');

  // New advanced comparison states
  const [lhsTransform, setLhsTransform] = useState<'none' | 'abs' | 'add' | 'subtract' | 'multiply' | 'power'>('none');
  const [lhsTransformValue, setLhsTransformValue] = useState('');
  const [rhsType, setRhsType] = useState<'constant' | 'field'>('constant');
  const [rhsField, setRhsField] = useState('absoluteBuyPrice');
  const [rhsTransform, setRhsTransform] = useState<'none' | 'abs' | 'add' | 'subtract' | 'multiply' | 'power'>('none');
  const [rhsTransformValue, setRhsTransformValue] = useState('');
  const [mathOperator, setMathOperator] = useState<'greaterThan' | 'lessThan' | 'equals' | 'notEquals' | 'percentDiffGreaterThan' | 'percentDiffLessThan'>('greaterThan');

  // handlers
  const handleOpenCreateRule = () => {
    setEditingRuleId(null);
    setRuleDataset('Jarvis');
    setRuleName('');
    setRuleDescription('');
    setRuleCategory('Other');
    setRuleField('absoluteSellPrice');
    setRuleCondition('greaterThan');
    setRuleValue('');
    setRuleCompareField('loadingDate');
    setRuleSeverity('warning');
    
    setLhsTransform('none');
    setLhsTransformValue('');
    setRhsType('constant');
    setRhsField('absoluteBuyPrice');
    setRhsTransform('none');
    setRhsTransformValue('');
    setMathOperator('greaterThan');
    
    setIsRuleFormOpen(true);
  };

  const handleOpenEditRule = (rule: CustomRule) => {
    setEditingRuleId(rule.id);
    setRuleDataset(rule.targetDataset || 'Jarvis');
    setRuleName(rule.name);
    setRuleDescription(rule.description);
    setRuleCategory(rule.category);
    setRuleField(rule.field);
    setRuleCondition(rule.condition);
    setRuleValue(rule.value);
    setRuleCompareField(rule.compareField || 'loadingDate');
    setRuleSeverity(rule.severity);
    
    setLhsTransform(rule.lhsTransform || 'none');
    setLhsTransformValue(rule.lhsTransformValue || '');
    setRhsType(rule.rhsType || 'constant');
    setRhsField(rule.rhsField || (rule.targetDataset === 'TRMS' ? 'commodityValue' : 'absoluteBuyPrice'));
    setRhsTransform(rule.rhsTransform || 'none');
    setRhsTransformValue(rule.rhsTransformValue || '');
    setMathOperator(rule.mathOperator || 'greaterThan');
    
    setIsRuleFormOpen(true);
  };

  const handleSaveRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim()) return;

    const updatedRule: CustomRule = {
      id: editingRuleId || `custom-rule-${Date.now()}`,
      name: ruleName,
      description: ruleDescription,
      targetDataset: ruleDataset,
      category: ruleCategory,
      field: ruleField,
      condition: ruleCondition,
      value: ruleValue,
      compareField: ruleCondition === 'dateAfterField' ? ruleCompareField : undefined,
      severity: ruleSeverity,
      enabled: true,
      lhsTransform: ruleCondition === 'mathCompare' ? lhsTransform : undefined,
      lhsTransformValue: ruleCondition === 'mathCompare' ? lhsTransformValue : undefined,
      rhsType: ruleCondition === 'mathCompare' ? rhsType : undefined,
      rhsField: ruleCondition === 'mathCompare' ? rhsField : undefined,
      rhsTransform: ruleCondition === 'mathCompare' ? rhsTransform : undefined,
      rhsTransformValue: ruleCondition === 'mathCompare' ? rhsTransformValue : undefined,
      mathOperator: ruleCondition === 'mathCompare' ? mathOperator : undefined
    };

    setCustomRules(prev => {
      if (editingRuleId) {
        return prev.map(r => r.id === editingRuleId ? updatedRule : r);
      } else {
        return [...prev, updatedRule];
      }
    });

    setIsRuleFormOpen(false);
    setViewMode('rules'); // Switch tab so that user sees their rule in inventory!
    toast.success(editingRuleId ? 'Specs update saved to rules inventory.' : 'Successfully registered custom dynamic quality rule!');
  };

  const handleDeleteRule = (id: string) => {
    setCustomRules(prev => prev.filter(r => r.id !== id));
    toast.success('Dynamic quality rule removed.');
  };

  const handleDuplicateRule = (rule: CustomRule) => {
    const duplicated: CustomRule = {
      ...rule,
      id: `custom-rule-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: `${rule.name} (Copy)`,
    };
    setCustomRules(prev => [...prev, duplicated]);
    toast.success(`Duplicated rule: "${rule.name}"`);
  };

  const handleToggleRule = (id: string) => {
    setCustomRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
    toast.success('Rule state updated.');
  };

  const handleResetToDefaults = () => {
    if (window.confirm('Are you sure you want to restore the default dynamic quality rules? This will overwrite your active modifications.')) {
      setCustomRules(DEFAULT_CUSTOM_RULES);
      toast.success('Restored original factory settings.');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50/40 p-4 lg:p-6 overflow-y-auto max-h-[85vh]">
      {/* Top Health Analytics Dashboard Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        
        {/* Health Gauge Card (Clicking resets both filters) */}
        <div 
          onClick={() => { setSelectedTypeFilter('all'); setSelectedCategoryFilter('all'); }}
          className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex items-center justify-between col-span-1 md:col-span-2 cursor-pointer hover:border-indigo-400 group transition-all"
          title="Click to reset filters and view all indicators"
        >
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block group-hover:text-indigo-500 transition-colors">
              Cargo Quality Health
            </span>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight group-hover:text-indigo-950 transition-colors">
              System Integrity
            </h3>
            <p className="text-[11px] text-slate-500 max-w-xs pr-2 leading-relaxed">
              Based on cargo pricing checks, volume status overrides, accurate vessel FOB/DES designations, and formula syntax validation.
            </p>
          </div>
          <div className="relative flex items-center justify-center shrink-0 w-24 h-24 group-hover:scale-105 transition-transform duration-300">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-slate-100"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className={`${
                  stats.healthScore >= 95
                    ? 'text-emerald-500'
                    : stats.healthScore >= 80
                    ? 'text-indigo-500'
                    : stats.healthScore >= 60
                    ? 'text-amber-500'
                    : 'text-rose-500'
                } transition-all duration-1000 ease-out`}
                strokeDasharray={`${stats.healthScore}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className={`text-lg font-black font-mono transition-transform group-hover:scale-110 ${
                stats.healthScore >= 95 ? 'text-emerald-600' : 'text-slate-800'
              }`}>{stats.healthScore}%</span>
              <span className="text-[8px] font-black uppercase text-slate-400">Score</span>
            </div>
          </div>
        </div>

        {/* Total Issues count (Interactive Filter) */}
        <div 
          onClick={() => { setSelectedTypeFilter('all'); setSelectedCategoryFilter('all'); }}
          className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex flex-col justify-between cursor-pointer hover:border-indigo-400 group transition-all"
          title="Click to view all issues"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest group-hover:text-indigo-500 transition-colors">Total Diagnostics</span>
              <div className={`w-2 h-2 rounded-full transition-colors ${stats.total > 0 ? 'bg-indigo-500 animate-pulse' : 'bg-emerald-500'}`} />
            </div>
            <h3 className="text-3xl font-black text-slate-800 font-mono mt-2 group-hover:text-indigo-600 transition-colors">{stats.total}</h3>
          </div>
          <div className="text-[10px] text-slate-500 font-bold mt-2 uppercase transition-all group-hover:translate-x-1">
            {stats.total === 0 ? 'No issues remaining' : 'Click to show all'}
          </div>
        </div>

        {/* Severity Counters Grid (Extremely Interactive Quick-Filters) */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-2">Click to Quick-Filter</span>
          <div className="grid grid-cols-3 gap-2">
            <button 
              onClick={() => { setSelectedTypeFilter('error'); setSelectedCategoryFilter('all'); }}
              className={`rounded-xl p-2.5 text-center border transition-all ${
                selectedTypeFilter === 'error'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-sm scale-102'
                  : 'bg-rose-50 border-rose-100 text-rose-700 hover:bg-rose-100 hover:scale-[1.05]'
              }`}
              title="Filter by Errors"
            >
              <span className={`text-[8px] font-bold uppercase tracking-wider block ${selectedTypeFilter === 'error' ? 'text-rose-100' : 'text-rose-500'}`}>Errors</span>
              <span className="text-lg font-black font-mono">{stats.errors}</span>
            </button>
            
            <button 
              onClick={() => { setSelectedTypeFilter('warning'); setSelectedCategoryFilter('all'); }}
              className={`rounded-xl p-2.5 text-center border transition-all ${
                selectedTypeFilter === 'warning'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-sm scale-102'
                  : 'bg-amber-50 border-amber-100 text-amber-700 hover:bg-amber-100 hover:scale-[1.05]'
              }`}
              title="Filter by Warnings"
            >
              <span className={`text-[8px] font-bold uppercase tracking-wider block ${selectedTypeFilter === 'warning' ? 'text-amber-100' : 'text-amber-600'}`}>Warns</span>
              <span className="text-lg font-black font-mono">{stats.warnings}</span>
            </button>
            
            <button 
              onClick={() => { setSelectedTypeFilter('info'); setSelectedCategoryFilter('all'); }}
              className={`rounded-xl p-2.5 text-center border transition-all ${
                selectedTypeFilter === 'info'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm scale-102'
                  : 'bg-blue-50 border-blue-100 text-blue-700 hover:bg-blue-100 hover:scale-[1.05]'
              }`}
              title="Filter by Advisories"
            >
              <span className={`text-[8px] font-bold uppercase tracking-wider block ${selectedTypeFilter === 'info' ? 'text-blue-100' : 'text-blue-500'}`}>Infos</span>
              <span className="text-lg font-black font-mono">{stats.infos}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tab Navigation inside Data Quality tab */}
      <div className="flex bg-slate-150 p-1 rounded-2xl mb-6 max-w-md w-full border border-slate-200/50 shadow-xs">
        <button
          onClick={() => setViewMode('issues')}
          type="button"
          className={`flex-1 py-2 px-4 rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
            viewMode === 'issues'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50/50'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Active diagnostics ({stats.total})
        </button>
        <button
          onClick={() => setViewMode('rules')}
          type="button"
          className={`flex-1 py-2 px-4 rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
            viewMode === 'rules'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50/50'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          Rule Engine Settings ({customRules.length})
        </button>
      </div>

      <AnimatePresence mode="wait">
        {viewMode === 'issues' ? (
          <motion.div
            key="diagnostics"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="flex-1 flex flex-col min-h-0"
          >
            {/* Control Filters Bar */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm mb-6 flex flex-col lg:flex-row gap-4 items-center justify-between">
              <div className="flex flex-col md:flex-row gap-4 w-full lg:w-auto flex-1 items-center">
                {/* Quick search input */}
                <div className="relative w-full md:max-w-xs">
                  <input
                    type="text"
                    placeholder="Search diagnostics (e.g. FOB, 0, date...)"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full text-xs font-semibold px-9 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none"
                  />
                  <svg className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>

                {/* Category Dropdown */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase shrink-0">Category Filter</span>
                  <select
                    value={selectedCategoryFilter}
                    onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                    className="text-xs font-bold text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none hover:border-slate-300 bg-white"
                  >
                    <option value="all">All Categories ({categories.length})</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Severity filter pills */}
              <div className="flex bg-slate-100 p-1 rounded-xl gap-1 w-full lg:w-auto self-stretch lg:self-auto">
                {[
                  { id: 'all', count: stats.total, label: 'All Issues', colorCls: 'bg-indigo-600 text-white' },
                  { id: 'error', count: stats.errors, label: 'Errors Only', colorCls: 'bg-rose-600 text-white' },
                  { id: 'warning', count: stats.warnings, label: 'Warnings', colorCls: 'bg-amber-600 text-white' },
                  { id: 'info', count: stats.infos, label: 'Check/Guide', colorCls: 'bg-blue-600 text-white' }
                ].map(pill => (
                  <button
                    key={pill.id}
                    onClick={() => setSelectedTypeFilter(pill.id as any)}
                    className={`flex-1 lg:flex-none px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                      selectedTypeFilter === pill.id
                        ? pill.colorCls + ' shadow-sm scale-[1.02]'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                    }`}
                  >
                    <span>{pill.label}</span>
                    <span className={`px-1 rounded-md text-[8px] font-mono ${selectedTypeFilter === pill.id ? 'bg-black/20 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      {pill.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Issues list container */}
            <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm flex flex-col flex-1">
              {filteredIssues.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-100">
                        <th className="px-6 py-3.5 text-[9px] font-extrabold text-slate-500 uppercase tracking-widest w-24">Severity</th>
                        <th className="px-6 py-3.5 text-[9px] font-extrabold text-slate-500 uppercase tracking-widest w-48">Cargo Strategy (Edit)</th>
                        <th className="px-6 py-3.5 text-[9px] font-extrabold text-slate-500 uppercase tracking-widest w-48">Category & Field</th>
                        <th className="px-6 py-3.5 text-[9px] font-extrabold text-slate-500 uppercase tracking-widest">Diagnostic Description</th>
                        <th className="px-6 py-3.5 text-[9px] font-extrabold text-slate-500 uppercase tracking-widest w-24 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <AnimatePresence initial={false}>
                        {filteredIssues.map((issue) => (
                          <motion.tr
                            key={issue.id}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            onClick={() => handleEditCargoClick(issue.cargoId)}
                            className="hover:bg-indigo-50/40 active:bg-indigo-100/30 transition-all cursor-pointer group/row"
                            title="Click anywhere on this row to open resolution editor"
                          >
                            {/* Severity badge */}
                            <td className="px-6 py-4 align-top whitespace-nowrap">
                              {issue.type === 'error' && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-1.5 text-[9px] font-extrabold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg uppercase tracking-wide group-hover/row:bg-rose-100 transition-colors">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                  CRITICAL
                                </span>
                              )}
                              {issue.type === 'warning' && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-1.5 text-[9px] font-extrabold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg uppercase tracking-wide group-hover/row:bg-amber-100 transition-colors">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                  WARNING
                                </span>
                              )}
                              {issue.type === 'info' && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-1.5 text-[9px] font-extrabold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg uppercase tracking-wide group-hover/row:bg-blue-100 transition-colors">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                  ADVISORY
                                </span>
                              )}
                            </td>

                            {/* Cargo Strategy with hovering edit prompt */}
                            <td className="px-6 py-4 align-top">
                              <span className="text-xs font-semibold text-slate-800 tracking-tight block max-w-[160px] truncate group-hover/row:text-indigo-600 transition-colors" title={issue.cargoName}>
                                {issue.cargoName}
                              </span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[9px] text-slate-400 font-mono block">ID: ...{issue.cargoId.slice(-6)}</span>
                                <span className="opacity-0 group-hover/row:opacity-100 text-[8px] text-indigo-500 font-black uppercase transition-opacity">
                                  (click to edit)
                                </span>
                              </div>
                            </td>

                            {/* Category & Field with interactive tags */}
                            <td className="px-6 py-4 align-top whitespace-nowrap">
                              <span 
                                onClick={(e) => {
                                  e.stopPropagation(); // Prevent opening modal just for filtering
                                  setSelectedCategoryFilter(issue.category);
                                }}
                                className="text-[10px] font-black text-slate-500 hover:text-indigo-600 uppercase tracking-wide block cursor-zoom-in"
                                title="Click to isolate this category"
                              >
                                {issue.category} 🔍
                              </span>
                              <span className="inline-block mt-1 px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] text-slate-600 font-bold whitespace-normal max-w-[140px]">
                                {issue.field}
                              </span>
                            </td>

                            {/* Detail Message */}
                            <td className="px-6 py-4 align-top">
                              <p className="text-xs text-slate-600 font-medium leading-relaxed max-w-xl group-hover/row:text-indigo-950 transition-colors">{issue.message}</p>
                            </td>

                            {/* Actions */}
                            <td className="px-6 py-4 align-top text-right whitespace-nowrap">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation(); // Avoid double action
                                  handleEditCargoClick(issue.cargoId);
                                }}
                                className="px-3 py-1.5 text-[10px] font-extrabold text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 border border-indigo-100 rounded-lg transition-all flex items-center justify-center gap-1 w-full md:w-auto shadow-sm group-hover/row:scale-105"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Resolve
                              </button>
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-16 text-center text-slate-400">
                  <svg className="w-12 h-12 mb-4 opacity-30 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="font-bold text-slate-700">All Diagnostics Passed!</p>
                  <p className="text-xs max-w-xs mt-1">Excellent cargo data. There are no quality issues found matching your selected filters.</p>
                  {(searchTerm || selectedTypeFilter !== 'all' || selectedCategoryFilter !== 'all') && (
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setSelectedTypeFilter('all');
                        setSelectedCategoryFilter('all');
                      }}
                      className="mt-4 px-3.5 py-1.5 text-[10px] font-black text-indigo-600 border border-indigo-200 bg-indigo-50 rounded-lg uppercase tracking-wider hover:bg-indigo-100 transition-colors"
                    >
                      Clear Active Filters
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="flex-1 flex flex-col min-h-0 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm mb-6"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-slate-100 pb-5">
              <div>
                <h3 className="text-base font-bold text-slate-800 tracking-tight">Custom Rule Inventory</h3>
                <p className="text-[11px] text-slate-500 max-w-xl mt-1 leading-relaxed">
                  Configure real-time quality limits applied automatically to strategies. Toggling rules instantly refreshes active diagnostics, system health status, and warnings.
                </p>
              </div>
              <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={handleResetToDefaults}
                  className="px-3.5 py-2 text-[10px] font-black text-slate-650 hover:text-slate-900 border border-slate-200 bg-white rounded-xl uppercase tracking-wider hover:bg-slate-50 transition-all flex items-center gap-1.5"
                  title="Restore initial default custom rules"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 4v5h.582m15.356 2a8.01 8.01 0 112.12-3.11M9 11l3-3 3 3" />
                  </svg>
                  Reset Defaults
                </button>
                <button
                  type="button"
                  onClick={handleOpenCreateRule}
                  className="px-4 py-2 text-[10px] font-black text-white bg-slate-900 hover:bg-slate-800 rounded-xl uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm active:scale-98"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  Create custom rule
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">
                    <th className="px-5 py-3 w-16 text-center">Status</th>
                    <th className="px-5 py-3 w-28">Severity</th>
                    <th className="px-5 py-3">Rule Name & Details</th>
                    <th className="px-5 py-3 w-40">Target Category</th>
                    <th className="px-5 py-3">Formulation Condition</th>
                    <th className="px-5 py-3 w-24 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customRules.map((rule) => {
                    const isTrms = rule.targetDataset === 'TRMS';
                    const fieldsSource = isTrms ? TRMS_PROFILE_FIELDS : CARGO_PROFILE_FIELDS;
                    const fieldLabel = fieldsSource.find(f => f.value === rule.field)?.label || rule.field;
                    const compareFieldLabel = rule.compareField ? (fieldsSource.find(f => f.value === rule.compareField)?.label || rule.compareField) : '';
                    return (
                      <tr key={rule.id} className="hover:bg-slate-50/50 transition-colors text-xs font-semibold text-slate-700">
                        {/* Enabled check */}
                        <td className="px-5 py-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleRule(rule.id)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                              rule.enabled ? 'bg-indigo-600' : 'bg-slate-200'
                            }`}
                          >
                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              rule.enabled ? 'translate-x-4' : 'translate-x-0'
                            }`} />
                          </button>
                        </td>

                        {/* Severity Level */}
                        <td className="px-5 py-4 whitespace-nowrap align-middle">
                          {rule.severity === 'error' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-[9px] font-extrabold text-rose-705 bg-rose-50 border border-rose-100 rounded-lg uppercase tracking-wide">
                              CRITICAL
                            </span>
                          )}
                          {rule.severity === 'warning' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-[9px] font-extrabold text-amber-705 bg-amber-50 border border-amber-100 rounded-lg uppercase tracking-wide">
                              WARNING
                            </span>
                          )}
                          {rule.severity === 'info' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-[9px] font-extrabold text-blue-750 bg-blue-50 border border-blue-105 rounded-lg uppercase tracking-wide">
                              ADVISORY
                            </span>
                          )}
                        </td>

                        {/* Details with dataset badge */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-slate-800 leading-tight">{rule.name}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                              isTrms 
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/60' 
                                : 'bg-slate-50 text-slate-600 border border-slate-200'
                            }`}>
                              {isTrms ? 'TRMS' : 'Jarvis'}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 font-medium block max-w-sm leading-relaxed mt-1">{rule.description}</span>
                        </td>

                        {/* Category */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-500 font-extrabold rounded-md text-[9px] uppercase tracking-wide">
                            {rule.category}
                          </span>
                        </td>

                        {/* Logic Formula */}
                        <td className="px-5 py-4 align-middle">
                          <div className="flex flex-col gap-0.5 font-mono text-[10px]">
                            <div className="flex items-center gap-1 flex-wrap">
                              {rule.condition === 'mathCompare' ? (
                                <>
                                  <span className="text-indigo-600 font-bold bg-indigo-50/50 border border-indigo-100 px-1.5 py-0.5 rounded">
                                    {getTransformLabel(fieldLabel, rule.lhsTransform, rule.lhsTransformValue)}
                                  </span>
                                  <span className="text-slate-500 font-bold italic">
                                    {getComparisonOperatorLabel(rule.mathOperator)}
                                  </span>
                                  {rule.rhsType === 'field' && rule.rhsField ? (
                                    <span className="text-indigo-600 font-bold bg-indigo-50/50 border border-indigo-100 px-1.5 py-0.5 rounded">
                                      {getTransformLabel(fieldsSource.find(f => f.value === rule.rhsField)?.label || rule.rhsField || '', rule.rhsTransform, rule.rhsTransformValue)}
                                    </span>
                                  ) : (
                                    <span className="text-emerald-700 font-black bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                                      "{rule.value}"
                                    </span>
                                  )}
                                  {(rule.mathOperator === 'percentDiffGreaterThan' || rule.mathOperator === 'percentDiffLessThan') && (
                                    <span className="text-indigo-500 font-bold text-[9px] uppercase tracking-wider pl-1">
                                      (Tolerance: {rule.value}%)
                                    </span>
                                  )}
                                </>
                              ) : (
                                <>
                                  <span className="text-indigo-600 font-bold bg-indigo-50/50 border border-indigo-100 px-1.5 py-0.5 rounded">{fieldLabel}</span>
                                  <span className="text-slate-400 font-bold italic">{rule.condition}</span>
                                  {rule.condition !== 'empty' && rule.condition !== 'notEmpty' && rule.condition !== 'dateAfterField' && (
                                    <span className="text-emerald-700 font-black bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">"{rule.value}"</span>
                                  )}
                                  {rule.condition === 'dateAfterField' && rule.compareField && (
                                    <span className="text-emerald-700 font-black bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">{compareFieldLabel}</span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </td>
 
                        {/* Actions */}
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleDuplicateRule(rule)}
                              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 border border-slate-150 rounded-lg transition-colors"
                              title="Duplicate rule"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditRule(rule)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-150 rounded-lg transition-colors"
                              title="Edit specifications"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRule(rule.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-150 rounded-lg transition-colors"
                              title="Remove custom rule"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {customRules.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-slate-400">
                        No custom rules registered yet. Click "Create Custom Rule" above to add your first check.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slide-over backdrop modal for Rule creation/editing */}
      <AnimatePresence>
        {isRuleFormOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsRuleFormOpen(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200 w-full max-w-lg z-10 flex flex-col max-h-[85vh]"
            >
              <div className="bg-slate-900 text-white p-5 flex items-center justify-between shrink-0">
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Rule config specs</h4>
                  <h3 className="text-sm font-bold text-white mt-0.5">{editingRuleId ? 'Modify custom rule specifications' : 'Build interactive custom rule'}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRuleFormOpen(false)}
                  className="rounded-lg p-1.5 hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSaveRule} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs font-semibold text-slate-705">
                {/* Target Dataset selection option */}
                <div className="bg-indigo-50/20 border border-indigo-100 p-3.5 rounded-2xl">
                  <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block mb-1.5">Target Dataset to Monitor</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRuleDataset('Jarvis');
                        if (!editingRuleId) {
                          setRuleField('absoluteSellPrice');
                          setRuleCompareField('loadingDate');
                        }
                      }}
                      className={`py-2 px-3 text-center text-xs font-bold rounded-xl border transition-all ${
                        ruleDataset === 'Jarvis'
                          ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Jarvis (Cargo List) 🛳️
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRuleDataset('TRMS');
                        if (!editingRuleId) {
                          setRuleField('commodityValue');
                          setRuleCompareField('loadingDate');
                        }
                      }}
                      className={`py-2 px-3 text-center text-xs font-bold rounded-xl border transition-all ${
                        ruleDataset === 'TRMS'
                          ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      TRMS (Spreadsheet) ⚙️
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-snug">
                    {ruleDataset === 'Jarvis' 
                      ? "This rule will run checks on your primary physical cargo load schedules & margins dataset."
                      : "This rule will monitor aggregated strategy positions, physical valuation, and hedge statuses in TRMS."
                    }
                  </p>
                </div>

                {/* Rule info */}
                <div className="space-y-4 border-b border-slate-100 pb-4">
                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">Rule Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Negative physical margin checks"
                      value={ruleName}
                      onChange={(e) => setRuleName(e.target.value)}
                      className="w-full text-xs font-bold px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">Diagnostic explanation message</label>
                    <textarea
                      placeholder="e.g. Total cost exceeds expected bounds forcing margin to zero or negative."
                      value={ruleDescription}
                      onChange={(e) => setRuleDescription(e.target.value)}
                      rows={2}
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none resize-none"
                    />
                  </div>
                </div>
 
                {/* Specs config */}
                <div className="space-y-4 border-b border-slate-100 pb-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">Category Group</label>
                      <select
                        value={ruleCategory}
                        onChange={(e: any) => setRuleCategory(e.target.value)}
                        className="w-full text-xs font-bold px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none bg-white font-sans"
                      >
                        <option value="Date Validation">Date Validation</option>
                        <option value="Missing Info">Missing Info</option>
                        <option value="Quantity Validation">Quantity Validation</option>
                        <option value="Pricing & Valuations">Pricing & Valuations</option>
                        <option value="Formula Integrity">Formula Integrity</option>
                        <option value="Shipping & SRC">Shipping & SRC</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">Severity trigger level</label>
                      <select
                        value={ruleSeverity}
                        onChange={(e: any) => setRuleSeverity(e.target.value)}
                        className="w-full text-xs font-bold px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none bg-white font-sans"
                      >
                        <option value="error">CRITICAL (Error)</option>
                        <option value="warning">WARNING (Warning)</option>
                        <option value="info">ADVISORY (Advice)</option>
                      </select>
                    </div>
                  </div>
 
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                        {ruleDataset === 'TRMS' ? 'TRMS attribute field' : 'Cargo Profile field attribute'}
                      </label>
                      <select
                        value={ruleField}
                        onChange={(e) => setRuleField(e.target.value)}
                        className="w-full text-xs font-bold px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none bg-white font-sans"
                      >
                        {(ruleDataset === 'TRMS' ? TRMS_PROFILE_FIELDS : CARGO_PROFILE_FIELDS).map(f => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>
 
                    <div>
                      <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">Operator</label>
                      <select
                        value={ruleCondition}
                        onChange={(e: any) => setRuleCondition(e.target.value)}
                        className="w-full text-xs font-bold px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none bg-white font-sans"
                      >
                        <option value="empty">Is Empty / Unspecified</option>
                        <option value="notEmpty">Is Populated</option>
                        <option value="greaterThan">Is Greater Than (&gt;)</option>
                        <option value="lessThan">Is Less Than (&lt;)</option>
                        <option value="equals">Equals (exact, ignoring case)</option>
                        <option value="notEquals">Does Not Equal</option>
                        <option value="contains">Contains substring</option>
                        <option value="dateAfterField">Chronologically set after other date field</option>
                        <option value="mathCompare">Advanced Math / Field-to-Field Comparison</option>
                      </select>
                    </div>
                  </div>
 
                  {ruleCondition !== 'empty' && ruleCondition !== 'notEmpty' && ruleCondition !== 'dateAfterField' && ruleCondition !== 'mathCompare' && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                    >
                      <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">Comparison value *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 10000 or FOB or physical"
                        value={ruleValue}
                        onChange={(e) => setRuleValue(e.target.value)}
                        className="w-full text-xs font-bold px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none"
                      />
                    </motion.div>
                  )}

                  {ruleCondition === 'mathCompare' && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-4 bg-indigo-50/15 border border-indigo-100 p-4 rounded-2xl"
                    >
                      <h5 className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider border-b border-indigo-100/60 pb-1.5 mb-2 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        Advanced Comparison Configuration
                      </h5>

                      {/* LHS Transformation */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[9px] font-extrabold uppercase text-slate-500 tracking-wider block mb-1">LHS Field Transform</label>
                          <select
                            value={lhsTransform}
                            onChange={(e: any) => setLhsTransform(e.target.value)}
                            className="w-full text-[11px] font-bold px-2 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none bg-white font-sans"
                          >
                            <option value="none">No transform (direct value)</option>
                            <option value="abs">Absolute Value |x|</option>
                            <option value="add">Add (+)</option>
                            <option value="subtract">Subtract (-)</option>
                            <option value="multiply">Multiply (*)</option>
                            <option value="power">Power (^)</option>
                          </select>
                        </div>
                        {lhsTransform !== 'none' && lhsTransform !== 'abs' && (
                          <div>
                            <label className="text-[9px] font-extrabold uppercase text-slate-500 tracking-wider block mb-1">Transform Value</label>
                            <input
                              type="number"
                              step="any"
                              required
                              placeholder="e.g. 1.10"
                              value={lhsTransformValue}
                              onChange={(e) => setLhsTransformValue(e.target.value)}
                              className="w-full text-[11px] font-bold px-2 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none"
                            />
                          </div>
                        )}
                      </div>

                      {/* RHS Selection */}
                      <div className="space-y-3 pt-1 border-t border-indigo-100/40">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[9px] font-extrabold uppercase text-slate-500 tracking-wider block mb-1">Compare RHS Against</label>
                            <select
                              value={rhsType}
                              onChange={(e: any) => setRhsType(e.target.value)}
                              className="w-full text-[11px] font-bold px-2 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none bg-white font-sans"
                            >
                              <option value="constant">Constant Value</option>
                              <option value="field">Another Field Attribute</option>
                            </select>
                          </div>
                          
                          {rhsType === 'field' ? (
                            <div>
                              <label className="text-[9px] font-extrabold uppercase text-slate-500 tracking-wider block mb-1">RHS Field</label>
                              <select
                                value={rhsField}
                                onChange={(e) => setRhsField(e.target.value)}
                                className="w-full text-[11px] font-bold px-2 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none bg-white font-sans"
                              >
                                {(ruleDataset === 'TRMS' ? TRMS_PROFILE_FIELDS : CARGO_PROFILE_FIELDS).map(f => (
                                  <option key={f.value} value={f.value}>{f.label}</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div>
                              <label className="text-[9px] font-extrabold uppercase text-slate-500 tracking-wider block mb-1">Constant Value</label>
                              <input
                                type="text"
                                required
                                placeholder="e.g. 1000 or 0"
                                value={ruleValue}
                                onChange={(e) => setRuleValue(e.target.value)}
                                className="w-full text-[11px] font-bold px-2 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none"
                              />
                            </div>
                          )}
                        </div>

                        {rhsType === 'field' && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[9px] font-extrabold uppercase text-slate-500 tracking-wider block mb-1">RHS Field Transform</label>
                              <select
                                value={rhsTransform}
                                onChange={(e: any) => setRhsTransform(e.target.value)}
                                className="w-full text-[11px] font-bold px-2 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none bg-white font-sans"
                              >
                                <option value="none">No transform (direct value)</option>
                                <option value="abs">Absolute Value |x|</option>
                                <option value="add">Add (+)</option>
                                <option value="subtract">Subtract (-)</option>
                                <option value="multiply">Multiply (*)</option>
                                <option value="power">Power (^)</option>
                              </select>
                            </div>
                            {rhsTransform !== 'none' && rhsTransform !== 'abs' && (
                              <div>
                                <label className="text-[9px] font-extrabold uppercase text-slate-500 tracking-wider block mb-1">Transform Value</label>
                                <input
                                  type="number"
                                  step="any"
                                  required
                                  placeholder="e.g. 1.05"
                                  value={rhsTransformValue}
                                  onChange={(e) => setRhsTransformValue(e.target.value)}
                                  className="w-full text-[11px] font-bold px-2 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none"
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Math Operator & Percentage tolerance threshold */}
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-indigo-100/40">
                        <div>
                          <label className="text-[9px] font-extrabold uppercase text-slate-500 tracking-wider block mb-1">Comparison Logic</label>
                          <select
                            value={mathOperator}
                            onChange={(e: any) => setMathOperator(e.target.value)}
                            className="w-full text-[11px] font-bold px-2 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none bg-white font-sans"
                          >
                            <option value="greaterThan">Is Greater Than (&gt;)</option>
                            <option value="lessThan">Is Less Than (&lt;)</option>
                            <option value="equals">Equals (==)</option>
                            <option value="notEquals">Does Not Equal (!=)</option>
                            <option value="percentDiffGreaterThan">Percent Difference is Greater Than (% diff &gt;)</option>
                            <option value="percentDiffLessThan">Percent Difference is Less Than (% diff &lt;)</option>
                          </select>
                        </div>

                        {(mathOperator === 'percentDiffGreaterThan' || mathOperator === 'percentDiffLessThan' || rhsType === 'field') && (
                          <div>
                            <label className="text-[9px] font-extrabold uppercase text-indigo-600 tracking-wider block mb-1">
                              {mathOperator === 'percentDiffGreaterThan' || mathOperator === 'percentDiffLessThan' 
                                ? 'Difference Tolerance (%) *' 
                                : 'Triggering Comparison Value *'}
                            </label>
                            <input
                              type="text"
                              required
                              placeholder={mathOperator.includes('percentDiff') ? "e.g. 10 for 10%" : "e.g. 15000"}
                              value={ruleValue}
                              onChange={(e) => setRuleValue(e.target.value)}
                              className="w-full text-[11px] font-bold px-2 py-1.5 border border-indigo-200 focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none rounded-lg"
                            />
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {ruleCondition === 'dateAfterField' && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                    >
                      <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">Compare Against Date Field</label>
                      <select
                        value={ruleCompareField}
                        onChange={(e) => setRuleCompareField(e.target.value)}
                        className="w-full text-xs font-bold px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none bg-white font-sans"
                      >
                        {(ruleDataset === 'TRMS' ? TRMS_PROFILE_FIELDS : CARGO_PROFILE_FIELDS).filter(f => f.type === 'date').map(f => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </motion.div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 justify-end shrink-0 pt-2 pb-1">
                  <button
                    type="button"
                    onClick={() => setIsRuleFormOpen(false)}
                    className="px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-md transition-all active:scale-98"
                  >
                    {editingRuleId ? 'Save Specs Update' : 'Generate Custom Rule'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
