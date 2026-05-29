export function createDefaultSections() {
    return [
        {
            id: "wc-processing",
            type: "workflowcontainer",
            position: { x: 20, y: 0 },
            data: { containerType: "processing" },
            style: { width: 760, height: 300 },
            draggable: true,
            selectable: true,
            deletable: false,
            zIndex: -1,
        },
        {
            id: "wc-processingFailed",
            type: "workflowcontainer",
            position: { x: 20, y: 308 },
            data: { containerType: "processingFailed", minimized: true, savedHeight: 200 },
            style: { width: 760, height: 30 },
            draggable: true,
            selectable: true,
            deletable: false,
            zIndex: -1,
        },
    ];
}

export function hasSections(nodes) {
    return nodes.some(n => n.type === "section" || n.type === "workflowcontainer");
}
