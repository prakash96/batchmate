import { useEffect, useState } from 'react';
import { useCollectionStore, flattenRequests } from '../../store/collectionStore';
import { useGlobalVarsStore } from '../../store/globalVarsStore';
import { C, inputStyle, btnStyle, primaryBtnStyle } from '../../theme';
import RequestSection from './RequestSection';
import ResponseViewer from '../ResponseViewer';
import InputDataSetModal from '../InputDataSetModal';

export default function RequestPanel() {
    const { activeRequestId, folders, saveRequest, runRequest } = useCollectionStore();
    const { globalVariables } = useGlobalVarsStore();
    const [draft, setDraft] = useState(null);
    const [dirty, setDirty] = useState(false);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState(null);
    const [showDataSets, setShowDataSets] = useState(false);

    const savedRequest = activeRequestId ? findRequestById(folders, activeRequestId) : null;

    useEffect(() => {
        setDraft(savedRequest ? structuredClone(savedRequest) : null);
        setDirty(false);
        setResult(null);
    }, [activeRequestId]);

    if (!activeRequestId || !draft) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.textFaint, fontSize: 13 }}>
                Select a request from the sidebar, or create a new one.
            </div>
        );
    }

    const patch = (fn) => { setDraft(d => { const next = fn(structuredClone(d)); return next; }); setDirty(true); };

    const save = async () => {
        await saveRequest(draft);
        setDirty(false);
    };

    const send = async () => {
        setRunning(true);
        try {
            await saveRequest(draft);
            setDirty(false);
            // Backend precedence is collectionVars, then this "overrideVars" map, then the
            // Pre-Request Call Request chain. Global variables are meant to be the *lowest* tier
            // (collection vars should win over them) — since the backend only has two tiers, merge
            // globals under the request's own collection variables here so the combined map still
            // lands as one "overrideVars" call.
            const collectionVars = findFolderById(folders, draft.collectionId)?.variables || {};
            const res = await runRequest(draft.id, { ...globalVariables, ...collectionVars });
            setResult(res);
        } finally {
            setRunning(false);
        }
    };

    const allRequests = flattenRequests(folders);
    const dataSets = draft.inputDataSets || [];
    const postResponse = draft.postResponse || [];

    return (
        <div style={{ height: '100%', overflowY: 'auto', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <input
                    style={{ ...inputStyle, fontSize: 14, fontWeight: 700, flex: 1, background: 'transparent', border: 'none', padding: '2px 0' }}
                    value={draft.name}
                    onChange={e => patch(d => { d.name = e.target.value; return d; })}
                />
                {dirty && <span style={{ fontSize: 10, color: C.warn }}>unsaved</span>}
            </div>

            <div style={{ border: `1px solid ${C.border}`, borderRadius: C.radius, background: C.panel, boxShadow: C.shadowSm, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: '0.03em' }}>REQUEST</span>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button onClick={() => setShowDataSets(true)} style={btnStyle}>📦 Input Data Set{dataSets.length ? ` (${dataSets.length})` : ''}</button>
                        <button onClick={save} style={btnStyle}>Save</button>
                        <button onClick={send} disabled={running} style={{ ...primaryBtnStyle, opacity: running ? 0.6 : 1 }}>
                            {running ? 'Sending…' : 'Send'}
                        </button>
                    </div>
                </div>

                <RequestSection
                    request={draft.request || {}}
                    onChange={patchObj => patch(d => { d.request = { ...d.request, ...patchObj }; return d; })}
                    preRequest={draft.preRequest || []}
                    onPreRequestChange={steps => patch(d => { d.preRequest = steps; return d; })}
                    postResponse={postResponse}
                    onPostResponseChange={next => patch(d => { d.postResponse = next; return d; })}
                    dataSets={dataSets}
                    allRequests={allRequests}
                    currentRequestId={draft.id}
                />
            </div>

            <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8, letterSpacing: '0.02em' }}>RESPONSE</div>
                <ResponseViewer result={result} />
            </div>

            {showDataSets && (
                <InputDataSetModal
                    dataSets={dataSets}
                    onChange={next => patch(d => { d.inputDataSets = next; return d; })}
                    onClose={() => setShowDataSets(false)}
                />
            )}
        </div>
    );
}

function findRequestById(folders, id) {
    for (const f of folders) {
        const found = (f.requests || []).find(r => r.id === id);
        if (found) return found;
        const nested = findRequestById(f.folders || [], id);
        if (nested) return nested;
    }
    return null;
}

function findFolderById(folders, id) {
    for (const f of folders) {
        if (f.id === id) return f;
        const nested = findFolderById(f.folders || [], id);
        if (nested) return nested;
    }
    return null;
}
