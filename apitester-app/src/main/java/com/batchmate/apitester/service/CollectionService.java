package com.batchmate.apitester.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

/**
 * Flat-file tree storage for collections/folders — adapted from workflow-app's
 * PackageService. A collection node's own file only stores the folder tree
 * ({id, name, folders:[...]}); request membership is inferred from each
 * request's own collectionId field, same as packages/workflows.
 */
@Service
public class CollectionService {

    private static final String COLLECTIONS_FILE = "_collections.json";

    private final ObjectMapper objectMapper;
    private final RequestService requestService;

    private Path resolvedBaseDir;

    public CollectionService(ObjectMapper objectMapper, RequestService requestService) {
        this.objectMapper   = objectMapper;
        this.requestService = requestService;
    }

    @PostConstruct
    public void init() {
        resolvedBaseDir = requestService.baseDir();
    }

    // ── Collections file ─────────────────────────────────────────────────────

    public List<ObjectNode> readCollections() throws IOException {
        Path file = resolvedBaseDir.resolve(COLLECTIONS_FILE);
        if (!Files.exists(file)) return new ArrayList<>();
        JsonNode arr = objectMapper.readTree(file.toFile());
        List<ObjectNode> result = new ArrayList<>();
        if (arr.isArray()) {
            arr.forEach(n -> { if (n.isObject()) result.add((ObjectNode) n); });
        }
        return result;
    }

    private void writeCollections(List<ObjectNode> collections) throws IOException {
        Files.createDirectories(resolvedBaseDir);
        objectMapper.writerWithDefaultPrettyPrinter()
                .writeValue(resolvedBaseDir.resolve(COLLECTIONS_FILE).toFile(), collections);
    }

    // ── CRUD ─────────────────────────────────────────────────────────────────

    /** workspaceId is required in practice — the UI always creates a collection inside a
     *  specific, already-unlocked workspace, and passes the parent's own workspaceId down for a
     *  nested sub-folder too (so every node in a subtree carries the SAME workspaceId as its
     *  root, an invariant #pruneByWorkspace below relies on) — mirrors apitester-mule's
     *  collections-api.xml create-collection exactly. */
    public ObjectNode createCollection(String name, String parentId, String workspaceId) throws IOException {
        List<ObjectNode> collections = readCollections();
        ObjectNode col = objectMapper.createObjectNode();
        col.put("id", UUID.randomUUID().toString());
        col.put("name", name);
        if (workspaceId == null) col.putNull("workspaceId"); else col.put("workspaceId", workspaceId);
        col.set("folders", objectMapper.createArrayNode());
        col.set("variables", objectMapper.createObjectNode());

        if (parentId == null || parentId.isBlank()) {
            collections.add(col);
        } else if (!addToParent(collections, parentId, col)) {
            collections.add(col);
        }
        writeCollections(collections);
        return col;
    }

    public void renameCollection(String collectionId, String name) throws IOException {
        List<ObjectNode> collections = readCollections();
        renameInTree(collections, collectionId, name);
        writeCollections(collections);
    }

    public void setVariables(String collectionId, JsonNode variables) throws IOException {
        List<ObjectNode> collections = readCollections();
        ObjectNode found = findNode(collections, collectionId);
        if (found != null) {
            found.set("variables", variables);
            writeCollections(collections);
        }
    }

    public void deleteCollection(String collectionId) throws IOException {
        List<ObjectNode> collections = readCollections();
        List<String> allIds = new ArrayList<>();
        collectIds(findNode(collections, collectionId), allIds);
        removeFromTree(collections, collectionId);
        writeCollections(collections);
        for (String id : allIds) {
            requestService.clearCollectionId(id);
        }
    }

    /** Looks up a single collection node anywhere in the tree (used to read its variables at run time). */
    public ObjectNode findCollection(String collectionId) throws IOException {
        return findNode(readCollections(), collectionId);
    }

    public void moveCollection(String collectionId, String newParentId) throws IOException {
        List<ObjectNode> collections = readCollections();
        ObjectNode found = findNode(collections, collectionId);
        if (found == null) return;
        ObjectNode copy = found.deepCopy();
        removeFromTree(collections, collectionId);
        if (newParentId == null || newParentId.isBlank()) {
            collections.add(copy);
        } else if (!addToParent(collections, newParentId, copy)) {
            collections.add(copy);
        }
        writeCollections(collections);
    }

    // ── Aggregated view ───────────────────────────────────────────────────────

    public List<ObjectNode> getCollectionsWithRequests() throws IOException {
        List<ObjectNode> collections = readCollections();
        if (collections.isEmpty()) {
            createCollection("My Collection", null, null);
            collections = readCollections();
        }
        Map<String, List<JsonNode>> byCollection = buildRequestIndex();
        List<ObjectNode> result = attachRequests(collections, byCollection);

        List<JsonNode> unassigned = byCollection.getOrDefault("", Collections.emptyList());
        if (!unassigned.isEmpty()) {
            ObjectNode uncategorized = objectMapper.createObjectNode();
            uncategorized.putNull("id");
            uncategorized.put("name", "Uncategorized");
            uncategorized.set("folders", objectMapper.createArrayNode());
            ArrayNode reqArr = objectMapper.createArrayNode();
            unassigned.forEach(reqArr::add);
            uncategorized.set("requests", reqArr);
            result.add(uncategorized);
        }
        return result;
    }

