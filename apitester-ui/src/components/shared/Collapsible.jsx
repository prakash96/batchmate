import { useState } from 'react';
import { C } from '../../theme';

/** Collapsible section — used for the three top-level Pre-Request / Request / Post-Response blocks. */
export default function Collapsible({ title, defaultOpen = true, badge, right, children }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: C.radius, marginBottom: 12, background: C.panel, boxShadow: C.shadowSm, overflow: 'hidden' }}>
            <div
                onClick={() => setOpen(o => !o)}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', cursor: 'pointer', userSelect: 'none',
                    background: open ? C.surface : 'transparent', transition: 'background-color .15s',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ fontSize: 10, color: C.accent, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: '0.03em' }}>{title}</span>
                    {badge != null && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.accent, background: C.accentDim, borderRadius: 10, padding: '1px 8px' }}>{badge}</span>
                    )}
                </div>
                <div onClick={e => e.stopPropagation()}>{right}</div>
            </div>
            {open && <div className="at-section-body" style={{ borderTop: `1px solid ${C.borderLo}`, padding: 14 }}>{children}</div>}
        </div>
    );
}
