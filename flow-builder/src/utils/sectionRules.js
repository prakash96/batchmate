import { useMetadataStore } from '../store/metadataStore';
import { EH_HEADER_H, EH_BODY_H } from '../components/nodes/WorkflowContainerNode';

export function getAbsolutePosition(node, nodes) {
    let x = node.position.x;
    let y = node.position.y;
    let current = node;
    while (current.parentId) {
        const parent = nodes.find(n => n.id === current.parentId);
        if (!parent) break;
        x += parent.position.x;
        y += parent.position.y;
        current = parent;
    }
    return { x, y };
}

const SECTION_INFO = {
    processing:       { sectionType: "processing",       label: "Processing" },
    processingFailed: { sectionType: "processingFailed", label: "Error Handler" },
};

// Legacy single-container uses top 65% = processing, bottom 35% = processingFailed
const TOP_FRACTION = 0.65;

export function getSectionForPosition(position, nodes) {
    const containers = nodes.filter(n => n.type === "workflowcontainer");

    // Legacy: single container with no containerType — use top/bottom split
    if (containers.length === 1 && !containers[0].data?.containerType) {
        const c = containers[0];
        const w = c.measured?.width  ?? c.style?.width  ?? 640;
        const h = c.measured?.height ?? c.style?.height ?? 560;
        if (
            position.x >= c.position.x && position.x <= c.position.x + w &&
            position.y >= c.position.y && position.y <= c.position.y + h
        ) {
            const relY = position.y - c.position.y;
            const info = relY <= h * TOP_FRACTION ? SECTION_INFO.processing : SECTION_INFO.processingFailed;
            return { ...c, data: { ...c.data, ...info } };
        }
        return null;
    }

    // Multi-container: each container has its own containerType
    for (const c of containers) {
        if (c.data?.minimized) continue;
        const w = c.measured?.width  ?? c.style?.width  ?? 640;
        const h = c.measured?.height ?? c.style?.height ?? 400;
        if (
            position.x >= c.position.x && position.x <= c.position.x + w &&
            position.y >= c.position.y && position.y <= c.position.y + h
        ) {
            const ctype = c.data?.containerType || "processing";

            // Processing containers always have an error handler zone at the bottom.
            // The zone height = EH_HEADER_H (collapsed) or EH_HEADER_H + EH_BODY_H (expanded).
            if (ctype === "processing") {
                const zoneH = c.data?.errorHandlerExpanded
                    ? EH_HEADER_H + EH_BODY_H
                    : EH_HEADER_H;
                if (position.y >= c.position.y + h - zoneH) {
                    return { ...c, data: { ...c.data, ...SECTION_INFO.processingFailed } };
                }
            }

            const info = SECTION_INFO[ctype] ?? SECTION_INFO.processing;
            return { ...c, data: { ...c.data, ...info } };
        }
    }

    // Fallback: legacy separate section nodes
    return nodes.find(n => {
        if (n.type !== "section") return false;
        const w = n.measured?.width ?? n.style?.width ?? 200;
        const h = n.measured?.height ?? n.style?.height ?? 450;
        return (
            position.x >= n.position.x && position.x <= n.position.x + w &&
            position.y >= n.position.y && position.y <= n.position.y + h
        );
    }) ?? null;
}

export function isAllowedInSection(nodeType, sectionType) {
    if (!sectionType) return true;
    const { nodeMetaMap } = useMetadataStore.getState();
    const meta = nodeMetaMap[nodeType];
    if (!meta?.zones) return true;
    return meta.zones.includes(sectionType);
}

export function getContainerIds(nodes) {
    return new Set(nodes.filter(n => n.type === "workflowcontainer").map(n => n.id));
}
