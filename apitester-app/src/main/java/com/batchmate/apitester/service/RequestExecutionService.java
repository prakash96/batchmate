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
 * "Call Request" is the ONLY pre-request/post-response step type — it doesn't need to be a Camel
 * node type: it's resolved here by recursively invoking the single-run method for the referenced
 * request, plain Java control flow since it's inherently sequential. It always chains from
 * whatever the previous step returned (pre-request: the prior Call Request's response, or nothing
 * for the first one; post-response: the prior Call Request's response, or THIS request's own
 * response for the first one) — see {@link Payload}/{@link #executeCallRequestStep}.
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

    // Response headers that must never be forwarded verbatim as the NEXT call's request headers:
    // hop-by-hop / auto-computed HTTP headers (a stale Content-Length or Transfer-Encoding would
    // corrupt the next request) and Camel's synthetic http-status bookkeeping headers.
    private static final Set<String> SKIP_RESPONSE_HEADERS = Set.of(
        "content-length", "transfer-encoding", "connection", "date", "host",
        "httpresponsecode", "httpresponsetext", "httpmethod"
    );

    private final RequestService requestService;
    private final CollectionService collectionService;
    private final RequestToCamelAdapter camelAdapter;
    private final CamelRouteDeployService camelDeployService;
    private final ProducerTemplate producerTemplate;
    private final ObjectMapper objectMapper;

    public RequestExecutionService(RequestService requestService,
                                    CollectionService collectionService,
                                    RequestToCamelAdapter camelAdapter,
                                    CamelRouteDeployService camelDeployService,
                                    ProducerTemplate producerTemplate,
                                    ObjectMapper objectMapper) {
        this.requestService = requestService;
        this.collectionService = collectionService;
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

    /** A Call Request step's log entry plus the payload its callee returned, for chaining. */
    private static final class CallResult {
        final Map<String, Object> log;
        final Payload resultPayload;
        CallResult(Map<String, Object> log, Payload resultPayload) { this.log = log; this.resultPayload = resultPayload; }
    }

    /**
     * Public entry point. If this request's Input is set to a (non-empty) Input Data Set, runs
     * the whole pipeline once per entry — N independent single-runs, iteration only ever applies
     * at this top level (a nested Call Request always just chains the previous response, regardless
     * of the callee's own Input setting — iterating mid-chain wouldn't have a single "previous"
     * response to hand the next link). Otherwise behaves as a single run, unchanged.
     */
    public Map<String, Object> run(String requestId, Map<String, Object> overrideVars) {
        JsonNode reqNode;
        try {
            reqNode = requestService.findById(requestId);
        } catch (IOException e) {
            throw new RuntimeException("Could not load request " + requestId + ": " + e.getMessage(), e);
        }
        if (reqNode == null) throw new RuntimeException("Request not found: " + requestId);

        JsonNode inputDataSets = reqNode.path("inputDataSets");
        boolean iterating = "dataset".equals(reqNode.path("request").path("inputSource").asText("previous"))
            && inputDataSets.isArray() && inputDataSets.size() > 0;

        if (!iterating) {
            return run(requestId, overrideVars, 0, new LinkedHashSet<>(), overrideVars, null, null);
        }

        long startMs = System.currentTimeMillis();
        List<Map<String, Object>> iterations = new ArrayList<>();
        boolean anyFailed = false;
        int index = 0;
        for (JsonNode entry : inputDataSets) {
            Payload seed = payloadFromEntry(entry);
            Map<String, Object> iterResult = run(requestId, overrideVars, 0, new LinkedHashSet<>(), overrideVars, seed.body, seed.headers);
            Map<String, Object> withIndex = new LinkedHashMap<>(iterResult);
            withIndex.put("iterationIndex", index);
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
        // callRequest entries in postResponse are Java-orchestrated (see postResponseChecksOnly's
        // javadoc) and must not reach the Camel adapter — it only knows the four check node types.
        JsonNode postResponse = reqNode.path("postResponse");
        JsonNode postResponseChecks = postResponseChecksOnly(postResponse);
        List<JsonNode> postResponseCalls = postResponseCallSteps(postResponse);

        JsonNode requestSection = buildFinalRequestSection(requestConfig, finalHeaders, finalBody);
        String yaml = camelAdapter.convert(requestId, requestSection, postResponseChecks);
        String status;
        String error = null;
        Exchange resultExchange = null;
        try {
            Path yamlPath = requestService.saveCamelYaml(requestId, yaml);
            camelDeployService.deploy(requestId, yamlPath);
            resultExchange = producerTemplate.send("direct:" + requestId, e -> {
                e.getMessage().setBody(null);
                vars.forEach(e::setProperty);
            });
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
        // every non-callRequest check regardless of listed order — see postResponseChecksOnly's javadoc.
        List<Map<String, Object>> postResponseLog = new ArrayList<>();
        Payload postChain = payloadFromResponse(response);
        for (JsonNode step : postResponseCalls) {
            CallResult result = executeCallRequestStep(step, postChain, depth, chain, globalVars);
            postResponseLog.add(result.log);
            postChain = result.resultPayload;
        }

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
     * payload for whatever comes next in the chain. On failure, the previous payload is passed
     * through unchanged (so a broken call doesn't wipe out a chain state — the failure itself is
     * still logged via "subError").
     */
    private CallResult executeCallRequestStep(JsonNode step, Payload previousPayload,
                                               int depth, Set<String> chain, Map<String, Object> globalVars) {
        Map<String, Object> log = new LinkedHashMap<>();
        String targetId = step.path("requestId").asText("").trim();
        log.put("requestId", targetId);
        if (targetId.isEmpty()) return new CallResult(log, previousPayload);

        Payload input = previousPayload != null ? previousPayload : Payload.EMPTY;
        log.put("inputBody", input.body);
        log.put("inputHeaders", input.headers);

        try {
            Map<String, Object> subResult = run(targetId, Collections.emptyMap(), depth + 1, new LinkedHashSet<>(chain),
                globalVars, input.body, input.headers);
            log.put("subRunId", subResult.get("runId"));
            log.put("subStatus", subResult.get("status"));

            Payload resultPayload;
            if ("success".equals(subResult.get("status"))) {
                @SuppressWarnings("unchecked")
                Map<String, Object> subResponse = (Map<String, Object>) subResult.get("response");
                resultPayload = payloadFromResponse(subResponse);
                log.put("subResponseStatus", subResponse != null ? subResponse.get("status") : null);
                log.put("subResponseBody", subResponse != null ? subResponse.get("body") : null);
            } else {
                // On failure the exchange's body is whatever was set right before the failed HTTP
                // call ran (the outgoing payload, not a real response) — surface the actual error
                // instead of a misleading "response".
                log.put("subError", subResult.get("error"));
                resultPayload = previousPayload;
            }
            log.put("status", "ok");
            return new CallResult(log, resultPayload);
        } catch (Exception e) {
            log.put("status", "error");
            log.put("error", e.getMessage());
            return new CallResult(log, previousPayload);
        }
    }

    /** Converts one raw Input Data Set entry ({body, headers:[{key,value,enabled}]}) into a Payload. */
    private Payload payloadFromEntry(JsonNode entry) {
        if (entry == null) return Payload.EMPTY;
        return new Payload(entry.path("body").asText(""), headersFromRows(entry.path("headers")));
    }

    /** Same convention as the Request tab's own headers: {key,value,enabled} rows, disabled ones skipped. */
    private Map<String, String> headersFromRows(JsonNode rows) {
        Map<String, String> headers = new LinkedHashMap<>();
        if (rows.isArray()) {
            for (JsonNode h : rows) {
                if (!h.path("enabled").asBoolean(true)) continue;
                String key = h.path("key").asText("").trim();
                if (!key.isEmpty()) headers.put(key, h.path("value").asText(""));
            }
        }
        return headers;
    }

    /** Turns a captured response (see captureResponse) into a Payload for the next chain link,
     *  dropping headers that must never be forwarded as request headers — see SKIP_RESPONSE_HEADERS. */
    private Payload payloadFromResponse(Map<String, Object> response) {
        if (response == null) return Payload.EMPTY;
        Object rawBody = response.get("body");
        String body = rawBody != null ? String.valueOf(rawBody) : null;
        Map<String, String> headers = new LinkedHashMap<>();
        Object rawHeaders = response.get("headers");
        if (rawHeaders instanceof Map) {
            for (Map.Entry<?, ?> e : ((Map<?, ?>) rawHeaders).entrySet()) {
                String key = String.valueOf(e.getKey());
                if (SKIP_RESPONSE_HEADERS.contains(key.toLowerCase())) continue;
                headers.put(key, e.getValue() != null ? String.valueOf(e.getValue()) : "");
            }
        }
        return new Payload(body, headers);
    }

    /**
     * Post-response "callRequest" steps aren't a Camel node type either (same reasoning as
     * pre-request's) — RequestToCamelAdapter only knows assertion/jsoncompare/textcompare/dbcheck,
     * so these are filtered out before building the route and run here in Java, strictly AFTER
     * the whole Camel route (http + every Response Validation check) has completed. That means a
     * callRequest step always runs after every check, regardless of where it's positioned in the
     * underlying postResponse list — there is no way to interleave it mid-route.
     */
    private JsonNode postResponseChecksOnly(JsonNode postResponse) {
        if (postResponse == null || !postResponse.isArray()) return postResponse;
        ArrayNode filtered = objectMapper.createArrayNode();
        for (JsonNode c : postResponse) {
            if (!"callRequest".equals(c.path("type").asText(""))) filtered.add(c);
        }
        return filtered;
    }

    private List<JsonNode> postResponseCallSteps(JsonNode postResponse) {
        List<JsonNode> calls = new ArrayList<>();
        if (postResponse != null && postResponse.isArray()) {
            for (JsonNode c : postResponse) {
                if ("callRequest".equals(c.path("type").asText(""))) calls.add(c);
            }
        }
        return calls;
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
     * jsoncompare/textcompare always get an auto-assigned resultVar (see RequestToCamelAdapter)
     * so their pass/fail is read directly off the final exchange properties, regardless of
     * onMismatch and regardless of overall run outcome.
     *
     * Bare "assertion" / "dbcheck" steps have no per-step result property in the reused
     * CoreNodesPlugin converter — Camel steps run strictly in order, so when the run fails,
     * the failing check is deterministically the FIRST list entry configured with a "stop"
     * semantic (any stop-type check before it would have already thrown). Checks after it
     * never ran. When the run succeeds, every stop-type check passed by definition; continue-type
     * bare assertions fall back to the shared "_assertionFailed" flag (imprecise — inherited
     * limitation of the reused converter, which only tracks one shared flag, not one per check).
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
            } else { // assertion / dbcheck — no per-step result var available
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
