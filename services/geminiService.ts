
import { GoogleGenAI, Type } from "@google/genai";
import { CargoProfile } from "../types";

// Schema definition for the expected JSON output
const parseCargoSchema = {
  type: Type.OBJECT,
  properties: {
    source: { type: Type.STRING },
    strategyName: { type: Type.STRING },
    manualGroup: { type: Type.STRING, description: "Portfolio group or custom category if mentioned" },
    buyer: { type: Type.STRING },
    optimized: { type: Type.BOOLEAN },
    deliveryDate: { type: Type.STRING, description: "YYYY-MM-DD format" },
    deliveryMonth: { type: Type.STRING },
    deliveryWindowStart: { type: Type.STRING, description: "YYYY-MM-DD start of delivery window" },
    deliveryWindowEnd: { type: Type.STRING, description: "YYYY-MM-DD end of delivery window" },
    deliveredVolume: { type: Type.NUMBER },
    sellFormula: { type: Type.STRING },
    absoluteSellPrice: { type: Type.NUMBER },
    salesRevenue: { type: Type.NUMBER },
    loadedVolume: { type: Type.NUMBER },
    loadingDate: { type: Type.STRING, description: "YYYY-MM-DD format" },
    loadingMonth: { type: Type.STRING },
    loadingWindowStart: { type: Type.STRING, description: "YYYY-MM-DD start of loading window" },
    loadingWindowEnd: { type: Type.STRING, description: "YYYY-MM-DD end of loading window" },
    buyFormula: { type: Type.STRING },
    absoluteBuyPrice: { type: Type.NUMBER },
    incoterms: { type: Type.STRING },
    src: { type: Type.STRING },
    pnlBucket: { type: Type.STRING, enum: ['Realized', 'Unrealized', 'Unspecified'] },
    isTieredPricing: { type: Type.BOOLEAN },
    tier2DeliveredVolume: { type: Type.NUMBER },
    tier2SellFormula: { type: Type.STRING },
    volumeUnit: { type: Type.STRING, enum: ['MMBtu', 'm3', 'MT', 'bbl'] },
  },
};

const customRuleResponseSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Title of the custom rule" },
    description: { type: Type.STRING, description: "Detailed description of rule purpose" },
    targetDataset: { type: Type.STRING, enum: ['Jarvis', 'TRMS'] },
    category: { 
      type: Type.STRING, 
      enum: ['Date Validation', 'Missing Info', 'Quantity Validation', 'Pricing & Valuations', 'Formula Integrity', 'Shipping & SRC', 'Other'] 
    },
    field: { type: Type.STRING, description: "Field name in dataset, e.g. loadedVolume, deliveredVolume, absoluteSellPrice, absoluteBuyPrice, loadingDate, deliveryDate, reconciledSrcCost, buyer, pnlBucket, srcValue, etc." },
    condition: { 
      type: Type.STRING, 
      enum: ['empty', 'notEmpty', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'equals', 'notEquals', 'contains', 'dateAfterField', 'dateBeforeField', 'mathCompare'] 
    },
    value: { type: Type.STRING, description: "Comparison threshold or string value" },
    compareField: { type: Type.STRING, description: "Field name to compare against for dateBeforeField, dateAfterField, or mathCompare" },
    severity: { type: Type.STRING, enum: ['error', 'warning', 'info'] },
    ruleIntent: { type: Type.STRING, enum: ['requirement', 'violation'], description: "requirement = must hold true; violation = error if condition met" },
    useLhsAbs: { type: Type.BOOLEAN },
    rhsType: { type: Type.STRING, enum: ['constant', 'field'] },
    rhsField: { type: Type.STRING },
    mathOperator: { 
      type: Type.STRING, 
      enum: ['greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'equals', 'notEquals', 'percentDiffGreaterThan', 'percentDiffLessThan'] 
    }
  },
  required: ['name', 'description', 'targetDataset', 'category', 'field', 'condition', 'value', 'severity', 'ruleIntent']
};

