import { create } from 'zustand';
import { BASE_URL } from '../config';

// Templates — reusable pre-request/post-response step lists (see templates-api.xml's own file
// comment). Global, not scoped to a workspace/collection — one flat list, CRUD straight against
// the backend, same pattern as mockStore.js.
export const useTemplateStore = create((set, get) => ({
    templates: [],
    loaded: false,

    fetchTemplates: async () => {
        const res = await fetch(`${BASE_URL}/templates`);
        if (!res.ok) throw new Error(`Failed to load templates (${res.status})`);
        const templates = await res.json();
        set({ templates, loaded: true });
        return templates;
    },

    createTemplate: async (draft) => {
        const res = await fetch(`${BASE_URL}/templates`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
        });
        if (!res.ok) throw new Error(`Failed to create template (${res.status})`);
        const { id } = await res.json();
        await get().fetchTemplates();
        return id;
    },

    saveTemplate: async (id, draft) => {
        const res = await fetch(`${BASE_URL}/templates/${id}/save`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
        });
        if (!res.ok) throw new Error(`Failed to save template (${res.status})`);
        await get().fetchTemplates();
    },

    deleteTemplate: async (id) => {
        const res = await fetch(`${BASE_URL}/templates/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`Failed to delete template (${res.status})`);
        set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }));
    },
}));
