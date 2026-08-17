// The API lives at the root of whatever origin served this page (protocol + hostname + port —
// window.location.origin never includes a path, so this is unaffected by the UI itself now being
// served under /ui/* rather than at the root, see collections-api.xml's static-resource listener).
// Deriving this from the browser's own address bar — rather than hardcoding a host and/or port —
// lets it resolve correctly regardless of which host/port/proxy this was actually deployed behind
// (hardcoding made every API call target a fixed port even if the real listener was on a
// different one, surfacing in the browser console as a CORS/network failure rather than a clear
// "wrong host/port").
export const BASE_URL = window.location.origin;
