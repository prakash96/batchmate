const GAP             = 28;   // horizontal gap between nodes
const PAD_X           = 24;   // horizontal padding inside a container
const CONTAINER_HDR   = 30;   // workflowcontainer header height
const ITERATION_HDR   = 22;   // iteration/errorscope header height

/* ── order siblings by following the edge chain ── */
function chainOrder(children, edges) {
    if (!children.length) return [];
    const ids      = new Set(children.map(n => n.id));
    const targeted = new Set(
        edges.filter(e => ids.has(e.source) && ids.has(e.target)).map(e => e.target)
    );
    let cur = children.find(n => !targeted.has(n.id)) ?? children[0];
    const out = [], seen = new Set();
    while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        out.push(cur);
        const nx = edges.find(e =>
            e.source === cur.id && !e.sourceHandle &&
            ids.has(e.target) && !seen.has(e.target)
        );
        cur = nx ? children.find(n => n.id === nx.target) : null;
    }
    children.forEach(n => { if (!seen.has(n.id)) out.push(n); });
    return out;
}

/* ── layout nodes inside a scope (container or iteration/errorscope) ── */
function layoutScope(scopeId, isContainer, map, edges) {
    const scope    = map[scopeId];
    const hdr      = isContainer ? CONTAINER_HDR : ITERATION_HDR;
    const children = Object.values(map).filter(n => n.parentId === scopeId);
    if (!children.length) return;

    const ordered  = chainOrder(children, edges);
    const scopeH   = scope?.style?.height || 300;
    const maxNodeH = Math.max(...ordered.map(n => n.style?.height || 58));
    const nodeY    = hdr + Math.max(8, (scopeH - hdr - maxNodeH) / 2);

    let x = PAD_X;
    for (const node of ordered) {
        const ref = map[node.id];
        ref.position = { x, y: nodeY };

        /* recursively handle scope children */
        if (node.type === "iteration" || node.type === "errorscope") {
            const subChildren = Object.values(map).filter(n => n.parentId === node.id);
            if (subChildren.length) {
                const subOrdered = chainOrder(subChildren, edges);
                const subMaxH    = Math.max(...subOrdered.map(n => n.style?.height || 58));
                const newW       = PAD_X
                    + subOrdered.reduce((s, n) => s + (n.style?.width || 58) + GAP, 0)
                    - GAP + PAD_X;
                const newH = ITERATION_HDR + 12 + subMaxH + 12;
                ref.style = { ...ref.style, width: Math.max(newW, 180), height: Math.max(newH, 90) };
                layoutScope(node.id, false, map, edges);
            }
        }

        x += (ref.style?.width || 58) + GAP;
    }

    /* widen the container to fit all nodes */
    if (isContainer && scope) {
        const totalW = x - GAP + PAD_X;
        scope.style  = { ...scope.style, width: Math.max(totalW, 300) };
    }
}

/**
 * Returns a new nodes array where every node inside a workflowcontainer
 * is repositioned to a clean horizontal row, centered vertically.
 * Iteration/errorscope children are also laid out and the scopes resized.
 */
export function autoLayout(nodes, edges) {
    const map = {};
    nodes.forEach(n => {
        map[n.id] = {
            ...n,
            position: { ...n.position },
            style: n.style ? { ...n.style } : undefined,
        };
    });

    nodes
        .filter(n => n.type === "workflowcontainer")
        .forEach(c => layoutScope(c.id, true, map, edges));

    return Object.values(map);
}
