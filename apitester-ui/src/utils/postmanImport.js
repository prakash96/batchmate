import { readFileAsText } from './swaggerImport';

export { readFileAsText };

/** Postman variables use {{name}} — this tool's canonical syntax is ${vars.name}. */
function rewriteVars(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/\{\{([\w.-]+)\}\}/g, (_, name) => `\${vars.${name.replace(/[^a-zA-Z0-9_]/g, '_')}}`);
}

function urlToString(url) {
    if (typeof url === 'string') return url;
    if (!url) return '';
    if (url.raw) return url.raw;
    const host = Array.isArray(url.host) ? url.host.join('.') : (url.host || '');
    const path = Array.isArray(url.path) ? '/' + url.path.join('/') : (url.path || '');
    return host + path;
}

function paramsFromUrl(url) {
    if (url && Array.isArray(url.query)) {
        return url.query.map(q => ({ key: q.key, value: rewriteVars(q.value ?? ''), enabled: !q.disabled }));
    }
    return [];
}

function stripQueryFromRaw(raw, url) {
    // buildQueryString on the backend re-appends params[] itself — strip any "?..." from
    // the raw URL when we already extracted structured query params, to avoid duplicating them.
    if (url && Array.isArray(url.query) && url.query.length) {
        const q = raw.indexOf('?');
        return q >= 0 ? raw.slice(0, q) : raw;
    }
    return raw;
}

function headersFromPostman(header) {
    if (!Array.isArray(header)) return [];
    return header.map(h => ({ key: h.key, value: rewriteVars(h.value ?? ''), enabled: !h.disabled }));
}

function bodyFromPostman(body) {
    if (!body) return { bodyMode: 'raw-json', body: '' };
    switch (body.mode) {
        case 'raw':
            return { bodyMode: 'raw-json', body: rewriteVars(body.raw || '') };
        case 'urlencoded':
            return { bodyMode: 'raw-json', body: rewriteVars((body.urlencoded || []).map(p => `${p.key}=${p.value}`).join('&')) };
        case 'formdata':
            return { bodyMode: 'raw-json', body: rewriteVars(JSON.stringify(Object.fromEntries((body.formdata || []).map(p => [p.key, p.value])))) };
        default:
            return { bodyMode: 'raw-json', body: '' };
    }
}

function requestFromPostmanItem(item) {
    const req = item.request || {};
    const rawUrl = urlToString(req.url);
    const params = paramsFromUrl(req.url);
    const url = rewriteVars(stripQueryFromRaw(rawUrl, req.url));
    return {
        name: item.name || 'Imported request',
        preRequest: [],
        request: {
            method: (req.method || 'GET').toUpperCase(),
            url,
            params,
            headers: headersFromPostman(req.header),
            ...bodyFromPostman(req.body),
        },
        postResponse: [],
    };
}

/**
 * Recursively walks a Postman Collection v2.1 item[] tree. Nested "item" arrays become
 * folders; leaves with a "request" become requests. Collection-level variable[] entries
 * are returned separately so the caller can seed the new collection's variables.
 * Shape: { name, variables: {k:v}, folders: [{ name, requests: [...], folders: [...] }] }
 */
export function buildFoldersFromPostman(collectionJsonText) {
    const doc = JSON.parse(collectionJsonText);
    if (!doc || !Array.isArray(doc.item)) throw new Error('Not a Postman Collection (expected an "item" array)');

    const variables = {};
    (doc.variable || []).forEach(v => { if (v.key) variables[v.key] = v.value ?? ''; });

    function walk(items) {
        const requests = [];
        const folders = [];
        for (const item of items) {
            if (Array.isArray(item.item)) {
                const sub = walk(item.item);
                folders.push({ name: item.name || 'Folder', ...sub });
            } else if (item.request) {
                requests.push(requestFromPostmanItem(item));
            }
        }
        return { requests, folders };
    }

    return { name: doc.info?.name || 'Imported Collection', variables, ...walk(doc.item) };
}
