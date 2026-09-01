package com.batchmate.apitester.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

/**
 * Flat-file storage + matching for the mock server — mirrors apitester-mule's mock-api.xml
 * exactly (paths + JSON shapes + matching rules), so apitester-ui's MockServerModal works
 * unchanged whichever backend it's pointed at. Global, not scoped to a workspace/collection —
 * one flat list, one file ({@code _mock_endpoints.json}), same convention as every other
 * single-file store in this package (_globals_*.json, _workspaces.json).
 *
 * Matching (see #findMatch): "path" is a template like /users/{id} — a {segment} matches ANY
 * literal value in that position. The incoming request's path (everything after /mock) is
 * compared segment-by-segment against every ENABLED endpoint whose method matches (exact verb,
 * or a stored '*' meaning "any"); among matches, the one with the most literal (non-{}) segments
 * wins. No artificial response delay — deliberately not built, matching mock-api.xml's own
 * reasoning (nothing in this app needs a sleep/wait primitive badly enough to justify one).
 */
@Service
public class MockService {

    private static final String MOCKS_FILE = "_mock_endpoints.json";

    private final ObjectMapper objectMapper;
    private final RequestService requestService;

    private Path resolvedBaseDir;

    public MockService(ObjectMapper objectMapper, RequestService requestService) {
        this.objectMapper = objectMapper;
        this.requestService = requestService;
    }

    @PostConstruct
    public void init() {
        resolvedBaseDir = requestService.baseDir();
    }

    // ── Storage ──────────────────────────────────────────────────────────────

    private List<ObjectNode> readAll() throws IOException {
        Path file = resolvedBaseDir.resolve(MOCKS_FILE);
        if (!Files.exists(file)) return new ArrayList<>();
        JsonNode arr = objectMapper.readTree(file.toFile());
        List<ObjectNode> result = new ArrayList<>();
        if (arr.isArray()) arr.forEach(n -> { if (n.isObject()) result.add((ObjectNode) n); });
        return result;
    }

    private void writeAll(List<ObjectNode> endpoints) throws IOException {
        Files.createDirectories(resolvedBaseDir);
        objectMapper.writerWithDefaultPrettyPrinter()
                .writeValue(resolvedBaseDir.resolve(MOCKS_FILE).toFile(), endpoints);
    }

    // ── CRUD ─────────────────────────────────────────────────────────────────

    public List<ObjectNode> list() throws IOException {
        List<ObjectNode> all = readAll();
        all.sort(Comparator.comparing((ObjectNode e) -> e.path("path").asText(""))
                .thenComparing(e -> e.path("method").asText("")));
        return all;
    }

    public String create(JsonNode body) throws IOException {
        List<ObjectNode> endpoints = readAll();
        String id = UUID.randomUUID().toString();
        endpoints.add(toStored(id, body));
        writeAll(endpoints);
        return id;
    }

    /** Upsert by id — same MERGE-style behavior as apitester-mule's save-mock-endpoint: editing
     *  an endpoint that was somehow deleted out from under the UI just recreates it. */
    public void save(String id, JsonNode body) throws IOException {
        List<ObjectNode> endpoints = readAll();
        boolean found = false;
        for (int i = 0; i < endpoints.size(); i++) {
            if (id.equals(endpoints.get(i).path("id").asText(null))) {
                endpoints.set(i, toStored(id, body));
                found = true;
                break;
            }
        }
        if (!found) endpoints.add(toStored(id, body));
        writeAll(endpoints);
    }

    public void delete(String id) throws IOException {
        List<ObjectNode> endpoints = readAll();
        endpoints.removeIf(e -> id.equals(e.path("id").asText(null)));
        writeAll(endpoints);
    }

    private ObjectNode toStored(String id, JsonNode body) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("id", id);
        node.put("name", body.path("name").asText("New mock endpoint"));
        node.put("method", body.path("method").asText("*"));
        node.put("path", body.path("path").asText("/"));
        node.put("statusCode", body.path("statusCode").asInt(200));
        node.put("contentType", body.path("contentType").asText("application/json"));
        node.set("responseHeaders", body.path("responseHeaders").isObject() ? body.path("responseHeaders") : objectMapper.createObjectNode());
        node.put("responseBody", body.path("responseBody").asText(""));
        node.put("enabled", body.path("enabled").asBoolean(true));
        return node;
    }

    // ── Serving ──────────────────────────────────────────────────────────────

    /** One matched (or not) mock response — statusCode/contentType/responseHeaders/responseBody
     *  ready to write straight onto an HTTP response, or null (via #findMatch) if nothing fired. */
    public static final class MatchResult {
        public final int statusCode;
        public final String contentType;
        public final Map<String, String> responseHeaders;
        public final String responseBody;
        MatchResult(ObjectNode e) {
            this.statusCode = e.path("statusCode").asInt(200);
            this.contentType = e.path("contentType").asText("application/json");
            Map<String, String> headers = new LinkedHashMap<>();
            e.path("responseHeaders").fields().forEachRemaining(f -> headers.put(f.getKey(), f.getValue().asText("")));
            this.responseHeaders = headers;
            this.responseBody = e.path("responseBody").asText("");
        }
    }

    /** Finds the best-matching ENABLED endpoint for a method + path (the path already stripped
     *  of the "/mock" listener prefix — see MockController), or null if nothing matches. */
    public MatchResult findMatch(String method, String path) throws IOException {
        List<String> actualSegs = segments(path);
        ObjectNode best = null;
        int bestSpecificity = -1;
        for (ObjectNode e : readAll()) {
            if (!e.path("enabled").asBoolean(true)) continue;
            String em = e.path("method").asText("*");
            if (!"*".equals(em) && !em.equalsIgnoreCase(method)) continue;
            List<String> templateSegs = segments(e.path("path").asText(""));
            if (!templateMatches(templateSegs, actualSegs)) continue;
            int specificity = specificity(templateSegs);
            if (specificity > bestSpecificity) {
                best = e;
                bestSpecificity = specificity;
            }
        }
        return best != null ? new MatchResult(best) : null;
    }

    private static List<String> segments(String path) {
        List<String> result = new ArrayList<>();
        if (path == null) return result;
        for (String s : path.split("/")) if (!s.isEmpty()) result.add(s);
        return result;
    }

    private static boolean isParam(String seg) {
        return seg.startsWith("{") && seg.endsWith("}");
    }

    private static boolean templateMatches(List<String> template, List<String> actual) {
        if (template.size() != actual.size()) return false;
        for (int i = 0; i < template.size(); i++) {
            String t = template.get(i);
            if (!isParam(t) && !t.equals(actual.get(i))) return false;
        }
        return true;
    }

    private static int specificity(List<String> template) {
        int count = 0;
        for (String seg : template) if (!isParam(seg)) count++;
        return count;
    }
}
