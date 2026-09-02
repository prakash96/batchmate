import { useEffect, useRef, useState } from 'react';
import { useCollectionStore } from '../../store/collectionStore';
import { useTemplateStore } from '../../store/templateStore';
import { C, btnStyle, inputStyle, methodBadgeStyle } from '../../theme';
import { readFileAsText, buildFoldersFromSwagger } from '../../utils/swaggerImport';
import { buildFoldersFromPostman } from '../../utils/postmanImport';
import { applyTemplateInput } from '../../utils/templateApply';
import RunAllReportModal from '../RunAllReportModal';
import UnlockWorkspaceModal from '../UnlockWorkspaceModal';

// Custom MIME type so drop targets can tell a request row is what's being dragged
// (as opposed to, say, a browser-native file/text drag) before touching dataTransfer.
const DRAG_MIME = 'application/x-apitester-request';

export default function CollectionTree() {
    const { folders, workspaces, fetchCollections, fetchWorkspaces, addWorkspace, importCollections, setActiveRequest, expandPathToCollection } = useCollectionStore();
    const [importing, setImporting] = useState(false);
    const postmanInputRef = useRef(null);
    const swaggerInputRef = useRef(null);
    const apitesterInputRef = useRef(null);
    // { workspaceId, parentId } — parentId null means "root of this workspace". Collections now
    // always belong to a workspace (see collectionStore's addCollection), so import needs both.
    const [importTarget, setImportTarget] = useState(null);
    const [clipboard, setClipboard] = useState(null); // full request object last "copied"
    const [reportTarget, setReportTarget] = useState(null); // {id, name, autoRun} for RunAllReportModal
    const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
    const [unlockTarget, setUnlockTarget] = useState(null); // locked workspace {id, name} being unlocked
    const [newRequestTarget, setNewRequestTarget] = useState(null); // {folderId} for NewRequestModal

    useEffect(() => { fetchWorkspaces(); fetchCollections(); }, []);

    // Paste target can be any folder (including the request's own current one — duplicates
    // it in place). Reuses createAndSaveRequest, same helper the importers already use.
    const pasteRequest = async (folderId) => {
        if (!clipboard) return;
        const pasted = await createAndSaveRequest(folderId, {
            name: `${clipboard.name} (copy)`,
            preRequest: clipboard.preRequest, request: clipboard.request, postResponse: clipboard.postResponse,
        });
        setActiveRequest(pasted.id);
    };

    const triggerImport = (workspaceId, parentId, kind) => {
        setImportTarget({ workspaceId, parentId });
        const ref = kind === 'postman' ? postmanInputRef : kind === 'apitester' ? apitesterInputRef : swaggerInputRef;
        ref.current?.click();
    };

    // Every import handler below parses the file client-side (same parsers as before — the only
    // thing that moved to the backend is "create everything in the DB") into one or more
    // {name, variables?, requests?, folders?} root nodes, then hands the WHOLE tree to
    // importCollections in one call — collections-api.xml's import-collections does the
    // recursive insert loop that used to be N sequential addCollection/addRequestToCollection/
    // saveRequest round trips from here.
    const handlePostmanFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        setImporting(true);
        try {
            const text = await readFileAsText(file);
            const parsed = buildFoldersFromPostman(text);
            const { workspaceId, parentId } = importTarget;
            const result = await importCollections(workspaceId, parentId, false, [parsed]);
            if (result.requestsCreated === 0) alert('No requests were found in this file.');
            expandPathToCollection(workspaceId, parentId);
        } catch (err) {
            console.error('Postman import failed:', err);
            alert('Postman import failed: ' + err.message);
        } finally {
            setImporting(false);
        }
    };

    const handleSwaggerFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        setImporting(true);
        try {
            const { workspaceId, parentId } = importTarget;
            const text = await readFileAsText(file);
            const tagGroups = buildFoldersFromSwagger(text).filter(g => g.requests.length > 0);
            if (tagGroups.length === 0) {
                alert('No operations with response definitions were found in this spec.');
                return;
            }
            // Only flatten straight into parentId (no wrapper collection) when it's a REAL
            // existing collection AND there's exactly one group — see import-collections'
            // mergeIntoParent contract.
            const mergeIntoParent = parentId != null && tagGroups.length === 1;
            await importCollections(workspaceId, parentId, mergeIntoParent, tagGroups);
            expandPathToCollection(workspaceId, parentId);
        } catch (err) {
            console.error('Swagger import failed:', err);
            alert('Swagger import failed: ' + err.message);
        } finally {
            setImporting(false);
        }
    };

    // Apitester's own exported format — [{name, requests:[{name, preRequest, request,
    // postResponse}], folders?}], the exact shape SwaggerPayloadModal's "Apitester format" export
    // (and buildFoldersFromSwagger's own tag-grouped output) already produces. Same
    // one-collection-per-group / flatten-if-just-one-group rule handleSwaggerFile above uses.
    const handleApitesterFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        setImporting(true);
        try {
            const { workspaceId, parentId } = importTarget;
            const text = await readFileAsText(file);
            const parsed = JSON.parse(text);
            const groups = (Array.isArray(parsed) ? parsed : [parsed])
                .filter(g => g && typeof g === 'object' && (g.requests || []).length > 0);
            if (groups.length === 0) {
                alert('No requests were found in this file.');
                return;
            }
            const mergeIntoParent = parentId != null && groups.length === 1;
            await importCollections(workspaceId, parentId, mergeIntoParent, groups);
            expandPathToCollection(workspaceId, parentId);
        } catch (err) {
            console.error('Apitester-format import failed:', err);
            alert('Import failed: ' + err.message);
        } finally {
            setImporting(false);
        }
    };

    async function createAndSaveRequest(collectionId, req) {
        const { addRequestToCollection, saveRequest } = useCollectionStore.getState();
        const created = await addRequestToCollection(collectionId, req.name);
        const full = { ...created, preRequest: req.preRequest, request: req.request, postResponse: req.postResponse };
        await saveRequest(full);
        return full;
    }

    // Collections whose workspace no longer exists — delete-workspace detaches (workspace_id =
    // NULL) rather than deleting them, so without this bucket they'd be invisible in the tree.
    const unassigned = folders.filter(f => !f.workspaceId);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 10px 6px', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: '0.04em' }}>WORKSPACES</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    {clipboard && (
                        <span style={{
                            fontSize: 10, fontWeight: 600, color: C.accent, background: C.accentDim, borderRadius: 10,
                            padding: '2px 4px 2px 8px', display: 'flex', alignItems: 'center', gap: 4, minWidth: 0,
                        }} title={`Copied "${clipboard.name}" — click a folder's 📌 to paste`}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>📋 {clipboard.name}</span>
                            <button
                                onClick={() => setClipboard(null)}
                                title="Clear clipboard"
                                style={{ background: 'none', border: 'none', color: C.accent, cursor: 'pointer', fontSize: 11, padding: '0 2px', lineHeight: 1 }}
                            >✕</button>
                        </span>
                    )}
                    <button onClick={() => setNewWorkspaceOpen(true)} style={{ ...btnStyle, padding: '3px 8px' }} title="New workspace">+ws</button>
                </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px 10px' }}>
                {workspaces.map(ws => (
                    <WorkspaceRow
                        key={ws.id} workspace={ws}
                        collections={folders.filter(f => f.workspaceId === ws.id)}
                        importing={importing}
                        onUnlock={setUnlockTarget}
                        onImport={(kind) => triggerImport(ws.id, null, kind)}
                        onCopy={setClipboard} onPaste={pasteRequest} hasClipboard={!!clipboard}
                        onReport={(folder, autoRun) => setReportTarget({ id: folder.id, name: folder.name, autoRun })}
                        onAddRequest={(folder) => setNewRequestTarget({ folderId: folder.id })}
                    />
                ))}
                {unassigned.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                        <div style={{ fontSize: 10, color: C.textFaint, padding: '5px 6px', letterSpacing: '0.04em' }} title="Collections whose workspace was deleted">
                            UNASSIGNED
                        </div>
                        {unassigned.map(f => (
                            <FolderRow
                                key={f.id} folder={f} depth={0}
                                onCopy={setClipboard} onPaste={pasteRequest} hasClipboard={!!clipboard}
                                onReport={(folder, autoRun) => setReportTarget({ id: folder.id, name: folder.name, autoRun })}
                                onAddRequest={(folder) => setNewRequestTarget({ folderId: folder.id })}
                            />
                        ))}
                    </div>
                )}
            </div>
            <input ref={postmanInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handlePostmanFile} />
            <input ref={swaggerInputRef} type="file" accept=".json,.yaml,.yml" style={{ display: 'none' }} onChange={handleSwaggerFile} />
            <input ref={apitesterInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleApitesterFile} />
            {reportTarget && (
                <RunAllReportModal
                    collectionId={reportTarget.id}
                    collectionName={reportTarget.name}
                    autoRun={reportTarget.autoRun}
                    onClose={() => setReportTarget(null)}
                />
            )}
            {newWorkspaceOpen && (
                <NewWorkspaceModal
                    onClose={() => setNewWorkspaceOpen(false)}
                    onCreate={async (name, password) => {
                        await addWorkspace(name, password);
                        setNewWorkspaceOpen(false);
                    }}
                />
            )}
            {unlockTarget && (
                <UnlockWorkspaceModal
                    workspace={unlockTarget}
                    onClose={() => setUnlockTarget(null)}
                />
            )}
            {newRequestTarget && (
                <NewRequestModal
                    onClose={() => setNewRequestTarget(null)}
                    onCreate={async (name, templateId) => {
                        const { addRequestToCollection, saveRequest } = useCollectionStore.getState();
                        const created = await addRequestToCollection(newRequestTarget.folderId, name);
                        if (templateId) {
                            const { templates } = useTemplateStore.getState();
                            const tpl = templates.find(t => t.id === templateId);
                            if (tpl) {
                                // A brand-new request's own preRequest/postResponse start empty, so
                                // applying a template here is just setting them to its arrays — no
                                // prepend/append merge needed the way SwaggerPayloadModal's
                                // already-populated generated scenarios require. Input (body/
                                // headers) applies the same way — see applyTemplateInput's own
                                // comment for the 'replace' vs 'merge' distinction.
                                await saveRequest({
                                    ...created,
                                    preRequest: tpl.preRequest,
                                    postResponse: tpl.postResponse,
                                    request: applyTemplateInput(created.request, tpl, 'replace'),
                                });
                            }
                        }
                        setActiveRequest(created.id);
                        setNewRequestTarget(null);
                    }}
                />
            )}
        </div>
    );
}

