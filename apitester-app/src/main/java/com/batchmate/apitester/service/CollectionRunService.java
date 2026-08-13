package com.batchmate.apitester.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;

/**
 * "Run All" for a collection: runs every MAIN request in it — a request is "main" if no OTHER
 * request anywhere in the app calls it via a Call Request step (in either its preRequest or
 * postResponse list). A request that only ever runs as part of a chain (e.g. ENCRYPTION/DECRYPTION,
 * called from Main) is deliberately excluded — running it standalone wouldn't exercise anything a
 * real workflow doesn't already cover, and would double-count it in the consolidated report.
 *
 * Runs are SEQUENTIAL, not parallel: nested Call Request chains (re)deploy the same Camel route id
 * for a callee, and doing that concurrently from two different top-level "main" runs at once isn't
 * something the route-deploy/producer-template plumbing is built to handle safely.
 *
 * The resulting report is persisted (one JSON file per collection, under apitester-data/
 * run-all-reports/) so the sidebar's "last report" icon can show it later without re-running
 * anything — see getLastReport.
 */
@Service
public class CollectionRunService {

    private static final Logger log = LoggerFactory.getLogger(CollectionRunService.class);
    private static final String REPORTS_SUBDIR = "run-all-reports";

    private final RequestService requestService;
    private final CollectionService collectionService;
    private final RequestExecutionService executionService;
    private final ObjectMapper objectMapper;

    public CollectionRunService(RequestService requestService,
                                 CollectionService collectionService,
                                 RequestExecutionService executionService,
                                 ObjectMapper objectMapper) {
        this.requestService = requestService;
        this.collectionService = collectionService;
        this.executionService = executionService;
        this.objectMapper = objectMapper;
    }

    // ── Run all ────────────────────────────────────────────────────────────────

    public Map<String, Object> runAll(String collectionId) throws IOException {
        List<JsonNode> mainRequests = findMainRequests(collectionId);
        String collectionName = collectionName(collectionId);

        List<Map<String, Object>> results = new ArrayList<>();
        int passedCount = 0, failedCount = 0;
        long startMs = System.currentTimeMillis();

        for (JsonNode req : mainRequests) {
            String id = req.path("id").asText();
            String name = req.path("name").asText(id);

            Map<String, Object> runResult;
            try {
                runResult = executionService.run(id, Collections.emptyMap());
            } catch (Exception e) {
                log.warn("Run All: request '{}' ({}) threw: {}", name, id, e.getMessage());
                runResult = new LinkedHashMap<>();
                runResult.put("status", "failed");
                runResult.put("error", e.getMessage());
                runResult.put("durationMs", 0L);
            }

            List<Map<String, Object>> checks = flattenChecks(runResult);
            long checksPassed = checks.stream().filter(c -> Boolean.TRUE.equals(c.get("passed"))).count();
            long checksFailed = checks.stream().filter(c -> Boolean.FALSE.equals(c.get("passed"))).count();
            boolean ok = "success".equals(String.valueOf(runResult.get("status"))) && checksFailed == 0;
            if (ok) passedCount++; else failedCount++;

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("requestId", id);
            entry.put("requestName", name);
            entry.put("status", ok ? "success" : "failed");
            entry.put("durationMs", runResult.get("durationMs"));
            entry.put("error", runResult.get("error"));
            entry.put("checksPassed", checksPassed);
            entry.put("checksFailed", checksFailed);
            entry.put("checksTotal", (long) checks.size());
            entry.put("fullResult", runResult);
            results.add(entry);
        }

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("collectionId", collectionId);
        report.put("collectionName", collectionName);
        report.put("runAt", Instant.now().toString());
        report.put("totalRequests", mainRequests.size());
        report.put("passedRequests", passedCount);
        report.put("failedRequests", failedCount);
        report.put("durationMs", System.currentTimeMillis() - startMs);
        report.put("results", results);

        saveReport(collectionId, report);
        return report;
    }

