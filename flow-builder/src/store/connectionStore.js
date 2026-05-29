import { create } from "zustand";
import { BASE_URL } from "../config";

export const useConnectionStore = create((set, get) => ({
    connections: [],

    fetchConnections: async () => {
        try {
            const res = await fetch(`${BASE_URL}/connections`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            set({ connections: await res.json() });
        } catch (err) {
            console.error("Failed to load connections:", err);
        }
    },

    addConnection: async (conn) => {
        const id = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newConn = { ...conn, id };
        set(s => ({ connections: [...s.connections, newConn] }));
        fetch(`${BASE_URL}/connections`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newConn),
        }).catch(err => console.error("Failed to save connection:", err));
        return id;
    },

    updateConnection: (id, patch) => {
        set(s => ({ connections: s.connections.map(c => c.id === id ? { ...c, ...patch } : c) }));
        const updated = get().connections.find(c => c.id === id);
        fetch(`${BASE_URL}/connections/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated),
        }).catch(err => console.error("Failed to update connection:", err));
    },

    deleteConnection: (id) => {
        set(s => ({ connections: s.connections.filter(c => c.id !== id) }));
        fetch(`${BASE_URL}/connections/${id}`, { method: "DELETE" })
            .catch(err => console.error("Failed to delete connection:", err));
    },

    getByType: (type) => get().connections.filter(c => c.type === type),
}));
