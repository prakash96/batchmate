import {
    ReactFlow,
    Background,
    useReactFlow,
    applyNodeChanges,
    applyEdgeChanges,
} from "@xyflow/react";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import "@xyflow/react/dist/style.css";
import { useWorkflowStore } from "../../store/workflowStore";
import { useMetadataStore } from "../../store/metadataStore";
import { GenericNode, CUSTOM_NODES } from "./nodeTypes";
import { getSectionForPosition, isAllowedInSection, getContainerIds } from "../../utils/sectionRules";
import { getNodeDefaults } from "../nodes/nodeRegistry";
import { autoResizeContainer } from "../../utils/containerResize";

/* ================= CONTAINER TYPES ================= */

const CONTAINER_TYPES = new Set(["iteration", "errorscope"]);
const isContainer = (node) => CONTAINER_TYPES.has(node.type);

/* ================= DEPTH ================= */

function getDepth(node, nodes) {
    let depth = 0;
    let current = node;

    while (current.parentId) {
        depth++;
        current = nodes.find(n => n.id === current.parentId);
    }

    return depth;
}

/* ================= FIND DEEPEST PARENT ================= */

function getAbsolutePosition(node, nodes) {
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

function findParent(position, nodes) {
    const iterations = nodes.filter(n => isContainer(n));

    const candidates = iterations.filter(n => {
        const abs = getAbsolutePosition(n, nodes);

        const width = n.style?.width ?? n.measured?.width ?? 280;
        const height = n.style?.height ?? n.measured?.height ?? 170;

        return (
            position.x >= abs.x &&
            position.x <= abs.x + width &&
            position.y >= abs.y &&
            position.y <= abs.y + height
        );
    });

    if (!candidates.length) return null;

    //  pick deepest node ONLY
    return candidates.reduce((deepest, current) => {
        const d1 = getDepth(deepest, nodes);
        const d2 = getDepth(current, nodes);
        return d2 > d1 ? current : deepest;
    });
}

/* ================= CHILD LAYOUT ================= */

// Iteration / errorscope visual constants  keep in sync with IterationNode.jsx
const SCOPE_HEADER_H = 24;   // top header strip
const SCOPE_PAD_X    = 12;   // inner left/right padding
const SCOPE_PAD_Y    = 12;   // inner bottom padding
const SCOPE_MIN_W    = 220;
const SCOPE_MIN_H    = 120;

function layoutChildren(parent, nodes) {
    const children = nodes.filter(n => n.parentId === parent.id);

    const gap = 20;
    const minChildY = SCOPE_HEADER_H + 4;   // keep children below header

    let currentX = SCOPE_PAD_X;

    return children.map((child) => {
        const width =
            child.style?.width ??
            child.measured?.width ??
            (isContainer(child) ? SCOPE_MIN_W : 130);

        const rawX = child.position?.x ?? currentX;
        const rawY = child.position?.y ?? minChildY;

        const positioned = {
            ...child,
            position: {
                x: Math.max(SCOPE_PAD_X, rawX),
                y: Math.max(minChildY, rawY)
            }
        };

        if (child.position?.x == null) {
            currentX += width + gap;
        }

        return positioned;
    });
}

/* ================= RESIZE PARENT ================= */

function resizeParent(parent, nodes) {
    const children = nodes.filter(n => n.parentId === parent.id);

    if (!children.length) {
        return {
            ...parent,
            style: {
                ...(parent.style || {}),
                width:  parent.style?.width  ?? SCOPE_MIN_W,
                height: parent.style?.height ?? SCOPE_MIN_H
            }
        };
    }

    let maxRight = 0;
    let maxBottom = 0;

    children.forEach(child => {
        const width  = child.style?.width  ?? child.measured?.width  ?? 130;
        const height = child.style?.height ?? child.measured?.height ?? 52;

        maxRight  = Math.max(maxRight,  child.position.x + width);
        maxBottom = Math.max(maxBottom, child.position.y + height);
    });

    return {
        ...parent,
        style: {
            ...(parent.style || {}),
            // Never shrink below what the user manually set (horizontal)
            width:  Math.max(maxRight  + SCOPE_PAD_X, SCOPE_MIN_W, parent.style?.width  ?? 0),
            height: Math.max(maxBottom + SCOPE_PAD_Y, SCOPE_MIN_H)
        }
    };
}

/* ================= NESTING STYLE ================= */

function applyNestingStyles(nodes) {
    return nodes.map(node => {
        if (!isContainer(node)) return node;

        const depth = getDepth(node, nodes);

        return {
            ...node,

            style: {
                width: node.style?.width,
                height: node.style?.height,
            },
            data: {
                ...node.data,
                depth
            }
        };
    });
}

/* ================= FULL LAYOUT ENGINE ================= */

function layoutAll(nodes) {
    const parents = nodes
        .filter(n => isContainer(n))
        .sort((a, b) => getDepth(b, nodes) - getDepth(a, nodes));

    let updated = [...nodes];

    parents.forEach(parent => {
        const laidOut = layoutChildren(parent, updated);

        updated = updated.map(n =>
            n.parentId === parent.id
                ? laidOut.find(l => l.id === n.id) || n
                : n
        );

        updated = updated.map(n =>
            n.id === parent.id
                ? resizeParent(n, updated)
                : n
        );
    });

    return autoResizeContainer(applyNestingStyles(updated));
}

/* ================= COMPONENT ================= */

export default function FlowCanvas({ expandedRowId, layoutKey }) {
    const {
        nodes,
        edges,
        setNodes,
        setEdges,
        onConnect,
        setSelectedNodeId,
        clearSelectedNodeId,
        saveWorkflow,
        copied,
        setCopied,
        runValidation,
        validationIssues,
    } = useWorkflowStore();

    const nodeMetaMap = useMetadataStore(s => s.nodeMetaMap);
    const nodeTypes = useMemo(() => ({
        ...Object.fromEntries(Object.keys(nodeMetaMap).map(type => [type, GenericNode])),
        ...CUSTOM_NODES,
    }), [nodeMetaMap]);

    const revalidate = () => {
        if (validationIssues !== null && expandedRowId) {
            runValidation(expandedRowId);
        }
    };


    const reactFlow = useReactFlow();
    const canvasRef = useRef(null);

    // Resize workflowcontainer nodes to fill available canvas width, then fitView.
    const resizeAndFit = useCallback((rfInstance) => {
        const rf = rfInstance ?? reactFlow;
        const pixelW = canvasRef.current?.clientWidth ?? 0;
        if (pixelW > 0) {
            const margin = 20;
            const targetW = Math.max(pixelW - margin * 2, 300);
            setNodes(nds => layoutAll(nds.map(n =>
                n.type !== "workflowcontainer"
                    ? n
                    : { ...n, position: { ...n.position, x: margin }, style: { ...n.style, width: targetW } }
            )));
        }
        setTimeout(() => rf.setViewport({ x: 0, y: 20, zoom: 1 }, { duration: 300 }), 50);
    }, [setNodes, reactFlow]);

    // Re-fit when surrounding panels show/hide
    const isFirstLayoutRender = useRef(true);
    useEffect(() => {
        if (isFirstLayoutRender.current) { isFirstLayoutRender.current = false; return; }
        if (!layoutKey) return;
        const t = setTimeout(() => resizeAndFit(), 80);
        return () => clearTimeout(t);
    }, [layoutKey, resizeAndFit]);

    const [hoveredParentId, setHoveredParentId] = useState(null);

    const [dropError, setDropError] = useState(null);
    const undoHistoryRef  = useRef([]);
    const preDragNodeRef  = useRef(null);
    const preDragStateRef = useRef(null);

    const pushHistory = (nodesSnapshot, edgesSnapshot) => {
        undoHistoryRef.current = [
            {
                nodes: structuredClone(nodesSnapshot),
                edges: structuredClone(edgesSnapshot)
            },
            ...undoHistoryRef.current
        ].slice(0, 20);
    };

    const undo = () => {
        const [last, ...rest] = undoHistoryRef.current;
        if (!last) return;

        undoHistoryRef.current = rest;
        setNodes(last.nodes);
        setEdges(last.edges);

        if (expandedRowId) {
            saveWorkflow(expandedRowId, last.nodes, last.edges);
        }
    };

    const handleCopy = () => {
        const selectedNodes = nodes.filter(n => n.selected);

        if (!selectedNodes.length) return;

        const selectedIds = selectedNodes.map(n => n.id);

        const selectedEdges = edges.filter(
            e => selectedIds.includes(e.source) && selectedIds.includes(e.target)
        );

        setCopied({
            nodes: selectedNodes,
            edges: selectedEdges
        });
    };

    const handlePaste = () => {
        if (!copied.nodes.length) return;

        const idMap = {};
        const offset = 40;

        const newNodes = copied.nodes.map(n => {
            const newId = crypto.randomUUID();
            idMap[n.id] = newId;

            return {
                ...n,
                id: newId,

                //  shift position
                position: {
                    x: (n.position?.x || 0) + offset,
                    y: (n.position?.y || 0) + offset
                },

                //  keep iteration parent
                parentId: n.parentId,
                extent: n.parentId ? "parent" : undefined,

                selected: false
            };
        });

        const newEdges = copied.edges.map(e => ({
            ...e,
            id: `${e.id}-${Date.now()}-${Math.random()}`,
            source: idMap[e.source],
            target: idMap[e.target]
        }));

        setNodes(nds => [...(nds || []), ...newNodes]);
        setEdges(nds => [...(nds || []), ...newEdges]);
    };

    useEffect(() => {
        const handleKeyDown = (e) => {

            //  avoid interfering with typing in inputs
            const tag = document.activeElement.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return;

            if (e.ctrlKey && e.key === "c") {
                e.preventDefault();
                handleCopy();
            }

            if (e.ctrlKey && e.key === "v") {
                e.preventDefault();
                handlePaste();
            }

            if ((e.ctrlKey || e.metaKey) && e.key === "z") {
                e.preventDefault();
                undo();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [nodes, edges, copied]);
    /* ================= DROP ================= */

    const onDrop = (event) => {
        event.preventDefault();

        const type = event.dataTransfer.getData("application/reactflow");
        if (!type) return;

        const position = reactFlow.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY
        });

        // Validate against section rules
        const hasLayout = nodes.some(n => n.type === "workflowcontainer" || n.type === "section");
        const section = getSectionForPosition(position, nodes);

        if (hasLayout && !section) {
            setDropError("Nodes must be placed inside one of the workflow sections.");
            setTimeout(() => setDropError(null), 3000);
            return;
        }

        if (section && !isAllowedInSection(type, section.data?.sectionType)) {
            const sectionLabel = section.data?.label || section.data?.sectionType || "this section";
            setDropError(`"${type}" nodes cannot be placed in the ${sectionLabel} section.`);
            setTimeout(() => setDropError(null), 3000);
            return;
        }

        // iteration/errorscope hovered → use that; otherwise nest inside the matching workflow container
        const dropContainer = section?.type === "workflowcontainer"
            ? nodes.find(n => n.id === section.id)
            : null;
        const parent = nodes.find(n => n.id === hoveredParentId)
            ?? dropContainer
            ?? nodes.find(n => n.type === "workflowcontainer");

        let relativePosition = position;

        if (parent) {
            // parent.position is relative to its own parent when nested, so walk the chain
            const parentAbs = getAbsolutePosition(parent, nodes);

            relativePosition = {
                x: position.x - parentAbs.x,
                y: position.y - parentAbs.y
            };
        }

        const reg = getNodeDefaults(type) || {};
        const newNode = {
            id: crypto.randomUUID(),
            type,
            position: relativePosition,
            data: { ...(reg.data || {}), name: reg.data?.name || type },
            style: { width: Math.max(reg.width || 58, 58), height: Math.max(reg.height || 58, 58) },
            parentId: parent?.id,
            extent: parent ? "parent" : undefined
        };

        pushHistory(nodes, edges);
        setNodes(nds => layoutAll([...nds, newNode]));
        revalidate();

        setHoveredParentId(null);
    };

    /* ================= DRAG ================= */

    const onNodeDragStart = (_, draggedNode) => {
        if (draggedNode.type === "workflowcontainer" || draggedNode.type === "section") return;
        const abs = getAbsolutePosition(draggedNode, nodes);
        const section = getSectionForPosition(abs, nodes);
        preDragNodeRef.current  = {
            position:    { ...draggedNode.position },
            parentId:    draggedNode.parentId,
            sectionType: section?.data?.sectionType ?? null,
        };
        preDragStateRef.current = { nodes: structuredClone(nodes), edges: structuredClone(edges) };
    };

    const onNodeDragStop = (_, draggedNode) => {
        if (draggedNode.type === "workflowcontainer" || draggedNode.type === "section") return;

        const dragAbs = getAbsolutePosition(draggedNode, nodes);
        const dragAbsX = dragAbs.x;
        const dragAbsY = dragAbs.y;
        const dragAbsPos = { x: dragAbsX, y: dragAbsY };

        const containerIds = getContainerIds(nodes);
        const isAtContainerLevel = !draggedNode.parentId || containerIds.has(draggedNode.parentId);

        // Section validation for top-level nodes only
        if (isAtContainerLevel && containerIds.size > 0) {
            const section = getSectionForPosition(dragAbsPos, nodes);
            const pre = preDragNodeRef.current;
            const movedToWrongSection =
                pre?.sectionType && section?.data?.sectionType !== pre.sectionType;
            const invalid =
                !section ||
                !isAllowedInSection(draggedNode.type, section.data?.sectionType) ||
                movedToWrongSection;

            if (invalid) {
                preDragStateRef.current = null;
                if (pre) {
                    setNodes(prev => layoutAll(prev.map(n =>
                        n.id === draggedNode.id
                            ? { ...n, position: pre.position, parentId: pre.parentId }
                            : n
                    )));
                }
                return;
            }
        }

        // Find the deepest iteration/errorscope at the drop position
        const specificParent = findParent(dragAbsPos, nodes.filter(n => n.id !== draggedNode.id));

        const currentParentNode = nodes.find(n => n.id === draggedNode.parentId);
        // For multi-container: find the right container based on drop position
        const dropSection = getSectionForPosition(dragAbsPos, nodes.filter(n => n.id !== draggedNode.id));
        const dropContainer = dropSection?.type === "workflowcontainer"
            ? nodes.find(n => n.id === dropSection.id)
            : null;
        const newParent = specificParent
            ?? (isContainer(currentParentNode) ? currentParentNode : null)
            ?? dropContainer
            ?? nodes.find(n => n.type === "workflowcontainer")
            ?? null;

        const updatedNodes = nodes.map(n => {
            if (n.id !== draggedNode.id) return n;

            let newPosition = draggedNode.position;

            if (newParent) {
                const newParentAbs = getAbsolutePosition(newParent, nodes);
                newPosition = {
                    x: dragAbsX - newParentAbs.x,
                    y: dragAbsY - newParentAbs.y
                };
            }

            return {
                ...n,
                parentId: newParent?.id,
                parentNode: newParent?.id,
                extent: newParent ? "parent" : undefined,
                position: newPosition
            };
        });

        if (preDragStateRef.current) {
            undoHistoryRef.current = [preDragStateRef.current, ...undoHistoryRef.current].slice(0, 20);
            preDragStateRef.current = null;
        }
        setNodes(layoutAll(updatedNodes));
        revalidate();
    };
    /* ================= DELETE / CHANGE ================= */

    const handleNodesChange = (changes) => {
        const isDragging = changes.some(
            c => c.type === "position" && c.dragging
        );

        if (changes.some(c => c.type === "remove")) {
            pushHistory(nodes, edges);
        }

        setNodes(nds => {
            const updated = applyNodeChanges(changes, nds);

            if (isDragging) return updated;

            const laidOut = layoutAll(updated);

            if (expandedRowId) {
                saveWorkflow(expandedRowId, laidOut, edges);
            }

            return laidOut;
        });

        if (!isDragging) revalidate();
    };

    const onEdgesChange = (changes) => {
        if (changes.some(c => c.type === "remove")) {
            pushHistory(nodes, edges);
        }

        const updated = applyEdgeChanges(changes, edges || []);
        setEdges(updated);

        if (expandedRowId) {
            saveWorkflow(expandedRowId, nodes, updated);
        }

        revalidate();
    };


    /* ================= EDGE VALIDATION ================= */

    const isValidConnection = (conn) => {
        const source = nodes.find(n => n.id === conn.source);
        const target = nodes.find(n => n.id === conn.target);

        if (!source || !target) return false;

        const containerIds = getContainerIds(nodes);
        // Normalize: all workflowcontainer children are in the same top-level scope
        const normalizeScope = (pid) => (!pid || containerIds.has(pid)) ? null : pid;
        const sScope = normalizeScope(source.parentId);
        const tScope = normalizeScope(target.parentId);

        if (sScope !== tScope) return false;

        return true;
    };

    const onDragOver = (event) => {
        event.preventDefault();


        const position = reactFlow.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY
        });

        const parent = findParent(position, nodes);

        setHoveredParentId(parent?.id || null);
    };

    const handleOnConnect = (params) => {
        pushHistory(nodes, edges);
        onConnect(params); // existing store logic

        if (expandedRowId) {
            const state = useWorkflowStore.getState();
            saveWorkflow(expandedRowId, state.nodes, state.edges);
        }

        revalidate();
    };
    /* ================= RENDER ================= */

    return (
        <div ref={canvasRef} style={{ height: "100%", position: "relative" }}>
            {dropError && (
                <div style={{
                    position: "absolute",
                    top: 12,
                    left: "50%",
                    transform: "translateX(-50%)",
                    zIndex: 9999,
                    background: "#7f1d1d",
                    color: "#fca5a5",
                    border: "1px solid #991b1b",
                    borderRadius: 6,
                    padding: "7px 16px",
                    fontSize: 12,
                    fontWeight: 500,
                    pointerEvents: "none",
                    whiteSpace: "nowrap",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.5)"
                }}>
                     {dropError}
                </div>
            )}
            <ReactFlow
                nodes={nodes.map(n => ({
                    ...n,
                    className: n.id === hoveredParentId ? "iteration-hover" : "",
                    draggable: true,
                    zIndex: (n.type === "section" || n.type === "workflowcontainer") ? -1 : (n.zIndex ?? 0)
                }))}
                proOptions={{ hideAttribution: true }}
                edges={edges}
                nodeTypes={nodeTypes}

                onNodesChange={handleNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={handleOnConnect}

                isValidConnection={isValidConnection}
                deleteKeyCode={["Backspace", "Delete"]}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onNodeDragStart={onNodeDragStart}
                onNodeDragStop={onNodeDragStop}
                onNodeClick={(_, n) => setSelectedNodeId(n.id)}
                onPaneClick={() => clearSelectedNodeId()}
                onInit={(rf) => resizeAndFit(rf)}
            >
                <Background variant="dots" gap={24} size={1} color="rgba(255,255,255,0.12)" />
            </ReactFlow>
        </div>
    );
}