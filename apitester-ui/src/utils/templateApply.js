// Applies a template's optional Input section ({body, headers:[...]} — the same shape the
// Input tab edits) onto a request being created. Two call sites, two different merge rules —
// see templates-api.xml's own file comment for why:
//
//   mode 'replace' — CollectionTree's "+ Add Request" flow. A brand-new request has nothing
//   worth preserving (its body is just the default passthrough placeholder, headers empty), so
//   the template's own body/headers are set outright when the template defines them.
//
//   mode 'merge' — SwaggerPayloadModal's already-populated generated scenarios. The generated
//   body IS the whole point of that generator (schema-derived, per scenario) — a template never
//   touches it there. Only header rows whose key isn't already present get unioned in, so a
//   template can still contribute something like a shared Authorization header without
//   clobbering the Content-Type row (or anything else) the generator already set.
export function applyTemplateInput(request, tpl, mode) {
    const input = tpl?.input;
    if (!input) return request;
    const existingKeys = new Set((request.headers || []).map(h => (h.key || '').toLowerCase()));
    const templateHeaders = input.headers || [];
    const headers = mode === 'replace' && templateHeaders.length
        ? templateHeaders
        : [...(request.headers || []), ...templateHeaders.filter(h => h.key && !existingKeys.has(h.key.toLowerCase()))];
    const body = mode === 'replace' && input.body ? input.body : request.body;
    return { ...request, body, headers };
}

// Matches a ${...} placeholder in a header value, EXCLUDING ${vars.x} — that's this app's own
// runtime collection/global-variable syntax (see RequestSection's own hint text: "Use ${vars.x}
// anywhere in the URL to interpolate a global/collection variable"), already resolved at send
// time and left alone here. Anything else inside ${} (e.g. ${API_KEY}) is a template author's own
// fill-in-later placeholder — there's no runtime mechanism to supply it, so it needs a concrete
// value up front instead (see SwaggerPayloadModal's "TEMPLATE HEADER VALUES" prompt).
const PLACEHOLDER_RE = /\$\{(?!vars\.)([^}]+)\}/g;

/** Every distinct placeholder name referenced across a set of header rows' values. */
export function collectHeaderPlaceholders(headers) {
    const names = new Set();
    for (const h of headers || []) {
        if (typeof h.value !== 'string') continue;
        for (const m of h.value.matchAll(PLACEHOLDER_RE)) names.add(m[1]);
    }
    return names;
}

/** Replaces each ${name} placeholder in header values with values[name] — anything missing or
 *  left blank stays untouched (still visibly a placeholder) rather than becoming an empty string. */
export function fillHeaderPlaceholders(headers, values) {
    return (headers || []).map(h => ({
        ...h,
        value: typeof h.value === 'string'
            ? h.value.replace(PLACEHOLDER_RE, (m, name) => (values[name] ? values[name] : m))
            : h.value,
    }));
}
