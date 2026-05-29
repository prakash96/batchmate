import { NodeResizer } from "@xyflow/react";
import { useWorkflowStore } from "../../store/workflowStore";

const HEADER_H = 30;

const CONFIGS = {
    processing: {
        label: "Processing",
        hint: "Transform / Route / Integrate / Transfer",
        color: "#475569",
        bg: "#f8fafc",
        border: "rgba(71,85,105,0.30)",
    },
    processingFailed: {
        label: "Error Handler",
        hint: "Catch / Notify / Recover",
        color: "#be123c",
        bg: "#fff1f2",
        border: "rgba(190,18,60,0.28)",
    },
};

function getDescendants(nodeId, nodes) {
    const direct = nodes.filter(n => n.parentId === nodeId);
    return direct.flatMap(n => [n, ...getDescendants(n.id, nodes)]);
}

export default function WorkflowContainerNode({ id, data, selected }) {
    const setNodes = useWorkflowStore(s => s.setNodes);
    const nodes = useWorkflowStore(s => s.nodes);

    const ctype = data?.containerType || "processing";
    const cfg = CONFIGS[ctype] ?? CONFIGS.processing;
    const minimized = !!data?.minimized;

    const toggle = (e) => {
        e.stopPropagation();
        const me = nodes.find(n => n.id === id);
        const curH = me?.style?.height ?? 340;
        const descIds = new Set(getDescendants(id, nodes).map(n => n.id));

        if (minimized) {
            const restore = data.savedHeight ?? 340;
            setNodes(nds => nds.map(n => {
                if (n.id === id) return { ...n, style: { ...n.style, height: restore }, data: { ...n.data, minimized: false } };
                if (descIds.has(n.id)) return { ...n, hidden: false };
                return n;
            }));
        } else {
            setNodes(nds => nds.map(n => {
                if (n.id === id) return { ...n, style: { ...n.style, height: HEADER_H }, data: { ...n.data, minimized: true, savedHeight: curH } };
                if (descIds.has(n.id)) return { ...n, hidden: true };
                return n;
            }));
        }
    };

    return (
        <div style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            position: "relative",
            borderRadius: 6,
            overflow: "hidden",
            boxSizing: "border-box",
            border: `1px solid ${cfg.border}`,
            outline: selected ? "2px solid #f59e0b" : "none",
            outlineOffset: -2,
        }}>
            {!minimized && (
                <NodeResizer
                    isVisible={selected}
                    minWidth={300}
                    minHeight={80}
                    lineStyle={{ borderColor: "#f59e0b" }}
                    handleStyle={{ background: "#f59e0b", border: "none" }}
                />
            )}

            {/* Header */}
            <div style={{
                background: cfg.color,
                color: "#fff",
                padding: "0 10px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.04em",
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexShrink: 0,
                userSelect: "none",
                height: HEADER_H,
                boxSizing: "border-box",
            }}>
                <span>{data?.title || cfg.label}</span>
                <span style={{ fontSize: 8, fontWeight: 400, opacity: 0.65 }}>{cfg.hint}</span>
                <button
                    onClick={toggle}
                    onMouseDown={e => e.stopPropagation()}
                    style={{
                        marginLeft: "auto",
                        background: "rgba(255,255,255,0.18)",
                        border: "1px solid rgba(255,255,255,0.30)",
                        color: "#fff",
                        borderRadius: 3,
                        width: 18,
                        height: 18,
                        cursor: "pointer",
                        fontSize: 14,
                        lineHeight: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        flexShrink: 0,
                    }}
                    title={minimized ? "Maximize" : "Minimize"}
                >
                    {minimized ? "+" : "-"}
                </button>
            </div>

            {!minimized && (
                <div style={{ flex: 1, background: cfg.bg }} />
            )}
        </div>
    );
}
