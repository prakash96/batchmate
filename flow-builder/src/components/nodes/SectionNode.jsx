import { NodeResizer } from "@xyflow/react";
import { useMetadataStore } from "../../store/metadataStore";

const SECTION_META = {
    trigger: {
        headerBg: "#1a56db",
        headerColor: "#fff",
        bodyBg: "rgba(26, 86, 219, 0.04)",
        rightBorder: "2px dashed rgba(26, 86, 219, 0.35)",
        label: "Trigger",
        hint: "Entry point - HTTP inbound, file watcher, scheduler, SFTP/FTP/S3 read"
    },
    processing: {
        headerBg: "#475569",
        headerColor: "#fff",
        bodyBg: "#f8fafc",
        rightBorder: "2px dashed rgba(71, 85, 105, 0.3)",
        label: "Processing",
        hint: "Transform, route, integrate, transfer files"
    },
    processingFailed: {
        headerBg: "#be123c",
        headerColor: "#fff",
        bodyBg: "#fff1f2",
        rightBorder: "2px dashed rgba(190, 18, 60, 0.25)",
        label: "Processing Failed",
        hint: "Catch processing errors, notify, recover, cleanup"
    },
    validation: {
        headerBg: "#1d4ed8",
        headerColor: "#fff",
        bodyBg: "rgba(37, 99, 235, 0.04)",
        rightBorder: "2px dashed rgba(37, 99, 235, 0.3)",
        label: "Verify",
        hint: "Guards, schema validation, assertions"
    },
    verifyFailed: {
        headerBg: "#7c2d12",
        headerColor: "#fff",
        bodyBg: "rgba(124, 45, 18, 0.04)",
        rightBorder: "none",
        label: "Verify Failed",
        hint: "Mismatch, alert, rollback"
    }
};

export default function SectionNode({ data, selected }) {
    const type = data?.sectionType || "processing";
    const meta = SECTION_META[type] || SECTION_META.processing;
    const nodeMetaMap = useMetadataStore(s => s.nodeMetaMap);
    const allowedList = Object.values(nodeMetaMap)
        .filter(m => m.zones?.includes(type))
        .map(m => m.type)
        .join(", ");

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                borderRadius: 0,
                background: meta.bodyBg,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                boxSizing: "border-box",
                borderRight: meta.rightBorder,
                outline: selected ? "2px solid #f59e0b" : "none",
                outlineOffset: -2
            }}
        >
            <NodeResizer
                isVisible={selected}
                minWidth={160}
                minHeight={120}
                lineStyle={{ borderColor: "#f59e0b" }}
                handleStyle={{ background: "#f59e0b", border: "none" }}
            />

            {/* Header */}
            <div
                style={{
                    background: meta.headerBg,
                    color: meta.headerColor,
                    padding: "5px 10px",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    flexShrink: 0,
                    userSelect: "none"
                }}
            >
                <span>{data?.label || meta.label}</span>
                <span style={{ fontSize: 8, fontWeight: 400, opacity: 0.7, flex: 1 }}>
                    {meta.hint}
                </span>
            </div>

            {/* Allowed node type watermark */}
            <div
                style={{
                    padding: "6px 10px",
                    fontSize: 7,
                    color: meta.headerBg,
                    opacity: 0.35,
                    lineHeight: 1.6,
                    userSelect: "none",
                    pointerEvents: "none",
                    wordBreak: "break-word"
                }}
            >
                Allowed: {allowedList}
            </div>

            {/* Transparent body so nodes show through */}
            <div style={{ flex: 1 }} />
        </div>
    );
}
