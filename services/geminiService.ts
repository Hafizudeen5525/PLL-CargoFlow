
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
