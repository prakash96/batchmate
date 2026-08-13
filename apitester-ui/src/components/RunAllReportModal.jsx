import { useEffect, useState } from 'react';
import { useRunAllStore } from '../store/runAllStore';
import { C, btnStyle, primaryBtnStyle } from '../theme';
import ResponseViewer from './ResponseViewer';

/** Shows a collection's "Run All" consolidated report — the last persisted one on open (or
 *  triggers+shows a fresh run when opened via the "▶ Run All" sidebar button, see autoRun).
 *  Each main request's row expands into the SAME ResponseViewer used for a single Send — its
 *  stored "fullResult" is exactly what RequestExecutionService.run() returned for that request. */
export default function RunAllReportModal({ collectionId, collectionName, onClose, autoRun }) {
    const { runAll, fetchLastReport, downloadExcel } = useRunAllStore();
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState(null);
    const [openIndex, setOpenIndex] = useState(null);

    useEffect(() => {
        (async () => {
            setLoading(true);
            setError(null);
            try {
                if (autoRun) {
                    setRunning(true);
                    setReport(await runAll(collectionId));
                } else {
                    setReport(await fetchLastReport(collectionId));
                }
            } catch (e) {
                setError(e.message);
            } finally {
                setLoading(false);
                setRunning(false);
            }
        })();
        // Only ever run once per mount — a fresh RunAllReportModal instance is created each time
        // it's opened (see CollectionTree), so this doesn't need collectionId/autoRun in deps.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const doRunAll = async () => {
        setRunning(true);
        setError(null);
        try {
            setReport(await runAll(collectionId));
            setOpenIndex(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setRunning(false);
        }
    };

    const doDownload = async () => {
        try { await downloadExcel(collectionId); } catch (e) { setError(e.message); }
    };

    const results = report?.results || [];
    const passed = report?.passedRequests ?? 0;
    const failed = report?.failedRequests ?? 0;
    const total = report?.totalRequests ?? 0;
    const passPct = total > 0 ? Math.round((passed / total) * 100) : 0;

    return (
        <div className="at-overlay" style={overlayStyle}>
            <div className="at-modal" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: C.radius, boxShadow: C.shadowLg, width: 720, maxHeight: '85vh', overflowY: 'auto', padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Run All — {collectionName}</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={doRunAll} style={primaryBtnStyle} disabled={running}>{running ? 'Running…' : '▶ Run All'}</button>
                        <button onClick={onClose} style={btnStyle}>Close</button>
                    </div>
                </div>
                <div style={{ fontSize: 10, color: C.textFaint, marginBottom: 14 }}>
                    Runs every "main" request — one no other request in this collection calls via Call Request.
                </div>

                {error && <div style={{ fontSize: 11, color: C.danger, marginBottom: 10 }}>{error}</div>}

                {loading ? (
                    <div style={{ fontSize: 12, color: C.textFaint, fontStyle: 'italic', padding: '20px 0' }}>
                        {running ? 'Running all main requests…' : 'Loading last report…'}
                    </div>
                ) : !report ? (
                    <div style={{ fontSize: 12, color: C.textFaint, padding: '20px 0' }}>
                        No report yet for this collection — click "▶ Run All" above to run it for the first time.
                    </div>
                ) : (
                    <>
                        <div style={{ fontSize: 10, color: C.textFaint, marginBottom: 14 }}>
                            Last run: {formatDate(report.runAt)} · {report.durationMs} ms total
                        </div>

                        <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 16 }}>
                            <SummaryBadge label="Total" value={total} color={C.text} />
                            <SummaryBadge label="Passed" value={passed} color={C.success} />
                            <SummaryBadge label="Failed" value={failed} color={C.danger} />
                            <div style={{ flex: 1 }}>
                                <div style={{ height: 10, borderRadius: 6, overflow: 'hidden', display: 'flex', background: C.surface }}>
                                    <div style={{ width: `${passPct}%`, background: C.success }} />
                                    <div style={{ width: `${100 - passPct}%`, background: C.danger }} />
                                </div>
                                <div style={{ fontSize: 10, color: C.textFaint, marginTop: 4 }}>{passPct}% passed</div>
                            </div>
                            <button onClick={doDownload} style={btnStyle}>⬇ Download Excel</button>
                        </div>

                        <div>
                            {results.length === 0 && (
                                <div style={{ fontSize: 12, color: C.textFaint, fontStyle: 'italic' }}>
                                    No main requests found in this collection — every request here is only ever called from another one.
                                </div>
                            )}
                            {results.map((r, i) => {
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
                                            <span style={{ fontSize: 12, fontWeight: 700, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.requestName}</span>
                                            <span style={{ fontSize: 10, color: C.textDim }}>{r.checksPassed}/{r.checksTotal} checks</span>
                                            <span style={{ fontSize: 10, color: C.textDim }}>{r.durationMs} ms</span>
                                            <span style={{
                                                fontSize: 11, fontWeight: 700, color: ok ? C.success : C.danger,
                                                background: ok ? `${C.success}18` : `${C.danger}18`, borderRadius: 6, padding: '2px 8px',
                                            }}>{ok ? 'PASS' : 'FAIL'}</span>
                                        </div>
                                        {r.error && <div style={{ padding: '0 10px 8px 30px', fontSize: 11, color: C.danger }}>{r.error}</div>}
                                        {open && (
                                            <div style={{ borderTop: `1px solid ${C.borderLo}`, padding: 10 }}>
                                                <ResponseViewer result={r.fullResult} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function SummaryBadge({ label, value, color }) {
    return (
        <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: 10, color: C.textFaint }}>{label}</div>
        </div>
    );
}

function formatDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
};
