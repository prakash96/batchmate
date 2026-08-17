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

/** Full ancestor chain (root-to-leaf, INCLUSIVE of `id` itself) for a collection somewhere in the
 *  tree, or null if not found — used to force-expand every collapsed folder standing between the
 *  tree root and something just created there (see expandPathToCollection below). */
function ancestorChain(folders, id, path = []) {
    for (const f of folders) {
        if (f.id === id) return [...path, f.id];
        const found = ancestorChain(f.folders || [], id, [...path, f.id]);
        if (found) return found;
    }
    return null;
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
    // [{id, name, locked}] — the scope ABOVE collections; see workspaces-api.xml. Every
    // collection in `folders` carries a workspaceId, and a collection whose workspace is locked
    // is simply absent from `folders` until unlockWorkspace below merges it back in.
    workspaces: [],
    activeRequestId: null,
    loading: false,
    // { [requestId]: 'success' | 'failed' } — last known run outcome, session-only (not
    // persisted). A run's own "status" is already "failed" if ANY iteration failed (see
    // run-request's status computation), so this is just tracking that field per request for
    // the sidebar's red-highlight. Populated by runRequest below (single Send) and by
    // runAllStore's runAll/fetchLastReport (Run All), via setLastRunStatuses.
    lastRunStatus: {},

    // Expand/collapse state for the sidebar tree, LIFTED here (rather than local useState in
    // WorkspaceRow/FolderRow) so any code path — not just a click on that row's own toggle — can
    // force something open. Absent from the map = expanded (the default for anything newly
    // rendered, matching the old local-state default); only an explicit `false` collapses it.
    // Without this, a collection/request created from elsewhere (e.g. SwaggerPayloadModal's
    // "create collection" buttons) that lands inside an already-collapsed workspace/folder would
    // be genuinely present in `folders` but invisibly nested behind that collapsed toggle — a
    // page reload remounts everything back to the default-expanded state, which is exactly why
    // that used to look like "only shows up after refresh" (it was there all along, just hidden).
    expandedWorkspaces: {},
    expandedFolders: {},

    setWorkspaceExpanded: (id, expanded) => set(s => ({ expandedWorkspaces: { ...s.expandedWorkspaces, [id]: expanded } })),
    setFolderExpanded: (id, expanded) => set(s => ({ expandedFolders: { ...s.expandedFolders, [id]: expanded } })),

    // Forces the workspace AND every ancestor folder of `collectionId` open — call this after
    // creating something inside an existing collection from anywhere other than that row's own
    // "+" button (which is already visibly open when clicked), since there's no other way to
    // know whether that target was sitting collapsed. collectionId may be null (nothing to walk).
    expandPathToCollection: (workspaceId, collectionId) => set(s => {
        const chain = collectionId ? (ancestorChain(s.folders, collectionId) || []) : [];
        const expandedFolders = { ...s.expandedFolders };
        chain.forEach(id => { expandedFolders[id] = true; });
        return { expandedWorkspaces: { ...s.expandedWorkspaces, [workspaceId]: true }, expandedFolders };
    }),

    fetchWorkspaces: async () => {
        const res = await fetch(`${BASE_URL}/workspaces`);
        const workspaces = await res.json();
        set({ workspaces });
    },

    fetchCollections: async () => {
        set({ loading: true });
        const res = await fetch(`${BASE_URL}/collections`);
        const folders = await res.json();
        set({ folders, loading: false });
    },

    // password is optional — pass a non-empty string to password-protect the new workspace
    // (enforced server-side, see get-workspaces/unlock-workspace; never sent back to us).
    addWorkspace: async (name, password) => {
        const res = await fetch(`${BASE_URL}/workspaces`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, password: password || undefined }),
        });
        const ws = await res.json();
        set(s => ({ workspaces: [...s.workspaces, ws] }));
        return ws;
    },

    renameWorkspace: async (id, name) => {
        await fetch(`${BASE_URL}/workspaces/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
        });
        set(s => ({ workspaces: s.workspaces.map(w => w.id === id ? { ...w, name } : w) }));
    },

    deleteWorkspace: async (id) => {
        await fetch(`${BASE_URL}/workspaces/${id}`, { method: 'DELETE' });
        set(s => ({
            workspaces: s.workspaces.filter(w => w.id !== id),
            // Backend only detaches (workspace_id = NULL), doesn't delete, the collections —
            // mirror that here by dropping them from view rather than deleting them from state.
            folders: s.folders.filter(f => f.workspaceId !== id),
        }));
    },

    // Verifies the password against the workspace's stored hash; on success, merges that
    // workspace's real collection/request subtree (which was previously entirely absent from
    // `folders`, not just hidden) into state. Throws (with a user-facing message) on a wrong
    // password or a 404, so the caller can show that inline.
    unlockWorkspace: async (workspaceId, password) => {
        const res = await fetch(`${BASE_URL}/workspaces/${workspaceId}/unlock`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || `Unlock failed (${res.status})`);
        set(s => ({
            workspaces: s.workspaces.map(w => w.id === workspaceId ? { ...w, locked: false } : w),
            folders: [...s.folders.filter(f => f.workspaceId !== workspaceId), ...(body.collections || [])],
        }));
        return body;
    },

    // workspaceId is required when parentId is null (a root collection must belong to a
    // workspace); for a nested sub-folder, callers pass the parent collection's own workspaceId.
    addCollection: async (name, parentId, workspaceId) => {
        const res = await fetch(`${BASE_URL}/collections`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, parentId, workspaceId }),
        });
        const col = await res.json();
        set(s => ({ folders: insertFolder(s.folders, parentId, { ...col, requests: [], folders: [] }) }));
        return col;
    },

    // Bulk import (Postman/Swagger/Apitester-format) — one call creates every collection/request
    // in `roots` (each a {name, variables?, requests?, folders?} tree, arbitrarily nested) in a
    // single backend round trip instead of one HTTP call per collection/request like the old
    // addCollection+addRequestToCollection+saveRequest loop. mergeIntoParent (only valid with
    // exactly one entry in `roots` and a real parentId) skips creating a wrapper collection for
    // that lone root and attaches its requests/folders directly under parentId instead — see
    // collections-api.xml's import-collections for the full contract. Refetches the tree after
    // (simplest way to pick up every new id without hand-merging a big nested response).
    importCollections: async (workspaceId, parentId, mergeIntoParent, roots) => {
        const res = await fetch(`${BASE_URL}/collections/import`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspaceId, parentId, mergeIntoParent, roots }),
        });
        if (!res.ok) throw new Error(`Import failed (${res.status})`);
        const result = await res.json();
        // The import itself already succeeded server-side at this point — if this refetch hiccups
        // (a network blip, not the import failing), don't let that surface as "import failed" and
        // don't leave the caller's alert implying nothing happened; log it and let the caller's
        // next natural fetchCollections (or a manual reload) pick up what's already saved.
        try {
            await get().fetchCollections();
        } catch (err) {
            console.error('Import succeeded but refreshing the collection tree failed — reload to see it:', err);
        }
        return result;
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

    setLastRunStatus: (requestId, status) => set(s => ({ lastRunStatus: { ...s.lastRunStatus, [requestId]: status } })),
    // entries: { [requestId]: status } — bulk update, used by Run All's per-request results.
    setLastRunStatuses: (entries) => set(s => ({ lastRunStatus: { ...s.lastRunStatus, ...entries } })),

    runRequest: async (requestId, variables) => {
        const res = await fetch(`${BASE_URL}/requests/${requestId}/run`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ variables: variables || {} }),
        });
        const result = await res.json();
        if (result?.status) set(s => ({ lastRunStatus: { ...s.lastRunStatus, [requestId]: result.status } }));
        return result;
    },
}));
