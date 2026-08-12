// apitester-app always listens on port 8082 (see application.yaml), independent of the
// workflow tool's backend (8081). Deriving the host from the browser's own URL — rather than
// hardcoding "localhost" — lets this resolve correctly whether the UI was opened via localhost,
// 127.0.0.1, or another machine's hostname/IP on the network (hardcoding "localhost" made every
// API call target the BROWSER's own machine instead of the actual server once opened remotely,
// which surfaces in the browser console as a CORS/network failure rather than a clear "wrong host").
export const BASE_URL = `${window.location.protocol}//${window.location.hostname}:8082`;
