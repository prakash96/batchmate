import { create } from "zustand";
import { persist } from "zustand/middleware";

export const persistentStore = create(
  persist(
    (set, get) => ({
      globalVariables: {},

      setGlobalVariables: (vars) =>
        set({ globalVariables: vars }),

      updateGlobalVariable: (key, value) =>
        set((state) => ({
          globalVariables: {
            ...state.globalVariables,
            [key]: value
          }
        })),

      removeGlobalVariable: (key) =>
        set((state) => {
          const updated = { ...state.globalVariables };
          delete updated[key];
          return { globalVariables: updated };
        })
    }),
    {
      name: "workflow-global-vars"
    }
  )
);