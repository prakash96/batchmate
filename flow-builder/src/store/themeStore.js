import { create } from 'zustand';

const KEY = 'bm-theme';
const saved = localStorage.getItem(KEY) || 'dark';
document.documentElement.setAttribute('data-theme', saved);

export const useThemeStore = create((set) => ({
  theme: saved,
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(KEY, next);
      document.documentElement.setAttribute('data-theme', next);
      return { theme: next };
    }),
}));
