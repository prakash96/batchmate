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
 * Sequential by default; the caller (RunAllReportModal's "Run in parallel" checkbox) can opt into
 * concurrent execution instead — see runAll(collectionId, parallel). Nested Call Request chains
 * (re)deploy the same Camel route id for a callee on every run, which used to make concurrent
 * top-level runs unsafe if two of them shared a callee; RequestExecutionService now guards that
 * exact deploy+invoke critical section with a per-request-id lock (see its own routeLock comment),
 * so distinct request ids genuinely run in parallel and only actual same-id contention serializes.
 *
 * The resulting report is persisted (one JSON file per collection, under apitester-data/
 * run-all-reports/) so the sidebar's "last report" icon can show it later without re-running
 * anything — see getLastReport.
 */
@Service
public class CollectionRunService {

    private static final Logger log = LoggerFactory.getLogger(CollectionRunService.class);
    private static final String REPORTS_SUBDIR = "run-all-reports";
    // Bounds how many main requests actually fire at once in parallel mode — unbounded concurrency
    // here would mean firing every main request's HTTP call simultaneously, which is more a stress
    // test than a functional "Run All". Matches run-all-api.xml's parallel-foreach maxConcurrency.
    private static final int PARALLEL_MAX_CONCURRENCY = 5;

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
        return runAll(collectionId, false);
    }

    public Map<String, Object> runAll(String collectionId, boolean parallel) throws IOException {
        List<JsonNode> mainRequests = findMainRequests(collectionId);
        String collectionName = collectionName(collectionId);
        long startMs = System.currentTimeMillis();

        List<Map<String, Object>> results = parallel ? runParallel(mainRequests) : runSequential(mainRequests);
        int passedCount = 0, failedCount = 0;
        for (Map<String, Object> entry : results) {
            if ("success".equals(entry.get("status"))) passedCount++; else failedCount++;
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

    private List<Map<String, Object>> runSequential(List<JsonNode> mainRequests) {
        List<Map<String, Object>> results = new ArrayList<>();
        for (JsonNode req : mainRequests) results.add(runOne(req));
        return results;
    }

    /** Fires every main request's run() concurrently (bounded by PARALLEL_MAX_CONCURRENCY), then
     *  reassembles the results in the SAME order as mainRequests regardless of completion order —
     *  the report should read the same (row-for-row) whichever mode produced it. Safe against two
     *  main requests sharing a callee thanks to RequestExecutionService's own per-request-id lock
     *  (see its routeLock comment) — this method doesn't need to know or care which ones overlap. */
    private List<Map<String, Object>> runParallel(List<JsonNode> mainRequests) {
        java.util.concurrent.ExecutorService pool =
                java.util.concurrent.Executors.newFixedThreadPool(Math.max(1, Math.min(PARALLEL_MAX_CONCURRENCY, mainRequests.size())));
        try {
            List<java.util.concurrent.Future<Map<String, Object>>> futures = new ArrayList<>();
            for (JsonNode req : mainRequests) futures.add(pool.submit(() -> runOne(req)));
            List<Map<String, Object>> results = new ArrayList<>(futures.size());
            for (java.util.concurrent.Future<Map<String, Object>> f : futures) {
                try {
                    results.add(f.get());
                } catch (Exception e) {
                    // runOne() itself never throws (see its own try/catch) — a Future only throws
                    // here for something outside that, e.g. thread-pool-level interruption.
                    Map<String, Object> failed = new LinkedHashMap<>();
                    failed.put("status", "failed");
                    failed.put("error", e.getMessage());
                    failed.put("durationMs", 0L);
                    failed.put("checksPassed", 0L);
                    failed.put("checksFailed", 0L);
                    failed.put("checksTotal", 0L);
                    results.add(failed);
                }
            }
            return results;
        } finally {
            pool.shutdown();
        }
    }

    /** Runs ONE main request and builds its report entry — never throws (a failure becomes a
     *  "failed" entry instead), same contract both runSequential and runParallel rely on. */
    private Map<String, Object> runOne(JsonNode req) {
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
        return entry;
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
