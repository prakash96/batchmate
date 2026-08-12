import jsyaml from 'js-yaml';

const NODE_SPACING_X = 160;
const NODE_START_X   = 60;
const NODE_Y         = 110;
const METHODS        = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

// ── Parse ─────────────────────────────────────────────────────────────────────

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

// ── $ref resolution ───────────────────────────────────────────────────────────

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

// ── Example value generation ──────────────────────────────────────────────────

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

// ── Spec-level helpers ────────────────────────────────────────────────────────

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

// Returns { headers: {...}, authVarNames: [...] } describing auth to bolt onto a request
function buildAuthHeaders(spec, operation) {
    const schemes = securitySchemesFor(spec, operation);
    const headers = {};
    const authVars = [];
    for (const scheme of schemes) {
        if (scheme.type === 'apiKey' && scheme.in === 'header') {
            headers[scheme.name] = `\${vars.${varNameFor(scheme.name)}}`;
            authVars.push({ name: varNameFor(scheme.name), example: 'REPLACE_ME' });
        } else if (scheme.type === 'http' && /bearer/i.test(scheme.scheme || '')) {
            headers['Authorization'] = '${vars.authToken}';
            authVars.push({ name: 'authToken', example: 'REPLACE_ME' });
        } else if (scheme.type === 'http' && /basic/i.test(scheme.scheme || '')) {
            headers['Authorization'] = '${vars.authToken}';
            authVars.push({ name: 'authToken', example: 'Basic REPLACE_ME' });
        } else if (scheme.type === 'oauth2') {
            headers['Authorization'] = '${vars.authToken}';
            authVars.push({ name: 'authToken', example: 'Bearer REPLACE_ME' });
        }
    }
    return { headers, authVars };
}

function varNameFor(rawName) {
    return String(rawName).replace(/[^a-zA-Z0-9_]/g, '_');
}

// ── Operation extraction ──────────────────────────────────────────────────────

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

// Body schema + example, supporting OpenAPI 3 requestBody and Swagger 2 "in: body" param
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

// ── Test-case generation ──────────────────────────────────────────────────────

function buildUrlExpr(baseUrl, path, queryParams, omitQueryNames) {
    let url = baseUrl + path.replace(/\{([^}]+)\}/g, (_, name) => `\${vars.${varNameFor(name)}}`);
    const include = queryParams.filter(p => !omitQueryNames?.has(p.name));
    if (include.length) {
        url += '?' + include.map(p => `${encodeURIComponent(p.name)}=\${vars.${varNameFor(p.name)}}`).join('&');
    }
    return url;
}

function buildSetVariableNode(entries) {
    return {
        type: 'setvariable',
        data: {
            name: 'Set Test Data',
            entries: entries.map(e => ({ name: e.name, expression: JSON.stringify(e.example ?? null) })),
        },
    };
}

function buildHttpNode(method, url, headerParams, extraHeaders, body) {
    const headers = { 'Content-Type': 'application/json' };
    headerParams.forEach(p => { headers[p.name] = `\${vars.${varNameFor(p.name)}}`; });
    Object.assign(headers, extraHeaders);
    return {
        type: 'http',
        data: {
            name: `${method} Request`,
            method,
            url,
            headers: JSON.stringify(headers),
            body: body !== undefined && body !== null ? JSON.stringify(body) : '',
        },
    };
}

function buildAssertionNode(name, statusCode, onFail = 'stop') {
    return {
        type: 'assertion',
        data: {
            name,
            logic: 'AND',
            conditions: [{ left: 'headers.httpResponseCode', operator: '==', right: String(statusCode) }],
            onFail,
        },
    };
}

function buildJsonCompareNode(expectedExample) {
    return {
        type: 'jsoncompare',
        data: {
            name: 'Verify Response Shape',
            leftSource: 'body', leftExpr: '',
            rightSource: 'literal', rightLiteral: JSON.stringify(expectedExample),
            mode: 'partial', ignoreArrayOrder: true,
            resultVar: '', onMismatch: 'continue',
        },
    };
}

/**
 * Builds one workflow (nodes/edges) per meaningful response code declared on an operation:
 * 2xx responses become a "happy path" test with valid example data; 4xx/5xx responses
 * become a best-effort negative test that tries to provoke that status.
 */
