import { useState } from 'react';
import { C, inputStyle } from '../theme';

const statusColor = (status) => {
    const n = Number(status);
    if (!n) return C.textDim;
    if (n < 300) return C.success;
    if (n < 400) return C.warn;
    return C.danger;
};

export default function ResponseViewer({ result }) {
    if (!result) {
        return <div style={{ fontSize: 11, color: C.textFaint, fontStyle: 'italic', padding: 12 }}>Send the request to see its response here.</div>;
    }
    if (result.iterating) {
        return <IterationsList iterations={result.iterations || []} />;
    }
    return <SingleRunView result={result} />;
}

/** Input Data Set-driven run: the whole pipeline ran once per entry — one row per iteration,
 *  click to expand its own full Body/Headers/Checks/logs view (SingleRunView, reused as-is). */
function IterationsList({ iterations }) {
    const [openIndex, setOpenIndex] = useState(iterations.length ? 0 : null);
    const passCount = iterations.filter(r => r.status === 'success').length;

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.border}`, marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{iterations.length} iteration{iterations.length === 1 ? '' : 's'}</span>
                <span style={{
                    fontSize: 11, fontWeight: 600, color: passCount === iterations.length ? C.success : C.danger,
                    background: passCount === iterations.length ? `${C.success}15` : `${C.danger}15`, borderRadius: 10, padding: '2px 9px',
                }}>
                    {passCount}/{iterations.length} succeeded
                </span>
            </div>
            {iterations.length === 0 && <div style={{ fontSize: 11, color: C.textFaint, fontStyle: 'italic' }}>No Input Data Set entries to iterate over.</div>}
            {iterations.map((r, i) => {
                const open = openIndex === i;
                const ok = r.status === 'success';
                return (
                    <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: C.radiusSm, marginBottom: 8, overflow: 'hidden' }}>
                        <div
                            onClick={() => setOpenIndex(open ? null : i)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', cursor: 'pointer',
                                background: open ? C.surface : 'transparent', transition: 'background-color .12s',
                            }}
                        >
                            <span style={{ fontSize: 10, color: C.textFaint, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>Iteration {i + 1}</span>
                            <span style={{
                                fontSize: 11, fontWeight: 700, color: statusColor(r.response?.status),
                                background: `${statusColor(r.response?.status)}18`, borderRadius: 6, padding: '1px 8px',
                            }}>{r.response?.status ?? (ok ? '—' : 'ERROR')}</span>
                            <span style={{ fontSize: 10, color: C.textDim }}>{r.durationMs} ms</span>
                            {!ok && <span style={{ fontSize: 10, color: C.danger, marginLeft: 'auto' }}>{r.error}</span>}
                        </div>
                        {open && <div style={{ borderTop: `1px solid ${C.borderLo}`, padding: 10 }}><SingleRunView result={r} /></div>}
                    </div>
                );
            })}
        </div>
    );
}

function SingleRunView({ result }) {
    const [tab, setTab] = useState('Body');

    if (result.status === 'failed' && !result.response) {
        return (
            <div>
                <div style={{ color: C.danger, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Run failed</div>
                <pre style={{ ...inputStyle, whiteSpace: 'pre-wrap', color: C.danger, fontSize: 11 }}>{result.error}</pre>
            </div>
        );
    }

    const response = result.response || {};
    const checks = result.checks || [];
    const passedCount = checks.filter(c => c.passed === true).length;
    const failedCount = checks.filter(c => c.passed === false).length;

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.border}`, marginBottom: 10 }}>
                <span style={{
                    fontSize: 13, fontWeight: 800, color: statusColor(response.status),
                    background: `${statusColor(response.status)}18`, borderRadius: 6, padding: '2px 10px',
                }}>{response.status ?? '—'}</span>
                <span style={{ fontSize: 11, color: C.textDim }}>{result.durationMs} ms</span>
                {checks.length > 0 && (
                    <span style={{
                        fontSize: 11, fontWeight: 600, color: failedCount ? C.danger : C.success,
                        background: failedCount ? `${C.danger}15` : `${C.success}15`, borderRadius: 10, padding: '2px 9px',
                    }}>
                        {passedCount}/{checks.length} checks passed
                    </span>
                )}
            </div>
            <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${C.border}`, marginBottom: 10 }}>
                {['Body', 'Headers', 'Sent', 'Checks', 'Pre-Request Log', 'Post-Response Log'].map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        style={{
                            background: 'none', border: 'none', borderBottom: tab === t ? `2px solid ${C.accent}` : '2px solid transparent',
                            color: tab === t ? C.text : C.textDim, fontSize: 11, fontWeight: 600, padding: '6px 10px', cursor: 'pointer',
                            transition: 'border-color .15s, color .15s',
                        }}
                    >{t}</button>
                ))}
            </div>

            {tab === 'Body' && <pre style={bodyStyle}>{prettyPrint(response.body)}</pre>}
            {tab === 'Headers' && (
                <table style={{ width: '100%', fontSize: 11, color: C.textDim, borderCollapse: 'collapse' }}>
                    <tbody>
                        {Object.entries(response.headers || {}).map(([k, v]) => (
                            <tr key={k} style={{ borderBottom: `1px solid ${C.borderLo}` }}>
                                <td style={{ padding: '4px 8px', color: C.text, fontFamily: C.mono, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{k}</td>
                                <td style={{ padding: '4px 8px', fontFamily: C.mono, wordBreak: 'break-all' }}>{v}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {tab === 'Sent' && (
                <div>
                    <div style={{ fontSize: 10, color: C.textFaint, marginBottom: 6 }}>What the Input tab's templates actually evaluated to and sent.</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textDim, letterSpacing: '0.03em', marginBottom: 4 }}>BODY</div>
                    <pre style={{ ...bodyStyle, minHeight: 80, marginBottom: 10 }}>{prettyPrint(result.sentBody)}</pre>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textDim, letterSpacing: '0.03em', marginBottom: 4 }}>HEADERS</div>
                    <table style={{ width: '100%', fontSize: 11, color: C.textDim, borderCollapse: 'collapse' }}>
                        <tbody>
                            {Object.entries(result.sentHeaders || {}).map(([k, v]) => (
                                <tr key={k} style={{ borderBottom: `1px solid ${C.borderLo}` }}>
                                    <td style={{ padding: '4px 8px', color: C.text, fontFamily: C.mono, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{k}</td>
                                    <td style={{ padding: '4px 8px', fontFamily: C.mono, wordBreak: 'break-all' }}>{v}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {tab === 'Checks' && (
                <div>
                    {checks.length === 0 && <div style={{ fontSize: 11, color: C.textFaint, fontStyle: 'italic' }}>No Response Validations configured.</div>}
                    {checks.map((c, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderBottom: `1px solid ${C.borderLo}` }}>
                            <Badge passed={c.passed} />
                            <div>
                                <div style={{ fontSize: 12, color: C.text }}>{c.name}</div>
                                {c.message && <div style={{ fontSize: 10, color: C.textFaint, whiteSpace: 'pre-wrap', marginTop: 2 }}>{c.message}</div>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {tab === 'Pre-Request Log' && (
                <div>
                    {(result.preRequestLog || []).length === 0 && <div style={{ fontSize: 11, color: C.textFaint, fontStyle: 'italic' }}>No pre-request steps ran.</div>}
                    {(result.preRequestLog || []).map((s, i) => <LogEntry key={i} step={s} />)}
                </div>
            )}
            {tab === 'Post-Response Log' && (
                <div>
                    {(result.postResponseLog || []).length === 0 && <div style={{ fontSize: 11, color: C.textFaint, fontStyle: 'italic' }}>No post-response Call Request steps ran.</div>}
                    {(result.postResponseLog || []).map((s, i) => <LogEntry key={i} step={s} />)}
                </div>
            )}
        </div>
    );
}

function LogEntry({ step: s }) {
    return (
        <div style={{ padding: '6px 0', borderBottom: `1px solid ${C.borderLo}`, fontSize: 11 }}>
            <span style={{ color: s.status === 'ok' ? C.success : C.danger, fontWeight: 700, marginRight: 6 }}>{s.status === 'ok' ? '✓' : '✕'}</span>
            <span style={{ color: C.textDim }}>Call Request → {s.requestId || '(no target selected)'}</span>
            {s.error && <div style={{ color: C.danger, marginTop: 2 }}>{s.error}</div>}
            {s.inputBody != null && (
                <details style={{ marginTop: 4 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 10, color: C.textFaint }}>Sent as body/headers</summary>
                    <pre style={{ ...bodyStyle, minHeight: 'auto', marginTop: 4 }}>{prettyPrint(s.inputBody)}</pre>
                </details>
            )}
            {s.subResponseBody != null && (
                <details style={{ marginTop: 4 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 10, color: C.textFaint }}>
                        Response body{s.subResponseStatus != null ? ` (${s.subResponseStatus})` : ''}
                    </summary>
                    <pre style={{ ...bodyStyle, minHeight: 'auto', marginTop: 4 }}>{prettyPrint(s.subResponseBody)}</pre>
                </details>
            )}
            {s.subStatus && s.subStatus !== 'success' && s.subError && (
                <div style={{ color: C.danger, marginTop: 2 }}>Called request failed: {s.subError}</div>
            )}
        </div>
    );
}

function Badge({ passed }) {
    const style = { fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 8px', flexShrink: 0 };
    if (passed === true) return <span style={{ ...style, background: 'rgba(16,185,129,0.15)', color: C.success }}>PASS</span>;
    if (passed === false) return <span style={{ ...style, background: 'rgba(239,68,68,0.15)', color: C.danger }}>FAIL</span>;
    return <span style={{ ...style, background: C.surface, color: C.textFaint }}>—</span>;
}

const bodyStyle = { ...inputStyle, width: '100%', minHeight: 160, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap', margin: 0, fontFamily: C.mono, fontSize: 11 };

function prettyPrint(body) {
    if (body == null) return '';
    try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; }
}
