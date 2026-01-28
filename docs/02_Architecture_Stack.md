# Architecture & Tech Stack

## Technology Stack

*   **Frontend Framework:** React 19 (via Vite).
*   **Language:** TypeScript (Strict typing for financial accuracy).
*   **Styling:** Tailwind CSS (Utility-first for rapid UI development).
*   **Animation:** Framer Motion (Transitions for lists, modals, and charts).
*   **Visualization:** Recharts (Composable charting library).
*   **AI/LLM:** Google Gemini SDK (`@google/genai`) for client-side document parsing.
*   **Build Tool:** Vite.

## Architectural Decisions

### 1. State Management
*   **Current State:** We use `App.tsx` as the "Source of Truth". State is lifted up to the root component and passed down via props.
*   **Persistence:** We currently use `localStorage` ('cargo_profiles', 'spot_market_data', 'forward_curve_history') to simulate persistence without requiring a database connection during the prototype phase.
*   **Reasoning:** This allows the app to be fully functional as a standalone static site demo while retaining data across refreshes.

### 2. Service Layer Pattern
We abstract logic into a `/services` folder to keep components clean:
*   `calculationService.ts`: Pure functions for financial math, P&L, and formula parsing.
*   `geminiService.ts`: Wrapper for AI interactions.
*   `authService.ts`: Abstraction for Authentication (currently Mock, ready for MSAL/Azure).
*   `apiClient.ts`: A bridge that switches between local service calls (Dev) and real REST API calls (Prod).

### 3. Pricing Engine Strategy
*   **Hybrid Evaluation:** We do not store static P&L numbers for *Unrealized* cargoes. Instead, we store the **Formula** string.
*   **Runtime Calculation:** On app load, `App.tsx` triggers a recalculation of all Unrealized cargoes against the latest Market Data.
*   **Actualization:** When a cargo is moved to `Realized` status, we **stop** re-evaluating the formula and lock the values to preserve historical accuracy (Reconciliation).

## Directory Structure
```
/
├── components/         # UI Components (Dashboard, CargoForm, Lists)
├── services/           # Business Logic & API Wrappers
├── types.ts            # Shared TypeScript Interfaces
├── App.tsx             # Main Controller / State Holder
├── azure/              # IaC and Backend Reference Implementation
└── docs/               # Project Documentation
```
