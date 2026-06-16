package com.batchmate.workflow.plugin.core;

import com.fasterxml.jackson.databind.JsonNode;
import com.batchmate.workflow.camel.api.ConversionUtils;
import com.batchmate.workflow.camel.api.NodeConverter;
import com.batchmate.workflow.camel.api.NodeConverterPlugin;
import java.util.*;

public class CoreNodesPlugin implements NodeConverterPlugin {

    private final CompareHelper compareHelper = new CompareHelper();

    @Override
    public String pluginId() { return "core-nodes"; }

    @Override
    public Map<String, Object> beans() {
        return Collections.singletonMap("compareHelper", compareHelper);
    }

    @Override
    public Map<String, NodeConverter> converters() {
        Map<String, NodeConverter> m = new LinkedHashMap<>();
        m.put("http",        this::convertHttp);
        m.put("setbody",     this::convertSetBody);
        m.put("setvariable", this::convertSetVariable);
        m.put("log",         this::convertLog);
        m.put("wait",        this::convertWait);
        m.put("assertion",   this::convertAssertion);
        m.put("jsoncompare", this::convertJsonCompare);
        m.put("textcompare", this::convertTextCompare);
        m.put("throwerror",  this::convertThrowError);
        m.put("workflowref", this::convertWorkflowRef);
        return m;
    }

    // ── Converters ────────────────────────────────────────────────────────────

    private List<Map<String, Object>> convertHttp(JsonNode data) {
        String method     = data.path("method").asText("GET");
        String url        = data.path("url").asText("").trim();
        String body       = data.path("body").asText("").trim();
        String headers    = data.path("headers").asText("").trim();
        boolean dynamicUrl     = url.contains("${");
        boolean dynamicBody    = body.contains("${");
        boolean dynamicHeaders = headers.contains("${");

        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("http: " + method + " " + (url.isEmpty() ? "[mock]" : url)));

        // Always request identity encoding — Camel's stream cache cannot handle gzip bodies
        steps.add(ConversionUtils.scriptStep("js",
            "exchange.getMessage().getHeaders().put('Accept-Encoding','identity');"));

        // Body — use setBody with expression evaluation so ${vars.x} is resolved
        if (!body.isEmpty()) {
            if (dynamicBody) {
                Map<String, Object> sb = new LinkedHashMap<>();
                sb.put("expression", ConversionUtils.simpleOrConstant(body));
                Map<String, Object> sbStep = new LinkedHashMap<>();
                sbStep.put("setBody", sb);
                steps.add(sbStep);
            } else {
                steps.add(ConversionUtils.setBodyConstant(body));
            }
        }

        // Headers — evaluate expressions inside JSON values when present
        if (!headers.isEmpty()) {
            if (dynamicHeaders) {
                // simpleToJs converts the entire JSON string as a template, evaluating ${vars.x} etc.
                String headersJs = ConversionUtils.simpleToJs(headers);
                steps.add(ConversionUtils.scriptStep("js",
                    "var _h = JSON.parse(" + headersJs + ");"
                    + " Object.keys(_h).forEach(function(k){"
                    + " exchange.getMessage().getHeaders().put(k, String(_h[k])); });"));
            } else {
                steps.add(ConversionUtils.scriptStep("js",
                    "var _h = JSON.parse('" + ConversionUtils.escapeJs(headers) + "');"
                    + " Object.keys(_h).forEach(function(k){"
                    + " exchange.getMessage().getHeaders().put(k, String(_h[k])); });"));
            }
        }

