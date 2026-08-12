import { create } from 'zustand';
import { BASE_URL } from '../config';

// ── Tree helpers (same recursion pattern as flow-builder's workflowStore.js,
//    adapted for {folders, requests} instead of {packages, workflows}) ──────

function findFolder(folders, id) {
    for (const f of folders) {
        if (f.id === id) return f;
        const found = findFolder(f.folders || [], id);
        if (found) return found;
    }
    return null;
}

function insertFolder(folders, parentId, newFolder) {
    if (!parentId) return [...folders, newFolder];
    return folders.map(f => f.id === parentId
        ? { ...f, folders: [...(f.folders || []), newFolder] }
        : { ...f, folders: insertFolder(f.folders || [], parentId, newFolder) });
}

function removeFolder(folders, id) {
    return folders
        .filter(f => f.id !== id)
        .map(f => ({ ...f, folders: removeFolder(f.folders || [], id) }));
}

function renameInFolders(folders, id, name) {
    return folders.map(f => f.id === id
        ? { ...f, name }
        : { ...f, folders: renameInFolders(f.folders || [], id, name) });
}

function updateRequestInFolders(folders, requestId, patch) {
    return folders.map(f => ({
        ...f,
        requests: (f.requests || []).map(r => r.id === requestId ? { ...r, ...patch } : r),
        folders: updateRequestInFolders(f.folders || [], requestId, patch),
    }));
}

/** Flat list of every request in the tree — used by the "Call Request" picker. */
export function flattenRequests(folders) {
    let out = [];
    for (const f of folders) {
        out = out.concat(f.requests || []);
        out = out.concat(flattenRequests(f.folders || []));
    }
    return out;
}

export const useCollectionStore = create((set, get) => ({
    folders: [],
    activeRequestId: null,
    loading: false,

    fetchCollections: async () => {
        set({ loading: true });
        const res = await fetch(`${BASE_URL}/collections`);
        const folders = await res.json();
        set({ folders, loading: false });
    },

    addCollection: async (name, parentId) => {
        const res = await fetch(`${BASE_URL}/collections`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, parentId }),
        });
        const col = await res.json();
        set(s => ({ folders: insertFolder(s.folders, parentId, { ...col, requests: [], folders: [] }) }));
        return col;
    },

    renameCollection: async (id, name) => {
        await fetch(`${BASE_URL}/collections/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
        });
        set(s => ({ folders: renameInFolders(s.folders, id, name) }));
    },

    setCollectionVariables: async (id, variables) => {
        await fetch(`${BASE_URL}/collections/${id}/variables`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(variables),
        });
        set(s => ({
            folders: (function patch(folders) {
                return folders.map(f => f.id === id ? { ...f, variables } : { ...f, folders: patch(f.folders || []) });
            })(s.folders),
        }));
    },

    deleteCollection: async (id) => {
        await fetch(`${BASE_URL}/collections/${id}`, { method: 'DELETE' });
        set(s => ({ folders: removeFolder(s.folders, id) }));
    },

    moveCollection: async (id, parentId) => {
        await fetch(`${BASE_URL}/collections/${id}/move`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId }),
        });
        await get().fetchCollections();
    },

    addRequestToCollection: async (collectionId, name) => {
        const res = await fetch(`${BASE_URL}/collections/${collectionId}/requests`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
        });
        const req = await res.json();
        set(s => ({
            folders: (function patch(folders) {
                return folders.map(f => f.id === collectionId
                    ? { ...f, requests: [...(f.requests || []), req] }
                    : { ...f, folders: patch(f.folders || []) });
            })(s.folders),
        }));
        return req;
    },

    saveRequest: async (request) => {
        await fetch(`${BASE_URL}/requests/${request.id}/save`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
        });
        set(s => ({ folders: updateRequestInFolders(s.folders, request.id, request) }));
    },

    deleteRequest: async (collectionId, requestId) => {
        await fetch(`${BASE_URL}/collections/${collectionId}/requests/${requestId}`, { method: 'DELETE' });
        set(s => ({
            folders: (function patch(folders) {
                return folders.map(f => ({
                    ...f,
                    requests: (f.requests || []).filter(r => r.id !== requestId),
                    folders: patch(f.folders || []),
                }));
            })(s.folders),
            activeRequestId: s.activeRequestId === requestId ? null : s.activeRequestId,
        }));
    },

    moveRequest: async (collectionId, requestId, newCollectionId) => {
        await fetch(`${BASE_URL}/collections/${collectionId}/requests/${requestId}/move`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collectionId: newCollectionId }),
        });
        await get().fetchCollections();
    },

    setActiveRequest: (id) => set({ activeRequestId: id }),

    findRequest: (id) => flattenRequests(get().folders).find(r => r.id === id) || null,

    runRequest: async (requestId, variables) => {
        const res = await fetch(`${BASE_URL}/requests/${requestId}/run`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ variables: variables || {} }),
        });
        return res.json();
    },
}));
