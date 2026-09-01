import { useEffect, useState } from 'react';
import { useMockStore } from '../store/mockStore';
import { BASE_URL } from '../config';
import { C, inputStyle, btnStyle, primaryBtnStyle } from '../theme';

const METHODS = ['*', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// A brand-new, not-yet-saved row — negative-ish local id so it never collides with a real one
// (real ids are uuids from the backend) and so the list can tell "new" from "existing" at a glance.
let nextDraftId = 1;
function blankDraft() {
    return {
        id: `__new_${nextDraftId++}`,
        isNew: true,
        name: 'New mock endpoint',
        method: 'GET',
        path: '/',
        statusCode: 200,
        contentType: 'application/json',
        responseHeadersText: '{}',
        responseBody: '',
        enabled: true,
    };
}

/** Manages the global mock-server endpoint list (see mock-api.xml) — one flat list, no
 *  workspace/collection scoping. Each row expands into its own editor, same accordion pattern
 *  RunAllReportModal uses for its per-request results. */
export default function MockServerModal({ onClose }) {
    const { endpoints, fetchEndpoints, createEndpoint, saveEndpoint, deleteEndpoint } = useMockStore();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [openId, setOpenId] = useState(null);
    const [drafts, setDrafts] = useState({}); // id -> in-progress edits, keyed so multiple rows could theoretically be mid-edit
    const [savingId, setSavingId] = useState(null);
    const [localNew, setLocalNew] = useState([]); // rows created via "+ Add Endpoint" but not yet POSTed

    useEffect(() => {
        (async () => {
            try { await fetchEndpoints(); } catch (e) { setError(e.message); } finally { setLoading(false); }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const rows = [...localNew, ...endpoints];

    const draftFor = (row) => drafts[row.id] || {
        name: row.name, method: row.method, path: row.path, statusCode: row.statusCode,
        contentType: row.contentType, responseHeadersText: JSON.stringify(row.responseHeaders ?? {}, null, 2),
        responseBody: row.responseBody ?? '', enabled: row.enabled,
    };

    const openRow = (row) => {
        if (openId === row.id) { setOpenId(null); return; }
        setDrafts((d) => ({ ...d, [row.id]: draftFor(row) }));
        setOpenId(row.id);
    };

    const updateDraft = (id, patch) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

    const addNew = () => {
        const draft = blankDraft();
        setLocalNew((l) => [draft, ...l]);
        setDrafts((d) => ({
            ...d,
            [draft.id]: { name: draft.name, method: draft.method, path: draft.path, statusCode: draft.statusCode, contentType: draft.contentType, responseHeadersText: draft.responseHeadersText, responseBody: draft.responseBody, enabled: draft.enabled },
        }));
        setOpenId(draft.id);
    };

    const save = async (row) => {
        const draft = drafts[row.id];
        if (!draft) return;
        let responseHeaders;
        try {
            responseHeaders = JSON.parse(draft.responseHeadersText || '{}');
        } catch {
            setError('Response Headers must be valid JSON (or leave it as "{}").');
            return;
        }
        setError(null);
        setSavingId(row.id);
        const body = {
            name: draft.name, method: draft.method, path: draft.path,
            statusCode: Number(draft.statusCode) || 200, contentType: draft.contentType,
            responseHeaders, responseBody: draft.responseBody, enabled: draft.enabled,
        };
        try {
            if (row.isNew) {
                await createEndpoint(body);
                setLocalNew((l) => l.filter((r) => r.id !== row.id));
            } else {
                await saveEndpoint(row.id, body);
            }
            setOpenId(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setSavingId(null);
        }
    };

    const remove = async (row) => {
        if (row.isNew) { setLocalNew((l) => l.filter((r) => r.id !== row.id)); return; }
        try { await deleteEndpoint(row.id); } catch (e) { setError(e.message); }
    };

    return (
        <div className="at-overlay" style={overlayStyle}>
            <div className="at-modal" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: C.radius, boxShadow: C.shadowLg, width: 760, maxHeight: '88vh', overflowY: 'auto', padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>🎭 Mock Server</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={addNew} style={primaryBtnStyle}>+ Add Endpoint</button>
                        <button onClick={onClose} style={btnStyle}>Close</button>
                    </div>
                </div>
                <div style={{ fontSize: 10, color: C.textFaint, marginBottom: 14 }}>
                    Global, hand-defined canned responses — point any request at <code style={{ color: C.textDim }}>{BASE_URL}/mock/…</code> instead of a real backend. "Path" supports <code style={{ color: C.textDim }}>{'{param}'}</code> segments that match anything (e.g. <code style={{ color: C.textDim }}>/users/{'{id}'}</code>); the most specific match wins when more than one endpoint could fire.
                </div>

                {error && <div style={{ fontSize: 11, color: C.danger, marginBottom: 10 }}>{error}</div>}

                {loading ? (
                    <div style={{ fontSize: 12, color: C.textFaint, fontStyle: 'italic', padding: '20px 0' }}>Loading…</div>
                ) : rows.length === 0 ? (
                    <div style={{ fontSize: 12, color: C.textFaint, padding: '20px 0' }}>
                        No mock endpoints yet — click "+ Add Endpoint" above to create the first one.
                    </div>
                ) : (
                    rows.map((row) => {
                        const open = openId === row.id;
                        const draft = draftFor(row);
                        return (
                            <div key={row.id} style={{ border: `1px solid ${C.border}`, borderRadius: C.radiusSm, marginBottom: 8, overflow: 'hidden' }}>
                                <div
                                    onClick={() => openRow(row)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', cursor: 'pointer',
                                        background: open ? C.surface : 'transparent', transition: 'background-color .12s',
                                    }}
                                >
                                    <span style={{ fontSize: 10, color: C.textFaint, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
                                    <span style={{
                                        fontSize: 10, fontWeight: 700, color: C.accent, background: `${C.border}55`,
                                        borderRadius: 4, padding: '2px 6px', minWidth: 44, textAlign: 'center', flexShrink: 0,
                                    }}>{row.method}</span>
                                    <span style={{ fontSize: 12, fontFamily: C.mono, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.path}</span>
                                    <span style={{ fontSize: 10, color: C.textDim }}>{row.statusCode}</span>
                                    {!row.enabled && (
                                        <span style={{ fontSize: 10, fontWeight: 700, color: C.textFaint, background: C.surface, borderRadius: 6, padding: '2px 8px' }}>disabled</span>
                                    )}
                                    <button onClick={(e) => { e.stopPropagation(); remove(row); }} style={{ ...btnStyle, padding: '3px 8px' }}>✕</button>
                                </div>
                                {open && (
                                    <div style={{ borderTop: `1px solid ${C.borderLo}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <Field label="NAME">
                                            <input style={{ ...inputStyle, width: '100%' }} value={draft.name} onChange={(e) => updateDraft(row.id, { name: e.target.value })} />
                                        </Field>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <Field label="METHOD" style={{ width: 110 }}>
                                                <select style={{ ...inputStyle, width: '100%' }} value={draft.method} onChange={(e) => updateDraft(row.id, { method: e.target.value })}>
                                                    {METHODS.map((m) => <option key={m} value={m}>{m === '*' ? '* (any)' : m}</option>)}
                                                </select>
                                            </Field>
                                            <Field label="PATH" style={{ flex: 1 }}>
                                                <input style={{ ...inputStyle, width: '100%', fontFamily: C.mono }} placeholder="/users/{id}" value={draft.path} onChange={(e) => updateDraft(row.id, { path: e.target.value })} />
                                            </Field>
                                            <Field label="STATUS" style={{ width: 80 }}>
                                                <input type="number" style={{ ...inputStyle, width: '100%' }} value={draft.statusCode} onChange={(e) => updateDraft(row.id, { statusCode: e.target.value })} />
                                            </Field>
                                        </div>
                                        <Field label="CONTENT-TYPE">
                                            <input style={{ ...inputStyle, width: '100%' }} value={draft.contentType} onChange={(e) => updateDraft(row.id, { contentType: e.target.value })} />
                                        </Field>
                                        <Field label="RESPONSE HEADERS (JSON)">
                                            <textarea
                                                style={{ ...inputStyle, width: '100%', height: 60, fontFamily: C.mono, resize: 'vertical' }}
                                                value={draft.responseHeadersText}
                                                onChange={(e) => updateDraft(row.id, { responseHeadersText: e.target.value })}
                                            />
                                        </Field>
                                        <Field label="RESPONSE BODY">
                                            <textarea
                                                style={{ ...inputStyle, width: '100%', height: 140, fontFamily: C.mono, resize: 'vertical' }}
                                                value={draft.responseBody}
                                                onChange={(e) => updateDraft(row.id, { responseBody: e.target.value })}
                                            />
                                        </Field>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.textDim }}>
                                            <input type="checkbox" checked={draft.enabled} onChange={(e) => updateDraft(row.id, { enabled: e.target.checked })} />
                                            Enabled
                                        </label>
                                        <div>
                                            <button onClick={() => save(row)} style={primaryBtnStyle} disabled={savingId === row.id}>
                                                {savingId === row.id ? 'Saving…' : 'Save'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

function Field({ label, children, style }) {
    return (
        <div style={style}>
            <label style={{ fontSize: 10, color: C.textFaint, display: 'block', marginBottom: 3 }}>{label}</label>
            {children}
        </div>
    );
}

const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
};
