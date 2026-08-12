import { useState, useEffect, useRef, createContext, useContext } from "react";
import { useWorkflowStore } from "../../store/workflowStore";
import { useMetadataStore } from "../../store/metadataStore";
import { persistentStore } from "../../store/persistentStore";
import { exportTestReport } from "../../utils/excelReport";
import { exportPackageExcel, parseExcelFile } from "../../utils/packageExcel";
import { readFileAsText, buildPackagesFromSwagger } from "../../utils/swaggerImport";
import { BASE_URL } from "../../config";

const DragCtx = createContext(null);

function InlineEdit({ value, onCommit, onCancel }) {
    const [text, setText] = useState(value);
    const commit = () => { const v = text.trim(); if (v) onCommit(v); else onCancel(); };
    return (
        <input
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") onCancel(); }}
            style={{
                flex: 1, fontSize: 11, padding: "1px 4px", border: "1px solid rgba(59,130,246,0.5)",
                borderRadius: 3, outline: "none", background: "var(--bg-input)", color: "var(--text-1)", minWidth: 0,
            }}
            onClick={e => e.stopPropagation()}
        />
    );
}

function ActionBtn({ onClick, title, danger, children }) {
    const [h, setH] = useState(false);
    return (
        <span
            title={title}
            onClick={onClick}
            onMouseEnter={() => setH(true)}
            onMouseLeave={() => setH(false)}
            style={{
                width: 18, height: 18, display: "inline-flex", alignItems: "center",
                justifyContent: "center", borderRadius: 3, cursor: "pointer",
                color: h ? (danger ? "#EF4444" : "#60A5FA") : "var(--text-4)",
                background: h ? (danger ? "rgba(239,68,68,0.1)" : "rgba(59,130,246,0.1)") : "transparent",
            }}
        >
            {children}
        </span>
    );
}

const STATUS_COLOR = {
    success: "#10B981",
    failed:  "#EF4444",
};

