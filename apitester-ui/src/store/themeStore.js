import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Which color theme is active — a personal UI preference (unlike Global Variables, which moved
// to the backend because it's shared TEST data), so this stays in this browser's localStorage,
// same as before. The actual color values live in index.css under :root/[data-theme="classic"] —
// this store just tracks which one is selected and reflects it onto <html data-theme="...">
// (see App.jsx) so every inline style built from theme.js's var()-based tokens updates instantly.
export const THEMES = [
    { id: 'postman', label: '🟠 Postman' },
    { id: 'classic', label: '🔵 Classic' },
];

export const useThemeStore = create(persist(
    (set) => ({
        theme: 'postman',
        setTheme: (theme) => set({ theme }),
    }),
    { name: 'apitester-theme' },
));
