/**
 * API Client Bridge
 * 
 * This file serves as the abstraction layer between the UI and the Data.
 * 
 * - In Development (AI Studio): It calls local services (geminiService, calculationService).
 * - In Production (Azure): It calls the backend API endpoints defined in /backend/server.ts.
 */

import { CargoProfile } from "../types";
import { parseKTSDocument } from "./geminiService"; 
import { recalculateProfile } from "./calculationService";
import { authService } from "./authService";

// Set this to TRUE via environment variable in Azure Static Web Apps
const USE_REAL_BACKEND = false; // process.env.VITE_USE_REAL_BACKEND === 'true';
const API_BASE_URL = "http://localhost:3001/api"; // process.env.VITE_API_URL

export const apiClient = {

    /**
     * Parse a document (PDF/DOCX/Image)
     */
    parseDocument: async (data: string, mimeType: string, isText: boolean): Promise<Partial<CargoProfile>> => {
        if (!USE_REAL_BACKEND) {
            // Use local Gemini service (Google AI Studio compatible)
            return await parseKTSDocument(data, mimeType, isText);
        }

        // Call Azure Backend
        const token = await authService.getToken();
        const response = await fetch(`${API_BASE_URL}/parse-document`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ base64Data: data, mimeType, isText })
        });

        if (!response.ok) throw new Error("Backend parse failed");
        return await response.json();
    },

    /**
     * Recalculate Profile Financials
     */
    calculateProfile: async (profile: Partial<CargoProfile>, force: boolean): Promise<Partial<CargoProfile>> => {
        if (!USE_REAL_BACKEND) {
            // Use local logic
            return recalculateProfile(profile, force);
        }

        // Call Azure Backend logic
        const response = await fetch(`${API_BASE_URL}/calculate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profile)
        });
        return await response.json();
    }
};