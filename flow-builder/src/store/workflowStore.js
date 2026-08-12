import { create } from "zustand";
import { BASE_URL } from "../config";
import {
    addEdge,
    applyNodeChanges,
    applyEdgeChanges
} from "@xyflow/react";
import { validateWorkflow } from "../engine/validateWorkflow";
import { createDefaultSections, hasSections } from "../utils/defaultSections";
import { useConnectionStore } from "./connectionStore";

// ── helpers ───────────────────────────────────────────────────────────────────

function flattenWorkflows(packages) {
    return packages.flatMap(pkg => [
        ...(pkg.workflows || []),
        ...flattenWorkflows(pkg.packages || []),
    ]);
}

function updateWorkflowInPackages(packages, workflowId, updater) {
    return packages.map(pkg => ({
        ...pkg,
        workflows: (pkg.workflows || []).map(w =>
            w.id === workflowId ? { ...w, ...updater } : w
        ),
        packages: updateWorkflowInPackages(pkg.packages || [], workflowId, updater),
    }));
}

function insertPackage(packages, parentId, newPkg) {
    if (!parentId) return [...packages, newPkg];
    return packages.map(pkg => {
        if (pkg.id === parentId) return { ...pkg, packages: [...(pkg.packages || []), newPkg] };
        return { ...pkg, packages: insertPackage(pkg.packages || [], parentId, newPkg) };
    });
}

function removePackage(packages, pkgId) {
    return packages
        .filter(pkg => pkg.id !== pkgId)
        .map(pkg => ({ ...pkg, packages: removePackage(pkg.packages || [], pkgId) }));
}

function renameInPackages(packages, pkgId, name) {
    return packages.map(pkg =>
        pkg.id === pkgId
            ? { ...pkg, name }
            : { ...pkg, packages: renameInPackages(pkg.packages || [], pkgId, name) }
    );
}

function findPackage(packages, pkgId) {
    for (const pkg of packages) {
        if (pkg.id === pkgId) return pkg;
        const found = findPackage(pkg.packages || [], pkgId);
        if (found) return found;
    }
    return null;
}

function collectWorkflowIds(pkg) {
    return [
        ...(pkg.workflows || []).map(w => w.id),
        ...(pkg.packages || []).flatMap(collectWorkflowIds),
    ];
}

function extractWorkflow(packages, workflowId, ref) {
    return packages.map(pkg => {
        const idx = (pkg.workflows || []).findIndex(w => w.id === workflowId);
        if (idx >= 0) {
            ref.wf = pkg.workflows[idx];
            return { ...pkg, workflows: pkg.workflows.filter((_, i) => i !== idx) };
        }
        return { ...pkg, packages: extractWorkflow(pkg.packages || [], workflowId, ref) };
    });
}

function injectWorkflow(packages, targetPkgId, wf) {
    return packages.map(pkg => {
        if (pkg.id === targetPkgId) return { ...pkg, workflows: [...(pkg.workflows || []), wf] };
        return { ...pkg, packages: injectWorkflow(pkg.packages || [], targetPkgId, wf) };
    });
}

// ── store ─────────────────────────────────────────────────────────────────────

