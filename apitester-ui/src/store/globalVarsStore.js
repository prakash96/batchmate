import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Same convention as flow-builder's persistentStore.js — global variables that get
// merged (lowest priority) into every request run, persisted across reloads.
export const useGlobalVarsStore = create(persist(
    (set, get) => ({
        globalVariables: {},
        setGlobalVariables: (vars) => set({ globalVariables: vars }),
        updateGlobalVariable: (name, value) => set(s => ({ globalVariables: { ...s.globalVariables, [name]: value } })),
        removeGlobalVariable: (name) => set(s => {
            const next = { ...s.globalVariables };
            delete next[name];
            return { globalVariables: next };
        }),
    }),
    { name: 'apitester-global-vars' },
));
