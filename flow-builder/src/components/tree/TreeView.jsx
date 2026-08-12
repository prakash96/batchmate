import { useState, useEffect, useRef, createContext, useContext } from "react";
import { useWorkflowStore } from "../../store/workflowStore";
import { useMetadataStore } from "../../store/metadataStore";
import { SIDEBAR_GROUP_ORDER } from "../../nodeMetadata";
import { autoResizeContainer } from "../../utils/containerResize";
import { autoLayout } from "../../utils/autoLayout";

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function getDescendantIds(nodeId, nodes) {
    const direct = nodes.filter(n => n.parentId === nodeId);
    return direct.flatMap(n => [n.id, ...getDescendantIds(n.id, nodes)]);
}

function buildChildrenMap(nodes) {
    const map = {};
    nodes.forEach(n => {
        if (!n.parentId) return;
        if (!map[n.parentId]) map[n.parentId] = [];
        map[n.parentId].push(n);
    });
    Object.values(map).forEach(arr =>
        arr.sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0))
    );
    return map;
}

const NODE_DOT_COLOR = {
    http:        "#0EA5E9",
    setbody:     "#8B5CF6",
    setvariable: "#A855F7",
    condition:   "#F59E0B",
    assertion:   "#10B981",
    iteration:   "#3B82F6",
    errorscope:  "#EF4444",
    log:         "#14B8A6",
    wait:        "#F97316",
    jsoncompare:   "#EAB308",
    dbexecute:     "#6366F1",
    textcompare:   "#EC4899",
    base64encode:  "#F59E0B",
    base64decode:  "#D97706",
};
const dotColor = (type) => NODE_DOT_COLOR[type] ?? "#6366F1";

const SCOPE_TYPES     = new Set(["iteration", "errorscope"]);
const CONDITION_TYPE  = "condition";

/* ─── Drag context ───────────────────────────────────────────────────────── */
const DragCtx = createContext(null);

/* ─── AddNodePicker ───────────────────────────────────────────────────────── */

