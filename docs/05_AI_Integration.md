# Document Parsing & Data Extraction

CargoFlow includes a document parser that extracts structured deal parameters from unstructured documents such as Key Term Sheets (KTS), deal confirmations, and contract summaries.

## How It Works

**Primary Source:** `services/geminiService.ts` / `services/apiClient.ts`

### 1. File Ingestion
- **PDFs and Images:** Read into memory as Base64 strings.
- **Word Documents (`.docx`):** Extracted into plain text using `mammoth.js`.
- **In-Memory Processing:** Files are read directly inside the browser session. They are not stored on an intermediate file server or saved into public buckets.

### 2. Structured Extraction
The parser requests a strict JSON schema matching the `CargoProfile` TypeScript interface:
- Counterparty / Source
- Delivered Volume (in MMBtu or Bbl)
- Loading and Delivery dates
- Mathematical pricing formula (e.g., standardizing "115 percent of Henry Hub plus fifty cents" into `115% HH + 0.50`)
- Shipping and auxiliary costs

### 3. Production Deployment Note
In client-side mode, calls can be made directly if an API key is configured. In production deployments, document parsing requests route through the backend proxy (`POST /api/parse-document`) to keep credentials secured on the server side.
