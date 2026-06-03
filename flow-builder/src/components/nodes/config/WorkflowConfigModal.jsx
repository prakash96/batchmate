import { useState, useRef, useEffect } from "react";

// ── Shared style tokens ───────────────────────────────────────────────────────
const INPUT = {
    background: "var(--bg-input)",
    border: "1px solid var(--border)",
    borderRadius: 5,
    color: "var(--text-1)",
    fontSize: 12,
    padding: "6px 9px",
    outline: "none",
    fontFamily: "'JetBrains Mono', monospace",
    boxSizing: "border-box",
    width: "100%",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function configToRows(config) {
    return Object.entries(config || {}).map(([key, value]) => ({
        key,
        value: String(value ?? ""),
        id: Math.random().toString(36).slice(2),
    }));
}

function rowsToConfig(rows) {
    const obj = {};
    for (const row of rows) {
        const k = row.key.trim();
        if (k) obj[k] = row.value;
    }
    return obj;
}

function parseJsonToRows(text) {
    const obj = JSON.parse(text);
    if (typeof obj !== "object" || Array.isArray(obj) || obj === null)
        throw new Error("JSON must be an object { }");
    return Object.entries(obj).map(([key, value]) => ({
        key,
        value: typeof value === "object" ? JSON.stringify(value) : String(value ?? ""),
        id: Math.random().toString(36).slice(2),
    }));
}

function rowsToJson(rows) {
    return JSON.stringify(rowsToConfig(rows), null, 2);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WorkflowConfigModal({ config, onSave, onClose }) {
    const [mode, setMode] = useState("kv");   // "kv" | "json"
    const [rows, setRows] = useState(() => configToRows(config));
    const [jsonText, setJsonText] = useState(() => JSON.stringify(config || {}, null, 2));
    const [jsonError, setJsonError] = useState("");
    const firstKeyRef = useRef(null);

    useEffect(() => {
        if (mode === "kv" && rows.length === 0) return;
        // focus first key input on mount
    }, []);

    // ── Mode switching ────────────────────────────────────────────────────────
    function switchToKv() {
        setJsonError("");
        try {
            setRows(parseJsonToRows(jsonText));
            setMode("kv");
        } catch (e) {
            setJsonError("Invalid JSON — fix errors before switching: " + e.message);
        }
    }

    function switchToJson() {
        setJsonText(rowsToJson(rows));
        setJsonError("");
        setMode("json");
    }

    // ── KV row operations ─────────────────────────────────────────────────────
    function addRow() {
        setRows(prev => [...prev, { key: "", value: "", id: Math.random().toString(36).slice(2) }]);
    }

    function updateRow(id, field, value) {
        setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    }

    function removeRow(id) {
        setRows(prev => prev.filter(r => r.id !== id));
    }

    // ── Save ──────────────────────────────────────────────────────────────────
    function handleSave() {
        setJsonError("");
        let result;
        if (mode === "json") {
            try {
                result = JSON.parse(jsonText);
                if (typeof result !== "object" || Array.isArray(result) || result === null)
                    throw new Error("Must be a JSON object { }");
            } catch (e) {
                setJsonError(e.message);
                return;
            }
        } else {
            result = rowsToConfig(rows);
        }
        onSave(result);
    }

    // ── Tab button ────────────────────────────────────────────────────────────
    function TabBtn({ id, label, icon }) {
        const active = mode === id;
        return (
            <button
                onClick={() => id === "kv" ? switchToKv() : switchToJson()}
                style={{
                    padding: "4px 14px", fontSize: 11, fontWeight: active ? 700 : 500,
                    background: active ? "rgba(59,130,246,0.18)" : "transparent",
                    border: `1px solid ${active ? "rgba(59,130,246,0.45)" : "transparent"}`,
                    borderRadius: 5, cursor: "pointer",
                    color: active ? "#60A5FA" : "var(--text-3)",
                    transition: "all 0.12s", display: "flex", alignItems: "center", gap: 5,
                }}
            >
                {icon}
                {label}
            </button>
        );
    }

    const activeCount = rows.filter(r => r.key.trim()).length;

    return (
        <div
            style={{
                position: "fixed", inset: 0, zIndex: 9000,
                background: "rgba(0,0,0,0.58)",
                display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onClick={onClose}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: "var(--bg-panel)",
                    border: "1px solid rgba(59,130,246,0.2)",
                    borderRadius: 12,
                    width: "min(640px, calc(100vw - 32px))",
                    maxHeight: "82vh",
                    display: "flex", flexDirection: "column",
                    boxShadow: "0 24px 64px rgba(0,0,0,0.72), 0 0 0 1px rgba(59,130,246,0.08)",
                    overflow: "hidden",
                }}
            >
                {/* ── Header ── */}
                <div style={{
                    padding: "16px 20px 14px",
                    borderBottom: "1px solid var(--border-xs)",
                    flexShrink: 0,
                }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                            background: "rgba(139,92,246,0.12)",
                            border: "1px solid rgba(139,92,246,0.28)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                stroke="#8B5CF6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="3"/>
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
                                <line x1="12" y1="2" x2="12" y2="5"/>
                                <line x1="12" y1="19" x2="12" y2="22"/>
                                <line x1="2" y1="12" x2="5" y2="12"/>
                                <line x1="19" y1="12" x2="22" y2="12"/>
                            </svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", marginBottom: 2 }}>
                                Workflow Configuration
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                                Variables injected before each run — override global vars when keys match
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            style={{
                                background: "transparent", border: "none", cursor: "pointer",
                                color: "var(--text-3)", fontSize: 20, lineHeight: 1, padding: "0 4px",
                                transition: "color 0.12s", flexShrink: 0,
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = "#EF4444"}
                            onMouseLeave={e => e.currentTarget.style.color = "var(--text-3)"}
                        >×</button>
                    </div>

                    {/* Mode tabs */}
                    <div style={{
                        display: "flex", gap: 2,
                        background: "var(--surface-2)", border: "1px solid var(--border-sm)",
                        borderRadius: 7, padding: 3, width: "fit-content",
                    }}>
                        <TabBtn id="kv" label="Key-Value" icon={
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                                <rect x="0" y="2" width="5" height="2" rx="1"/>
                                <rect x="7" y="2" width="9" height="2" rx="1"/>
                                <rect x="0" y="7" width="5" height="2" rx="1"/>
                                <rect x="7" y="7" width="9" height="2" rx="1"/>
                                <rect x="0" y="12" width="5" height="2" rx="1"/>
                                <rect x="7" y="12" width="9" height="2" rx="1"/>
                            </svg>
                        } />
                        <TabBtn id="json" label="JSON" icon={
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="none"
                                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                <path d="M4 2 C2 2 2 4 2 5 L2 7 C2 8.5 1 9 1 9 C1 9 2 9.5 2 11 L2 13 C2 14 2 14 4 14"/>
                                <path d="M12 2 C14 2 14 4 14 5 L14 7 C14 8.5 15 9 15 9 C15 9 14 9.5 14 11 L14 13 C14 14 14 14 12 14"/>
                            </svg>
                        } />
                    </div>

                    {/* Active count badge */}
                    {mode === "kv" && activeCount > 0 && (
                        <span style={{
                            display: "inline-block", marginTop: 8,
                            fontSize: 10, color: "#8B5CF6",
                            background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)",
                            borderRadius: 10, padding: "1px 8px", fontWeight: 600,
                        }}>
                            {activeCount} variable{activeCount !== 1 ? "s" : ""}
                        </span>
                    )}
                </div>

                {/* ── Body ── */}
                <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    {mode === "kv" ? (
                        <>
                            {/* Column headers */}
                            {rows.length > 0 && (
                                <div style={{
                                    display: "flex", gap: 8, padding: "8px 20px 4px",
                                    borderBottom: "1px solid var(--border-xs)", flexShrink: 0,
                                }}>
                                    <div style={{ width: 200, flexShrink: 0, fontSize: 9, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                                        Variable Name
                                    </div>
                                    <div style={{ flex: 1, fontSize: 9, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                                        Value
                                    </div>
                                    <div style={{ width: 28 }} />
                                </div>
                            )}

                            {/* Rows */}
                            <div style={{ flex: 1, overflowY: "auto", padding: "10px 20px" }}>
                                {rows.length === 0 ? (
                                    <div style={{
                                        textAlign: "center", padding: "40px 0",
                                        color: "var(--text-3)", fontSize: 12,
                                    }}>
                                        <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>⚙</div>
                                        No variables defined.
                                        <br />
                                        <span style={{ fontSize: 11 }}>Click <b>Add Variable</b> to start.</span>
                                    </div>
                                ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                        {rows.map((row, idx) => (
                                            <div key={row.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                                <input
                                                    ref={idx === rows.length - 1 ? firstKeyRef : null}
                                                    value={row.key}
                                                    onChange={e => updateRow(row.id, "key", e.target.value)}
                                                    placeholder="variableName"
                                                    style={{ ...INPUT, width: 200, flexShrink: 0 }}
                                                    onFocus={e => e.target.style.borderColor = "rgba(59,130,246,0.5)"}
                                                    onBlur={e => e.target.style.borderColor = "var(--border)"}
                                                    spellCheck={false}
                                                />
                                                <input
                                                    value={row.value}
                                                    onChange={e => updateRow(row.id, "value", e.target.value)}
                                                    placeholder="value or ${vars.other}"
                                                    style={{ ...INPUT, flex: 1 }}
                                                    onFocus={e => e.target.style.borderColor = "rgba(59,130,246,0.5)"}
                                                    onBlur={e => e.target.style.borderColor = "var(--border)"}
                                                    spellCheck={false}
                                                />
                                                <button
                                                    onClick={() => removeRow(row.id)}
                                                    title="Remove"
                                                    style={{
                                                        width: 28, height: 28, flexShrink: 0,
                                                        background: "transparent",
                                                        border: "1px solid transparent",
                                                        borderRadius: 5, cursor: "pointer",
                                                        color: "var(--text-3)", fontSize: 16, lineHeight: 1,
                                                        display: "flex", alignItems: "center", justifyContent: "center",
                                                        transition: "all 0.1s",
                                                    }}
                                                    onMouseEnter={e => {
                                                        e.currentTarget.style.color = "#EF4444";
                                                        e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)";
                                                        e.currentTarget.style.background = "rgba(239,68,68,0.07)";
                                                    }}
                                                    onMouseLeave={e => {
                                                        e.currentTarget.style.color = "var(--text-3)";
                                                        e.currentTarget.style.borderColor = "transparent";
                                                        e.currentTarget.style.background = "transparent";
                                                    }}
                                                >×</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Add row button */}
                            <div style={{ padding: "8px 20px 12px", flexShrink: 0, borderTop: rows.length > 0 ? "1px solid var(--border-xs)" : "none" }}>
                                <button
                                    onClick={() => {
                                        addRow();
                                        setTimeout(() => firstKeyRef.current?.focus(), 30);
                                    }}
                                    style={{
                                        background: "transparent",
                                        border: "1px dashed var(--border)",
                                        borderRadius: 6, padding: "6px 14px",
                                        cursor: "pointer", color: "var(--text-3)",
                                        fontSize: 11, fontWeight: 600,
                                        display: "flex", alignItems: "center", gap: 6,
                                        width: "100%", justifyContent: "center",
                                        transition: "all 0.12s",
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.borderColor = "rgba(59,130,246,0.45)";
                                        e.currentTarget.style.color = "#60A5FA";
                                        e.currentTarget.style.background = "rgba(59,130,246,0.05)";
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.borderColor = "var(--border)";
                                        e.currentTarget.style.color = "var(--text-3)";
                                        e.currentTarget.style.background = "transparent";
                                    }}
                                >
                                    <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
                                        <rect x="5" y="0" width="2" height="12" rx="1"/>
                                        <rect x="0" y="5" width="12" height="2" rx="1"/>
                                    </svg>
                                    Add Variable
                                </button>
                            </div>
                        </>
                    ) : (
                        /* ── JSON mode ── */
                        <div style={{ flex: 1, padding: "14px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "'Inter', sans-serif" }}>
                                JSON object — keys become variable names, values become variable values
                            </div>
                            <textarea
                                value={jsonText}
                                onChange={e => { setJsonText(e.target.value); setJsonError(""); }}
                                spellCheck={false}
                                style={{
                                    flex: 1, minHeight: 260,
                                    background: "var(--bg-input)",
                                    border: `1px solid ${jsonError ? "rgba(239,68,68,0.5)" : "var(--border)"}`,
                                    borderRadius: 7, color: "var(--text-1)",
                                    fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                                    padding: "12px 14px", resize: "none",
                                    outline: "none", lineHeight: 1.6, boxSizing: "border-box",
                                    width: "100%",
                                    transition: "border-color 0.12s",
                                }}
                                onFocus={e => { if (!jsonError) e.target.style.borderColor = "rgba(59,130,246,0.5)"; }}
                                onBlur={e => { if (!jsonError) e.target.style.borderColor = "var(--border)"; }}
                                placeholder={'{\n  "apiEndpoint": "https://api.example.com",\n  "timeout": "30000",\n  "env": "production"\n}'}
                            />
                            {jsonError && (
                                <div style={{
                                    fontSize: 11, color: "#FCA5A5", fontFamily: "'JetBrains Mono', monospace",
                                    background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)",
                                    borderRadius: 5, padding: "7px 10px", lineHeight: 1.5,
                                }}>
                                    ⚠ {jsonError}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Footer ── */}
                <div style={{
                    padding: "12px 20px",
                    borderTop: "1px solid var(--border-xs)",
                    display: "flex", justifyContent: "flex-end", gap: 8,
                    flexShrink: 0, background: "var(--bg-app)",
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: "7px 18px", fontSize: 12, fontWeight: 600,
                            background: "transparent", border: "1px solid var(--border)",
                            borderRadius: 7, cursor: "pointer", color: "var(--text-2)",
                            transition: "all 0.12s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = "var(--text-3)"}
                        onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        style={{
                            padding: "7px 20px", fontSize: 12, fontWeight: 700,
                            background: "linear-gradient(135deg, #8B5CF6cc, #8B5CF699)",
                            border: "1px solid #8B5CF660",
                            borderRadius: 7, cursor: "pointer", color: "#fff",
                            boxShadow: "0 0 14px rgba(139,92,246,0.35)",
                            transition: "all 0.15s",
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = "linear-gradient(135deg, #8B5CF6, #8B5CF6cc)";
                            e.currentTarget.style.boxShadow = "0 0 22px rgba(139,92,246,0.55)";
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = "linear-gradient(135deg, #8B5CF6cc, #8B5CF699)";
                            e.currentTarget.style.boxShadow = "0 0 14px rgba(139,92,246,0.35)";
                        }}
                    >
                        Save Configuration
                    </button>
                </div>
            </div>
        </div>
    );
}
