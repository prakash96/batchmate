import { useEffect, useRef, useState } from 'react';
import { useCollectionStore } from '../../store/collectionStore';
import { C, btnStyle, inputStyle, methodBadgeStyle } from '../../theme';
import { readFileAsText, buildFoldersFromSwagger } from '../../utils/swaggerImport';
import { buildFoldersFromPostman } from '../../utils/postmanImport';

// Custom MIME type so drop targets can tell a request row is what's being dragged
// (as opposed to, say, a browser-native file/text drag) before touching dataTransfer.
const DRAG_MIME = 'application/x-apitester-request';

export default function CollectionTree() {
    const { folders, fetchCollections, addCollection, setActiveRequest } = useCollectionStore();
    const [importing, setImporting] = useState(false);
    const postmanInputRef = useRef(null);
    const swaggerInputRef = useRef(null);
    const [importTarget, setImportTarget] = useState(null); // folderId requests import into
    const [clipboard, setClipboard] = useState(null); // full request object last "copied"

    useEffect(() => { fetchCollections(); }, []);

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

    const handleAddRoot = async () => {
        const name = window.prompt('Collection name', 'New Collection');
        if (name) await addCollection(name, null);
    };

    const triggerImport = (folderId, kind) => {
        setImportTarget(folderId);
        (kind === 'postman' ? postmanInputRef : swaggerInputRef).current?.click();
    };

    const handlePostmanFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        setImporting(true);
        try {
            const text = await readFileAsText(file);
            const parsed = buildFoldersFromPostman(text);
            await importFolderTree(parsed, importTarget, parsed.name, parsed.variables);
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
            const text = await readFileAsText(file);
            const tagGroups = buildFoldersFromSwagger(text);
            let count = 0;
            for (const group of tagGroups) {
                if (!group.requests.length) continue;
                const targetId = tagGroups.length === 1
                    ? importTarget
                    : (await addCollection(group.name, importTarget)).id;
                for (const req of group.requests) {
                    await createAndSaveRequest(targetId, req);
                    count++;
                }
            }
            if (count === 0) alert('No operations with response definitions were found in this spec.');
            await fetchCollections();
        } catch (err) {
            console.error('Swagger import failed:', err);
            alert('Swagger import failed: ' + err.message);
        } finally {
            setImporting(false);
        }
    };

    // Recursively creates folders/requests from a Postman-derived tree under parentId.
    async function importFolderTree(node, parentId, nameOverride, variables) {
        const { addCollection: add, setCollectionVariables } = useCollectionStore.getState();
        const col = await add(nameOverride ?? node.name, parentId);
        if (variables && Object.keys(variables).length) await setCollectionVariables(col.id, variables);
        for (const req of node.requests || []) await createAndSaveRequest(col.id, req);
        for (const sub of node.folders || []) await importFolderTree(sub, col.id);
        return col;
    }

    async function createAndSaveRequest(collectionId, req) {
        const { addRequestToCollection, saveRequest } = useCollectionStore.getState();
        const created = await addRequestToCollection(collectionId, req.name);
        const full = { ...created, preRequest: req.preRequest, request: req.request, postResponse: req.postResponse };
        await saveRequest(full);
        return full;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 10px 6px', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: '0.04em' }}>COLLECTIONS</span>
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
                    <button onClick={handleAddRoot} style={{ ...btnStyle, padding: '3px 8px' }} title="New collection">+</button>
                </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px 10px' }}>
                {folders.map(f => (
                    <FolderRow
                        key={f.id ?? 'uncategorized'} folder={f} depth={0} onImport={triggerImport} importing={importing}
                        onCopy={setClipboard} onPaste={pasteRequest} hasClipboard={!!clipboard}
                    />
                ))}
            </div>
            <input ref={postmanInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handlePostmanFile} />
            <input ref={swaggerInputRef} type="file" accept=".json,.yaml,.yml" style={{ display: 'none' }} onChange={handleSwaggerFile} />
        </div>
    );
}

function FolderRow({ folder, depth, onImport, importing, onCopy, onPaste, hasClipboard }) {
    const [open, setOpen] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const { addCollection, addRequestToCollection, renameCollection, deleteCollection, moveRequest, setActiveRequest, activeRequestId } = useCollectionStore();

    const addSubfolder = async (e) => {
        e.stopPropagation();
        const name = window.prompt('Folder name', 'New Folder');
        if (name) await addCollection(name, folder.id);
    };
    const addRequest = async (e) => {
        e.stopPropagation();
        const name = window.prompt('Request name', 'New Request');
        if (name) {
            const req = await addRequestToCollection(folder.id, name);
            setActiveRequest(req.id);
        }
    };
    const rename = async (e) => {
        e.stopPropagation();
        const name = window.prompt('Rename', folder.name);
        if (name) await renameCollection(folder.id, name);
    };
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
                onClick={() => setOpen(o => !o)}
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
                    <span style={{ position: 'relative' }}>
                        <IconBtn title="Import" onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }}>{importing ? '…' : '⇩'}</IconBtn>
                        {menuOpen && (
                            <div style={{
                                position: 'absolute', right: 0, top: '100%', zIndex: 10, background: C.panel,
                                border: `1px solid ${C.border}`, borderRadius: C.radiusSm, minWidth: 150, boxShadow: C.shadowLg,
                            }}>
                                <MenuItem onClick={() => { setMenuOpen(false); onImport(folder.id, 'postman'); }}>Import Postman Collection</MenuItem>
                                <MenuItem onClick={() => { setMenuOpen(false); onImport(folder.id, 'swagger'); }}>Import Swagger / OpenAPI</MenuItem>
                            </div>
                        )}
                    </span>
                    {hasClipboard && <IconBtn title="Paste request here" onClick={paste}>📌</IconBtn>}
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
                            key={f.id} folder={f} depth={depth + 1} onImport={onImport} importing={importing}
                            onCopy={onCopy} onPaste={onPaste} hasClipboard={hasClipboard}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function RequestRow({ request, collectionId, active, onCopy }) {
    const { setActiveRequest, deleteRequest, moveRequest } = useCollectionStore();
    const method = (request.request?.method || 'GET').toUpperCase();
    const [dragging, setDragging] = useState(false);
    const [dragOver, setDragOver] = useState(false);

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
            style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: C.radiusSm, cursor: 'grab',
                background: dragOver ? C.accentDim : active ? C.accentDim : 'transparent',
                opacity: dragging ? 0.4 : 1,
                transition: 'background-color .12s, opacity .12s',
                borderLeft: active ? `2px solid ${C.accent}` : '2px solid transparent',
                outline: dragOver ? `2px dashed ${C.accent}` : 'none', outlineOffset: -2,
            }}
            onMouseEnter={e => { if (!active && !dragOver) e.currentTarget.style.background = C.surface; }}
            onMouseLeave={e => { if (!active && !dragOver) e.currentTarget.style.background = 'transparent'; }}
        >
            <span style={{ ...methodBadgeStyle(method), width: 40, textAlign: 'center' }}>{method}</span>
            <span style={{ fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{request.name}</span>
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
