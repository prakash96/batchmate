import { C, inputStyle, btnStyle } from '../../theme';
import ConditionsEditor from '../shared/ConditionsEditor';
import { useConnectionStore } from '../../store/connectionStore';

const SOURCE_OPTIONS = ['body', 'variable', 'expression', 'literal'];

const TYPE_LABEL = { callRequest: 'Call Request', wait: 'Wait', assertion: 'Assertion', jsoncompare: 'JSON Compare', textcompare: 'Text Compare', dbcheck: 'DB Check' };

/**
 * One unified, freely-reorderable Post-Response list — Call Request steps and Response
 * Validations (Assertion / JSON Compare / Text Compare / DB Check) side by side, in whatever
 * order the user wants. Note: reordering here only changes how the list *reads* — the backend
 * always runs every Validation (as part of the Camel route) before any Call Request step (Java-
 * orchestrated separately), regardless of their listed order — see RequestExecutionService's
 * postResponseChecksOnly/postResponseCallSteps.
 */
export default function PostResponseFields({ checks, onChange, allRequests, currentRequestId }) {
    const otherRequests = (allRequests || []).filter(r => r.id !== currentRequestId);
    const update = (i, patch) => onChange(checks.map((c, idx) => idx === i ? { ...c, ...patch } : c));
    const remove = (i) => onChange(checks.filter((_, idx) => idx !== i));
    const move = (i, dir) => {
        const j = i + dir;
        if (j < 0 || j >= checks.length) return;
        const next = [...checks];
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
    };

    const add = (type) => {
        const base = { type, name: '' };
        if (type === 'callRequest') onChange([...checks, { type: 'callRequest', requestId: '' }]);
        else if (type === 'wait') onChange([...checks, { type: 'wait', name: '', waitTime: 1000 }]);
        else if (type === 'assertion') onChange([...checks, { ...base, logic: 'AND', conditions: [{ left: 'headers.httpResponseCode', operator: '==', right: '200' }], onFail: 'stop' }]);
        else if (type === 'jsoncompare') onChange([...checks, { ...base, leftSource: 'body', leftExpr: '', leftLiteral: '', rightSource: 'literal', rightExpr: '', rightLiteral: '', mode: 'partial', ignoreArrayOrder: true, resultVar: '', onMismatch: 'stop' }]);
        else if (type === 'textcompare') onChange([...checks, { ...base, leftSource: 'body', leftExpr: '', leftLiteral: '', rightSource: 'literal', rightExpr: '', rightLiteral: '', mode: 'exact', caseSensitive: true, resultVar: '', onMismatch: 'stop' }]);
        else if (type === 'dbcheck') onChange([...checks, { ...base, connectionId: '', query: '', resultVar: 'rows', maxRows: 50, logic: 'AND', conditions: [{ left: 'vars.rows.length', operator: '>', right: '0' }], onFail: 'stop' }]);
    };

    return (
        <div>
            {checks.length === 0 && <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 8, fontStyle: 'italic' }}>No post-response steps yet — add a Call Request, wait, assertion, comparison, or DB check.</div>}
            {checks.map((check, i) => (
                <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 5, padding: 10, marginBottom: 8, background: C.surface }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        {check.type === 'callRequest' ? (
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.textDim, flex: 1 }}>Call Request</span>
                        ) : (
                            <input
                                style={{ ...inputStyle, fontSize: 11, fontWeight: 700, border: 'none', background: 'transparent', padding: '2px 0', flex: 1 }}
                                placeholder={TYPE_LABEL[check.type]}
                                value={check.name}
                                onChange={e => update(i, { name: e.target.value })}
                            />
                        )}
                        <span style={{ fontSize: 9, color: C.textFaint, background: C.panel, borderRadius: 8, padding: '1px 8px', marginRight: 6 }}>{TYPE_LABEL[check.type]}</span>
                        <button onClick={() => move(i, -1)} style={{ ...btnStyle, padding: '2px 6px' }}>↑</button>
                        <button onClick={() => move(i, 1)} style={{ ...btnStyle, padding: '2px 6px', marginLeft: 4 }}>↓</button>
                        <button onClick={() => remove(i)} style={{ ...btnStyle, padding: '2px 6px', marginLeft: 4 }}>✕</button>
                    </div>

                    {check.type === 'callRequest' && (
                        <select style={{ ...inputStyle, width: '100%' }} value={check.requestId} onChange={e => update(i, { requestId: e.target.value })}>
                            <option value="">Select a request…</option>
                            {otherRequests.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    )}
                    {check.type === 'wait' && (
                        <WaitFields check={check} onChange={p => update(i, p)} />
                    )}
                    {check.type === 'assertion' && (
                        <AssertionFields check={check} onChange={p => update(i, p)} />
                    )}
                    {(check.type === 'jsoncompare' || check.type === 'textcompare') && (
                        <CompareFields check={check} onChange={p => update(i, p)} isText={check.type === 'textcompare'} />
                    )}
                    {check.type === 'dbcheck' && (
                        <DbCheckFields check={check} onChange={p => update(i, p)} />
                    )}
                </div>
            ))}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => add('callRequest')} style={btnStyle}>+ Call Request</button>
                <button onClick={() => add('wait')} style={btnStyle}>+ Wait</button>
                <button onClick={() => add('assertion')} style={btnStyle}>+ Assertion</button>
                <button onClick={() => add('jsoncompare')} style={btnStyle}>+ JSON Compare</button>
                <button onClick={() => add('textcompare')} style={btnStyle}>+ Text Compare</button>
                <button onClick={() => add('dbcheck')} style={btnStyle}>+ DB Check</button>
            </div>
        </div>
    );
}

