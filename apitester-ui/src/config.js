// The API lives at the root of whatever origin served this page (protocol + hostname + port),
// PLUS whatever path segment precedes "/ui/" itself. A reverse proxy/gateway in front of this app
// can mount the whole thing under an arbitrary prefix (e.g. https://host/some-gateway-path/ui/...)
// — Mule's own listener only ever sees "/ui/*" (see collections-api.xml's static-resource
// listener), so that prefix is invisible to the backend and has to be recovered from the browser's
// own address bar instead, same as the origin itself. Deriving both pieces from window.location —
// rather than hardcoding a host/port, or assuming the app is always mounted at the origin's root —
// lets this resolve correctly regardless of which host/port/proxy/prefix this was actually
// deployed behind (hardcoding made every API call target a fixed host/port/path even if the real
// deployment used a different one, surfacing in the browser console as a CORS/network failure or a
// bare 404 rather than a clear "wrong host/port/prefix").
const path = window.location.pathname;
const uiMatch = path.match(/^(.*)\/ui(\/|$)/);
const basePath = uiMatch ? uiMatch[1] : '';

export const BASE_URL = window.location.origin + basePath;
