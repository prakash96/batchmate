import { create } from 'zustand';
import { BASE_URL } from '../config';

// Global variables — scoped per workspace (see globals-api.xml / schema.sql's global_vars
// table), merged (lowest priority) into every request run whose collection belongs to that
// workspace, on the backend itself (see execution-engine.xml's run-request) so they're shared
// across browsers/machines rather than living only in one browser's localStorage.
export const useGlobalVarsStore = create((set, get) => ({
    globalVariables: {},
    loaded: false,
    // Which workspace's globals `globalVariables` currently holds — null until a fetch happens.
    // GlobalVarsPanel re-fetches whenever the user switches this.
    loadedWorkspaceId: null,

    fetchGlobalVariables: async (workspaceId) => {
        const res = await fetch(`${BASE_URL}/workspaces/${workspaceId}/globals`);
        const globalVariables = await res.json();
        set({ globalVariables, loaded: true, loadedWorkspaceId: workspaceId });
    },

    setGlobalVariables: async (workspaceId, vars) => {
        await fetch(`${BASE_URL}/workspaces/${workspaceId}/globals`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vars),
        });
        set({ globalVariables: vars, loadedWorkspaceId: workspaceId });
    },
}));
