import { useState } from 'react';
import { C, inputStyle, methodColor } from '../../theme';
import CallRequestStepsList from '../shared/CallRequestStepsList';
import PostResponseFields from './PostResponseFields';
import KeyValueTable from '../shared/KeyValueTable';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const TABS = ['Pre-Request', 'Input', 'Post-Response'];

export default function RequestSection({
    request, onChange,
    preRequest, onPreRequestChange,
    postResponse, onPostResponseChange,
    dataSets, allRequests, currentRequestId,
}) {
    const [tab, setTab] = useState('Pre-Request');

    return (
        <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <select
                    style={{
                        ...inputStyle, flex: '0 0 112px', fontWeight: 800, color: methodColor(request.method),
                        borderColor: methodColor(request.method), background: `${methodColor(request.method)}12`,
                    }}
                    value={request.method}
                    onChange={e => onChange({ method: e.target.value })}
                >
                    {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <input
                    style={{ ...inputStyle, flex: 1, fontFamily: C.mono, fontSize: 12.5 }}
                    placeholder="https://api.example.com/endpoint?static=1"
                    value={request.url}
                    onChange={e => onChange({ url: e.target.value })}
                />
            </div>

            <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${C.border}`, marginBottom: 10, flexWrap: 'wrap' }}>
                {TABS.map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        style={{
                            background: 'none', border: 'none', borderBottom: tab === t ? `2px solid ${C.accent}` : '2px solid transparent',
                            color: tab === t ? C.text : C.textDim, fontSize: 11, fontWeight: 600, padding: '6px 10px', cursor: 'pointer',
                            transition: 'border-color .15s, color .15s',
                        }}
                    >
                        {t}
                        {t === 'Pre-Request' && preRequest.length ? ` (${preRequest.length})` : ''}
                        {t === 'Post-Response' && postResponse.length ? ` (${postResponse.length})` : ''}
                    </button>
                ))}
            </div>

            {tab === 'Pre-Request' && (
                <div>
                    <div style={{ fontSize: 10, color: C.textFaint, marginBottom: 8 }}>
                        Runs before this request is sent (e.g. an auth call). Its final result is bound as{' '}
                        <code style={{ color: C.textDim }}>${'{body}'}</code>/<code style={{ color: C.textDim }}>${'{headers}'}</code>{' '}
                        on the Input tab, which builds what this request actually sends.
                    </div>
                    <CallRequestStepsList
                        steps={preRequest} onChange={onPreRequestChange}
                        allRequests={allRequests} currentRequestId={currentRequestId}
                        emptyLabel="No pre-request calls yet — add one if something needs to happen before this request is sent."
                    />
                </div>
            )}
            {tab === 'Input' && (
                <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.textDim, marginBottom: 10 }}>
                        <input
                            type="checkbox"
                            checked={(request.inputSource || 'previous') === 'dataset'}
                            onChange={e => onChange({ inputSource: e.target.checked ? 'dataset' : 'previous' })}
                        />
                        Iterate over Input Data Set entries (whole pipeline runs once per entry)
                    </label>
                    {(request.inputSource || 'previous') === 'dataset' && (
                        <div style={{ fontSize: 10, color: dataSets.length ? C.textFaint : C.warn, marginBottom: 10 }}>
                            {dataSets.length
                                ? `Will run once per entry (${dataSets.length} total) — edit them via the 📦 Input Data Set button above.`
                                : 'No entries yet — add some via the 📦 Input Data Set button above.'}
                        </div>
                    )}

                    <div style={{ fontSize: 10, color: C.textFaint, marginBottom: 8 }}>
                        What this request actually sends. <code style={{ color: C.textDim }}>${'{body}'}</code> and{' '}
                        <code style={{ color: C.textDim }}>${'{headers}'}</code> refer to the Pre-Request chain's output
                        (or, per iteration, that entry's own body/headers, since the data set entry seeds the Pre-Request
                        chain first — see Pre-Request tab). A bare <code style={{ color: C.textDim }}>${'{body}'}</code>{' '}
                        passes it through unchanged; use <code style={{ color: C.textDim }}>{'${JSON.parse(body).field}'}</code>{' '}
                        for field access.
                    </div>

                    <div style={{ fontSize: 10, color: C.textFaint, marginBottom: 4, fontWeight: 700, letterSpacing: '0.03em' }}>BODY</div>
                    <textarea
                        style={{ ...inputStyle, width: '100%', minHeight: 100, fontFamily: C.mono, resize: 'vertical', marginBottom: 12 }}
                        placeholder="${body}"
                        value={request.body ?? ''}
                        onChange={e => onChange({ body: e.target.value })}
                    />

                    <div style={{ fontSize: 10, color: C.textFaint, marginBottom: 4, fontWeight: 700, letterSpacing: '0.03em' }}>
                        HEADERS <span style={{ fontWeight: 400, fontStyle: 'italic' }}>(not auto-inherited from Pre-Request — only rows listed here are sent; a value can still reach into the chain's headers via ${'{headers.X}'})</span>
                    </div>
                    <KeyValueTable rows={request.headers || []} onChange={rows => onChange({ headers: rows })} keyPlaceholder="header" />
                </div>
            )}
            {tab === 'Post-Response' && (
                <div>
                    <div style={{ fontSize: 10, color: C.textFaint, marginBottom: 8 }}>
                        Reorder freely with ↑/↓. Note: every Validation still runs (as part of the same call) before
                        any Call Request, regardless of the order below — a Call Request's first hop receives THIS
                        request's own response (body + headers) as its input by default.
                    </div>
                    <PostResponseFields checks={postResponse} onChange={onPostResponseChange} allRequests={allRequests} currentRequestId={currentRequestId} />
                </div>
            )}

            <div style={{ fontSize: 10, color: C.textFaint, marginTop: 10 }}>
                Use <code style={{ color: C.textDim }}>${'{vars.x}'}</code> anywhere in the URL to interpolate a global/collection variable.
            </div>
        </div>
    );
}