    /** Recursively drops any node (and its whole subtree — pruned along with it, since children
     *  are nested inside) whose OWN workspaceId fails {@code keep}. Every node in a subtree
     *  carries the SAME workspaceId as its root (see createCollection's own comment on that
     *  invariant), so this one utility serves both call sites: locked-filtering (keep = "not a
     *  locked workspace", used on the FULL tree by CollectionController) and unlock-scoping
     *  (keep = "equals this one workspace", used by WorkspaceController to build the tree
     *  unlock-workspace hands back). Operates on the AGGREGATED shape getCollectionsWithRequests()
     *  returns (folders/requests already attached), not the raw _collections.json tree. */
    public List<ObjectNode> pruneByWorkspace(List<ObjectNode> nodes, java.util.function.Predicate<String> keep) {
        List<ObjectNode> result = new ArrayList<>();
        for (ObjectNode node : nodes) {
            String workspaceId = node.path("workspaceId").asText(null);
            if (!keep.test(workspaceId)) continue;
            ObjectNode copy = node.deepCopy();
            List<ObjectNode> prunedChildren = pruneByWorkspace(toList(node.path("folders")), keep);
            ArrayNode arr = objectMapper.createArrayNode();
            prunedChildren.forEach(arr::add);
            copy.set("folders", arr);
            result.add(copy);
        }
        return result;
    }

    // ── Tree helpers ──────────────────────────────────────────────────────────

    private boolean addToParent(List<ObjectNode> nodes, String parentId, ObjectNode newCol) {
        for (ObjectNode p : nodes) {
            if (parentId.equals(p.path("id").asText(null))) {
                p.withArray("folders").add(newCol);
                return true;
            }
            List<ObjectNode> children = toList(p.path("folders"));
            if (addToParent(children, parentId, newCol)) {
                ArrayNode arr = objectMapper.createArrayNode();
                children.forEach(arr::add);
                p.set("folders", arr);
                return true;
            }
        }
        return false;
    }

    private boolean renameInTree(List<ObjectNode> nodes, String colId, String name) {
        for (ObjectNode p : nodes) {
            if (colId.equals(p.path("id").asText(null))) {
                p.put("name", name);
                return true;
            }
            List<ObjectNode> children = toList(p.path("folders"));
            if (renameInTree(children, colId, name)) {
                ArrayNode arr = objectMapper.createArrayNode();
                children.forEach(arr::add);
                p.set("folders", arr);
                return true;
            }
        }
        return false;
    }

    private boolean removeFromTree(List<ObjectNode> nodes, String colId) {
        Iterator<ObjectNode> it = nodes.iterator();
        while (it.hasNext()) {
            ObjectNode p = it.next();
            if (colId.equals(p.path("id").asText(null))) {
                it.remove();
                return true;
            }
            List<ObjectNode> children = toList(p.path("folders"));
            if (removeFromTree(children, colId)) {
                ArrayNode arr = objectMapper.createArrayNode();
                children.forEach(arr::add);
                p.set("folders", arr);
                return true;
            }
        }
        return false;
    }

    private ObjectNode findNode(List<ObjectNode> nodes, String colId) {
        for (ObjectNode p : nodes) {
            if (colId.equals(p.path("id").asText(null))) return p;
            ObjectNode found = findNode(toList(p.path("folders")), colId);
            if (found != null) return found;
        }
        return null;
    }

    private void collectIds(ObjectNode node, List<String> ids) {
        if (node == null) return;
        String id = node.path("id").asText(null);
        if (id != null) ids.add(id);
        toList(node.path("folders")).forEach(child -> collectIds(child, ids));
    }

    private List<ObjectNode> attachRequests(List<ObjectNode> collections, Map<String, List<JsonNode>> byCollection) {
        List<ObjectNode> result = new ArrayList<>();
        for (ObjectNode col : collections) {
            ObjectNode out = col.deepCopy();
            String colId = col.path("id").asText(null);
            ArrayNode reqArr = objectMapper.createArrayNode();
            byCollection.getOrDefault(colId != null ? colId : "", Collections.emptyList()).forEach(reqArr::add);
            out.set("requests", reqArr);
            ArrayNode subArr = objectMapper.createArrayNode();
            attachRequests(toList(col.path("folders")), byCollection).forEach(subArr::add);
            out.set("folders", subArr);
            result.add(out);
        }
        return result;
    }

    private Map<String, List<JsonNode>> buildRequestIndex() {
        List<JsonNode> allRequests;
        try { allRequests = requestService.list(); } catch (IOException e) { allRequests = Collections.emptyList(); }
        Map<String, List<JsonNode>> byCollection = new LinkedHashMap<>();
        for (JsonNode req : allRequests) {
            String colId = req.path("collectionId").asText(null);
            String key = (colId == null || colId.isBlank()) ? "" : colId;
            byCollection.computeIfAbsent(key, k -> new ArrayList<>()).add(req);
        }
        return byCollection;
    }

    private List<ObjectNode> toList(JsonNode arr) {
        List<ObjectNode> result = new ArrayList<>();
        if (arr != null && arr.isArray()) {
            arr.forEach(n -> { if (n.isObject()) result.add((ObjectNode) n); });
        }
        return result;
    }
}
