package com.batchmate.apitester.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Flat-file storage for global variables — the lowest-precedence tier available to every request
 * (collection variables, then an explicit per-run override, both still win over these — see
 * RequestExecutionService's merge order in its run() javadoc). Scoped PER WORKSPACE (one file
 * per workspace, {@code _globals_<workspaceId>.json}) — mirrors apitester-mule's globals-api.xml/
 * schema.sql "global_vars" table (workspace_id, name, value) exactly, so apitester-ui's
 * /workspaces/{workspaceId}/globals calls work unchanged whichever backend it's pointed at. Used
 * to be one flat file shared by every request regardless of collection/workspace; a request whose
 * collection has no workspace (the "Unassigned" bucket) gets no global vars at all, matching
 * Mule's "workspace_id = :wsId never matches a NULL request-side workspace" behavior.
 */
@Service
public class GlobalVarsService {

    private static final String GLOBALS_FILE_PREFIX = "_globals_";
    private static final String GLOBALS_FILE_SUFFIX = ".json";

    private final ObjectMapper objectMapper;
    private final RequestService requestService;

    private Path resolvedBaseDir;

    public GlobalVarsService(ObjectMapper objectMapper, RequestService requestService) {
        this.objectMapper = objectMapper;
        this.requestService = requestService;
    }

    @PostConstruct
    public void init() {
        resolvedBaseDir = requestService.baseDir();
    }

    private Path fileFor(String workspaceId) {
        return resolvedBaseDir.resolve(GLOBALS_FILE_PREFIX + workspaceId + GLOBALS_FILE_SUFFIX);
    }

    /** Reads the raw stored object for one workspace (for GET /workspaces/{id}/globals — the UI
     *  edits name/value pairs directly, same shape as a collection's "variables" node). No
     *  workspaceId (null/blank) or a missing file → empty object. */
    public ObjectNode read(String workspaceId) throws IOException {
        if (workspaceId == null || workspaceId.isBlank()) return objectMapper.createObjectNode();
        Path file = fileFor(workspaceId);
        if (!Files.exists(file)) return objectMapper.createObjectNode();
        JsonNode node = objectMapper.readTree(file.toFile());
        return node.isObject() ? (ObjectNode) node : objectMapper.createObjectNode();
    }

    public void write(String workspaceId, JsonNode variables) throws IOException {
        if (workspaceId == null || workspaceId.isBlank()) return;
        Files.createDirectories(resolvedBaseDir);
        ObjectNode toWrite = (variables != null && variables.isObject())
            ? (ObjectNode) variables
            : objectMapper.createObjectNode();
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(fileFor(workspaceId).toFile(), toWrite);
    }

    /** Read as a plain Map<String,Object> — used by RequestExecutionService to seed the
     *  globalVars "floor" for every run, independent of whatever the client sends. */
    public Map<String, Object> readAsMap(String workspaceId) throws IOException {
        ObjectNode node = read(workspaceId);
        Map<String, Object> map = new LinkedHashMap<>();
        node.fields().forEachRemaining(e -> map.put(e.getKey(), e.getValue().asText("")));
        return map;
    }

    /** Called when a workspace is deleted (see WorkspaceService#delete) — its global vars file
     *  goes with it, same as Mule's ON DELETE CASCADE on global_vars.workspace_id. */
    public void deleteWorkspace(String workspaceId) throws IOException {
        if (workspaceId == null || workspaceId.isBlank()) return;
        Path file = fileFor(workspaceId);
        Files.deleteIfExists(file);
    }
}