function WaitFields({ check, onChange }) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.textDim }}>
            Wait
            <input
                style={{ ...inputStyle, width: 90 }}
                type="number" min={0} step={100}
                value={check.waitTime}
                onChange={e => onChange({ waitTime: Number(e.target.value) })}
            />
            ms before continuing
        </label>
    );
}

function AssertionFields({ check, onChange }) {
    return (
        <div>
            <ConditionsEditor
                logic={check.logic} onLogicChange={v => onChange({ logic: v })}
                conditions={check.conditions} onChange={v => onChange({ conditions: v })}
            />
            <OnFailSelect value={check.onFail} onChange={v => onChange({ onFail: v })} />
        </div>
    );
}

function CompareFields({ check, onChange, isText }) {
    const modes = isText
        ? ['exact', 'contains', 'starts-with', 'ends-with', 'regex']
        : ['deep-equal', 'partial', 'keys-only'];
    return (
        <div>
            <SideFields label="Left" source={check.leftSource} expr={check.leftExpr} literal={check.leftLiteral}
                onChange={p => onChange({ leftSource: p.source ?? check.leftSource, leftExpr: p.expr ?? check.leftExpr, leftLiteral: p.literal ?? check.leftLiteral })} />
            <SideFields label="Right" source={check.rightSource} expr={check.rightExpr} literal={check.rightLiteral}
                onChange={p => onChange({ rightSource: p.source ?? check.rightSource, rightExpr: p.expr ?? check.rightExpr, rightLiteral: p.literal ?? check.rightLiteral })} />
            <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <select style={inputStyle} value={check.mode} onChange={e => onChange({ mode: e.target.value })}>
                    {modes.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                {isText ? (
                    <label style={{ fontSize: 11, color: C.textDim, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input type="checkbox" checked={check.caseSensitive} onChange={e => onChange({ caseSensitive: e.target.checked })} /> case-sensitive
                    </label>
                ) : (
                    <label style={{ fontSize: 11, color: C.textDim, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input type="checkbox" checked={check.ignoreArrayOrder} onChange={e => onChange({ ignoreArrayOrder: e.target.checked })} /> ignore array order
                    </label>
                )}
                <input style={{ ...inputStyle, flex: 1, minWidth: 100 }} placeholder="result variable (optional)" value={check.resultVar} onChange={e => onChange({ resultVar: e.target.value })} />
            </div>
            <OnMismatchSelect value={check.onMismatch} onChange={v => onChange({ onMismatch: v })} />
        </div>
    );
}

function SideFields({ label, source, expr, literal, onChange }) {
    return (
        <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: C.textFaint, width: 34 }}>{label}</span>
            <select style={{ ...inputStyle, flex: '0 0 100px' }} value={source} onChange={e => onChange({ source: e.target.value })}>
                {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {source === 'literal' ? (
                <input style={{ ...inputStyle, flex: 1, fontFamily: C.mono }} placeholder="literal JSON / text" value={literal} onChange={e => onChange({ literal: e.target.value })} />
            ) : source === 'body' ? (
                <span style={{ fontSize: 10, color: C.textFaint, flex: 1 }}>the response body</span>
            ) : (
                <input style={{ ...inputStyle, flex: 1, fontFamily: C.mono }} placeholder={source === 'variable' ? 'myVar' : 'vars.myVar'} value={expr} onChange={e => onChange({ expr: e.target.value })} />
            )}
        </div>
    );
}

function DbCheckFields({ check, onChange }) {
    const { connections } = useConnectionStore();
    const dbConnections = connections.filter(c => ['postgresql', 'mysql', 'oracle', 'sqlserver', 'db'].includes(c.type));
    return (
        <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <select style={{ ...inputStyle, flex: 1 }} value={check.connectionId} onChange={e => onChange({ connectionId: e.target.value })}>
                    <option value="">Select a saved DB connection…</option>
                    {dbConnections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input style={{ ...inputStyle, flex: '0 0 90px' }} type="number" placeholder="max rows" value={check.maxRows} onChange={e => onChange({ maxRows: Number(e.target.value) })} />
            </div>
            <textarea
                style={{ ...inputStyle, width: '100%', minHeight: 70, fontFamily: C.mono, marginBottom: 6, resize: 'vertical' }}
                placeholder="SELECT * FROM orders WHERE id = '${vars.orderId}'"
                value={check.query}
                onChange={e => onChange({ query: e.target.value })}
            />
            <input style={{ ...inputStyle, width: '100%', marginBottom: 8 }} placeholder="result variable, e.g. rows" value={check.resultVar} onChange={e => onChange({ resultVar: e.target.value })} />
            <div style={{ fontSize: 10, color: C.textFaint, marginBottom: 6 }}>
                Assert against the query result — reference it as <code style={{ color: C.textDim }}>vars.{check.resultVar || 'rows'}.length</code>,{' '}
                <code style={{ color: C.textDim }}>vars.{check.resultVar || 'rows'}[0].column_name</code>, etc.
            </div>
            <ConditionsEditor
                logic={check.logic} onLogicChange={v => onChange({ logic: v })}
                conditions={check.conditions} onChange={v => onChange({ conditions: v })}
            />
            <OnFailSelect value={check.onFail} onChange={v => onChange({ onFail: v })} />
        </div>
    );
}

function OnFailSelect({ value, onChange }) {
    return (
        <label style={{ fontSize: 11, color: C.textDim, display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            On failure:
            <select style={inputStyle} value={value} onChange={e => onChange(e.target.value)}>
                <option value="stop">Stop the run</option>
                <option value="continue">Continue (just record failure)</option>
            </select>
        </label>
    );
}

function OnMismatchSelect({ value, onChange }) {
    return (
        <label style={{ fontSize: 11, color: C.textDim, display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            On mismatch:
            <select style={inputStyle} value={value} onChange={e => onChange(e.target.value)}>
                <option value="stop">Stop the run</option>
                <option value="continue">Continue (just record failure)</option>
            </select>
        </label>
    );
}
