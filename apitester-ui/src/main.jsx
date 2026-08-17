import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Apply the persisted theme choice before React even renders, so there's no flash of the default
// theme on load — App.jsx's own effect (via useThemeStore) keeps this in sync from then on,
// this is just for the very first paint. Matches zustand persist's storage shape directly rather
// than importing the store here, to keep this a plain synchronous read with no store overhead.
try {
    const raw = localStorage.getItem('apitester-theme');
    const theme = raw ? JSON.parse(raw)?.state?.theme : null;
    if (theme) document.documentElement.setAttribute('data-theme', theme);
} catch { /* malformed/absent — falls back to the default theme */ }

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
