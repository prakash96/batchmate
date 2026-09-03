package com.batchmate.apitester.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.batchmate.apitester.camel.JsLanguage;
import com.batchmate.apitester.camel.RequestToCamelAdapter;
import org.apache.camel.Exchange;
import org.apache.camel.ProducerTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Path;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Orchestrates request runs. Two shapes at the public entry point:
 *
 * - Normal: one call = pre-request Call Request chain (Java, sequential) → request +
 *   post-response checks (one linear Camel route, built by RequestToCamelAdapter) →
 *   post-response Call Request chain → captured result.
 * - Iterating: when the Request tab's Input is set to "dataset" and inputDataSets is
 *   non-empty, the ENTIRE pipeline above runs once per entry (N independent single-runs,
 *   each entry's body/headers seeding that iteration), and the results come back as one
 *   {@code {iterating:true, iterations:[...]}} wrapper — see the public run() overload.
 *
 * "Call Request" is the only pre-request step type, and one of several post-response step types
 * (alongside Set Variable, Assertion, JSON/Text Compare, DB Check, Wait). It doesn't need to be a
 * Camel node type: it's resolved here by recursively invoking the single-run method for the
 * referenced request, plain Java control flow since it's inherently sequential. It always chains
 * from whatever the previous step returned (pre-request: the prior Call Request's response, or
 * nothing for the first one; post-response: the prior Call Request's response, or THIS request's
 * own response for the first one) — see {@link Payload}/{@link #executeCallRequestStep}. Call
 * Request, Set Variable, and Assertion all run in TRUE list order relative to each other (Java-
 * orchestrated — see POST_RESPONSE_ORCHESTRATED_TYPES); JSON/Text Compare and DB Check remain
 * Camel-embedded and still always run BEFORE all three, regardless of listed order.
 *
 * Order per run/iteration is always pre-request → request → post-response: the Pre-Request
 * chain's final payload is bound as the "body"/"headers" JS globals for the Request tab's own
 * Input templates (its "body" field and each enabled "headers" row — see evalTemplate), which
 * are evaluated to build what this request ACTUALLY sends; only after that response comes back
 * does the post-response chain run (seeded by this request's own response, not the input). A
 * post-response chain just runs for effect — nothing feeds back into this request.
 */
@Service
public class RequestExecutionService {

    private static final Logger log = LoggerFactory.getLogger(RequestExecutionService.class);
    private static final int MAX_DEPTH = 5;
    private static final Pattern DOLLAR_EXPR = Pattern.compile("\\$\\{([^}]*)\\}");

    private final RequestService requestService;
    private final CollectionService collectionService;
    private final GlobalVarsService globalVarsService;
    private final RequestToCamelAdapter camelAdapter;
    private final CamelRouteDeployService camelDeployService;
    private final ProducerTemplate producerTemplate;
    private final ObjectMapper objectMapper;

    // Per-request-id lock guarding "deploy this request's Camel route, then invoke it" as ONE
    // atomic critical section (see the deploy+send call site below) — CollectionRunService's own
    // "Run All (parallel)" mode can now call run() for several DIFFERENT main requests
    // concurrently, but if two of them share a callee (e.g. two main flows both Call-Request the
    // same "Get Auth Token" utility request), running that SAME request id's deploy+invoke on two
    // threads at once would race on CamelRouteDeployService's remove-then-add-by-id deploy —
    // corrupting or dropping one run. Locking per id (not one global lock) means distinct request
    // ids still run fully concurrently; only actual same-id contention ever serializes, and only
    // briefly. Grows one entry per distinct request id ever run for the life of the app — bounded
    // by how many requests exist, never by how many times they're run, so not a real leak.
    private final java.util.concurrent.ConcurrentHashMap<String, Object> routeLocks = new java.util.concurrent.ConcurrentHashMap<>();

    private Object routeLock(String requestId) {
        return routeLocks.computeIfAbsent(requestId, k -> new Object());
    }

    public RequestExecutionService(RequestService requestService,
                                    CollectionService collectionService,
                                    GlobalVarsService globalVarsService,
                                    RequestToCamelAdapter camelAdapter,
                                    CamelRouteDeployService camelDeployService,
                                    ProducerTemplate producerTemplate,
                                    ObjectMapper objectMapper) {
        this.requestService = requestService;
        this.collectionService = collectionService;
        this.globalVarsService = globalVarsService;
        this.camelAdapter = camelAdapter;
        this.camelDeployService = camelDeployService;
        this.producerTemplate = producerTemplate;
        this.objectMapper = objectMapper;
    }

    /** A body + headers pair flowing through a Call Request chain, or seeding one iteration of a
     *  data-set-driven run. null body/headers mean "nothing to override". */
    private static final class Payload {
        final String body;
        final Map<String, String> headers;
        Payload(String body, Map<String, String> headers) { this.body = body; this.headers = headers; }
        static final Payload EMPTY = new Payload(null, null);
    }

    /** A Call Request step's log entry, the payload its callee returned (for chaining), and the
     *  callee's own final vars (including whatever ITS post-response Set Variable steps set) —
     *  merged back into the caller's vars so a variable set in a called request's post-response
     *  is available to the caller afterward, not just within the callee itself. */
    private static final class CallResult {
        final Map<String, Object> log;
        final Payload resultPayload;
        final Map<String, Object> subVars;
        CallResult(Map<String, Object> log, Payload resultPayload, Map<String, Object> subVars) {
            this.log = log;
            this.resultPayload = resultPayload;
            this.subVars = subVars;
        }
    }

    /** Thrown by runAssertionStep when a "stop"-type assertion fails, carrying the check result so
     *  the caller can still record it (as failed) before halting the post-response loop and marking
     *  the whole run as failed — mirroring how a Camel-embedded stop-assertion failure surfaces as
     *  the run's own status/error. */
    private static final class PostResponseAssertionFailedException extends RuntimeException {
        final Map<String, Object> checkResult;
        PostResponseAssertionFailedException(String message, Map<String, Object> checkResult) {
            super(message);
            this.checkResult = checkResult;
        }
    }

    /**
     * Public entry point. If this request's Input is set to a (non-empty) Input Data Set, runs
     * the whole pipeline once per entry — N independent single-runs, iteration only ever applies
     * at this top level (a nested Call Request always just chains the previous response, regardless
     * of the callee's own Input setting — iterating mid-chain wouldn't have a single "previous"
     * response to hand the next link). Otherwise behaves as a single run, unchanged.
     *
     * Loads the persisted global variables (see GlobalVarsService) here, once, as the "floor" fed
     * into every run/iteration/recursive Call Request — this used to be whatever the client sent
     * as "overrideVars" (the frontend merged its own localStorage-persisted globals in before
     * calling), which meant global variables only ever existed in one browser's local storage,
     * never shared or backed up. "overrideVars" (the request body's own "variables" field) is now
     * a genuinely separate, optional, per-run override — still the HIGHEST-precedence tier (see
     * the private run() overload's merge order), just no longer doubling as globals' source.
     */
    public Map<String, Object> run(String requestId, Map<String, Object> overrideVars) {
        JsonNode reqNode;
        try {
            reqNode = requestService.findById(requestId);
        } catch (IOException e) {
            throw new RuntimeException("Could not load request " + requestId + ": " + e.getMessage(), e);
        }
        if (reqNode == null) throw new RuntimeException("Request not found: " + requestId);

        Map<String, Object> globalVars;
        try {
            // Global vars now come from THIS request's own workspace (via its collection) — a
            // request whose collection has no workspace (the "Unassigned" bucket) gets none at
            // all, matching apitester-mule's "workspace_id = :wsId never matches NULL" behavior.
            String workspaceId = resolveWorkspaceId(reqNode.path("collectionId").asText(null));
            globalVars = globalVarsService.readAsMap(workspaceId);
        } catch (IOException e) {
            log.warn("Failed to load global variables, proceeding with none: {}", e.getMessage());
            globalVars = Collections.emptyMap();
        }

        JsonNode inputDataSets = reqNode.path("inputDataSets");
        boolean iterating = "dataset".equals(reqNode.path("request").path("inputSource").asText("previous"))
            && inputDataSets.isArray() && inputDataSets.size() > 0;

        if (!iterating) {
            return run(requestId, overrideVars, 0, new LinkedHashSet<>(), globalVars, null, null);
        }

        // Data-set entries are evaluated as templates (see payloadFromEntry) before the pipeline
        // even starts, so they need the same global+override vars visible to everything else.
        Map<String, Object> seedVars = new LinkedHashMap<>();
        if (globalVars != null) seedVars.putAll(globalVars);
        if (overrideVars != null) seedVars.putAll(overrideVars);

        long startMs = System.currentTimeMillis();
        List<Map<String, Object>> iterations = new ArrayList<>();
        boolean anyFailed = false;
        int index = 0;
        for (JsonNode entry : inputDataSets) {
            Payload seed = payloadFromEntry(entry, seedVars);
            Map<String, Object> iterResult = run(requestId, overrideVars, 0, new LinkedHashSet<>(), globalVars, seed.body, seed.headers);
            Map<String, Object> withIndex = new LinkedHashMap<>(iterResult);
            withIndex.put("iterationIndex", index);
            // The Input Data Set entry's own scenario name (e.g. "SOURCE_ID" empty string" — see
            // swaggerImport.js's negativeVariantsForSchema) — shown by apitester-ui instead of a
            // bare "Iteration N" wherever this iteration's result is displayed. Absent/blank →
            // null, same as it was never set (ResponseViewer falls back to "Iteration N" itself).
            String scenarioName = entry.path("name").asText(null);
            if (scenarioName != null && !scenarioName.isBlank()) withIndex.put("scenarioName", scenarioName);
            iterations.add(withIndex);
            if (!"success".equals(iterResult.get("status"))) anyFailed = true;
            index++;
        }

        Map<String, Object> batch = new LinkedHashMap<>();
        batch.put("runId", "run-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12));
        batch.put("requestId", requestId);
        batch.put("iterating", true);
        batch.put("status", anyFailed ? "failed" : "success");
        batch.put("durationMs", System.currentTimeMillis() - startMs);
        batch.put("iterations", iterations);
        return batch;
    }

    /** Resolves the workspace a collection (and therefore any request in it) belongs to, or null
     *  for an unassigned/missing collection — used to pick the right global-vars "floor" (see
     *  GlobalVarsService's per-workspace storage) without an extra file read: CollectionService
     *  already keeps workspaceId on the collection node returned here. */
    private String resolveWorkspaceId(String collectionId) {
        if (collectionId == null || collectionId.isBlank()) return null;
        try {
            ObjectNode col = collectionService.findCollection(collectionId);
            return col != null ? col.path("workspaceId").asText(null) : null;
        } catch (IOException e) {
            return null;
        }
    }

    /**
     * @param callerBodyOverride    body a parent Call Request step (or the top-level iteration
     *                              loop, seeding one entry) is feeding into this run, or null if
     *                              none (plain top-level call, or the parent had nothing to send).
     * @param callerHeaderOverrides headers a parent Call Request step is feeding into this run.
     */
    private Map<String, Object> run(String requestId, Map<String, Object> overrideVars, int depth, Set<String> chain,
                                     Map<String, Object> globalVars, String callerBodyOverride, Map<String, String> callerHeaderOverrides) {
        if (depth > MAX_DEPTH) {
            throw new RuntimeException("callRequest chain too deep (>" + MAX_DEPTH + ") at request " + requestId);
        }
        if (chain.contains(requestId)) {
            throw new RuntimeException("callRequest cycle detected: " + String.join(" -> ", chain) + " -> " + requestId);
        }
        chain.add(requestId);

        String runId = "run-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        long startMs = System.currentTimeMillis();

        JsonNode reqNode;
        try {
            reqNode = requestService.findById(requestId);
        } catch (IOException e) {
            throw new RuntimeException("Could not load request " + requestId + ": " + e.getMessage(), e);
        }
        if (reqNode == null) throw new RuntimeException("Request not found: " + requestId);
        String requestName = reqNode.path("name").asText(requestId);

        // Seed vars: global floor (lowest) ∪ this request's own collection variables ∪
        // overrideVars (highest — explicit wins).
        Map<String, Object> vars = new LinkedHashMap<>();
        if (globalVars != null) vars.putAll(globalVars);
        String collectionId = reqNode.path("collectionId").asText(null);
        if (collectionId != null && !collectionId.isBlank()) {
            try {
                ObjectNode col = collectionService.findCollection(collectionId);
                if (col != null && col.path("variables").isObject()) {
                    col.path("variables").fields().forEachRemaining(e -> vars.put(e.getKey(), e.getValue().asText("")));
                }
            } catch (IOException ignored) {}
        }
        if (overrideVars != null) vars.putAll(overrideVars);
        // Referenced by RequestToCamelAdapter's "${vars.__throwOff}" URL marker — see its
        // comment for why this indirection (rather than a bare literal) is needed. Set after
        // overrideVars so a caller can't accidentally clobber it via a "variables" override.
        vars.put("__throwOff", "false");

        // Pre-request Call Request chain: starts from whatever the parent call (or the top-level
        // iteration loop) fed in; each step's response becomes the "previous" for the next one,
        // and the chain's FINAL payload becomes this request's own outgoing body/headers.
        List<Map<String, Object>> preRequestLog = new ArrayList<>();
        Payload preChain = new Payload(callerBodyOverride, callerHeaderOverrides);
        JsonNode preRequest = reqNode.path("preRequest");
        if (preRequest.isArray()) {
            for (JsonNode step : preRequest) {
                if (!"callRequest".equals(step.path("type").asText(""))) continue; // tolerate stray legacy step types
                CallResult result = executeCallRequestStep(step, preChain, depth, chain, globalVars);
                preRequestLog.add(result.log);
                preChain = result.resultPayload;
                // Variables set in the CALLEE's own post-response flow back up into this request's
                // own vars immediately, so they're visible to this request's Input tab templates
                // (finalBody/finalHeaders below), the request itself, and its own post-response.
                vars.putAll(result.subVars);
            }
        }
        // Input tab: the Pre-Request chain's final payload is bound as "body"/"headers" (raw,
        // unparsed — a bare "${body}" is always an exact byte-for-byte passthrough; field access
        // like "${JSON.parse(body).field}" works too via GraalJS's built-in JSON). "body" is
        // evaluated as a template that REPLACES the outgoing body outright. Headers are NOT
        // auto-inherited from the chain (a response's headers — CORS/cache/etc. — aren't generally
        // sensible as the next request's own headers); only explicitly-listed "headers" rows are
        // sent, though a row's value can still reach into the chain's headers via "${headers.X}".
        JsonNode requestConfig = reqNode.path("request");
        String finalBody = evalTemplate(requestConfig.path("body").asText(""), preChain.body, preChain.headers, vars);
        Map<String, String> finalHeaders = new LinkedHashMap<>();
        JsonNode headerRows = requestConfig.path("headers");
        if (headerRows.isArray()) {
            for (JsonNode row : headerRows) {
                if (!row.path("enabled").asBoolean(true)) continue;
                String key = row.path("key").asText("").trim();
                if (key.isEmpty()) continue;
                finalHeaders.keySet().removeIf(k -> k.equalsIgnoreCase(key));
                finalHeaders.put(key, evalTemplate(row.path("value").asText(""), preChain.body, preChain.headers, vars));
            }
        }

        // Build + deploy the linear Camel route for the Request + Post-Response check sections.
        // callRequest/setVariable entries in postResponse are Java-orchestrated (see
        // postResponseChecksOnly's javadoc) and must not reach the Camel adapter — it only knows
        // the check/wait node types.
        JsonNode postResponse = reqNode.path("postResponse");
        JsonNode postResponseChecks = postResponseChecksOnly(postResponse);
        List<JsonNode> postResponseSteps = postResponseOrchestratedSteps(postResponse);

        JsonNode requestSection = buildFinalRequestSection(requestConfig, finalHeaders, finalBody);
        String yaml = camelAdapter.convert(requestId, requestSection, postResponseChecks);
        String status;
        String error = null;
        Exchange resultExchange = null;
        try {
            Path yamlPath = requestService.saveCamelYaml(requestId, yaml);
            // See routeLock's own comment — deploy-then-invoke for THIS request id must be atomic
            // with respect to any other thread doing the same for the SAME id.
            synchronized (routeLock(requestId)) {
                camelDeployService.deploy(requestId, yamlPath);
                resultExchange = producerTemplate.send("direct:" + requestId, e -> {
                    e.getMessage().setBody(null);
                    vars.forEach(e::setProperty);
                });
            }
            Exception ex = resultExchange.getException();
            if (ex != null) throw new RuntimeException(ex.getMessage(), ex);
            status = "success";
        } catch (Exception e) {
            status = "failed";
            error = e.getMessage();
            log.warn("Request '{}' run failed: {}", requestName, error);
        }
        long durationMs = System.currentTimeMillis() - startMs;

        Map<String, Object> response = captureResponse(resultExchange);
        Map<String, Object> finalVars = captureVars(resultExchange);
        List<Map<String, Object>> checks = buildCheckResults(postResponseChecks, resultExchange, status, error);

        // Post-response Call Request chain: starts from THIS request's own response (matching
        // "response of main REQUEST, with headers, passed as body/headers to post-response"), and
        // subsequent chained calls (if any) see the prior call's response as "previous". Runs after
        // every check regardless of listed order — see postResponseChecksOnly's javadoc. A
        // "setVariable" step updates postVars, which becomes part of the "global floor" (see run()'s
        // javadoc) for every callRequest step AFTER it — so a variable set here is available
        // throughout the callee's ENTIRE pipeline (its own pre-request → request Input tab →
        // post-response), the same way an actual global variable already is.
        List<Map<String, Object>> postResponseLog = new ArrayList<>();
        List<Map<String, Object>> assertionChecks = new ArrayList<>();
        Payload postChain = payloadFromResponse(response);
        Map<String, Object> postVars = new LinkedHashMap<>(finalVars);
        for (JsonNode step : postResponseSteps) {
            String stepType = step.path("type").asText("");
            if ("setVariable".equals(stepType)) {
                postResponseLog.add(runSetVariableStep(step, postChain, postVars));
            } else if ("assertion".equals(stepType)) {
                try {
                    assertionChecks.add(runAssertionStep(step, postChain, postVars));
                } catch (PostResponseAssertionFailedException e) {
                    assertionChecks.add(e.checkResult);
                    status = "failed";
                    if (error == null) error = e.getMessage();
                    break; // "stop" semantics — halt remaining post-response steps
                }
            } else { // callRequest
                Map<String, Object> effectiveFloor = new LinkedHashMap<>();
                if (globalVars != null) effectiveFloor.putAll(globalVars);
                effectiveFloor.putAll(postVars);
                CallResult result = executeCallRequestStep(step, postChain, depth, chain, effectiveFloor);
                postResponseLog.add(result.log);
                postChain = result.resultPayload;
                // Variables set in the CALLEE's own post-response flow back up into this request's
                // own postVars, so they're visible to subsequent post-response steps here AND end up
                // in this request's own final "vars" below — propagating up the caller chain too.
                postVars.putAll(result.subVars);
            }
        }
        finalVars.putAll(postVars);

        // Re-interleave the (still Camel-embedded) dbcheck/jsoncompare/textcompare results with
        // the Java-orchestrated assertion results back into the postResponse list's TRUE original
        // order for the "checks" the UI shows — both sub-lists already preserve their own subset's
        // relative order, so one simultaneous walk over the original list re-merges them correctly.
        List<Map<String, Object>> finalChecks = new ArrayList<>();
        Iterator<Map<String, Object>> camelCheckIter = checks.iterator();
        Iterator<Map<String, Object>> assertionCheckIter = assertionChecks.iterator();
        if (postResponse.isArray()) {
            for (JsonNode step : postResponse) {
                String stepType = step.path("type").asText("");
                if ("assertion".equals(stepType)) {
                    if (assertionCheckIter.hasNext()) {
                        finalChecks.add(assertionCheckIter.next());
                    } else {
                        // A prior Java-orchestrated "stop" failure halted the loop before this one ran.
                        String name = step.path("name").asText("").trim();
                        Map<String, Object> skipped = new LinkedHashMap<>();
                        skipped.put("name", name.isEmpty() ? "Assertion" : name);
                        skipped.put("type", "assertion");
                        skipped.put("passed", null);
                        skipped.put("message", "not run — a prior check stopped execution");
                        finalChecks.add(skipped);
                    }
                } else if ("jsoncompare".equals(stepType) || "textcompare".equals(stepType) || "dbcheck".equals(stepType)) {
                    if (camelCheckIter.hasNext()) finalChecks.add(camelCheckIter.next());
                }
            }
        }
        checks = finalChecks;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("runId", runId);
        result.put("requestId", requestId);
        result.put("status", status);
        if (error != null) result.put("error", error);
        result.put("durationMs", durationMs);
        result.put("preRequestLog", preRequestLog);
        result.put("sentBody", finalBody);
        result.put("sentHeaders", finalHeaders);
        result.put("response", response);
        result.put("vars", finalVars);
        result.put("checks", checks);
        result.put("postResponseLog", postResponseLog);

        try {
            requestService.saveLog(requestId, runId, status, objectMapper.valueToTree(result));
        } catch (IOException e) {
            log.error("Failed to write run log for {}: {}", requestId, e.getMessage());
        }
        return result;
    }

    // ── Call Request execution ──────────────────────────────────────────────

    /**
     * Executes one Call Request step: chains from the previous step's response, calls the target
     * request with that as its outgoing body/headers, and returns the callee's response as the
     * payload for whatever comes next in the chain, PLUS the callee's own final vars (so a
     * variable the callee's post-response set — bound to the callee's OWN response — flows back
     * up into the caller's vars too, not just forward to steps after it within the callee). On
     * failure, the previous payload/vars are passed through unchanged (so a broken call doesn't
     * wipe out a chain state — the failure itself is still logged via "subError").
     */
    private CallResult executeCallRequestStep(JsonNode step, Payload previousPayload,
                                               int depth, Set<String> chain, Map<String, Object> globalVars) {
        Map<String, Object> log = new LinkedHashMap<>();
        String targetId = step.path("requestId").asText("").trim();
        log.put("requestId", targetId);
        if (targetId.isEmpty()) return new CallResult(log, previousPayload, Collections.emptyMap());

        Payload input = previousPayload != null ? previousPayload : Payload.EMPTY;
        log.put("inputBody", input.body);
        log.put("inputHeaders", input.headers);

        try {
            Map<String, Object> subResult = run(targetId, Collections.emptyMap(), depth + 1, new LinkedHashSet<>(chain),
                globalVars, input.body, input.headers);
            log.put("subRunId", subResult.get("runId"));
            log.put("subStatus", subResult.get("status"));

            Payload resultPayload;
            Map<String, Object> subVars;
            if ("success".equals(subResult.get("status"))) {
                @SuppressWarnings("unchecked")
                Map<String, Object> subResponse = (Map<String, Object>) subResult.get("response");
                resultPayload = payloadFromResponse(subResponse);
                @SuppressWarnings("unchecked")
                Map<String, Object> vars = (Map<String, Object>) subResult.get("vars");
                subVars = vars != null ? vars : Collections.emptyMap();
                log.put("subResponseStatus", subResponse != null ? subResponse.get("status") : null);
                log.put("subResponseBody", subResponse != null ? subResponse.get("body") : null);
            } else {
                // On failure the exchange's body is whatever was set right before the failed HTTP
                // call ran (the outgoing payload, not a real response) — surface the actual error
                // instead of a misleading "response".
                log.put("subError", subResult.get("error"));
                resultPayload = previousPayload;
                subVars = Collections.emptyMap();
            }
            log.put("status", "ok");
            return new CallResult(log, resultPayload, subVars);
        } catch (Exception e) {
            log.put("status", "error");
            log.put("error", e.getMessage());
            return new CallResult(log, previousPayload, Collections.emptyMap());
        }
    }

    /**
     * Converts one raw Input Data Set entry ({body, headers:[{key,value,enabled}]}) into a Payload
     * — evaluated as a template (same ${...} conventions as the Input tab's own body/header fields,
     * see evalTemplate) rather than used as a literal, so e.g. "${new Date()}" for a fresh timestamp
     * per iteration, or "${vars.x}", actually evaluate instead of being sent as literal "${...}"
     * text (which would otherwise reach Camel's OWN "${...}" Simple language downstream and fail
     * with "unknown function", since that's a different templating system than this one).
     * There's no "previous" response yet at this point (it's the very first seed of the chain), so
     * body/headers bindings are empty here — only ${vars.x} and plain JS (like "new Date()") apply.
     */
    private Payload payloadFromEntry(JsonNode entry, Map<String, Object> vars) {
        if (entry == null) return Payload.EMPTY;
        String body = evalTemplate(entry.path("body").asText(""), null, Collections.emptyMap(), vars);
        Map<String, String> headers = new LinkedHashMap<>();
        JsonNode rows = entry.path("headers");
        if (rows.isArray()) {
            for (JsonNode h : rows) {
                if (!h.path("enabled").asBoolean(true)) continue;
                String key = h.path("key").asText("").trim();
                if (!key.isEmpty()) headers.put(key, evalTemplate(h.path("value").asText(""), null, Collections.emptyMap(), vars));
            }
        }
        return new Payload(body, headers);
    }

    /** Turns a captured response (see captureResponse) into a Payload for the next chain link.
     *  Nothing here auto-forwards these headers wholesale as the NEXT request's actual outgoing
     *  headers — only explicitly-configured "headers" rows are ever sent (see the Input tab
     *  evaluation in run()) — so this is purely a READ source for "${headers.X}"/assertion
     *  "headers.X" access, and previously filtered out httpResponseCode/httpResponseText/
     *  httpMethod/etc. for no real benefit while actively breaking the single most common
     *  assertion target ("headers.httpResponseCode"). Kept unfiltered, matching what the old
     *  Camel-embedded assertion evaluation exposed (the raw exchange headers, no filtering). */
    private Payload payloadFromResponse(Map<String, Object> response) {
        if (response == null) return Payload.EMPTY;
        Object rawBody = response.get("body");
        String body = rawBody != null ? String.valueOf(rawBody) : null;
        Map<String, String> headers = new LinkedHashMap<>();
        Object rawHeaders = response.get("headers");
        if (rawHeaders instanceof Map) {
            for (Map.Entry<?, ?> e : ((Map<?, ?>) rawHeaders).entrySet()) {
                headers.put(String.valueOf(e.getKey()), e.getValue() != null ? String.valueOf(e.getValue()) : "");
            }
        }
        return new Payload(body, headers);
    }

    /** Post-response types resolved in Java (below), never handed to the Camel adapter — includes
     *  "assertion" (moved out of the Camel-embedded checks; see runAssertionStep's javadoc) in
     *  addition to callRequest/setVariable. jsoncompare/textcompare/dbcheck/wait remain Camel node
     *  types and still always run BEFORE every step in this set — see postResponseChecksOnly. */
    private static final Set<String> POST_RESPONSE_ORCHESTRATED_TYPES = Set.of("callRequest", "setVariable", "assertion");

    /**
     * Post-response "callRequest"/"setVariable"/"assertion" steps aren't Camel node types.
     * callRequest/setVariable never were (inherently sequential Java control flow, not something
     * Camel's route model expresses). "assertion" moved out too, specifically so it can evaluate
     * against whatever Call Request chain link precedes it in the list — previously (when it was
     * Camel-embedded like jsoncompare/textcompare/dbcheck still are) it always ran against the
     * CURRENT request's own main response, regardless of where it was positioned relative to a
     * Call Request step, which is wrong once a Call Request is meant to feed it. jsoncompare/
     * textcompare/dbcheck are still genuine Camel node types (RequestToCamelAdapter/CoreNodesPlugin),
     * so they're filtered out here and still run as part of the Camel route, strictly BEFORE every
     * step in POST_RESPONSE_ORCHESTRATED_TYPES, regardless of listed order (a real remaining
     * limitation for those three types — only callRequest/setVariable/assertion get true list-order
     * interleaving). Steps within POST_RESPONSE_ORCHESTRATED_TYPES DO run in true list order
     * relative to each other: a Set Variable before a Call Request is visible to it; an assertion
     * after a Call Request evaluates that callee's response; and so on.
     */
    private JsonNode postResponseChecksOnly(JsonNode postResponse) {
        if (postResponse == null || !postResponse.isArray()) return postResponse;
        ArrayNode filtered = objectMapper.createArrayNode();
        for (JsonNode c : postResponse) {
            if (!POST_RESPONSE_ORCHESTRATED_TYPES.contains(c.path("type").asText(""))) filtered.add(c);
        }
        return filtered;
    }

    private List<JsonNode> postResponseOrchestratedSteps(JsonNode postResponse) {
        List<JsonNode> steps = new ArrayList<>();
        if (postResponse != null && postResponse.isArray()) {
            for (JsonNode c : postResponse) {
                if (POST_RESPONSE_ORCHESTRATED_TYPES.contains(c.path("type").asText(""))) steps.add(c);
            }
        }
        return steps;
    }

    /**
     * Executes a Post-Response "Set Variable" step: evaluates its expression (a whole "${...}"
     * wrapper returns the raw value — numbers/booleans/objects survive — matching the historical
     * setVariable semantics; see evalExpressionValue) against the current post-response chain's
     * body/headers, and writes it into postVars for every step after it to see.
     */
    private Map<String, Object> runSetVariableStep(JsonNode step, Payload postChain, Map<String, Object> postVars) {
        Map<String, Object> log = new LinkedHashMap<>();
        log.put("type", "setVariable");
        String name = step.path("name").asText("").trim();
        try {
            if (!name.isEmpty()) {
                Object value = evalExpressionValue(step.path("expression").asText(""), postChain.body, postChain.headers, postVars);
                postVars.put(name, value);
                log.put("name", name);
                log.put("value", value);
            }
            log.put("status", "ok");
        } catch (Exception e) {
            log.put("status", "error");
            log.put("error", e.getMessage());
        }
        return log;
    }

    /**
     * Java-orchestrated equivalent of CoreNodesPlugin's Camel-embedded assertion converter — moved
     * out of the Camel route (unlike jsoncompare/textcompare/dbcheck, which stay Camel-embedded) so
     * it runs at its TRUE position in the postResponse list, evaluating against whatever Call
     * Request chain link precedes it (postChain/postVars) instead of always the main request's own
     * response. This also sidesteps entirely the byte[]-vs-String body quirk that plagues the
     * Camel/exchange-based path (see ConversionUtils.readHttpBody's javadoc), since it operates on
     * the ALREADY-decoded Payload.body (a proper String, from payloadFromResponse/captureResponse).
     */
    private Map<String, Object> runAssertionStep(JsonNode step, Payload postChain, Map<String, Object> postVars) {
        String name = step.path("name").asText("").trim();
        if (name.isEmpty()) name = "Assertion";
        boolean isOr = "OR".equalsIgnoreCase(step.path("logic").asText("AND"));
        String onFail = step.path("onFail").asText("stop");
        JsonNode conditions = step.path("conditions");

        List<String> failures = new ArrayList<>();
        int passCount = 0, total = 0;
        if (conditions.isArray()) {
            for (JsonNode c : conditions) {
                total++;
                String leftExpr = c.path("left").asText("").trim();
                String op = c.path("operator").asText("==");
                String rightExpr = c.path("right").asText("").trim();
                Object leftVal = resolveAssertionValue(leftExpr, postChain, postVars);
                boolean pass;
                String failMsg;
                switch (op) {
                    case "notNull":
                        pass = leftVal != null;
                        failMsg = "actual=" + stringifyForCompare(leftVal) + "  expected: not null";
                        break;
                    case "contains": {
                        Object rightVal = resolveAssertionValue(rightExpr, postChain, postVars);
                        String l = stringifyForCompare(leftVal), r = stringifyForCompare(rightVal);
                        pass = l.contains(r);
                        failMsg = "actual=\"" + l + "\"  expected to contain: \"" + r + "\"";
                        break;
                    }
                    case "typeof": {
                        String actualType = typeOfValue(leftVal);
                        pass = actualType.equals(rightExpr);
                        failMsg = "actual typeof=" + actualType + "  expected type: " + rightExpr;
                        break;
                    }
                    default: {
                        Object rightVal = resolveAssertionValue(rightExpr, postChain, postVars);
                        pass = compareValues(leftVal, rightVal, op);
                        failMsg = "actual=\"" + stringifyForCompare(leftVal) + "\"  expected " + op
                                + " \"" + stringifyForCompare(rightVal) + "\"";
                        break;
                    }
                }
                if (pass) passCount++; else failures.add("Condition " + total + ": " + failMsg);
            }
        }
        boolean overallPass = total == 0 || (isOr ? passCount > 0 : failures.isEmpty());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("name", name);
        result.put("type", "assertion");
        result.put("passed", overallPass);
        if (!overallPass) {
            String message = (isOr ? "Assertion failed (no condition passed):\n" : "Assertion failed:\n")
                    + String.join("\n", failures);
            result.put("message", message);
            if ("stop".equals(onFail)) throw new PostResponseAssertionFailedException(message, result);
        }
        return result;
    }

    /** Resolves an assertion condition's left/right expression against the current post-response
     *  chain payload — same conventions as the UI's ConditionsEditor placeholder text: a numeric
     *  literal, a 'quoted'/"quoted" string literal, bare "body"/"body.field", bare "headers" (the
     *  whole header map)/"headers.field", or "vars.name"/"vars.name.field" (field access parses the
     *  target as JSON first). Anything else is treated as a literal string (rather than throwing a
     *  ReferenceError like the old Camel/JS version would for an unrecognized bare identifier). */
    private Object resolveAssertionValue(String expr, Payload payload, Map<String, Object> vars) {
        if (expr == null || expr.isEmpty()) return "";
        if (expr.matches("-?\\d+")) {
            try { return Long.parseLong(expr); } catch (NumberFormatException ignored) {}
        }
        if (expr.matches("-?\\d+\\.\\d+")) {
            try { return Double.parseDouble(expr); } catch (NumberFormatException ignored) {}
        }
        if (expr.length() >= 2 && ((expr.charAt(0) == '\'' && expr.charAt(expr.length() - 1) == '\'')
                || (expr.charAt(0) == '"' && expr.charAt(expr.length() - 1) == '"'))) {
            return expr.substring(1, expr.length() - 1);
        }
        if (expr.equals("body")) return payload.body;
        if (expr.startsWith("body.")) return resolveFieldAccess(payload.body, expr.substring(5));
        if (expr.equals("headers")) return payload.headers;
        if (expr.startsWith("headers.")) return payload.headers != null ? payload.headers.get(expr.substring(8)) : null;
        if (expr.startsWith("vars.")) {
            String rest = expr.substring(5);
            int dot = rest.indexOf('.');
            if (dot < 0) return vars.get(rest);
            return resolveFieldAccess(vars.get(rest.substring(0, dot)), rest.substring(dot + 1));
        }
        return expr;
    }

    /** Reads one field off a value that may be a JSON-string body, an already-parsed Map/JsonNode
     *  variable, or anything else (→ null). Mirrors ConversionUtils.replaceVars's "body.field" /
     *  "vars.name.field" resolution, but against plain Java values instead of Camel exchange state. */
    private Object resolveFieldAccess(Object source, String field) {
        if (source == null) return null;
        if (source instanceof Map) return ((Map<?, ?>) source).get(field);
        JsonNode node;
        if (source instanceof JsonNode) {
            node = (JsonNode) source;
        } else if (source instanceof String) {
            try { node = objectMapper.readTree((String) source); } catch (Exception e) { return null; }
        } else {
            return null;
        }
        if (!node.isObject()) return null;
        return jsonNodeToValue(node.get(field));
    }

    private Object jsonNodeToValue(JsonNode node) {
        if (node == null || node.isNull() || node.isMissingNode()) return null;
        if (node.isTextual()) return node.asText();
        if (node.isBoolean()) return node.asBoolean();
        if (node.isIntegralNumber()) return node.longValue();
        if (node.isNumber()) return node.doubleValue();
        return node; // object/array — kept as JsonNode for stringify/typeof/contains handling
    }

    private String stringifyForCompare(Object v) {
        if (v == null) return "null";
        if (v instanceof Double) {
            double d = (Double) v;
            return d == Math.rint(d) && !Double.isInfinite(d) ? String.valueOf((long) d) : String.valueOf(d);
        }
        if (v instanceof JsonNode) return v.toString();
        return String.valueOf(v);
    }

    private String typeOfValue(Object v) {
        if (v == null) return "undefined";
        if (v instanceof Boolean) return "boolean";
        if (v instanceof Number) return "number";
        if (v instanceof String) return "string";
        return "object";
    }

    /** gt/gte/lt/lte compare numerically whenever both sides parse as numbers (regardless of
     *  whether they arrived as an actual Number or a numeric-looking String/header value) —
     *  otherwise, and always for ==/!=, falls back to string comparison. */
    private boolean compareValues(Object left, Object right, String op) {
        Double leftNum = asDouble(left), rightNum = asDouble(right);
        if (leftNum != null && rightNum != null && !"==".equals(op) && !"!=".equals(op)) {
            switch (op) {
                case "gt": case ">":   return leftNum > rightNum;
                case "gte": case ">=": return leftNum >= rightNum;
                case "lt": case "<":   return leftNum < rightNum;
                case "lte": case "<=": return leftNum <= rightNum;
            }
        }
        String l = stringifyForCompare(left), r = stringifyForCompare(right);
        switch (op) {
            case "neq": case "!=": return !l.equals(r);
            case "gt": case ">":   return l.compareTo(r) > 0;
            case "gte": case ">=": return l.compareTo(r) >= 0;
            case "lt": case "<":   return l.compareTo(r) < 0;
            case "lte": case "<=": return l.compareTo(r) <= 0;
            default:               return l.equals(r);
        }
    }

    private Double asDouble(Object v) {
        if (v instanceof Number) return ((Number) v).doubleValue();
        if (v instanceof String) {
            try { return Double.parseDouble((String) v); } catch (NumberFormatException e) { return null; }
        }
        return null;
    }

    /**
     * Evaluates an Input tab body/header-row template with the same conventions as the main
     * product's ConversionUtils.exprMap: blank → ""; a template containing ${...} → each ${...}
     * chunk is evaluated as JS (vars/body/headers bound, same GraalVM engine JsLanguage uses) and
     * the pieces are concatenated; no ${...} at all → treated as a literal constant string.
     *
     * @param body    the Pre-Request chain's final body, bound as the JS "body" global — always
     *                the raw string (see JsLanguage.evalStandalone's javadoc for why).
     * @param headers the Pre-Request chain's final headers, bound as the JS "headers" global.
     */
    private String evalTemplate(String template, String body, Map<String, String> headers, Map<String, Object> vars) {
        if (template == null || template.isBlank()) return "";
        if (!template.contains("${")) return template;

        // Single wrapper ${...} spanning the whole string → return the raw evaluated value,
        // stringified — for a bare "${body}" this is just the original string, unchanged.
        String trimmed = template.trim();
        if (trimmed.startsWith("${") && trimmed.endsWith("}") && trimmed.indexOf("${", 2) < 0) {
            Object result = JsLanguage.evalStandalone(trimmed.substring(2, trimmed.length() - 1), vars, body, headers);
            return result != null ? String.valueOf(result) : "";
        }

        // Mixed template — evaluate each ${...} chunk and stringify into the surrounding text
        Matcher m = DOLLAR_EXPR.matcher(template);
        StringBuilder sb = new StringBuilder();
        int last = 0;
        while (m.find()) {
            sb.append(template, last, m.start());
            Object val = JsLanguage.evalStandalone(m.group(1), vars, body, headers);
            sb.append(val != null ? String.valueOf(val) : "");
            last = m.end();
        }
        sb.append(template.substring(last));
        return sb.toString();
    }

    /**
     * Like evalTemplate, but for a Set Variable step's expression: a whole "${...}" wrapper
     * returns the RAW evaluated value — numbers/booleans/objects survive — rather than always
     * stringifying, matching the historical setVariable semantics (a var can hold more than text).
     * A mixed template or plain literal still behaves exactly like evalTemplate.
     */
    private Object evalExpressionValue(String expr, String body, Map<String, String> headers, Map<String, Object> vars) {
        if (expr == null || expr.isBlank()) return null;
        if (!expr.contains("${")) return expr;
        String trimmed = expr.trim();
        if (trimmed.startsWith("${") && trimmed.endsWith("}") && trimmed.indexOf("${", 2) < 0) {
            return JsLanguage.evalStandalone(trimmed.substring(2, trimmed.length() - 1), vars, body, headers);
        }
        return evalTemplate(expr, body, headers, vars);
    }

    /** Builds the {method,url,params,bodyMode,headers,body} shape actually sent, replacing the
     *  stored request section's headers/body with the Input tab's evaluated final values —
     *  leaves the stored request definition (its templates) untouched. */
    private JsonNode buildFinalRequestSection(JsonNode requestConfig, Map<String, String> finalHeaders, String finalBody) {
        ObjectNode copy = requestConfig.isObject()
            ? ((ObjectNode) requestConfig).deepCopy()
            : objectMapper.createObjectNode();
        ArrayNode headers = objectMapper.createArrayNode();
        for (Map.Entry<String, String> e : finalHeaders.entrySet()) {
            headers.addObject().put("key", e.getKey()).put("value", e.getValue()).put("enabled", true);
        }
        copy.set("headers", headers);
        copy.put("body", finalBody);
        return copy;
    }

    // ── Response / vars capture ──────────────────────────────────────────────

    private Map<String, Object> captureResponse(Exchange exchange) {
        Map<String, Object> response = new LinkedHashMap<>();
        if (exchange == null) return response;
        Object statusRaw = exchange.getMessage().getHeader("httpResponseCode");
        response.put("status", statusRaw);
        Map<String, Object> headers = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : exchange.getMessage().getHeaders().entrySet()) {
            if (e.getKey().startsWith("Camel")) continue;
            headers.put(e.getKey(), e.getValue() != null ? e.getValue().toString() : null);
        }
        response.put("headers", headers);
        response.put("body", bodyToString(exchange.getMessage().getBody()));
        return response;
    }

    /** camel-http commonly returns the response body as a raw byte[] (not always an
     *  InputStream, so ConversionUtils.readHttpBody()'s gzip-aware decode doesn't touch it) —
     *  decode it to text here rather than falling back to Object.toString()'s "[B@...". */
    private static String bodyToString(Object body) {
        if (body == null) return null;
        if (body instanceof byte[]) return new String((byte[]) body, java.nio.charset.StandardCharsets.UTF_8);
        if (body instanceof String) return (String) body;
        return body.toString();
    }

    private Map<String, Object> captureVars(Exchange exchange) {
        Map<String, Object> vars = new LinkedHashMap<>();
        if (exchange == null) return vars;
        for (Map.Entry<String, Object> e : exchange.getProperties().entrySet()) {
            String k = e.getKey();
            if (k.startsWith("Camel") || k.startsWith("_")) continue;
            vars.put(k, e.getValue());
        }
        return vars;
    }

    // ── Post-response check ("Response Validations") result attribution ─────

    /**
     * Handles the postResponse entries still Camel-embedded (dbcheck/jsoncompare/textcompare/wait
     * — "assertion" moved to Java-orchestrated evaluation, see runAssertionStep, and never reaches
     * here; the "postResponse" param is always the already-filtered postResponseChecks).
     *
     * jsoncompare/textcompare always get an auto-assigned resultVar (see RequestToCamelAdapter)
     * so their pass/fail is read directly off the final exchange properties, regardless of
     * onMismatch and regardless of overall run outcome.
     *
     * Bare "dbcheck" steps have no per-step result property in the reused CoreNodesPlugin
     * converter — Camel steps run strictly in order, so when the run fails, the failing check is
     * deterministically the FIRST list entry configured with a "stop" semantic (any stop-type
     * check before it would have already thrown). Checks after it never ran. When the run
     * succeeds, every stop-type check passed by definition; continue-type checks fall back to the
     * shared "_assertionFailed" flag (imprecise — inherited limitation of the reused converter,
     * which only tracks one shared flag, not one per check).
     */
    private List<Map<String, Object>> buildCheckResults(JsonNode postResponse, Exchange exchange, String runStatus, String runError) {
        List<Map<String, Object>> results = new ArrayList<>();
        if (postResponse == null || !postResponse.isArray()) return results;

        boolean anyContinueAssertionFailed = exchange != null
            && Boolean.TRUE.equals(exchange.getProperty("_assertionFailed", Boolean.class));

        boolean firstStopFailureAttributed = false;
        int i = 0;
        for (JsonNode check : postResponse) {
            String type = check.path("type").asText("");
            // Not a validation — a plain delay. Still index++ to stay aligned with
            // RequestToCamelAdapter's own index-based resultVar assignment for the checks after it.
            if ("wait".equals(type)) { i++; continue; }
            String name = check.path("name").asText(type + " #" + (i + 1));
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("name", name);
            r.put("type", type);

            if ("jsoncompare".equals(type) || "textcompare".equals(type)) {
                String resultVar = resultVarFor(check, i);
                Boolean passed = exchange != null
                    ? asBoolean(exchange.getProperty(resultVar))
                    : null;
                r.put("passed", passed);
            } else { // dbcheck — no per-step result var available
                String onFail = check.path("onFail").asText("stop");
                boolean stopType = "stop".equals(onFail);
                if ("success".equals(runStatus)) {
                    r.put("passed", stopType ? true : !anyContinueAssertionFailed);
                } else if (stopType && !firstStopFailureAttributed) {
                    firstStopFailureAttributed = true;
                    r.put("passed", false);
                    r.put("message", runError);
                } else if (firstStopFailureAttributed) {
                    r.put("passed", null);
                    r.put("message", "not run — a prior check stopped execution");
                } else {
                    // continue-type check that ran before the eventual failure
                    r.put("passed", !anyContinueAssertionFailed);
                }
            }
            results.add(r);
            i++;
        }
        return results;
    }

    private String resultVarFor(JsonNode check, int index) {
        String resultVar = check.path("resultVar").asText("").trim();
        return resultVar.isEmpty() ? "_check_" + index : resultVar;
    }

    private static Boolean asBoolean(Object v) {
        if (v instanceof Boolean) return (Boolean) v;
        if (v == null) return null;
        return Boolean.parseBoolean(String.valueOf(v));
    }
}
