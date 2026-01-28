# Azure Deployment Guide for CargoFlow

This project has been refactored to support a standard Azure Web App architecture.

## Repository Structure

For the final git repository, the IT team should organize the files as follows:

```
/
├── azure/                  # Deployment docs and IaC templates (Bicep/Terraform)
├── backend/                # Node.js Express Server (Azure App Service)
│   ├── src/
│   ├── package.json
│   └── server.ts
├── frontend/               # React App (Azure Static Web App)
│   ├── public/
│   ├── src/
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
└── .gitignore
```

**Note:** For the current development environment (Google AI Studio), the frontend files remain in the root directory to maintain preview functionality.

---

## 1. Authentication (Azure Entra ID / MSAL)

The frontend is prepared for MSAL (Microsoft Authentication Library).

1.  **Register App in Azure Portal:**
    *   Go to **Microsoft Entra ID** > **App registrations**.
    *   New Registration > Name: "CargoFlow Frontend".
    *   Redirect URI (SPA): `https://<your-static-app>.azurestaticapps.net`.
2.  **Configure Code:**
    *   Open `src/services/authService.ts`.
    *   Set `USE_MOCK_AUTH = false`.
    *   Fill in `clientId` and `authority` (Tenant ID).

## 2. Backend API (Azure App Service)

The backend handles heavy calculation logic and AI processing (switch from Gemini to Azure OpenAI).

1.  **Provision Resource:**
    *   Create an **Azure App Service** (Node.js 18+ or 20 LTS).
    *   Create an **Azure OpenAI Service** resource.
        *   Deploy a GPT-4o or GPT-3.5-Turbo model.
2.  **Environment Variables (App Service Configuration):**
    *   `AZURE_OPENAI_API_KEY`: <Your Key>
    *   `AZURE_OPENAI_ENDPOINT`: `https://<resource>.openai.azure.com/`
    *   `AZURE_OPENAI_DEPLOYMENT`: <Deployment Name>
3.  **Deploy:**
    *   Navigate to `/backend`.
    *   `npm install && npm run build`.
    *   Deploy via GitHub Actions or Azure CLI (`az webapp up`).

## 3. Frontend (Azure Static Web Apps)

1.  **Provision Resource:**
    *   Create an **Azure Static Web App**.
2.  **Build Configuration:**
    *   App location: `/frontend`
    *   Api location: (Leave empty if using separate App Service, or point to `/backend` if using Azure Functions).
    *   Output location: `dist`
3.  **Environment Variables:**
    *   `VITE_API_URL`: The URL of your deployed Backend App Service (e.g., `https://cargoflow-api.azurewebsites.net`).

---

## Testing in Isolation

*   **Mock Mode:** The app runs out-of-the-box using `localStorage` and client-side logic.
*   **Production Mode:**
    *   Set `VITE_USE_REAL_BACKEND=true` in frontend `.env`.
    *   Set `VITE_USE_MOCK_AUTH=false`.
