# AI Document Parsing Integration

CargoFlow uses **Google Gemini 2.5 Flash** to extract structured data from unstructured logistics documents (Key Term Sheets, Invoices, Contracts).

## Implementation Details

**File:** `services/geminiService.ts`

### 1. File Handling
*   **Images/PDFs:** Converted to Base64 client-side and sent to Gemini via the `inlineData` parameter.
*   **Word Docs (.docx):** We use `mammoth.js` to extract raw text from the .docx file first, then send the text to Gemini.

### 2. Prompt Engineering
We use a specific system instruction prompt to ensure consistency:

> "Extract the available cargo information into a structured JSON format. If a field is not present, exclude it. For Pricing Formulas, extract the MATHEMATICAL logic and convert standard indices to codes (e.g., 'Henry Hub' -> 'HH')."

### 3. Structured Output (Schema)
We force Gemini to return JSON using the `responseSchema` configuration. This maps directly to our TypeScript `CargoProfile` interface:
*   `source` (String)
*   `deliveredVolume` (Number)
*   `deliveryDate` (YYYY-MM-DD String)
*   `sellFormula` (String)

### 4. Privacy & Architecture
*   **Current State:** The API Key is accessed via `process.env.API_KEY`.
*   **Production Note:** In a real deployment, the API Key should **not** be exposed to the client. The parsing request should be proxied through the Backend (`/api/parse-document`) as shown in the `azure/` reference implementation.
