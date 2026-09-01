import { useEffect, useState } from 'react';
import { useTemplateStore } from '../store/templateStore';
import { useCollectionStore, flattenRequests } from '../store/collectionStore';
import { C, inputStyle, btnStyle, primaryBtnStyle } from '../theme';
import CallRequestStepsList from './shared/CallRequestStepsList';
import PostResponseFields from './panels/PostResponseFields';

let nextDraftId = 1;
function blankDraft() {
    return { id: `__new_${nextDraftId++}`, isNew: true, name: 'New Template', preRequest: [], postResponse: [] };
}

/** Manages the global template list (see templates-api.xml) — one flat list, no workspace/
 *  collection scoping. Each row expands into its own editor (name + the SAME Pre-Request/
 *  Post-Response step editors RequestPanel uses for a real request), same accordion pattern
 *  MockServerModal/RunAllReportModal use. */
export default function TemplateManagerModal({ onClose }) {
    const { templates, fetchTemplates, createTemplate, saveTemplate, deleteTemplate } = useTemplateStore();
    const { folders, fetchCollections } = useCollectionStore();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [openId, setOpenId] = useState(null);
    const [drafts, setDrafts] = useState({});
    const [savingId, setSavingId] = useState(null);
    const [localNew, setLocalNew] = useState([]);

    useEffect(() => {
        (async () => {
            try {
                await fetchTemplates();
                if (folders.length === 0) await fetchCollections();
            } catch (e) { setError(e.message); } finally { setLoading(false); }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const allRequests = flattenRequests(folders);
    const rows = [...localNew, ...templates];

    const draftFor = (row) => drafts[row.id] || { name: row.name, preRequest: row.preRequest || [], postResponse: row.postResponse || [] };

    const openRow = (row) => {
        if (openId === row.id) { setOpenId(null); return; }
        setDrafts((d) => ({ ...d, [row.id]: draftFor(row) }));
        setOpenId(row.id);
    };

    const updateDraft = (id, patch) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

    const addNew = () => {
        const draft = blankDraft();
        setLocalNew((l) => [draft, ...l]);
        setDrafts((d) => ({ ...d, [draft.id]: { name: draft.name, preRequest: draft.preRequest, postResponse: draft.postResponse } }));
        setOpenId(draft.id);
    };

    const save = async (row) => {
        const draft = drafts[row.id];
        if (!draft) return;
        setError(null);
        setSavingId(row.id);
        const body = { name: draft.name, preRequest: draft.preRequest, postResponse: draft.postResponse };
        try {
            if (row.isNew) {
                await createTemplate(body);
                setLocalNew((l) => l.filter((r) => r.id !== row.id));
            } else {
                await saveTemplate(row.id, body);
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
        try { await deleteTemplate(row.id); } catch (e) { setError(e.message); }
    };

    return (
        <div className="at-overlay" style={overlayStyle}>
            <div className="at-modal" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: C.radius, boxShadow: C.shadowLg, width: 760, maxHeight: '88vh', overflowY: 'auto', padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>📋 Templates</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={addNew} style={primaryBtnStyle}>+ Add Template</button>
                        <button onClick={onClose} style={btnStyle}>Close</button>
                    </div>
                </div>
                <div style={{ fontSize: 10, color: C.textFaint, marginBottom: 14 }}>
                    Reusable Pre-Request/Post-Response step lists — pick one when creating a new request (sidebar's "+req"), or per scenario in the Swagger Payload Generator. Doesn't touch a request's own method/url/headers/body.
                </div>

                {error && <div style={{ fontSize: 11, color: C.danger, marginBottom: 10 }}>{error}</div>}

                {loading ? (
                    <div style={{ fontSize: 12, color: C.textFaint, fontStyle: 'italic', padding: '20px 0' }}>Loading…</div>
                ) : rows.length === 0 ? (
                    <div style={{ fontSize: 12, color: C.textFaint, padding: '20px 0' }}>
                        No templates yet — click "+ Add Template" above to create the first one.
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
                                    <span style={{ fontSize: 12, fontWeight: 700, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                                    <span style={{ fontSize: 10, color: C.textDim }}>{(row.preRequest || []).length} pre · {(row.postResponse || []).length} post</span>
                                    <button onClick={(e) => { e.stopPropagation(); remove(row); }} style={{ ...btnStyle, padding: '3px 8px' }}>✕</button>
                                </div>
                                {open && (
                                    <div style={{ borderTop: `1px solid ${C.borderLo}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <div>
                                            <label style={{ fontSize: 10, color: C.textFaint, display: 'block', marginBottom: 3 }}>NAME</label>
                                            <input style={{ ...inputStyle, width: '100%' }} value={draft.name} onChange={(e) => updateDraft(row.id, { name: e.target.value })} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 6 }}>Pre-Request</div>
                                            <CallRequestStepsList
                                                steps={draft.preRequest}
                                                onChange={(steps) => updateDraft(row.id, { preRequest: steps })}
                                                allRequests={allRequests}
                                                currentRequestId={null}
                                                emptyLabel="No pre-request steps yet — add a Call Request."
                                            />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 6 }}>Post-Response</div>
                                            <PostResponseFields
                                                checks={draft.postResponse}
                                                onChange={(checks) => updateDraft(row.id, { postResponse: checks })}
                                                allRequests={allRequests}
                                                currentRequestId={null}
                                            />
                                        </div>
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

const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
};
