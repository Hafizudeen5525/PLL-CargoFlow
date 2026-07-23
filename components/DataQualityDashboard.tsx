import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CargoProfile, PnLBucket } from '../types';
import { toast } from 'react-hot-toast';
import { generateCustomRuleFromPrompt } from '../services/geminiService';

interface CustomRule {
  id: string;
  name: string;
  description: string;
  targetDataset?: 'Jarvis' | 'TRMS';
  category: 'Date Validation' | 'Missing Info' | 'Quantity Validation' | 'Pricing & Valuations' | 'Formula Integrity' | 'Shipping & SRC' | 'Other';
  field: string;
  condition: 'empty' | 'notEmpty' | 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual' | 'equals' | 'notEquals' | 'contains' | 'dateAfterField' | 'dateBeforeField' | 'mathCompare';
  value: string;
  compareField?: string;
  severity: 'error' | 'warning' | 'info';
  enabled: boolean;
  ruleIntent?: 'requirement' | 'violation';
  
  useLhsAbs?: boolean;
  lhsMultiplier?: number;
  lhsOffset?: number;
  lhsTransform?: 'none' | 'abs' | 'add' | 'subtract' | 'multiply' | 'power';
  lhsTransformValue?: string;
  
  rhsType?: 'constant' | 'field';
  rhsField?: string;
  useRhsAbs?: boolean;
  rhsMultiplier?: number;
  rhsOffset?: number;
  rhsTransform?: 'none' | 'abs' | 'add' | 'subtract' | 'multiply' | 'power';
  rhsTransformValue?: string;
  mathOperator?: 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual' | 'equals' | 'notEquals' | 'percentDiffGreaterThan' | 'percentDiffLessThan';
}

const CARGO_PROFILE_FIELDS = [
  { value: 'strategyName', label: 'Strategy / SN Number', type: 'string', description: 'Strategy identification number or cargo title' },
  { value: 'buyer', label: 'Buyer / Counterparty', type: 'string', description: 'Purchasing counterparty or customer name' },
  { value: 'source', label: 'Internal Portfolio / Source', type: 'string', description: 'Supply portfolio origin or upstream facility' },
  { value: 'incoterms', label: 'Incoterms (FOB/DES)', type: 'string', description: 'Delivery terms e.g., Free On Board or Delivered Ex-Ship' },
  { value: 'loadedVolume', label: 'Loaded Buy Volume (MMBtu)', type: 'number', description: 'Physical cargo volume loaded at origin port' },
  { value: 'deliveredVolume', label: 'Delivered Sell Volume (MMBtu)', type: 'number', description: 'Physical cargo volume delivered at destination port' },
  { value: 'absoluteBuyPrice', label: 'Absolute Buy Price ($/MMBtu)', type: 'number', description: 'Contract purchase price per MMBtu' },
  { value: 'absoluteSellPrice', label: 'Absolute Sell Price ($/MMBtu)', type: 'number', description: 'Contract sales price per MMBtu' },
  { value: 'loadingDate', label: 'Loading Date', type: 'date', description: 'Scheduled cargo loading / bill of lading date' },
  { value: 'deliveryDate', label: 'Delivery Date', type: 'date', description: 'Scheduled cargo discharge / delivery date' },
  { value: 'reconciledSrcCost', label: 'Reconciled Shipping/SRC Cost ($)', type: 'number', description: 'Total shipping and SRC expenditure ($)' },
  { value: 'srcUnitFee', label: 'Shipping Unit Fee ($/Unit)', type: 'number', description: 'Per unit shipping or SRC tariff fee' },
  { value: 'finalPhysicalPnL', label: 'Physical PnL ($)', type: 'number', description: 'Physical margin before financial hedging ($)' },
  { value: 'finalTotalPnL', label: 'Total PnL (incl. Hedging) ($)', type: 'number', description: 'Net PnL including physical and derivative hedges ($)' },
  { value: 'pnlBucket', label: 'PnL Bucket (Realized/Unrealized)', type: 'string', description: 'Realized or Unrealized P&L status' },
  { value: 'jarvisNo', label: 'Jarvis Reference No', type: 'string', description: 'Unique Jarvis tracking ID' },
];

const TRMS_PROFILE_FIELDS = [
  { value: 'trmsPurchaseValue', label: 'Purchase Volume / Leg Value (MMBtu)', type: 'number', description: 'Total TRMS purchase volume / leg value for the strategy as shown in TRMS summary table' },
  { value: 'trmsSalesValue', label: 'Sales Volume / Leg Value (MMBtu)', type: 'number', description: 'Total TRMS sales volume / leg value for the strategy as shown in TRMS summary table' },
  { value: 'weightedBuyPrice', label: 'Weighted Avg Buy Price ($/MMBtu)', type: 'number', description: 'Weighted average purchase price across all buy legs for the strategy' },
  { value: 'weightedSellPrice', label: 'Weighted Avg Sell Price ($/MMBtu)', type: 'number', description: 'Weighted average sales price across all sell legs for the strategy' },
  { value: 'commodityValue', label: 'Commodity Value ($)', type: 'number', description: 'Physical commodity valuation ($)' },
  { value: 'srcValue', label: 'Shipping / SRC Cost ($)', type: 'number', description: 'TRMS shipping and SRC allocation cost ($)' },
  { value: 'hedgingPnL', label: 'Hedging PnL ($)', type: 'number', description: 'Financial derivatives and hedging P&L ($)' },
  { value: 'strategyName', label: 'Strategy / SN Number', type: 'string', description: 'Strategy identification code in TRMS' },
  { value: 'volumeType', label: 'Volume Type', type: 'string', description: 'Fixed, Indexed, or Variable volume specification' },
  { value: 'priceStatus', label: 'Price Status', type: 'string', description: 'Priced vs Unpriced status' },
  { value: 'loadingDate', label: 'Loading Date', type: 'date', description: 'Scheduled loading date in TRMS' },
  { value: 'deliveryDate', label: 'Delivery Date', type: 'date', description: 'Scheduled delivery date in TRMS' },
  { value: 'commWindowEndDate', label: 'Comm Window End Date', type: 'date', description: 'Pricing or commercial window end date' }
];

const DEFAULT_CUSTOM_RULES: CustomRule[] = [
  {
    id: 'rule-src-zero-or-less',
    name: 'SRC Shipping Cost Must Be 0 or Less',
    description: 'Requires shipping / SRC cost in Jarvis to be 0 or less.',
    targetDataset: 'Jarvis',
    category: 'Shipping & SRC',
    field: 'reconciledSrcCost',
    condition: 'lessThanOrEqual',
    value: '0',
    ruleIntent: 'requirement',
    severity: 'error',
    enabled: true
  },
  {
    id: 'rule-trms-src-zero-or-less',
    name: 'TRMS SRC Must Be 0 or Less',
    description: 'Requires shipping / SRC value in TRMS to be 0 or less.',
    targetDataset: 'TRMS',
    category: 'Shipping & SRC',
    field: 'srcValue',
    condition: 'lessThanOrEqual',
    value: '0',
    ruleIntent: 'requirement',
    severity: 'error',
    enabled: true
  },
  {
    id: 'rule-loading-month-earlier',
    name: 'Loading Month Earlier Than Delivery Month',
    description: 'Requires loading month to be strictly earlier than delivery month.',
    targetDataset: 'Jarvis',
    category: 'Date Validation',
    field: 'loadingDate',
    condition: 'dateBeforeField',
    compareField: 'deliveryDate',
    value: '',
    ruleIntent: 'requirement',
    severity: 'error',
    enabled: true
  },
  {
    id: 'rule-trms-loading-month-earlier',
    name: 'TRMS Loading Month Earlier Than Delivery Month',
    description: 'Requires TRMS loading month to be strictly earlier than delivery month.',
    targetDataset: 'TRMS',
    category: 'Date Validation',
    field: 'loadingDate',
    condition: 'dateBeforeField',
    compareField: 'deliveryDate',
    value: '',
    ruleIntent: 'requirement',
    severity: 'error',
    enabled: true
  },
  {
    id: 'rule-sn-vol-buy-4m',
    name: 'Max 4M Buy Volume Per SN',
    description: 'The absolute buy volume of an SN cannot exceed 4,000,000 MMBtu.',
    targetDataset: 'Jarvis',
    category: 'Quantity Validation',
    field: 'loadedVolume',
    condition: 'mathCompare',
    useLhsAbs: true,
    value: '4000000',
    mathOperator: 'lessThanOrEqual',
    ruleIntent: 'requirement',
    severity: 'error',
    enabled: true
  },
  {
    id: 'rule-sn-vol-sell-4m',
    name: 'Max 4M Sell Volume Per SN',
    description: 'The absolute sell volume of an SN cannot exceed 4,000,000 MMBtu.',
    targetDataset: 'Jarvis',
    category: 'Quantity Validation',
    field: 'deliveredVolume',
    condition: 'mathCompare',
    useLhsAbs: true,
    value: '4000000',
    mathOperator: 'lessThanOrEqual',
    ruleIntent: 'requirement',
    severity: 'error',
    enabled: true
  },
  {
    id: 'rule-jarvis-trms-vol-variance-5pct',
    name: 'Jarvis vs TRMS Volume Variance Limit (<=5%)',
    description: 'Jarvis volume and TRMS volume for an SN cannot differ by more than 5%.',
    targetDataset: 'Jarvis',
    category: 'Quantity Validation',
    field: 'deliveredVolume',
    condition: 'mathCompare',
    rhsType: 'field',
    rhsField: 'trmsSalesValue',
    value: '5',
    mathOperator: 'percentDiffLessThan',
    ruleIntent: 'requirement',
    severity: 'error',
    enabled: true
  },
  {
    id: 'rule-realized-no-pnl-change',
    name: 'No P&L Change for Realized Cargoes',
    description: 'Prohibits any P&L change in revenue or cost for cargoes with Realized status.',
    targetDataset: 'Jarvis',
    category: 'Pricing & Valuations',
    field: 'pnlBucket',
    condition: 'equals',
    value: 'Realized',
    ruleIntent: 'violation',
    severity: 'error',
    enabled: true
  },
  {
    id: 'rule-negative-pnl',
    name: 'Negative Physical PnL Alert',
    description: 'Triggers when a strategy has a negative final physical PnL.',
    targetDataset: 'Jarvis',
    category: 'Pricing & Valuations',
    field: 'finalPhysicalPnL',
    condition: 'lessThan',
    value: '0',
    ruleIntent: 'violation',
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
    ruleIntent: 'violation',
    severity: 'info',
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
    ruleIntent: 'violation',
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
    case 'greaterThanOrEqual': return '>=';
    case 'lessThan': return '<';
    case 'lessThanOrEqual': return '<=';
    case 'equals': return '==';
    case 'notEquals': return '!=';
    case 'percentDiffGreaterThan': return '% diff >';
    case 'percentDiffLessThan': return '% diff <';
    default: return '==';
  }
};

