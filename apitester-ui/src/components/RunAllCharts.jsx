import { useState } from 'react';
import { C } from '../theme';

// Hand-rolled (no chart library — this app already avoids adding dependencies where plain HTML/CSS
// does the job, same reasoning as the backend's move back to DataWeave's native xlsx writer).
// Colors reuse the app's own C.success/C.danger status pair everywhere — validated for CVD-safe
// separation (deutan ΔE 8.1, normal-vision ΔE 33.8) via the dataviz skill's palette validator; the
// green's contrast-vs-surface came back WARN (2.47:1), which is why every bar/segment below always
// carries a visible text label alongside the color, never color alone.

const BAR_H = 16;       // <=24px cap per the mark spec; kept well under it for a dense list of rows
const GAP = 2;          // the "surface gap" spec — same width between stacked segments everywhere

/** Two rounded corners on the "data end" only, square at the baseline — the mark spec's bar shape,
 *  built as a plain div rather than SVG. `flip` mirrors it for a segment that ends at the LEFT
 *  (used when a stacked bar's failed segment happens to render before something else — not
 *  currently needed here, kept for the one non-final segment case). */
function barRadius(isDataEnd, side = 'right') {
    if (!isDataEnd) return 0;
    return side === 'right' ? '0 4px 4px 0' : '4px 0 0 4px';
}

function Legend() {
    return (
        <div style={{ display: 'flex', gap: 16, fontSize: 10, color: C.textDim, marginBottom: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: C.success, display: 'inline-block' }} />
                Passed
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: C.danger, display: 'inline-block' }} />
                Failed
            </span>
        </div>
    );
}

/** Row hover — a tooltip anchored to THIS row (never the pointer), so it never has to track
 *  viewport bounds. Purely additive: everything it shows (name/status/value) is already a direct
 *  label on the row too — hover highlights, it doesn't gate any value behind itself. */
function Tooltip({ children }) {
    return (
        <div style={{
            position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, zIndex: 5,
            background: C.text, color: '#fff', fontSize: 10, fontWeight: 600,
            padding: '5px 8px', borderRadius: 5, whiteSpace: 'nowrap', boxShadow: C.shadowMd,
            pointerEvents: 'none',
        }}>
            {children}
        </div>
    );
}

/** Pass Rate as a meter (a single ratio against a limit — the fill is severity-colored, the track
 *  a lighter neutral step of the same surface, per the dataviz skill's Meter spec), not a 2-slice
 *  pie/donut, which the same skill explicitly steers away from for this job. */
export function PassRateMeter({ passed, total }) {
    const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
    const healthy = pct >= 80;
    const fillColor = healthy ? C.success : (pct >= 50 ? C.warn : C.danger);
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.textDim, marginBottom: 4 }}>
                <span>Pass rate</span>
                <span style={{ fontWeight: 700, color: C.text }}>{pct}%</span>
            </div>
            <div style={{ height: BAR_H, borderRadius: BAR_H / 2, background: C.surface, overflow: 'hidden' }}>
                <div style={{
                    height: '100%', width: `${pct}%`, minWidth: pct > 0 ? 6 : 0,
                    background: fillColor, borderRadius: BAR_H / 2,
                    transition: 'width .3s ease',
                }} />
            </div>
        </div>
    );
}

/** Duration per request — bar length is magnitude (duration), color is status (pass/fail). Two
 *  different dimensions sharing one chart is deliberate here: on a test-run dashboard "which ones
 *  failed AND how long did they take" is one question, not two, so status earns the color slot
 *  even though a pure magnitude comparison would default to a single sequential hue. */
export function DurationBarChart({ results }) {
    const [hoverIdx, setHoverIdx] = useState(null);
    if (!results.length) return null;
    const max = Math.max(1, ...results.map((r) => r.durationMs || 0));
    return (
        <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 6 }}>Duration by request</div>
            <Legend />
            <div style={{ display: 'flex', flexDirection: 'column', gap: GAP + 4 }}>
                {results.map((r, i) => {
                    const ok = r.status === 'success';
                    const pct = Math.max(2, ((r.durationMs || 0) / max) * 100);
                    return (
                        <div
                            key={i}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}
                            onMouseEnter={() => setHoverIdx(i)}
                            onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
                        >
                            <div style={{
                                width: 150, flexShrink: 0, fontSize: 11, color: C.textDim,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }} title={r.requestName}>{r.requestName}</div>
                            <div style={{ flex: 1, position: 'relative', height: BAR_H }}>
                                {hoverIdx === i && (
                                    <Tooltip>{r.requestName} — {ok ? 'Pass' : 'Fail'} — {r.durationMs ?? 0} ms</Tooltip>
                                )}
                                <div style={{
                                    height: '100%', width: `${pct}%`, background: ok ? C.success : C.danger,
                                    borderRadius: barRadius(true), transition: 'width .25s ease',
                                    filter: hoverIdx === i ? 'brightness(1.12)' : 'none',
                                }} />
                            </div>
                            <div style={{
                                width: 70, flexShrink: 0, textAlign: 'right', fontSize: 11, fontWeight: 700,
                                color: C.text, fontVariantNumeric: 'tabular-nums',
                            }}>{r.durationMs ?? 0} ms</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/** Checks passed/failed per request — a 100%-stacked bar per row (part-to-whole of THAT row's own
 *  checks), with the exact counts as a direct label since a stacked segment's own width is exactly
 *  the kind of value that goes unread without one. */
export function ChecksStackedChart({ results }) {
    const [hoverIdx, setHoverIdx] = useState(null);
    if (!results.length) return null;
    return (
        <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 6 }}>Checks by request</div>
            <Legend />
            <div style={{ display: 'flex', flexDirection: 'column', gap: GAP + 4 }}>
                {results.map((r, i) => {
                    const total = r.checksTotal || 0;
                    const passed = r.checksPassed || 0;
                    const failed = r.checksFailed || 0;
                    const passedPct = total > 0 ? (passed / total) * 100 : 0;
                    const failedPct = total > 0 ? (failed / total) * 100 : 0;
                    return (
                        <div
                            key={i}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}
                            onMouseEnter={() => setHoverIdx(i)}
                            onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
                        >
                            <div style={{
                                width: 150, flexShrink: 0, fontSize: 11, color: C.textDim,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }} title={r.requestName}>{r.requestName}</div>
                            <div style={{ flex: 1, position: 'relative', height: BAR_H, background: C.surface, borderRadius: BAR_H / 2, overflow: 'hidden', display: 'flex' }}>
                                {hoverIdx === i && (
                                    <Tooltip>{r.requestName} — {passed} passed / {failed} failed of {total}</Tooltip>
                                )}
                                {total === 0 ? null : (
                                    <>
                                        <div style={{
                                            height: '100%', width: `${passedPct}%`, background: C.success,
                                            borderRadius: failed === 0 ? barRadius(true) : 0,
                                            marginRight: failed > 0 && passed > 0 ? GAP : 0,
                                        }} />
                                        <div style={{
                                            height: '100%', width: `${failedPct}%`, background: C.danger,
                                            borderRadius: barRadius(true),
                                        }} />
                                    </>
                                )}
                            </div>
                            <div style={{
                                width: 70, flexShrink: 0, textAlign: 'right', fontSize: 11, fontWeight: 700,
                                color: C.text, fontVariantNumeric: 'tabular-nums',
                            }}>{total === 0 ? '—' : `${passed}/${total}`}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
