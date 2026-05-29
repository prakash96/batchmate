import { useState, useCallback } from "react";
import { useConnectionStore } from "../../store/connectionStore";
import { useMetadataStore } from "../../store/metadataStore";

function isVisible(showWhen, data) {
    if (!showWhen) return true;
    const val = data[showWhen.key];
    if (showWhen.value !== undefined) return val === showWhen.value;
    if (showWhen.values) return showWhen.values.includes(val);
    if (showWhen.notValues) return !showWhen.notValues.includes(val);
    return true;
}

function validateFields(type, config, connectionTypeDefs) {
    const def = connectionTypeDefs[type];
    if (!def) return {};
    const errors = {};
    for (const field of def.fields) {
        if (!field.required) continue;
        if (!isVisible(field.showWhen, config)) continue;
        const val = config[field.key];
        const empty = val === undefined || val === null || String(val).trim() === "";
        if (empty) errors[field.key] = `${field.label} is required`;
    }
    return errors;
}

export default function ConnectionsPanel() {
    const { connections, addConnection, updateConnection, deleteConnection } = useConnectionStore();
    const connectionTypeDefs = useMetadataStore(s => s.connectionTypes);
    const [formState, setFormState] = useState(null);
    const [fieldErrors, setFieldErrors] = useState({});

    const openNew  = () => { setFieldErrors({}); setFormState({ id: null, type: "sftp", name: "", config: {} }); };
    const openEdit = (conn) => { setFieldErrors({}); setFormState({ id: conn.id, type: conn.type, name: conn.name, config: { ...conn.config } }); };
    const cancelForm = () => { setFieldErrors({}); setFormState(null); };

    function saveForm() {
        const errors = {};
        if (!formState.name.trim()) errors["_name"] = "Connection name is required";
        Object.assign(errors, validateFields(formState.type, formState.config, connectionTypeDefs));

        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            return;
        }
        setFieldErrors({});

        if (formState.id) {
            updateConnection(formState.id, { name: formState.name, type: formState.type, config: formState.config });
        } else {
            addConnection({ name: formState.name, type: formState.type, config: formState.config });
        }
        setFormState(null);
    }

    function patchConfig(key, val) {
        setFormState(s => ({ ...s, config: { ...s.config, [key]: val } }));
        if (fieldErrors[key]) setFieldErrors(e => { const n = { ...e }; delete n[key]; return n; });
    }

    function patchName(val) {
        setFormState(s => ({ ...s, name: val }));
        if (fieldErrors["_name"]) setFieldErrors(e => { const n = { ...e }; delete n["_name"]; return n; });
    }

    function patchType(val) {
        setFormState(s => ({ ...s, type: val, config: {} }));
        setFieldErrors({});
    }

    if (formState) {
        return (
            <ConnectionForm
                state={formState}
                fieldErrors={fieldErrors}
                connectionTypeDefs={connectionTypeDefs}
                onChangeName={patchName}
                onChangeType={patchType}
                onPatchConfig={patchConfig}
                onSave={saveForm}
                onCancel={cancelForm}
            />
        );
    }

    const grouped = {};
    for (const conn of connections) {
        if (!grouped[conn.type]) grouped[conn.type] = [];
        grouped[conn.type].push(conn);
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", color: "var(--text-1)" }}>
            <div style={{
                padding: "9px 12px", borderBottom: "1px solid var(--border-xs)",
                display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
                background: "var(--bg-header)",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 3, height: 12, borderRadius: 2, background: "linear-gradient(180deg, #06B6D4, #3B82F6)" }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-1)", letterSpacing: "0.04em" }}>Connections</span>
                </div>
                <button onClick={openNew} style={styles.addBtn}>+ Add</button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
                {connections.length === 0 ? (
                    <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: 11, marginTop: 28 }}>
                        <div style={{ fontSize: 28, marginBottom: 8, color: "var(--text-3)" }}>[ ]</div>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>No connections yet</div>
                        <div style={{ lineHeight: 1.5 }}>Click "+ Add" to configure<br />a reusable connection</div>
                    </div>
                ) : (
                    Object.entries(connectionTypeDefs).map(([type, def]) => {
                        const items = grouped[type];
                        if (!items?.length) return null;
                        return (
                            <div key={type} style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-2)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5, paddingLeft: 2 }}>
                                    {def.icon} {def.label}
                                </div>
                                {items.map(conn => (
                                    <ConnectionRow
                                        key={conn.id}
                                        conn={conn}
                                        def={connectionTypeDefs[conn.type]}
                                        onEdit={() => openEdit(conn)}
                                        onDelete={() => deleteConnection(conn.id)}
                                    />
                                ))}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

function ConnectionRow({ conn, def, onEdit, onDelete }) {
    return (
        <div style={{
            display: "flex", alignItems: "center",
            padding: "5px 8px", borderRadius: 5, marginBottom: 3,
            background: "var(--bg-row)", border: "1px solid var(--border)",
        }}>
            <span style={{ fontSize: 12, marginRight: 6 }}>{def?.icon}</span>
            <span style={{ fontSize: 11, color: "var(--text-1)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {conn.name}
            </span>
            <button onClick={onEdit}   title="Edit"   style={styles.iconBtn}>e</button>
            <button onClick={onDelete} title="Delete" style={{ ...styles.iconBtn, marginLeft: 2 }}>x</button>
        </div>
    );
}

const DB_TYPES = new Set(["postgresql", "mysql", "oracle", "sqlserver", "db"]);
const TESTABLE_TYPES = new Set(["sftp", "ftp", "postgresql", "mysql", "oracle", "sqlserver", "db"]);

function ConnectionForm({ state, fieldErrors, connectionTypeDefs, onChangeName, onChangeType, onPatchConfig, onSave, onCancel }) {
    const def = connectionTypeDefs[state.type];
    const hasErrors = Object.keys(fieldErrors).length > 0;
    const [testResult, setTestResult] = useState(null);
    const [testing, setTesting] = useState(false);

    const resetTest = useCallback(() => setTestResult(null), []);

    function handleTypeChange(val) { resetTest(); onChangeType(val); }
    function handleConfigChange(key, val) { resetTest(); onPatchConfig(key, val); }

    async function testConnection() {
        setTesting(true);
        setTestResult(null);
        try {
            const resp = await fetch("/connections/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: state.type, config: state.config }),
            });
            const result = await resp.json();
            setTestResult(result);
        } catch (e) {
            setTestResult({ success: false, message: e.message });
        } finally {
            setTesting(false);
        }
    }

    const canTest = TESTABLE_TYPES.has(state.type);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", color: "var(--text-1)" }}>
            <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-xs)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, background: "var(--bg-header)" }}>
                <button onClick={onCancel} style={styles.backBtn}>&lt; Back</button>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", flex: 1 }}>
                    {state.id ? "Edit Connection" : "New Connection"}
                </span>
                {canTest && (
                    <button onClick={testConnection} disabled={testing} style={styles.testBtn}>
                        {testing ? "…" : "Test"}
                    </button>
                )}
                <button onClick={onSave} style={styles.saveBtn}>Save</button>
            </div>

            {testResult && (
                <div style={{
                    margin: "6px 12px 0", padding: "6px 10px", borderRadius: 5, fontSize: 11, flexShrink: 0,
                    background: testResult.success ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                    border: `1px solid ${testResult.success ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
                    color: testResult.success ? "#10B981" : "#EF4444",
                }}>
                    {testResult.success ? "✓ " : "✗ "}{testResult.message}
                </div>
            )}

            {hasErrors && (
                <div style={{ margin: "6px 12px 0", padding: "7px 10px", background: "#450a0a", border: "1px solid #dc2626", borderRadius: 5, fontSize: 11, color: "#fca5a5", flexShrink: 0 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Please fix the following:</div>
                    {Object.values(fieldErrors).map((msg, i) => (
                        <div key={i} style={{ paddingLeft: 8 }}>- {msg}</div>
                    ))}
                </div>
            )}

            <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 9 }}>
                <FormField label="Name" required error={fieldErrors["_name"]}>
                    <input
                        value={state.name}
                        onChange={e => onChangeName(e.target.value)}
                        placeholder="e.g. Production SFTP"
                        style={inputStyle(!!fieldErrors["_name"])}
                    />
                </FormField>

                <FormField label="Type">
                    <select
                        value={state.type}
                        onChange={e => handleTypeChange(e.target.value)}
                        style={inputStyle(false)}
                    >
                        {Object.entries(connectionTypeDefs).map(([t, d]) => (
                            <option key={t} value={t}>{d.icon} {d.label}</option>
                        ))}
                    </select>
                </FormField>

                {def && def.fields.map(field => {
                    if (!isVisible(field.showWhen, state.config)) return null;
                    const err = fieldErrors[field.key];
                    return (
                        <FormField key={field.key} label={field.label} required={field.required} error={err}>
                            {field.type === "select" ? (
                                <select
                                    value={state.config[field.key] || ""}
                                    onChange={e => handleConfigChange(field.key, e.target.value)}
                                    style={inputStyle(false)}
                                >
                                    {field.options.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            ) : field.type === "checkbox" ? (
                                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                                    <input
                                        type="checkbox"
                                        checked={!!state.config[field.key]}
                                        onChange={e => handleConfigChange(field.key, e.target.checked)}
                                    />
                                    Enable
                                </label>
                            ) : (
                                <input
                                    type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
                                    value={state.config[field.key] ?? ""}
                                    onChange={e => handleConfigChange(field.key, field.type === "number" ? Number(e.target.value) : e.target.value)}
                                    placeholder={field.placeholder}
                                    style={inputStyle(!!err)}
                                />
                            )}
                        </FormField>
                    );
                })}
            </div>
        </div>
    );
}

function FormField({ label, required, error, children }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: error ? "#EF4444" : "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {label}{required && <span style={{ color: "#f87171", marginLeft: 2 }}>*</span>}
            </label>
            {children}
        </div>
    );
}

const inputStyle = (hasError) => ({
    width: "100%", background: "var(--bg-input)", color: "var(--text-1)",
    border: `1px solid ${hasError ? "rgba(239,68,68,0.5)" : "var(--border-sm)"}`,
    borderRadius: 5, padding: "4px 7px",
    fontSize: 11, outline: "none", boxSizing: "border-box",
    fontFamily: "'Inter', sans-serif",
    boxShadow: hasError ? "0 0 0 3px rgba(239,68,68,0.08)" : "none",
});

const styles = {
    addBtn: {
        padding: "3px 10px", fontSize: 11, fontWeight: 600,
        background: "rgba(59,130,246,0.15)", color: "#60A5FA",
        border: "1px solid rgba(59,130,246,0.3)", borderRadius: 5, cursor: "pointer",
    },
    backBtn: {
        background: "transparent", border: "1px solid var(--border)", color: "var(--text-1)",
        borderRadius: 5, padding: "2px 8px", fontSize: 11, cursor: "pointer",
    },
    testBtn: {
        padding: "3px 10px", fontSize: 11, fontWeight: 600,
        background: "rgba(139,92,246,0.12)", color: "#A78BFA",
        border: "1px solid rgba(139,92,246,0.3)", borderRadius: 5, cursor: "pointer",
    },
    saveBtn: {
        padding: "3px 10px", fontSize: 11, fontWeight: 600,
        background: "rgba(16,185,129,0.15)", color: "#10B981",
        border: "1px solid rgba(16,185,129,0.3)", borderRadius: 5, cursor: "pointer",
    },
    iconBtn: {
        background: "transparent", border: "none", cursor: "pointer",
        padding: "1px 3px", fontSize: 12, color: "var(--text-1)", lineHeight: 1,
    },
};
