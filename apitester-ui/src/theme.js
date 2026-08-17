// Postman-like light palette — slate-on-white, with a switchable brand accent (see
// store/themeStore.js). "accent"/"accent2"/"accentDim" and every METHOD_COLORS entry are CSS
// custom property references (var(--x)), not literal hex — index.css defines the actual values
// per theme under :root (default = Postman orange) and [data-theme="classic"] (the app's earlier
// blue→violet look), so switching themes just flips that attribute on <html> and every inline
// style using these tokens updates instantly, with no React re-render needed anywhere. Every
// OTHER token here (bg/panel/border/text/success/danger/...) stays a plain literal — they aren't
// part of "the theme" being toggled, and several call sites hex-suffix them for alpha (e.g.
// `${C.success}18`), which only works with a literal hex string, not a var() reference.
export const C = {
    bg:        '#f8fafc',
    panel:     '#ffffff',
    surface:   '#f1f5f9',
    border:    '#cbd5e1',
    borderLo:  '#e2e8f0',
    text:      '#0f172a',
    textDim:   '#475569',
    textFaint: '#94a3b8',
    accent:    'var(--accent)',
    accent2:   'var(--accent-2)',
    accentDim: 'var(--accent-dim)',
    success:   '#10B981',
    danger:    '#ef4444',
    warn:      '#EAB308',
    mono:      "'JetBrains Mono', 'Fira Code', Consolas, monospace",
    sans:      "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    radius:    8,
    radiusSm:  6,
    shadowSm:  '0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)',
    shadowMd:  '0 4px 10px rgba(15,23,42,0.08), 0 2px 4px rgba(15,23,42,0.06)',
    shadowLg:  '0 12px 32px rgba(15,23,42,0.14), 0 4px 10px rgba(15,23,42,0.08)',
};

// One color per HTTP method — used by the method <select> in RequestSection and the method
// badges in CollectionTree/sidebar. Also var() references (see the file-level comment above) so
// POST/PUT (the two that actually differ between themes — Postman's own convention vs. the app's
// earlier scheme) switch along with the accent; GET/PATCH/DELETE/HEAD/OPTIONS don't change between
// themes but are var()-based too for consistency with methodBadgeStyle's dim-background lookup.
export const METHOD_COLORS = {
    GET:     'var(--method-get)',
    POST:    'var(--method-post)',
    PUT:     'var(--method-put)',
    PATCH:   'var(--method-patch)',
    DELETE:  'var(--method-delete)',
    HEAD:    'var(--method-head)',
    OPTIONS: 'var(--method-options)',
};
const METHOD_COLORS_DIM = {
    GET:     'var(--method-get-dim)',
    POST:    'var(--method-post-dim)',
    PUT:     'var(--method-put-dim)',
    PATCH:   'var(--method-patch-dim)',
    DELETE:  'var(--method-delete-dim)',
    HEAD:    'var(--method-head-dim)',
    OPTIONS: 'var(--method-options-dim)',
};
export const methodColor = (method) => METHOD_COLORS[(method || '').toUpperCase()] || C.textDim;

/** Small rounded background tint for a method — the sidebar's request rows and any other place a
 *  method needs to read as a distinct, colored chip rather than plain text. Looks up a dedicated
 *  "-dim" CSS var per method (rather than hex-suffixing methodColor()'s result) since that result
 *  is now a var() reference, which can't be alpha-suffixed as a string. */
export const methodBadgeStyle = (method) => {
    const key = (method || '').toUpperCase();
    const color = METHOD_COLORS[key] || C.textDim;
    const dim = METHOD_COLORS_DIM[key] || C.borderLo;
    return {
        fontSize: 10, fontWeight: 700, color, background: dim,
        borderRadius: 4, padding: '2px 6px', letterSpacing: '0.02em', flexShrink: 0,
    };
};

export const inputStyle = {
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: C.radiusSm,
    color: C.text,
    fontSize: 12,
    padding: '6px 9px',
    outline: 'none',
    fontFamily: 'inherit',
};

export const btnStyle = {
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: C.radiusSm,
    color: C.textDim,
    fontSize: 11,
    fontWeight: 600,
    padding: '6px 11px',
    cursor: 'pointer',
};

// Flat solid orange, no gradient — Postman's own primary buttons (Send/Save) are flat, not
// gradient-styled, so this matches that rather than the app's earlier blue→violet gradient look.
export const primaryBtnStyle = {
    ...btnStyle,
    background: C.accent,
    border: 'none',
    color: '#fff',
    fontWeight: 700,
    boxShadow: `0 2px 8px ${C.accentDim}`,
};