const evaluateRuleForRecord = (
  record: any,
  rule: CustomRule,
  fieldsSource: { value: string; label: string; type: string }[]
): { conditionSatisfied: boolean; isViolation: boolean; message: string; formulaDisplay: string } => {
  const fieldVal = record[rule.field];
  const fieldInfo = fieldsSource.find(f => f.value === rule.field);
  const fieldLabel = fieldInfo?.label || rule.field;
  const isDateField = fieldInfo?.type === 'date' || rule.field.toLowerCase().includes('date');

  let conditionSatisfied = false;
  let detailMsg = '';
  let formulaDisplay = '';

  const intent = rule.ruleIntent || 'violation';

  if (rule.condition === 'empty') {
    conditionSatisfied = fieldVal === undefined || fieldVal === null || String(fieldVal).trim() === '';
    detailMsg = `Field "${fieldLabel}" is empty.`;
    formulaDisplay = `${fieldLabel} IS EMPTY`;
  } else if (rule.condition === 'notEmpty') {
    conditionSatisfied = fieldVal !== undefined && fieldVal !== null && String(fieldVal).trim() !== '';
    detailMsg = `Field "${fieldLabel}" is populated (${fieldVal}).`;
    formulaDisplay = `${fieldLabel} IS NOT EMPTY`;
  } else if (rule.condition === 'contains') {
    conditionSatisfied = String(fieldVal || '').toLowerCase().includes(String(rule.value || '').toLowerCase());
    detailMsg = `Field "${fieldLabel}" ("${fieldVal}") contains "${rule.value}".`;
    formulaDisplay = `${fieldLabel} CONTAINS "${rule.value}"`;
  } else if (rule.condition === 'equals') {
    if (isDateField) {
      conditionSatisfied = String(fieldVal || '').trim() === String(rule.value || '').trim();
    } else if (!isNaN(Number(fieldVal)) && !isNaN(Number(rule.value)) && rule.value !== '') {
      conditionSatisfied = Math.abs(Number(fieldVal) - Number(rule.value)) < 1e-9;
    } else {
      conditionSatisfied = String(fieldVal || '').trim().toLowerCase() === String(rule.value || '').trim().toLowerCase();
    }
    detailMsg = `Field "${fieldLabel}" (${fieldVal}) equals "${rule.value}".`;
    formulaDisplay = `${fieldLabel} == ${rule.value}`;
  } else if (rule.condition === 'notEquals') {
    if (isDateField) {
      conditionSatisfied = String(fieldVal || '').trim() !== String(rule.value || '').trim();
    } else if (!isNaN(Number(fieldVal)) && !isNaN(Number(rule.value)) && rule.value !== '') {
      conditionSatisfied = Math.abs(Number(fieldVal) - Number(rule.value)) >= 1e-9;
    } else {
      conditionSatisfied = String(fieldVal || '').trim().toLowerCase() !== String(rule.value || '').trim().toLowerCase();
    }
    detailMsg = `Field "${fieldLabel}" (${fieldVal}) does not equal "${rule.value}".`;
    formulaDisplay = `${fieldLabel} != ${rule.value}`;
  } else if (rule.condition === 'greaterThan' || rule.condition === 'greaterThanOrEqual' || rule.condition === 'lessThan' || rule.condition === 'lessThanOrEqual') {
    if (isDateField) {
      const d1 = new Date(String(fieldVal || ''));
      const d2 = new Date(String(rule.value || ''));
      if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
        if (rule.condition === 'greaterThan') conditionSatisfied = d1.getTime() > d2.getTime();
        else if (rule.condition === 'greaterThanOrEqual') conditionSatisfied = d1.getTime() >= d2.getTime();
        else if (rule.condition === 'lessThan') conditionSatisfied = d1.getTime() < d2.getTime();
        else if (rule.condition === 'lessThanOrEqual') conditionSatisfied = d1.getTime() <= d2.getTime();
        detailMsg = `Date "${fieldLabel}" (${fieldVal}) vs target date (${rule.value}).`;
        formulaDisplay = `${fieldLabel} ${rule.condition.includes('greater') ? '>' : '<'}${rule.condition.includes('OrEqual') ? '=' : ''} ${rule.value}`;
      } else {
        conditionSatisfied = false;
        detailMsg = `Invalid or missing date (${fieldVal ?? 'N/A'}).`;
        formulaDisplay = `${fieldLabel} [Invalid Date]`;
      }
    } else {
      const num = Number(fieldVal);
      const comp = Number(rule.value);
      if (!isNaN(num) && !isNaN(comp)) {
        if (rule.condition === 'greaterThan') conditionSatisfied = num > comp;
        else if (rule.condition === 'greaterThanOrEqual') conditionSatisfied = num >= comp;
        else if (rule.condition === 'lessThan') conditionSatisfied = num < comp;
        else if (rule.condition === 'lessThanOrEqual') conditionSatisfied = num <= comp;
        detailMsg = `Field "${fieldLabel}" (${num}) vs threshold (${comp}).`;
        formulaDisplay = `${fieldLabel} ${rule.condition.includes('greater') ? '>' : '<'}${rule.condition.includes('OrEqual') ? '=' : ''} ${comp}`;
      } else {
        conditionSatisfied = false;
        detailMsg = `Unpopulated numeric field "${fieldLabel}" (${fieldVal ?? 'N/A'}).`;
        formulaDisplay = `${fieldLabel} vs ${comp}`;
      }
    }
  } else if (rule.condition === 'dateAfterField' || rule.condition === 'dateBeforeField') {
    const d1Str = String(fieldVal || '');
    const compareLabel = fieldsSource.find(f => f.value === rule.compareField)?.label || rule.compareField;
    const d2Str = String(record[rule.compareField || ''] || '');
    if (d1Str && d2Str) {
      const d1 = new Date(d1Str);
      const d2 = new Date(d2Str);
      if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
        conditionSatisfied = rule.condition === 'dateAfterField' ? d1.getTime() > d2.getTime() : d1.getTime() < d2.getTime();
        detailMsg = `Date "${fieldLabel}" (${d1Str}) vs "${compareLabel}" (${d2Str}).`;
        formulaDisplay = `${fieldLabel} ${rule.condition === 'dateAfterField' ? '>' : '<'} ${compareLabel}`;
      }
    }
  } else if (rule.condition === 'mathCompare') {
    const rawLhs = Number(fieldVal);
    let lhsVal = isNaN(rawLhs) ? 0 : rawLhs;
    
    if (rule.useLhsAbs || rule.lhsTransform === 'abs') lhsVal = Math.abs(lhsVal);
    if (rule.lhsMultiplier !== undefined && rule.lhsMultiplier !== 1) lhsVal *= rule.lhsMultiplier;
    else if (rule.lhsTransform === 'multiply' && rule.lhsTransformValue) lhsVal *= Number(rule.lhsTransformValue) || 1;
    if (rule.lhsOffset) lhsVal += rule.lhsOffset;
    else if (rule.lhsTransform === 'add' && rule.lhsTransformValue) lhsVal += Number(rule.lhsTransformValue) || 0;
    else if (rule.lhsTransform === 'subtract' && rule.lhsTransformValue) lhsVal -= Number(rule.lhsTransformValue) || 0;

    let rhsVal = 0;
    let rhsLabel = '';
    if (rule.rhsType === 'field' && rule.rhsField) {
      const rawRhs = Number(record[rule.rhsField]);
      rhsVal = isNaN(rawRhs) ? 0 : rawRhs;
      const rhsFieldInfo = fieldsSource.find(f => f.value === rule.rhsField);
      rhsLabel = rhsFieldInfo?.label || rule.rhsField;

      if (rule.useRhsAbs || rule.rhsTransform === 'abs') rhsVal = Math.abs(rhsVal);
      if (rule.rhsMultiplier !== undefined && rule.rhsMultiplier !== 1) rhsVal *= rule.rhsMultiplier;
      else if (rule.rhsTransform === 'multiply' && rule.rhsTransformValue) rhsVal *= Number(rule.rhsTransformValue) || 1;
      if (rule.rhsOffset) rhsVal += rule.rhsOffset;
      else if (rule.rhsTransform === 'add' && rule.rhsTransformValue) rhsVal += Number(rule.rhsTransformValue) || 0;
      else if (rule.rhsTransform === 'subtract' && rule.rhsTransformValue) rhsVal -= Number(rule.rhsTransformValue) || 0;
    } else {
      rhsVal = Number(rule.value) || 0;
      rhsLabel = String(rule.value);
    }

    const op = rule.mathOperator || 'greaterThan';
    if (op === 'greaterThan') conditionSatisfied = lhsVal > rhsVal;
    else if (op === 'greaterThanOrEqual') conditionSatisfied = lhsVal >= rhsVal;
    else if (op === 'lessThan') conditionSatisfied = lhsVal < rhsVal;
    else if (op === 'lessThanOrEqual') conditionSatisfied = lhsVal <= rhsVal;
    else if (op === 'equals') conditionSatisfied = Math.abs(lhsVal - rhsVal) < 1e-9;
    else if (op === 'notEquals') conditionSatisfied = Math.abs(lhsVal - rhsVal) >= 1e-9;
    else if (op === 'percentDiffGreaterThan') {
      const pct = rhsVal === 0 ? (lhsVal !== 0 ? 100 : 0) : (Math.abs(lhsVal - rhsVal) / Math.abs(rhsVal)) * 100;
      conditionSatisfied = pct > Number(rule.value || 0);
    } else if (op === 'percentDiffLessThan') {
      const pct = rhsVal === 0 ? 0 : (Math.abs(lhsVal - rhsVal) / Math.abs(rhsVal)) * 100;
      conditionSatisfied = pct < Number(rule.value || 0);
    }

    detailMsg = `Calculated LHS (${lhsVal.toFixed(2)}) vs RHS (${rhsVal.toFixed(2)}).`;
    formulaDisplay = `${rule.lhsMultiplier && rule.lhsMultiplier !== 1 ? rule.lhsMultiplier + ' * ' : ''}${rule.useLhsAbs ? '|' + fieldLabel + '|' : fieldLabel} ${op === 'greaterThan' ? '>' : op === 'lessThan' ? '<' : op === 'equals' ? '==' : op === 'notEquals' ? '!=' : op} ${rule.rhsMultiplier && rule.rhsMultiplier !== 1 ? rule.rhsMultiplier + ' * ' : ''}${rule.useRhsAbs ? '|' + rhsLabel + '|' : rhsLabel}`;
  }

  const isViolation = intent === 'requirement' ? !conditionSatisfied : conditionSatisfied;

  let message = '';
  if (isViolation) {
    if (intent === 'requirement') {
      message = `Violates required condition [${formulaDisplay}]. Details: ${detailMsg}`;
    } else {
      message = `Triggered anomaly rule [${formulaDisplay}]. Details: ${detailMsg}`;
    }
  }

  return { conditionSatisfied, isViolation, message, formulaDisplay };
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

interface RuleSampleRecord {
  id: string;
  strategyName: string;
  checkedField: string;
  valueDisplay: string;
  passed: boolean;
  reason: string;
}

interface RuleBreakdownItem {
  ruleName: string;
  dataset: 'Jarvis' | 'TRMS';
  checked: number;
  passed: number;
  score: number;
  sampleData: RuleSampleRecord[];
}

