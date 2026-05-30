import { NodeResizer } from "@xyflow/react";
import { useWorkflowStore } from "../../store/workflowStore";

const HEADER_H = 30;
export const EH_HEADER_H = 26;
export const EH_BODY_H   = 120;

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

const iconBtn = {
    background: "rgba(255,255,255,0.18)",
    border: "1px solid rgba(255,255,255,0.30)",
    color: "#fff",
    borderRadius: 3,
    width: 18,
    height: 18,
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    flexShrink: 0,
};

export default function WorkflowContainerNode({ id, data, selected }) {
    const setNodes    = useWorkflowStore(s => s.setNodes);
    const nodes       = useWorkflowStore(s => s.nodes);

    const ctype      = data?.containerType || "processing";
    const cfg        = CONFIGS[ctype] ?? CONFIGS.processing;
    const minimized  = !!data?.minimized;
    const isProcessing = ctype === "processing";
    const ehExpanded = isProcessing && !!data?.errorHandlerExpanded;

    /* ── minimize / restore ── */
    const toggleMinimize = (e) => {
        e.stopPropagation();
        const me = nodes.find(n => n.id === id);
        const curH = me?.style?.height ?? 340;
        const descIds = new Set(getDescendants(id, nodes).map(n => n.id));

        if (minimized) {
            const restore = data.savedHeight ?? 340;
            setNodes(nds => nds.map(n => {
                if (n.id === id)        return { ...n, style: { ...n.style, height: restore }, data: { ...n.data, minimized: false } };
                if (descIds.has(n.id)) return { ...n, hidden: false };
                return n;
            }));
        } else {
            setNodes(nds => nds.map(n => {
                if (n.id === id)        return { ...n, style: { ...n.style, height: HEADER_H }, data: { ...n.data, minimized: true, savedHeight: curH } };
                if (descIds.has(n.id)) return { ...n, hidden: true };
                return n;
            }));
        }
    };

    /* ── expand / collapse error handler ── */
    const toggleErrorHandler = (e) => {
        e.stopPropagation();
        const me = nodes.find(n => n.id === id);
        const curH = me?.style?.height ?? 340;
        if (ehExpanded) {
            // collapse — shrink by body height
            setNodes(nds => nds.map(n =>
                n.id === id
                    ? { ...n, style: { ...n.style, height: Math.max(curH - EH_BODY_H, HEADER_H + EH_HEADER_H + 40) }, data: { ...n.data, errorHandlerExpanded: false } }
                    : n
            ));
        } else {
            // expand — grow by body height
            setNodes(nds => nds.map(n =>
                n.id === id
                    ? { ...n, style: { ...n.style, height: curH + EH_BODY_H }, data: { ...n.data, errorHandlerExpanded: true } }
                    : n
            ));
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
                    minHeight={isProcessing ? HEADER_H + EH_HEADER_H + 40 : 80}
                    lineStyle={{ borderColor: "#f59e0b" }}
                    handleStyle={{ background: "#f59e0b", border: "none" }}
                />
            )}

            {/* ── Main header ── */}
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
                <button onClick={toggleMinimize} onMouseDown={e => e.stopPropagation()}
                    style={{ ...iconBtn, marginLeft: "auto" }}
                    title={minimized ? "Maximize" : "Minimize"}>
                    {minimized ? "+" : "−"}
                </button>
            </div>

            {!minimized && (
                <>
                    {/* ── Processing body ── */}
                    <div style={{ flex: 1, background: cfg.bg, minHeight: 20 }} />

                    {/* ── Error handler — always at bottom, collapsed by default ── */}
                    {isProcessing && (
                        <div style={{
                            display: "flex",
                            flexDirection: "column",
                            flexShrink: 0,
                            borderTop: "2px solid rgba(190,18,60,0.40)",
                        }}>
                            {/* Clickable sub-header */}
                            <div
                                onClick={toggleErrorHandler}
                                onMouseDown={e => e.stopPropagation()}
                                style={{
                                    height: EH_HEADER_H,
                                    background: "#be123c",
                                    color: "#fff",
                                    padding: "0 10px",
                                    fontSize: 9,
                                    fontWeight: 700,
                                    letterSpacing: "0.04em",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 7,
                                    cursor: "pointer",
                                    userSelect: "none",
                                    boxSizing: "border-box",
                                }}
                            >
                                <span style={{ fontSize: 10, opacity: 0.85 }}>{ehExpanded ? "▾" : "▸"}</span>
                                <span>Error Handler</span>
                                <span style={{ fontSize: 8, fontWeight: 400, opacity: 0.70 }}>
                                    Catch / Notify / Recover — runs when processing fails
                                </span>
                            </div>

                            {/* Body — only when expanded */}
                            {ehExpanded && (
                                <div style={{
                                    height: EH_BODY_H,
                                    background: "rgba(254,242,242,0.85)",
                                    backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(190,18,60,0.04) 8px, rgba(190,18,60,0.04) 16px)",
                                    flexShrink: 0,
                                }} />
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