export async function generateCustomRuleFromPrompt(
  userPrompt: string,
  userApiKey?: string
): Promise<any> {
  const apiKey = userApiKey?.trim() || process.env.API_KEY || (import.meta.env as any).VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is missing. Please provide an API key or check system environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelId = "gemini-2.5-flash";

  const prompt = `
    You are an expert Data Quality Rule Assistant for LNG & Commodity Trading Logistics (PLL CargoFlow).
    Convert the following user natural language request into a structured Data Quality CustomRule object.

    User Request: "${userPrompt}"

    Dataset & Fields Guidelines:
    - Dataset "Jarvis" fields:
      * 'strategyName' (string, SN number)
      * 'buyer' (string, counterparty)
      * 'source' (string, portfolio/source)
      * 'incoterms' (string, e.g. FOB, DES)
      * 'loadedVolume' (number, MMBtu)
      * 'deliveredVolume' (number, MMBtu)
      * 'absoluteBuyPrice' (number, $/MMBtu)
      * 'absoluteSellPrice' (number, $/MMBtu)
      * 'loadingDate' (date YYYY-MM-DD)
      * 'deliveryDate' (date YYYY-MM-DD)
      * 'reconciledSrcCost' (number, $)
      * 'srcUnitFee' (number, $/unit)
      * 'finalPhysicalPnL' (number, $)
      * 'finalTotalPnL' (number, $)
      * 'pnlBucket' (string, 'Realized' | 'Unrealized')
      * 'jarvisNo' (string)
    - Dataset "TRMS" fields:
      * 'strategyName' (string)
      * 'volumeType' (string)
      * 'priceStatus' (string)
      * 'commodityValue' (number)
      * 'srcValue' (number)
      * 'trmsSalesValue' (number)
      * 'trmsPurchaseValue' (number)
      * 'loadingDate' (date)
      * 'deliveryDate' (date)

    Conditions Available:
    - 'empty' | 'notEmpty'
    - 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual' | 'equals' | 'notEquals' | 'contains'
    - 'dateBeforeField' | 'dateAfterField' (use 'compareField' for target date field)
    - 'mathCompare' (use 'mathOperator', 'rhsType', 'rhsField' or constant 'value', 'useLhsAbs', 'percentDiffGreaterThan', etc.)

    Intent & Severity:
    - ruleIntent: 'requirement' if condition MUST be met (e.g. loading date before delivery date), OR 'violation' if condition triggers an error when met (e.g. price > $100 triggers error).
    - severity: 'error' (blocking flaw), 'warning' (attention needed), or 'info' (notice).
  `;

  const response = await ai.models.generateContent({
    model: modelId,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: customRuleResponseSchema,
      temperature: 0.1,
    }
  });

  const text = response.text;
  if (!text) throw new Error("No response generated from Gemini AI.");

  const ruleObj = JSON.parse(text);
  ruleObj.id = `rule-ai-${Date.now()}`;
  ruleObj.enabled = true;
  return ruleObj;
}

export async function parseKTSDocument(
  data: string, 
  mimeType: string, 
  isTextContent: boolean = false
): Promise<Partial<CargoProfile>> {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API Key is missing.");
    }

    const ai = new GoogleGenAI({ apiKey });
    const modelId = "gemini-3-flash-preview";

    const prompt = `
      Analyze the provided KTS (Key Terms Sheet) or logistics document data. 
      Extract the available cargo information into a structured JSON format.
      
      Instructions:
      1. If a field is not explicitly present, exclude it or return null.
      2. For Boolean 'optimized', infer from context (Yes=true, No=false).
      3. For dates, standardize to YYYY-MM-DD.
      4. For Pricing Formulas (Sell Formula / Buy Formula):
         - Extract the MATHEMATICAL logic.
         - Convert standard indices to their codes: 
           "Henry Hub Last Day" or "HH Last Day" -> "HH Last Day"
           "Henry Hub" -> "HH"
           "Dutch TTF" -> "TTF"
           "Brent" -> "Dated Brent"
           "NBP" -> "NBP"
           "JKM" -> "JKM"
         - IMPORTANT: Distinguish between "Henry Hub" (daily/average) and "Henry Hub Last Day" (settlement).
         - CLEANUP: Remove currency symbols ($) and contract periods like '(n)' or '(m)'.
      5. TWO-TIER PRICING:
         - If the document mentions multiple volumes with different pricing (e.g., "First X units at Formula A, then remainder at Formula B"), 
           set 'isTieredPricing' to true.
         - Extract the first volume and formula into 'deliveredVolume' and 'sellFormula'.
         - Extract the second tier volume and formula into 'tier2DeliveredVolume' and 'tier2SellFormula'.
      6. Extract Volume Unit (MMBtu, m3, MT, bbl) if explicitly stated.
    `;

    const contents = {
      parts: [
        { text: prompt },
        isTextContent 
          ? { text: `Document Content:\n${data}` }
          : {
              inlineData: {
                mimeType: mimeType,
                data: data // Base64 string
              }
            }
      ]
    };

    const response = await ai.models.generateContent({
      model: modelId,
      contents: contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: parseCargoSchema,
        temperature: 0.1,
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const parsedData = JSON.parse(text);
    return parsedData as Partial<CargoProfile>;

  } catch (error) {
    console.error("Gemini Parse Error:", error);
    throw error;
  }
}
