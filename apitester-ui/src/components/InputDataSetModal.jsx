import { C, inputStyle, btnStyle } from '../theme';
import KeyValueTable from './shared/KeyValueTable';

/**
 * A list of body+headers entries belonging to one request — unnamed, since when the Request's
 * Input tab is set to "Input Data Set" the whole pipeline runs ONCE PER ENTRY (a data-driven
 * loop, not a single named preset to pick from). See RequestExecutionService.run()'s public
 * entry point for the iteration logic.
 * dataSets: [{body, headers: [{key,value,enabled}]}]
 */
export default function InputDataSetModal({ dataSets, onChange, onClose }) {
    const update = (i, patch) => onChange(dataSets.map((d, idx) => idx === i ? { ...d, ...patch } : d));
    const remove = (i) => onChange(dataSets.filter((_, idx) => idx !== i));
    const move = (i, dir) => {
        const j = i + dir;
        if (j < 0 || j >= dataSets.length) return;
        const next = [...dataSets];
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
    };
    const add = () => onChange([...dataSets, { body: '', headers: [] }]);

    return (
        <div className="at-overlay" style={overlayStyle}>
            <div className="at-modal" style={{
                background: C.panel, border: `1px solid ${C.border}`, borderRadius: C.radius, boxShadow: C.shadowLg,
                width: 640, maxHeight: '82vh', display: 'flex', flexDirection: 'column', padding: 20,
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>📦 Input Data Set</span>
                    <button onClick={onClose} style={btnStyle}>Close</button>
                </div>
                <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 14 }}>
                    When this request's Input tab is set to "Input Data Set", it runs once per entry
                    below — each entry's body/headers become that iteration's own outgoing body/headers.
                </div>

                <div style={{ overflowY: 'auto', paddingRight: 2 }}>
                    {dataSets.length === 0 && <div style={{ fontSize: 11, color: C.textFaint, fontStyle: 'italic', marginBottom: 8 }}>No entries yet.</div>}
                    {dataSets.map((entry, i) => (
                        <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: C.radiusSm, padding: 10, marginBottom: 8, background: C.surface }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: C.textDim }}>Entry {i + 1}</span>
                                <span style={{ display: 'flex', gap: 4 }}>
                                    <button onClick={() => move(i, -1)} style={{ ...btnStyle, padding: '2px 6px' }} title="Move up">↑</button>
                                    <button onClick={() => move(i, 1)} style={{ ...btnStyle, padding: '2px 6px' }} title="Move down">↓</button>
                                    <button onClick={() => remove(i)} style={{ ...btnStyle, padding: '2px 6px' }} title="Remove">✕</button>
                                </span>
                            </div>

                            <div style={{ fontSize: 10, color: C.textFaint, marginBottom: 4, fontWeight: 700, letterSpacing: '0.03em' }}>BODY</div>
                            <textarea
                                style={{ ...inputStyle, width: '100%', minHeight: 90, fontFamily: C.mono, resize: 'vertical', marginBottom: 10 }}
                                placeholder='{"CIF": "000001111111"}'
                                value={entry.body || ''}
                                onChange={e => update(i, { body: e.target.value })}
                            />

                            <div style={{ fontSize: 10, color: C.textFaint, marginBottom: 4, fontWeight: 700, letterSpacing: '0.03em' }}>HEADERS</div>
                            <KeyValueTable rows={entry.headers || []} onChange={rows => update(i, { headers: rows })} keyPlaceholder="header" />
                        </div>
                    ))}
                    <button onClick={add} style={btnStyle}>+ Add entry</button>
                </div>
            </div>
        </div>
    );
}

const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
};