        if (!url.isEmpty()) {
            if (dynamicUrl) {
                // Evaluate the URL expression at runtime, store in a property, use toD.
                // CamelHttpMethod header drives the HTTP method for dynamic endpoints.
                String urlJs = ConversionUtils.simpleToJs(url);
                steps.add(ConversionUtils.scriptStep("js",
                    "exchange.getMessage().getHeaders().put('CamelHttpMethod','"
                    + ConversionUtils.escapeJs(method) + "');"
                    + "exchange.setProperty('_httpUrl', String(" + urlJs + "));"));
                steps.add(ConversionUtils.toDStep("${exchangeProperty._httpUrl}"));
            } else {
                Map<String, Object> params = new LinkedHashMap<>();
                params.put("httpMethod", method);
                steps.add(ConversionUtils.toStep(url, params));
            }
            steps.add(ConversionUtils.readHttpBody());
            steps.add(ConversionUtils.mapHttpResponseHeaders());
        }
        return steps;
    }

    private List<Map<String, Object>> convertSetBody(JsonNode data) {
        String expr = data.path("expression").asText("").trim();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("expression", expr.isEmpty() ? Map.of("js", "body") : ConversionUtils.exprMap(expr));
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("setBody", body);
        return List.of(step);
    }

    private List<Map<String, Object>> convertSetVariable(JsonNode data) {
        List<Map<String, Object>> steps = new ArrayList<>();
        JsonNode entries = data.path("entries");
        if (entries.isArray()) {
            for (JsonNode entry : entries) {
                String name = entry.path("name").asText("").trim();
                String expr = entry.path("expression").asText("").trim();
                if (!name.isEmpty()) {
                    steps.add(ConversionUtils.setVarExpr(name,
                        expr.isEmpty() ? Map.of("js", "body") : ConversionUtils.exprMap(expr)));
                }
            }
        }
        return steps;
    }

    private List<Map<String, Object>> convertLog(JsonNode data) {
        String script = data.path("script").asText("").trim();
        String msg    = script.isEmpty() ? data.path("name").asText("log") : script;

        if (!msg.contains("${")) {
            return List.of(ConversionUtils.logMsg(msg));
        }

        // Evaluate JS interpolations, store result in temp property, then log it
        String msgJs = ConversionUtils.simpleToJs(msg);
        List<Map<String, Object>> steps = new ArrayList<>();

        Map<String, Object> propBody = new LinkedHashMap<>();
        propBody.put("name", "_logMsg");
        propBody.put("expression", Map.of("js", msgJs));
        Map<String, Object> setPropStep = new LinkedHashMap<>();
        setPropStep.put("setProperty", propBody);
        steps.add(setPropStep);

        Map<String, Object> logBody = new LinkedHashMap<>();
        logBody.put("message", "${exchangeProperty._logMsg}");
        logBody.put("logName", "com.batchmate.workflow.execution");
        logBody.put("loggingLevel", "INFO");
        Map<String, Object> logStep = new LinkedHashMap<>();
        logStep.put("log", logBody);
        steps.add(logStep);

        return steps;
    }

    private List<Map<String, Object>> convertWait(JsonNode data) {
        int ms = data.path("waitTime").asInt(0);
        Map<String, Object> delay = new LinkedHashMap<>();
        delay.put("expression", Map.of("constant", String.valueOf(ms)));
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("delay", delay);
        return List.of(step);
    }

    private List<Map<String, Object>> convertAssertion(JsonNode data) {
        String onFail = data.path("onFail").asText("stop");
        List<Map<String, Object>> steps = new ArrayList<>();
        if ("stop".equals(onFail)) {
            steps.add(ConversionUtils.scriptStep("js", ConversionUtils.buildAssertionJsDetailed(data)));
        } else {
            String js = ConversionUtils.buildAssertionJs(data);
            steps.add(ConversionUtils.scriptStep("js",
                "var _assertPassed=(" + js + ");"
                + "if(!_assertPassed){exchange.setProperty('_assertionFailed',true);}"));
        }
        return steps;
    }

    private List<Map<String, Object>> convertJsonCompare(JsonNode data) {
        String leftSrc    = data.path("leftSource").asText("body");
        String leftVar    = data.path("leftExpr").asText("");
        String leftLit    = data.path("leftLiteral").asText("");
        String rightSrc   = data.path("rightSource").asText("literal");
        String rightVar   = data.path("rightExpr").asText("");
        String rightLit   = data.path("rightLiteral").asText("");
        String mode       = data.path("mode").asText("deep-equal");
        boolean ignoreArr = data.path("ignoreArrayOrder").asBoolean(false);
        String resultVar  = data.path("resultVar").asText("").trim();
        String onMismatch = data.path("onMismatch").asText("stop");

        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.setVarExpr("_cmp_leftSrc",    Map.of("constant", leftSrc)));
        steps.add(ConversionUtils.setVarExpr("_cmp_leftVar",    Map.of("constant", leftVar)));
        steps.add(ConversionUtils.setVarExpr("_cmp_leftLit",    Map.of("constant", leftLit)));
        steps.add(ConversionUtils.setVarExpr("_cmp_rightSrc",   Map.of("constant", rightSrc)));
        steps.add(ConversionUtils.setVarExpr("_cmp_rightVar",   Map.of("constant", rightVar)));
        steps.add(ConversionUtils.setVarExpr("_cmp_rightLit",   Map.of("constant", rightLit)));
        steps.add(ConversionUtils.setVarExpr("_cmp_mode",       Map.of("constant", mode)));
        steps.add(ConversionUtils.setVarExpr("_cmp_ignoreArr",  Map.of("constant", String.valueOf(ignoreArr))));
        steps.add(ConversionUtils.setVarExpr("_cmp_resultVar",  Map.of("constant", resultVar)));
        steps.add(ConversionUtils.setVarExpr("_cmp_onMismatch", Map.of("constant", onMismatch)));
        steps.add(beanStep("compareHelper", "compareJson"));
        return steps;
    }

    private List<Map<String, Object>> convertTextCompare(JsonNode data) {
        String leftSrc    = data.path("leftSource").asText("body");
        String leftVar    = data.path("leftExpr").asText("");
        String leftLit    = data.path("leftLiteral").asText("");
        String rightSrc   = data.path("rightSource").asText("literal");
        String rightVar   = data.path("rightExpr").asText("");
        String rightLit   = data.path("rightLiteral").asText("");
        String mode       = data.path("mode").asText("exact");
        boolean cs        = data.path("caseSensitive").asBoolean(true);
        String resultVar  = data.path("resultVar").asText("").trim();
        String onMismatch = data.path("onMismatch").asText("stop");

        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.setVarExpr("_cmp_leftSrc",       Map.of("constant", leftSrc)));
        steps.add(ConversionUtils.setVarExpr("_cmp_leftVar",        Map.of("constant", leftVar)));
        steps.add(ConversionUtils.setVarExpr("_cmp_leftLit",        Map.of("constant", leftLit)));
        steps.add(ConversionUtils.setVarExpr("_cmp_rightSrc",       Map.of("constant", rightSrc)));
        steps.add(ConversionUtils.setVarExpr("_cmp_rightVar",       Map.of("constant", rightVar)));
        steps.add(ConversionUtils.setVarExpr("_cmp_rightLit",       Map.of("constant", rightLit)));
        steps.add(ConversionUtils.setVarExpr("_cmp_mode",           Map.of("constant", mode)));
        steps.add(ConversionUtils.setVarExpr("_cmp_caseSensitive",  Map.of("constant", String.valueOf(cs))));
        steps.add(ConversionUtils.setVarExpr("_cmp_resultVar",      Map.of("constant", resultVar)));
        steps.add(ConversionUtils.setVarExpr("_cmp_onMismatch",     Map.of("constant", onMismatch)));
        steps.add(beanStep("compareHelper", "compareText"));
        return steps;
    }

    private List<Map<String, Object>> convertThrowError(JsonNode data) {
        String raw       = data.path("message").asText("").trim();
        String message   = raw.isEmpty() ? "Workflow error" : raw;
        String errorCode = data.path("errorCode").asText("").trim();

        List<Map<String, Object>> steps = new ArrayList<>();

        // Persist errorCode as an exchange property so the catch block can capture it
        if (!errorCode.isEmpty()) {
            steps.add(ConversionUtils.setVarExpr("_errorCode",
                Map.of("constant", errorCode)));
        }

        String msgJs = ConversionUtils.simpleToJs(message);
        steps.add(ConversionUtils.scriptStep("js", "throw new Error(" + msgJs + ");"));
        return steps;
    }

    private List<Map<String, Object>> convertWorkflowRef(JsonNode data) {
        String refId = data.path("workflowId").asText("").trim();
        if (refId.isEmpty()) {
            return List.of(ConversionUtils.logMsg("[workflowref] No target workflow configured"));
        }
        return List.of(ConversionUtils.toStep("direct:" + refId, null));
    }

    private static Map<String, Object> beanStep(String ref, String method) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ref", ref);
        body.put("method", method);
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("bean", body);
        return step;
    }

}