function WorkspaceRow({ workspace, collections, importing, onUnlock, onImport, onCopy, onPaste, hasClipboard, onReport, onAddRequest }) {
    const [showImportMenu, setShowImportMenu] = useState(false);
    const { addCollection, renameWorkspace, deleteWorkspace, expandedWorkspaces, setWorkspaceExpanded } = useCollectionStore();
    // Lifted into the store (not local useState) so anything created here from elsewhere — e.g.
    // SwaggerPayloadModal's "create collection" button — can force this open; absent = expanded.
    const open = expandedWorkspaces[workspace.id] !== false;
    const locked = !!workspace.locked;

    const addRootCollection = async (e) => {
        e.stopPropagation();
        const name = window.prompt('Collection name', 'New Collection');
        if (name) {
            await addCollection(name, null, workspace.id);
            setWorkspaceExpanded(workspace.id, true);
        }
    };
    const rename = async (e) => {
        e.stopPropagation();
        const name = window.prompt('Rename', workspace.name);
        if (name) await renameWorkspace(workspace.id, name);
    };
    const remove = async (e) => {
        e.stopPropagation();
        if (window.confirm(`Delete workspace "${workspace.name}"? Its collections will become unassigned, not deleted.`)) {
            await deleteWorkspace(workspace.id);
        }
    };

    return (
        <div style={{ marginBottom: 4 }}>
            <div
                onClick={() => locked ? onUnlock(workspace) : setWorkspaceExpanded(workspace.id, !open)}
                title={locked ? 'Password-protected — click to unlock' : undefined}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '5px 6px', borderRadius: 4, cursor: 'pointer', gap: 4, background: 'transparent',
                }}
                onMouseEnter={e => e.currentTarget.style.background = C.surface}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
                <span style={{ fontSize: 12, fontWeight: 600, color: locked ? C.textDim : C.text, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                    <span style={{ fontSize: 9, color: C.textFaint }}>{locked ? '🔒' : open ? '▾' : '▸'}</span>
                    🗂 {workspace.name}
                </span>
                {locked ? (
                    <IconBtn title="Unlock" onClick={e => { e.stopPropagation(); onUnlock(workspace); }}>🔓 Unlock</IconBtn>
                ) : (
                    <span style={{ display: 'flex', gap: 3, position: 'relative' }}>
                        <IconBtn title="Import into this workspace" onClick={e => { e.stopPropagation(); setShowImportMenu(o => !o); }}>
                            {importing ? '…' : '⇩'}
                        </IconBtn>
                        {showImportMenu && (
                            <div style={{
                                position: 'absolute', right: 0, top: '100%', zIndex: 10, background: C.panel,
                                border: `1px solid ${C.border}`, borderRadius: C.radiusSm, minWidth: 170, boxShadow: C.shadowLg,
                            }}>
                                <MenuItem onClick={() => { setShowImportMenu(false); onImport('postman'); }}>Import Postman Collection</MenuItem>
                                <MenuItem onClick={() => { setShowImportMenu(false); onImport('swagger'); }}>Import Swagger / OpenAPI</MenuItem>
                                <MenuItem onClick={() => { setShowImportMenu(false); onImport('apitester'); }}>Import Apitester Format</MenuItem>
                            </div>
                        )}
                        <IconBtn title="New collection" onClick={addRootCollection}>+col</IconBtn>
                        <IconBtn title="Rename" onClick={rename}>✎</IconBtn>
                        <IconBtn title="Delete" onClick={remove}>🗑</IconBtn>
                    </span>
                )}
            </div>
            {open && !locked && (
                <div style={{ marginLeft: 10 }}>
                    {collections.map(f => (
                        <FolderRow
                            key={f.id} folder={f} depth={0}
                            onCopy={onCopy} onPaste={onPaste} hasClipboard={hasClipboard} onReport={onReport}
                            onAddRequest={onAddRequest}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function FolderRow({ folder, depth, onCopy, onPaste, hasClipboard, onReport, onAddRequest }) {
    const [dragOver, setDragOver] = useState(false);
    const {
        addRequestToCollection, addCollection, renameCollection, deleteCollection, moveRequest,
        setActiveRequest, activeRequestId, expandedFolders, setFolderExpanded,
    } = useCollectionStore();
    // Lifted into the store (not local useState) — see WorkspaceRow's own comment on why.
    const open = expandedFolders[folder.id] !== false;

    const addSubfolder = async (e) => {
        e.stopPropagation();
        const name = window.prompt('Collection name', 'New Collection');
        if (name) {
            await addCollection(name, folder.id, folder.workspaceId);
            setFolderExpanded(folder.id, true);
        }
    };
    const addRequest = (e) => {
        e.stopPropagation();
        onAddRequest(folder);
    };
    const rename = async (e) => {
        e.stopPropagation();
        const name = window.prompt('Rename', folder.name);
        if (name) await renameCollection(folder.id, name);
    };
    const runAll = (e) => { e.stopPropagation(); onReport(folder, true); };
    const showReport = (e) => { e.stopPropagation(); onReport(folder, false); };
    const remove = async (e) => {
        e.stopPropagation();
        if (window.confirm(`Delete "${folder.name}" and everything inside it?`)) await deleteCollection(folder.id);
    };
    const paste = async (e) => {
        e.stopPropagation();
        await onPaste(folder.id);
    };

    // Drop a dragged request onto this folder's header to move it here — reuses the
    // existing moveRequest action/endpoint (reparents by collectionId only, no ordering).
    const handleDragOver = (e) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };
    const handleDragEnter = (e) => { if (e.dataTransfer.types.includes(DRAG_MIME)) setDragOver(true); };
    const handleDragLeave = () => setDragOver(false);
    const handleDrop = async (e) => {
        e.preventDefault();
        setDragOver(false);
        const raw = e.dataTransfer.getData(DRAG_MIME);
        if (!raw) return;
        const { requestId, sourceCollectionId } = JSON.parse(raw);
        if (requestId && sourceCollectionId !== folder.id) await moveRequest(sourceCollectionId, requestId, folder.id);
    };

    return (
        <div style={{ marginLeft: depth ? 10 : 0 }}>
            <div
                onClick={() => setFolderExpanded(folder.id, !open)}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '5px 6px', borderRadius: 4, cursor: 'pointer', gap: 4,
                    background: dragOver ? C.accentDim : 'transparent',
                    outline: dragOver ? `2px dashed ${C.accent}` : 'none', outlineOffset: -2,
                    transition: 'background-color .12s, outline-color .12s',
                }}
                onMouseEnter={e => { if (!dragOver) e.currentTarget.style.background = C.surface; }}
                onMouseLeave={e => { if (!dragOver) e.currentTarget.style.background = 'transparent'; }}
            >
                <span style={{ fontSize: 12, color: C.text, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                    <span style={{ fontSize: 9, color: C.textFaint }}>{open ? '▾' : '▸'}</span>
                    📁 {folder.name}
                </span>
                <span style={{ display: 'flex', gap: 3 }}>
                    <IconBtn title="Add request" onClick={addRequest}>+req</IconBtn>
                    <IconBtn title="Add subfolder" onClick={addSubfolder}>+dir</IconBtn>
                    {hasClipboard && <IconBtn title="Paste request here" onClick={paste}>📌</IconBtn>}
                    {folder.id && <IconBtn title="Run All main requests" onClick={runAll}>▶</IconBtn>}
                    {folder.id && <IconBtn title="Last Run All report" onClick={showReport}>📊</IconBtn>}
                    {folder.id && <IconBtn title="Rename" onClick={rename}>✎</IconBtn>}
                    {folder.id && <IconBtn title="Delete" onClick={remove}>🗑</IconBtn>}
                </span>
            </div>
            {open && (
                <div style={{ marginLeft: 14 }}>
                    {(folder.requests || []).map(r => (
                        <RequestRow key={r.id} request={r} collectionId={folder.id} active={r.id === activeRequestId} onCopy={onCopy} />
                    ))}
                    {(folder.folders || []).map(f => (
                        <FolderRow
                            key={f.id} folder={f} depth={depth + 1}
                            onCopy={onCopy} onPaste={onPaste} hasClipboard={hasClipboard} onReport={onReport}
                            onAddRequest={onAddRequest}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function RequestRow({ request, collectionId, active, onCopy }) {
    const { setActiveRequest, deleteRequest, moveRequest, lastRunStatus } = useCollectionStore();
    const method = (request.request?.method || 'GET').toUpperCase();
    const [dragging, setDragging] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    // "failed" already means "at least one iteration failed" for an Input Data Set-iterating
    // request — see run-request's own status computation — so no extra iteration-scanning here.
    const failed = lastRunStatus[request.id] === 'failed';

    const handleDragStart = (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ requestId: request.id, sourceCollectionId: collectionId }));
        e.dataTransfer.setData('text/plain', request.name);
        setDragging(true);
    };
    const handleDragEnd = () => setDragging(false);

    // Dropping onto a sibling request also moves the dragged one into ITS folder —
    // a bigger, more forgiving drop target than the folder header alone.
    const handleDragOver = (e) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };
    const handleDragEnter = (e) => { if (e.dataTransfer.types.includes(DRAG_MIME)) setDragOver(true); };
    const handleDragLeave = () => setDragOver(false);
    const handleDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        const raw = e.dataTransfer.getData(DRAG_MIME);
        if (!raw) return;
        const { requestId, sourceCollectionId } = JSON.parse(raw);
        if (requestId && requestId !== request.id && sourceCollectionId !== collectionId) {
            await moveRequest(sourceCollectionId, requestId, collectionId);
        }
    };

    return (
        <div
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => setActiveRequest(request.id)}
            title={failed ? 'Last run failed (at least one iteration failed)' : undefined}
            style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: C.radiusSm, cursor: 'grab',
                background: dragOver ? C.accentDim : active ? C.accentDim : 'transparent',
                opacity: dragging ? 0.4 : 1,
                transition: 'background-color .12s, opacity .12s',
                borderLeft: failed ? `2px solid ${C.danger}` : active ? `2px solid ${C.accent}` : '2px solid transparent',
                outline: dragOver ? `2px dashed ${C.accent}` : 'none', outlineOffset: -2,
            }}
            onMouseEnter={e => { if (!active && !dragOver) e.currentTarget.style.background = C.surface; }}
            onMouseLeave={e => { if (!active && !dragOver) e.currentTarget.style.background = 'transparent'; }}
        >
            <span style={{ ...methodBadgeStyle(method), width: 40, textAlign: 'center' }}>{method}</span>
            <span style={{ fontSize: 12, color: failed ? C.danger : C.text, fontWeight: failed ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{request.name}</span>
            {failed && <span style={{ fontSize: 10, color: C.danger }} title="Last run failed">⚠</span>}
            <IconBtn title="Copy" onClick={e => { e.stopPropagation(); onCopy(request); }}>📋</IconBtn>
            <IconBtn title="Delete" onClick={e => { e.stopPropagation(); if (window.confirm(`Delete "${request.name}"?`)) deleteRequest(collectionId, request.id); }}>🗑</IconBtn>
        </div>
    );
}

function IconBtn({ children, title, onClick }) {
    return (
        <button
            title={title}
            onClick={onClick}
            style={{ background: 'transparent', border: 'none', color: C.textFaint, fontSize: 10, cursor: 'pointer', padding: '1px 3px' }}
        >
            {children}
        </button>
    );
}

function MenuItem({ children, onClick }) {
    return (
        <div
            onClick={onClick}
            style={{ padding: '7px 10px', fontSize: 11, color: C.textDim, cursor: 'pointer', whiteSpace: 'nowrap' }}
            onMouseEnter={e => e.currentTarget.style.background = C.surface}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
            {children}
        </div>
    );
}

/** Name + optional password — see workspaces-api.xml's create-workspace for how the password is
 *  hashed/enforced. Collections themselves no longer take a password (see FolderRow's
 *  addSubfolder/addRootCollection, which use a plain prompt); only workspaces do now. */
function NewWorkspaceModal({ onClose, onCreate }) {
    const [name, setName] = useState('New Workspace');
    const [password, setPassword] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const submit = async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setSaving(true);
        setError(null);
        try {
            await onCreate(name.trim(), password.trim());
        } catch (err) {
            setError(err.message);
            setSaving(false);
        }
    };

    return (
        <div className="at-overlay" style={overlayStyle}>
            <form onSubmit={submit} className="at-modal" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: C.radius, boxShadow: C.shadowLg, width: 340, padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>New Workspace</div>
                <label style={{ fontSize: 10, color: C.textFaint, display: 'block', marginBottom: 4 }}>NAME</label>
                <input autoFocus style={{ ...inputStyle, width: '100%', marginBottom: 12 }} value={name} onChange={e => setName(e.target.value)} />
                <label style={{ fontSize: 10, color: C.textFaint, display: 'block', marginBottom: 4 }}>
                    PASSWORD <span style={{ fontWeight: 400, fontStyle: 'italic' }}>(optional — leave blank for no password)</span>
                </label>
                <input type="password" style={{ ...inputStyle, width: '100%', marginBottom: 6 }} value={password} onChange={e => setPassword(e.target.value)} placeholder="Leave blank for no password" />
                <div style={{ fontSize: 10, color: C.textFaint, marginBottom: 14 }}>
                    If set, every collection in this workspace is hidden from everyone else on this backend until the correct password is entered.
                </div>
                {error && <div style={{ fontSize: 11, color: C.danger, marginBottom: 10 }}>{error}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button type="button" onClick={onClose} style={btnStyle}>Cancel</button>
                    <button type="submit" disabled={saving || !name.trim()} style={{ ...btnStyle, background: C.accent, color: '#fff', opacity: saving ? 0.6 : 1 }}>
                        {saving ? 'Creating…' : 'Create'}
                    </button>
                </div>
            </form>
        </div>
    );
}

/** Replaces the old window.prompt("Request name") — same trigger (sidebar's "+req"), now with an
 *  optional template to seed the new request's Pre-Request/Post-Response from (see
 *  templates-api.xml's own file comment; templateId is looked up and applied by the caller). */
function NewRequestModal({ onClose, onCreate }) {
    const { templates, fetchTemplates } = useTemplateStore();
    const [name, setName] = useState('New Request');
    const [templateId, setTemplateId] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => { if (templates.length === 0) fetchTemplates().catch(() => {}); }, []);

    const submit = async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setSaving(true);
        setError(null);
        try {
            await onCreate(name.trim(), templateId || null);
        } catch (err) {
            setError(err.message);
            setSaving(false);
        }
    };

    return (
        <div className="at-overlay" style={overlayStyle}>
            <form onSubmit={submit} className="at-modal" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: C.radius, boxShadow: C.shadowLg, width: 340, padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>New Request</div>
                <label style={{ fontSize: 10, color: C.textFaint, display: 'block', marginBottom: 4 }}>NAME</label>
                <input autoFocus style={{ ...inputStyle, width: '100%', marginBottom: 12 }} value={name} onChange={e => setName(e.target.value)} />
                <label style={{ fontSize: 10, color: C.textFaint, display: 'block', marginBottom: 4 }}>
                    TEMPLATE <span style={{ fontWeight: 400, fontStyle: 'italic' }}>(optional — seeds Pre-Request/Post-Response)</span>
                </label>
                <select style={{ ...inputStyle, width: '100%', marginBottom: 14 }} value={templateId} onChange={e => setTemplateId(e.target.value)}>
                    <option value="">No template</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {error && <div style={{ fontSize: 11, color: C.danger, marginBottom: 10 }}>{error}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button type="button" onClick={onClose} style={btnStyle}>Cancel</button>
                    <button type="submit" disabled={saving || !name.trim()} style={{ ...btnStyle, background: C.accent, color: '#fff', opacity: saving ? 0.6 : 1 }}>
                        {saving ? 'Creating…' : 'Create'}
                    </button>
                </div>
            </form>
        </div>
    );
}

const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
};