export const useWorkflowStore = create((set, get) => ({

    // ── Canvas state ──────────────────────────────────────────────────────────
    nodes: [],
    edges: [],
    validationIssues: null,
    selectedNodeId: null,
    lastRunContext: {},   // { [workflowId]: { vars: {}, headers: {} } }

    setRunContext: (workflowId, context) =>
        set(state => ({ lastRunContext: { ...state.lastRunContext, [workflowId]: context } })),

    setSelectedNodeId: (id) =>
        set(state => ({ selectedNodeId: state.selectedNodeId === id ? null : id })),

    updateNodeData: (nodeId, newData) => {
        set(state => {
            const updatedNodes = state.nodes.map(n =>
                n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n
            );
            const expandedId = state.expandedRowId;
            const newPackages = updateWorkflowInPackages(state.packages, expandedId, {
                workflow: { nodes: structuredClone(updatedNodes), edges: structuredClone(state.edges) }
            });
            return { nodes: updatedNodes, packages: newPackages, workflows: flattenWorkflows(newPackages) };
        });
        const { validationIssues, expandedRowId, runValidation } = get();
        if (validationIssues !== null && expandedRowId) runValidation(expandedRowId);
    },

    onNodesChange: (changes) =>
        set(state => ({ nodes: applyNodeChanges(changes, state.nodes) })),

    onEdgesChange: (changes) =>
        set(state => ({ edges: applyEdgeChanges(changes, state.edges) })),

    onConnect: (connection) =>
        set(state => ({
            edges: addEdge(
                {
                    ...connection,
                    animated: false,
                    type: "smoothstep",
                    style: { stroke: "#888" },
                    label: connection.sourceHandle === "true" ? "YES"
                         : connection.sourceHandle === "false" ? "NO" : ""
                },
                state.edges
            )
        })),

    addNode: (node) => set(state => ({ nodes: [...state.nodes, node] })),
    clearSelectedNodeId: () => set({ selectedNodeId: null }),

    setNodes: (updater) =>
        set(state => ({
            nodes: typeof updater === "function" ? updater(state.nodes) : updater
        })),

    setEdges: (updater) =>
        set(state => ({
            edges: typeof updater === "function" ? updater(state.edges) : updater
        })),

    runValidation: (rowId) => {
        const state = get();
        const row = state.workflows.find(t => t.id === rowId);
        if (!row) return [];
        const nodes = state.expandedRowId === rowId ? state.nodes : (row.workflow?.nodes || []);
        const edges = state.expandedRowId === rowId ? state.edges : (row.workflow?.edges || []);
        const connections = useConnectionStore.getState().connections;
        const issues = validateWorkflow(nodes, edges, connections);
        set({ validationIssues: issues });
        return issues;
    },

    clearValidation: () => set({ validationIssues: null }),

    copied: { nodes: [], edges: [] },
    setCopied: (data) => set({ copied: data }),

    clipboardWorkflow: null,

    copyWorkflow: (workflowId) => {
        const state = get();
        const wf = state.workflows.find(w => w.id === workflowId);
        if (!wf) return;
        const isExpanded = state.expandedRowId === workflowId;
        const nodes = isExpanded ? state.nodes : (wf.workflow?.nodes || []);
        const edges = isExpanded ? state.edges : (wf.workflow?.edges || []);
        set({ clipboardWorkflow: { name: wf.name || "Untitled", nodes: structuredClone(nodes), edges: structuredClone(edges) } });
    },

    pasteWorkflow: async (targetPackageId) => {
        const { clipboardWorkflow } = get();
        if (!clipboardWorkflow || !targetPackageId) return;

        const workflowId = crypto.randomUUID();
        const newWf = {
            id: workflowId,
            packageId: targetPackageId,
            name: `Copy of ${clipboardWorkflow.name}`,
            description: "",
            inputBody: {},
            inputHeaders: {},
            workflow: {
                nodes: structuredClone(clipboardWorkflow.nodes),
                edges: structuredClone(clipboardWorkflow.edges),
            },
        };

        // Insert into state immediately with copied nodes — no intermediate empty state
        set(state => {
            const packages = injectWorkflow(state.packages, targetPackageId, newWf);
            return { packages, workflows: flattenWorkflows(packages) };
        });

        // Persist to backend
        await fetch(`${BASE_URL}/workflows/${workflowId}/save`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newWf),
        }).catch(console.error);
    },

    // ── Package + workflow list state ─────────────────────────────────────────
    packages: [],
    workflows: [],   // flat derived list — kept for canvas/validation compat
    expandedRowId: null,

    fetchWorkflows: async () => {
        // alias kept for any existing callers
        return get().fetchPackages();
    },

    fetchPackages: async () => {
        try {
            const res = await fetch(`${BASE_URL}/packages`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const packages = Array.isArray(data) ? data : [];
            set({ packages, workflows: flattenWorkflows(packages) });
        } catch (err) {
            console.error("Failed to load packages:", err);
            set({ packages: [], workflows: [] });
        }
    },

    // ── Package CRUD ──────────────────────────────────────────────────────────

    addPackage: async (name = "New Package", parentId = null) => {
        const body = parentId ? { name, parentId } : { name };
        const res = await fetch(`${BASE_URL}/packages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Failed to create package");
        const pkg = await res.json();
        const newPkg = { ...pkg, workflows: [], packages: [] };
        set(state => {
            const packages = insertPackage(state.packages, parentId, newPkg);
            return { packages, workflows: flattenWorkflows(packages) };
        });
        return newPkg;
    },

    renamePackage: async (packageId, name) => {
        await fetch(`${BASE_URL}/packages/${packageId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });
        set(state => {
            const packages = renameInPackages(state.packages, packageId, name);
            return { packages, workflows: flattenWorkflows(packages) };
        });
    },

    deletePackage: async (packageId) => {
        await fetch(`${BASE_URL}/packages/${packageId}`, { method: "DELETE" });
        set(state => {
            const expandedId = state.expandedRowId;
            const pkgToDelete = findPackage(state.packages, packageId);
            const deletedWorkflowIds = new Set(pkgToDelete ? collectWorkflowIds(pkgToDelete) : []);
            const packages = removePackage(state.packages, packageId);
            const shouldClose = deletedWorkflowIds.has(expandedId);
            return {
                packages,
                workflows: flattenWorkflows(packages),
                ...(shouldClose ? { expandedRowId: null, nodes: [], edges: [] } : {}),
            };
        });
    },

    // ── Workflow CRUD ─────────────────────────────────────────────────────────

    addWorkflowToPackage: async (packageId, name = "New Workflow") => {
        const res = await fetch(`${BASE_URL}/packages/${packageId}/workflows`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error("Failed to create workflow");
        const wf = await res.json();
        set(state => {
            const packages = injectWorkflow(state.packages, packageId, wf);
            return { packages, workflows: flattenWorkflows(packages) };
        });
        return wf;
    },

    deleteWorkflow: async (packageId, workflowId) => {
        await fetch(`${BASE_URL}/packages/${packageId}/workflows/${workflowId}`, {
            method: "DELETE",
        });
        set(state => {
            const packages = state.packages.map(p =>
                p.id === packageId
                    ? { ...p, workflows: (p.workflows || []).filter(w => w.id !== workflowId) }
                    : p
            );
            const shouldClose = state.expandedRowId === workflowId;
            return {
                packages,
                workflows: flattenWorkflows(packages),
                ...(shouldClose ? { expandedRowId: null, nodes: [], edges: [] } : {}),
            };
        });
    },

    renameWorkflow: (workflowId, name) => {
        set(state => {
            const packages = updateWorkflowInPackages(state.packages, workflowId, { name });
            return { packages, workflows: flattenWorkflows(packages) };
        });
        // Persist name via save
        const state = get();
        const wf = state.workflows.find(w => w.id === workflowId);
        if (wf) {
            fetch(`${BASE_URL}/workflows/${workflowId}/save`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...wf, name }),
            }).catch(console.error);
        }
    },

    moveWorkflow: async (workflowId, fromPackageId, toPackageId) => {
        fetch(`${BASE_URL}/packages/${fromPackageId}/workflows/${workflowId}/move`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ packageId: toPackageId }),
        }).catch(console.error);
        set(state => {
            const ref = {};
            const withRemoved = extractWorkflow(state.packages, workflowId, ref);
            if (!ref.wf) return state;
            const moved = { ...ref.wf, packageId: toPackageId };
            const packages = injectWorkflow(withRemoved, toPackageId, moved);
            return { packages, workflows: flattenWorkflows(packages) };
        });
    },

    movePackage: async (pkgId, newParentId) => {
        fetch(`${BASE_URL}/packages/${pkgId}/move`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parentId: newParentId ?? null }),
        }).catch(console.error);
        set(state => {
            const pkg = findPackage(state.packages, pkgId);
            if (!pkg) return state;
            const withRemoved = removePackage(state.packages, pkgId);
            const packages = insertPackage(withRemoved, newParentId, pkg);
            return { packages, workflows: flattenWorkflows(packages) };
        });
    },

    // ── Kept for import ───────────────────────────────────────────────────────
    setWorkflows: (value) => {
        // import drops raw workflow array → wrap in a single package
        const raw = typeof value === "function" ? value(get().workflows) : value;
        const pkg = { id: null, name: "Imported", workflows: raw };
        set({ packages: [pkg], workflows: flattenWorkflows([pkg]) });
    },

    updateWorkflow: (rowId, updater) =>
        set(state => {
            const packages = updateWorkflowInPackages(state.packages, rowId, updater);
            return { packages, workflows: flattenWorkflows(packages) };
        }),

    setExpandedRowId: (id) => set({ expandedRowId: id }),

    // ── Load / save canvas ────────────────────────────────────────────────────

    loadWorkflow: (rowId) => {
        const row = get().workflows.find(t => t.id === rowId);
        let nodes = row?.workflow?.nodes || [];
        const edges = row?.workflow?.edges || [];
        if (!hasSections(nodes)) nodes = [...createDefaultSections(), ...nodes];
        set({ expandedRowId: rowId, nodes, edges });
    },

    saveWorkflow: (rowId, nodes, edges) => {
        set(state => {
            const packages = updateWorkflowInPackages(state.packages, rowId, {
                workflow: { nodes: structuredClone(nodes), edges: structuredClone(edges) }
            });
            return { packages, workflows: flattenWorkflows(packages) };
        });
    },
}));
