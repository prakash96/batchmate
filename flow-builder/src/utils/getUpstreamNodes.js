/**
 * Returns all ancestor nodes of the given nodeId by walking edges backwards.
 * Also walks up the parentId chain (so nodes inside an iteration see the
 * iteration node and anything upstream of it).
 */
export function getUpstreamNodes(nodeId, nodes, edges) {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Build reverse adjacency: target → set of sources
    const incoming = new Map();
    for (const e of edges) {
        if (!incoming.has(e.target)) incoming.set(e.target, new Set());
        incoming.get(e.target).add(e.source);
    }

    const visited = new Set();
    const queue = [nodeId];

    while (queue.length) {
        const id = queue.shift();
        if (visited.has(id)) continue;
        visited.add(id);

        for (const src of (incoming.get(id) || [])) {
            if (!visited.has(src)) queue.push(src);
        }

        // Parent container (e.g. iteration) is also upstream
        const node = nodeMap.get(id);
        if (node?.parentId && !visited.has(node.parentId)) {
            queue.push(node.parentId);
        }
    }

    visited.delete(nodeId);
    return nodes.filter(n => visited.has(n.id));
}
