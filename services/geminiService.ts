import { GoogleGenAI, Type, Schema } from "@google/genai";
import { CargoProfile } from "../types";

const parseCargoSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    source: { type: Type.STRING },
    strategyName: { type: Type.STRING },
    buyer: { type: Type.STRING },
    optimized: { type: Type.BOOLEAN },
    deliveryDate: { type: Type.STRING, description: "YYYY-MM-DD format if possible" },
    deliveryMonth: { type: Type.STRING },
    deliveredVolume: { type: Type.NUMBER },
    sellFormula: { type: Type.STRING },
    absoluteSellPrice: { type: Type.NUMBER },
    salesRevenue: { type: Type.NUMBER },
    loadedVolume: { type: Type.NUMBER },
    loadingDate: { type: Type.STRING, description: "YYYY-MM-DD format if possible" },
    loadingMonth: { type: Type.STRING },
    buyFormula: { type: Type.STRING },
    absoluteBuyPrice: { type: Type.NUMBER },
    incoterms: { type: Type.STRING },
    src: { type: Type.STRING },
    pnlBucket: { type: Type.STRING, enum: ['Realized', 'Unrealized', 'Unspecified'] },
    reconciledPurchaseCost: { type: Type.NUMBER },
    finalSalesRevenue: { type: Type.NUMBER },
    reconciledSalesRevenue: { type: Type.NUMBER },
    finalTotalCost: { type: Type.NUMBER },
    finalPhysicalPnL: { type: Type.NUMBER },
    totalHedgingPnL: { type: Type.NUMBER },
    finalTotalPnL: { type: Type.NUMBER },
  },
};

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
    
    // Gemini 2.5 Flash is efficient for document extraction
    const modelId = "gemini-2.5-flash";

    const prompt = `
      Analyze the provided KTS (Key Terms Sheet) or logistics document data. 
      Extract the available cargo information into a structured JSON format.
      
      Instructions:
      1. If a field is not explicitly present, exclude it or return null. Do NOT force data creation.
      2. For Boolean 'optimized', infer from context (Yes=true, No=false).
      3. For dates, standardize to YYYY-MM-DD.
      4. For Pricing Formulas (Sell Formula / Buy Formula):
         - Extract the MATHEMATICAL logic.
         - Convert standard indices to their codes: "Henry Hub" -> "HH", "Dutch TTF" -> "TTF", "Brent" -> "Dated Brent", "NBP" -> "NBP", "JKM" -> "JKM".
         - CLEANUP: Remove currency symbols ($), contract periods like '(n)' or '(m)', and non-numeric variables like 'Alpha' or 'Beta' unless a value is defined.
         - Example: "95% NBP(n) - $0.88 +/- Alpha" should be extracted as "95% NBP - 0.88".
         - Example: "HH plus 2.50 USD" should be "HH + 2.50".
      5. The data might be incomplete, that is okay.
    `;

    // Prepare contents based on whether we have raw text (from DOCX) or a file blob (PDF/Image)
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
        temperature: 0.1, // Low temperature for factual extraction
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
