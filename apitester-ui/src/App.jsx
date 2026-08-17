import { useEffect, useState } from 'react';
import CollectionTree from './components/sidebar/CollectionTree';
import RequestPanel from './components/panels/RequestPanel';
import GlobalVarsPanel from './components/GlobalVarsPanel';
import JsonCompareModal from './components/JsonCompareModal';
import SwaggerPayloadModal from './components/SwaggerPayloadModal';
import { useThemeStore, THEMES } from './store/themeStore';
import { C, btnStyle, inputStyle } from './theme';

export default function App() {
    const [showGlobalVars, setShowGlobalVars] = useState(false);
    const [showJsonCompare, setShowJsonCompare] = useState(false);
    const [showSwaggerPayload, setShowSwaggerPayload] = useState(false);
    const { theme, setTheme } = useThemeStore();

    // Reflects the selected theme onto <html> so every inline style built from theme.js's
    // var()-based tokens (accent/accent2/accentDim, method colors) updates instantly — see
    // index.css's :root/[data-theme="classic"] blocks. main.jsx does the same on first load
    // (before React renders) to avoid a flash of the wrong theme.
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, color: C.text, fontFamily: C.sans }}>
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px',
                borderBottom: `1px solid ${C.border}`, flexShrink: 0, background: C.panel, boxShadow: C.shadowSm, zIndex: 1,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26,
                        borderRadius: 7, fontSize: 14, background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
                    }}>🧪</span>
                    <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.01em' }}>API Tester</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select value={theme} onChange={e => setTheme(e.target.value)} style={{ ...inputStyle, padding: '5px 8px' }} title="Color theme">
                        {THEMES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                    <button onClick={() => setShowGlobalVars(true)} style={btnStyle}>🌐 Global Variables</button>
                    <button onClick={() => setShowJsonCompare(true)} style={btnStyle}>🔍 JSON Compare</button>
                    <button onClick={() => setShowSwaggerPayload(true)} style={btnStyle}>🧬 Swagger Payloads</button>
                </div>
            </div>
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                <div style={{ width: 280, borderRight: `1px solid ${C.border}`, flexShrink: 0, background: C.panel }}>
                    <CollectionTree />
                </div>
                <div style={{ flex: 1, minWidth: 0, background: C.bg }}>
                    <RequestPanel />
                </div>
            </div>
            {showGlobalVars && <GlobalVarsPanel onClose={() => setShowGlobalVars(false)} />}
            {showJsonCompare && <JsonCompareModal onClose={() => setShowJsonCompare(false)} />}
            {showSwaggerPayload && <SwaggerPayloadModal onClose={() => setShowSwaggerPayload(false)} />}
        </div>
    );
}
