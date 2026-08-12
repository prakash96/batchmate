import { useState } from 'react';
import CollectionTree from './components/sidebar/CollectionTree';
import RequestPanel from './components/panels/RequestPanel';
import ConnectionsPanel from './components/connections/ConnectionsPanel';
import GlobalVarsPanel from './components/GlobalVarsPanel';
import { C, btnStyle } from './theme';

export default function App() {
    const [showConnections, setShowConnections] = useState(false);
    const [showGlobalVars, setShowGlobalVars] = useState(false);

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
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setShowGlobalVars(true)} style={btnStyle}>🌐 Global Variables</button>
                    <button onClick={() => setShowConnections(true)} style={btnStyle}>🔌 DB Connections</button>
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
            {showConnections && <ConnectionsPanel onClose={() => setShowConnections(false)} />}
            {showGlobalVars && <GlobalVarsPanel onClose={() => setShowGlobalVars(false)} />}
        </div>
    );
}
