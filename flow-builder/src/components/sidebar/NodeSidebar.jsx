import { useState, useMemo } from "react";
import { CORE_NODE_METADATA, SIDEBAR_GROUP_ORDER } from "../../nodeMetadata";
import { useMetadataStore } from "../../store/metadataStore";

const GROUP_ACCENT = {
    "Core":          "#3B82F6",
    "Verify":        "#6366F1",
    "Local File":    "#10B981",
    "SFTP":          "#06B6D4",
    "FTP / FTPS":    "#22D3EE",
    "Cloud Storage": "#F97316",
    "Security":      "#EF4444",
    "Compression":   "#14B8A6",
    "Notification":  "#F59E0B",
    "Database":      "#8B5CF6",
    "AWS":           "#F97316",
    "Type Converters": "#A855F7",
};

export default function NodeSidebar() {
    const nodeTypes = useMetadataStore(s => s.nodeTypes);

    const GROUPS = useMemo(() => {
        const groupMap = new Map();
        for (const meta of [...CORE_NODE_METADATA, ...nodeTypes]) {
            if (!meta.group) continue;
            if (!groupMap.has(meta.group)) groupMap.set(meta.group, []);
            groupMap.get(meta.group).push({ type: meta.type, label: meta.sidebarLabel });
        }
        return SIDEBAR_GROUP_ORDER
            .filter(g => groupMap.has(g))
            .map((g, i) => ({ label: g, open: i === 0, nodes: groupMap.get(g) }));
    }, [nodeTypes]);

    const [openGroups, setOpenGroups] = useState(
        () => new Set(GROUPS.filter(g => g.open).map(g => g.label))
    );

    const toggle = (label) =>
        setOpenGroups(prev => {
            const next = new Set(prev);
            next.has(label) ? next.delete(label) : next.add(label);
            return next;
        });

    const onDragStart = (event, type) => {
        event.dataTransfer.setData("application/reactflow", type);
        event.dataTransfer.effectAllowed = "move";
    };

    return (
        <div style={{
            height: "100%", display: "flex", flexDirection: "column",
            background: "var(--bg-panel)", overflowY: "auto",
            borderRight: "1px solid var(--border-xs)",
        }}>
            <div style={{
                padding: "10px 12px 9px",
                borderBottom: "1px solid var(--border-xs)",
                flexShrink: 0,
                background: "var(--bg-header)",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{
                        width: 3, height: 12, borderRadius: 2,
                        background: "linear-gradient(180deg, #3B82F6, #06B6D4)",
                    }} />
                    <span style={{
                        fontSize: 9, fontWeight: 700, color: "var(--text-1)",
                        letterSpacing: "0.14em", textTransform: "uppercase",
                    }}>
                        Node Library
                    </span>
                </div>
            </div>

            {GROUPS.map(({ label, nodes }) => {
                const isOpen = openGroups.has(label);
                const accent = GROUP_ACCENT[label] || "#3B82F6";
                return (
                    <div key={label} style={{ borderBottom: "1px solid var(--surface)" }}>
                        <button
                            onClick={() => toggle(label)}
                            style={{
                                width: "100%", textAlign: "left", padding: "6px 12px",
                                background: isOpen ? `${accent}0c` : "transparent",
                                border: "none", cursor: "pointer",
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                height: "auto", borderRadius: 0,
                                borderLeft: `2px solid ${isOpen ? accent : "transparent"}`,
                                transition: "all 0.15s ease",
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{
                                    width: 6, height: 6, borderRadius: "50%",
                                    background: accent,
                                    boxShadow: isOpen ? `0 0 6px ${accent}` : "none",
                                    flexShrink: 0,
                                    transition: "box-shadow 0.15s",
                                }} />
                                <span style={{
                                    fontSize: 10.5, fontWeight: 600,
                                    color: isOpen ? "var(--text-1)" : "var(--text-4)",
                                    letterSpacing: "0.01em",
                                }}>
                                    {label}
                                </span>
                            </div>
                            <span style={{ fontSize: 9, color: isOpen ? accent : "var(--text-4)" }}>
                                {isOpen ? "▾" : "▸"}
                            </span>
                        </button>

                        {isOpen && (
                            <div style={{ padding: "2px 8px 4px" }}>
                                {nodes.map(({ type, label: nodeLabel }) => (
                                    <NodeItem key={type} type={type} label={nodeLabel} accent={accent} onDragStart={onDragStart} />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function NodeItem({ type, label, accent, onDragStart }) {
    const [hovered, setHovered] = useState(false);
    return (
        <div
            draggable
            onDragStart={e => onDragStart(e, type)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                margin: "2px 0", padding: "5px 8px",
                fontSize: 10.5, fontWeight: 500,
                background: hovered ? `${accent}10` : "transparent",
                border: `1px solid ${hovered ? accent + "30" : "transparent"}`,
                borderRadius: 6, cursor: "grab",
                color: hovered ? "var(--text-1)" : "var(--text-4)",
                transition: "all 0.12s ease",
                userSelect: "none",
                display: "flex", alignItems: "center", gap: 7,
                boxShadow: hovered ? `0 0 10px ${accent}18` : "none",
            }}
        >
            <span style={{
                width: 4, height: 4, borderRadius: "50%",
                background: hovered ? accent : "var(--text-3)",
                flexShrink: 0,
                transition: "all 0.12s",
                boxShadow: hovered ? `0 0 5px ${accent}` : "none",
            }} />
            {label}
        </div>
    );
}
