import { useState } from 'react';
import { C, inputStyle, btnStyle, primaryBtnStyle } from '../theme';

const MODES = ['deep-equal', 'partial', 'keys-only'];
const MODE_LABEL = { 'deep-equal': 'Deep Equal', 'partial': 'Partial', 'keys-only': 'Keys Only' };

/** A quick, standalone JSON-diff utility — pure client-side, no backend round-trip, since the
 *  comparison itself is cheap and doesn't depend on any saved request. Mirrors the EXACT same
 *  semantics as the "jsoncompare" post-response step's own comparison functions (execution-engine.
 *  xml's run-compare-step: jsonEquals/isSubset/sameTopLevelKeys) so results here match what a
 *  jsoncompare step would report, rather than being a second, possibly-diverging implementation
 *  in spirit only. */
function typeOf(v) {
    if (v === null || v === undefined) return 'null';
    if (Array.isArray(v)) return 'array';
    if (typeof v === 'object') return 'object';
    return typeof v; // 'string' | 'number' | 'boolean'
}

function jsonEquals(a, b, ignoreArrayOrder) {
    const ta = typeOf(a), tb = typeOf(b);
    if (ta !== tb) return false;
    if (ta === 'object') {
        const ka = Object.keys(a), kb = Object.keys(b);
        if (ka.length !== kb.length) return false;
        return ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && jsonEquals(a[k], b[k], ignoreArrayOrder));
    }
    if (ta === 'array') {
        if (a.length !== b.length) return false;
        if (ignoreArrayOrder) {
            const key = (x) => JSON.stringify(x);
            const sa = [...a].sort((x, y) => key(x).localeCompare(key(y)));
            const sb = [...b].sort((x, y) => key(x).localeCompare(key(y)));
            return sa.every((x, i) => jsonEquals(x, sb[i], ignoreArrayOrder));
        }
        return a.every((x, i) => jsonEquals(x, b[i], ignoreArrayOrder));
    }
    return a === b;
}

// "partial": every key in EXPECTED (right) must exist and deep-match in ACTUAL (left); extra
// keys in left are ignored. If right isn't an object, degrades to full jsonEquals.
function isSubset(left, right, ignoreArrayOrder) {
    if (typeOf(right) !== 'object') return jsonEquals(left, right, ignoreArrayOrder);
    if (typeOf(left) !== 'object') return false;
    return Object.keys(right).every(k => jsonEquals(left[k], right[k], ignoreArrayOrder));
}

// "keys-only": compares field-NAME sets only (values never inspected) — recurses through
// arrays index-by-index, but not into an object field's value even if it's itself an object.
function sameTopLevelKeys(left, right) {
    if (typeOf(left) === 'array' && typeOf(right) === 'array') {
        if (left.length !== right.length) return false;
        return left.every((x, i) => sameTopLevelKeys(x, right[i]));
    }
    if (typeOf(left) !== 'object' || typeOf(right) !== 'object') return JSON.stringify(left) === JSON.stringify(right);
    return JSON.stringify(Object.keys(left).sort()) === JSON.stringify(Object.keys(right).sort());
}

export default function JsonCompareModal({ onClose }) {
    const [left, setLeft] = useState('');
    const [right, setRight] = useState('');
    const [mode, setMode] = useState('deep-equal');
    const [ignoreArrayOrder, setIgnoreArrayOrder] = useState(false);
    const [result, setResult] = useState(null); // {error} | {passed}

    const compare = () => {
        let leftVal, rightVal;
        try { leftVal = JSON.parse(left); } catch (e) { setResult({ error: `Left (actual) is not valid JSON: ${e.message}` }); return; }
        try { rightVal = JSON.parse(right); } catch (e) { setResult({ error: `Right (expected) is not valid JSON: ${e.message}` }); return; }
        const passed = mode === 'partial' ? isSubset(leftVal, rightVal, ignoreArrayOrder)
            : mode === 'keys-only' ? sameTopLevelKeys(leftVal, rightVal)
            : jsonEquals(leftVal, rightVal, ignoreArrayOrder);
        setResult({ passed });
    };

    return (
        <div className="at-overlay" style={overlayStyle}>
            <div className="at-modal" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: C.radius, boxShadow: C.shadowLg, width: 640, maxHeight: '85vh', overflowY: 'auto', padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>JSON Compare</span>
                    <button onClick={onClose} style={btnStyle}>Close</button>
                </div>
                <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 14 }}>
                    Quick, standalone JSON diff — same comparison semantics as the "JSON Compare" post-response step (Deep Equal/Partial/Keys Only, optional ignore-array-order), just not tied to any saved request.
                </div>

                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, fontWeight: 700, color: C.textFaint, letterSpacing: '0.03em' }}>LEFT (actual)</label>
                        <textarea
                            style={{ ...inputStyle, width: '100%', minHeight: 200, fontFamily: C.mono, fontSize: 11, resize: 'vertical', marginTop: 4 }}
                            placeholder='{"id": 101}'
                            value={left}
                            onChange={e => setLeft(e.target.value)}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, fontWeight: 700, color: C.textFaint, letterSpacing: '0.03em' }}>RIGHT (expected)</label>
                        <textarea
                            style={{ ...inputStyle, width: '100%', minHeight: 200, fontFamily: C.mono, fontSize: 11, resize: 'vertical', marginTop: 4 }}
                            placeholder='{"id": 101}'
                            value={right}
                            onChange={e => setRight(e.target.value)}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                    <select style={inputStyle} value={mode} onChange={e => setMode(e.target.value)}>
                        {MODES.map(m => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
                    </select>
                    {mode !== 'keys-only' && (
                        <label style={{ fontSize: 11, color: C.textDim, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={ignoreArrayOrder} onChange={e => setIgnoreArrayOrder(e.target.checked)} /> Ignore array order
                        </label>
                    )}
                    <button onClick={compare} style={primaryBtnStyle}>Compare</button>
                </div>

                {result && (
                    result.error ? (
                        <div style={{ fontSize: 12, color: C.danger }}>{result.error}</div>
                    ) : (
                        <div style={{
                            fontSize: 13, fontWeight: 700, padding: '8px 12px', borderRadius: C.radiusSm,
                            color: result.passed ? C.success : C.danger,
                            background: result.passed ? `${C.success}15` : `${C.danger}15`,
                        }}>
                            {result.passed ? '✓ Match' : '✕ Mismatch'} ({MODE_LABEL[mode]}{mode !== 'keys-only' && ignoreArrayOrder ? ', ignoring array order' : ''})
                        </div>
                    )
                )}
            </div>
        </div>
    );
}

const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
};
