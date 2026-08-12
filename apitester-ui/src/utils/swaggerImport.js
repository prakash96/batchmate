import jsyaml from 'js-yaml';

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

// ── Parse ─────────────────────────────────────────────────────────────────────
// (ported near-verbatim from flow-builder's swaggerImport.js — same OpenAPI/Swagger
// parsing, $ref resolution, and example-value generation; only the final assembly
// step differs: requests instead of workflow node/edge graphs)

export function parseSwaggerText(text) {
    const trimmed = text.trim();
    const spec = trimmed.startsWith('{') ? JSON.parse(text) : jsyaml.load(text);
    if (!spec || typeof spec !== 'object') throw new Error('Could not parse an OpenAPI/Swagger document from this file');
    if (!spec.paths || typeof spec.paths !== 'object') throw new Error('Document has no "paths" — not a valid OpenAPI/Swagger spec');
    return spec;
}

export function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(String(e.target.result));
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

function resolveRef(spec, ref) {
    if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
    const parts = ref.slice(2).split('/').map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'));
    let node = spec;
    for (const p of parts) {
        node = node?.[p];
        if (node == null) return null;
    }
    return node;
}

function deref(spec, node, seen) {
    if (node && typeof node === 'object' && typeof node.$ref === 'string') {
        const seenRefs = seen || new Set();
        if (seenRefs.has(node.$ref)) return {};
        const resolved = resolveRef(spec, node.$ref);
        if (!resolved) return {};
        return deref(spec, resolved, new Set(seenRefs).add(node.$ref));
    }
    return node || {};
}

function exampleForSchema(spec, schemaIn, depth = 0) {
    const schema = deref(spec, schemaIn);
    if (!schema || depth > 6) return null;
    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;
    if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
    if (Array.isArray(schema.allOf)) {
        return schema.allOf.reduce((acc, s) => ({ ...acc, ...(exampleForSchema(spec, s, depth + 1) || {}) }), {});
    }
    const alt = schema.oneOf || schema.anyOf;
    if (Array.isArray(alt) && alt.length) return exampleForSchema(spec, alt[0], depth + 1);

    if (schema.properties || schema.type === 'object') {
        const out = {};
        const props = schema.properties || {};
        for (const key of Object.keys(props)) {
            out[key] = exampleForSchema(spec, props[key], depth + 1);
        }
        return out;
    }
    if (schema.type === 'array') {
        return [exampleForSchema(spec, schema.items || {}, depth + 1)];
    }
    switch (schema.type) {
        case 'integer': return 1;
        case 'number':  return 1.5;
        case 'boolean': return true;
        case 'string':
            if (schema.format === 'date') return '2026-01-01';
            if (schema.format === 'date-time') return '2026-01-01T00:00:00Z';
            if (schema.format === 'uuid') return '00000000-0000-0000-0000-000000000000';
            if (schema.format === 'email') return 'user@example.com';
            return 'string';
        default: return 'string';
    }
}

export function getBaseUrl(spec) {
    if (Array.isArray(spec.servers) && spec.servers[0]?.url) {
        return spec.servers[0].url.replace(/\/$/, '');
    }
    if (spec.host) {
        const scheme = (Array.isArray(spec.schemes) && spec.schemes[0]) || 'https';
        return `${scheme}://${spec.host}${spec.basePath || ''}`.replace(/\/$/, '');
    }
    return '';
}

function securitySchemesFor(spec, operation) {
    const requirements = operation.security ?? spec.security;
    if (!Array.isArray(requirements) || requirements.length === 0) return [];
    const defs = spec.components?.securitySchemes || spec.securityDefinitions || {};
    const names = new Set();
    requirements.forEach(req => Object.keys(req || {}).forEach(n => names.add(n)));
    return [...names].map(n => defs[n]).filter(Boolean);
}

// Returns { headers: [{key,value,enabled}], authVarNames: [{name,example}] }
function buildAuthHeaders(spec, operation) {
    const schemes = securitySchemesFor(spec, operation);
    const headers = [];
    const authVars = [];
    for (const scheme of schemes) {
        if (scheme.type === 'apiKey' && scheme.in === 'header') {
            headers.push({ key: scheme.name, value: `\${vars.${varNameFor(scheme.name)}}`, enabled: true });
            authVars.push({ name: varNameFor(scheme.name), example: 'REPLACE_ME' });
        } else if (scheme.type === 'http' && /bearer/i.test(scheme.scheme || '')) {
            headers.push({ key: 'Authorization', value: '${vars.authToken}', enabled: true });
            authVars.push({ name: 'authToken', example: 'Bearer REPLACE_ME' });
        } else if (scheme.type === 'http' && /basic/i.test(scheme.scheme || '')) {
            headers.push({ key: 'Authorization', value: '${vars.authToken}', enabled: true });
            authVars.push({ name: 'authToken', example: 'Basic REPLACE_ME' });
        } else if (scheme.type === 'oauth2') {
            headers.push({ key: 'Authorization', value: '${vars.authToken}', enabled: true });
            authVars.push({ name: 'authToken', example: 'Bearer REPLACE_ME' });
        }
    }
    return { headers, authVars };
}

