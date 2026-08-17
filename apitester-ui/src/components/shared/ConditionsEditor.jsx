import { C, inputStyle, btnStyle } from '../../theme';

const OPERATORS = ['==', '!=', '>', '>=', '<', '<=', 'contains', 'notNull', 'typeof'];

/**
 * Editable left/operator/right condition list — same shape as the main platform's
 * "assertion" node: conditions:[{left,operator,right}], plus a top-level AND/OR logic.
 * Used by AssertionFields.
 */
export default function ConditionsEditor({ logic, onLogicChange, conditions, onChange }) {
    const update = (i, patch) => onChange(conditions.map((c, idx) => idx === i ? { ...c, ...patch } : c));
    const add = () => onChange([...conditions, { left: '', operator: '==', right: '' }]);
    const remove = (i) => onChange(conditions.filter((_, idx) => idx !== i));

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: C.textDim }}>Match</span>
                <select value={logic} onChange={e => onLogicChange(e.target.value)} style={{ ...inputStyle, padding: '3px 6px' }}>
                    <option value="AND">ALL (AND)</option>
                    <option value="OR">ANY (OR)</option>
                </select>
                <span style={{ fontSize: 11, color: C.textDim }}>of the conditions below</span>
            </div>
            {conditions.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input
                        style={{ ...inputStyle, flex: 2, fontFamily: C.mono }}
                        placeholder="headers.httpResponseCode"
                        value={c.left}
                        onChange={e => update(i, { left: e.target.value })}
                    />
                    <select style={{ ...inputStyle, flex: '0 0 100px' }} value={c.operator} onChange={e => update(i, { operator: e.target.value })}>
                        {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
                    </select>
                    <input
                        style={{ ...inputStyle, flex: 2, fontFamily: C.mono }}
                        placeholder="200"
                        value={c.right}
                        disabled={c.operator === 'notNull'}
                        onChange={e => update(i, { right: e.target.value })}
                    />
                    <button onClick={() => remove(i)} style={{ ...btnStyle, padding: '4px 8px' }} title="Remove">✕</button>
                </div>
            ))}
            <button onClick={add} style={btnStyle}>+ Add condition</button>
            <div style={{ fontSize: 10, color: C.textFaint, marginTop: 6 }}>
                Left/right accept <code style={{ color: C.textDim }}>vars.x</code>, <code style={{ color: C.textDim }}>body.x</code>,{' '}
                <code style={{ color: C.textDim }}>headers.x</code>, numbers, or a quoted string literal (<code style={{ color: C.textDim }}>'text'</code>).
            </div>
        </div>
    );
}
