# Features & Functionality Status

| Feature Category | Feature Name | Status | Description |
| :--- | :--- | :--- | :--- |
| **Deal Capture** | Manual Entry | ✅ Working | Create/Edit Cargo profiles with dates, volumes, and formulas. |
| **Deal Capture** | **AI Import** | ✅ Working | Upload PDF/Docx/Image KTS. Gemini extracts fields into JSON. |
| **Deal Capture** | Bulk Import | ✅ Working | Paste Excel/CSV data. Includes "Diff" view to compare updates. |
| **Pricing** | Formula Parser | ✅ Working | Supports `+`, `-`, `%`, and aliases (e.g., "Henry Hub" -> "HH"). |
| **Pricing** | Forward Curves | ✅ Working | Upload/Manage monthly price curves. Used for future P&L projection. |
| **Pricing** | Spot Market | ✅ Working | Live override of current index prices. |
| **Risk** | Exposure Matrix | ✅ Working | Dynamic grouping of Floating volumes by Source. Configurable thresholds. |
| **Risk** | P&L Breakdown | ✅ Working | Filterable table for realized/unrealized P&L analysis. |
| **Logistics** | World Map | ✅ Working | Interactive Miller projection map showing trade routes. |
| **Logistics** | Calendar | ✅ Working | Month view of Load/Delivery windows. |
| **Ops** | Trade Matching | ✅ Working | Auto-suggest matching for orphan Buy/Sell legs. |
| **System** | Auth | ⚠️ Mock | Currently uses a mock login. Code contains placeholders for MSAL. |
| **System** | Backend | ⚠️ Mock | Logic runs client-side. Backend code exists in `/backend` but is optional. |

## Recent Improvements
1.  **Dynamic Source Grouping:** The Exposure Matrix now intelligently groups rare sources into "Others" based on a user-defined threshold slider.
2.  **P&L Actualization:** Fixed bug where realized invoices were overwritten by market moves. Realized cargoes now lock their prices.
3.  **Bulk Import Diff:** The bulk import modal now shows a "Before vs After" comparison before committing changes.