function varNameFor(rawName) {
    return String(rawName).replace(/[^a-zA-Z0-9_]/g, '_');
}

export function extractOperations(spec) {
    const ops = [];
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
        if (!pathItem || typeof pathItem !== 'object') continue;
        const sharedParams = (pathItem.parameters || []).map(p => deref(spec, p));
        for (const method of METHODS) {
            const operation = pathItem[method];
            if (!operation) continue;
            const ownParams = (operation.parameters || []).map(p => deref(spec, p));
            const byName = new Map();
            [...sharedParams, ...ownParams].forEach(p => p?.name && byName.set(`${p.in}:${p.name}`, p));
            ops.push({
                path, method: method.toUpperCase(), operation,
                operationId: operation.operationId || `${method}_${path}`,
                tags: operation.tags?.length ? operation.tags : ['Untagged'],
                parameters: [...byName.values()],
            });
        }
    }
    return ops;
}

function requestBodyFor(spec, operation, parameters) {
    if (operation.requestBody) {
        const rb = deref(spec, operation.requestBody);
        const content = rb.content?.['application/json'] || Object.values(rb.content || {})[0];
        if (!content) return { required: !!rb.required, example: null };
        const example = content.example ?? Object.values(content.examples || {})[0]?.value
            ?? exampleForSchema(spec, content.schema);
        return { required: !!rb.required, example, schema: content.schema };
    }
    const bodyParam = parameters.find(p => p.in === 'body');
    if (bodyParam) {
        return { required: !!bodyParam.required, example: exampleForSchema(spec, bodyParam.schema), schema: bodyParam.schema };
    }
    return null;
}

function responseExampleFor(spec, responseObj) {
    const resp = deref(spec, responseObj);
    if (!resp) return null;
    if (resp.content) {
        const content = resp.content['application/json'] || Object.values(resp.content)[0];
        if (!content) return null;
        return content.example ?? Object.values(content.examples || {})[0]?.value ?? exampleForSchema(spec, content.schema);
    }
    if (resp.schema) return exampleForSchema(spec, resp.schema);
    return null;
}

// ── Request generation (replaces the original's workflow-node generation) ─────

function buildUrlAndParams(baseUrl, path, queryParams, omitQueryNames) {
    const url = baseUrl + path.replace(/\{([^}]+)\}/g, (_, name) => `\${vars.${varNameFor(name)}}`);
    const params = queryParams
        .filter(p => !omitQueryNames?.has(p.name))
        .map(p => ({ key: p.name, value: `\${vars.${varNameFor(p.name)}}`, enabled: true }));
    return { url, params };
}

/**
 * One request per meaningful declared response code: 2xx → happy path (valid example
 * data + status + shape assertions); 4xx/5xx → a best-effort negative case that tries
 * to provoke that status. Mirrors flow-builder's swaggerImport.js test-case rules,
 * targeting the request/preRequest/postResponse model instead of node graphs.
 */
