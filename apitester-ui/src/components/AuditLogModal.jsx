import { useEffect, useRef, useState } from 'react';
import { BASE_URL } from '../config';
import { C, inputStyle, btnStyle, primaryBtnStyle } from '../theme';

// Columns are never hardcoded here — audit-log-api.xml's get-audit-log-columns introspects
// AUDIT_LOG's real column list from the database every time, and this component just renders
// whatever comes back: one filter box + one table header per entry. Renaming/adding/removing a
// column in AUDIT_LOG changes what shows up here on the next fetch, no code change needed.
const TAIL_INTERVALS = [
    { ms: 2000, label: '2s' },
    { ms: 5000, label: '5s' },
    { ms: 10000, label: '10s' },
    { ms: 30000, label: '30s' },
];

/** Guesses a sensible default sort column once the real column list arrives — prefers anything
 *  that reads like a timestamp (most audit tables have exactly one), falling back to whatever
 *  column came back first. Tailing wants newest-first, so this pairs with orderDir defaulting to
 *  DESC. */
function guessOrderByColumn(columns) {
    const timeLike = columns.find(c => /date|time|created|updated|timestamp/i.test(c.name));
    return (timeLike || columns[0])?.name || '';
}

export default function AuditLogModal({ onClose }) {
    const [columns, setColumns] = useState(null); // null while loading; [] if AUDIT_LOG has none
    const [columnsError, setColumnsError] = useState(null);
    const [filters, setFilters] = useState({}); // {columnName: text}
    const [orderBy, setOrderBy] = useState('');
    const [orderDir, setOrderDir] = useState('DESC');
    const [limit, setLimit] = useState(200);
    const [rows, setRows] = useState([]);
    const [rowsError, setRowsError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [tailing, setTailing] = useState(false);
    const [tailIntervalMs, setTailIntervalMs] = useState(5000);
    const [lastFetchedAt, setLastFetchedAt] = useState(null);
    const tailTimerRef = useRef(null);

    // Load the column list once when the modal opens.
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${BASE_URL}/audit-log/columns`);
                const body = await res.json();
                if (!res.ok) throw new Error(body?.error || `Failed to load columns (${res.status})`);
                setColumns(body);
                setOrderBy(guessOrderByColumn(body));
            } catch (err) {
                setColumnsError(err.message);
                setColumns([]);
            }
        })();
    }, []);

    const fetchRows = async () => {
        setLoading(true);
        setRowsError(null);
        try {
            const params = new URLSearchParams();
            Object.entries(filters).forEach(([col, val]) => { if (val && val.trim()) params.set(col, val.trim()); });
            if (orderBy) params.set('orderBy', orderBy);
            params.set('orderDir', orderDir);
            params.set('limit', String(limit));
            const res = await fetch(`${BASE_URL}/audit-log/rows?${params.toString()}`);
            const body = await res.json();
            if (!res.ok) throw new Error(body?.error || `Failed to load rows (${res.status})`);
            setRows(body.rows || []);
            if (body.orderBy) setOrderBy(body.orderBy); // reflects the backend's fallback if the requested column was invalid/absent
            setLastFetchedAt(new Date());
        } catch (err) {
            setRowsError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // First real fetch once we know the columns (and therefore have a default orderBy).
    useEffect(() => {
        if (columns && columns.length > 0 && orderBy) fetchRows();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [columns]);

    // Tailing — re-fetch on an interval using whatever filters/orderBy/limit are CURRENTLY set,
    // exactly like a manual Refresh click would. Replaces the row list each tick rather than
    // trying to append/diff — simplest correct behavior without needing a stable cursor column
    // (which, since the column set isn't fixed, we can't assume exists).
    useEffect(() => {
        if (tailTimerRef.current) clearInterval(tailTimerRef.current);
        if (tailing) {
            tailTimerRef.current = setInterval(fetchRows, tailIntervalMs);
        }
        return () => { if (tailTimerRef.current) clearInterval(tailTimerRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tailing, tailIntervalMs, filters, orderBy, orderDir, limit]);

    const updateFilter = (col, val) => setFilters(f => ({ ...f, [col]: val }));
    const clearFilters = () => setFilters({});
    const hasFilters = Object.values(filters).some(v => v && v.trim());

    return (
        <div className="at-overlay" style={overlayStyle}>
            <div className="at-modal" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: C.radius, boxShadow: C.shadowLg, width: 1000, maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>📜 Audit Log</span>
                    <button onClick={onClose} style={btnStyle}>Close</button>
                </div>
                <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 12, flexShrink: 0 }}>
                    Tails <code style={{ color: C.textDim }}>AUDIT_LOG</code> — columns and filters below come straight from that table's real schema, not a fixed layout.
                </div>

                {columnsError && (
                    <div style={{ fontSize: 12, color: C.danger, marginBottom: 10 }}>{columnsError}</div>
                )}

                {columns === null ? (
                    <div style={{ fontSize: 11, color: C.textFaint, fontStyle: 'italic' }}>Loading columns…</div>
                ) : columns.length === 0 ? (
                    !columnsError && <div style={{ fontSize: 11, color: C.textFaint, fontStyle: 'italic' }}>AUDIT_LOG has no columns to show.</div>
                ) : (
                    <>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8,
                            padding: 10, border: `1px solid ${C.border}`, borderRadius: C.radiusSm, background: C.surface, flexShrink: 0,
                        }}>
                            <button
                                onClick={() => setTailing(t => !t)}
                                style={tailing ? { ...primaryBtnStyle, background: C.danger } : primaryBtnStyle}
                                title={tailing ? 'Stop live tailing' : 'Start live tailing (auto-refresh)'}
                            >
                                {tailing ? '⏸ Stop tailing' : '▶ Start tailing'}
                            </button>
                            <select style={{ ...inputStyle, padding: '4px 6px', fontSize: 11 }} value={tailIntervalMs} onChange={e => setTailIntervalMs(Number(e.target.value))} title="Tail refresh interval">
                                {TAIL_INTERVALS.map(t => <option key={t.ms} value={t.ms}>every {t.label}</option>)}
                            </select>
                            <button onClick={fetchRows} style={btnStyle} disabled={loading}>{loading ? 'Loading…' : '🔄 Refresh'}</button>
                            <span style={{ width: 1, height: 20, background: C.border }} />
                            <span style={{ fontSize: 10, color: C.textFaint }}>Order by</span>
                            <select style={{ ...inputStyle, padding: '4px 6px', fontSize: 11 }} value={orderBy} onChange={e => setOrderBy(e.target.value)}>
                                {columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                            </select>
                            <select style={{ ...inputStyle, padding: '4px 6px', fontSize: 11 }} value={orderDir} onChange={e => setOrderDir(e.target.value)}>
                                <option value="DESC">DESC (newest first)</option>
                                <option value="ASC">ASC (oldest first)</option>
                            </select>
                            <span style={{ fontSize: 10, color: C.textFaint }}>Limit</span>
                            <input
                                type="number" min={1} max={2000} style={{ ...inputStyle, width: 70, padding: '4px 6px', fontSize: 11 }}
                                value={limit} onChange={e => setLimit(Number(e.target.value) || 200)}
                            />
                            {hasFilters && <button onClick={clearFilters} style={{ ...btnStyle, padding: '4px 8px' }}>✕ Clear filters</button>}
                            <span style={{ fontSize: 10, color: C.textFaint, marginLeft: 'auto' }}>
                                {rows.length} row{rows.length === 1 ? '' : 's'}
                                {lastFetchedAt ? ` · updated ${lastFetchedAt.toLocaleTimeString()}` : ''}
                            </span>
                        </div>

                        {rowsError && <div style={{ fontSize: 12, color: C.danger, marginBottom: 8, flexShrink: 0 }}>{rowsError}</div>}

                        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: `1px solid ${C.border}`, borderRadius: C.radiusSm }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                <thead>
                                    <tr>
                                        {columns.map(c => (
                                            <th key={c.name} style={thStyle} title={c.type}>{c.name}</th>
                                        ))}
                                    </tr>
                                    <tr>
                                        {columns.map(c => (
                                            <th key={c.name} style={{ ...thStyle, padding: '4px 8px', position: 'sticky', top: 24 }}>
                                                <input
                                                    style={{ ...inputStyle, width: '100%', fontSize: 11, padding: '3px 6px' }}
                                                    placeholder="filter…"
                                                    value={filters[c.name] || ''}
                                                    onChange={e => updateFilter(c.name, e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter') fetchRows(); }}
                                                />
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.length === 0 ? (
                                        <tr><td colSpan={columns.length} style={{ ...tdStyle, fontStyle: 'italic', color: C.textFaint, textAlign: 'center' }}>
                                            {loading ? 'Loading…' : 'No matching rows.'}
                                        </td></tr>
                                    ) : rows.map((row, i) => (
                                        <tr key={i} style={{ background: i % 2 ? C.surface : 'transparent' }}>
                                            {columns.map(c => (
                                                <td key={c.name} style={{ ...tdStyle, fontFamily: C.mono, whiteSpace: 'nowrap' }}>
                                                    {row[c.name] === null || row[c.name] === undefined ? '' : String(row[c.name])}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ fontSize: 10, color: C.textFaint, marginTop: 6, flexShrink: 0 }}>
                            Press Enter in a filter box (or click 🔄 Refresh) to apply filters immediately — while tailing, they also apply on every automatic refresh.
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
};

const thStyle = {
    textAlign: 'left', padding: '6px 10px', fontSize: 10, fontWeight: 700, color: C.textFaint,
    letterSpacing: '0.03em', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0,
    background: C.panel, whiteSpace: 'nowrap',
};
const tdStyle = { padding: '6px 10px', verticalAlign: 'top', borderBottom: `1px solid ${C.borderLo}` };
