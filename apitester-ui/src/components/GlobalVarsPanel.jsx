import { useEffect, useState } from 'react';
import { useGlobalVarsStore } from '../store/globalVarsStore';
import { C, inputStyle, btnStyle, primaryBtnStyle } from '../theme';

export default function GlobalVarsPanel({ onClose }) {
    const { globalVariables, setGlobalVariables, fetchGlobalVariables, loaded } = useGlobalVarsStore();
    const [rows, setRows] = useState(null); // null while the initial backend fetch is in flight
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!loaded) fetchGlobalVariables();
    }, [loaded, fetchGlobalVariables]);

    useEffect(() => {
        if (loaded && rows === null) {
            setRows(Object.entries(globalVariables).map(([name, value]) => ({ name, value })));
        }
    }, [loaded, globalVariables, rows]);

    const update = (i, patch) => setRows(r => r.map((row, idx) => idx === i ? { ...row, ...patch } : row));
    const add = () => setRows(r => [...(r || []), { name: '', value: '' }]);
    const remove = (i) => setRows(r => r.filter((_, idx) => idx !== i));

    const save = async () => {
        setSaving(true);
        const vars = {};
        (rows || []).forEach(r => { if (r.name.trim()) vars[r.name.trim()] = r.value; });
        await setGlobalVariables(vars);
        setSaving(false);
        onClose();
    };

    return (
        <div className="at-overlay" style={overlayStyle}>
            <div className="at-modal" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: C.radius, boxShadow: C.shadowLg, width: 460, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Global Variables</span>
                    <button onClick={onClose} style={btnStyle}>Close</button>
                </div>
                <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 12 }}>
                    Stored on the backend (shared across everyone using this app, not just this browser) — injected as <code style={{ color: C.textDim }}>vars.x</code> on every request run, before collection variables and pre-request steps override them.
                </div>
                {rows === null ? (
                    <div style={{ fontSize: 11, color: C.textFaint, fontStyle: 'italic', padding: '12px 0' }}>Loading…</div>
                ) : (
                    <>
                        {rows.map((row, i) => (
                            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                                <input style={{ ...inputStyle, flex: 1 }} placeholder="name" value={row.name} onChange={e => update(i, { name: e.target.value })} />
                                <input style={{ ...inputStyle, flex: 1 }} placeholder="value" value={row.value} onChange={e => update(i, { value: e.target.value })} />
                                <button onClick={() => remove(i)} style={{ ...btnStyle, padding: '4px 8px' }}>✕</button>
                            </div>
                        ))}
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                            <button onClick={add} style={btnStyle}>+ Add</button>
                            <button onClick={save} style={primaryBtnStyle} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
};
