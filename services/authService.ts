// --- CONFIGURATION ---
// Toggle this to false when deploying to Azure with valid MSAL config
const USE_MOCK_AUTH = true;

// Azure AD (Entra ID) Configuration Placeholder
const msalConfig = {
    auth: {
        clientId: "YOUR_AZURE_CLIENT_ID", // Application (client) ID
        authority: "https://login.microsoftonline.com/YOUR_TENANT_ID",
        redirectUri: window.location.origin,
    },
    cache: {
        cacheLocation: "sessionStorage", 
        storeAuthStateInCookie: false, 
    }
};

// --- INTERFACES ---
export interface User {
    id: string;
    name: string;
    email: string;
    roles: string[];
}

// --- MOCK IMPLEMENTATION ---
const MOCK_USER: User = {
    id: "mock-user-001",
    name: "Test Trader",
    email: "trader@cargoflow.ai",
    roles: ["Trader", "Admin"]
};

// --- SERVICE ---
export const authService = {
    
    /**
     * Checks if user is currently logged in
     */
    isAuthenticated: (): boolean => {
        if (USE_MOCK_AUTH) {
            return !!localStorage.getItem('mock_auth_token');
        }
        // Azure MSAL Implementation:
        // const accounts = msalInstance.getAllAccounts();
        // return accounts.length > 0;
        return false;
    },

    /**
     * Get current user details
     */
    getUser: (): User | null => {
        if (USE_MOCK_AUTH) {
            return localStorage.getItem('mock_auth_token') ? MOCK_USER : null;
        }
        // Azure MSAL Implementation:
        // const account = msalInstance.getAllAccounts()[0];
        // return { name: account.name, email: account.username ... };
        return null;
    },

    /**
     * Login Function
     */
    login: async (): Promise<User> => {
        if (USE_MOCK_AUTH) {
            // Simulate network delay
            await new Promise(resolve => setTimeout(resolve, 800));
            localStorage.setItem('mock_auth_token', 'valid-token');
            return MOCK_USER;
        }

        // Azure MSAL Implementation:
        /*
        try {
            const loginResponse = await msalInstance.loginPopup({
                scopes: ["User.Read"]
            });
            return { name: loginResponse.account.name, ... };
        } catch (err) {
            throw err;
        }
        */
       throw new Error("MSAL not configured");
    },

    /**
     * Logout Function
     */
    logout: async () => {
        if (USE_MOCK_AUTH) {
            localStorage.removeItem('mock_auth_token');
            window.location.reload();
            return;
        }
        
        // Azure MSAL Implementation:
        // await msalInstance.logoutPopup();
    },

    /**
     * Get Access Token for API calls
     */
    getToken: async (): Promise<string> => {
        if (USE_MOCK_AUTH) return "mock-jwt-token";
        
        // Azure MSAL:
        // const response = await msalInstance.acquireTokenSilent(...);
        // return response.accessToken;
        return "";
    }
};