import { create } from 'zustand';
import { BASE_URL } from '../config';

export const useConnectionStore = create((set, get) => ({
    connections: [],
    connectionTypes: {},

    fetchAll: async () => {
        const [connRes, typesRes] = await Promise.all([
            fetch(`${BASE_URL}/connections`),
            fetch(`${BASE_URL}/config/connection-types`),
        ]);
        set({ connections: await connRes.json(), connectionTypes: await typesRes.json() });
    },

    getByType: (type) => get().connections.filter(c => c.type === type),

    save: async (conn) => {
        await fetch(`${BASE_URL}/connections`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(conn),
        });
        await get().fetchAll();
    },

    update: async (id, conn) => {
        await fetch(`${BASE_URL}/connections/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(conn),
        });
        await get().fetchAll();
    },

    remove: async (id) => {
        await fetch(`${BASE_URL}/connections/${id}`, { method: 'DELETE' });
        await get().fetchAll();
    },

    test: async (conn) => {
        const res = await fetch(`${BASE_URL}/connections/test`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(conn),
        });
        return res.json();
    },
}));
