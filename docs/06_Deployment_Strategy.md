# Deployment Strategy (Azure)

The repository is structured to support a transition from a standalone React app to a full Azure Enterprise setup.

## Current State (Mock/Demo)
*   **Frontend:** Runs entirely in the browser.
*   **Data:** LocalStorage.
*   **Auth:** Mock (Simulated delay).
*   **AI:** Client-side calls to Gemini API.

## Target Architecture (Azure)

### 1. Frontend Hosting
*   **Service:** Azure Static Web Apps.
*   **Config:** Point to the `/frontend` (or root) directory.
*   **Env Vars:** `VITE_API_URL` pointing to the backend.

### 2. Backend API
*   **Service:** Azure App Service (Node.js/Express).
*   **Path:** `/backend`.
*   **Role:**
    *   Proxy requests to AI models (hides API keys).
    *   Centralized P&L calculation (optional).
    *   Database connectivity (SQL/CosmosDB).

### 3. Authentication
*   **Service:** Microsoft Entra ID (formerly Azure AD).
*   **Library:** MSAL (Microsoft Authentication Library).
*   **Implementation:** The code in `services/authService.ts` is pre-structured to toggle `USE_MOCK_AUTH = false` and enable MSAL logic.

### 4. AI Service Migration
*   **Current:** Google Gemini.
*   **Azure Equivalent:** Azure OpenAI Service (GPT-4o).
*   **Migration:** The backend `server.ts` contains commented-out code to switch from the Gemini SDK to the Azure OpenAI SDK.

## Deployment Steps
1.  Navigate to `azure/` folder for Bicep/Terraform templates (future work).
2.  Deploy Backend: `cd backend && npm install && npm run build && az webapp up`.
3.  Deploy Frontend: Connect GitHub repo to Azure Static Web Apps.
