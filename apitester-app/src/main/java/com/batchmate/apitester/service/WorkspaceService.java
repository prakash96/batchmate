package com.batchmate.apitester.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;

/**
 * Flat-file storage for workspaces — the scope ABOVE collections (mirrors apitester-mule's
 * workspaces-api.xml / schema.sql "workspaces" table exactly, so apitester-ui works unchanged
 * whichever backend it's pointed at). A workspace's password (if set) gates ALL its collections
 * at once: CollectionController's listing omits any collection whose workspace is locked
 * entirely (not merely hidden client-side) — unlockWithPassword below is the only way to get
 * them back for this session.
 *
 * One flat file, {@code _workspaces.json} — an array of {id, name, passwordHash}, same
 * convention as CollectionService's own {@code _collections.json}. passwordHash is SHA-256 hex,
 * null meaning "no password"; it never leaves this class — every method that returns a workspace
 * to a caller returns {id, name, locked} instead (see #toPublic).
 */
@Service
public class WorkspaceService {

    private static final String WORKSPACES_FILE = "_workspaces.json";

    private final ObjectMapper objectMapper;
    private final RequestService requestService;
    private final CollectionService collectionService;
    private final GlobalVarsService globalVarsService;

    private Path resolvedBaseDir;

    public WorkspaceService(ObjectMapper objectMapper, RequestService requestService,
                             CollectionService collectionService, GlobalVarsService globalVarsService) {
        this.objectMapper = objectMapper;
        this.requestService = requestService;
        this.collectionService = collectionService;
        this.globalVarsService = globalVarsService;
    }

    @PostConstruct
    public void init() {
        resolvedBaseDir = requestService.baseDir();
    }

    // ── Storage ──────────────────────────────────────────────────────────────

    private List<ObjectNode> readAll() throws IOException {
        Path file = resolvedBaseDir.resolve(WORKSPACES_FILE);
        if (!Files.exists(file)) return new ArrayList<>();
        JsonNode arr = objectMapper.readTree(file.toFile());
        List<ObjectNode> result = new ArrayList<>();
        if (arr.isArray()) arr.forEach(n -> { if (n.isObject()) result.add((ObjectNode) n); });
        return result;
    }

    private void writeAll(List<ObjectNode> workspaces) throws IOException {
        Files.createDirectories(resolvedBaseDir);
        objectMapper.writerWithDefaultPrettyPrinter()
                .writeValue(resolvedBaseDir.resolve(WORKSPACES_FILE).toFile(), workspaces);
    }

    private ObjectNode toPublic(ObjectNode raw) {
        ObjectNode pub = objectMapper.createObjectNode();
        pub.put("id", raw.path("id").asText(null));
        pub.put("name", raw.path("name").asText(""));
        pub.put("locked", !raw.path("passwordHash").isNull() && !raw.path("passwordHash").asText("").isEmpty());
        return pub;
    }

    // ── CRUD ─────────────────────────────────────────────────────────────────

    public List<ObjectNode> list() throws IOException {
        List<ObjectNode> result = new ArrayList<>();
        for (ObjectNode w : readAll()) result.add(toPublic(w));
        result.sort(Comparator.comparing(a -> a.path("name").asText("")));
        return result;
    }

    /** password is optional — a non-empty string password-protects the new workspace. Hashed
     *  (SHA-256, hex) before it's ever stored; the hash itself is never returned. */
    public ObjectNode create(String name, String password) throws IOException {
        List<ObjectNode> workspaces = readAll();
        ObjectNode ws = objectMapper.createObjectNode();
        ws.put("id", UUID.randomUUID().toString());
        ws.put("name", (name == null || name.isBlank()) ? "New Workspace" : name);
        String hash = hash(password);
        if (hash == null) ws.putNull("passwordHash"); else ws.put("passwordHash", hash);
        workspaces.add(ws);
        writeAll(workspaces);
        return toPublic(ws);
    }

    public void rename(String workspaceId, String name) throws IOException {
        List<ObjectNode> workspaces = readAll();
        for (ObjectNode w : workspaces) {
            if (workspaceId.equals(w.path("id").asText(null))) {
                w.put("name", name == null ? "" : name);
                break;
            }
        }
        writeAll(workspaces);
    }

    /** Cascade-deletes the workspace: every collection belonging to it (and their requests,
     *  via CollectionService.deleteCollection, which already cascades a collection's own
     *  requests), then this workspace's own global-vars file, then the workspace itself —
     *  mirrors apitester-mule's ON DELETE CASCADE (schema.sql/workspaces-api.xml). */
    public void delete(String workspaceId) throws IOException {
        for (ObjectNode col : collectionService.readCollections()) {
            if (workspaceId.equals(col.path("workspaceId").asText(null))) {
                collectionService.deleteCollection(col.path("id").asText(null));
            }
        }
        globalVarsService.deleteWorkspace(workspaceId);
        List<ObjectNode> workspaces = readAll();
        workspaces.removeIf(w -> workspaceId.equals(w.path("id").asText(null)));
        writeAll(workspaces);
    }

    /** Verifies a password against the stored hash. Returns true if the workspace has NO
     *  password (nothing to unlock) or the hash matches; false for a wrong password. null if the
     *  workspace doesn't exist at all — callers distinguish "not found" (404) from "wrong
     *  password" (401), same as unlock-workspace's own choice ladder. */
    public Boolean verifyPassword(String workspaceId, String password) throws IOException {
        for (ObjectNode w : readAll()) {
            if (workspaceId.equals(w.path("id").asText(null))) {
                String stored = w.path("passwordHash").asText(null);
                if (stored == null || stored.isEmpty()) return true;
                return stored.equals(hash(password));
            }
        }
        return null;
    }

    private String hash(String rawPassword) {
        String trimmed = rawPassword == null ? "" : rawPassword.trim();
        if (trimmed.isEmpty()) return null;
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(trimmed.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e); // every JVM ships this — unreachable in practice
        }
    }
}
