import { useEffect, useMemo, useRef, useState } from 'react';
import { C, inputStyle, btnStyle, primaryBtnStyle } from '../theme';
import {
    parseSwaggerText, extractOperations, requestBodyFor, getBaseUrl, concreteUrlFor,
    exampleForSchema, negativeVariantsForSchema, readFileAsText,
} from '../utils/swaggerImport';
import { useCollectionStore } from '../store/collectionStore';
import { useTemplateStore } from '../store/templateStore';
import UnlockWorkspaceModal from './UnlockWorkspaceModal';

// DataWeave, not JS — see templating.xml's file comment. Only the NEGATIVE-variant request (see
// buildRequestsFromGroups below) uses this; the actual JSON for each negative scenario lives in
// that request's own Input Data Set entries — at run time, whichever entry the current iteration
// is on gets templated in here via the same "payload" binding templating.xml's eval-template
// already exposes for body access everywhere else in this app. The positive-scenario request
// doesn't need this at all — it just gets a concrete body directly, since there's only one.
const PAYLOAD_TEMPLATE = '$(payload)';

/** Standalone tool: paste/upload an OpenAPI/Swagger spec and get one combined table of test
 *  scenarios across EVERY operation in it (no per-operation picker) — a positive (schema-valid)
 *  row plus one negative row per violated required/minLength/maxLength/pattern rule for each
 *  operation's request body, each isolating exactly that one violation. Columns: URL / Scenario /
 *  Input Data. Reuses the exact same schema-example machinery buildFoldersFromSwagger's own
 *  import flow already relies on. Operations with no request body (GET, etc.) contribute no rows.
 *
 *  Creating requests (via the two buttons below the table) groups scenarios by operation (method
 *  + URL) into up to TWO requests per operation, not one per scenario: the positive scenario gets
 *  its own plain request with a concrete body, and every negative variant for that same operation
 *  shares one separate request via Input Data Set entries (PAYLOAD_TEMPLATE as the body; each
 *  run/iteration pulls its actual body from the current entry instead). */