    /** Pulls every check (Response Validation) result out of a single run() result, flattening the
     *  Input Data Set "iterating" wrapper's per-iteration checks into one list if present. */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> flattenChecks(Map<String, Object> runResult) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (Boolean.TRUE.equals(runResult.get("iterating"))) {
            Object iterations = runResult.get("iterations");
            if (iterations instanceof List) {
                for (Object it : (List<?>) iterations) {
                    if (it instanceof Map) addChecks((Map<String, Object>) it, out);
                }
            }
        } else {
            addChecks(runResult, out);
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private void addChecks(Map<String, Object> result, List<Map<String, Object>> out) {
        Object checks = result.get("checks");
        if (checks instanceof List) {
            for (Object c : (List<?>) checks) if (c instanceof Map) out.add((Map<String, Object>) c);
        }
    }

    // ── Main-request detection ───────────────────────────────────────────────────

    /** Every request under this collection (including sub-folders) that no OTHER request anywhere
     *  calls via a Call Request step — see the class javadoc for why "called" requests are excluded. */
    public List<JsonNode> findMainRequests(String collectionId) throws IOException {
        Set<String> scopeIds = collectSubtreeIds(collectionId);
        List<JsonNode> allRequests = requestService.list();

        Set<String> calledIds = new HashSet<>();
        for (JsonNode req : allRequests) {
            collectCallRequestIds(req.path("preRequest"), calledIds);
            collectCallRequestIds(req.path("postResponse"), calledIds);
        }

        List<JsonNode> mainRequests = new ArrayList<>();
        for (JsonNode req : allRequests) {
            String reqCollectionId = req.path("collectionId").asText(null);
            String reqId = req.path("id").asText(null);
            if (reqCollectionId != null && scopeIds.contains(reqCollectionId)
                    && reqId != null && !calledIds.contains(reqId)) {
                mainRequests.add(req);
            }
        }
        return mainRequests;
    }

    private void collectCallRequestIds(JsonNode steps, Set<String> out) {
        if (steps == null || !steps.isArray()) return;
        for (JsonNode step : steps) {
            if ("callRequest".equals(step.path("type").asText(""))) {
                String targetId = step.path("requestId").asText("").trim();
                if (!targetId.isEmpty()) out.add(targetId);
            }
        }
    }

    /** This collection's own id plus every descendant folder's id — requests are attached to
     *  whichever folder/collection node they were saved directly under (see CollectionService),
     *  so "requests in this collection" means matching any id in this whole subtree. */
    private Set<String> collectSubtreeIds(String collectionId) throws IOException {
        List<ObjectNode> collections = collectionService.readCollections();
        ObjectNode found = findNode(collections, collectionId);
        Set<String> ids = new HashSet<>();
        if (found != null) collectIds(found, ids);
        else ids.add(collectionId); // not found in the tree — fall back to an exact-match-only scope
        return ids;
    }

    private String collectionName(String collectionId) throws IOException {
        ObjectNode col = collectionService.findCollection(collectionId);
        return col != null ? col.path("name").asText(collectionId) : collectionId;
    }

    private ObjectNode findNode(List<ObjectNode> nodes, String id) {
        for (ObjectNode n : nodes) {
            if (id.equals(n.path("id").asText(null))) return n;
            ObjectNode found = findNode(toObjectNodeList(n.path("folders")), id);
            if (found != null) return found;
        }
        return null;
    }

    private void collectIds(ObjectNode node, Set<String> out) {
        String id = node.path("id").asText(null);
        if (id != null) out.add(id);
        for (ObjectNode child : toObjectNodeList(node.path("folders"))) collectIds(child, out);
    }

    private List<ObjectNode> toObjectNodeList(JsonNode arr) {
        List<ObjectNode> result = new ArrayList<>();
        if (arr != null && arr.isArray()) arr.forEach(n -> { if (n.isObject()) result.add((ObjectNode) n); });
        return result;
    }

    // ── Report persistence ────────────────────────────────────────────────────

    private Path reportsDir() {
        return requestService.baseDir().resolve(REPORTS_SUBDIR);
    }

    private void saveReport(String collectionId, Map<String, Object> report) throws IOException {
        Path dir = reportsDir();
        Files.createDirectories(dir);
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(dir.resolve(collectionId + ".json").toFile(), report);
    }

    /** The last persisted Run All report for this collection, or null if it's never been run. */
    public Map<String, Object> getLastReport(String collectionId) throws IOException {
        Path file = reportsDir().resolve(collectionId + ".json");
        if (!Files.exists(file)) return null;
        return objectMapper.readValue(file.toFile(), new TypeReference<Map<String, Object>>() {});
    }
}