function WorkflowRow({ wf, packageId, isActive, indent = 0 }) {
    const { setExpandedRowId, loadWorkflow, deleteWorkflow, renameWorkflow } = useWorkflowStore();
    const { dragState, dragOverId, runStatuses, onDragStart, onDragOver, onDragEnd } = useContext(DragCtx);
    const [editing, setEditing] = useState(false);
    const [hovering, setHovering] = useState(false);

    const isDragging = dragState?.id === wf.id && dragState?.type === "workflow";
    const isDragOver = dragOverId === `wf-${wf.id}`;
    const lastStatus = runStatuses?.[wf.id] ?? null;

    const open = () => { loadWorkflow(wf.id); setExpandedRowId(wf.id); };

    return (
        <div
            draggable={!editing}
            onClick={!editing ? open : undefined}
            onDragStart={e => { e.stopPropagation(); onDragStart({ type: "workflow", id: wf.id, fromPackageId: packageId }); }}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); onDragOver(`wf-${wf.id}`); }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); }}
            onDragEnd={onDragEnd}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: `4px 8px 4px ${28 + indent}px`,
                cursor: editing ? "default" : "pointer", borderRadius: 4,
                background: isDragOver ? "rgba(59,130,246,0.12)"
                    : isActive ? "rgba(59,130,246,0.08)"
                    : hovering ? "var(--surface)" : "transparent",
                borderLeft: isActive ? "2px solid #3B82F6" : "2px solid transparent",
                opacity: isDragging ? 0.4 : 1,
            }}
        >
            <svg width="11" height="13" viewBox="0 0 11 13" fill="none" stroke={isActive ? "#3B82F6" : "#475569"} strokeWidth="1.3" strokeLinecap="round">
                <rect x="1" y="1" width="9" height="11" rx="1"/>
                <line x1="3" y1="4" x2="8" y2="4"/>
                <line x1="3" y1="6.5" x2="8" y2="6.5"/>
                <line x1="3" y1="9" x2="6" y2="9"/>
            </svg>

            {editing ? (
                <InlineEdit
                    value={wf.name || "Untitled"}
                    onCommit={v => { renameWorkflow(wf.id, v); setEditing(false); }}
                    onCancel={() => setEditing(false)}
                />
            ) : (
                <span style={{
                    flex: 1, fontSize: 11,
                    color: isActive ? "var(--text-1)" : "var(--text-4)",
                    fontWeight: isActive ? 600 : 400,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                    {wf.name || "Untitled"}
                </span>
            )}

            {!editing && (
                <span style={{
                    width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                    background: lastStatus ? STATUS_COLOR[lastStatus] : "var(--border)",
                    boxShadow: lastStatus ? `0 0 4px ${STATUS_COLOR[lastStatus]}88` : "none",
                    marginLeft: 2,
                }} title={lastStatus ? `Last run: ${lastStatus}` : "Never run"} />
            )}

            {hovering && !editing && (
                <span style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    <ActionBtn title="Rename" onClick={e => { e.stopPropagation(); setEditing(true); }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </ActionBtn>
                    <ActionBtn title="Delete" danger onClick={e => { e.stopPropagation(); deleteWorkflow(packageId, wf.id); }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </ActionBtn>
                </span>
            )}
        </div>
    );
}

function PackageRow({ pkg, activeWorkflowId, depth = 0 }) {
    const { addWorkflowToPackage, addPackage, renamePackage, deletePackage, updateWorkflow } = useWorkflowStore();
    const { nodeMetaMap } = useMetadataStore();
    const { dragState, dragOverId, selectedPkgId, onSelectPkg, onDragStart, onDragOver, onDragEnd, handleDropOnPackage } = useContext(DragCtx);
    const [open, setOpen]       = useState(true);
    const [editing, setEditing] = useState(false);
    const [hovering, setHovering] = useState(false);
    const [importingSwagger, setImportingSwagger] = useState(false);
    const fileInputRef = useRef(null);
    const swaggerInputRef = useRef(null);

    const workflows = pkg.workflows || [];
    const subPkgs   = pkg.packages  || [];
    const totalCount = workflows.length + subPkgs.length;
    const indent = depth * 12;

    const isDragging  = dragState?.id === pkg.id && dragState?.type === "package";
    const isDragOver  = dragOverId === `pkg-${pkg.id}`;
    const isSelected  = selectedPkgId === pkg.id;
    const hasActive   = workflows.some(w => w.id === activeWorkflowId);

    const handleDrop = e => {
        e.preventDefault();
        e.stopPropagation();
        if (pkg.id) handleDropOnPackage(pkg.id);
    };

    const handleExport = e => {
        e.stopPropagation();
        exportPackageExcel(pkg, `${pkg.name || 'package'}.xlsx`);
    };

    const handleImport = e => {
        e.stopPropagation();
        fileInputRef.current?.click();
    };

    const handleImportFile = async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        try {
            const rows = await parseExcelFile(file, nodeMetaMap);
            for (const { name, nodes, edges } of rows) {
                const newWf = await addWorkflowToPackage(pkg.id, name);
                await fetch(`${BASE_URL}/workflows/${newWf.id}/save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...newWf, workflow: { nodes, edges } }),
                });
                updateWorkflow(newWf.id, { workflow: { nodes, edges } });
            }
        } catch (err) {
            console.error('Import failed:', err);
            alert('Import failed: ' + err.message);
        }
    };

    const handleImportSwagger = e => {
        e.stopPropagation();
        swaggerInputRef.current?.click();
    };

    const handleImportSwaggerFile = async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        setImportingSwagger(true);
        try {
            const text = await readFileAsText(file);
            const tagGroups = buildPackagesFromSwagger(text);
            let caseCount = 0;
            for (const group of tagGroups) {
                if (group.workflows.length === 0) continue;
                const targetPkg = tagGroups.length === 1
                    ? pkg
                    : await addPackage(group.name, pkg.id);
                for (const { name, nodes, edges } of group.workflows) {
                    const newWf = await addWorkflowToPackage(targetPkg.id, name);
                    await fetch(`${BASE_URL}/workflows/${newWf.id}/save`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...newWf, workflow: { nodes, edges } }),
                    });
                    updateWorkflow(newWf.id, { workflow: { nodes, edges } });
                    caseCount += 1;
                }
            }
            if (caseCount === 0) alert('No operations with response definitions were found in this spec.');
        } catch (err) {
            console.error('Swagger import failed:', err);
            alert('Swagger import failed: ' + err.message);
        } finally {
            setImportingSwagger(false);
        }
    };

    return (
        <div style={{ marginBottom: 1, opacity: isDragging ? 0.4 : 1 }}>
            <div
                draggable={depth > 0 && !!pkg.id && !editing}
                onClick={() => { if (!editing) { setOpen(v => !v); if (pkg.id) onSelectPkg(pkg.id); } }}
                onDragStart={e => { e.stopPropagation(); depth > 0 && pkg.id && onDragStart({ type: "package", id: pkg.id }); }}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); onDragOver(`pkg-${pkg.id}`); }}
                onDrop={handleDrop}
                onDragEnd={onDragEnd}
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
                style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: `5px 8px 5px ${8 + indent}px`,
                    cursor: editing ? "default" : "pointer", borderRadius: 4,
                    background: isDragOver ? "rgba(59,130,246,0.12)" : isSelected ? "rgba(59,130,246,0.06)" : hovering ? "var(--surface)" : "transparent",
                    outline: isDragOver ? "1px dashed rgba(59,130,246,0.5)" : isSelected ? "1px solid rgba(59,130,246,0.2)" : "none",
                    userSelect: "none",
                }}
            >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#475569" strokeWidth="1.5" strokeLinecap="round">
                    {open ? <polyline points="1,2 4,6 7,2"/> : <polyline points="2,1 6,4 2,7"/>}
                </svg>

                <svg width="13" height="11" viewBox="0 0 13 11" fill={open ? "#fbbf24" : "#fde68a"} stroke="#f59e0b" strokeWidth="1" strokeLinecap="round">
                    <path d="M1 2.5a1 1 0 0 1 1-1h3l1.5 1.5H11a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2.5z"/>
                </svg>

                {editing ? (
                    <InlineEdit
                        value={pkg.name}
                        onCommit={v => { renamePackage(pkg.id, v); setEditing(false); }}
                        onCancel={() => setEditing(false)}
                    />
                ) : (
                    <span style={{
                        flex: 1, fontSize: 11, fontWeight: 600,
                        color: hasActive ? "var(--text-1)" : "var(--text-4)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                        {pkg.name}
                        <span style={{ fontWeight: 400, color: "var(--text-1)", marginLeft: 4 }}>{totalCount}</span>
                    </span>
                )}

                {hovering && !editing && pkg.id && (
                    <span style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                        <ActionBtn title={depth === 0 ? "Add package" : "Add sub-package"} onClick={e => { e.stopPropagation(); addPackage("New Package", pkg.id); }}>
                            <svg width="12" height="10" viewBox="0 0 15 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                <path d="M1 3a1 1 0 0 1 1-1h3l1.5 1.5H11a1 1 0 0 1 1 1v1.5"/>
                                <path d="M1 5v5a1 1 0 0 0 1 1h5"/>
                                <line x1="11" y1="8" x2="11" y2="13"/><line x1="8.5" y1="10.5" x2="13.5" y2="10.5"/>
                            </svg>
                        </ActionBtn>
                        <ActionBtn title="Add workflow" onClick={e => { e.stopPropagation(); addWorkflowToPackage(pkg.id); }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </ActionBtn>
                        <ActionBtn title="Export to Excel" onClick={handleExport}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                        </ActionBtn>
                        <ActionBtn title="Import from Excel" onClick={handleImport}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="17 8 12 3 7 8"/>
                                <line x1="12" y1="3" x2="12" y2="15"/>
                            </svg>
                        </ActionBtn>
                        <ActionBtn title={importingSwagger ? "Importing…" : "Import Swagger / OpenAPI — auto-generates test workflows"} onClick={importingSwagger ? undefined : handleImportSwagger}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/>
                                <polyline points="15 4 15 9 20 9"/>
                                <path d="M9 15.5l1.8 1.8L14.5 13"/>
                            </svg>
                        </ActionBtn>
                        <ActionBtn title="Rename" onClick={e => { e.stopPropagation(); setEditing(true); }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </ActionBtn>
                        <ActionBtn title="Delete package" danger onClick={e => { e.stopPropagation(); deletePackage(pkg.id); }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
                        </ActionBtn>
                    </span>
                )}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                style={{ display: "none" }}
                onChange={handleImportFile}
            />
            <input
                ref={swaggerInputRef}
                type="file"
                accept=".json,.yaml,.yml"
                style={{ display: "none" }}
                onChange={handleImportSwaggerFile}
            />

            {open && (
                <div>
                    {subPkgs.map(sp => (
                        <PackageRow key={sp.id} pkg={sp} activeWorkflowId={activeWorkflowId} depth={depth + 1} />
                    ))}
                    {workflows.length === 0 && subPkgs.length === 0 ? (
                        <div style={{ padding: `3px 8px 3px ${28 + indent}px`, fontSize: 10, color: "var(--text-4)", fontStyle: "italic" }}>
                            Empty — hover to add
                        </div>
                    ) : (
                        workflows.map(wf => (
                            <WorkflowRow
                                key={wf.id}
                                wf={wf}
                                packageId={pkg.id}
                                isActive={wf.id === activeWorkflowId}
                                indent={indent}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

function getAllWorkflows(pkg) {
    return [
        ...(pkg.workflows || []),
        ...(pkg.packages || []).flatMap(getAllWorkflows),
    ];
}

function findPkg(packages, pkgId) {
    for (const p of packages) {
        if (p.id === pkgId) return p;
        const found = findPkg(p.packages || [], pkgId);
        if (found) return found;
    }
    return null;
}

export default function PackageTree({ runStatusRefreshKey = 0 }) {
    const { packages, expandedRowId, moveWorkflow, movePackage, addPackage, copyWorkflow, pasteWorkflow, clipboardWorkflow, setRunContext } = useWorkflowStore();
    const [dragState, setDragState]         = useState(null);
    const [dragOverId, setDragOverId]       = useState(null);
    const [selectedPkgId, setSelectedPkgId] = useState(null);
    const [runStatuses, setRunStatuses]     = useState({});
    const [runningAll, setRunningAll]       = useState(false);

    useEffect(() => {
        setSelectedPkgId(prev => {
            if (prev) return prev;
            const first = packages.find(p => p.id);
            return first ? first.id : null;
        });
    }, [packages]);

    useEffect(() => {
        fetch(`${BASE_URL}/workflows/all-logs`)
            .then(res => res.ok ? res.json() : [])
            .then(logs => {
                const map = {};
                for (const log of logs) {
                    const id = log.workflowId;
                    if (!id) continue;
                    const existing = map[id];
                    if (!existing || new Date(log.runDateTime) > new Date(existing.runDateTime)) {
                        map[id] = log;
                    }
                }
                const statuses = {};
                for (const [id, log] of Object.entries(map)) {
                    statuses[id] = log.status;
                }
                setRunStatuses(statuses);
            })
            .catch(() => {});
    }, [runStatusRefreshKey]);

    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.target.matches("input, textarea, [contenteditable]")) return;
            if (e.target.closest(".react-flow")) return;
            if (!(e.ctrlKey || e.metaKey)) return;
            if (e.key === "c" && expandedRowId) {
                e.preventDefault();
                copyWorkflow(expandedRowId);
            } else if (e.key === "v" && clipboardWorkflow && selectedPkgId) {
                e.preventDefault();
                pasteWorkflow(selectedPkgId).catch(console.error);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [expandedRowId, selectedPkgId, clipboardWorkflow]);

    const handleAddPackage = () => addPackage("New Package", null).catch(console.error);

    const handleRunAll = async () => {
        if (!selectedPkgId || runningAll) return;
        const pkg = findPkg(packages, selectedPkgId);
        if (!pkg) return;
        const wfs = getAllWorkflows(pkg);
        if (wfs.length === 0) return;

        setRunningAll(true);
        const globalVars = persistentStore.getState().globalVariables || {};
        const next = { ...runStatuses };

        for (const wf of wfs) {
            try {
                const res = await fetch(`${BASE_URL}/workflows/${wf.id}/run`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ globalVariables: globalVars }),
                });
                const data = await res.json();
                next[wf.id] = data.status;
                if (data.context) setRunContext(wf.id, data.context);
            } catch {
                next[wf.id] = "failed";
            }
            setRunStatuses({ ...next });
        }
        setRunningAll(false);
    };

    const handleReport = () => {
        if (!selectedPkgId) return;
        const pkg = findPkg(packages, selectedPkgId);
        if (!pkg) return;
        exportTestReport(getAllWorkflows(pkg)).catch(console.error);
    };

    const dragCtx = {
        dragState, dragOverId, selectedPkgId, runStatuses,
        onSelectPkg:  id   => setSelectedPkgId(id),
        onDragStart:  info => setDragState(info),
        onDragOver:   id   => setDragOverId(id),
        onDragEnd:    ()   => { setDragState(null); setDragOverId(null); },
        handleDropOnPackage: targetPkgId => {
            if (!dragState) return;
            if (dragState.type === "workflow" && dragState.fromPackageId !== targetPkgId)
                moveWorkflow(dragState.id, dragState.fromPackageId, targetPkgId);
            else if (dragState.type === "package" && dragState.id !== targetPkgId)
                movePackage(dragState.id, targetPkgId);
            setDragState(null); setDragOverId(null);
        },
        handleDropOnRoot: () => {
            const rootPkgId = packages.find(p => p.id)?.id;
            if (dragState?.type === "package" && rootPkgId && dragState.id !== rootPkgId)
                movePackage(dragState.id, rootPkgId);
            setDragState(null); setDragOverId(null);
        },
    };

    return (
        <DragCtx.Provider value={dragCtx}>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-panel)", overflow: "hidden" }}>
                {/* Header */}
                <div style={{
                    padding: "8px 10px 7px",
                    borderBottom: "1px solid var(--border-xs)",
                    flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "var(--bg-header)",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 3, height: 12, borderRadius: 2, background: "linear-gradient(180deg, #3B82F6, #06B6D4)" }} />
                        <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-1)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                            Explorer
                        </span>
                    </div>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {clipboardWorkflow && (
                            <span
                                title={`Clipboard: "${clipboardWorkflow.name}" — Ctrl+V to paste`}
                                style={{
                                    fontSize: 9, fontWeight: 700, color: "#10B981",
                                    background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)",
                                    borderRadius: 3, padding: "1px 5px", letterSpacing: "0.06em",
                                    cursor: "default", userSelect: "none",
                                }}
                            >COPIED</span>
                        )}
                        <button
                            onClick={handleAddPackage}
                            title="Add package"
                            style={{
                                display: "flex", alignItems: "center", justifyContent: "center",
                                width: 22, height: 22, borderRadius: 4,
                                border: "1px solid var(--border-sm)",
                                cursor: "pointer", background: "var(--surface-2)",
                                color: "var(--text-1)", padding: 0, fontSize: 16, lineHeight: 1,
                                transition: "all 0.15s",
                            }}
                            onMouseEnter={e => { e.target.style.background = "rgba(59,130,246,0.12)"; e.target.style.color = "#60A5FA"; }}
                            onMouseLeave={e => { e.target.style.background = "var(--surface-2)"; e.target.style.color = "var(--text-4)"; }}
                        >+</button>

                        <button
                            onClick={handleReport}
                            title={selectedPkgId ? "Generate report for selected package" : "Select a package first"}
                            disabled={!selectedPkgId}
                            style={{
                                display: "flex", alignItems: "center", justifyContent: "center",
                                width: 22, height: 22, borderRadius: 4, border: "none",
                                cursor: selectedPkgId ? "pointer" : "default",
                                background: "transparent",
                                color: selectedPkgId ? "var(--text-4)" : "var(--text-2)",
                                padding: 0, transition: "all 0.15s",
                            }}
                            onMouseEnter={e => { if (selectedPkgId) { e.currentTarget.style.color = "#60A5FA"; e.currentTarget.style.background = "rgba(59,130,246,0.1)"; }}}
                            onMouseLeave={e => { e.currentTarget.style.color = selectedPkgId ? "var(--text-4)" : "var(--text-2)"; e.currentTarget.style.background = "transparent"; }}
                        >
                            <svg width="12" height="13" viewBox="0 0 12 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <rect x="1" y="1" width="10" height="11" rx="1.5"/>
                                <line x1="3.5" y1="4" x2="8.5" y2="4"/>
                                <line x1="3.5" y1="6.5" x2="8.5" y2="6.5"/>
                                <line x1="3.5" y1="9" x2="6.5" y2="9"/>
                            </svg>
                        </button>
                    </span>
                </div>

                {/* Tree */}
                <div
                    style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 4px" }}
                    onDragOver={e => { e.preventDefault(); dragCtx.onDragOver("root"); }}
                    onDrop={e => { e.preventDefault(); dragCtx.handleDropOnRoot(); }}
                >
                    {packages.map(pkg => (
                        <PackageRow
                            key={pkg.id ?? "__uncategorized__"}
                            pkg={pkg}
                            activeWorkflowId={expandedRowId}
                        />
                    ))}
                </div>
            </div>
        </DragCtx.Provider>
    );
}
