package com.batchmate.apitester.camel;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.Yaml;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Converts a resolved request ("request" section + "postResponse" checks — pre-request
 * is already fully resolved into seed vars by RequestExecutionService before this runs)
 * into a single linear Camel YAML DSL route: direct:<requestId> = [http step] + [check steps].
 *
 * Unlike workflow-app's WorkflowToCamelAdapter, there is no node graph to walk — no
 * choice/split EIPs — just a flat ordered list, so this is intentionally much smaller.
 * Every step still goes through RequestConverterRegistry.convert(type, data), reusing
 * workflow-plugin-core-nodes' "http"/"assertion"/"jsoncompare"/"textcompare" converters
 * and workflow-plugin-db's "dbexecute" converter completely unchanged.
 */
@Service
public class RequestToCamelAdapter {

    private final RequestConverterRegistry registry;
    private final ObjectMapper objectMapper;

    public RequestToCamelAdapter(RequestConverterRegistry registry, ObjectMapper objectMapper) {
        this.registry = registry;
        this.objectMapper = objectMapper;
    }

    /** @param requestId used as both the Camel route id and the "direct:" endpoint name. */
    @SuppressWarnings("unchecked")
    public String convert(String requestId, JsonNode requestSection, JsonNode postResponse) {
        List<Map<String, Object>> steps = new ArrayList<>();

        steps.addAll(registry.convert("http", toHttpNodeData(requestSection)));

        if (postResponse != null && postResponse.isArray()) {
            int i = 0;
            for (JsonNode check : postResponse) {
                steps.addAll(checkToSteps(check, i));
                i++;
            }
        }

        Map<String, Object> from = new LinkedHashMap<>();
        from.put("uri", "direct:" + requestId);

        Map<String, Object> route = new LinkedHashMap<>();
        route.put("id", requestId);
        route.put("from", from);
        route.put("steps", steps);

        Map<String, Object> wrapper = new LinkedHashMap<>();
        wrapper.put("route", route);

        return "# Camel YAML DSL — generated for request: " + requestId + "\n\n"
             + dumpYaml(List.of(wrapper));
    }

    // ── Request → http node data ────────────────────────────────────────────

    /** Builds the {method,url,headers,body} shape CoreNodesPlugin's "http" converter expects. */
    private JsonNode toHttpNodeData(JsonNode request) {
        ObjectNode data = objectMapper.createObjectNode();
        data.put("method", request.path("method").asText("GET"));

        String url = request.path("url").asText("").trim();
        String query = buildQueryString(request.path("params"));
        if (!query.isEmpty()) url += (url.contains("?") ? "&" : "?") + query;
        // A testing tool needs to assert on 4xx/5xx responses too — without this, Camel's
        // http component throws on any non-2xx status and the run would be reported as an
        // unhandled error instead of a normal response the post-response checks can inspect.
        //
        // Using "${vars.__throwOff}" (RequestExecutionService always seeds vars.__throwOff="false")
        // rather than a bare literal, so the URL always contains "${" and CoreNodesPlugin's "http"
        // converter always takes its toD (dynamic) branch, which never emits a separate YAML
        // "parameters" map — a bare "?throwExceptionOnFailure=false" combined with a static
        // request's parameters:{httpMethod} map trips Camel's YAML DSL validation ("Uri should
        // not contain query parameters" when both are present). "vars.X" is also the one marker
        // convertHttp's own log step already knows how to rewrite into valid Simple language
        // (ConversionUtils.toSimpleMsg: ${vars.X} → ${exchangeProperty.X}) — an ad-hoc marker
        // (e.g. a raw JS literal) would parse fine for the URL but blow up that log line, since
        // it's evaluated separately as Camel Simple, not JS.
        if (!url.isEmpty()) url += (url.contains("?") ? "&" : "?") + "throwExceptionOnFailure=${vars.__throwOff}";
        data.put("url", url);

        ObjectNode headersObj = objectMapper.createObjectNode();
        JsonNode headers = request.path("headers");
        if (headers.isArray()) {
            for (JsonNode h : headers) {
                if (!h.path("enabled").asBoolean(true)) continue;
                String key = h.path("key").asText("").trim();
                if (!key.isEmpty()) headersObj.put(key, h.path("value").asText(""));
            }
        }
        data.put("headers", headersObj.size() > 0 ? headersObj.toString() : "");
        data.put("body", request.path("body").asText(""));
        return data;
    }

    private String buildQueryString(JsonNode params) {
        if (!params.isArray()) return "";
        StringBuilder sb = new StringBuilder();
        for (JsonNode p : params) {
            if (!p.path("enabled").asBoolean(true)) continue;
            String key = p.path("key").asText("").trim();
            if (key.isEmpty()) continue;
            if (sb.length() > 0) sb.append('&');
            sb.append(key).append('=').append(p.path("value").asText(""));
        }
        return sb.toString();
    }

    // ── Post-response checks ────────────────────────────────────────────────

    /**
     * assertion/jsoncompare/textcompare pass straight through to the registry (field shapes
     * already match). "dbcheck" is UI/model sugar for [dbexecute step, assertion step] against
     * vars.<resultVar> — expanded here, never a converter of its own.
     */
    private List<Map<String, Object>> checkToSteps(JsonNode check, int index) {
        String type = check.path("type").asText("");
        if ("dbcheck".equals(type)) {
            List<Map<String, Object>> steps = new ArrayList<>();
            ObjectNode dbData = objectMapper.createObjectNode();
            dbData.put("connectionId", check.path("connectionId").asText(""));
            dbData.put("query",        check.path("query").asText(""));
            dbData.put("resultVar",    check.path("resultVar").asText(""));
            steps.addAll(registry.convert("dbexecute", dbData));

            ObjectNode assertData = objectMapper.createObjectNode();
            assertData.put("name", check.path("name").asText("DB Check"));
            assertData.put("logic", check.path("logic").asText("AND"));
            assertData.set("conditions", check.path("conditions"));
            assertData.put("onFail", check.path("onFail").asText("stop"));
            steps.addAll(registry.convert("assertion", assertData));
            return steps;
        }
        if ("jsoncompare".equals(type) || "textcompare".equals(type)) {
            // Force a per-check resultVar (defaulting to a deterministic index-based name)
            // so RequestExecutionService can attribute pass/fail after the run regardless
            // of the configured onMismatch value.
            ObjectNode data = check.deepCopy();
            String resultVar = data.path("resultVar").asText("").trim();
            if (resultVar.isEmpty()) data.put("resultVar", "_check_" + index);
            return registry.convert(type, data);
        }
        return registry.convert(type, check);
    }

    // ── YAML serialization ──────────────────────────────────────────────────

    private static String dumpYaml(List<Object> routes) {
        DumperOptions opts = new DumperOptions();
        opts.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
        opts.setIndent(2);
        opts.setIndicatorIndent(2);
        opts.setIndentWithIndicator(true);
        return new Yaml(opts).dump(routes);
    }
}
