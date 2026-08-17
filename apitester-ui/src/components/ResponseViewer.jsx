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
 *  click to expand its own full log/checks view (SingleRunView, reused as-is). */
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

const TABS = ['Pre-Request', 'Request', 'Post-Response', 'Checks'];

/** Tab bar over exactly four views, in this order — Pre-Request Log, Request (sent/response
 *  merged into one log-style block instead of separate Body/Headers/Sent tabs), Post-Response
 *  Log, Checks (full per-condition detail, see CheckEntry). */
function SingleRunView({ result }) {
    const [tab, setTab] = useState('Request');

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
    const preRequestLog = result.preRequestLog || [];
    const postResponseLog = result.postResponseLog || [];
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
                        {t === 'Pre-Request' && preRequestLog.length ? ` (${preRequestLog.length})` : ''}
                        {t === 'Post-Response' && postResponseLog.length ? ` (${postResponseLog.length})` : ''}
                        {t === 'Checks' && checks.length ? ` (${passedCount}/${checks.length})` : ''}
                    </button>
                ))}
            </div>

            {tab === 'Pre-Request' && (
                <div>
                    {preRequestLog.length === 0 && <Empty>No pre-request steps ran.</Empty>}
                    {preRequestLog.map((s, i) => <LogEntry key={i} step={s} />)}
                </div>
            )}
            {tab === 'Request' && <RequestLogEntry result={result} response={response} />}
            {tab === 'Post-Response' && (
                <div>
                    {postResponseLog.length === 0 && <Empty>No post-response Call Request/Set Variable steps ran.</Empty>}
                    {postResponseLog.map((s, i) => <LogEntry key={i} step={s} />)}
                </div>
            )}
            {tab === 'Checks' && (
                <div>
                    {checks.length === 0 && <Empty>No Response Validations configured.</Empty>}
                    {checks.map((c, i) => <CheckEntry key={i} check={c} />)}
                </div>
            )}
        </div>
    );
}

function Empty({ children }) {
    return <div style={{ fontSize: 11, color: C.textFaint, fontStyle: 'italic' }}>{children}</div>;
}

/** The main request/response, rendered as one log-style row — same visual language as
 *  Pre-Request/Post-Response's LogEntry — instead of separate Body/Headers/Sent tabs. */
function RequestLogEntry({ result, response }) {
    const ok = result.status === 'success';
    const hasSentHeaders = Object.keys(result.sentHeaders || {}).length > 0;
    const hasResponseHeaders = Object.keys(response.headers || {}).length > 0;
    return (
        <div style={{ padding: '6px 0', borderBottom: `1px solid ${C.borderLo}`, fontSize: 11 }}>
            <span style={{ color: ok ? C.success : C.danger, fontWeight: 700, marginRight: 6 }}>{ok ? '✓' : '✕'}</span>
            <span style={{ color: C.textDim }}>Request</span>
            <span style={{
                marginLeft: 8, fontWeight: 700, color: statusColor(response.status),
                background: `${statusColor(response.status)}18`, borderRadius: 5, padding: '0 6px',
            }}>{response.status ?? '—'}</span>
            <span style={{ color: C.textFaint, marginLeft: 8 }}>{result.durationMs} ms</span>
            {!ok && result.error && <div style={{ color: C.danger, marginTop: 2 }}>{result.error}</div>}
            {result.sentBody != null && (
                <details style={{ marginTop: 4 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 10, color: C.textFaint }}>Sent body</summary>
                    <pre style={{ ...bodyStyle, minHeight: 'auto', marginTop: 4 }}>{prettyPrint(result.sentBody)}</pre>
                </details>
            )}
            {hasSentHeaders && (
                <details style={{ marginTop: 4 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 10, color: C.textFaint }}>Sent headers</summary>
                    <HeaderTable headers={result.sentHeaders} />
                </details>
            )}
            {response.body != null && (
                <details style={{ marginTop: 4 }} open>
                    <summary style={{ cursor: 'pointer', fontSize: 10, color: C.textFaint }}>Response body</summary>
                    <pre style={{ ...bodyStyle, minHeight: 'auto', marginTop: 4 }}>{prettyPrint(response.body)}</pre>
                </details>
            )}
            {hasResponseHeaders && (
                <details style={{ marginTop: 4 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 10, color: C.textFaint }}>Response headers</summary>
                    <HeaderTable headers={response.headers} />
                </details>
            )}
        </div>
    );
}

function HeaderTable({ headers }) {
    return (
        <table style={{ width: '100%', fontSize: 11, color: C.textDim, borderCollapse: 'collapse', marginTop: 4 }}>
            <tbody>
                {Object.entries(headers || {}).map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: `1px solid ${C.borderLo}` }}>
                        <td style={{ padding: '4px 8px', color: C.text, fontFamily: C.mono, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{k}</td>
                        <td style={{ padding: '4px 8px', fontFamily: C.mono, wordBreak: 'break-all' }}>{v}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function LogEntry({ step: s }) {
    return (
        <div style={{ padding: '6px 0', borderBottom: `1px solid ${C.borderLo}`, fontSize: 11 }}>
            <span style={{ color: s.status === 'ok' ? C.success : C.danger, fontWeight: 700, marginRight: 6 }}>{s.status === 'ok' ? '✓' : '✕'}</span>
            <span style={{ color: C.textDim }}>
                {s.type === 'setVariable'
                    ? `Set ${s.name || '(no name)'} = ${JSON.stringify(s.value)}`
                    : `Call Request → ${s.requestId || '(no target selected)'}`}
            </span>
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

/** One check, with a per-condition breakdown when the backend provided one (assertion steps
 *  since — check.conditions: [{left, operator, right, passed, message}]) — every condition
 *  shown, not just the ones that failed, so it's clear exactly what was evaluated. Falls back
 *  to the old name/message-only rendering for check results that predate this (or don't have
 *  per-condition detail, e.g. a future jsoncompare/textcompare/dbcheck step). */
function CheckEntry({ check }) {
    const conditions = check.conditions || [];
    return (
        <div style={{ padding: '8px 0', borderBottom: `1px solid ${C.borderLo}` }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Badge passed={check.passed} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: C.text, fontWeight: 700 }}>
                        {check.name}
                        {conditions.length > 1 && check.logic && (
                            <span style={{ fontSize: 9, fontWeight: 600, color: C.textFaint, marginLeft: 6 }}>({check.logic})</span>
                        )}
                    </div>
                    {conditions.length === 0 && check.message && (
                        <div style={{ fontSize: 10, color: C.textFaint, whiteSpace: 'pre-wrap', marginTop: 2 }}>{check.message}</div>
                    )}
                </div>
            </div>
            {conditions.length > 0 && (
                <div style={{ marginTop: 6, marginLeft: 24, paddingLeft: 10, borderLeft: `2px solid ${C.borderLo}` }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.textFaint, letterSpacing: '0.04em', marginBottom: 3 }}>CONDITIONS</div>
                    {conditions.map((cond, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '3px 0' }}>
                            <Badge passed={cond.passed} />
                            <div style={{ fontSize: 11 }}>
                                <span style={{ fontFamily: C.mono, color: C.textDim }}>{cond.left} {cond.operator} {cond.right}</span>
                                {cond.message && <div style={{ fontSize: 10, color: C.textFaint, marginTop: 1 }}>{cond.message}</div>}
                            </div>
                        </div>
                    ))}
                </div>
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
