import { useMemo } from "react";
import { useWorkflowStore } from "../store/workflowStore";
import { persistentStore } from "../store/persistentStore";
import { getOrderedNodes } from "../utils/getOrderedNodes";
import { getUpstreamNodes } from "../utils/getUpstreamNodes";

function extractPaths(obj, prefix, depth = 0, out = []) {
    if (depth > 3 || !obj || typeof obj !== "object" || Array.isArray(obj)) return out;
    for (const [key, val] of Object.entries(obj)) {
        const path = `${prefix}.${key}`;
        out.push(path);
        if (val && typeof val === "object" && !Array.isArray(val)) {
            extractPaths(val, path, depth + 1, out);
        }
    }
    return out;
}

export function useExpressionSuggestions(nodeId) {
    const nodes           = useWorkflowStore(s => s.nodes);
    const edges           = useWorkflowStore(s => s.edges);
    const lastRunContext  = useWorkflowStore(s => s.lastRunContext);
    const currentWorkflowId = useWorkflowStore(s => s.expandedRowId);

    return useMemo(() => {
        // Resolve upstream nodes; fall back to all nodes when no nodeId given
        const upstream = nodeId ? getUpstreamNodes(nodeId, nodes, edges) : nodes;

        // Order them topologically so later nodes (closer ancestors) win
        const upstreamIds = new Set(upstream.map(n => n.id));
        const upstreamEdges = edges.filter(e => upstreamIds.has(e.source) && upstreamIds.has(e.target));
        const ordered = getOrderedNodes(upstream, upstreamEdges);

        let body = null;
        const headers = {};
        const vars = {};

        // Seed with global variables (lowest priority)
        Object.assign(vars, persistentStore.getState().globalVariables || {});

        for (const node of ordered) {
            const d = node.data || {};

            // setvariable entries: [{name, expression}]
            if (node.type === "setvariable" && Array.isArray(d.entries)) {
                for (const entry of d.entries) {
                    if (entry.name?.trim()) vars[entry.name.trim()] = true;
                }
            }

            // Any node that stores a result in a named variable
            if (d.resultVar?.trim()) vars[d.resultVar.trim()] = true;

            // setbody with a plain JSON constant → infer body shape
            if (node.type === "setbody" && d.expression) {
                const expr = d.expression.trim();
                if (!expr.includes("${")) {
                    try { body = JSON.parse(expr); } catch { /* not JSON, skip */ }
                }
            }

            // Per-node runtime data (legacy lastResponse field)
            const lr = d.lastResponse;
            if (lr) {
                if (lr.body != null) body = lr.body;
                if (lr.headers) Object.assign(headers, lr.headers);
                if (lr.vars) Object.assign(vars, lr.vars);
            }
        }

        // Runtime context from last workflow run (highest priority — overrides static analysis)
        const runCtx = lastRunContext[currentWorkflowId];
        if (runCtx) {
            if (runCtx.vars)    Object.assign(vars,    runCtx.vars);
            if (runCtx.headers) Object.assign(headers, runCtx.headers);
        }

        const out = [];
        if (body && typeof body === "object") extractPaths(body, "body", 0, out);
        else if (body != null) out.push("body");
        Object.keys(headers).forEach(k => out.push(`headers.${k}`));
        Object.keys(vars).forEach(k => out.push(`vars.${k}`));

        return [...new Set(out)];
    }, [nodeId, nodes, edges, lastRunContext, currentWorkflowId]);
}
