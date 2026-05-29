import { create } from "zustand";
import { BASE_URL } from "../config";

export const useVaultStore = create((set, get) => ({
    vaultPackages: [],

    fetchVaultPackages: async () => {
        try {
            const res = await fetch(`${BASE_URL}/vault/packages`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            set({ vaultPackages: await res.json() });
        } catch (err) {
            console.error("Failed to load vault packages:", err);
        }
    },

    // ── Entries ───────────────────────────────────────────────────────────────

    addVaultEntry: async (entry) => {
        const id = `vault-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newEntry = { ...entry, id };
        try {
            await fetch(`${BASE_URL}/vault`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newEntry),
            });
        } catch (err) {
            console.error("Failed to save vault entry:", err);
        }
        await get().fetchVaultPackages();
        return id;
    },

    updateVaultEntry: async (id, patch) => {
        try {
            const res = await fetch(`${BASE_URL}/vault`);
            const all = res.ok ? await res.json() : [];
            const updated = { ...(all.find(e => e.id === id) || {}), ...patch };
            await fetch(`${BASE_URL}/vault/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updated),
            });
        } catch (err) {
            console.error("Failed to update vault entry:", err);
        }
        await get().fetchVaultPackages();
    },

    deleteVaultEntry: async (id) => {
        try {
            await fetch(`${BASE_URL}/vault/${id}`, { method: "DELETE" });
        } catch (err) {
            console.error("Failed to delete vault entry:", err);
        }
        await get().fetchVaultPackages();
    },

    // ── Packages ──────────────────────────────────────────────────────────────

    addVaultPackage: async (name, parentId) => {
        try {
            await fetch(`${BASE_URL}/vault/packages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, parentId: parentId || null }),
            });
        } catch (err) {
            console.error("Failed to add vault package:", err);
        }
        await get().fetchVaultPackages();
    },

    renameVaultPackage: async (id, name) => {
        try {
            await fetch(`${BASE_URL}/vault/packages/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
        } catch (err) {
            console.error("Failed to rename vault package:", err);
        }
        await get().fetchVaultPackages();
    },

    deleteVaultPackage: async (id) => {
        try {
            await fetch(`${BASE_URL}/vault/packages/${id}`, { method: "DELETE" });
        } catch (err) {
            console.error("Failed to delete vault package:", err);
        }
        await get().fetchVaultPackages();
    },

    moveVaultPackage: async (id, parentId) => {
        try {
            await fetch(`${BASE_URL}/vault/packages/${id}/move`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ parentId: parentId || null }),
            });
        } catch (err) {
            console.error("Failed to move vault package:", err);
        }
        await get().fetchVaultPackages();
    },
}));
