import { Handle, Position, NodeResizer } from "@xyflow/react";

export default function IterationNode({ data, selected }) {
    const depth = data?.depth ?? 1;

    // Different hue per nesting level so nested iterations are visually distinct
    const palette = depth >= 2
        ? { border: "#A855F7", bg: "rgba(245,240,255,0.75)", header: "#A855F7", headerBg: "rgba(233,213,255,0.50)", text: "#6b21a8" }
        : { border: "#3B82F6", bg: "rgba(239,246,255,0.75)", header: "#3B82F6", headerBg: "rgba(219,234,254,0.50)", text: "#1e40af" };

    const isExecuting = data?.isExecuting;
    const hasError    = data?.hasError;

    return (
        <div
            className={`iteration-scope ${isExecuting ? "executing" : ""} ${hasError ? "error" : ""}`}
            style={{
                width: "100%",
                height: "100%",
                position: "relative",
                border: `2px dashed ${hasError ? "#e74c3c" : isExecuting ? "#2ecc71" : palette.border}`,
                background: hasError ? "rgba(231,76,60,0.08)" : isExecuting ? "rgba(46,204,113,0.10)" : palette.bg,
                boxShadow: hasError
                    ? "0 0 10px rgba(231,76,60,0.55)"
                    : isExecuting
                        ? "0 0 10px rgba(46,204,113,0.55)"
                        : "none",
                borderRadius: 10,
                boxSizing: "border-box",
                overflow: "hidden",
                outline: selected ? `2px solid ${palette.header}` : "none",
                outlineOffset: -2
            }}
        >
            <NodeResizer
                isVisible={selected}
                minWidth={160}
                minHeight={80}
                lineStyle={{ borderColor: palette.border }}
                handleStyle={{ background: palette.border, border: "none" }}
            />
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 22,
                    padding: "3px 8px",
                    fontSize: 10,
                    fontWeight: 600,
                    color: palette.text,
                    background: palette.headerBg,
                    borderBottom: `1px solid ${palette.border}40`,
                    borderTopLeftRadius: 8,
                    borderTopRightRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    pointerEvents: "none",
                    userSelect: "none",
                    zIndex: 2,
                }}
            >
                <span style={{ fontSize: 9, opacity: 0.7 }}>[loop]</span>
                <span>{data?.name || "Iteration"}</span>
                {depth >= 2 && <span style={{ opacity: 0.6, fontWeight: 400 }}>(nested)</span>}
            </div>

            <Handle type="target" position={Position.Left} />
            <Handle type="source" position={Position.Right} />
        </div>
    );
}
