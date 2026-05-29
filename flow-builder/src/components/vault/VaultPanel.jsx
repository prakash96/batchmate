import { useState, useRef, createContext, useContext } from "react";
import { useVaultStore } from "../../store/vaultStore";
import { useMetadataStore } from "../../store/metadataStore";

// ─── Shared helpers ────────────────────────────────────────────────────────────

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
                flex: 1, fontSize: 11, padding: "1px 4px",
                border: "1px solid rgba(245,158,11,0.5)", borderRadius: 3,
                outline: "none", background: "var(--bg-input)", color: "var(--text-1)", minWidth: 0,
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
                color: h ? (danger ? "#EF4444" : "#F59E0B") : "var(--text-4)",
                background: h ? (danger ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)") : "transparent",
            }}
        >
            {children}
        </span>
    );
}

// ─── Entry row ────────────────────────────────────────────────────────────────

function EntryRow({ entry, packageId, onEdit, onDelete, indent = 0 }) {
    const { dragState, dragOverId, onDragStart, onDragOver, onDragEnd } = useContext(DragCtx);
    const [hovering, setHovering] = useState(false);
    const vaultTypeDefs = useMetadataStore(s => s.vaultTypes);
    const def = vaultTypeDefs[entry.type];

    const isDragging = dragState?.id === entry.id && dragState?.type === "entry";
    const isDragOver = dragOverId === `entry-${entry.id}`;

    return (
        <div
            draggable
            onDragStart={e => { e.stopPropagation(); onDragStart({ type: "entry", id: entry.id, fromPackageId: packageId }); }}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); onDragOver(`entry-${entry.id}`); }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); }}
            onDragEnd={onDragEnd}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: `4px 8px 4px ${28 + indent}px`,
                borderRadius: 4, cursor: "default",
                background: isDragOver ? "rgba(245,158,11,0.1)" : hovering ? "var(--surface)" : "transparent",
                borderLeft: "2px solid transparent",
                opacity: isDragging ? 0.4 : 1,
            }}
        >
            <span style={{ fontSize: 11, flexShrink: 0 }}>{def?.icon ?? "📦"}</span>
            <span style={{
                flex: 1, fontSize: 11, color: "var(--text-4)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{entry.name}</span>

            {hovering && (
                <span style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    <ActionBtn title="Edit" onClick={e => { e.stopPropagation(); onEdit(entry); }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </ActionBtn>
                    <ActionBtn title="Delete" danger onClick={e => { e.stopPropagation(); onDelete(entry.id); }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
                    </ActionBtn>
                </span>
            )}
        </div>
    );
}

// ─── Package row ──────────────────────────────────────────────────────────────

function PackageRow({ pkg, onEdit, onDelete, depth = 0 }) {
    const { addVaultPackage, renameVaultPackage, deleteVaultPackage } = useVaultStore();
    const { dragState, dragOverId, onDragStart, onDragOver, onDragEnd, handleDropOnPackage } = useContext(DragCtx);
    const [open, setOpen]       = useState(true);
    const [editing, setEditing] = useState(false);
    const [hovering, setHovering] = useState(false);

    const entries = pkg.entries  || [];
    const subPkgs = pkg.packages || [];
    const totalCount = entries.length + subPkgs.length;
    const indent = depth * 12;

    const isDragging = dragState?.id === pkg.id && dragState?.type === "package";
    const isDragOver = dragOverId === `pkg-${pkg.id}`;

    return (
        <div style={{ marginBottom: 1, opacity: isDragging ? 0.4 : 1 }}>
            <div
                draggable={depth > 0 && !!pkg.id && !editing}
                onClick={() => { if (!editing) setOpen(v => !v); }}
                onDragStart={e => { e.stopPropagation(); depth > 0 && pkg.id && onDragStart({ type: "package", id: pkg.id }); }}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); onDragOver(`pkg-${pkg.id}`); }}
                onDrop={e => { e.preventDefault(); e.stopPropagation(); if (pkg.id) handleDropOnPackage(pkg.id); }}
                onDragEnd={onDragEnd}
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
                style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: `5px 8px 5px ${8 + indent}px`,
                    cursor: editing ? "default" : "pointer", borderRadius: 4,
                    background: isDragOver ? "rgba(245,158,11,0.1)" : hovering ? "var(--surface)" : "transparent",
                    outline: isDragOver ? "1px dashed rgba(245,158,11,0.4)" : "none",
                    userSelect: "none",
                }}
            >
                {/* chevron */}
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#475569" strokeWidth="1.5" strokeLinecap="round">
                    {open ? <polyline points="1,2 4,6 7,2"/> : <polyline points="2,1 6,4 2,7"/>}
                </svg>

                {/* folder icon */}
                <svg width="13" height="11" viewBox="0 0 13 11" fill={open ? "#fbbf24" : "#fde68a"} stroke="#f59e0b" strokeWidth="1" strokeLinecap="round">
                    <path d="M1 2.5a1 1 0 0 1 1-1h3l1.5 1.5H11a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2.5z"/>
                </svg>

                {editing ? (
                    <InlineEdit
                        value={pkg.name}
                        onCommit={v => { renameVaultPackage(pkg.id, v); setEditing(false); }}
                        onCancel={() => setEditing(false)}
                    />
                ) : (
                    <span style={{
                        flex: 1, fontSize: 11, fontWeight: 600,
                        color: "var(--text-4)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                        {pkg.name}
                        <span style={{ fontWeight: 400, color: "var(--text-1)", marginLeft: 4 }}>{totalCount}</span>
                    </span>
                )}

                {hovering && !editing && pkg.id && (
                    <span style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                        <ActionBtn title="Add entry" onClick={e => { e.stopPropagation(); onEdit({ packageId: pkg.id }); }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </ActionBtn>
                        <ActionBtn title={depth === 0 ? "Add package" : "Add sub-package"} onClick={e => { e.stopPropagation(); addVaultPackage("New Package", pkg.id); }}>
                            <svg width="12" height="10" viewBox="0 0 15 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                <path d="M1 3a1 1 0 0 1 1-1h3l1.5 1.5H11a1 1 0 0 1 1 1v1.5"/>
                                <path d="M1 5v5a1 1 0 0 0 1 1h5"/>
                                <line x1="11" y1="8" x2="11" y2="13"/><line x1="8.5" y1="10.5" x2="13.5" y2="10.5"/>
                            </svg>
                        </ActionBtn>
                        <ActionBtn title="Rename" onClick={e => { e.stopPropagation(); setEditing(true); }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </ActionBtn>
                        <ActionBtn title="Delete package" danger onClick={e => { e.stopPropagation(); deleteVaultPackage(pkg.id); }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
                        </ActionBtn>
                    </span>
                )}
            </div>

            {open && (
                <div>
                    {subPkgs.map(sp => (
                        <PackageRow key={sp.id} pkg={sp} onEdit={onEdit} onDelete={onDelete} depth={depth + 1} />
                    ))}
                    {entries.length === 0 && subPkgs.length === 0 ? (
                        <div style={{ padding: `3px 8px 3px ${28 + indent}px`, fontSize: 10, color: "var(--text-4)", fontStyle: "italic" }}>
                            Empty — hover to add
                        </div>
                    ) : (
                        entries.map(entry => (
                            <EntryRow
                                key={entry.id}
                                entry={entry}
                                packageId={pkg.id}
                                onEdit={onEdit}
                                onDelete={onDelete}
                                indent={indent}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function VaultPanel() {
    const { vaultPackages, addVaultPackage, addVaultEntry, updateVaultEntry, deleteVaultEntry, moveVaultPackage } = useVaultStore();
    const vaultTypeDefs = useMetadataStore(s => s.vaultTypes);
    const [formState, setFormState] = useState(null);

    // onEdit is called with either an entry object (edit) or { packageId } (new entry in package)
    function openEdit(entryOrNew) {
        if (entryOrNew.id) {
            // editing existing
            setFormState({ id: entryOrNew.id, type: entryOrNew.type, name: entryOrNew.name, config: { ...entryOrNew.config }, packageId: entryOrNew.packageId });
        } else {
            // new entry in a package
            setFormState({ id: null, type: Object.keys(vaultTypeDefs)[0] || "password", name: "", config: {}, packageId: entryOrNew.packageId });
        }
    }

    async function saveForm() {
        if (!formState.name.trim()) return;
        if (formState.id) {
            await updateVaultEntry(formState.id, { name: formState.name, type: formState.type, config: formState.config, packageId: formState.packageId });
        } else {
            await addVaultEntry({ name: formState.name, type: formState.type, config: formState.config, packageId: formState.packageId });
        }
        setFormState(null);
    }

    const [dragState, setDragState] = useState(null);
    const [dragOverId, setDragOverId] = useState(null);

    const dragCtx = {
        dragState, dragOverId,
        onDragStart: info => setDragState(info),
        onDragOver:  id   => setDragOverId(id),
        onDragEnd:   ()   => { setDragState(null); setDragOverId(null); },
        handleDropOnPackage: targetPkgId => {
            if (!dragState) return;
            if (dragState.type === "entry" && dragState.fromPackageId !== targetPkgId) {
                // move entry: update its packageId
                updateVaultEntry(dragState.id, { packageId: targetPkgId });
            } else if (dragState.type === "package" && dragState.id !== targetPkgId) {
                moveVaultPackage(dragState.id, targetPkgId);
            }
            setDragState(null); setDragOverId(null);
        },
    };

    if (formState) {
        return (
            <VaultForm
                state={formState}
                vaultTypeDefs={vaultTypeDefs}
                onChange={patch => setFormState(s => ({ ...s, ...patch }))}
                onPatchConfig={(key, val) => setFormState(s => ({ ...s, config: { ...s.config, [key]: val } }))}
                onSave={saveForm}
                onCancel={() => setFormState(null)}
            />
        );
    }

    return (
        <DragCtx.Provider value={dragCtx}>
            <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-panel)", overflow: "hidden" }}>
                {/* Header */}
                <div style={{
                    padding: "8px 10px 7px", borderBottom: "1px solid var(--border-xs)",
                    flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "var(--bg-header)",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 3, height: 12, borderRadius: 2, background: "linear-gradient(180deg, #F59E0B, #EF4444)" }} />
                        <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-1)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Vault</span>
                    </div>
                    <button
                        onClick={() => addVaultPackage("New Package", null)}
                        title="Add package"
                        style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 22, height: 22, borderRadius: 4,
                            border: "1px solid var(--border-sm)",
                            cursor: "pointer", background: "var(--surface-2)",
                            color: "var(--text-4)", padding: 0, fontSize: 16, lineHeight: 1,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(245,158,11,0.12)"; e.currentTarget.style.color = "#F59E0B"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--text-4)"; }}
                    >+</button>
                </div>

                {/* Tree */}
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 4px" }}>
                    {vaultPackages.length === 0 ? (
                        <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: 11, marginTop: 28 }}>
                            <div style={{ fontSize: 24, marginBottom: 8 }}>🔒</div>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>Vault is empty</div>
                            <div style={{ lineHeight: 1.5 }}>Click "+" to add a package</div>
                        </div>
                    ) : (
                        vaultPackages.map(pkg => (
                            <PackageRow
                                key={pkg.id ?? "__uncategorized__"}
                                pkg={pkg}
                                onEdit={openEdit}
                                onDelete={deleteVaultEntry}
                            />
                        ))
                    )}
                </div>
            </div>
        </DragCtx.Provider>
    );
}

// ─── Entry form ───────────────────────────────────────────────────────────────

function isVisible(showWhen, data) {
    if (!showWhen) return true;
    const val = data[showWhen.key];
    if (showWhen.value !== undefined) return val === showWhen.value;
    if (showWhen.values) return showWhen.values.includes(val);
    if (showWhen.notValues) return !showWhen.notValues.includes(val);
    return true;
}

function VaultForm({ state, vaultTypeDefs, onChange, onPatchConfig, onSave, onCancel }) {
    const def = vaultTypeDefs[state.type];
    const [nameError, setNameError] = useState("");

    function handleSave() {
        if (!state.name.trim()) { setNameError("Name is required"); return; }
        setNameError("");
        onSave();
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", color: "var(--text-1)" }}>
            <div style={{
                padding: "8px 12px", borderBottom: "1px solid var(--border-xs)",
                display: "flex", alignItems: "center", gap: 8, flexShrink: 0, background: "var(--bg-header)",
            }}>
                <button onClick={onCancel} style={styles.backBtn}>&lt; Back</button>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", flex: 1 }}>
                    {state.id ? "Edit Entry" : "New Entry"}
                </span>
                <button onClick={handleSave} style={styles.saveBtn}>Save</button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 9 }}>
                <FormField label="Name" required error={nameError}>
                    <input
                        value={state.name}
                        onChange={e => { onChange({ name: e.target.value }); if (nameError) setNameError(""); }}
                        placeholder="e.g. Production PGP Key"
                        style={inputStyle(!!nameError)}
                    />
                </FormField>

                <FormField label="Type">
                    <select
                        value={state.type}
                        onChange={e => onChange({ type: e.target.value, config: {} })}
                        style={inputStyle(false)}
                    >
                        {Object.entries(vaultTypeDefs).map(([t, d]) => (
                            <option key={t} value={t}>{d.icon} {d.label}</option>
                        ))}
                    </select>
                </FormField>

                {def && def.fields.map(field => {
                    if (!isVisible(field.showWhen, state.config)) return null;
                    return (
                        <FormField key={field.key} label={field.label} required={field.required}>
                            {field.type === "select" ? (
                                <select
                                    value={state.config[field.key] || ""}
                                    onChange={e => onPatchConfig(field.key, e.target.value)}
                                    style={inputStyle(false)}
                                >
                                    {field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            ) : field.type === "textarea" ? (
                                <textarea
                                    value={state.config[field.key] ?? ""}
                                    onChange={e => onPatchConfig(field.key, e.target.value)}
                                    placeholder={field.placeholder}
                                    rows={6}
                                    style={{ ...inputStyle(false), resize: "vertical", fontFamily: "monospace", fontSize: 10, lineHeight: 1.5 }}
                                />
                            ) : field.type === "file" ? (
                                <FileField
                                    accept={field.accept}
                                    value={state.config[field.key]}
                                    fileName={state.config[field.key + "_filename"]}
                                    onChange={(b64, name) => { onPatchConfig(field.key, b64); onPatchConfig(field.key + "_filename", name); }}
                                />
                            ) : field.type === "checkbox" ? (
                                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                                    <input type="checkbox" checked={!!state.config[field.key]} onChange={e => onPatchConfig(field.key, e.target.checked)} />
                                    Enable
                                </label>
                            ) : (
                                <input
                                    type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
                                    value={state.config[field.key] ?? ""}
                                    onChange={e => onPatchConfig(field.key, field.type === "number" ? Number(e.target.value) : e.target.value)}
                                    placeholder={field.placeholder}
                                    style={inputStyle(false)}
                                />
                            )}
                        </FormField>
                    );
                })}
            </div>
        </div>
    );
}

function FileField({ accept, value, fileName, onChange }) {
    const inputRef = useRef(null);
    function handleFile(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const b64 = btoa(String.fromCharCode(...new Uint8Array(reader.result)));
            onChange(b64, file.name);
        };
        reader.readAsArrayBuffer(file);
    }
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input ref={inputRef} type="file" accept={accept} style={{ display: "none" }} onChange={handleFile} />
            <button type="button" onClick={() => inputRef.current.click()} style={{
                ...inputStyle(false), cursor: "pointer", textAlign: "left", flex: 1, padding: "4px 8px",
                color: fileName ? "var(--text-1)" : "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
                {fileName || "Choose file…"}
            </button>
            {value && (
                <button type="button" onClick={() => onChange(null, null)} style={{ ...styles.iconBtn, color: "var(--text-3)" }}>×</button>
            )}
        </div>
    );
}

function FormField({ label, required, error, children }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: error ? "#EF4444" : "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {label}{required && <span style={{ color: "#f87171", marginLeft: 2 }}>*</span>}
            </label>
            {error && <div style={{ fontSize: 10, color: "#EF4444" }}>{error}</div>}
            {children}
        </div>
    );
}

const inputStyle = (hasError) => ({
    width: "100%", background: "var(--bg-input)", color: "var(--text-1)",
    border: `1px solid ${hasError ? "rgba(239,68,68,0.5)" : "var(--border-sm)"}`,
    borderRadius: 5, padding: "4px 7px", fontSize: 11, outline: "none",
    boxSizing: "border-box", fontFamily: "'Inter', sans-serif",
    boxShadow: hasError ? "0 0 0 3px rgba(239,68,68,0.08)" : "none",
});

const styles = {
    backBtn: {
        background: "transparent", border: "1px solid var(--border)", color: "var(--text-1)",
        borderRadius: 5, padding: "2px 8px", fontSize: 11, cursor: "pointer",
    },
    saveBtn: {
        padding: "3px 10px", fontSize: 11, fontWeight: 600,
        background: "rgba(16,185,129,0.15)", color: "#10B981",
        border: "1px solid rgba(16,185,129,0.3)", borderRadius: 5, cursor: "pointer",
    },
    iconBtn: {
        background: "transparent", border: "none", cursor: "pointer",
        padding: "1px 4px", fontSize: 14, lineHeight: 1,
    },
};