const CATEGORY_TO_DIMENSION_MAP: Record<string, { id: string; name: string }> = {
  'Missing Info': { id: 'completeness', name: 'Completeness' },
  'Date Validation': { id: 'timeliness', name: 'Timeliness' },
  'Quantity Validation': { id: 'validity', name: 'Validity' },
  'Pricing & Valuations': { id: 'accuracy', name: 'Accuracy' },
  'Formula Integrity': { id: 'validity', name: 'Validity' },
  'Shipping & SRC': { id: 'consistency', name: 'Consistency' },
  'Other': { id: 'validity', name: 'Validity' }
};

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

  // Dataset Scope Toggle & Expanded Diagnostic View
  const [selectedDataset, setSelectedDataset] = useState<'Jarvis' | 'TRMS' | 'All'>('Jarvis');
  const [isDiagnosticExpanded, setIsDiagnosticExpanded] = useState(false);

  // Custom Rule Inventory filters
  const [ruleSearchTerm, setRuleSearchTerm] = useState('');
  const [ruleDatasetFilter, setRuleDatasetFilter] = useState<'all' | 'Jarvis' | 'TRMS'>('all');
  const [selectedDimensionModal, setSelectedDimensionModal] = useState<string | null>(null);
  const [expandedRuleNameModal, setExpandedRuleNameModal] = useState<string | null>(null);
  const [sampleFilterModal, setSampleFilterModal] = useState<'all' | 'passed' | 'failed'>('all');

  // AI Rule Generator State
  const [isAiRuleModalOpen, setIsAiRuleModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingRule, setIsGeneratingRule] = useState(false);
  const [aiGeneratedRulePreview, setAiGeneratedRulePreview] = useState<CustomRule | null>(null);
  const [customApiKey, setCustomApiKey] = useState(() => localStorage.getItem('user_gemini_api_key') || '');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [aiRateLimitCount, setAiRateLimitCount] = useState(0);
  const [lastAiRequestTime, setLastAiRequestTime] = useState(0);

  // Custom Rules state
  const [customRules, setCustomRules] = useState<CustomRule[]>(() => {
    try {
      const saved = localStorage.getItem('cargo_custom_rules');
      if (saved) {
        const parsed: CustomRule[] = JSON.parse(saved);
        const existingIds = new Set(parsed.map(r => r.id));
        const missingDefaults = DEFAULT_CUSTOM_RULES.filter(r => !existingIds.has(r.id));
        const updated: CustomRule[] = parsed.map(r => {
          if (r.id === 'rule-src-positive-req') {
            return {
              ...r,
              id: 'rule-src-zero-or-less',
              name: 'SRC Shipping Cost Must Be 0 or Less',
              description: 'Requires shipping / SRC cost to be 0 or less.',
              condition: 'lessThanOrEqual',
              value: '0',
              ruleIntent: 'requirement',
              severity: 'error'
            };
          }
          return r;
        });
        return [...updated, ...missingDefaults];
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
  const allQualityIssues = useMemo(() => {
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

      // TRMS Rule 1: SRC must be 0 or less
      if ((p.reconciledSrcCost !== undefined && p.reconciledSrcCost !== null && p.reconciledSrcCost > 0) || (p.srcUnitFee !== undefined && p.srcUnitFee !== null && p.srcUnitFee > 0)) {
        issues.push({
          id: `${p.id}-src-must-be-zero-or-less`,
          type: 'error',
          category: 'Shipping & SRC',
          field: 'Shipping / SRC Cost',
          message: `SRC must be 0 or less, but found positive SRC value ($${(p.reconciledSrcCost || p.srcUnitFee || 0).toLocaleString()}).`,
          cargoId: p.id,
          cargoName
        });
      }

      // TRMS Rule 2: Loading month must be earlier than delivery month
      if (p.loadingDate && p.deliveryDate) {
        const loadM = p.loadingDate.substring(0, 7);
        const delivM = p.deliveryDate.substring(0, 7);
        if (loadM && delivM && loadM >= delivM) {
          issues.push({
            id: `${p.id}-loading-month-not-earlier`,
            type: 'error',
            category: 'Date Validation',
            field: 'Loading / Delivery Month',
            message: `Loading month (${loadM}) must be strictly earlier than delivery month (${delivM}).`,
            cargoId: p.id,
            cargoName
          });
        }
      }

      // TRMS Rule 3: Absolute value of either buy or sell volume of an SN can't be more than 4mil
      const buyVolAbs = Math.abs(p.totalLoadedVolume ?? p.loadedVolume ?? 0);
      const sellVolAbs = Math.abs(p.totalDeliveredVolume ?? p.deliveredVolume ?? 0);
      if (buyVolAbs > 4000000) {
        issues.push({
          id: `${p.id}-buy-vol-exceeds-4m`,
          type: 'error',
          category: 'Quantity Validation',
          field: 'Buy Volume Limit',
          message: `Absolute buy volume (${buyVolAbs.toLocaleString()} MMBtu) exceeds the 4,000,000 MMBtu limit for Strategy '${cargoName}'.`,
          cargoId: p.id,
          cargoName
        });
      }
      if (sellVolAbs > 4000000) {
        issues.push({
          id: `${p.id}-sell-vol-exceeds-4m`,
          type: 'error',
          category: 'Quantity Validation',
          field: 'Sell Volume Limit',
          message: `Absolute sell volume (${sellVolAbs.toLocaleString()} MMBtu) exceeds the 4,000,000 MMBtu limit for Strategy '${cargoName}'.`,
          cargoId: p.id,
          cargoName
        });
      }

      // TRMS Rule 4: Jarvis volume and TRMS volume cannot be more than 5% different for each SN
      if (trmsData && trmsData.trmsAgg && trmsData.trmsAgg[p.strategyName]) {
        const trmsInfo = trmsData.trmsAgg[p.strategyName];
        const jarvisVol = p.totalDeliveredVolume ?? p.deliveredVolume ?? p.totalLoadedVolume ?? p.loadedVolume ?? 0;
        const trmsVol = Math.abs(trmsInfo.trmsSalesValue || trmsInfo.trmsPurchaseValue || trmsInfo.commodityValue || 0);
        if (trmsVol > 0) {
          const pctDiff = (Math.abs(jarvisVol - trmsVol) / trmsVol) * 100;
          if (pctDiff > 5) {
            issues.push({
              id: `${p.id}-jarvis-trms-vol-diff-over-5pct`,
              type: 'error',
              category: 'Quantity Validation',
              field: 'Jarvis vs TRMS Volume Variance',
              message: `Jarvis volume (${jarvisVol.toLocaleString()} MMBtu) and TRMS volume (${trmsVol.toLocaleString()} MMBtu) differ by ${pctDiff.toFixed(2)}%, exceeding the allowable 5% variance threshold.`,
              cargoId: p.id,
              cargoName
            });
          }
        }
      }

      // TRMS Rule 5: There shouldn't be any Change in P&L for Revenue, cost for Realized cargoes
      const isRealizedCargo = p.pnlBucket === PnLBucket.Realized || (p.pnlBucket as any) === 'Realized';
      if (isRealizedCargo) {
        const revDelta = Math.abs((p.finalSalesRevenue || p.salesRevenue || 0) - (p.reconciledSalesRevenue || 0));
        const costDelta = Math.abs((p.finalTotalCost || ((p.absoluteBuyPrice || 0) * (p.loadedVolume || 0)) || 0) - (p.reconciledPurchaseCost || 0));
        if (revDelta > 0.01 || costDelta > 0.01) {
          issues.push({
            id: `${p.id}-realized-pnl-change-prohibited`,
            type: 'error',
            category: 'Pricing & Valuations',
            field: 'Realized Cargo P&L Integrity',
            message: `Realized cargo '${cargoName}' has a prohibited P&L change in Revenue or Cost (Revenue Delta: $${revDelta.toFixed(2)}, Cost Delta: $${costDelta.toFixed(2)}).`,
            cargoId: p.id,
            cargoName
          });
        }
      }
    });

    // Extract TRMS strategy summaries as checkable uniform objects directly from TRMS summary table rows
    const trmsStrategies: any[] = [];
    if (trmsData && trmsData.trmsAgg) {
      Object.entries(trmsData.trmsAgg).forEach(([strategyName, data]: [string, any]) => {
        const purchaseVol = Math.abs(data.trmsPurchaseValue || 0);
        const salesVol = Math.abs(data.trmsSalesValue || 0);
        const buyPrice = data.weightedBuyPrice ?? (purchaseVol > 0 ? Math.abs((data.commodityValue || 0) / purchaseVol) : 0);
        const sellPrice = data.weightedSellPrice ?? (salesVol > 0 ? Math.abs((data.commodityValue || 0) / salesVol) : 0);

        trmsStrategies.push({
          id: `trms-${strategyName}`,
          strategyName: strategyName,
          volumeType: data.volumeType || '',
          priceStatus: data.priceStatus || '',
          commodityValue: data.commodityValue || 0,
          srcValue: data.srcValue || 0,
          hedgingPnL: data.hedgingPnL || 0,
          trmsPurchaseValue: purchaseVol,
          trmsSalesValue: salesVol,
          weightedBuyPrice: buyPrice,
          weightedSellPrice: sellPrice,
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
          const evalRes = evaluateRuleForRecord(s, rule, TRMS_PROFILE_FIELDS);

          if (evalRes.isViolation) {
            issues.push({
              id: `custom-issue-${s.id}-${rule.id}`,
              type: rule.severity,
              category: rule.category,
              field: `TRMS: ${rule.field}`,
              message: `[TRMS] ${rule.name}: ${rule.description ? rule.description + ' ' : ''}${evalRes.message}`,
              cargoId: s.id,
              cargoName: `[TRMS] ${cargoName}`
            });
          }
        });
      } else {
        profiles.filter(p => !p.deleted).forEach(p => {
          const cargoName = p.strategyName || 'Unnamed Strategy';
          const evalRes = evaluateRuleForRecord(p, rule, CARGO_PROFILE_FIELDS);

          if (evalRes.isViolation) {
            issues.push({
              id: `custom-issue-${p.id}-${rule.id}`,
              type: rule.severity,
              category: rule.category,
              field: rule.field,
              message: `${rule.name}: ${rule.description ? rule.description + ' ' : ''}${evalRes.message}`,
              cargoId: p.id,
              cargoName
            });
          }
        });
      }
    });

    return issues;
  }, [profiles, trmsData, customRules]);

  // Extract TRMS strategy records
  const trmsStrategies = useMemo(() => {
    const list: any[] = [];
    if (trmsData && trmsData.trmsAgg) {
      Object.entries(trmsData.trmsAgg).forEach(([strategyName, data]: [string, any]) => {
        list.push({
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
    return list;
  }, [trmsData]);

  // Filter quality issues based on selectedDataset scope
  const qualityIssues = useMemo(() => {
    if (selectedDataset === 'Jarvis') {
      return allQualityIssues.filter(i => !i.cargoId.startsWith('trms-'));
    }
    if (selectedDataset === 'TRMS') {
      return allQualityIssues.filter(i => i.cargoId.startsWith('trms-'));
    }
    return allQualityIssues;
  }, [allQualityIssues, selectedDataset]);

  // 6 Data Quality Dimensions Calculations using User's Exact Methodology:
  // 1. Rule Score = (Records Passed ÷ Records Checked) × 100
  // 2. Dimension Score = Average of all rule scores within that dimension.
  // 3. Dimension with No DQ Rule = Mark as "N/A" (Not Assessed), exclude from overall DQ calculation.
  // 4. Overall DQ Score = Average of all assessed dimension scores.
  const dqDimensions = useMemo(() => {
    const activeProfiles = profiles.filter(p => !p.deleted);

    const dimensionsDef = [
      {
        id: 'completeness',
        name: 'Completeness',
        definition: 'Degree to which all required data is available and populated.',
        formula: 'Completeness % = (Number of populated mandatory fields ÷ Total mandatory fields) × 100',
        details: 'Evaluates mandatory strategy attributes across active dataset records.'
      },
      {
        id: 'validity',
        name: 'Validity',
        definition: 'Degree to which data conforms to predefined formats, structures, or business rules.',
        formula: 'Validity % = (Number of records meeting validation rules ÷ Total records checked) × 100',
        details: 'Evaluates formula syntax, price bounds, volume positivity, and Incoterm rules.'
      },
      {
        id: 'accuracy',
        name: 'Accuracy',
        definition: 'Degree to which data correctly represents the real-world object or event.',
        formula: 'Accuracy % = (Number of verified records ÷ Total records checked) × 100',
        details: 'Verifies price outliers, non-negative PnL, and priced market trade statuses.'
      },
      {
        id: 'consistency',
        name: 'Consistency',
        definition: 'Degree to which data is uniformly represented across systems and datasets.',
        formula: 'Consistency % = (Number of consistent records ÷ Total records compared) × 100',
        details: 'Checks multi-tier volume sum rollups and cross-system strategy matching.'
      },
      {
        id: 'uniqueness',
        name: 'Uniqueness',
        definition: 'Degree to which records are not duplicated or redundant.',
        formula: 'Uniqueness % = ((Total records − Duplicate records) ÷ Total records) × 100',
        details: 'Identifies duplicate strategy names or redundant reference numbers.'
      },
      {
        id: 'timeliness',
        name: 'Timeliness',
        definition: 'Degree to which data is available when required and reflects latest operational schedules.',
        formula: 'Timeliness % = (Records meeting schedule requirement ÷ Total records) × 100',
        details: 'Measures loading date sequencing and adherence to commencement windows.'
      }
    ];

    return dimensionsDef.map(dim => {
      const rulesEvaluated: RuleBreakdownItem[] = [];

      // Evaluate Jarvis rules if Jarvis or All selected
      if (selectedDataset === 'Jarvis' || selectedDataset === 'All') {
        const jarvisCount = activeProfiles.length;
        if (jarvisCount > 0) {
          if (dim.id === 'completeness') {
            const mandatoryList = ['strategyName', 'loadingDate', 'deliveryDate', 'loadedVolume', 'deliveredVolume', 'buyer'];
            const totalMandatory = jarvisCount * mandatoryList.length;
            let populatedMandatory = 0;
            const sampleData: RuleSampleRecord[] = [];

            activeProfiles.forEach(p => {
              const missing: string[] = [];
              if (!p.strategyName || p.strategyName.trim() === '' || p.strategyName.toLowerCase() === 'unnamed strategy') missing.push('Strategy Name');
              if (!p.loadingDate) missing.push('Loading Date');
              if (!p.deliveryDate) missing.push('Delivery Date');
              if (p.loadedVolume === undefined || p.loadedVolume <= 0) missing.push('Loaded Volume');
              if (p.deliveredVolume === undefined || p.deliveredVolume <= 0) missing.push('Delivered Volume');
              if (!p.buyer || p.buyer.trim() === '') missing.push('Buyer/Counterparty');

              const populatedCount = 6 - missing.length;
              populatedMandatory += populatedCount;
              const isPass = missing.length === 0;

              sampleData.push({
                id: p.id,
                strategyName: p.strategyName || 'Unnamed Strategy',
                checkedField: '6 Mandatory Strategy Attributes',
                valueDisplay: isPass ? 'All 6 fields populated' : `Missing: ${missing.join(', ')}`,
                passed: isPass,
                reason: isPass ? '100% Complete' : `Incomplete (${populatedCount}/6 populated)`
              });
            });

            const score = (populatedMandatory / totalMandatory) * 100;
            rulesEvaluated.push({
              ruleName: 'Jarvis Mandatory Fields Check',
              dataset: 'Jarvis',
              checked: totalMandatory,
              passed: populatedMandatory,
              score: Math.round(score * 10) / 10,
              sampleData
            });
          }

          if (dim.id === 'validity') {
            let passedValidity = 0;
            const sampleData: RuleSampleRecord[] = [];

            activeProfiles.forEach(p => {
              const volOk = (p.loadedVolume ?? 0) > 0 && (p.deliveredVolume ?? 0) > 0;
              const buyBracketOk = !p.buyFormula || !hasUnbalancedParentheses(p.buyFormula);
              const sellBracketOk = !p.sellFormula || !hasUnbalancedParentheses(p.sellFormula);
              const isPass = volOk && buyBracketOk && sellBracketOk;
              if (isPass) passedValidity++;

              const reasons: string[] = [];
              if ((p.loadedVolume ?? 0) <= 0) reasons.push('Loaded Vol <= 0');
              if ((p.deliveredVolume ?? 0) <= 0) reasons.push('Delivered Vol <= 0');
              if (!buyBracketOk) reasons.push('Buy formula parentheses unbalanced');
              if (!sellBracketOk) reasons.push('Sell formula parentheses unbalanced');

              sampleData.push({
                id: p.id,
                strategyName: p.strategyName || 'Unnamed Strategy',
                checkedField: 'Loaded/Delivered Volume & Formula Parentheses',
                valueDisplay: `Loaded: ${p.loadedVolume ?? 0} MT | Del: ${p.deliveredVolume ?? 0} MT`,
                passed: isPass,
                reason: isPass ? 'Positive volumes & valid bracket syntax' : reasons.join('; ')
              });
            });

            const score = (passedValidity / jarvisCount) * 100;
            rulesEvaluated.push({
              ruleName: 'Jarvis Volume Positivity & Syntax Rule',
              dataset: 'Jarvis',
              checked: jarvisCount,
              passed: passedValidity,
              score: Math.round(score * 10) / 10,
              sampleData
            });
          }

          if (dim.id === 'accuracy') {
            let passedAccuracy = 0;
            const sampleData: RuleSampleRecord[] = [];

            activeProfiles.forEach(p => {
              const buyOk = !p.isBuyPriceManual || ((p.absoluteBuyPrice ?? 0) > 0 && (p.absoluteBuyPrice ?? 0) <= 75);
              const sellOk = !p.isSellPriceManual || ((p.absoluteSellPrice ?? 0) > 0 && (p.absoluteSellPrice ?? 0) <= 75);
              const isPass = buyOk && sellOk;
              if (isPass) passedAccuracy++;

              sampleData.push({
                id: p.id,
                strategyName: p.strategyName || 'Unnamed Strategy',
                checkedField: 'Buy/Sell Valuation Bounds ($0 - $75/bbl)',
                valueDisplay: `Buy: $${p.absoluteBuyPrice ?? 0}/bbl | Sell: $${p.absoluteSellPrice ?? 0}/bbl`,
                passed: isPass,
                reason: isPass ? 'Valuation within $0-$75 bounds' : (!buyOk ? 'Buy price out of bounds ($0-$75)' : 'Sell price out of bounds ($0-$75)')
              });
            });

            const score = (passedAccuracy / jarvisCount) * 100;
            rulesEvaluated.push({
              ruleName: 'Jarvis Pricing Valuation Bounds',
              dataset: 'Jarvis',
              checked: jarvisCount,
              passed: passedAccuracy,
              score: Math.round(score * 10) / 10,
              sampleData
            });
          }

          if (dim.id === 'consistency') {
            let passedConsistency = 0;
            const sampleData: RuleSampleRecord[] = [];

            activeProfiles.forEach(p => {
              const fobOk = p.incoterms !== 'FOB' || (!p.srcUnitFee && !p.reconciledSrcCost);
              const desOk = p.incoterms !== 'DES' || ((p.srcUnitFee ?? 0) > 0 || (p.reconciledSrcCost ?? 0) > 0);
              const isPass = fobOk && desOk;
              if (isPass) passedConsistency++;

              sampleData.push({
                id: p.id,
                strategyName: p.strategyName || 'Unnamed Strategy',
                checkedField: 'Incoterm vs SRC Unit Fee / Freight Cost',
                valueDisplay: `Incoterm: ${p.incoterms || 'DES'} | SRC Fee: $${p.srcUnitFee ?? 0} | Reconciled Cost: $${p.reconciledSrcCost ?? 0}`,
                passed: isPass,
                reason: isPass ? 'Freight SRC cost matches Incoterm rule' : (p.incoterms === 'FOB' ? 'FOB cargo should not carry SRC freight cost' : 'DES cargo requires SRC freight cost (>0)')
              });
            });

            const score = (passedConsistency / jarvisCount) * 100;
            rulesEvaluated.push({
              ruleName: 'Jarvis Incoterm Freight Alignment',
              dataset: 'Jarvis',
              checked: jarvisCount,
              passed: passedConsistency,
              score: Math.round(score * 10) / 10,
              sampleData
            });
          }

          if (dim.id === 'uniqueness') {
            const nameCounts = new Map<string, number>();
            activeProfiles.forEach(p => {
              const n = (p.strategyName || '').trim().toLowerCase();
              if (n) nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
            });
            let uniqueCount = 0;
            const sampleData: RuleSampleRecord[] = [];

            activeProfiles.forEach(p => {
              const n = (p.strategyName || '').trim().toLowerCase();
              const count = nameCounts.get(n) || 0;
              const isPass = n !== '' && count === 1;
              if (isPass) uniqueCount++;

              sampleData.push({
                id: p.id,
                strategyName: p.strategyName || 'Unnamed Strategy',
                checkedField: 'Strategy Title Uniqueness',
                valueDisplay: `Strategy Title: "${p.strategyName || ''}"`,
                passed: isPass,
                reason: isPass ? 'Unique strategy reference' : `Duplicate name detected (${count} instances)`
              });
            });

            const score = (uniqueCount / jarvisCount) * 100;
            rulesEvaluated.push({
              ruleName: 'Jarvis Strategy Uniqueness',
              dataset: 'Jarvis',
              checked: jarvisCount,
              passed: uniqueCount,
              score: Math.round(score * 10) / 10,
              sampleData
            });
          }

          if (dim.id === 'timeliness') {
            const checkedDates = activeProfiles.filter(p => p.loadingDate && p.deliveryDate).length;
            if (checkedDates > 0) {
              let passedDates = 0;
              const sampleData: RuleSampleRecord[] = [];

              activeProfiles.forEach(p => {
                let isPass = false;
                let reason = 'Unspecified date(s)';
                if (p.loadingDate && p.deliveryDate) {
                  const l = new Date(p.loadingDate);
                  const d = new Date(p.deliveryDate);
                  if (!isNaN(l.getTime()) && !isNaN(d.getTime())) {
                    isPass = l.getTime() <= d.getTime();
                    reason = isPass ? 'Loading precedes delivery' : 'Loading date is set AFTER delivery date';
                  }
                }
                if (isPass) passedDates++;

                sampleData.push({
                  id: p.id,
                  strategyName: p.strategyName || 'Unnamed Strategy',
                  checkedField: 'Loading Date <= Delivery Date',
                  valueDisplay: `Loading: ${p.loadingDate || 'N/A'} | Delivery: ${p.deliveryDate || 'N/A'}`,
                  passed: isPass,
                  reason
                });
              });

              const score = (passedDates / checkedDates) * 100;
              rulesEvaluated.push({
                ruleName: 'Jarvis Loading/Delivery Date Sequence',
                dataset: 'Jarvis',
                checked: checkedDates,
                passed: passedDates,
                score: Math.round(score * 10) / 10,
                sampleData
              });
            }
          }
        }
      }

      // Evaluate TRMS rules if TRMS or All selected
      if (selectedDataset === 'TRMS' || selectedDataset === 'All') {
        const trmsCount = trmsStrategies.length;
        if (trmsCount > 0) {
          if (dim.id === 'completeness') {
            let trmsPopulated = 0;
            const sampleData: RuleSampleRecord[] = [];
            trmsStrategies.forEach(s => {
              const isPass = Boolean(s.strategyName && s.volumeType && s.priceStatus && s.loadingDate);
              if (isPass) trmsPopulated++;
              sampleData.push({
                id: s.id,
                strategyName: s.strategyName,
                checkedField: 'Mandatory TRMS Strategy Attributes',
                valueDisplay: `Vol: "${s.volumeType || ''}", Status: "${s.priceStatus || ''}", Loading: ${s.loadingDate || 'N/A'}`,
                passed: isPass,
                reason: isPass ? 'TRMS record complete' : 'Missing required TRMS attributes'
              });
            });
            const score = (trmsPopulated / trmsCount) * 100;
            rulesEvaluated.push({
              ruleName: 'TRMS Mandatory Attributes Check',
              dataset: 'TRMS',
              checked: trmsCount,
              passed: trmsPopulated,
              score: Math.round(score * 10) / 10,
              sampleData
            });
          }

          if (dim.id === 'accuracy') {
            let trmsPriced = 0;
            const sampleData: RuleSampleRecord[] = [];
            trmsStrategies.forEach(s => {
              const isPass = s.priceStatus !== 'unpriced';
              if (isPass) trmsPriced++;
              sampleData.push({
                id: s.id,
                strategyName: s.strategyName,
                checkedField: 'TRMS Price Settlement Status',
                valueDisplay: `Price Status: "${s.priceStatus}"`,
                passed: isPass,
                reason: isPass ? 'Priced/Settled trade' : 'Unpriced status in TRMS'
              });
            });
            const score = (trmsPriced / trmsCount) * 100;
            rulesEvaluated.push({
              ruleName: 'TRMS Price Status Settlement Check',
              dataset: 'TRMS',
              checked: trmsCount,
              passed: trmsPriced,
              score: Math.round(score * 10) / 10,
              sampleData
            });
          }

          if (dim.id === 'consistency') {
            const jarvisSet = new Set(activeProfiles.map(p => (p.strategyName || '').trim().toLowerCase()));
            let matched = 0;
            const sampleData: RuleSampleRecord[] = [];
            trmsStrategies.forEach(s => {
              const isPass = jarvisSet.has((s.strategyName || '').trim().toLowerCase());
              if (isPass) matched++;
              sampleData.push({
                id: s.id,
                strategyName: s.strategyName,
                checkedField: 'TRMS vs Jarvis Strategy Title Matching',
                valueDisplay: `TRMS Strategy: "${s.strategyName}"`,
                passed: isPass,
                reason: isPass ? 'Strategy title exists in Jarvis dataset' : 'Strategy title missing in Jarvis'
              });
            });
            const score = (matched / trmsCount) * 100;
            rulesEvaluated.push({
              ruleName: 'TRMS Cross-System Strategy Alignment',
              dataset: 'TRMS',
              checked: trmsCount,
              passed: matched,
              score: Math.round(score * 10) / 10,
              sampleData
            });
          }

          if (dim.id === 'timeliness') {
            const checkedWindow = trmsStrategies.filter(s => s.loadingDate && s.commWindowEndDate).length;
            if (checkedWindow > 0) {
              let windowOk = 0;
              const sampleData: RuleSampleRecord[] = [];
              trmsStrategies.forEach(s => {
                let isPass = false;
                let reason = 'Missing date/window end';
                if (s.loadingDate && s.commWindowEndDate) {
                  const l = new Date(s.loadingDate);
                  const w = new Date(s.commWindowEndDate);
                  if (!isNaN(l.getTime()) && !isNaN(w.getTime())) {
                    isPass = l.getTime() <= w.getTime();
                    reason = isPass ? 'Within commencement window' : 'Loading date exceeds window end';
                  }
                }
                if (isPass) windowOk++;
                sampleData.push({
                  id: s.id,
                  strategyName: s.strategyName,
                  checkedField: 'Loading Date <= Commencement Window End',
                  valueDisplay: `Loading: ${s.loadingDate || 'N/A'} | Comm Window End: ${s.commWindowEndDate || 'N/A'}`,
                  passed: isPass,
                  reason
                });
              });
              const score = (windowOk / checkedWindow) * 100;
              rulesEvaluated.push({
                ruleName: 'TRMS Commencement Window Freshness',
                dataset: 'TRMS',
                checked: checkedWindow,
                passed: windowOk,
                score: Math.round(score * 10) / 10,
                sampleData
              });
            }
          }
        }
      }

      // Evaluate Custom Rules for this dimension
      customRules.filter(r => r.enabled).forEach(r => {
        const ds = r.targetDataset || 'Jarvis';
        if (selectedDataset !== 'All' && ds !== selectedDataset) return;

        const ruleDimInfo = CATEGORY_TO_DIMENSION_MAP[r.category] || { id: 'validity', name: 'Validity' };
        if (ruleDimInfo.id !== dim.id) return;

        let checked = 0;
        let passed = 0;
        const sampleData: RuleSampleRecord[] = [];
        const fieldsSource = ds === 'TRMS' ? TRMS_PROFILE_FIELDS : CARGO_PROFILE_FIELDS;
        const fieldLabel = fieldsSource.find(f => f.value === r.field)?.label || r.field;

        if (ds === 'TRMS') {
          checked = trmsStrategies.length;
          if (checked > 0) {
            trmsStrategies.forEach(s => {
              const evalRes = evaluateRuleForRecord(s, r, TRMS_PROFILE_FIELDS);
              const isPass = !evalRes.isViolation;
              if (isPass) passed++;
              const rawVal = (s as any)[r.field];
              sampleData.push({
                id: s.id,
                strategyName: s.strategyName,
                checkedField: `${r.name} (${fieldLabel})`,
                valueDisplay: `${fieldLabel}: ${rawVal !== undefined && rawVal !== null && rawVal !== '' ? rawVal : 'Unpopulated'}`,
                passed: isPass,
                reason: isPass ? 'Satisfies required rule specification' : (evalRes.message || 'Violates custom rule condition')
              });
            });
          }
        } else {
          checked = activeProfiles.length;
          if (checked > 0) {
            activeProfiles.forEach(p => {
              const evalRes = evaluateRuleForRecord(p, r, CARGO_PROFILE_FIELDS);
              const isPass = !evalRes.isViolation;
              if (isPass) passed++;
              const rawVal = (p as any)[r.field];
              sampleData.push({
                id: p.id,
                strategyName: p.strategyName || 'Unnamed Strategy',
                checkedField: `${r.name} (${fieldLabel})`,
                valueDisplay: `${fieldLabel}: ${rawVal !== undefined && rawVal !== null && rawVal !== '' ? rawVal : 'Unpopulated'}`,
                passed: isPass,
                reason: isPass ? 'Satisfies required rule specification' : (evalRes.message || 'Violates custom rule condition')
              });
            });
          }
        }

        if (checked > 0) {
          const score = (passed / checked) * 100;
          rulesEvaluated.push({
            ruleName: `[Custom] ${r.name}`,
            dataset: ds,
            checked,
            passed,
            score: Math.round(score * 10) / 10,
            sampleData
          });
        }
      });

      // Step 3: If no DQ rule is defined, mark as "N/A" (Not Assessed)
      if (rulesEvaluated.length === 0) {
        return {
          id: dim.id,
          name: dim.name,
          score: null,
          isAssessed: false,
          definition: dim.definition,
          formula: dim.formula,
          breakdown: `Not Assessed (No active rules defined for ${selectedDataset})`,
          details: dim.details,
          ruleBreakdowns: []
        };
      }

      // Step 2: Dimension Score = Average of all rule scores within that dimension
      const sumScores = rulesEvaluated.reduce((acc, curr) => acc + curr.score, 0);
      const avgScore = Math.round((sumScores / rulesEvaluated.length) * 10) / 10;

      return {
        id: dim.id,
        name: dim.name,
        score: avgScore,
        isAssessed: true,
        definition: dim.definition,
        formula: dim.formula,
        breakdown: `${rulesEvaluated.length} rule${rulesEvaluated.length > 1 ? 's' : ''} evaluated (${rulesEvaluated.map(r => `${r.score}%`).join(', ')})`,
        details: dim.details,
        ruleBreakdowns: rulesEvaluated
      };
    });
  }, [profiles, customRules, selectedDataset, trmsStrategies]);

  // Step 4: Overall DQ Score = Average of all assessed dimension scores (excluding N/A dimensions)
  const overallDQScoreInfo = useMemo(() => {
    const assessed = dqDimensions.filter(d => d.isAssessed && d.score !== null);
    if (assessed.length === 0) {
      return { score: 100, assessedCount: 0, text: 'N/A' };
    }
    const sum = assessed.reduce((acc, curr) => acc + (curr.score || 0), 0);
    const avg = Math.round((sum / assessed.length) * 10) / 10;
    return {
      score: avg,
      assessedCount: assessed.length,
      text: `${avg}%`
    };
  }, [dqDimensions]);

  // Derived statistics
  const stats = useMemo(() => {
    const errors = qualityIssues.filter(i => i.type === 'error').length;
    const warnings = qualityIssues.filter(i => i.type === 'warning').length;
    const infos = qualityIssues.filter(i => i.type === 'info').length;

    return {
      errors,
      warnings,
      infos,
      total: qualityIssues.length,
      healthScore: overallDQScoreInfo.score
    };
  }, [qualityIssues, overallDQScoreInfo]);

  // Filter custom rules for the Custom Rule Inventory search/filter
  const filteredCustomRules = useMemo(() => {
    return customRules.filter(r => {
      const q = ruleSearchTerm.toLowerCase().trim();
      const matchesSearch = !q || 
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.field.toLowerCase().includes(q);
      const matchesDataset = ruleDatasetFilter === 'all' || r.targetDataset === ruleDatasetFilter;
      return matchesSearch && matchesDataset;
    });
  }, [customRules, ruleSearchTerm, ruleDatasetFilter]);

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
  const [ruleField, setRuleField] = useState('reconciledSrcCost');
  const [ruleCondition, setRuleCondition] = useState<'empty' | 'notEmpty' | 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual' | 'equals' | 'notEquals' | 'contains' | 'dateAfterField' | 'dateBeforeField' | 'mathCompare'>('greaterThan');
  const [ruleValue, setRuleValue] = useState('0');
  const [ruleCompareField, setRuleCompareField] = useState('loadingDate');
  const [ruleSeverity, setRuleSeverity] = useState<'error' | 'warning' | 'info'>('warning');
  const [ruleIntent, setRuleIntent] = useState<'requirement' | 'violation'>('requirement');

  // Math & Column-to-Column comparison states
  const [useLhsAbs, setUseLhsAbs] = useState(false);
  const [lhsMultiplier, setLhsMultiplier] = useState('1');
  const [lhsOffset, setLhsOffset] = useState('0');
  const [lhsTransform, setLhsTransform] = useState<'none' | 'abs' | 'add' | 'subtract' | 'multiply' | 'power'>('none');
  const [lhsTransformValue, setLhsTransformValue] = useState('');

  const [rhsType, setRhsType] = useState<'constant' | 'field'>('constant');
  const [rhsField, setRhsField] = useState('absoluteBuyPrice');
  const [useRhsAbs, setUseRhsAbs] = useState(false);
  const [rhsMultiplier, setRhsMultiplier] = useState('1.2');
  const [rhsOffset, setRhsOffset] = useState('0');
  const [rhsTransform, setRhsTransform] = useState<'none' | 'abs' | 'add' | 'subtract' | 'multiply' | 'power'>('none');
  const [rhsTransformValue, setRhsTransformValue] = useState('');
  const [mathOperator, setMathOperator] = useState<'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual' | 'equals' | 'notEquals' | 'percentDiffGreaterThan' | 'percentDiffLessThan'>('greaterThan');

  // handlers
  const handleOpenCreateRule = () => {
    setEditingRuleId(null);
    setRuleDataset('Jarvis');
    setRuleName('');
    setRuleDescription('');
    setRuleCategory('Shipping & SRC');
    setRuleField('reconciledSrcCost');
    setRuleCondition('greaterThan');
    setRuleValue('0');
    setRuleCompareField('loadingDate');
    setRuleSeverity('warning');
    setRuleIntent('requirement');
    
    setUseLhsAbs(false);
    setLhsMultiplier('1');
    setLhsOffset('0');
    setLhsTransform('none');
    setLhsTransformValue('');

    setRhsType('constant');
    setRhsField('deliveredVolume');
    setUseRhsAbs(false);
    setRhsMultiplier('1.2');
    setRhsOffset('0');
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
    setRuleIntent(rule.ruleIntent || 'violation');
    
    setUseLhsAbs(rule.useLhsAbs || rule.lhsTransform === 'abs');
    setLhsMultiplier(String(rule.lhsMultiplier ?? 1));
    setLhsOffset(String(rule.lhsOffset ?? 0));
    setLhsTransform(rule.lhsTransform || 'none');
    setLhsTransformValue(rule.lhsTransformValue || '');

    setRhsType(rule.rhsType || 'constant');
    setRhsField(rule.rhsField || (rule.targetDataset === 'TRMS' ? 'commodityValue' : 'absoluteBuyPrice'));
    setUseRhsAbs(rule.useRhsAbs || rule.rhsTransform === 'abs');
    setRhsMultiplier(String(rule.rhsMultiplier ?? 1));
    setRhsOffset(String(rule.rhsOffset ?? 0));
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
      compareField: (ruleCondition === 'dateAfterField' || ruleCondition === 'dateBeforeField') ? ruleCompareField : undefined,
      severity: ruleSeverity,
      enabled: true,
      ruleIntent,

      useLhsAbs,
      lhsMultiplier: Number(lhsMultiplier) || 1,
      lhsOffset: Number(lhsOffset) || 0,
      lhsTransform: ruleCondition === 'mathCompare' ? lhsTransform : undefined,
      lhsTransformValue: ruleCondition === 'mathCompare' ? lhsTransformValue : undefined,

      rhsType: ruleCondition === 'mathCompare' ? rhsType : undefined,
      rhsField: ruleCondition === 'mathCompare' ? rhsField : undefined,
      useRhsAbs,
      rhsMultiplier: Number(rhsMultiplier) || 1,
      rhsOffset: Number(rhsOffset) || 0,
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

  const handleGenerateAiRule = async (promptToUse?: string) => {
    const query = (promptToUse || aiPrompt).trim();
    if (!query) {
      toast.error("Please enter a rule description first.");
      return;
    }

    const now = Date.now();
    if (now - lastAiRequestTime < 60000 && aiRateLimitCount >= 5) {
      toast.error("Rate limit reached (max 5 requests/min). Please wait a moment before trying again.");
      return;
    }

    setIsGeneratingRule(true);
    setAiGeneratedRulePreview(null);

    try {
      const generatedRule = await generateCustomRuleFromPrompt(query, customApiKey);
      setAiGeneratedRulePreview(generatedRule);
      toast.success("AI successfully created your custom rule preview!");

      setLastAiRequestTime(now);
      setAiRateLimitCount(prev => (now - lastAiRequestTime < 60000 ? prev + 1 : 1));
    } catch (error: any) {
      console.error("AI Rule Generation error:", error);
      toast.error(error.message || "Failed to generate AI rule. Check prompt or API key.");
    } finally {
      setIsGeneratingRule(false);
    }
  };

  const handleAcceptAiGeneratedRule = () => {
    if (!aiGeneratedRulePreview) return;
    setCustomRules(prev => [aiGeneratedRulePreview, ...prev]);
    toast.success(`Rule "${aiGeneratedRulePreview.name}" registered to inventory!`);
    setIsAiRuleModalOpen(false);
    setAiGeneratedRulePreview(null);
    setAiPrompt('');
  };

  const handleEditAiRuleInForm = () => {
    if (!aiGeneratedRulePreview) return;
    handleOpenEditRule(aiGeneratedRulePreview);
    setIsAiRuleModalOpen(false);
  };

  const handleSaveApiKey = (key: string) => {
    setCustomApiKey(key);
    if (key.trim()) {
      localStorage.setItem('user_gemini_api_key', key.trim());
      toast.success("Personal Gemini API key saved locally!");
    } else {
      localStorage.removeItem('user_gemini_api_key');
      toast.success("Cleared personal API key. Using default system key.");
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50/40 p-4 lg:p-6 overflow-y-auto">
      {/* Dataset Scope Switcher Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 shadow-xs mb-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse" />
          <div>
            <span className="text-xs font-black uppercase text-slate-800 tracking-wider block">
              Active Evaluation Scope: {selectedDataset} Dataset
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              Toggle evaluation dataset rules and dimensions between TRMS & Jarvis
            </span>
          </div>
        </div>
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/70 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setSelectedDataset('Jarvis')}
            className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${
              selectedDataset === 'Jarvis'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            Jarvis ({profiles.filter(p => !p.deleted).length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedDataset('TRMS')}
            className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${
              selectedDataset === 'TRMS'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            TRMS ({trmsStrategies.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedDataset('All')}
            className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${
              selectedDataset === 'All'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            All Datasets
          </button>
        </div>
      </div>

      {/* Top Health Analytics Dashboard Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        
        {/* Health Gauge Card (Clicking resets both filters) */}
        <div 
          onClick={() => { setSelectedTypeFilter('all'); setSelectedCategoryFilter('all'); }}
          className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex items-center justify-between col-span-1 md:col-span-2 cursor-pointer hover:border-indigo-400 group transition-all"
          title="Click to reset filters and view all indicators"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block group-hover:text-indigo-500 transition-colors">
                System Integrity & DQ Score
              </span>
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[9px] font-bold rounded-md border border-indigo-100">
                {selectedDataset} Scope
              </span>
            </div>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight group-hover:text-indigo-950 transition-colors">
              Overall DQ Score: {overallDQScoreInfo.text}
            </h3>
            <p className="text-[11px] text-slate-500 max-w-xs pr-2 leading-relaxed">
              Calculated as the average of all assessed Data Quality dimension scores ({overallDQScoreInfo.assessedCount}/6 assessed; excluding N/A dimensions).
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
              }`}>{overallDQScoreInfo.text}</span>
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

      {/* 6 Data Quality Dimensions Section */}
      <div className="mb-6 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-wider rounded-md border border-indigo-200/60">
                Data Quality Standard
              </span>
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                6 Data Quality Dimensions
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Real-time scores calculated using industry standard formulas for Completeness, Validity, Accuracy, Consistency, Uniqueness, and Timeliness.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
          {dqDimensions.map((dim, idx) => {
            const hasScore = dim.isAssessed && dim.score !== null;
            const scoreVal = dim.score ?? 0;
            const isEmerald = hasScore && scoreVal >= 90;
            const isIndigo = hasScore && scoreVal >= 80 && scoreVal < 90;
            const isAmber = hasScore && scoreVal >= 70 && scoreVal < 80;

            const badgeBg = !hasScore ? 'bg-slate-100 text-slate-500 border-slate-200' :
                            isEmerald ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            isIndigo ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                            isAmber ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-rose-50 text-rose-700 border-rose-200';

            const barBg = !hasScore ? 'bg-slate-300' :
                          isEmerald ? 'bg-emerald-500' :
                          isIndigo ? 'bg-indigo-500' :
                          isAmber ? 'bg-amber-500' :
                          'bg-rose-500';

            return (
              <div
                key={dim.id}
                onClick={() => setSelectedDimensionModal(dim.id)}
                className="bg-slate-50/70 hover:bg-white border border-slate-200/80 hover:border-indigo-300 rounded-xl p-3.5 flex flex-col justify-between transition-all shadow-2xs hover:shadow-md cursor-pointer group"
                title="Click to view detailed calculation formula breakdown"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
                      0{idx + 1}. {dim.name}
                    </span>
                    <span className={`px-1.5 py-0.5 text-[9px] font-black font-mono rounded border ${badgeBg}`}>
                      {hasScore ? `${dim.score}%` : 'N/A'}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mb-2">
                    <div
                      className={`h-full ${barBg} transition-all duration-700 ease-out`}
                      style={{ width: `${hasScore ? scoreVal : 0}%` }}
                    />
                  </div>

                  <p className="text-[10px] text-slate-600 font-medium leading-snug line-clamp-2 group-hover:text-slate-900 transition-colors">
                    {dim.definition}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[9px]">
                  <span className="font-mono text-slate-400 font-semibold truncate pr-1" title={dim.breakdown}>
                    {dim.breakdown}
                  </span>
                  <span className="text-indigo-600 group-hover:translate-x-0.5 transition-transform font-bold shrink-0">
                    Details →
                  </span>
                </div>
              </div>
            );
          })}
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
            {/* Control Filters Bar & Expansion Toggle */}
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

              <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                {/* Severity filter pills */}
                <div className="flex bg-slate-100 p-1 rounded-xl gap-1 w-full sm:w-auto">
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

                {/* View Expansion Toggle Button */}
                <button
                  type="button"
                  onClick={() => setIsDiagnosticExpanded(!isDiagnosticExpanded)}
                  className="px-3.5 py-2 text-xs font-black text-slate-700 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-xs shrink-0 w-full sm:w-auto"
                >
                  <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d={isDiagnosticExpanded ? "M19 9l-7 7-7-7" : "M4 8h16M4 16h16"} />
                  </svg>
                  {isDiagnosticExpanded ? "Standard Size" : "Enlarge Diagnostic View"}
                </button>
              </div>
            </div>

            {/* Issues list container - Enlarged for high visibility */}
            <div className={`bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm flex flex-col transition-all duration-300 ${
              isDiagnosticExpanded ? 'min-h-[750px] max-h-[1000px]' : 'min-h-[480px] max-h-[650px]'
            }`}>
              <div className="px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                  <span className="text-xs font-black uppercase tracking-wider">
                    Diagnosed Operational Issues & System Anomalies
                  </span>
                  <span className="px-2 py-0.5 bg-white/10 text-white font-mono text-[10px] font-bold rounded-md">
                    Showing {filteredIssues.length} of {qualityIssues.length} issues
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-medium">
                  Dataset Scope: <strong className="text-indigo-300">{selectedDataset}</strong>
                </span>
              </div>

              {filteredIssues.length > 0 ? (
                <div className="overflow-x-auto flex-1 overflow-y-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                        <th className="px-6 py-4 text-[10px] font-black text-slate-600 uppercase tracking-widest w-28">Severity</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-600 uppercase tracking-widest w-56">Cargo Strategy / System</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-600 uppercase tracking-widest w-52">Category & Target Field</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-600 uppercase tracking-widest">Diagnosed Issue Description & Root Cause</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-600 uppercase tracking-widest w-28 text-right">Action</th>
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
                            className="hover:bg-indigo-50/50 active:bg-indigo-100/40 transition-all cursor-pointer group/row"
                            title="Click anywhere on this row to open resolution editor"
                          >
                            {/* Severity badge */}
                            <td className="px-6 py-4 align-top whitespace-nowrap">
                              {issue.type === 'error' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-200 rounded-lg uppercase tracking-wide group-hover/row:bg-rose-100 transition-colors shadow-2xs">
                                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                                  CRITICAL
                                </span>
                              )}
                              {issue.type === 'warning' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 rounded-lg uppercase tracking-wide group-hover/row:bg-amber-100 transition-colors shadow-2xs">
                                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                                  WARNING
                                </span>
                              )}
                              {issue.type === 'info' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-black text-blue-700 bg-blue-50 border border-blue-200 rounded-lg uppercase tracking-wide group-hover/row:bg-blue-100 transition-colors shadow-2xs">
                                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                                  ADVISORY
                                </span>
                              )}
                            </td>

                            {/* Cargo Strategy with hovering edit prompt */}
                            <td className="px-6 py-4 align-top">
                              <span className="text-sm font-bold text-slate-900 tracking-tight block max-w-[200px] truncate group-hover/row:text-indigo-600 transition-colors" title={issue.cargoName}>
                                {issue.cargoName}
                              </span>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[10px] text-slate-400 font-mono block">ID: {issue.cargoId}</span>
                                <span className="opacity-0 group-hover/row:opacity-100 text-[9px] text-indigo-600 font-black uppercase transition-opacity">
                                  (click to resolve)
                                </span>
                              </div>
                            </td>

                            {/* Category & Field with interactive tags */}
                            <td className="px-6 py-4 align-top whitespace-nowrap">
                              <span 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCategoryFilter(issue.category);
                                }}
                                className="text-xs font-black text-slate-700 hover:text-indigo-600 uppercase tracking-wide block cursor-zoom-in"
                                title="Click to filter by this category"
                              >
                                {issue.category} 🔍
                              </span>
                              <span className="inline-block mt-1 px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md text-[10px] text-slate-700 font-bold font-mono">
                                {issue.field}
                              </span>
                            </td>

                            {/* Detail Message */}
                            <td className="px-6 py-4 align-top">
                              <p className="text-xs text-slate-800 font-medium leading-relaxed max-w-2xl group-hover/row:text-indigo-950 transition-colors">
                                {issue.message}
                              </p>
                            </td>

                            {/* Actions */}
                            <td className="px-6 py-4 align-top text-right whitespace-nowrap">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditCargoClick(issue.cargoId);
                                }}
                                className="px-3.5 py-1.5 text-xs font-extrabold text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 border border-indigo-200 rounded-xl transition-all flex items-center justify-center gap-1 shadow-2xs group-hover/row:scale-105"
                              >
                                Resolve →
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
            className="flex-1 flex flex-col min-h-[600px] bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm mb-6"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5 border-b border-slate-100 pb-5">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-800 tracking-tight">Custom Rule Inventory</h3>
                  <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase rounded-md border border-indigo-200/60 font-mono">
                    {customRules.length} Rules
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 max-w-xl mt-1 leading-relaxed">
                  Configure real-time quality limits applied automatically to strategies. Toggling rules instantly refreshes active diagnostics, system health status, and warnings.
                </p>
              </div>
              <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0 flex-wrap">
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
                  onClick={() => {
                    setIsAiRuleModalOpen(true);
                    setAiGeneratedRulePreview(null);
                  }}
                  className="px-4 py-2 text-[10px] font-black text-white bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 rounded-xl uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md hover:shadow-indigo-500/25 active:scale-98"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>✨ Create Rule with AI</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenCreateRule}
                  className="px-4 py-2 text-[10px] font-black text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 rounded-xl uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-xs active:scale-98"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  Manual Rule
                </button>
              </div>
            </div>

            {/* Filter and search bar for Custom Rule Inventory */}
            <div className="bg-slate-50/80 border border-slate-200/70 rounded-xl p-3 mb-4 flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto flex-1">
                <div className="relative w-full sm:w-72">
                  <input
                    type="text"
                    placeholder="Search defined rules (e.g. price, volume, date...)"
                    value={ruleSearchTerm}
                    onChange={(e) => setRuleSearchTerm(e.target.value)}
                    className="w-full text-xs font-semibold px-8 py-1.5 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none"
                  />
                  <svg className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {ruleSearchTerm && (
                    <button onClick={() => setRuleSearchTerm('')} className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 self-start sm:self-auto">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Dataset:</span>
                  <div className="flex bg-white border border-slate-200 p-0.5 rounded-lg">
                    {[
                      { id: 'all', label: 'All Datasets' },
                      { id: 'Jarvis', label: 'Jarvis' },
                      { id: 'TRMS', label: 'TRMS' }
                    ].map((ds) => (
                      <button
                        key={ds.id}
                        type="button"
                        onClick={() => setRuleDatasetFilter(ds.id as any)}
                        className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md transition-all ${
                          ruleDatasetFilter === ds.id
                            ? 'bg-slate-900 text-white shadow-2xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {ds.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-auto text-[10px] font-mono font-extrabold text-slate-500">
                <span className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md">
                  Active: {customRules.filter(r => r.enabled).length}
                </span>
                <span className="px-2 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-md">
                  Disabled: {customRules.filter(r => !r.enabled).length}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto min-h-[420px] flex-1">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest sticky top-0 bg-white z-10">
                    <th className="px-5 py-3 w-16 text-center">Status</th>
                    <th className="px-5 py-3 w-28">Severity</th>
                    <th className="px-5 py-3">Rule Name & Details</th>
                    <th className="px-5 py-3 w-40">Target Category</th>
                    <th className="px-5 py-3">Formulation Condition</th>
                    <th className="px-5 py-3 w-24 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCustomRules.map((rule) => {
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

                        {/* Category & Affected DQ Dimension */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 font-extrabold rounded-md text-[9px] uppercase tracking-wide inline-block w-fit">
                              {rule.category}
                            </span>
                            <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-200/80 text-indigo-700 font-extrabold rounded-md text-[9px] uppercase tracking-wide inline-flex items-center gap-1 w-fit shadow-2xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                              Impacts: {CATEGORY_TO_DIMENSION_MAP[rule.category]?.name || 'Validity'}
                            </span>
                          </div>
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
                          setRuleField('trmsPurchaseValue');
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

                {/* Interactive Dataset Column Explorer & Quick Rule Templates */}
                <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-slate-600 tracking-wider flex items-center gap-1.5">
                      <span>📋 Available {ruleDataset} Columns</span>
                      <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px] font-bold">
                        {(ruleDataset === 'TRMS' ? TRMS_PROFILE_FIELDS : CARGO_PROFILE_FIELDS).length} Columns
                      </span>
                    </span>
                    <span className="text-[9px] text-slate-400 font-bold">Click to select as Target Field</span>
                  </div>

                  {/* Column Pills */}
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 bg-white rounded-xl border border-slate-200/60">
                    {(ruleDataset === 'TRMS' ? TRMS_PROFILE_FIELDS : CARGO_PROFILE_FIELDS).map(col => {
                      const isLhsSelected = ruleField === col.value;
                      const isRhsSelected = ruleCondition === 'mathCompare' && rhsField === col.value;
                      return (
                        <button
                          key={col.value}
                          type="button"
                          onClick={() => {
                            setRuleField(col.value);
                            toast.success(`Target field set to "${col.label}" (${col.value})`);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all text-left flex items-center gap-1.5 ${
                            isLhsSelected
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                              : isRhsSelected
                              ? 'bg-purple-100 border-purple-300 text-purple-800 font-extrabold'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200'
                          }`}
                          title={col.description}
                        >
                          <span>{col.label}</span>
                          <span className={`text-[8.5px] font-mono px-1 rounded ${isLhsSelected ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
                            {col.value}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected Column Description Hint */}
                  {(() => {
                    const selCol = (ruleDataset === 'TRMS' ? TRMS_PROFILE_FIELDS : CARGO_PROFILE_FIELDS).find(f => f.value === ruleField);
                    if (!selCol) return null;
                    return (
                      <div className="text-[10px] text-indigo-900 bg-indigo-50/80 border border-indigo-100 p-2 rounded-xl flex items-center gap-2">
                        <span className="shrink-0 font-bold">💡 Active Target Column:</span>
                        <span className="font-semibold text-slate-700">{selCol.label} (<code className="font-mono text-indigo-700">{selCol.value}</code>) &mdash; {selCol.description}</span>
                      </div>
                    );
                  })()}

                  {/* Quick One-Click Formula Presets */}
                  <div className="pt-2 border-t border-slate-200/60">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">
                      ⚡ Quick One-Click Rule Templates ({ruleDataset}):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {ruleDataset === 'TRMS' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setRuleName('TRMS Purchase Volume vs Sales Volume Match');
                              setRuleDescription('Verifies that TRMS Purchase Leg Volume equals Sales Leg Volume for the strategy.');
                              setRuleCategory('Quantity Validation');
                              setRuleSeverity('error');
                              setRuleIntent('requirement');
                              setRuleField('trmsPurchaseValue');
                              setRuleCondition('mathCompare');
                              setRhsType('field');
                              setRhsField('trmsSalesValue');
                              setMathOperator('equals');
                              setLhsMultiplier('1');
                              setRhsMultiplier('1');
                              toast.success('Loaded template: Purchase Volume vs Sales Volume!');
                            }}
                            className="px-2.5 py-1 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 border border-indigo-200 rounded-lg text-[10px] font-extrabold text-indigo-800 transition-all shadow-xs"
                          >
                            ⚖️ Purchase Vol == Sales Vol
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRuleName('TRMS SRC Shipping Cost Limit (<= $0)');
                              setRuleDescription('Requires TRMS shipping/SRC allocation cost to be zero or negative.');
                              setRuleCategory('Shipping & SRC');
                              setRuleSeverity('error');
                              setRuleIntent('requirement');
                              setRuleField('srcValue');
                              setRuleCondition('lessThanOrEqual');
                              setRuleValue('0');
                              toast.success('Loaded template: TRMS SRC Cost <= 0!');
                            }}
                            className="px-2.5 py-1 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 border border-indigo-200 rounded-lg text-[10px] font-extrabold text-indigo-800 transition-all shadow-xs"
                          >
                            🚢 SRC Cost &le; $0
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRuleName('TRMS Loading Date Before Delivery Date');
                              setRuleDescription('TRMS loading date must chronologically precede delivery date.');
                              setRuleCategory('Date Validation');
                              setRuleSeverity('error');
                              setRuleIntent('requirement');
                              setRuleField('loadingDate');
                              setRuleCondition('dateBeforeField');
                              setRuleCompareField('deliveryDate');
                              toast.success('Loaded template: Loading Date Before Delivery Date!');
                            }}
                            className="px-2.5 py-1 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 border border-indigo-200 rounded-lg text-[10px] font-extrabold text-indigo-800 transition-all shadow-xs"
                          >
                            {"📅 Loading < Delivery Date"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRuleName('Flag Unpriced TRMS Strategies');
                              setRuleDescription('Alerts if TRMS strategy priceStatus is unpriced.');
                              setRuleCategory('Pricing & Valuations');
                              setRuleSeverity('warning');
                              setRuleIntent('violation');
                              setRuleField('priceStatus');
                              setRuleCondition('equals');
                              setRuleValue('unpriced');
                              toast.success('Loaded template: Flag Unpriced TRMS Strategies!');
                            }}
                            className="px-2.5 py-1 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 border border-indigo-200 rounded-lg text-[10px] font-extrabold text-indigo-800 transition-all shadow-xs"
                          >
                            ⚠️ Price Status == unpriced
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setRuleName('Jarvis Loaded Buy Volume vs Delivered Volume');
                              setRuleDescription('Compares physical loaded buy volume against delivered sell volume in Jarvis.');
                              setRuleCategory('Quantity Validation');
                              setRuleSeverity('error');
                              setRuleIntent('requirement');
                              setRuleField('loadedVolume');
                              setRuleCondition('mathCompare');
                              setRhsType('field');
                              setRhsField('deliveredVolume');
                              setMathOperator('equals');
                              toast.success('Loaded template: Loaded Volume vs Delivered Volume!');
                            }}
                            className="px-2.5 py-1 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 border border-indigo-200 rounded-lg text-[10px] font-extrabold text-indigo-800 transition-all shadow-xs"
                          >
                            ⚖️ Loaded Vol == Delivered Vol
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRuleName('Jarvis Reconciled Shipping Cost (<= $0)');
                              setRuleDescription('Reconciled shipping / SRC cost in Jarvis must be 0 or negative.');
                              setRuleCategory('Shipping & SRC');
                              setRuleSeverity('error');
                              setRuleIntent('requirement');
                              setRuleField('reconciledSrcCost');
                              setRuleCondition('lessThanOrEqual');
                              setRuleValue('0');
                              toast.success('Loaded template: Reconciled SRC Cost <= 0!');
                            }}
                            className="px-2.5 py-1 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 border border-indigo-200 rounded-lg text-[10px] font-extrabold text-indigo-800 transition-all shadow-xs"
                          >
                            🚢 Reconciled SRC &le; $0
                          </button>
                        </>
                      )}
                    </div>
                  </div>
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
 
                {/* Rule Specs and Intent */}
                <div className="space-y-4 border-b border-slate-100 pb-4">
                  {/* Rule Intent Toggle */}
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider block mb-1.5">
                      Rule Intent / Evaluation Logic
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRuleIntent('requirement')}
                        className={`py-2 px-3 text-center text-xs font-bold rounded-xl border transition-all ${
                          ruleIntent === 'requirement'
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        ✅ Requirement (Must Pass)
                      </button>
                      <button
                        type="button"
                        onClick={() => setRuleIntent('violation')}
                        className={`py-2 px-3 text-center text-xs font-bold rounded-xl border transition-all ${
                          ruleIntent === 'violation'
                            ? 'bg-amber-600 border-amber-600 text-white shadow-sm'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        ⚠️ Anomaly Trigger (Flag Anomaly)
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1.5 leading-tight">
                      {ruleIntent === 'requirement'
                        ? 'Condition states what MUST be true (e.g., "SRC > 0"). Records failing this condition are flagged.'
                        : 'Condition states an ANOMALY to flag (e.g., "Buy Price > $45" or "PnL < 0").'}
                    </p>
                  </div>

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
                      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-2 py-1 rounded-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
                        <span>Impacts DQ Dimension: <strong>{CATEGORY_TO_DIMENSION_MAP[ruleCategory]?.name || 'Validity'}</strong></span>
                      </div>
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
                      <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">Operator / Rule Type</label>
                      <select
                        value={ruleCondition}
                        onChange={(e: any) => setRuleCondition(e.target.value)}
                        className="w-full text-xs font-bold px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none bg-white font-sans"
                      >
                        <option value="greaterThan">Is Strictly Greater Than (&gt;)</option>
                        <option value="greaterThanOrEqual">Is Greater Than or Equal (&gt;=)</option>
                        <option value="lessThan">Is Strictly Less Than (&lt;)</option>
                        <option value="lessThanOrEqual">Is Less Than or Equal (&lt;=)</option>
                        <option value="equals">Equals (Exact match)</option>
                        <option value="notEquals">Does Not Equal (!=)</option>
                        <option value="empty">Is Empty / Unspecified</option>
                        <option value="notEmpty">Is Populated</option>
                        <option value="contains">Contains Substring</option>
                        <option value="dateAfterField">Chronologically set AFTER another date field</option>
                        <option value="dateBeforeField">Chronologically set BEFORE another date field</option>
                        <option value="mathCompare">⚡ Column-to-Column Math Operation</option>
                      </select>
                    </div>
                  </div>
 
                  {/* Single value or Calendar picker depending on field type */}
                  {ruleCondition !== 'empty' && ruleCondition !== 'notEmpty' && ruleCondition !== 'dateAfterField' && ruleCondition !== 'dateBeforeField' && ruleCondition !== 'mathCompare' && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                    >
                      <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                        {(ruleDataset === 'TRMS' ? TRMS_PROFILE_FIELDS : CARGO_PROFILE_FIELDS).find(f => f.value === ruleField)?.type === 'date' || ruleField.toLowerCase().includes('date')
                          ? 'Select Comparison Target Date (Calendar) *'
                          : 'Comparison Target Value *'}
                      </label>

                      {((ruleDataset === 'TRMS' ? TRMS_PROFILE_FIELDS : CARGO_PROFILE_FIELDS).find(f => f.value === ruleField)?.type === 'date' || ruleField.toLowerCase().includes('date')) ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            required
                            value={ruleValue}
                            onChange={(e) => setRuleValue(e.target.value)}
                            className="w-full text-xs font-bold px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none bg-white cursor-pointer"
                          />
                          {ruleValue && (
                            <button
                              type="button"
                              onClick={() => setRuleValue('')}
                              className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 bg-slate-100 rounded-md"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      ) : (
                        <input
                          type="text"
                          required
                          placeholder="e.g. 0 or 10000 or FOB"
                          value={ruleValue}
                          onChange={(e) => setRuleValue(e.target.value)}
                          className="w-full text-xs font-bold px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none"
                        />
                      )}
                    </motion.div>
                  )}

                  {/* Column-to-Column Math Operation builder */}
                  {ruleCondition === 'mathCompare' && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-4 bg-indigo-50/20 border border-indigo-200/80 p-4 rounded-2xl"
                    >
                      <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                        <h5 className="text-[11px] font-extrabold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                          <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          Column-to-Column Math Operation Builder
                        </h5>
                        <span className="text-[10px] font-extrabold text-indigo-600 bg-indigo-100/80 px-2 py-0.5 rounded-full">
                          Formula Mode
                        </span>
                      </div>

                      {/* Formula Live Preview */}
                      <div className="bg-slate-900 text-emerald-400 p-3 rounded-xl font-mono text-xs shadow-inner">
                        <div className="text-[9px] uppercase tracking-wider text-slate-400 font-sans mb-1 font-extrabold">Active Formula Expression:</div>
                        <div className="flex items-center gap-1.5 flex-wrap font-bold">
                          <span>
                            {Number(lhsMultiplier) !== 1 ? `${lhsMultiplier} * ` : ''}
                            {useLhsAbs ? `|${(ruleDataset === 'TRMS' ? TRMS_PROFILE_FIELDS : CARGO_PROFILE_FIELDS).find(f => f.value === ruleField)?.label || ruleField}|` : ((ruleDataset === 'TRMS' ? TRMS_PROFILE_FIELDS : CARGO_PROFILE_FIELDS).find(f => f.value === ruleField)?.label || ruleField)}
                            {Number(lhsOffset) !== 0 ? (Number(lhsOffset) > 0 ? ` + ${lhsOffset}` : ` - ${Math.abs(Number(lhsOffset))}`) : ''}
                          </span>
                          <span className="text-amber-300 font-extrabold px-1">
                            {getComparisonOperatorLabel(mathOperator)}
                          </span>
                          <span>
                            {rhsType === 'field' ? (
                              <>
                                {Number(rhsMultiplier) !== 1 ? `${rhsMultiplier} * ` : ''}
                                {useRhsAbs ? `|${(ruleDataset === 'TRMS' ? TRMS_PROFILE_FIELDS : CARGO_PROFILE_FIELDS).find(f => f.value === rhsField)?.label || rhsField}|` : ((ruleDataset === 'TRMS' ? TRMS_PROFILE_FIELDS : CARGO_PROFILE_FIELDS).find(f => f.value === rhsField)?.label || rhsField)}
                                {Number(rhsOffset) !== 0 ? (Number(rhsOffset) > 0 ? ` + ${rhsOffset}` : ` - ${Math.abs(Number(rhsOffset))}`) : ''}
                              </>
                            ) : (
                              <span>{ruleValue || '0'}</span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Left Hand Side (LHS) Modifiers */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                        <span className="text-[10px] font-extrabold uppercase text-slate-500 block">Left Hand Side (LHS) Transformation</span>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[9px] font-extrabold uppercase text-slate-400 block mb-1">Multiplier</label>
                            <input
                              type="number"
                              step="any"
                              value={lhsMultiplier}
                              onChange={(e) => setLhsMultiplier(e.target.value)}
                              className="w-full text-xs font-bold px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none"
                              placeholder="1.0"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-extrabold uppercase text-slate-400 block mb-1">Offset (+/-)</label>
                            <input
                              type="number"
                              step="any"
                              value={lhsOffset}
                              onChange={(e) => setLhsOffset(e.target.value)}
                              className="w-full text-xs font-bold px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none"
                              placeholder="0"
                            />
                          </div>
                          <div className="flex items-end pb-1">
                            <label className="flex items-center gap-1.5 text-xs font-extrabold text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={useLhsAbs}
                                onChange={(e) => setUseLhsAbs(e.target.checked)}
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                              />
                              <span>Use abs(|LHS|)</span>
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Comparison Operator */}
                      <div>
                        <label className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider block mb-1">Comparison Operator</label>
                        <select
                          value={mathOperator}
                          onChange={(e: any) => setMathOperator(e.target.value)}
                          className="w-full text-xs font-bold px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none bg-white font-sans"
                        >
                          <option value="greaterThan">Greater Than (&gt;)</option>
                          <option value="greaterThanOrEqual">Greater Than or Equal (&gt;=)</option>
                          <option value="lessThan">Less Than (&lt;)</option>
                          <option value="lessThanOrEqual">Less Than or Equal (&lt;=)</option>
                          <option value="equals">Equals (==)</option>
                          <option value="notEquals">Does Not Equal (!=)</option>
                          <option value="percentDiffGreaterThan">Percent Difference Greater Than (% diff &gt;)</option>
                          <option value="percentDiffLessThan">Percent Difference Less Than (% diff &lt;)</option>
                        </select>
                      </div>

                      {/* Right Hand Side (RHS) Controls */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-1">RHS Target Type</label>
                            <select
                              value={rhsType}
                              onChange={(e: any) => setRhsType(e.target.value)}
                              className="w-full text-xs font-bold px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none bg-white font-sans"
                            >
                              <option value="field">Another Column Field</option>
                              <option value="constant">Static Constant Value</option>
                            </select>
                          </div>

                          {rhsType === 'field' ? (
                            <div>
                              <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-1">Select RHS Column</label>
                              <select
                                value={rhsField}
                                onChange={(e) => setRhsField(e.target.value)}
                                className="w-full text-xs font-bold px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none bg-white font-sans"
                              >
                                {(ruleDataset === 'TRMS' ? TRMS_PROFILE_FIELDS : CARGO_PROFILE_FIELDS).map(f => (
                                  <option key={f.value} value={f.value}>{f.label}</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div>
                              <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-1">Constant Number</label>
                              <input
                                type="text"
                                required
                                value={ruleValue}
                                onChange={(e) => setRuleValue(e.target.value)}
                                className="w-full text-xs font-bold px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none"
                                placeholder="e.g. 0 or 100"
                              />
                            </div>
                          )}
                        </div>

                        {rhsType === 'field' && (
                          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                            <div>
                              <label className="text-[9px] font-extrabold uppercase text-slate-400 block mb-1">RHS Multiplier</label>
                              <input
                                type="number"
                                step="any"
                                value={rhsMultiplier}
                                onChange={(e) => setRhsMultiplier(e.target.value)}
                                className="w-full text-xs font-bold px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none"
                                placeholder="1.2"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-extrabold uppercase text-slate-400 block mb-1">RHS Offset (+/-)</label>
                              <input
                                type="number"
                                step="any"
                                value={rhsOffset}
                                onChange={(e) => setRhsOffset(e.target.value)}
                                className="w-full text-xs font-bold px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none"
                                placeholder="0"
                              />
                            </div>
                            <div className="flex items-end pb-1">
                              <label className="flex items-center gap-1.5 text-xs font-extrabold text-slate-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={useRhsAbs}
                                  onChange={(e) => setUseRhsAbs(e.target.checked)}
                                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                                />
                                <span>Use abs(|RHS|)</span>
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {(ruleCondition === 'dateAfterField' || ruleCondition === 'dateBeforeField') && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                    >
                      <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                        Compare Against Date Field
                      </label>
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

      {/* Dimension Detail Breakdown Modal */}
      <AnimatePresence>
        {selectedDimensionModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDimensionModal(null)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200 w-full max-w-3xl z-10 flex flex-col max-h-[90vh]"
            >
              {(() => {
                const dim = dqDimensions.find(d => d.id === selectedDimensionModal);
                if (!dim) return null;

                const hasScore = dim.isAssessed && dim.score !== null;
                const scoreVal = dim.score ?? 0;
                const isEmerald = hasScore && scoreVal >= 90;
                const isIndigo = hasScore && scoreVal >= 80 && scoreVal < 90;
                const isAmber = hasScore && scoreVal >= 70 && scoreVal < 80;

                const scoreColor = !hasScore ? 'text-slate-500' :
                                   isEmerald ? 'text-emerald-600' :
                                   isIndigo ? 'text-indigo-600' :
                                   isAmber ? 'text-amber-600' : 'text-rose-600';

                return (
                  <>
                    <div className="bg-slate-900 text-white p-5 flex items-center justify-between shrink-0">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Dimension Scorecard Breakdown</span>
                        <h3 className="text-base font-extrabold text-white mt-0.5">{dim.name} Scorecard & Sample Data</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDimensionModal(null);
                          setExpandedRuleNameModal(null);
                        }}
                        className="rounded-lg p-1.5 hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Calculated Rating</span>
                          <span className={`text-3xl font-black font-mono ${scoreColor}`}>{hasScore ? `${dim.score}%` : 'N/A'}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Current Status</span>
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                            !hasScore ? 'bg-slate-100 text-slate-600' :
                            isEmerald ? 'bg-emerald-100 text-emerald-800' :
                            isIndigo ? 'bg-indigo-100 text-indigo-800' :
                            isAmber ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {!hasScore ? 'N/A (Not Assessed)' : isEmerald ? 'Optimal' : isIndigo ? 'Good' : isAmber ? 'Requires Review' : 'Critical Action Required'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Definition</h4>
                          <p className="text-xs font-semibold text-slate-800 leading-relaxed bg-slate-50/50 p-3 rounded-xl border border-slate-100 h-full">
                            {dim.definition}
                          </p>
                        </div>
                        <div>
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Calculation Formula</h4>
                          <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 font-mono text-[11px] font-bold text-indigo-900 leading-relaxed h-full">
                            {dim.formula}
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Dimension Summary</h4>
                        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 font-mono text-xs font-bold text-slate-800">
                          {dim.breakdown} — {dim.details}
                        </div>
                      </div>

                      {/* Interactive Evaluated Rules & Sample Data Drilldown */}
                      <div>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Evaluated Rules & Sample Records Calculated</h4>
                        
                        {dim.ruleBreakdowns.length === 0 ? (
                          <p className="text-xs text-slate-500 italic bg-slate-50 p-3 rounded-xl border border-slate-100">
                            No DQ rules evaluated for this dimension in the selected dataset context ({selectedDataset}).
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {dim.ruleBreakdowns.map((rule, idx) => {
                              const isExpanded = expandedRuleNameModal === rule.ruleName;
                              
                              let filteredSample = rule.sampleData;
                              if (sampleFilterModal === 'passed') filteredSample = rule.sampleData.filter(s => s.passed);
                              if (sampleFilterModal === 'failed') filteredSample = rule.sampleData.filter(s => !s.passed);

                              const passedCount = rule.sampleData.filter(s => s.passed).length;
                              const failedCount = rule.sampleData.filter(s => !s.passed).length;

                              return (
                                <div key={idx} className="bg-slate-50 border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs">
                                  {/* Rule Header Bar */}
                                  <div className="p-3.5 flex items-center justify-between gap-3 bg-white border-b border-slate-100 flex-wrap sm:flex-nowrap">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold text-xs text-slate-800">{rule.ruleName}</span>
                                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                                        rule.dataset === 'TRMS'
                                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/60'
                                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                                      }`}>
                                        {rule.dataset}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black font-mono ${
                                        rule.score >= 90 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                        rule.score >= 75 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                        'bg-rose-50 text-rose-700 border border-rose-200'
                                      }`}>
                                        Score: {rule.score}% ({rule.passed}/{rule.checked} passed)
                                      </span>

                                      <button
                                        type="button"
                                        onClick={() => setExpandedRuleNameModal(isExpanded ? null : rule.ruleName)}
                                        className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-lg transition-all flex items-center gap-1"
                                      >
                                        <span>{isExpanded ? 'Hide Sample' : `View Sample (${rule.sampleData.length})`}</span>
                                        <svg className={`w-3 h-3 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>

                                  {/* Expanded Sample Data Section */}
                                  {isExpanded && (
                                    <div className="p-3 bg-slate-50/80 border-t border-slate-100 space-y-3">
                                      {/* Sample filter bar */}
                                      <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Filter Sample:</span>
                                          <button
                                            type="button"
                                            onClick={() => setSampleFilterModal('all')}
                                            className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${
                                              sampleFilterModal === 'all'
                                                ? 'bg-slate-900 text-white'
                                                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                                            }`}
                                          >
                                            All ({rule.sampleData.length})
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setSampleFilterModal('passed')}
                                            className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${
                                              sampleFilterModal === 'passed'
                                                ? 'bg-emerald-600 text-white'
                                                : 'bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                            }`}
                                          >
                                            Passed ({passedCount})
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setSampleFilterModal('failed')}
                                            className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${
                                              sampleFilterModal === 'failed'
                                                ? 'bg-rose-600 text-white'
                                                : 'bg-white border border-rose-200 text-rose-700 hover:bg-rose-50'
                                            }`}
                                          >
                                            Failed ({failedCount})
                                          </button>
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-mono italic">
                                          Showing {filteredSample.length} items
                                        </span>
                                      </div>

                                      {/* Sample Records Table */}
                                      {filteredSample.length === 0 ? (
                                        <p className="text-[11px] text-slate-400 italic text-center py-4 bg-white rounded-xl border border-slate-200/60">
                                          No records match the active filter ({sampleFilterModal}).
                                        </p>
                                      ) : (
                                        <div className="overflow-x-auto max-h-60 border border-slate-200/80 rounded-xl bg-white shadow-2xs">
                                          <table className="w-full text-left border-collapse text-[11px]">
                                            <thead>
                                              <tr className="bg-slate-100/90 text-[9px] font-extrabold text-slate-500 uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                                                <th className="px-3 py-2">Strategy Ref / SN</th>
                                                <th className="px-3 py-2">Checked Field & Value</th>
                                                <th className="px-3 py-2 w-24 text-center">DQ Status</th>
                                                <th className="px-3 py-2">Diagnostic Note</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 font-medium">
                                              {filteredSample.map((sample, sIdx) => (
                                                <tr key={sIdx} className="hover:bg-slate-50/80 transition-colors">
                                                  <td className="px-3 py-2 text-slate-900 font-bold max-w-[160px] truncate" title={sample.strategyName}>
                                                    {sample.strategyName}
                                                  </td>
                                                  <td className="px-3 py-2 font-mono text-[10px] text-slate-700 max-w-[200px] truncate" title={sample.valueDisplay}>
                                                    {sample.valueDisplay}
                                                  </td>
                                                  <td className="px-3 py-2 text-center whitespace-nowrap">
                                                    {sample.passed ? (
                                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        ✓ PASS
                                                      </span>
                                                    ) : (
                                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                                                        ✕ FAIL
                                                      </span>
                                                    )}
                                                  </td>
                                                  <td className="px-3 py-2 text-slate-600 text-[10px]">
                                                    {sample.reason}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-50 p-4 border-t border-slate-200/80 flex justify-end shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDimensionModal(null);
                          setExpandedRuleNameModal(null);
                        }}
                        className="px-5 py-2 text-[10px] font-black uppercase tracking-wider text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-all"
                      >
                        Close Breakdown
                      </button>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Custom Rule Generator Modal */}
      <AnimatePresence>
        {isAiRuleModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAiRuleModalOpen(false)}
              className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs"
            />

            {/* Modal Content */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200 w-full max-w-2xl z-10 flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 flex items-center justify-between shrink-0 border-b border-indigo-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-500 to-pink-500 flex items-center justify-center text-white shadow-md font-bold text-lg">
                    ✨
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">AI Rule Assistant</h3>
                      <span className="px-2 py-0.5 bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 rounded-md text-[9px] font-black uppercase tracking-wider">
                        Gemini 2.5 Flash
                      </span>
                    </div>
                    <p className="text-[11px] text-indigo-200/80 font-normal mt-0.5">
                      Describe what rule you want in plain English, and AI will configure it instantly.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAiRuleModalOpen(false)}
                  className="rounded-lg p-1.5 hover:bg-white/10 transition-colors text-slate-300 hover:text-white"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
                {/* Prompt Input Area */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center justify-between">
                    <span>What custom rule would you like to build?</span>
                    <span className="text-[9px] text-indigo-600 font-bold">Natural Language Input</span>
                  </label>
                  <div className="relative">
                    <textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="e.g., 'Alert me if sell price is higher than $25/MMBtu' or 'Loading date cannot be after delivery date' or 'TRMS SRC cost must be 0 or less'..."
                      rows={3}
                      className="w-full text-xs font-semibold px-3.5 py-2.5 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none bg-slate-50/50"
                    />
                  </div>
                </div>

                {/* Quick Example Chips */}
                <div className="space-y-1.5">
                  <span className="text-[9px] font-extrabold uppercase text-slate-400 tracking-wider block">
                    💡 Click a sample rule prompt to test:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "Compare TRMS purchase volume against sales volume",
                      "Alert me if sell price is higher than $25/MMBtu",
                      "Loading date must be strictly before delivery date",
                      "TRMS Shipping / SRC cost must be 0 or less",
                      "Flag error if TRMS strategy price status is unpriced",
                      "Flag error if TRMS and Jarvis volumes differ by over 5%"
                    ].map((sample, sIdx) => (
                      <button
                        key={sIdx}
                        type="button"
                        onClick={() => {
                          setAiPrompt(sample);
                          handleGenerateAiRule(sample);
                        }}
                        className="px-2.5 py-1 text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 rounded-xl transition-all text-left"
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                </div>

                {/* TRMS Available Column Reference Bar */}
                <div className="space-y-1.5 bg-slate-50 border border-slate-200/80 p-3 rounded-2xl">
                  <div className="flex items-center justify-between text-[9px] font-black uppercase text-slate-500 tracking-wider">
                    <span>📋 TRMS Column Attributes (Click to insert into prompt):</span>
                    <span className="text-[9px] text-indigo-600 font-bold">TRMS Columns</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {TRMS_PROFILE_FIELDS.map(col => (
                      <button
                        key={col.value}
                        type="button"
                        onClick={() => {
                          setAiPrompt(prev => prev ? `${prev} ${col.label}` : `Check ${col.label}`);
                          toast.success(`Inserted "${col.label}"`);
                        }}
                        className="px-2 py-0.5 text-[9.5px] font-bold text-slate-700 bg-white hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 rounded-lg transition-all"
                        title={col.description}
                      >
                        <span>{col.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Generate Button */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={isGeneratingRule || !aiPrompt.trim()}
                    onClick={() => handleGenerateAiRule()}
                    className="px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md transition-all flex items-center gap-2"
                  >
                    {isGeneratingRule ? (
                      <>
                        <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Analyzing & Generating Rule...</span>
                      </>
                    ) : (
                      <>
                        <span>✨ Generate Custom Rule</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Preview of Generated Rule */}
                {aiGeneratedRulePreview && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-indigo-50/40 border border-indigo-200 rounded-2xl p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Generated Rule Preview
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                        aiGeneratedRulePreview.severity === 'error' ? 'bg-rose-100 text-rose-800' :
                        aiGeneratedRulePreview.severity === 'warning' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {aiGeneratedRulePreview.severity}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[9px] font-extrabold uppercase text-slate-400 block">Rule Title</span>
                        <span className="font-bold text-slate-800">{aiGeneratedRulePreview.name}</span>
                      </div>
                      <div>
                        <span className="text-[9px] font-extrabold uppercase text-slate-400 block">Target Dataset & Category</span>
                        <span className="font-bold text-slate-800">{aiGeneratedRulePreview.targetDataset || 'Jarvis'} • {aiGeneratedRulePreview.category}</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[9px] font-extrabold uppercase text-slate-400 block">Description</span>
                      <p className="text-slate-600 font-medium text-[11px] leading-relaxed">{aiGeneratedRulePreview.description}</p>
                    </div>

                    <div className="bg-slate-900 text-emerald-400 p-2.5 rounded-xl font-mono text-[11px] flex items-center justify-between">
                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-slate-400 font-sans block">Evaluated Logic:</span>
                        <span>{aiGeneratedRulePreview.field} {aiGeneratedRulePreview.condition} {aiGeneratedRulePreview.value || aiGeneratedRulePreview.compareField}</span>
                      </div>
                      <span className="text-[9px] font-sans font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {aiGeneratedRulePreview.ruleIntent === 'requirement' ? '✅ Requirement' : '⚠️ Violation Anomaly'}
                      </span>
                    </div>

                    <div className="flex gap-2 justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleEditAiRuleInForm}
                        className="px-3.5 py-1.5 text-[10px] font-black uppercase text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 rounded-xl transition-all"
                      >
                        Edit Specs Manually
                      </button>
                      <button
                        type="button"
                        onClick={handleAcceptAiGeneratedRule}
                        className="px-4 py-1.5 text-[10px] font-black uppercase text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-all"
                      >
                        ✓ Add to Custom Rules Inventory
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* API Key & Rate Limit Transparency Box */}
                <div className="border-t border-slate-100 pt-4 mt-2">
                  <button
                    type="button"
                    onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                    className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 hover:text-indigo-600 flex items-center gap-1.5 transition-colors"
                  >
                    <span>🔑 API Key & Quota Management</span>
                    <span className="text-slate-400">{showApiKeyInput ? '▲ Hide' : '▼ Expand'}</span>
                  </button>

                  {showApiKeyInput && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2.5 text-[11px]"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-base shrink-0">🛡️</span>
                        <div>
                          <p className="font-bold text-slate-800">Free Tier & Rate Limit Safeguards</p>
                          <p className="text-slate-500 leading-relaxed text-[10px] mt-0.5">
                            By default, requests use the workspace's server-side Gemini API key (completely free on Gemini 2.5 Flash).
                            To protect against spam or rate limit exhausted errors when many users share the app, a local limit of 5 requests/min is enforced.
                          </p>
                        </div>
                      </div>

                      <div>
                        <label className="text-[9px] font-extrabold uppercase text-slate-400 block mb-1">
                          Optional: Use Your Own Gemini API Key
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={customApiKey}
                            onChange={(e) => setCustomApiKey(e.target.value)}
                            placeholder="AIzaSy... (leave blank to use system key)"
                            className="flex-1 text-xs font-mono px-3 py-1.5 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveApiKey(customApiKey)}
                            className="px-3 py-1.5 text-[10px] font-black uppercase bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-all"
                          >
                            Save Key
                          </button>
                        </div>
                        <p className="text-[9px] text-slate-400 mt-1">
                          Key is stored locally in your browser storage (`localStorage`) and never transmitted to external third parties.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="bg-slate-50 p-4 border-t border-slate-200/80 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAiRuleModalOpen(false)}
                  className="px-5 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 rounded-xl transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
