import { useState } from 'react';
import { C, inputStyle, btnStyle } from '../theme';
import { useCollectionStore } from '../store/collectionStore';

/** Password prompt for a locked workspace — see collectionStore's unlockWorkspace for how the
 *  returned collections get merged back into the tree on success. Shared between CollectionTree
 *  (its own 🔒 rows) and anything else that needs a locked workspace unlocked before it can act
 *  on it — e.g. SwaggerPayloadModal, which prompts this before creating a collection in one.
 *  onUnlocked (optional) fires right before onClose, only on success — for a caller that needs to
 *  continue with whatever it was about to do once the workspace is actually open. */
export default function UnlockWorkspaceModal({ workspace, onClose, onUnlocked }) {
    const { unlockWorkspace } = useCollectionStore();
    const [password, setPassword] = useState('');
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState(null);

    const submit = async (e) => {
        e.preventDefault();
        setChecking(true);
        setError(null);
        try {
            await unlockWorkspace(workspace.id, password);
            onUnlocked?.();
            onClose();
        } catch (err) {
            setError(err.message);
            setChecking(false);
        }
    };

    return (
        <div className="at-overlay" style={overlayStyle}>
            <form onSubmit={submit} className="at-modal" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: C.radius, boxShadow: C.shadowLg, width: 320, padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>🔒 {workspace.name}</div>
                <div style={{ fontSize: 10, color: C.textFaint, marginBottom: 14 }}>This workspace is password-protected.</div>
                <input autoFocus type="password" style={{ ...inputStyle, width: '100%', marginBottom: 6 }} value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
                {error && <div style={{ fontSize: 11, color: C.danger, marginBottom: 10 }}>{error}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                    <button type="button" onClick={onClose} style={btnStyle}>Cancel</button>
                    <button type="submit" disabled={checking} style={{ ...btnStyle, background: C.accent, color: '#fff', opacity: checking ? 0.6 : 1 }}>
                        {checking ? 'Checking…' : 'Unlock'}
                    </button>
                </div>
            </form>
        </div>
    );
}

const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
};