export function generateRequestsForOperation(spec, op, baseUrl) {
    const { path, method, operation, parameters } = op;
    const pathParams   = parameters.filter(p => p.in === 'path');
    const queryParams   = parameters.filter(p => p.in === 'query');
    const headerParams  = parameters.filter(p => p.in === 'header');
    const requiredQuery = queryParams.filter(p => p.required);

    const body = requestBodyFor(spec, operation, parameters);
    const { headers: authHeaders, authVars } = buildAuthHeaders(spec, operation);

    const baseVarEntries = [
        ...pathParams.map(p => ({ name: varNameFor(p.name), example: exampleForSchema(spec, p.schema) ?? p.example ?? 'example' })),
        ...queryParams.map(p => ({ name: varNameFor(p.name), example: exampleForSchema(spec, p.schema) ?? p.example ?? 'example' })),
        ...headerParams.map(p => ({ name: varNameFor(p.name), example: exampleForSchema(spec, p.schema) ?? p.example ?? 'example' })),
        ...authVars,
    ];

    const headerRows = [
        ...headerParams.map(p => ({ key: p.name, value: `\${vars.${varNameFor(p.name)}}`, enabled: true })),
        ...authHeaders,
    ];

    const responses = operation.responses || {};
    const cases = [];

    // setVariable's "expression" is a literal constant when it contains no "${...}" —
    // so plain String() here (not JSON.stringify, which would leave stray quote characters
    // in the variable's value for string examples).
    const preRequestFor = (entries) =>
        entries.map(e => ({ type: 'setVariable', name: e.name, expression: e.example != null ? String(e.example) : '' }));

    for (const [code, responseObj] of Object.entries(responses)) {
        const numeric = parseInt(code, 10);
        if (!Number.isFinite(numeric)) continue; // skip "default"

        if (numeric >= 200 && numeric < 300) {
            const { url, params } = buildUrlAndParams(baseUrl, path, queryParams);
            const expectedExample = responseExampleFor(spec, responseObj);
            const postResponse = [
                { type: 'assertion', name: `Expect ${code}`, logic: 'AND',
                  conditions: [{ left: 'headers.httpResponseCode', operator: '==', right: String(numeric) }], onFail: 'stop' },
            ];
            if (expectedExample) {
                postResponse.push({
                    type: 'jsoncompare', name: 'Verify response shape',
                    leftSource: 'body', leftExpr: '', rightSource: 'literal',
                    rightLiteral: JSON.stringify(expectedExample), mode: 'partial', ignoreArrayOrder: true,
                    resultVar: '', onMismatch: 'continue',
                });
            }
            cases.push({
                label: `${code} ${deref(spec, responseObj).description || 'Success'} (happy path)`,
                preRequest: preRequestFor(baseVarEntries),
                request: { method, url, params, headers: headerRows, bodyMode: 'raw-json', body: body?.example != null ? JSON.stringify(body.example) : '' },
                postResponse,
            });
            continue;
        }

        if (numeric === 400 && (requiredQuery.length || body?.required)) {
            const omit = requiredQuery.length ? new Set([requiredQuery[0].name]) : null;
            const { url, params } = buildUrlAndParams(baseUrl, path, queryParams, omit);
            cases.push({
                label: `${code} ${deref(spec, responseObj).description || 'Bad Request'} (missing required ${omit ? 'query param' : 'body'})`,
                preRequest: preRequestFor(baseVarEntries),
                request: { method, url, params, headers: headerRows, bodyMode: 'raw-json', body: body?.required ? '{}' : (body?.example != null ? JSON.stringify(body.example) : '') },
                postResponse: [{ type: 'assertion', name: `Expect ${code}`, logic: 'AND',
                  conditions: [{ left: 'headers.httpResponseCode', operator: '==', right: String(numeric) }], onFail: 'stop' }],
            });
            continue;
        }

        if ((numeric === 401 || numeric === 403) && authVars.length) {
            const { url, params } = buildUrlAndParams(baseUrl, path, queryParams);
            cases.push({
                label: `${code} ${deref(spec, responseObj).description || 'Unauthorized'} (missing credentials)`,
                preRequest: preRequestFor(baseVarEntries.filter(v => !authVars.some(av => av.name === v.name))),
                request: { method, url, params, headers: headerParams.map(p => ({ key: p.name, value: `\${vars.${varNameFor(p.name)}}`, enabled: true })), bodyMode: 'raw-json', body: body?.example != null ? JSON.stringify(body.example) : '' },
                postResponse: [{ type: 'assertion', name: `Expect ${code}`, logic: 'AND',
                  conditions: [{ left: 'headers.httpResponseCode', operator: '==', right: String(numeric) }], onFail: 'stop' }],
            });
            continue;
        }

        if (numeric === 404 && pathParams.length) {
            const overrides = baseVarEntries.map(v =>
                pathParams.some(p => varNameFor(p.name) === v.name) ? { ...v, example: '__does-not-exist__' } : v);
            const { url, params } = buildUrlAndParams(baseUrl, path, queryParams);
            cases.push({
                label: `${code} ${deref(spec, responseObj).description || 'Not Found'} (invalid id)`,
                preRequest: preRequestFor(overrides),
                request: { method, url, params, headers: headerRows, bodyMode: 'raw-json', body: body?.example != null ? JSON.stringify(body.example) : '' },
                postResponse: [{ type: 'assertion', name: `Expect ${code}`, logic: 'AND',
                  conditions: [{ left: 'headers.httpResponseCode', operator: '==', right: String(numeric) }], onFail: 'stop' }],
            });
            continue;
        }

        // Fallback — still record the documented status as a placeholder, non-blocking.
        const { url, params } = buildUrlAndParams(baseUrl, path, queryParams);
        cases.push({
            label: `${code} ${deref(spec, responseObj).description || 'Response'} (needs manual setup)`,
            preRequest: preRequestFor(baseVarEntries),
            request: { method, url, params, headers: headerRows, bodyMode: 'raw-json', body: body?.example != null ? JSON.stringify(body.example) : '' },
            postResponse: [{ type: 'assertion', name: `Expect ${code} (TODO: adjust inputs to trigger this response)`, logic: 'AND',
              conditions: [{ left: 'headers.httpResponseCode', operator: '==', right: String(numeric) }], onFail: 'continue' }],
        });
    }

    return cases;
}

/**
 * Parses an OpenAPI/Swagger document and returns folders grouped by tag, each
 * containing one generated request per test case (one per declared response
 * code per operation). Shape: [{ name: tagName, requests: [{ name, preRequest, request, postResponse }] }]
 */
export function buildFoldersFromSwagger(specText) {
    const spec = parseSwaggerText(specText);
    const baseUrl = getBaseUrl(spec);
    const operations = extractOperations(spec);

    const byTag = new Map();
    for (const op of operations) {
        const cases = generateRequestsForOperation(spec, op, baseUrl);
        for (const tag of op.tags) {
            if (!byTag.has(tag)) byTag.set(tag, []);
            for (const c of cases) {
                byTag.get(tag).push({
                    name: `${op.method} ${op.path} - ${c.label}`.slice(0, 120),
                    preRequest: c.preRequest, request: c.request, postResponse: c.postResponse,
                });
            }
        }
    }

    return [...byTag.entries()].map(([name, requests]) => ({ name, requests }));
}
