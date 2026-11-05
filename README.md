# CargoFlow

A lightweight commodity trading and risk management (CTRM) web dashboard for tracking physical LNG and crude oil cargoes, evaluating indexed pricing formulas against forward curves, and reconciling delivery invoices against TRMS reports.

---

## Why this exists

Physical cargo operations come with a lot of moving parts. A single LNG deal might involve floating price formulas tied to indices like Henry Hub or TTF, ship charter rates, boil-off costs, and delivery windows that span several months into the future. 

Most desks start out managing these with Excel. Spreadsheets work fine for a handful of trades, but they get painful quickly when:
- Forward curves update daily and require manual recalculation across multiple workbooks.
- Settlement invoices come in and need to be locked so market shifts don't rewrite historical numbers.
- Shipping costs (charter, bunkers, boil-off) get mixed up with financing or inspection fees.
- You need to compare your physical book against official TRMS (Trade & Risk Management System) figures to spot billing discrepancies.

CargoFlow puts deal capture, mark-to-market valuation, logistics scheduling, and reconciliation into a single interface that runs directly in your browser.

---

## What it does

### Formula-Based Pricing & Forward Curves
- Parses real-world deal formulas such as `115% HH + 0.50` or `13.5% Brent - 0.20`.
- Matches delivery dates against monthly forward curve points (e.g., `2025-11`). If a curve point is missing, it falls back to current spot benchmark data.
- Unrealized trades update dynamically whenever new curve data or spot prices are saved.

### Unrealized vs. Realized Price Locking
- Active voyages sit in the **Unrealized** bucket, where P&L recalculates with market movements.
- When a cargo is delivered and invoiced, switching it to **Realized** freezes the final price and margin. This guarantees historical figures won't change when forward curves move later on.

### Shipping vs. Other Fee Separation
- Distinguishes **Shipping Related Costs (SRC)**—such as vessel charter rates, fuel bunkers, port dues, and boil-off—from **Other Fees** (financing charges, demurrage, hedging costs, and inspection fees).
- Both cost categories are tracked independently on trade profiles and during reconciliation.

### TRMS Reconciliation & Discrepancy Checks
- Ingests TRMS report files to verify internal desk numbers against risk management records.
- Automatically flags discrepancies greater than $1.00 with high-contrast warning badges.
- Every column (P&L bucket, optimization status, unallocated volume, SRC, and other fees) includes dedicated filters to view matching rows or isolate mismatches.

### Key Term Sheet (KTS) Document Extraction
- Extracts structured deal data from PDF, Word (`.docx`), or image contracts.
- Pulls counterparties, delivery windows, contract volumes, and pricing formulas into the deal capture form.
- Files are parsed directly in local browser memory without uploading sensitive trade documents to intermediate file servers.

### Bulk Import with Side-by-Side Diffing
- Copy and paste multiple cargo rows from Excel or CSV files.
- Before committing, a diff modal highlights newly added rows and changes to existing records so bad data doesn't get saved by accident.

### Market Exposure & Logistics Scheduling
- Aggregates floating volume exposure by supply source, with an adjustable threshold slider to group minor suppliers into an "Others" category.
- Displays shipping laycans on an interactive delivery calendar and plots trade routes on a world map.

---

## How the Pricing Engine Works

The pricing engine lives in `services/calculationService.ts`. 

1. **Formula Normalization**: Takes contract shorthand and standardizes it into valid mathematical syntax (e.g., `115% HH + 0.5` becomes `1.15 * HH + 0.5`).
2. **Benchmark Matching**: Recognizes standard commodity symbols and aliases:
   - `HH` / `Henry Hub`
   - `TTF` / `Dutch TTF`
   - `JKM` / `Asian Spot`
   - `Brent`
3. **Monthly Forward Resolution**: 
   - Uses the cargo delivery date to pick the relevant month (`YYYY-MM`).
   - Retrieves the matching index price from the active forward curve.
   - Evaluates the final formula to compute price per unit ($/MMBtu or $/Bbl).
4. **Margin Calculation**:
   $$\text{Gross Margin} = (\text{Sell Price} - \text{Buy Price}) \times \text{Delivered Volume}$$
   $$\text{Net PnL} = \text{Gross Margin} - \text{SRC Costs} - \text{Other Fees}$$

---

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling & Animation**: Tailwind CSS, Framer Motion
- **Charts & Maps**: Recharts, Lucide Icons, SVG projection maps
- **File Processing**: SheetJS (`xlsx`) for spreadsheets, `mammoth` for Word documents
- **Data Storage**: IndexedDB (`idb`) and LocalStorage for fast offline-first usage, with optional Firebase / Firestore synchronization
- **Backend (Optional)**: Node.js / Express in `/backend` for server-side proxying and enterprise hosting

---

## Project Structure

```text
├── components/          # React UI components
│   ├── Dashboard.tsx            # Main metrics, portfolio summary, charts
│   ├── CargoList.tsx            # Active cargo table with search and filtering
│   ├── CargoForm.tsx            # Deal entry and editing form
│   ├── DiscrepancyCheck.tsx     # TRMS reconciliation engine with column diff filters
│   ├── ExposureView.tsx         # Floating vs. fixed price exposure matrix
│   ├── ForwardCurveModal.tsx    # Forward curve manager and price history
│   ├── BulkImportModal.tsx      # Excel/CSV importer with visual diff preview
│   ├── CalendarView.tsx         # Loading and discharge laycan calendar
│   └── WorldMap.tsx             # Interactive vessel trade route map
├── services/            # Business logic and external adapters
│   ├── calculationService.ts    # Pricing formulas, P&L math, curve interpolation
│   ├── apiClient.ts             # Bridge between local client mode and backend API
│   ├── db.ts                    # IndexedDB wrapper for local data persistence
│   └── geminiService.ts         # Document parser for term sheets and contracts
├── backend/             # Optional Node.js/Express server
│   └── server.ts                # API routes for document parsing and calculation
├── azure/               # Reference architecture for enterprise cloud deployment
├── docs/                # Architecture notes, pricing specs, and feature status
├── types.ts             # Shared TypeScript interfaces
├── App.tsx              # Root controller and navigation
└── index.html           # HTML entry point
```

---

## Getting Started

### Prerequisites
- Node.js 18.x or 20.x
- npm 9.x or higher

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Hafizudeen5525/PLL-CargoFlow.git
   cd cargoflow
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the local development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:3000`.

---

## Running the Optional Backend

If you want to run the Node.js API server instead of using standalone client-side execution:

```bash
cd backend
npm install
npm run dev
```

The backend server starts on `http://localhost:3001`. Set `VITE_USE_REAL_BACKEND=true` in your root `.env` file to route requests through the API.

---

## Scripts

- `npm run dev`: Starts the Vite development server on port 3000
- `npm run build`: Compiles TypeScript and runs the production Vite bundle
- `npm run lint`: Runs ESLint across all TypeScript and TSX files
- `npm run preview`: Previews the production build locally

---

## Privacy & Data Handling

CargoFlow is designed with trade data privacy in mind:
- **Client-Side Parsing**: Uploaded contract documents, TRMS spreadsheets, and forward curve files are parsed in your browser's local memory using `FileReader`.
- **Zero Default Cloud Persistence**: All trade entries, market curves, and reconciliation results stay in your browser's local storage (IndexedDB / LocalStorage) unless you explicitly configure a backend or database.
- **Enterprise Ready**: For teams needing centralized databases or Single Sign-On, see `azure/README_DEPLOYMENT.md` for steps on connecting Microsoft Entra ID and Azure App Services.

---

## License

MIT License. Free for personal, academic, and commercial use.
