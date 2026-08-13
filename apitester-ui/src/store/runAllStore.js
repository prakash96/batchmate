import { create } from 'zustand';
import { BASE_URL } from '../config';

// "Run All" for a collection — runs every main request (see the backend's CollectionRunService
// javadoc for what "main" means) and returns/persists a consolidated report.
export const useRunAllStore = create(() => ({
    runAll: async (collectionId) => {
        const res = await fetch(`${BASE_URL}/collections/${collectionId}/run-all`, { method: 'POST' });
        if (!res.ok) throw new Error(`Run All failed (${res.status})`);
        return res.json();
    },

    fetchLastReport: async (collectionId) => {
        const res = await fetch(`${BASE_URL}/collections/${collectionId}/run-all/last`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`Failed to load last report (${res.status})`);
        return res.json();
    },

    downloadExcel: async (collectionId) => {
        const res = await fetch(`${BASE_URL}/collections/${collectionId}/run-all/last/excel`);
        if (!res.ok) throw new Error(`Excel download failed (${res.status})`);
        const blob = await res.blob();
        const disposition = res.headers.get('Content-Disposition') || '';
        const match = /filename="([^"]+)"/.exec(disposition);
        const filename = match ? match[1] : 'run-all-report.xlsx';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    },
}));