export function generateTestCasesForOperation(spec, op, baseUrl) {
    const { path, method, operation, parameters } = op;
    const pathParams  = parameters.filter(p => p.in === 'path');
    const queryParams = parameters.filter(p => p.in === 'query');
    const headerParams = parameters.filter(p => p.in === 'header');
    const requiredQuery = queryParams.filter(p => p.required);

    const body = requestBodyFor(spec, operation, parameters);
    const { headers: authHeaders, authVars } = buildAuthHeaders(spec, operation);

    const baseVarEntries = [
        ...pathParams.map(p => ({ name: varNameFor(p.name), example: exampleForSchema(spec, p.schema) ?? p.example ?? 'example' })),
        ...queryParams.map(p => ({ name: varNameFor(p.name), example: exampleForSchema(spec, p.schema) ?? p.example ?? 'example' })),
        ...headerParams.map(p => ({ name: varNameFor(p.name), example: exampleForSchema(spec, p.schema) ?? p.example ?? 'example' })),
        ...authVars,
    ];

    const responses = operation.responses || {};
    const cases = [];

    for (const [code, responseObj] of Object.entries(responses)) {
        const numeric = parseInt(code, 10);
        if (!Number.isFinite(numeric)) continue; // skip "default"

        if (numeric >= 200 && numeric < 300) {
            const expectedExample = responseExampleFor(spec, responseObj);
            const nodes = [
                buildSetVariableNode(baseVarEntries),
                buildHttpNode(method, buildUrlExpr(baseUrl, path, queryParams), headerParams, authHeaders, body?.example),
                buildAssertionNode(`Expect ${code}`, numeric),
            ];
            if (expectedExample) nodes.push(buildJsonCompareNode(expectedExample));
            cases.push({ label: `${code} ${deref(spec, responseObj).description || 'Success'} (happy path)`, nodes });
            continue;
        }

        if (numeric === 400 && (requiredQuery.length || body?.required)) {
            // Negative case: omit the first required query param, or send an empty body.
            const omit = requiredQuery.length ? new Set([requiredQuery[0].name]) : null;
            const nodes = [
                buildSetVariableNode(baseVarEntries),
                buildHttpNode(
                    method,
                    buildUrlExpr(baseUrl, path, queryParams, omit),
                    headerParams, authHeaders,
                    body?.required ? {} : body?.example,
                ),
                buildAssertionNode(`Expect ${code}`, numeric),
            ];
            cases.push({ label: `${code} ${deref(spec, responseObj).description || 'Bad Request'} (missing required ${omit ? 'query param' : 'body'})`, nodes });
            continue;
        }

        if ((numeric === 401 || numeric === 403) && authVars.length) {
            // Negative case: drop the auth header/token entirely.
            const nodes = [
                buildSetVariableNode(baseVarEntries.filter(v => !authVars.some(av => av.name === v.name))),
                buildHttpNode(method, buildUrlExpr(baseUrl, path, queryParams), headerParams, {}, body?.example),
                buildAssertionNode(`Expect ${code}`, numeric),
            ];
            cases.push({ label: `${code} ${deref(spec, responseObj).description || 'Unauthorized'} (missing credentials)`, nodes });
            continue;
        }

        if (numeric === 404 && pathParams.length) {
            // Negative case: use an obviously-invalid path parameter value.
            const overrides = baseVarEntries.map(v =>
                pathParams.some(p => varNameFor(p.name) === v.name) ? { ...v, example: '__does-not-exist__' } : v
            );
            const nodes = [
                buildSetVariableNode(overrides),
                buildHttpNode(method, buildUrlExpr(baseUrl, path, queryParams), headerParams, authHeaders, body?.example),
                buildAssertionNode(`Expect ${code}`, numeric),
            ];
            cases.push({ label: `${code} ${deref(spec, responseObj).description || 'Not Found'} (invalid id)`, nodes });
            continue;
        }

        // Fallback: still record the documented status as a placeholder test — status-only
        // assertion against the happy-path request, since we can't infer how to provoke it.
        const nodes = [
            buildSetVariableNode(baseVarEntries),
            buildHttpNode(method, buildUrlExpr(baseUrl, path, queryParams), headerParams, authHeaders, body?.example),
            buildAssertionNode(`Expect ${code} (TODO: adjust inputs to trigger this response)`, numeric, 'continue'),
        ];
        cases.push({ label: `${code} ${deref(spec, responseObj).description || 'Response'} (needs manual setup)`, nodes });
    }

    return cases;
}

// ── Node/edge graph assembly (mirrors packageExcel.js buildNodesAndEdges) ────

function assembleGraph(nodeSpecs) {
    const containerWidth = Math.max(760, NODE_START_X + nodeSpecs.length * NODE_SPACING_X + 100);
    const nodes = [{
        id: 'wc-processing', type: 'workflowcontainer', position: { x: 20, y: 0 },
        data: { containerType: 'processing' }, style: { width: containerWidth, height: 300 },
        draggable: true, selectable: true, deletable: false, zIndex: -1,
    }];
    const edges = [];
    let prevId = null;
    nodeSpecs.forEach(({ type, data }, i) => {
        const id = crypto.randomUUID();
        nodes.push({
            id, type, position: { x: NODE_START_X + i * NODE_SPACING_X, y: NODE_Y },
            data, style: { width: 58, height: 58 }, parentId: 'wc-processing', extent: 'parent', section: 'processing',
        });
        if (prevId) {
            edges.push({ id: `e-${prevId}-${id}`, source: prevId, target: id, animated: false, type: 'smoothstep', style: { stroke: '#888' } });
        }
        prevId = id;
    });
    return { nodes, edges };
}

/**
 * Parses an OpenAPI/Swagger document and returns packages grouped by tag, each containing
 * one generated workflow per test case (one per declared response code per operation).
 * Shape: [{ name: tagName, workflows: [{ name, nodes, edges }] }]
 */
export function buildPackagesFromSwagger(specText) {
    const spec = parseSwaggerText(specText);
    const baseUrl = getBaseUrl(spec);
    const operations = extractOperations(spec);

    const byTag = new Map();
    for (const op of operations) {
        const cases = generateTestCasesForOperation(spec, op, baseUrl);
        for (const tag of op.tags) {
            if (!byTag.has(tag)) byTag.set(tag, []);
            for (const c of cases) {
                const { nodes, edges } = assembleGraph(c.nodes);
                byTag.get(tag).push({
                    name: `${op.method} ${op.path} - ${c.label}`.slice(0, 120),
                    nodes, edges,
                });
            }
        }
    }

    return [...byTag.entries()].map(([name, workflows]) => ({ name, workflows }));
}
