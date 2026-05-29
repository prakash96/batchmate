import { Handle, Position } from '@xyflow/react';
import { useMetadataStore } from '../../store/metadataStore';
import { NodeIcon, NODE_COLORS, GROUP_COLORS } from './NodeIcons';

export default function GenericNode({ type, data, selected }) {
    const nodeMetaMap = useMetadataStore(s => s.nodeMetaMap);
    const meta = nodeMetaMap[type] || {};
    const color = NODE_COLORS[type] ?? GROUP_COLORS[meta.group] ?? "#6366F1";
    const label = data?.name || meta.label || type;

    return (
        <div
            className={`node-tile ${data?.isExecuting ? 'executing' : ''} ${data?.hasError ? 'node-error' : ''}`}
            style={{
                background: `linear-gradient(150deg, ${color}10 0%, #ffffff 50%)`,
                border: selected ? `1px solid ${color}60` : `1px solid ${color}28`,
                borderTop: `3px solid ${color}`,
                boxShadow: selected
                    ? `0 0 0 1px ${color}25, 0 4px 16px ${color}18, 0 2px 8px rgba(0,0,0,0.10)`
                    : `0 1px 4px rgba(0,0,0,0.07), 0 2px 8px rgba(0,0,0,0.05)`,
            }}
        >
            <Handle type="target" position={Position.Left} style={{ background: color, borderColor: "#ffffff" }} />

            <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: `linear-gradient(135deg, ${color}22, ${color}0d)`,
                border: `1px solid ${color}35`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: color,
                flexShrink: 0,
                boxShadow: selected ? `0 0 8px ${color}25` : "none",
                transition: "all 0.2s",
            }}>
                <NodeIcon type={type} group={meta.group} size={15} />
            </div>

            <div style={{
                fontSize: 8.5, fontWeight: 600,
                color: "#1e293b",
                textAlign: "center", lineHeight: 1.2,
                maxWidth: "100%", overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
                padding: "0 4px",
                fontFamily: "'Inter', sans-serif",
                letterSpacing: "0.01em",
                flexShrink: 0,
            }}>
                {label}
            </div>

            <Handle type="source" position={Position.Right} style={{ background: color, borderColor: "#ffffff" }} />
        </div>
    );
}
