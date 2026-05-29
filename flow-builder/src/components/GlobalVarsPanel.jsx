import { useState } from "react";
import { persistentStore } from "../store/persistentStore";

const INPUT = {
    background: "var(--bg-input)", border: "1px solid var(--border-sm)",
    borderRadius: 5, color: "var(--text-1)", fontSize: 12, padding: "5px 8px",
    outline: "none", width: "100%", boxSizing: "border-box",
};
const LABEL = { fontSize: 9, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.1em", textTransform: "uppercase" };
const CODE  = { color: "#8B5CF6", background: "rgba(139,92,246,0.1)", padding: "0 4px", borderRadius: 3, fontFamily: "'JetBrains Mono', monospace" };

export default function GlobalVarsPanel({ onClose }) {
    const { globalVariables, setGlobalVariables } = persistentStore();

    const [entries, setEntries] = useState(() =>
        Object.entries(globalVariables || {}).map(([k, v]) => ({ key: k, value: String(v ?? "") }))
    );
    const [newKey, setNewKey] = useState("");
    const [newVal, setNewVal] = useState("");

    const persist = (next) => {
        const obj = {};
        next.forEach(({ key, value }) => { if (key.trim()) obj[key.trim()] = value; });
        setGlobalVariables(obj);
    };

    const update = (i, field, val) => {
        const next = entries.map((e, idx) => idx === i ? { ...e, [field]: val } : e);
        setEntries(next);
        persist(next);
    };

    const remove = (i) => {
        const next = entries.filter((_, idx) => idx !== i);
        setEntries(next);
        persist(next);
    };

    const addNew = () => {
        const k = newKey.trim();
        if (!k) return;
        const next = [...entries, { key: k, value: newVal }];
        setEntries(next);
        persist(next);
        setNewKey("");
        setNewVal("");
    };

    return (
        <div style={{
            position: "absolute", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center",
            backdropFilter: "blur(4px)",
        }}>
            <div style={{
                background: "#0B1120", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 10,
                width: 660, maxWidth: "92vw", maxHeight: "82vh",
                display: "flex", flexDirection: "column",
                boxShadow: "0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(139,92,246,0.06)",
            }}>

                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
                    <div style={{
                        width: 30, height: 30, borderRadius: 7,
                        background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.2)",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#8B5CF6" strokeWidth="1.6" strokeLinecap="round">
                            <path d="M4 2 Q1.5 2 1.5 4.5 v1 Q1.5 7 3.5 7 Q1.5 7 1.5 8.5 v1 Q1.5 12 4 12"/>
                            <path d="M10 2 Q12.5 2 12.5 4.5 v1 Q12.5 7 10.5 7 Q12.5 7 12.5 8.5 v1 Q12.5 12 10 12"/>
                        </svg>
                    </div>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>Global Variables</div>
                        <div style={{ fontSize: 10, color: "#64748B", marginTop: 1 }}>
                            Injected before every workflow run · access via <code style={CODE}>vars.name</code>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            marginLeft: "auto", width: 26, height: 26, borderRadius: 6, border: "none",
                            background: "rgba(255,255,255,0.06)", color: "#94A3B8", cursor: "pointer", fontSize: 16,
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                    >×</button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px" }}>

                    {/* Column headers */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 26px", gap: 8, marginBottom: 6 }}>
                        <div style={LABEL}>Variable Name</div>
                        <div style={LABEL}>Value</div>
                        <div />
                    </div>

                    {/* Existing rows */}
                    {entries.length === 0 && (
                        <div style={{ textAlign: "center", padding: "28px 0", color: "#334155", fontSize: 12, fontStyle: "italic" }}>
                            No variables yet — add one below
                        </div>
                    )}
                    {entries.map((entry, i) => (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 26px", gap: 8, marginBottom: 6, alignItems: "center" }}>
                            <input
                                value={entry.key}
                                onChange={e => update(i, "key", e.target.value)}
                                placeholder="variableName"
                                style={{ ...INPUT, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
                            />
                            <input
                                value={entry.value}
                                onChange={e => update(i, "value", e.target.value)}
                                placeholder="value"
                                style={INPUT}
                            />
                            <button
                                onClick={() => remove(i)}
                                style={{
                                    width: 26, height: 30, border: "1px solid rgba(239,68,68,0.2)", borderRadius: 5,
                                    background: "rgba(239,68,68,0.06)", color: "#EF4444", cursor: "pointer",
                                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, padding: 0,
                                }}
                            >×</button>
                        </div>
                    ))}

                    {/* Add new variable */}
                    <div style={{
                        display: "grid", gridTemplateColumns: "1fr 1fr 26px", gap: 8,
                        marginTop: 10, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.05)",
                        alignItems: "center",
                    }}>
                        <input
                            value={newKey}
                            onChange={e => setNewKey(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && addNew()}
                            placeholder="New variable name..."
                            style={{ ...INPUT, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, borderColor: newKey.trim() ? "rgba(139,92,246,0.35)" : "rgba(255,255,255,0.08)" }}
                        />
                        <input
                            value={newVal}
                            onChange={e => setNewVal(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && addNew()}
                            placeholder="Value..."
                            style={INPUT}
                        />
                        <button
                            onClick={addNew}
                            disabled={!newKey.trim()}
                            title="Add variable"
                            style={{
                                width: 26, height: 30, border: "1px solid rgba(59,130,246,0.25)", borderRadius: 5,
                                background: newKey.trim() ? "rgba(59,130,246,0.1)" : "transparent",
                                color: newKey.trim() ? "#60A5FA" : "#334155",
                                cursor: newKey.trim() ? "pointer" : "default",
                                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, padding: 0,
                            }}
                        >+</button>
                    </div>

                    {/* Usage hint */}
                    <div style={{
                        marginTop: 20, padding: "11px 14px", borderRadius: 7,
                        background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.12)",
                    }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#7C3AED", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Usage</div>
                        <div style={{ fontSize: 11, color: "#94A3B8", lineHeight: 1.85 }}>
                            In node expressions &amp; assertions: <code style={CODE}>vars.name</code><br/>
                            In HTTP body / headers with interpolation: <code style={CODE}>{"${vars.name}"}</code><br/>
                            In conditions / set variable: <code style={CODE}>vars.name</code> (no braces needed)
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
