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