function AddNodePicker({ containerType, onAdd, onClose }) {
    const nodeMetaMap = useMetadataStore(s => s.nodeMetaMap);
    const ref = useRef(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [onClose]);

    // Group node types by sidebar group, filtered to allowed zones
    const grouped = {};
    SIDEBAR_GROUP_ORDER.forEach(g => { grouped[g] = []; });

    Object.values(nodeMetaMap).forEach(meta => {
        if (!meta.group || !meta.zones) return;
        if (!meta.zones.includes(containerType)) return;
        if (!grouped[meta.group]) grouped[meta.group] = [];
        grouped[meta.group].push(meta);
    });

    const visibleGroups = SIDEBAR_GROUP_ORDER.filter(g => grouped[g]?.length > 0);

    return (
        <div ref={ref} style={{
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 6,
            padding: "6px 0",
            maxHeight: 320,
            overflowY: "auto",
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        }}>
            {visibleGroups.map(group => (
                <div key={group}>
                    <div style={{
                        fontSize: 9, color: "#CBD5E1", padding: "5px 10px 2px",
                        fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em"
                    }}>
                        {group}
                    </div>
                    {grouped[group].map(meta => (
                        <div
                            key={meta.type}
                            onClick={() => { onAdd(meta); onClose(); }}
                            style={{ padding: "5px 14px", fontSize: 11, color: "#cbd5e1", cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.07)"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor(meta.type), flexShrink: 0 }} />
                            {meta.sidebarLabel || meta.label}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

/* ─── TreeNodeRow ─────────────────────────────────────────────────────────── */

function TreeNodeRow({ node, depth, childrenMap, selectedNodeId, onSelect, onDelete, containerType, onAddChild, onAddConditionChild, onDropLibraryNode }) {
    const [open, setOpen] = useState(true);
    const [addingChild, setAddingChild] = useState(false);
    const [addingBranch, setAddingBranch] = useState(null); // "true" | "false" | null
    const { dragNodeId, dropInfo, onDragStart, onDragOver, onDrop, onDragEnd } = useContext(DragCtx);
    const children = childrenMap[node.id] || [];
    const hasChildren = children.length > 0;
    const isSelected = node.id === selectedNodeId;
    const isScope     = SCOPE_TYPES.has(node.type);
    const isCondition = node.type === CONDITION_TYPE;
    const isDragging = dragNodeId === node.id;
    const dropPos = dropInfo?.targetId === node.id ? dropInfo.pos : null;

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dragNodeId === node.id) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const pos = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
        onDragOver({ targetId: node.id, pos });
    };

    return (
        <div>
            {dropPos === "before" && (
                <div style={{ height: 2, background: "#3b82f6", borderRadius: 1, margin: `0 ${8 + depth * 14}px 1px` }} />
            )}
            <div
                draggable
                onClick={() => onSelect(node.id)}
                onDragStart={e => { e.stopPropagation(); e.dataTransfer.effectAllowed = "move"; onDragStart(node.id); }}
                onDragOver={handleDragOver}
                onDrop={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const libType = e.dataTransfer.getData("application/reactflow");
                    if (libType) {
                        onDropLibraryNode(node.parentId, libType);
                    } else {
                        onDrop(node.id);
                    }
                }}
                onDragEnd={onDragEnd}
                style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: `3px 8px 3px ${8 + depth * 14}px`,
                    cursor: "grab", borderRadius: 3, marginBottom: 1,
                    background: isSelected ? "rgba(45,108,223,0.22)" : "transparent",
                    outline: isSelected ? "1px solid rgba(45,108,223,0.45)" : "1px solid transparent",
                    opacity: isDragging ? 0.4 : 1,
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? "rgba(45,108,223,0.22)" : "transparent"; }}
            >
                {/* Expand toggle */}
                <span
                    onClick={e => { e.stopPropagation(); hasChildren && setOpen(v => !v); }}
                    style={{ width: 11, fontSize: 8, color: "#4a5568", cursor: hasChildren ? "pointer" : "default", userSelect: "none", flexShrink: 0 }}
                >
                    {hasChildren ? (open ? "▼" : "▶") : ""}
                </span>

                {/* Color dot */}
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor(node.type), flexShrink: 0 }} />

                {/* Name */}
                <span style={{
                    flex: 1, fontSize: 11, color: "#e2e8f0",
                    fontWeight: isScope ? 600 : 400,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                }}>
                    {node.data?.name || node.type}
                </span>

                {/* Type chip */}
                <span style={{ fontSize: 9, color: "#CBD5E1", fontFamily: "monospace", flexShrink: 0 }}>
                    {node.type}
                </span>

                {/* Add child button (scopes only) */}
                {isScope && (
                    <span
                        onClick={e => { e.stopPropagation(); setAddingChild(v => !v); }}
                        style={{ fontSize: 13, color: "#CBD5E1", cursor: "pointer", padding: "0 2px", flexShrink: 0, lineHeight: 1 }}
                        title="Add child node"
                        onMouseEnter={e => e.currentTarget.style.color = "#94a3b8"}
                        onMouseLeave={e => e.currentTarget.style.color = "#CBD5E1"}
                    >+</span>
                )}

                {/* True / False branch add buttons (condition only) */}
                {isCondition && (
                    <>
                        <span
                            onClick={e => { e.stopPropagation(); setAddingBranch(addingBranch === "true" ? null : "true"); setAddingChild(false); }}
                            style={{ fontSize: 9, fontWeight: 700, color: "#10B981", cursor: "pointer", padding: "0 2px", flexShrink: 0 }}
                            title="Add node to true branch"
                        >T+</span>
                        <span
                            onClick={e => { e.stopPropagation(); setAddingBranch(addingBranch === "false" ? null : "false"); setAddingChild(false); }}
                            style={{ fontSize: 9, fontWeight: 700, color: "#F59E0B", cursor: "pointer", padding: "0 2px", flexShrink: 0 }}
                            title="Add node to false branch"
                        >F+</span>
                    </>
                )}

                {/* Delete */}
                <span
                    onClick={e => { e.stopPropagation(); onDelete(node.id); }}
                    style={{ fontSize: 11, color: "#374151", cursor: "pointer", padding: "0 2px", flexShrink: 0, lineHeight: 1 }}
                    title="Delete"
                    onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                    onMouseLeave={e => e.currentTarget.style.color = "#374151"}
                >x</span>
            </div>

            {dropPos === "after" && (
                <div style={{ height: 2, background: "#3b82f6", borderRadius: 1, margin: `1px ${8 + depth * 14}px 0` }} />
            )}

            {/* Child picker for scope nodes */}
            {isScope && addingChild && (
                <div style={{ paddingLeft: 8 + (depth + 1) * 14, paddingRight: 8, paddingBottom: 4 }}>
                    <AddNodePicker
                        containerType={containerType}
                        onAdd={(meta) => { onAddChild(node.id, meta); setAddingChild(false); }}
                        onClose={() => setAddingChild(false)}
                    />
                </div>
            )}

            {/* Branch picker for condition nodes */}
            {isCondition && addingBranch && (
                <div style={{ paddingLeft: 8 + (depth + 1) * 14, paddingRight: 8, paddingBottom: 4 }}>
                    <div style={{
                        fontSize: 9, fontWeight: 600, padding: "3px 2px 5px",
                        color: addingBranch === "true" ? "#10B981" : "#F59E0B",
                        display: "flex", alignItems: "center", gap: 4,
                    }}>
                        <span>{addingBranch === "true" ? "✓ True branch" : "✕ False branch"}</span>
                    </div>
                    <AddNodePicker
                        containerType={containerType}
                        onAdd={(meta) => { onAddConditionChild(node.id, addingBranch, meta); setAddingBranch(null); }}
                        onClose={() => setAddingBranch(null)}
                    />
                </div>
            )}

            {/* Children */}
            {hasChildren && open && children.map(child => (
                <TreeNodeRow
                    key={child.id}
                    node={child}
                    depth={depth + 1}
                    childrenMap={childrenMap}
                    selectedNodeId={selectedNodeId}
                    onSelect={onSelect}
                    onDelete={onDelete}
                    containerType={containerType}
                    onAddChild={onAddChild}
                    onAddConditionChild={onAddConditionChild}
                    onDropLibraryNode={onDropLibraryNode}
                />
            ))}
        </div>
    );
}

/* ─── edge helpers ───────────────────────────────────────────────────────── */

function findTailNode(siblings, edges) {
    if (!siblings.length) return null;
    const siblingIds = new Set(siblings.map(s => s.id));
    // A sibling that has no outgoing edge to another sibling is the current tail
    const hasOutgoing = new Set(
        edges
            .filter(e => siblingIds.has(e.source) && siblingIds.has(e.target))
            .map(e => e.source)
    );
    // Sort descending by x, pick first without outgoing (rightmost tail)
    return (
        [...siblings].sort((a, b) => (b.position?.x ?? 0) - (a.position?.x ?? 0)).find(s => !hasOutgoing.has(s.id))
        ?? siblings[siblings.length - 1]
    );
}

function makeEdge(sourceId, targetId, extra = {}) {
    return {
        id: `e-${sourceId}-${targetId}`,
        source: sourceId,
        target: targetId,
        animated: false,
        type: "smoothstep",
        style: { stroke: "#888" },
        ...extra,
    };
}

function findBranchTail(conditionId, handle, edges, allNodes) {
    const first = edges.find(e => e.source === conditionId && e.sourceHandle === handle);
    if (!first) return null;
    let cur = allNodes.find(n => n.id === first.target);
    const seen = new Set();
    while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        const next = edges.find(e =>
            e.source === cur.id &&
            !e.sourceHandle &&
            allNodes.some(n => n.id === e.target && n.parentId === cur.parentId)
        );
        if (!next) break;
        cur = allNodes.find(n => n.id === next.target);
    }
    return cur;
}

/* ─── TreeView ────────────────────────────────────────────────────────────── */

const SECTION_LABEL = { processing: "Processing", processingFailed: "Error Handler" };
const SECTION_COLOR = { processing: "#93c5fd", processingFailed: "#fca5a5" };

export default function TreeView() {
    const {
        nodes, edges,
        setNodes, setEdges,
        selectedNodeId, setSelectedNodeId,
        saveWorkflow, expandedRowId,
    } = useWorkflowStore();
    const nodeMetaMap = useMetadataStore(s => s.nodeMetaMap);

    const [openPicker, setOpenPicker] = useState(null);
    const [dragNodeId, setDragNodeId] = useState(null);
    const [dropInfo, setDropInfo]     = useState(null); // { targetId, pos: 'before'|'after' }

    const childrenMap = buildChildrenMap(nodes);

    const containers = nodes
        .filter(n => n.type === "workflowcontainer")
        .sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0));

    const orphans = nodes.filter(n => !n.parentId && n.type !== "workflowcontainer");

    /* ── select ── */
    const handleSelect = (nodeId) => setSelectedNodeId(nodeId);

    /* ── delete ── */
    const handleDelete = (nodeId) => {
        const descIds = new Set([nodeId, ...getDescendantIds(nodeId, nodes)]);
        const newNodes = nodes.filter(n => !descIds.has(n.id));
        const newEdges = edges.filter(e => !descIds.has(e.source) && !descIds.has(e.target));
        setNodes(newNodes);
        setEdges(newEdges);
        if (expandedRowId) saveWorkflow(expandedRowId, newNodes, newEdges);
    };

    /* ── reorder nodes by drag ── */
    const handleReorder = (draggedId, targetId, pos) => {
        if (!draggedId || !targetId || draggedId === targetId) return;
        const draggedNode = nodes.find(n => n.id === draggedId);
        const targetNode  = nodes.find(n => n.id === targetId);
        if (!draggedNode || !targetNode) return;
        if (draggedNode.parentId !== targetNode.parentId) return;

        const siblings      = [...(childrenMap[draggedNode.parentId] || [])];
        const withoutDrag   = siblings.filter(s => s.id !== draggedId);
        const targetIdx     = withoutDrag.findIndex(s => s.id === targetId);
        if (targetIdx === -1) return;
        const insertAt = pos === "before" ? targetIdx : targetIdx + 1;
        withoutDrag.splice(insertAt, 0, draggedNode);

        const xMap = {};
        withoutDrag.forEach((s, i) => { xMap[s.id] = 30 + i * 90; });

        const newNodes = nodes.map(n =>
            xMap[n.id] !== undefined ? { ...n, position: { ...n.position, x: xMap[n.id] } } : n
        );
        setNodes(newNodes);
        if (expandedRowId) saveWorkflow(expandedRowId, newNodes, edges);
    };

    const dragCtx = {
        dragNodeId,
        dropInfo,
        onDragStart: id   => setDragNodeId(id),
        onDragOver:  info => setDropInfo(info),
        onDrop:      (targetId) => {
            if (dropInfo) handleReorder(dragNodeId, dropInfo.targetId, dropInfo.pos);
            setDragNodeId(null);
            setDropInfo(null);
        },
        onDragEnd: () => { setDragNodeId(null); setDropInfo(null); },
    };

    /* ── add node to a condition branch ── */
    const handleAddConditionChild = (conditionId, handle, meta) => {
        const conditionNode = nodes.find(n => n.id === conditionId);
        if (!conditionNode) return;
        const parentId = conditionNode.parentId;
        const cx = conditionNode.position?.x ?? 0;
        const cy = conditionNode.position?.y ?? 0;
        const pos = handle === "true"
            ? { x: cx + 130, y: cy }
            : { x: cx,       y: cy + 110 };

        const newNode = {
            id: crypto.randomUUID(),
            type: meta.type,
            position: pos,
            data: { ...(meta.defaultData || {}), name: meta.sidebarLabel || meta.label },
            style: { width: Math.max(meta.width || 58, 58), height: Math.max(meta.height || 58, 58) },
            parentId,
            extent: "parent",
        };

        // Append after the tail of the branch, or connect directly from condition
        const tail = findBranchTail(conditionId, handle, edges, nodes);
        const newEdge = tail
            ? makeEdge(tail.id, newNode.id)
            : makeEdge(conditionId, newNode.id, { sourceHandle: handle, label: handle });

        const newEdges = [...edges, newEdge];
        const newNodes = autoLayout([...nodes, newNode], newEdges);
        setNodes(newNodes);
        setEdges(newEdges);
        setSelectedNodeId(newNode.id);
        if (expandedRowId) saveWorkflow(expandedRowId, newNodes, newEdges);
    };

    /* ── add node to a container or scope parent ── */
    const handleAdd = (parentId, meta, sectionType) => {
        const allSiblings = (childrenMap[parentId] || []);
        const sectionSiblings = sectionType
            ? allSiblings.filter(k => k.data?.section === sectionType)
            : allSiblings.filter(k => (k.data?.section || "processing") !== "processingFailed");
        const x = 30 + sectionSiblings.length * 90;
        const y = 30;

        const newNode = {
            id: crypto.randomUUID(),
            type: meta.type,
            position: { x, y },
            data: { ...(meta.defaultData || {}), name: meta.sidebarLabel || meta.label, ...(sectionType ? { section: sectionType } : {}) },
            style: { width: Math.max(meta.width || 58, 58), height: Math.max(meta.height || 58, 58) },
            parentId,
            extent: "parent",
        };

        const tail = findTailNode(siblings, edges);
        const newEdges = tail ? [...edges, makeEdge(tail.id, newNode.id)] : edges;
        const newNodes = autoLayout([...nodes, newNode], newEdges);
        setNodes(newNodes);
        setEdges(newEdges);
        setSelectedNodeId(newNode.id);
        if (expandedRowId) saveWorkflow(expandedRowId, newNodes, newEdges);
        setOpenPicker(null);
    };

    return (
      <DragCtx.Provider value={dragCtx}>
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0f172a", overflowY: "auto" }}>

            {/* Header */}
            <div style={{
                padding: "5px 12px", background: "#1e293b",
                borderBottom: "1px solid #1e3a5f", flexShrink: 0,
                fontSize: 11, color: "#94a3b8", fontWeight: 600, letterSpacing: "0.04em"
            }}>
                Workflow Tree
            </div>

            {/* Sections */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
                {containers.flatMap(c => {
                    const allKids = childrenMap[c.id] || [];
                    const processingKids = allKids.filter(k => (k.data?.section || "processing") !== "processingFailed");
                    const errorKids = allKids.filter(k => k.data?.section === "processingFailed");

                    return [
                        { sectionType: "processing", kids: processingKids },
                        { sectionType: "processingFailed", kids: errorKids },
                    ].map(({ sectionType, kids }) => {
                        const label = SECTION_LABEL[sectionType] || sectionType;
                        const color = SECTION_COLOR[sectionType] || "#93c5fd";
                        const pickerId = `${c.id}-${sectionType}`;
                        const pickerOpen = openPicker === pickerId;

                        return (
                            <div
                                key={pickerId}
                                style={{ marginBottom: 16 }}
                                onDragOver={e => e.preventDefault()}
                                onDrop={e => {
                                    e.preventDefault();
                                    const libType = e.dataTransfer.getData("application/reactflow");
                                    if (libType) {
                                        const meta = nodeMetaMap[libType];
                                        if (meta) handleAdd(c.id, meta, sectionType === "processingFailed" ? "processingFailed" : undefined);
                                    }
                                }}
                            >
                                {/* Section header row */}
                                <div style={{
                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                    padding: "3px 6px", borderBottom: "1px solid #1e293b", marginBottom: 4
                                }}>
                                    <span style={{
                                        fontSize: 10, fontWeight: 700, color,
                                        textTransform: "uppercase", letterSpacing: "0.06em"
                                    }}>
                                        {label}
                                        <span style={{ fontSize: 9, fontWeight: 400, color: "#CBD5E1", marginLeft: 6 }}>
                                            {kids.length} node{kids.length !== 1 ? "s" : ""}
                                        </span>
                                    </span>
                                    <button
                                        onClick={() => setOpenPicker(pickerOpen ? null : pickerId)}
                                        style={{
                                            fontSize: 15, lineHeight: 1, padding: "0 5px",
                                            background: pickerOpen ? "rgba(45,108,223,0.25)" : "rgba(255,255,255,0.05)",
                                            border: "1px solid #334155", color: "#94a3b8",
                                            borderRadius: 3, cursor: "pointer",
                                        }}
                                        title="Add node"
                                    >+</button>
                                </div>

                                {/* Node type picker */}
                                {pickerOpen && (
                                    <div style={{ marginBottom: 6, paddingLeft: 4, paddingRight: 4 }}>
                                        <AddNodePicker
                                            containerType={sectionType}
                                            onAdd={(meta) => handleAdd(c.id, meta, sectionType === "processingFailed" ? "processingFailed" : undefined)}
                                            onClose={() => setOpenPicker(null)}
                                        />
                                    </div>
                                )}

                                {/* Node rows */}
                                {kids.length === 0 && !pickerOpen && (
                                    <div style={{ padding: "4px 20px", fontSize: 10, color: "#334155", fontStyle: "italic" }}>
                                        Empty — click + to add a node
                                    </div>
                                )}
                                {kids.map(child => (
                                    <TreeNodeRow
                                        key={child.id}
                                        node={child}
                                        depth={0}
                                        childrenMap={childrenMap}
                                        selectedNodeId={selectedNodeId}
                                        onSelect={handleSelect}
                                        onDelete={handleDelete}
                                        containerType={sectionType}
                                        onAddChild={(parentId, meta) => handleAdd(parentId, meta, sectionType === "processingFailed" ? "processingFailed" : undefined)}
                                        onAddConditionChild={handleAddConditionChild}
                                        onDropLibraryNode={(parentId, type) => {
                                            const meta = nodeMetaMap[type];
                                            if (meta) handleAdd(parentId || c.id, meta, sectionType === "processingFailed" ? "processingFailed" : undefined);
                                        }}
                                    />
                                ))}
                            </div>
                        );
                    });
                })}

                {/* Orphaned nodes */}
                {orphans.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                        <div style={{
                            padding: "3px 6px", fontSize: 10, fontWeight: 700,
                            color: "#64748b", textTransform: "uppercase",
                            borderBottom: "1px solid #1e293b", marginBottom: 4, letterSpacing: "0.06em"
                        }}>
                            Unplaced
                        </div>
                        {orphans.map(n => (
                            <TreeNodeRow
                                key={n.id}
                                node={n}
                                depth={0}
                                childrenMap={childrenMap}
                                selectedNodeId={selectedNodeId}
                                onSelect={handleSelect}
                                onDelete={handleDelete}
                                containerType="processing"
                                onAddChild={(parentId, meta) => handleAdd(parentId, meta)}
                                onAddConditionChild={handleAddConditionChild}
                                onDropLibraryNode={(parentId, type) => {
                                    const meta = nodeMetaMap[type];
                                    if (meta) handleAdd(parentId, meta);
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
      </DragCtx.Provider>
    );
}
