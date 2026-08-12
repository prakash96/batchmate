import { C, inputStyle, btnStyle } from '../../theme';

/**
 * Editable key/value/enabled table — used for Headers and Query Params.
 * rows: [{key, value, enabled}], onChange(rows)
 */
export default function KeyValueTable({ rows, onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value' }) {
    const update = (i, patch) => {
        const next = rows.map((r, idx) => idx === i ? { ...r, ...patch } : r);
        onChange(next);
    };
    const add = () => onChange([...rows, { key: '', value: '', enabled: true }]);
    const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));

    return (
        <div>
            {rows.map((row, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                    <input
                        type="checkbox"
                        checked={row.enabled !== false}
                        onChange={e => update(i, { enabled: e.target.checked })}
                        style={{ accentColor: C.accent }}
                    />
                    <input
                        style={{ ...inputStyle, flex: 1 }}
                        placeholder={keyPlaceholder}
                        value={row.key}
                        onChange={e => update(i, { key: e.target.value })}
                    />
                    <input
                        style={{ ...inputStyle, flex: 2 }}
                        placeholder={valuePlaceholder}
                        value={row.value}
                        onChange={e => update(i, { value: e.target.value })}
                    />
                    <button onClick={() => remove(i)} style={{ ...btnStyle, padding: '4px 8px' }} title="Remove">✕</button>
                </div>
            ))}
            <button onClick={add} style={btnStyle}>+ Add {keyPlaceholder === 'Key' ? 'row' : keyPlaceholder}</button>
        </div>
    );
}
