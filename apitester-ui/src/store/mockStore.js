import { create } from 'zustand';
import { BASE_URL } from '../config';

// Mock server endpoints — global, not scoped to a workspace/collection (see mock-api.xml's own
// file-level comment for why). One flat list, CRUD straight against the backend; no local-only
// draft state lives here — MockServerModal owns that while an endpoint is being edited.
export const useMockStore = create((set, get) => ({
    endpoints: [],
    loaded: false,

    fetchEndpoints: async () => {
        const res = await fetch(`${BASE_URL}/mock-endpoints`);
        if (!res.ok) throw new Error(`Failed to load mock endpoints (${res.status})`);
        const endpoints = await res.json();
        set({ endpoints, loaded: true });
        return endpoints;
    },

    createEndpoint: async (draft) => {
        const res = await fetch(`${BASE_URL}/mock-endpoints`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draft),
        });
        if (!res.ok) throw new Error(`Failed to create mock endpoint (${res.status})`);
        const { id } = await res.json();
        await get().fetchEndpoints();
        return id;
    },

    saveEndpoint: async (id, draft) => {
        const res = await fetch(`${BASE_URL}/mock-endpoints/${id}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draft),
        });
        if (!res.ok) throw new Error(`Failed to save mock endpoint (${res.status})`);
        await get().fetchEndpoints();
    },

    deleteEndpoint: async (id) => {
        const res = await fetch(`${BASE_URL}/mock-endpoints/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`Failed to delete mock endpoint (${res.status})`);
        set((s) => ({ endpoints: s.endpoints.filter((e) => e.id !== id) }));
    },
}));
