import { create } from 'zustand';
import { BASE_URL } from '../config';
import { useCollectionStore } from './collectionStore';

// Pushes each result's status into collectionStore's lastRunStatus map, so the sidebar's
// red-highlight (see CollectionTree.jsx's RequestRow) reflects Run All results too, not just a
// single Send. A result's own "status" is already "failed" if any of ITS iterations failed.
function applyStatuses(report) {
    if (!report?.results?.length) return;
    const entries = {};
    for (const r of report.results) entries[r.requestId] = r.status;
    useCollectionStore.getState().setLastRunStatuses(entries);
}

// "Run All" for a collection — runs every main request (see the backend's CollectionRunService
// javadoc for what "main" means) and returns/persists a consolidated report.
export const useRunAllStore = create(() => ({
    runAll: async (collectionId) => {
        const res = await fetch(`${BASE_URL}/collections/${collectionId}/run-all`, { method: 'POST' });
        if (!res.ok) throw new Error(`Run All failed (${res.status})`);
        const report = await res.json();
        applyStatuses(report);
        return report;
    },

    fetchLastReport: async (collectionId) => {
        const res = await fetch(`${BASE_URL}/collections/${collectionId}/run-all/last`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`Failed to load last report (${res.status})`);
        const report = await res.json();
        applyStatuses(report);
        return report;
    },

    // Excel export is built server-side (run-all-api.xml's build-excel-report, Groovy + POI) and
    // streamed back as the response body — NOT client-side ExcelJS (that path corrupted real
    // Excel files: exceljs 4.4.0's dataBar conditional formatting writes a malformed x14
    // extension block, see runAllExcel.js's git history / exceljs#3015). Just a blob download of
    // whatever bytes the backend sends.
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
