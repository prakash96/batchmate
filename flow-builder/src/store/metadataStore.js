import { create } from "zustand";
import { BASE_URL } from "../config";
import { CORE_NODE_METADATA, INTERNAL_NODE_METADATA } from "../nodeMetadata";

const buildMetaMap = (externalNodeTypes) =>
    Object.fromEntries(
        [...CORE_NODE_METADATA, ...INTERNAL_NODE_METADATA, ...externalNodeTypes].map(m => [m.type, m])
    );

export const useMetadataStore = create((set) => ({
    connectionTypes: {},
    vaultTypes: {},
    nodeTypes: [],
    nodeMetaMap: buildMetaMap([]),

    fetchConnectionTypes: async () => {
        try {
            const res = await fetch(`${BASE_URL}/config/connection-types`);
            if (!res.ok) return;
            set({ connectionTypes: await res.json() });
        } catch (err) {
            console.error("Failed to load connection types:", err);
        }
    },

    fetchVaultTypes: async () => {
        try {
            const res = await fetch(`${BASE_URL}/config/vault-types`);
            if (!res.ok) return;
            set({ vaultTypes: await res.json() });
        } catch (err) {
            console.error("Failed to load vault types:", err);
        }
    },

    fetchNodeTypes: async () => {
        try {
            const res = await fetch(`${BASE_URL}/config/node-types`);
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                set({ nodeTypes: data, nodeMetaMap: buildMetaMap(data) });
            }
        } catch (err) {
            console.error("Failed to load node types:", err);
        }
    },

    fetchAll: async () => {
        const { fetchConnectionTypes, fetchVaultTypes, fetchNodeTypes } = useMetadataStore.getState();
        await Promise.all([fetchConnectionTypes(), fetchVaultTypes(), fetchNodeTypes()]);
    },
}));
