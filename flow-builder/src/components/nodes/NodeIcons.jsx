export const NODE_COLORS = {
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

export const GROUP_COLORS = {
    "Local File":    "#10B981",
    "SFTP":          "#06B6D4",
    "FTP / FTPS":    "#0EA5E9",
    "Cloud Storage": "#3B82F6",
    "Security":      "#EF4444",
    "Compression":   "#F59E0B",
    "Notification":  "#EC4899",
    "Database":      "#8B5CF6",
    "AWS":           "#F97316",
    "Core":          "#6366F1",
};

export const nodeColor = (type) => NODE_COLORS[type] ?? "#6b7280";

const ICONS = {
    http: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9"/>
            <path d="M3.6 9h16.8M3.6 15h16.8"/>
            <path d="M12 3c-2.5 2.5-4 5.5-4 9s1.5 6.5 4 9M12 3c2.5 2.5 4 5.5 4 9s-1.5 6.5-4 9"/>
        </svg>
    ),
    setbody: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
    ),
    setvariable: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="m8 9.5 3 3-3 3M13 15.5h3"/>
        </svg>
    ),
    condition: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2 4 12l8 10 8-10-8-10z"/>
        </svg>
    ),
    assertion: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2.944C7.03 6.08 4 8.96 4 12.5a8 8 0 0 0 16 0c0-3.54-3.03-6.42-8-9.556z"/>
            <path d="m9 12.5 2 2 4-4"/>
        </svg>
    ),
    log: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="m8 9 3 3-3 3M13 15h3"/>
        </svg>
    ),
    wait: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 7v5l3.5 3.5"/>
        </svg>
    ),
    jsoncompare: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 7.5 5 12l4 4.5M15 7.5 19 12l-4 4.5"/>
            <line x1="12" y1="4" x2="12" y2="20"/>
        </svg>
    ),
    dbexecute: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="6" rx="8" ry="2.5"/>
            <path d="M4 6v5c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5V6"/>
            <path d="M4 11v5c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5v-5"/>
        </svg>
    ),
    textcompare: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7h7M3 11h7M3 15h4"/>
            <path d="M14 7h7M14 11h7M14 15h4"/>
            <line x1="11.5" y1="4" x2="11.5" y2="20" strokeDasharray="2 2"/>
        </svg>
    ),
    errorscope: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9"/>
            <line x1="12" y1="8" x2="12" y2="13"/>
            <circle cx="12" cy="16" r="0.5" fill="currentColor"/>
        </svg>
    ),
    iteration: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 2 21 6 17 10"/>
            <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
            <path d="M7 22 3 18 7 14"/>
            <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
        </svg>
    ),
    base64encode: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="10" rx="2"/>
            <path d="M7 11v2M10 11v2M13 11v2M16 11v2"/>
            <path d="M17 4l-2-2-2 2M15 2v3"/>
        </svg>
    ),
    base64decode: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="10" rx="2"/>
            <path d="M7 11v2M10 11v2M13 11v2M16 11v2"/>
            <path d="M15 20l-2 2-2-2M13 22v-3"/>
        </svg>
    ),
    _default: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3"/>
            <path d="M9 12h6M12 9v6"/>
        </svg>
    ),
};

const GROUP_ICONS = {
    "Local File": (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
        </svg>
    ),
    "SFTP": (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
            <path d="M7 7h.01M11 7h.01M7 11h10"/>
        </svg>
    ),
    "FTP / FTPS": (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
            <path d="M12 7v6M9 10l3-3 3 3"/>
        </svg>
    ),
    "Cloud Storage": (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 10a6 6 0 1 0-11.9 1.1A4 4 0 1 0 8 19h10a4 4 0 0 0 0-8h-.6"/>
        </svg>
    ),
    "Security": (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="10" rx="2"/>
            <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
            <circle cx="12" cy="16" r="1" fill="currentColor"/>
        </svg>
    ),
    "Compression": (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3h18v5H3zM3 16h18v5H3z"/>
            <path d="M12 8v8M9 11l3-3 3 3M9 13l3 3 3-3"/>
        </svg>
    ),
    "Notification": (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
    ),
};

export function NodeIcon({ type, group, size = 20 }) {
    const icon = ICONS[type] ?? GROUP_ICONS[group] ?? ICONS._default;
    return (
        <span style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {icon}
        </span>
    );
}