export default function SwaggerPayloadModal({ onClose }) {
    const [specText, setSpecText] = useState('');
    const [spec, setSpec] = useState(null);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createResult, setCreateResult] = useState(null); // {message} shown inline after a create
    const [unlockPromptWs, setUnlockPromptWs] = useState(null); // locked workspace {id, name, locked} pending a password before "Create new collection" can proceed
    const fileInputRef = useRef(null);

    const {
        workspaces, folders, activeRequestId, fetchWorkspaces, importCollections,
        setWorkspaceExpanded, expandPathToCollection,
    } = useCollectionStore();
    const [targetWorkspaceId, setTargetWorkspaceId] = useState(null);
    const { templates, fetchTemplates } = useTemplateStore();
    // groupKind ('positive', 'general', or a dedicated field name like 'SOURCE_ID') -> templateId.
    // One picker per KIND, shared across every operation that produces it — see the group-kind
    // picker row below and its own comment for why (not one picker per literal request/operation).
    const [templateByGroup, setTemplateByGroup] = useState({});

    useEffect(() => { if (workspaces.length === 0) fetchWorkspaces(); }, []);
    useEffect(() => { if (templates.length === 0) fetchTemplates().catch(() => {}); }, []);

    // The collection containing whatever request is currently open in the main panel, if any —
    // "current collection" for the "Add to current collection" button below. Absent (no active
    // request, or it got closed) just disables that button rather than guessing a target.
    const currentCollection = useMemo(() => {
        function find(list) {
            for (const f of list) {
                if ((f.requests || []).some(r => r.id === activeRequestId)) return f;
                const found = find(f.folders || []);
                if (found) return found;
            }
            return null;
        }
        return activeRequestId ? find(folders) : null;
    }, [folders, activeRequestId]);

    // Defaults the workspace picker to the current collection's workspace once we know it;
    // otherwise the first workspace in the list. Only runs once (never overrides a user pick).
    useEffect(() => {
        if (targetWorkspaceId === null && workspaces.length > 0) {
            setTargetWorkspaceId(currentCollection?.workspaceId || workspaces[0].id);
        }
    }, [targetWorkspaceId, currentCollection, workspaces]);

    const loadSpec = (text) => {
        setSpecText(text);
        setError(null);
        setSpec(null);
        if (!text.trim()) return;
        try {
            const parsed = parseSwaggerText(text);
            const ops = extractOperations(parsed);
            if (!ops.length) throw new Error('No operations found in this spec.');
            setSpec(parsed);
        } catch (e) {
            setError(e.message);
        }
    };

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        try {
            loadSpec(await readFileAsText(file));
        } catch (e) {
            setError(e.message);
        }
    };

    // {rows, totalOps, skippedCount} — skippedCount is operations with no request body (GET,
    // etc.), which contribute no scenario rows since there's no body to generate positive/
    // negative examples for.
    const { rows, totalOps, skippedCount } = useMemo(() => {
        if (!spec) return { rows: [], totalOps: 0, skippedCount: 0 };
        const baseUrl = getBaseUrl(spec);
        const ops = extractOperations(spec);
        const out = [];
        let skipped = 0;
        for (const op of ops) {
            const body = requestBodyFor(spec, op.operation, op.parameters);
            if (!body?.schema) { skipped++; continue; }
            const url = concreteUrlFor(spec, op, baseUrl);
            const positive = exampleForSchema(spec, body.schema);
            out.push({ url, method: op.method, scenario: 'Positive (schema-valid)', input: positive, isPositive: true, group: 'general' });
            for (const v of negativeVariantsForSchema(spec, body.schema)) {
                out.push({ url, method: op.method, scenario: v.label, input: v.payload, isPositive: false, group: v.group || 'general' });
            }
        }
        return { rows: out, totalOps: ops.length, skippedCount: skipped };
    }, [spec]);

    // Same rows, grouped by operation (method+url) — one group per operation, split into its
    // single positive scenario and its negative variants, which are further split by their OWN
    // "group" tag (see negativeVariantsForSchema's own comment): 'general' for the generic
    // required/minLength/maxLength/pattern violations, or a specific field's name (currently
    // SOURCE_ID/REQUEST_REFERENCE_NUMBER) for that field's own dedicated variants — each distinct
    // group becomes its OWN separate request below, not one shared "(negative)" request covering
    // everything. Used by "create requests" below and by the Apitester-format export (both create
    // real Apitester request objects); the on-screen table/Excel export stay flat (one row per
    // scenario) since those are for human review, not for round-tripping.
    const groupedByOperation = useMemo(() => {
        const map = new Map();
        for (const r of rows) {
            const key = `${r.method} ${r.url}`;
            if (!map.has(key)) map.set(key, { method: r.method, url: r.url, positive: null, negativesByGroup: new Map() });
            const g = map.get(key);
            if (r.isPositive) { g.positive = r; continue; }
            const groupKey = r.group || 'general';
            if (!g.negativesByGroup.has(groupKey)) g.negativesByGroup.set(groupKey, []);
            g.negativesByGroup.get(groupKey).push(r);
        }
        return [...map.values()];
    }, [rows]);

    // Every distinct group KIND seen across every operation — 'positive' plus whatever
    // negativesByGroup keys show up ('general', and any dedicated field names). One template
    // picker per kind (below), shared across all operations that produce it, rather than one per
    // individual operation — a spec with 20 operations would otherwise need 20 near-identical
    // pickers per kind for no real benefit; picking a template for "SOURCE_ID" once applies it to
    // every operation's SOURCE_ID request.
    const groupKinds = useMemo(() => {
        const kinds = new Set();
        for (const g of groupedByOperation) {
            if (g.positive) kinds.add('positive');
            for (const k of g.negativesByGroup.keys()) kinds.add(k);
        }
        // 'positive' and 'general' first (most common), then the rest alphabetically.
        return [...kinds].sort((a, b) => {
            const rank = (k) => (k === 'positive' ? 0 : k === 'general' ? 1 : 2);
            return rank(a) - rank(b) || a.localeCompare(b);
        });
    }, [groupedByOperation]);

    const groupKindLabel = (kind) => (kind === 'positive' ? 'Positive' : kind === 'general' ? 'General negative' : kind);

    // Template's preRequest is PREPENDED before the entry's own (empty, for every generated
    // scenario here) preRequest; postResponse is APPENDED after — see templates-api.xml's own
    // comment on this exact merge choice.
    const applyTemplate = (entry, kind) => {
        const templateId = templateByGroup[kind];
        const tpl = templateId ? templates.find(t => t.id === templateId) : null;
        if (!tpl) return entry;
        return {
            ...entry,
            preRequest: [...(tpl.preRequest || []), ...(entry.preRequest || [])],
            postResponse: [...(entry.postResponse || []), ...(tpl.postResponse || [])],
        };
    };

    // Several DIFFERENT requests per operation, not one shared request: the positive scenario
    // gets its own plain request with a concrete body (nothing to iterate, so no Input Data Set
    // at all); every negative variant still reaches its target via Input Data Set entries +
    // PAYLOAD_TEMPLATE, but now ONE separate request PER GROUP — the generic violations in
    // "(negative)", and SOURCE_ID/REQUEST_REFERENCE_NUMBER each in their own
    // "(negative - <field>)" request, so a field important enough to get dedicated scenarios also
    // gets reviewed on its own instead of buried in a long list of unrelated field violations.
    const buildRequestsFromGroups = (groups) => {
        const out = [];
        for (const g of groups) {
            if (g.positive) {
                out.push(applyTemplate({
                    name: `${g.method} ${g.url} (positive)`.slice(0, 120),
                    preRequest: [],
                    request: {
                        method: g.method, url: g.url, params: [],
                        headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
                        bodyMode: 'raw-json', body: JSON.stringify(g.positive.input, null, 2),
                    },
                    postResponse: [],
                    inputDataSets: [],
                }, 'positive'));
            }
            for (const [groupKey, negatives] of g.negativesByGroup) {
                if (!negatives.length) continue;
                const suffix = groupKey === 'general' ? 'negative' : `negative - ${groupKey}`;
                out.push(applyTemplate({
                    name: `${g.method} ${g.url} (${suffix})`.slice(0, 120),
                    preRequest: [],
                    request: {
                        method: g.method, url: g.url, params: [],
                        headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
                        bodyMode: 'raw-json', body: PAYLOAD_TEMPLATE, inputSource: 'dataset',
                    },
                    postResponse: [],
                    inputDataSets: negatives.map(s => ({ name: s.scenario, body: JSON.stringify(s.input, null, 2), headers: [] })),
                }, groupKey));
            }
        }
        return out;
    };

    // For the "N requests" count shown next to the create buttons.
    const requestCount = useMemo(() => buildRequestsFromGroups(groupedByOperation).length, [groupedByOperation]);

    const addToCurrentCollection = async () => {
        if (!currentCollection) return;
        setCreating(true);
        setCreateResult(null);
        try {
            const requests = buildRequestsFromGroups(groupedByOperation);
            await importCollections(currentCollection.workspaceId, currentCollection.id, true, [{ name: 'ignored', requests, folders: [] }]);
            // The current collection might be sitting collapsed in the sidebar (or nested under
            // a collapsed ancestor) without this having any visible effect there — force the
            // whole path open so the new requests aren't invisible until a reload.
            expandPathToCollection(currentCollection.workspaceId, currentCollection.id);
            setCreateResult({ ok: true, message: `Added ${requests.length} request${requests.length === 1 ? '' : 's'} to "${currentCollection.name}".` });
        } catch (err) {
            setCreateResult({ ok: false, message: 'Failed to add requests: ' + err.message });
        } finally {
            setCreating(false);
        }
    };

    // The password gate: if the picked workspace is locked, prompt for it (via the same modal
    // CollectionTree's own 🔒 rows use) and only proceed to actually create the collection once
    // that succeeds — unlockWorkspace merges its real collection tree in too, matching what
    // clicking 🔓 Unlock in the sidebar does.
    const addToNewCollection = () => {
        if (!targetWorkspaceId) {
            setCreateResult({ ok: false, message: 'Pick a workspace first.' });
            return;
        }
        const targetWs = workspaces.find(w => w.id === targetWorkspaceId);
        if (targetWs?.locked) {
            setUnlockPromptWs(targetWs);
            return;
        }
        createCollectionNow();
    };

    const createCollectionNow = async () => {
        const defaultName = spec?.info?.title ? `${spec.info.title} — Swagger Scenarios` : 'Swagger Scenarios';
        const name = window.prompt('New collection name', defaultName);
        if (!name) return;
        setCreating(true);
        setCreateResult(null);
        try {
            const requests = buildRequestsFromGroups(groupedByOperation);
            await importCollections(targetWorkspaceId, null, false, [{ name, requests, folders: [] }]);
            // The target workspace might be sitting collapsed in the sidebar — force it open so
            // the new collection isn't invisible there until a reload.
            setWorkspaceExpanded(targetWorkspaceId, true);
            setCreateResult({ ok: true, message: `Created "${name}" with ${requests.length} request${requests.length === 1 ? '' : 's'}.` });
        } catch (err) {
            setCreateResult({ ok: false, message: 'Failed to create collection: ' + err.message });
        } finally {
            setCreating(false);
        }
    };

    const copyTable = async () => {
        const escape = (s) => String(s).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
        const lines = [['URL', 'Scenario', 'Input Data'].join('\t')]
            .concat(rows.map(r => [r.url, r.scenario, JSON.stringify(r.input)].map(escape).join('\t')));
        await navigator.clipboard?.writeText(lines.join('\n'));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    // Client-side .xlsx generation — no backend round-trip, consistent with this being a
    // standalone tool (ExcelJS runs entirely in the browser). Dynamically imported rather than
    // a top-level import — ExcelJS is a large library (~1MB), and bundling it into the main
    // chunk would make everyone pay that download on every page load just for one export
    // button; this way it's only fetched the first time someone actually clicks it. Positive/
    // negative rows get the same green/red fill the on-screen table and the Run All Excel
    // report already use, so it reads the same way whichever surface produced it.
    const exportExcel = async () => {
        setExporting(true);
        try {
            const { default: ExcelJS } = await import('exceljs');
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Scenarios');
            sheet.columns = [
                { header: 'URL', key: 'url', width: 50 },
                { header: 'Scenario', key: 'scenario', width: 45 },
                { header: 'Input Data', key: 'input', width: 60 },
            ];
            const headerRow = sheet.getRow(1);
            headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };

            rows.forEach(r => {
                const row = sheet.addRow({ url: r.url, scenario: r.scenario, input: JSON.stringify(r.input, null, 2) });
                row.getCell('scenario').font = { bold: true, color: { argb: r.isPositive ? 'FF1E7E34' : 'FFB00020' } };
                row.getCell('scenario').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: r.isPositive ? 'FF92D050' : 'FFFFC7CE' } };
                row.getCell('input').alignment = { wrapText: true, vertical: 'top' };
                row.getCell('url').alignment = { wrapText: true, vertical: 'top' };
            });

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const dlUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = dlUrl;
            a.download = 'swagger-scenarios.xlsx';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(dlUrl);
        } finally {
            setExporting(false);
        }
    };

    const downloadJson = (data, filename) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const dlUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = dlUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(dlUrl);
    };

    // Postman Collection v2.1 — one request item per scenario row, importable straight into
    // Postman (Import > File). Just {raw: url} for the url field rather than the fully-parsed
    // host/path/query breakdown Postman also accepts — simpler, and Postman renders/uses a raw
    // url string just fine.
    const exportPostman = () => {
        const collection = {
            info: {
                name: spec?.info?.title ? `${spec.info.title} — Swagger Scenarios` : 'Swagger Scenarios',
                schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
            },
            item: rows.map(r => ({
                name: r.scenario,
                request: {
                    method: r.method,
                    header: [{ key: 'Content-Type', value: 'application/json' }],
                    body: { mode: 'raw', raw: JSON.stringify(r.input, null, 2), options: { raw: { language: 'json' } } },
                    url: { raw: r.url },
                },
            })),
        };
        downloadJson(collection, 'swagger-scenarios.postman_collection.json');
    };

    // Apitester's own collection/request shape (same {name, requests:[{name, request:{...},
    // inputDataSets:[...]}]} shape import-collections/buildFoldersFromSwagger already produce),
    // so this stays consistent with — and can feed straight back into — that same import path.
    // A handful of requests per operation, not one per scenario (see groupedByOperation/
    // buildRequestsFromGroups above) — positive, general-negative, and one per dedicated field
    // group each land as their own request, with every scenario in that group as one of its own
    // Input Data Set entries.
    const exportApitesterFormat = () => {
        const folder = {
            name: spec?.info?.title || 'Swagger Scenarios',
            requests: buildRequestsFromGroups(groupedByOperation),
        };
        downloadJson([folder], 'swagger-scenarios.apitester.json');
    };

    return (
        <div className="at-overlay" style={overlayStyle}>
            <div className="at-modal" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: C.radius, boxShadow: C.shadowLg, width: 840, maxHeight: '85vh', overflowY: 'auto', padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Swagger Payload Generator</span>
                    <button onClick={onClose} style={btnStyle}>Close</button>
                </div>
                <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 14 }}>
                    Paste or upload an OpenAPI/Swagger spec and get one table of test scenarios across every operation —
                    a positive (schema-valid) row plus one negative row per violated <code style={{ color: C.textDim }}>required</code>/<code style={{ color: C.textDim }}>minLength</code>/<code style={{ color: C.textDim }}>maxLength</code>/<code style={{ color: C.textDim }}>pattern</code> rule on each operation's request body.
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <button onClick={() => fileInputRef.current?.click()} style={btnStyle}>⇩ Upload file</button>
                    <input ref={fileInputRef} type="file" accept=".json,.yaml,.yml" style={{ display: 'none' }} onChange={handleFile} />
                    <span style={{ fontSize: 10, color: C.textFaint, alignSelf: 'center' }}>or paste it below</span>
                </div>
                <textarea
                    style={{ ...inputStyle, width: '100%', minHeight: 100, fontFamily: C.mono, fontSize: 11, resize: 'vertical', marginBottom: 10 }}
                    placeholder="Paste an OpenAPI/Swagger document (JSON or YAML)…"
                    value={specText}
                    onChange={e => loadSpec(e.target.value)}
                />

                {error && <div style={{ fontSize: 12, color: C.danger, marginBottom: 10 }}>{error}</div>}

                {spec && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 10, color: C.textFaint }}>
                                {rows.length} scenario{rows.length === 1 ? '' : 's'} across {totalOps - skippedCount} operation{(totalOps - skippedCount) === 1 ? '' : 's'}
                                {skippedCount > 0 ? ` (${skippedCount} skipped — no request body)` : ''}
                            </span>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button onClick={copyTable} style={btnStyle} disabled={!rows.length}>{copied ? '✓ Copied' : '📋 Copy table'}</button>
                                <button onClick={exportExcel} style={btnStyle} disabled={!rows.length || exporting}>{exporting ? 'Exporting…' : '⬇ Excel'}</button>
                                <button onClick={exportPostman} style={btnStyle} disabled={!rows.length}>⬇ Postman Collection</button>
                                <button onClick={exportApitesterFormat} style={btnStyle} disabled={!rows.length}>⬇ Apitester format</button>
                            </div>
                        </div>

                        {groupKinds.length > 0 && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10,
                                padding: 10, border: `1px solid ${C.border}`, borderRadius: C.radiusSm, background: C.surface,
                            }}>
                                <span style={{ fontSize: 10, color: C.textFaint, fontWeight: 700, letterSpacing: '0.03em' }}>TEMPLATE PER SCENARIO</span>
                                {groupKinds.map(kind => (
                                    <label key={kind} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.textDim }}>
                                        {groupKindLabel(kind)}
                                        <select
                                            style={{ ...inputStyle, padding: '3px 6px', fontSize: 11 }}
                                            value={templateByGroup[kind] || ''}
                                            onChange={e => setTemplateByGroup(m => ({ ...m, [kind]: e.target.value }))}
                                        >
                                            <option value="">No template</option>
                                            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                    </label>
                                ))}
                            </div>
                        )}

                        {rows.length > 0 && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10,
                                padding: 10, border: `1px solid ${C.border}`, borderRadius: C.radiusSm, background: C.surface,
                            }}>
                                <span style={{ fontSize: 10, color: C.textFaint, fontWeight: 700, letterSpacing: '0.03em' }}>CREATE REQUESTS</span>
                                <span style={{ fontSize: 10, color: C.textFaint }}>
                                    ({requestCount} request{requestCount === 1 ? '' : 's'} — one plain request per operation for its positive scenario, plus one more per operation with every negative variant as an Input Data Set entry)
                                </span>
                                <button
                                    onClick={addToCurrentCollection} style={btnStyle}
                                    disabled={creating || !currentCollection}
                                    title={currentCollection ? `Add into "${currentCollection.name}"` : 'Open a request first so there is a "current collection" to add into'}
                                >
                                    {creating ? 'Adding…' : `📥 Add to current collection${currentCollection ? ` (${currentCollection.name})` : ''}`}
                                </button>
                                <span style={{ fontSize: 10, color: C.textFaint }}>or</span>
                                <select
                                    style={{ ...inputStyle, padding: '4px 6px', fontSize: 11 }}
                                    value={targetWorkspaceId ?? ''}
                                    onChange={e => setTargetWorkspaceId(e.target.value)}
                                    title="Workspace the new collection will be created in"
                                >
                                    {workspaces.length === 0 && <option value="">No workspaces yet</option>}
                                    {workspaces.map(ws => <option key={ws.id} value={ws.id}>{ws.locked ? '🔒 ' : ''}{ws.name}</option>)}
                                </select>
                                <button onClick={addToNewCollection} style={primaryBtnStyle} disabled={creating || !targetWorkspaceId}>
                                    {creating ? 'Creating…' : '📁 Create new collection'}
                                </button>
                            </div>
                        )}
                        {createResult && (
                            <div style={{ fontSize: 11, color: createResult.ok ? C.success : C.danger, marginBottom: 10 }}>
                                {createResult.ok ? '✓ ' : ''}{createResult.message}
                            </div>
                        )}

                        {rows.length === 0 ? (
                            <div style={{ fontSize: 11, color: C.textFaint, fontStyle: 'italic' }}>No operations with a request body were found in this spec.</div>
                        ) : (
                            <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: C.radiusSm }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                    <thead>
                                        <tr>
                                            <th style={thStyle}>URL</th>
                                            <th style={thStyle}>Scenario</th>
                                            <th style={thStyle}>Input Data</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((r, i) => (
                                            <tr key={i} style={{ background: i % 2 ? C.surface : 'transparent' }}>
                                                <td style={{ ...tdStyle, fontFamily: C.mono, color: C.textDim, wordBreak: 'break-all' }}>{r.url}</td>
                                                <td style={{ ...tdStyle, color: r.isPositive ? C.success : C.danger, fontWeight: 600 }}>{r.scenario}</td>
                                                <td style={tdStyle}>
                                                    <pre style={{ margin: 0, fontFamily: C.mono, fontSize: 11, whiteSpace: 'pre-wrap' }}>{JSON.stringify(r.input, null, 2)}</pre>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
            {unlockPromptWs && (
                <UnlockWorkspaceModal
                    workspace={unlockPromptWs}
                    onClose={() => setUnlockPromptWs(null)}
                    onUnlocked={createCollectionNow}
                />
            )}
        </div>
    );
}

const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
};

const thStyle = { textAlign: 'left', padding: '6px 10px', fontSize: 10, fontWeight: 700, color: C.textFaint, letterSpacing: '0.03em', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: C.panel };
const tdStyle = { padding: '8px 10px', verticalAlign: 'top', borderBottom: `1px solid ${C.borderLo}` };
