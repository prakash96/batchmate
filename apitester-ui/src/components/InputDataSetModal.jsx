import { useState } from 'react';
import { C, inputStyle, btnStyle, primaryBtnStyle } from '../theme';
import KeyValueTable from './shared/KeyValueTable';

/**
 * A list of body+headers entries belonging to one request — when the Request's Input tab is set
 * to "Input Data Set" the whole pipeline runs ONCE PER ENTRY (a data-driven loop, not a single
 * named preset to pick from). See RequestExecutionService.run()'s public entry point for the
 * iteration logic.
 * dataSets: [{name?, body, headers: [{key,value,enabled}]}] — name is optional/display-only
 * (e.g. "Positive (schema-valid)", "Missing required field 'x'" for entries the Swagger Payload
 * Generator creates so the distinct scenarios stay identifiable); entries without one just show
 * "Entry N" as before.
 */
export default function InputDataSetModal({ dataSets, onChange, onClose }) {
    const [showGenerator, setShowGenerator] = useState(false);

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
                    {showGenerator && (
                        <CombinationGenerator
                            dataSets={dataSets}
                            onChange={onChange}
                            onDone={() => setShowGenerator(false)}
                        />
                    )}

                    {dataSets.length === 0 && <div style={{ fontSize: 11, color: C.textFaint, fontStyle: 'italic', marginBottom: 8 }}>No entries yet.</div>}
                    {dataSets.map((entry, i) => (
                        <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: C.radiusSm, padding: 10, marginBottom: 8, background: C.surface }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: C.textDim, flexShrink: 0 }}>Entry {i + 1}</span>
                                <input
                                    style={{ ...inputStyle, flex: 1, fontSize: 11 }}
                                    placeholder="(optional label)"
                                    value={entry.name || ''}
                                    onChange={e => update(i, { name: e.target.value })}
                                />
                                <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
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
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={add} style={btnStyle}>+ Add entry</button>
                        {!showGenerator && <button onClick={() => setShowGenerator(true)} style={btnStyle}>🔀 Generate Combinations</button>}
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Lets the user list the possible values for however many body/header fields they want, then
 * generates one Data Set entry per combination — the Cartesian product across ALL fields (body
 * and header fields together), so e.g. 3 CIF values × 2 environments produces 6 entries.
 */
function CombinationGenerator({ dataSets, onChange, onDone }) {
    const [baseBody, setBaseBody] = useState('{}');
    const [bodyFields, setBodyFields] = useState([{ path: '', valuesCsv: '' }]);
    const [headerFields, setHeaderFields] = useState([]);
    const [replaceExisting, setReplaceExisting] = useState(false);
    const [error, setError] = useState(null);

    const updateBodyField = (i, patch) => setBodyFields(f => f.map((row, idx) => idx === i ? { ...row, ...patch } : row));
    const addBodyField = () => setBodyFields(f => [...f, { path: '', valuesCsv: '' }]);
    const removeBodyField = (i) => setBodyFields(f => f.filter((_, idx) => idx !== i));

    const updateHeaderField = (i, patch) => setHeaderFields(f => f.map((row, idx) => idx === i ? { ...row, ...patch } : row));
    const addHeaderField = () => setHeaderFields(f => [...f, { path: '', valuesCsv: '' }]);
    const removeHeaderField = (i) => setHeaderFields(f => f.filter((_, idx) => idx !== i));

    const activeFields = [
        ...bodyFields.map(f => ({ path: f.path.trim(), values: splitCsv(f.valuesCsv) })),
        ...headerFields.map(f => ({ path: f.path.trim(), values: splitCsv(f.valuesCsv) })),
    ].filter(f => f.path && f.values.length);
    const comboCount = activeFields.length === 0 ? 0 : activeFields.reduce((acc, f) => acc * f.values.length, 1);

    const doGenerate = () => {
        setError(null);
        let base;
        try {
            base = baseBody.trim() ? JSON.parse(baseBody) : {};
        } catch (e) {
            setError('Base Body must be valid JSON (or left empty): ' + e.message);
            return;
        }
        const combos = buildCombinations(base, bodyFields, headerFields);
        if (combos.length === 0) {
            setError('Add at least one field with a name and at least one value.');
            return;
        }
        onChange(replaceExisting ? combos : [...dataSets, ...combos]);
        onDone();
    };

    return (
        <div style={{ border: `1px dashed ${C.border}`, borderRadius: C.radiusSm, padding: 10, marginBottom: 10, background: C.panel }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 6 }}>Generate Combinations</div>
            <div style={{ fontSize: 10, color: C.textFaint, marginBottom: 10 }}>
                Enter the possible values for each field below (comma-separated) — one Data Set entry
                is generated for every combination across all fields (e.g. 3 CIF values × 2 environments
                → 6 entries).
            </div>

            <div style={{ fontSize: 10, color: C.textFaint, marginBottom: 4, fontWeight: 700, letterSpacing: '0.03em' }}>
                BASE BODY <span style={{ fontWeight: 400, fontStyle: 'italic' }}>(optional — fixed fields the varying ones get merged into)</span>
            </div>
            <textarea
                style={{ ...inputStyle, width: '100%', minHeight: 56, fontFamily: C.mono, resize: 'vertical', marginBottom: 10 }}
                placeholder='{"appName": "myapp"}'
                value={baseBody}
                onChange={e => setBaseBody(e.target.value)}
            />

            <div style={{ fontSize: 10, color: C.textFaint, marginBottom: 4, fontWeight: 700, letterSpacing: '0.03em' }}>BODY FIELDS</div>
            {bodyFields.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input style={{ ...inputStyle, flex: 1 }} placeholder="field name, e.g. CIF or user.role" value={f.path} onChange={e => updateBodyField(i, { path: e.target.value })} />
                    <input style={{ ...inputStyle, flex: 2, fontFamily: C.mono }} placeholder="comma-separated values, e.g. 1001,1002,1003" value={f.valuesCsv} onChange={e => updateBodyField(i, { valuesCsv: e.target.value })} />
                    <button onClick={() => removeBodyField(i)} style={{ ...btnStyle, padding: '2px 6px' }}>✕</button>
                </div>
            ))}
            <button onClick={addBodyField} style={btnStyle}>+ Add body field</button>

            <div style={{ fontSize: 10, color: C.textFaint, margin: '14px 0 4px', fontWeight: 700, letterSpacing: '0.03em' }}>HEADER FIELDS</div>
            {headerFields.length === 0 && <div style={{ fontSize: 10, color: C.textFaint, fontStyle: 'italic', marginBottom: 6 }}>None — add one if you want header values to vary too.</div>}
            {headerFields.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input style={{ ...inputStyle, flex: 1 }} placeholder="header name, e.g. X-Env" value={f.path} onChange={e => updateHeaderField(i, { path: e.target.value })} />
                    <input style={{ ...inputStyle, flex: 2, fontFamily: C.mono }} placeholder="comma-separated values, e.g. dev,qa,prod" value={f.valuesCsv} onChange={e => updateHeaderField(i, { valuesCsv: e.target.value })} />
                    <button onClick={() => removeHeaderField(i)} style={{ ...btnStyle, padding: '2px 6px' }}>✕</button>
                </div>
            ))}
            <button onClick={addHeaderField} style={btnStyle}>+ Add header field</button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14 }}>
                <span style={{ fontSize: 11, color: C.textDim }}>
                    {comboCount === 0 ? 'No combinations yet' : `${comboCount} combination${comboCount === 1 ? '' : 's'} will be generated`}
                </span>
                <label style={{ fontSize: 11, color: C.textDim, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input type="checkbox" checked={replaceExisting} onChange={e => setReplaceExisting(e.target.checked)} /> Replace existing entries
                </label>
            </div>
            {error && <div style={{ fontSize: 11, color: C.danger, marginTop: 6 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={doGenerate} style={primaryBtnStyle} disabled={comboCount === 0}>
                    Generate {comboCount || ''} {comboCount === 1 ? 'Entry' : 'Entries'}
                </button>
                <button onClick={onDone} style={btnStyle}>Cancel</button>
            </div>
        </div>
    );
}

function splitCsv(csv) {
    return (csv || '').split(',').map(v => v.trim()).filter(v => v !== '');
}

/** Dot-path assignment into a plain object, creating intermediate objects as needed — e.g.
 *  setPath(obj, "user.role", "admin") → obj.user.role = "admin". */
function setPath(obj, path, value) {
    const parts = path.split('.').map(p => p.trim()).filter(Boolean);
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null || Array.isArray(cur[parts[i]])) cur[parts[i]] = {};
        cur = cur[parts[i]];
    }
    if (parts.length) cur[parts[parts.length - 1]] = value;
}

/** Cartesian product across every body+header field that has both a name and at least one value —
 *  values are kept as plain strings (not coerced to numbers) so things like a leading-zero CIF
 *  survive intact; edit a generated entry afterward if a field genuinely needs to be a JSON number. */
function buildCombinations(baseBody, bodyFieldsRaw, headerFieldsRaw) {
    const bodyFields = bodyFieldsRaw
        .map(f => ({ path: f.path.trim(), values: splitCsv(f.valuesCsv), kind: 'body' }))
        .filter(f => f.path && f.values.length);
    const headerFields = headerFieldsRaw
        .map(f => ({ path: f.path.trim(), values: splitCsv(f.valuesCsv), kind: 'header' }))
        .filter(f => f.path && f.values.length);
    const fields = [...bodyFields, ...headerFields];
    if (fields.length === 0) return [];

    let combos = [[]];
    for (const field of fields) {
        const next = [];
        for (const combo of combos) {
            for (const value of field.values) next.push([...combo, { field, value }]);
        }
        combos = next;
    }

    return combos.map(combo => {
        const bodyObj = JSON.parse(JSON.stringify(baseBody)); // deep clone — don't mutate the shared base
        const headers = [];
        for (const { field, value } of combo) {
            if (field.kind === 'body') setPath(bodyObj, field.path, value);
            else headers.push({ key: field.path, value, enabled: true });
        }
        return { body: JSON.stringify(bodyObj, null, 2), headers };
    });
}

const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
};
