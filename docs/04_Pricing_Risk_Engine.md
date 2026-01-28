# Pricing & Risk Engine Documentation

The core of CargoFlow is the `services/calculationService.ts`. This file handles the conversion of text-based formulas into financial numbers.

## 1. The Formula Parser (`evaluateFormula`)

The system uses a custom string parsing engine to evaluate pricing formulas safely.

### Process:
1.  **Normalization:** Converts inputs (e.g., `115% HH + 0.5`) into standard math (`1.15 * HH + 0.5`).
2.  **Alias Matching:** Maps natural language to keys.
    *   `"Dutch TTF"` -> `"TTF"`
    *   `"Asian Spot"` -> `"JKM"`
3.  **Context Injection:**
    *   It accepts a `referenceDate`.
    *   It looks up the **Forward Curve** for that specific month (e.g., `Nov-2025`).
    *   If a forward price exists, it uses it. If not, it falls back to the "Spot" market data.
4.  **Evaluation:** Uses `new Function()` to evaluate the sanitized mathematical string.

### Supported Syntaxes:
*   **Slope/Percentage:** `13.5% Brent` or `0.135 * Brent`
*   **Constant:** `JKM - 0.50`
*   **Complex:** `(115% HH) + 2.5`

## 2. Forward Curve Management

*   **Structure:** We store curves as `ForwardCurveRow[]` where each row represents a Month (YYYY-MM) and contains a dictionary of prices (`{ "TTF": 12.5, "JKM": 14.2 }`).
*   **Persistence:** Curves are stored in `localStorage` keyed by the "As Of Date" (the date the curve was published).
*   **Usage:** The system automatically selects the *latest available* curve when calculating Unrealized P&L.

## 3. P&L Bucketing Logic

The system distinguishes between **Realized** and **Unrealized** P&L.

| Bucket | Logic | Trigger |
| :--- | :--- | :--- |
| **Unrealized** | `(Volume * Formula(MarketData)) - Cost` | Automatic on Page Load or Market Data Change. |
| **Realized** | `(Volume * ReconciledPrice) - Cost` | User manually clicks "Actualize" or sets Status to Realized. |

### The "Actualize" Workflow
1.  User clicks "Actualize" on a cargo.
2.  The app takes the *current calculated price* (e.g., $10.50).
3.  It writes this value into `absoluteSellPrice` or `absoluteBuyPrice`.
4.  It sets `pnlBucket = 'Realized'`.
5.  **Crucially:** The `CargoForm` and `recalculateProfile` logic checks this flag. If `Realized`, it **skips** the `evaluateFormula` step, ensuring the price never changes again, even if the forward curve moves.
