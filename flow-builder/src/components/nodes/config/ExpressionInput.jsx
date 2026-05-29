import { useState, useRef } from "react";
import { inputStyle } from "./ConfigHelpers";

const SOURCE_COLORS = { body: "#10B981", headers: "#3B82F6", vars: "#8B5CF6" };

export default function ExpressionInput({ value, onChange, placeholder, rows, suggestions = [], bare = false }) {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [highlighted, setHighlighted] = useState(0);
    const ref = useRef(null);
    const blurTimer = useRef(null);

    // Returns autocomplete context based on cursor position and mode.
    // bare=false: triggers on "${", bare=true: triggers on "vars." / "headers." / "body."
    function getContext(el, currentText) {
        const text = currentText ?? (value || "");
        const pos = el.selectionStart;
        const before = text.slice(0, pos);

        if (bare) {
            const m = before.match(/(vars\.|headers\.|body\.)(\w*)$/);
            if (!m) return null;
            return {
                type: "bare",
                prefix: m[1],
                query: m[2].toLowerCase(),
                triggerStart: before.length - m[0].length,
            };
        } else {
            const dollarIdx = before.lastIndexOf("${");
            if (dollarIdx === -1) return null;
            if (before.slice(dollarIdx + 2).includes("}")) return null;
            return { type: "dollar", dollarIdx, query: before.slice(dollarIdx + 2).toLowerCase() };
        }
    }

    function handleChange(e) {
        onChange(e.target.value);
        const ctx = getContext(e.target, e.target.value);
        if (ctx) {
            const filtered = ctx.type === "bare"
                ? suggestions
                    .filter(s => s.startsWith(ctx.prefix) && s.slice(ctx.prefix.length).toLowerCase().startsWith(ctx.query))
                    .slice(0, 10)
                : suggestions
                    .filter(s => s.toLowerCase().includes(ctx.query))
                    .slice(0, 10);
            setItems(filtered);
            setHighlighted(0);
            setOpen(filtered.length > 0);
        } else {
            setOpen(false);
        }
    }

    function handleKeyDown(e) {
        if (!open) return;
        if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted(h => Math.min(h + 1, items.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
        else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertSuggestion(items[highlighted]); }
        else if (e.key === "Escape") setOpen(false);
    }

    function insertSuggestion(suggestion) {
        const el = ref.current;
        if (!el || !suggestion) return;
        const pos = el.selectionStart;
        const text = value || "";
        const before = text.slice(0, pos);
        const after = text.slice(pos);

        let newVal, newPos;
        if (bare) {
            const m = before.match(/(vars\.|headers\.|body\.)(\w*)$/);
            if (!m) return;
            const triggerStart = before.length - m[0].length;
            newVal = text.slice(0, triggerStart) + suggestion + after;
            newPos = triggerStart + suggestion.length;
        } else {
            const dollarIdx = before.lastIndexOf("${");
            newVal = text.slice(0, dollarIdx) + "${" + suggestion + "}" + after;
            newPos = dollarIdx + suggestion.length + 3;
        }
        onChange(newVal);
        setOpen(false);
        setTimeout(() => {
            if (el) {
                el.focus();
                el.setSelectionRange(newPos, newPos);
            }
        }, 0);
    }

    const sharedProps = {
        ref,
        value: value || "",
        onChange: handleChange,
        onKeyDown: handleKeyDown,
        onBlur: () => { blurTimer.current = setTimeout(() => setOpen(false), 150); },
        onFocus: () => clearTimeout(blurTimer.current),
        placeholder,
    };

    const codeStyle = {
        background: "rgba(59,130,246,0.12)", color: "#60A5FA",
        padding: "0 3px", borderRadius: 2,
        fontFamily: "'JetBrains Mono', monospace",
    };

    return (
        <div style={{ position: "relative" }}>
            {rows ? (
                <textarea
                    {...sharedProps}
                    rows={rows}
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 11, height: rows * 20 }}
                />
            ) : (
                <input type="text" {...sharedProps} style={inputStyle} />
            )}

            {open && items.length > 0 && (
                <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 9999,
                    background: "rgba(15,23,42,0.98)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 6,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.1)", maxHeight: 200, overflowY: "auto",
                    backdropFilter: "blur(12px)",
                }}>
                    {items.map((item, i) => {
                        const source = item.split(".")[0];
                        const rest = item.split(".").slice(1).join(".");
                        return (
                            <div
                                key={i}
                                onMouseDown={() => insertSuggestion(item)}
                                onMouseEnter={() => setHighlighted(i)}
                                style={{
                                    padding: "5px 8px", cursor: "pointer", fontSize: 11,
                                    background: i === highlighted ? "rgba(59,130,246,0.12)" : "transparent",
                                    display: "flex", alignItems: "center", gap: 4,
                                    borderBottom: i < items.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                                }}
                            >
                                <span style={{
                                    color: SOURCE_COLORS[source] || "#94A3B8",
                                    fontWeight: 600, fontSize: 10, minWidth: 36,
                                    fontFamily: "'JetBrains Mono', monospace",
                                }}>
                                    {source}
                                </span>
                                {rest && (
                                    <span style={{ color: "#E2E8F0", fontFamily: "'JetBrains Mono', monospace" }}>
                                        .{rest}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                    <div style={{ padding: "3px 8px", fontSize: 10, color: "#334155", borderTop: "1px solid rgba(255,255,255,0.04)", background: "rgba(0,0,0,0.2)" }}>
                        {bare
                            ? <>Type <code style={codeStyle}>vars.</code> or <code style={codeStyle}>headers.</code> for suggestions</>
                            : <>Type <code style={codeStyle}>${"{"}</code> to trigger suggestions</>
                        }
                    </div>
                </div>
            )}
        </div>
    );
}
