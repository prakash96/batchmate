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

export function exampleForSchema(spec, schemaIn, depth = 0) {
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

// Deliberately violates the schema in ONE representative way, preferring the single most
// common validation-testing need — omitting a required field — over corrupting a field's
// type, over corrupting the whole value's type, if the schema offers no better hook for that.
export function negativeExampleForSchema(spec, schemaIn, depth = 0) {
    const schema = deref(spec, schemaIn);
    if (!schema || depth > 6) return 'INVALID';

    if (Array.isArray(schema.allOf)) return negativeExampleForSchema(spec, schema.allOf[0], depth + 1);
    const alt = schema.oneOf || schema.anyOf;
    if (Array.isArray(alt) && alt.length) return negativeExampleForSchema(spec, alt[0], depth + 1);

    if (schema.properties || schema.type === 'object') {
        const props = schema.properties || {};
        const keys = Object.keys(props);
        const required = Array.isArray(schema.required) ? schema.required : [];
        const positive = exampleForSchema(spec, schema, depth) || {};
        if (required.length) {
            // Omit the first required field.
            const rest = { ...positive };
            delete rest[required[0]];
            return rest;
        }
        if (keys.length) {
            // No required fields declared — corrupt the first property's type instead.
            return { ...positive, [keys[0]]: wrongTypeValue(deref(spec, props[keys[0]]).type) };
        }
        return { unexpectedField: 'this schema declares no properties' };
    }
    if (schema.type === 'array') {
        // Wrong element type inside the array, rather than a structurally wrong array itself.
        return [wrongTypeValue(deref(spec, schema.items || {}).type)];
    }
    // A non-object/array schema at the top level — the only "negative" move left is the type itself.
    return wrongTypeValue(schema.type);
}

// Enumerates ONE negative variant per violated constraint — required/minLength/maxLength/
// pattern — across every property of an object schema, rather than a single representative
// guess. Each variant otherwise keeps the positive example's values for every OTHER field, so
// it isolates exactly the one rule under test (never two violations stacked in the same
// payload). Falls back to a single wrong-type variant only if the schema declares none of
// those four constraints anywhere, so there's still something to show.
export function negativeVariantsForSchema(spec, schemaIn, depth = 0) {
    const schema = deref(spec, schemaIn);
    if (!schema || depth > 6) return [];

    if (Array.isArray(schema.allOf)) return negativeVariantsForSchema(spec, schema.allOf[0], depth + 1);
    const alt = schema.oneOf || schema.anyOf;
    if (Array.isArray(alt) && alt.length) return negativeVariantsForSchema(spec, alt[0], depth + 1);

    if (!(schema.properties || schema.type === 'object')) {
        // Non-object top-level schema (e.g. the body IS just a string/array) — required/
        // minLength/maxLength/pattern don't apply at this level, only the type itself does.
        const v = wrongTypeValue(schema.type);
        return v === null ? [] : [{ label: `Wrong type (expected ${schema.type})`, payload: v }];
    }

    const props = schema.properties || {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    const positive = exampleForSchema(spec, schema, depth) || {};
    const variants = [];

    // One variant per required field, that field omitted (everything else stays valid).
    for (const key of required) {
        const rest = { ...positive };
        delete rest[key];
        variants.push({ label: `Missing required field "${key}"`, payload: rest });
    }

    // Per-field minLength/maxLength/pattern violations — these three are string-only
    // constraints in JSON Schema/OpenAPI, so only checked on string-typed properties.
    for (const key of Object.keys(props)) {
        const fieldSchema = deref(spec, props[key]);
        if (fieldSchema.type && fieldSchema.type !== 'string') continue;
        if (typeof fieldSchema.minLength === 'number' && fieldSchema.minLength > 0) {
            const tooShort = 'x'.repeat(Math.max(0, fieldSchema.minLength - 1));
            variants.push({ label: `"${key}" shorter than minLength (${fieldSchema.minLength})`, payload: { ...positive, [key]: tooShort } });
        }
        if (typeof fieldSchema.maxLength === 'number') {
            const tooLong = 'x'.repeat(fieldSchema.maxLength + 1);
            variants.push({ label: `"${key}" longer than maxLength (${fieldSchema.maxLength})`, payload: { ...positive, [key]: tooLong } });
        }
        if (typeof fieldSchema.pattern === 'string') {
            variants.push({ label: `"${key}" doesn't match pattern /${fieldSchema.pattern}/`, payload: { ...positive, [key]: valueViolatingPattern(fieldSchema.pattern) } });
        }
    }

    if (!variants.length) {
        const keys = Object.keys(props);
        if (keys.length) {
            variants.push({ label: `"${keys[0]}" has the wrong type (no required/minLength/maxLength/pattern declared to violate instead)`, payload: { ...positive, [keys[0]]: wrongTypeValue(deref(spec, props[keys[0]]).type) } });
        }
    }

    return variants;
}

// Tries a handful of "obviously wrong" candidate strings and returns the first one the regex
// itself actually rejects — safer than assuming any single fixed string violates an arbitrary
// pattern (some OpenAPI patterns are unanchored/permissive enough that a naive guess might
// accidentally still match).
function valueViolatingPattern(pattern) {
    let re;
    try { re = new RegExp(pattern); } catch { return 'INVALID_PATTERN_VALUE'; }
    const candidates = ['', '!!!invalid!!!', '   ', '???', 'INVALID_VALUE_1234567890'];
    for (const c of candidates) {
        if (!re.test(c)) return c;
    }
    return '￿'; // last-resort — vanishingly unlikely to match any realistic pattern
}

function wrongTypeValue(expectedType) {
    switch (expectedType) {
        case 'string': return 12345; // number instead of string
        case 'integer':
        case 'number': return 'not-a-number'; // string instead of number
        case 'boolean': return 'not-a-boolean'; // string instead of boolean
        case 'array': return { unexpected: 'object instead of array' };
        case 'object': return 'unexpected string instead of object';
        default: return null;
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

// A concrete, ready-to-use URL (real example values substituted for path/query params) — unlike
// buildUrlAndParams below, which is used by the actual import flow and deliberately leaves
// ${vars.x} templates in place for requests that get saved into this app. This one is for
// standalone output (e.g. the Swagger Payload Generator's scenario table) meant to be usable
// outside apitester entirely, so it needs to be self-contained.
export function concreteUrlFor(spec, op, baseUrl) {
    const pathParams = op.parameters.filter(p => p.in === 'path');
    const queryParams = op.parameters.filter(p => p.in === 'query');
    const exampleFor = (p) => exampleForSchema(spec, p.schema) ?? p.example ?? 'example';
    const path = op.path.replace(/\{([^}]+)\}/g, (_, name) => {
        const p = pathParams.find(pp => pp.name === name);
        return encodeURIComponent(String(p ? exampleFor(p) : 'example'));
    });
    const qs = queryParams
        .map(p => `${encodeURIComponent(p.name)}=${encodeURIComponent(String(exampleFor(p)))}`)
        .join('&');
    return baseUrl + path + (qs ? `?${qs}` : '');
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

export function requestBodyFor(spec, operation, parameters) {
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
