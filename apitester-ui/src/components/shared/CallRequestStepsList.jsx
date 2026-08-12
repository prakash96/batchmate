import { C, inputStyle, btnStyle } from '../../theme';

/**
 * Shared "Call Request" step list — the ONLY step type Pre-Request/Post-Response support.
 * step: {type:'callRequest', requestId}
 *
 * Always chains from the previous step's response (or, for the first Pre-Request step, nothing;
 * for the first Post-Response step, this request's own response) — see RequestExecutionService.run().
 * Iterating over an Input Data Set is a property of a *request's own* Input tab, not a Call
 * Request step, since a single chain link can only hand the next one exactly one response.
 */
export default function CallRequestStepsList({ steps, onChange, allRequests, currentRequestId, emptyLabel }) {
    const otherRequests = (allRequests || []).filter(r => r.id !== currentRequestId);
    const update = (i, patch) => onChange(steps.map((s, idx) => idx === i ? { ...s, ...patch } : s));
    const remove = (i) => onChange(steps.filter((_, idx) => idx !== i));
    const move = (i, dir) => {
        const j = i + dir;
        if (j < 0 || j >= steps.length) return;
        const next = [...steps];
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
    };
    const add = () => onChange([...steps, { type: 'callRequest', requestId: '' }]);

    return (
        <div>
            {steps.length === 0 && (
                <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 8, fontStyle: 'italic' }}>{emptyLabel}</div>
            )}
            {steps.map((step, i) => (
                <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: C.radiusSm, padding: 10, marginBottom: 8, background: C.surface }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.textDim }}>Call Request</span>
                        <span style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => move(i, -1)} style={{ ...btnStyle, padding: '2px 6px' }} title="Move up">↑</button>
                            <button onClick={() => move(i, 1)} style={{ ...btnStyle, padding: '2px 6px' }} title="Move down">↓</button>
                            <button onClick={() => remove(i)} style={{ ...btnStyle, padding: '2px 6px' }} title="Remove">✕</button>
                        </span>
                    </div>

                    <select style={{ ...inputStyle, width: '100%' }} value={step.requestId} onChange={e => update(i, { requestId: e.target.value })}>
                        <option value="">Select a request…</option>
                        {otherRequests.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                </div>
            ))}
            <button onClick={add} style={btnStyle}>+ Call Request</button>
        </div>
    );
}
