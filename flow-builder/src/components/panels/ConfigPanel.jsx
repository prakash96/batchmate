import { useWorkflowStore } from "../../store/workflowStore";
import { useState, useEffect } from "react";
import { nodeConfigRegistry } from "../nodes/config/nodeConfigRegistry";
import { useMetadataStore } from "../../store/metadataStore";
import GenericConfig from "../nodes/config/GenericConfig";

const CONTAINER_SECTION = {
    processing:       { label: "Processing",        color: "#3B82F6" },
    processingFailed: { label: "Processing Failed", color: "#EF4444" },
};

export default function ConfigPanel() {
    const selectedNodeId  = useWorkflowStore(s => s.selectedNodeId);
    const nodes           = useWorkflowStore(s => s.nodes);
    const updateNodeData  = useWorkflowStore(s => s.updateNodeData);
    const expandedRowId   = useWorkflowStore(s => s.expandedRowId);
    const workflows       = useWorkflowStore(s => s.workflows);
    const updateWorkflow  = useWorkflowStore(s => s.updateWorkflow);

    const node             = nodes.find(n => n.id === selectedNodeId);
    const selectedWorkflow = workflows.find(w => w.id === expandedRowId);
    const isContainer      = node?.type === "workflowcontainer";

    const [displayName, setDisplayName] = useState("");

    useEffect(() => {
        if (!node) return;
        setDisplayName(isContainer ? (selectedWorkflow?.name ?? "") : (node.data?.name ?? ""));
    }, [node?.id, selectedWorkflow?.name, node?.data?.name, isContainer]);

    const nodeMetaMap = useMetadataStore(s => s.nodeMetaMap);

    if (!node || node.type === "section") {
        return (
            <div style={{
                height: "100%", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 10, padding: 16, textAlign: "center", background: "var(--bg-panel)",
            }}>
                <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 0 24px rgba(59,130,246,0.12)",
                }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="1.8">
                        <circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/>
                        <line x1="12" y1="3" x2="12" y2="1"/><line x1="12" y1="23" x2="12" y2="21"/>
                        <line x1="3" y1="12" x2="1" y2="12"/><line x1="23" y1="12" x2="21" y2="12"/>
                    </svg>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-4)" }}>Click a node to configure it</div>
            </div>
        );
    }

    const NodeConfig = nodeConfigRegistry[node.type]
        ?? (nodeMetaMap[node.type]?.sections ? GenericConfig : null);

    const containerMeta = isContainer
        ? (CONTAINER_SECTION[node.data?.containerType] ?? CONTAINER_SECTION.processing)
        : null;

    const handleNameChange = (e) => {
        const v = e.target.value;
        setDisplayName(v);
        if (isContainer) updateWorkflow(expandedRowId, { name: v });
        else updateNodeData(node.id, { name: v });
    };

    return (
        <div className="config-panel">
            {/* Header */}
            <div style={{
                padding: "8px 12px",
                background: "var(--bg-header)",
                borderBottom: "1px solid var(--border-xs)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                flexShrink: 0,
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 3, height: 12, borderRadius: 2, background: "linear-gradient(180deg, #3B82F6, #06B6D4)" }} />
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-1)" }}>
                        Config
                    </span>
                </div>
                {isContainer ? (
                    <span style={{
                        fontSize: 10, fontWeight: 700, color: "#fff",
                        background: `${containerMeta.color}cc`,
                        border: `1px solid ${containerMeta.color}60`,
                        padding: "2px 8px", borderRadius: 5, letterSpacing: "0.04em",
                        boxShadow: `0 0 8px ${containerMeta.color}40`,
                    }}>
                        {containerMeta.label}
                    </span>
                ) : (
                    <span style={{
                        fontSize: 10, color: "var(--text-1)", background: "var(--surface-2)",
                        padding: "2px 7px", borderRadius: 4, fontFamily: "'JetBrains Mono', monospace",
                        border: "1px solid var(--border-sm)",
                    }}>
                        {node.type}
                    </span>
                )}
            </div>

            {/* Name field */}
            <div style={{
                padding: "7px 12px",
                background: "var(--surface)",
                borderBottom: "1px solid var(--border-xs)",
                display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
            }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-1)", flexShrink: 0, width: 40 }}>
                    {isContainer ? "Name" : "Label"}
                </label>
                <input
                    value={displayName}
                    onChange={handleNameChange}
                    placeholder={isContainer ? "Workflow name" : "Node name"}
                    style={{
                        flex: 1, fontSize: 11, padding: "4px 8px",
                        border: "1px solid var(--border-sm)", borderRadius: 5,
                        outline: "none", color: "var(--text-1)",
                        background: "var(--bg-input)",
                        fontFamily: "'Inter', sans-serif",
                    }}
                    onFocus={e => { e.target.style.borderColor = "rgba(59,130,246,0.5)"; e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.08)"; }}
                    onBlur={e => { e.target.style.borderColor = "var(--border-sm)"; e.target.style.boxShadow = "none"; }}
                />
            </div>

            {/* Config body */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 8px 16px" }}>
                {NodeConfig ? (
                    <NodeConfig node={node} updateNodeData={updateNodeData} />
                ) : (
                    <div style={{ fontSize: 11, color: "var(--text-4)", padding: "10px 4px" }}>No additional configuration</div>
                )}
            </div>
        </div>
    );
}
