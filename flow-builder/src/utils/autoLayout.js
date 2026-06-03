const GAP             = 28;   // horizontal gap between nodes
const PAD_X           = 24;   // horizontal padding inside a container
const CONTAINER_HDR   = 30;   // workflowcontainer header height
const ITERATION_HDR   = 22;   // iteration/errorscope header height
const ROW_GAP         = 32;   // vertical gap between YES and NO rows
import { EH_HEADER_H, EH_BODY_H } from '../components/nodes/WorkflowContainerNode';

/* ── order siblings by following the edge chain (YES handle counts as main path) ── */
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
            e.source === cur.id &&
            (!e.sourceHandle || e.sourceHandle === "true") &&
            ids.has(e.target) && !seen.has(e.target)
        );
        cur = nx ? children.find(n => n.id === nx.target) : null;
    }
    children.forEach(n => { if (!seen.has(n.id)) out.push(n); });
    return out;
}

/* ── collect nodes reachable from NO-branch edges within a sibling set ── */
function noRouteSet(children, edges) {
    const ids = new Set(children.map(n => n.id));
    const entries = edges
        .filter(e => e.sourceHandle === "false" && ids.has(e.source) && ids.has(e.target))
        .map(e => e.target);
    const result = new Set(entries);
    const queue  = [...entries];
    while (queue.length) {
        const nodeId = queue.shift();
        edges
            .filter(e => e.source === nodeId && !e.sourceHandle && ids.has(e.target) && !result.has(e.target))
            .forEach(e => { result.add(e.target); queue.push(e.target); });
    }
    return result;
}

/* ── layout a row of nodes and handle iteration/errorscope children ── */
function layoutRow(ordered, startY, map, edges, startX = PAD_X) {
    let x = startX;
    for (const node of ordered) {
        const ref = map[node.id];
        ref.position = { x, y: startY };

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
    return x; // returns x after last node (for width calculation)
}

/* ── x position where the NO row should start (right after the condition node) ── */
function noRowStartX(orderedMain, noKids, map, edges) {
    const noIds = new Set(noKids.map(n => n.id));
    const condNode = orderedMain.find(n =>
        edges.some(e => e.source === n.id && e.sourceHandle === "false" && noIds.has(e.target))
    );
    if (!condNode) return PAD_X;
    const ref = map[condNode.id];
    return ref.position.x + (ref.style?.width || 58) + GAP;
}

/* ── layout nodes inside a scope (container or iteration/errorscope) ── */
function layoutScope(scopeId, isContainer, map, edges) {
    const scope    = map[scopeId];
    const hdr      = isContainer ? CONTAINER_HDR : ITERATION_HDR;
    const children = Object.values(map).filter(n => n.parentId === scopeId);
    if (!children.length) return;

    const scopeH = scope?.style?.height || 300;

    if (isContainer) {
        // Split children by section so EH nodes stay in the EH body zone
        const ehExpanded   = scope?.data?.errorHandlerExpanded ?? false;
        const ehZoneH      = ehExpanded ? EH_HEADER_H + EH_BODY_H : EH_HEADER_H;
        const processingH  = Math.max(scopeH - hdr - ehZoneH, 40);

        const processingKids = children.filter(n => n.data?.section !== "processingFailed");
        const ehKids         = children.filter(n => n.data?.section === "processingFailed");

        // Split processing kids into YES-path (main) and NO-branch rows
        const noIds      = noRouteSet(processingKids, edges);
        const mainKids   = processingKids.filter(n => !noIds.has(n.id));
        const noKids     = processingKids.filter(n =>  noIds.has(n.id));

        const orderedMain = chainOrder(mainKids, edges);
        const orderedNo   = chainOrder(noKids,   edges);

        const maxHMain = orderedMain.length ? Math.max(...orderedMain.map(n => n.style?.height || 58)) : 0;
        const maxHNo   = orderedNo.length   ? Math.max(...orderedNo.map(n =>   n.style?.height || 58)) : 0;

        let nodeYMain, nodeYNo;
        if (orderedNo.length === 0) {
            nodeYMain = hdr + Math.max(8, (processingH - maxHMain) / 2);
        } else {
            const totalH = maxHMain + ROW_GAP + maxHNo;
            const startY = hdr + Math.max(8, (processingH - totalH) / 2);
            nodeYMain = startY;
            nodeYNo   = startY + maxHMain + ROW_GAP;
        }

        const xAfterMain = layoutRow(orderedMain, nodeYMain, map, edges);
        const noStartX   = orderedNo.length ? noRowStartX(orderedMain, noKids, map, edges) : PAD_X;
        const xAfterNo   = orderedNo.length ? layoutRow(orderedNo, nodeYNo, map, edges, noStartX) : PAD_X;

        // EH row — vertically centred in the EH body, only when expanded
        let xAfterEH = PAD_X;
        if (ehExpanded && ehKids.length) {
            const orderedEH = chainOrder(ehKids, edges);
            const maxHEH    = Math.max(...orderedEH.map(n => n.style?.height || 58));
            const ehBodyTop = scopeH - EH_BODY_H;
            const nodeYEH   = ehBodyTop + Math.max(8, (EH_BODY_H - maxHEH) / 2);
            xAfterEH = layoutRow(orderedEH, nodeYEH, map, edges);
        }

        // Widen the container to fit the widest row
        if (scope) {
            const totalW = Math.max(xAfterMain, xAfterNo, xAfterEH) - GAP + PAD_X;
            scope.style  = { ...scope.style, width: Math.max(totalW, 300) };
        }
    } else {
        // iteration / errorscope — split into YES and NO rows
        const noIds    = noRouteSet(children, edges);
        const mainKids = children.filter(n => !noIds.has(n.id));
        const noKids   = children.filter(n =>  noIds.has(n.id));

        const orderedMain = chainOrder(mainKids, edges);
        const orderedNo   = chainOrder(noKids,   edges);

        const maxHMain = orderedMain.length ? Math.max(...orderedMain.map(n => n.style?.height || 58)) : 0;
        const maxHNo   = orderedNo.length   ? Math.max(...orderedNo.map(n =>   n.style?.height || 58)) : 0;

        let nodeYMain, nodeYNo;
        if (orderedNo.length === 0) {
            nodeYMain = hdr + Math.max(8, (scopeH - hdr - maxHMain) / 2);
        } else {
            const totalH = maxHMain + ROW_GAP + maxHNo;
            const startY = hdr + Math.max(8, (scopeH - hdr - totalH) / 2);
            nodeYMain = startY;
            nodeYNo   = startY + maxHMain + ROW_GAP;
        }

        layoutRow(orderedMain, nodeYMain, map, edges);
        if (orderedNo.length) {
            const noStartX = noRowStartX(orderedMain, noKids, map, edges);
            layoutRow(orderedNo, nodeYNo, map, edges, noStartX);
        }
    }
}

/**
 * Returns a new nodes array where every node inside a workflowcontainer
 * is repositioned to a clean horizontal row, centered vertically.
 * NO-branch nodes are placed in a second row below the YES/main row.
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
