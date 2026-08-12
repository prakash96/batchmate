import { useEffect, useState } from 'react';
import { useConnectionStore } from '../../store/connectionStore';
import { C, inputStyle, btnStyle, primaryBtnStyle } from '../../theme';

export default function ConnectionsPanel({ onClose }) {
    const { connections, connectionTypes, fetchAll, save, update, remove, test } = useConnectionStore();
    const [editing, setEditing] = useState(null); // {id?, name, type, config}
    const [testResult, setTestResult] = useState(null);

    useEffect(() => { fetchAll(); }, []);

    const startNew = () => {
        const firstType = Object.keys(connectionTypes)[0] || 'postgresql';
        setEditing({ name: '', type: firstType, config: {} });
        setTestResult(null);
    };

    const startEdit = (c) => { setEditing(structuredClone(c)); setTestResult(null); };

    const setField = (key, value) => setEditing(e => ({ ...e, config: { ...e.config, [key]: value } }));

    const doSave = async () => {
        if (editing.id) await update(editing.id, editing);
        else await save({ ...editing, id: crypto.randomUUID() });
        setEditing(null);
    };

    const doTest = async () => {
        setTestResult('testing…');
        const r = await test(editing);
        setTestResult(r.success ? `✓ ${r.message}` : `✕ ${r.message}`);
    };

    const fields = editing ? (connectionTypes[editing.type]?.fields || []) : [];

    return (
        <div className="at-overlay" style={overlayStyle}>
            <div className="at-modal" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: C.radius, boxShadow: C.shadowLg, width: 560, maxHeight: '80vh', overflowY: 'auto', padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Database Connections</span>
                    <button onClick={onClose} style={btnStyle}>Close</button>
                </div>

                {!editing && (
                    <div>
                        {connections.length === 0 && <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 10 }}>No connections saved yet.</div>}
                        {connections.map(c => (
                            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px', borderBottom: `1px solid ${C.borderLo}` }}>
                                <span style={{ fontSize: 12, color: C.text }}>
                                    {connectionTypes[c.type]?.icon} {c.name} <span style={{ color: C.textFaint }}>({c.type})</span>
                                </span>
                                <span style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={() => startEdit(c)} style={btnStyle}>Edit</button>
                                    <button onClick={() => remove(c.id)} style={btnStyle}>Delete</button>
                                </span>
                            </div>
                        ))}
                        <button onClick={startNew} style={{ ...primaryBtnStyle, marginTop: 12 }}>+ New Connection</button>
                    </div>
                )}

                {editing && (
                    <div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                            <input style={{ ...inputStyle, flex: 1 }} placeholder="Connection name" value={editing.name} onChange={e => setEditing(v => ({ ...v, name: e.target.value }))} />
                            <select
                                style={inputStyle}
                                value={editing.type}
                                onChange={e => setEditing(v => ({ ...v, type: e.target.value, config: {} }))}
                                disabled={!!editing.id}
                            >
                                {Object.entries(connectionTypes).map(([key, t]) => <option key={key} value={key}>{t.icon} {t.label}</option>)}
                            </select>
                        </div>
                        {fields.map(f => (
                            <div key={f.key} style={{ marginBottom: 8 }}>
                                <label style={{ fontSize: 10, color: C.textFaint, display: 'block', marginBottom: 3 }}>{f.label}{f.required && ' *'}</label>
                                {f.type === 'select' ? (
                                    <select style={{ ...inputStyle, width: '100%' }} value={editing.config[f.key] || ''} onChange={e => setField(f.key, e.target.value)}>
                                        <option value="">—</option>
                                        {(f.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                ) : f.type === 'checkbox' ? (
                                    <input type="checkbox" checked={!!editing.config[f.key]} onChange={e => setField(f.key, e.target.checked)} />
                                ) : (
                                    <input
                                        style={{ ...inputStyle, width: '100%' }}
                                        type={f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'}
                                        placeholder={f.placeholder}
                                        value={editing.config[f.key] ?? ''}
                                        onChange={e => setField(f.key, e.target.value)}
                                    />
                                )}
                            </div>
                        ))}
                        {testResult && <div style={{ fontSize: 11, color: testResult.startsWith('✓') ? C.success : C.danger, marginBottom: 8 }}>{testResult}</div>}
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                            <button onClick={doTest} style={btnStyle}>Test Connection</button>
                            <button onClick={doSave} style={primaryBtnStyle}>Save</button>
                            <button onClick={() => setEditing(null)} style={btnStyle}>Cancel</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
};
