// Shared light palette — slate-on-white with a blue→violet accent. Mirrors index.css's
// :root custom properties (kept in sync manually) so hover/focus states defined there
// line up visually with the inline styles built from these tokens.
export const C = {
    bg:        '#f8fafc',
    panel:     '#ffffff',
    surface:   '#f1f5f9',
    border:    '#cbd5e1',
    borderLo:  '#e2e8f0',
    text:      '#0f172a',
    textDim:   '#475569',
    textFaint: '#94a3b8',
    accent:    '#2d6cdf',
    accent2:   '#7c3aed',
    accentDim: 'rgba(45,108,223,0.12)',
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

// One color per HTTP method — used by the method <select> in RequestSection and the
// method badges in CollectionTree/sidebar, so a method reads the same everywhere.
export const METHOD_COLORS = {
    GET:     '#10B981',
    POST:    '#2d6cdf',
    PUT:     '#f59e0b',
    PATCH:   '#8b5cf6',
    DELETE:  '#ef4444',
    HEAD:    '#64748b',
    OPTIONS: '#64748b',
};
export const methodColor = (method) => METHOD_COLORS[(method || '').toUpperCase()] || C.textDim;

/** Small rounded background tint for a method — the sidebar's request rows and any
 *  other place a method needs to read as a distinct, colored chip rather than plain text. */
export const methodBadgeStyle = (method) => {
    const color = methodColor(method);
    return {
        fontSize: 10, fontWeight: 700, color, background: `${color}1a`,
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

export const primaryBtnStyle = {
    ...btnStyle,
    background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
    border: 'none',
    color: '#fff',
    fontWeight: 700,
    boxShadow: `0 2px 8px ${C.accentDim}`,
};
