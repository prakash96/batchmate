import { create } from 'zustand';
import { BASE_URL } from '../config';

// Global variables — merged (lowest priority) into every request run, on the backend itself
// (see RequestExecutionService.run's javadoc) so they're shared across browsers/machines rather
// than living only in one browser's localStorage.
export const useGlobalVarsStore = create((set, get) => ({
    globalVariables: {},
    loaded: false,

    fetchGlobalVariables: async () => {
        const res = await fetch(`${BASE_URL}/globals`);
        let globalVariables = await res.json();
        if (Object.keys(globalVariables).length === 0) {
            // One-time migration: this app used to persist globals in this browser's localStorage
            // only (via zustand's persist middleware, key "apitester-global-vars") — if there's
            // old data there and the backend has nothing yet, move it over so nobody silently
            // loses previously-set global variables just because storage moved server-side.
            try {
                const legacy = JSON.parse(localStorage.getItem('apitester-global-vars') || 'null');
                const legacyVars = legacy?.state?.globalVariables;
                if (legacyVars && Object.keys(legacyVars).length > 0) {
                    await fetch(`${BASE_URL}/globals`, {
                        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(legacyVars),
                    });
                    globalVariables = legacyVars;
                    localStorage.removeItem('apitester-global-vars');
                }
            } catch { /* malformed or absent legacy data — nothing to migrate */ }
        }
        set({ globalVariables, loaded: true });
    },

    setGlobalVariables: async (vars) => {
        await fetch(`${BASE_URL}/globals`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vars),
        });
        set({ globalVariables: vars });
    },
}));
