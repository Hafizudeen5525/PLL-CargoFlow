import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
// import { OpenAIClient, AzureKeyCredential } from "@azure/openai";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// --- AZURE OPENAI CONFIGURATION (Placeholder) ---
// const endpoint = process.env.AZURE_OPENAI_ENDPOINT || "";
// const azureApiKey = process.env.AZURE_OPENAI_API_KEY || "";
// const deploymentId = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4";
// const client = new OpenAIClient(endpoint, new AzureKeyCredential(azureApiKey));

/**
 * Endpoint: Parse KTS Document
 * Replaces client-side Gemini call with Server-side Azure OpenAI call
 */
app.post('/api/parse-document', async (req, res) => {
    try {
        const { base64Data, mimeType, isText } = req.body;

        // --- AZURE OPENAI IMPLEMENTATION (Uncomment for Production) ---
        /*
        const messages = [
            { role: "system", content: "You are a logistics expert. Extract cargo data into JSON." },
            { role: "user", content: [
                { type: "text", text: "Analyze this document..." },
                // Note: Azure OpenAI supports image_url or text. For PDFs, you might need Azure Document Intelligence
            ]}
        ];

        const result = await client.getChatCompletions(deploymentId, messages, {
             responseFormat: { type: "json_object" },
             temperature: 0.1
        });
        
        const parsedData = JSON.parse(result.choices[0].message.content);
        return res.json(parsedData);
        */

        // --- MOCK RESPONSE (For Testing) ---
        console.log("Mock Backend: Parsing document...");
        res.json({
            strategyName: "SN2024_Mock_Azure_Parsed",
            source: "US Gulf (Azure)",
            buyer: "Azure Energy Ltd",
            deliveredVolume: 65000
        });

    } catch (error) {
        console.error("Azure Parse Error:", error);
        res.status(500).json({ error: "Failed to parse document" });
    }
});

/**
 * Endpoint: Calculate Profile
 * Centralizes P&L logic on the server
 */
app.post('/api/calculate', (req, res) => {
    const profile = req.body;
    
    // In a real migration, move the logic from services/calculationService.ts here
    // For now, we return the profile as-is or with a mock adjustment
    
    const revenue = (profile.deliveredVolume || 0) * (profile.absoluteSellPrice || 0);
    const updated = {
        ...profile,
        finalSalesRevenue: revenue,
        finalTotalPnL: revenue - (profile.reconciledPurchaseCost || 0)
    };

    res.json(updated);
});

app.get('/health', (req, res) => {
    res.send('CargoFlow Backend is running');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});