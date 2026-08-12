package com.batchmate.workflow.plugin.converter;

import com.fasterxml.jackson.databind.JsonNode;
import com.batchmate.workflow.camel.api.ConversionUtils;
import com.batchmate.workflow.camel.api.NodeConverter;
import com.batchmate.workflow.camel.api.NodeConverterPlugin;

import java.util.*;

public class ConverterPlugin implements NodeConverterPlugin {

    private final ConverterHelper converterHelper = new ConverterHelper();

    @Override
    public String pluginId() { return "converter"; }

    @Override
    public Map<String, NodeConverter> converters() {
        Map<String, NodeConverter> m = new LinkedHashMap<>();
        m.put("jsontostring",   this::convertJsonToString);
        m.put("stringtojson",   this::convertStringToJson);
        m.put("xmltojson",      this::convertXmlToJson);
        m.put("jsontoxml",      this::convertJsonToXml);
        m.put("streamtostring",   this::convertStreamToString);
        m.put("stringtostream",   this::convertStringToStream);
        m.put("stringtobytearray", this::convertStringToByteArray);
        return m;
    }

    @Override
    public Map<String, Object> beans() {
        return Collections.singletonMap("converterHelper", converterHelper);
    }

    // ── JSON to String ────────────────────────────────────────────────────────

    private List<Map<String, Object>> convertJsonToString(JsonNode data) {
        boolean pretty   = data.path("pretty").asBoolean(false);
        String resultVar = data.path("resultVar").asText("").trim();

        String writeExpr = pretty
            ? "_m.writerWithDefaultPrettyPrinter().writeValueAsString(_b)"
            : "_m.writeValueAsString(_b)";
        String script =
            "var ObjectMapper=Java.type('com.fasterxml.jackson.databind.ObjectMapper');" +
            "var _m=new ObjectMapper();" +
            "var _b=exchange.getMessage().getBody();" +
            "var _s;" +
            "if(_b==null){_s='null';}" +
            "else if(_b instanceof java.lang.String||typeof _b==='string'){_s=String(_b);}" +
            "else{_s=" + writeExpr + ";}" +
            "exchange.getMessage().setBody(_s);" +
            (resultVar.isEmpty() ? "" : "exchange.setProperty('" + ConversionUtils.escapeJs(resultVar) + "',_s);");
        return List.of(ConversionUtils.scriptStep("js", script));
    }

    // ── String to JSON ────────────────────────────────────────────────────────

    private List<Map<String, Object>> convertStringToJson(JsonNode data) {
        String resultVar = data.path("resultVar").asText("").trim();
        String onError   = data.path("onError").asText("stop");

        String core =
            "var ObjectMapper=Java.type('com.fasterxml.jackson.databind.ObjectMapper');" +
            "var _m=new ObjectMapper();" +
            "var _s=String(exchange.getMessage().getBody());" +
            "var _r;";
        String parse = "_r=_m.readTree(_s);";
        String tail  =
            "exchange.getMessage().setBody(_r);" +
            (resultVar.isEmpty() ? "" : "exchange.setProperty('" + ConversionUtils.escapeJs(resultVar) + "',_r);");

        String script = "continue".equals(onError)
            ? core + "_r=_s;try{" + parse + "}catch(e){}" + tail
            : core + parse + tail;
        return List.of(ConversionUtils.scriptStep("js", script));
    }

    // ── XML to JSON ───────────────────────────────────────────────────────────

    private List<Map<String, Object>> convertXmlToJson(JsonNode data) {
        String resultVar = data.path("resultVar").asText("").trim();
        String onError   = data.path("onError").asText("stop");

        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.setVarExpr("_op_var",     Map.of("constant", resultVar)));
        steps.add(ConversionUtils.setVarExpr("_op_onError", Map.of("constant", onError)));
        steps.add(beanStep("converterHelper", "xmlToJson"));
        return steps;
    }

    // ── JSON to XML ───────────────────────────────────────────────────────────

    private List<Map<String, Object>> convertJsonToXml(JsonNode data) {
        String rootElement = data.path("rootElement").asText("root").trim();
        if (rootElement.isEmpty()) rootElement = "root";
        String resultVar = data.path("resultVar").asText("").trim();
        String onError   = data.path("onError").asText("stop");

        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.setVarExpr("_op_root",    Map.of("constant", rootElement)));
        steps.add(ConversionUtils.setVarExpr("_op_var",     Map.of("constant", resultVar)));
        steps.add(ConversionUtils.setVarExpr("_op_onError", Map.of("constant", onError)));
        steps.add(beanStep("converterHelper", "jsonToXml"));
        return steps;
    }

    // ── Stream to String ──────────────────────────────────────────────────────

    private List<Map<String, Object>> convertStreamToString(JsonNode data) {
        String charset   = data.path("charset").asText("UTF-8").trim();
        if (charset.isEmpty()) charset = "UTF-8";
        String resultVar = data.path("resultVar").asText("").trim();

        List<Map<String, Object>> steps = new ArrayList<>();
        Map<String, Object> convertStep = new LinkedHashMap<>();
        Map<String, Object> convertBody = new LinkedHashMap<>();
        convertBody.put("type", "java.lang.String");
        convertBody.put("charset", charset);
        convertStep.put("convertBodyTo", convertBody);
        steps.add(convertStep);
        if (!resultVar.isEmpty()) {
            steps.add(ConversionUtils.setVarExpr(resultVar, Map.of("simple", "${body}")));
        }
        return steps;
    }

    // ── String to Stream ──────────────────────────────────────────────────────

    private List<Map<String, Object>> convertStringToStream(JsonNode data) {
        String charset   = data.path("charset").asText("UTF-8").trim();
        if (charset.isEmpty()) charset = "UTF-8";
        String resultVar = data.path("resultVar").asText("").trim();
        String safeCharset = ConversionUtils.escapeJs(charset);

        String script =
            "var _s=exchange.getMessage().getBody(java.lang.String.class)||'';" +
            "var _bytes=_s.getBytes(java.nio.charset.Charset.forName('" + safeCharset + "'));" +
            "var _stream=new java.io.ByteArrayInputStream(_bytes);" +
            "exchange.getMessage().setBody(_stream);" +
            (resultVar.isEmpty() ? "" : "exchange.setProperty('" + ConversionUtils.escapeJs(resultVar) + "',_stream);");
        return List.of(ConversionUtils.scriptStep("js", script));
    }

    // ── String to Byte Array ──────────────────────────────────────────────────

    private List<Map<String, Object>> convertStringToByteArray(JsonNode data) {
        String charset   = data.path("charset").asText("UTF-8").trim();
        if (charset.isEmpty()) charset = "UTF-8";
        String resultVar = data.path("resultVar").asText("").trim();

        List<Map<String, Object>> steps = new ArrayList<>();
        Map<String, Object> convertStep = new LinkedHashMap<>();
        Map<String, Object> convertBody = new LinkedHashMap<>();
        convertBody.put("type", "byte[]");
        convertBody.put("charset", charset);
        convertStep.put("convertBodyTo", convertBody);
        steps.add(convertStep);
        if (!resultVar.isEmpty()) {
            steps.add(ConversionUtils.setVarExpr(resultVar, Map.of("simple", "${body}")));
        }
        return steps;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static Map<String, Object> beanStep(String ref, String method) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ref", ref);
        body.put("method", method);
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("bean", body);
        return step;
    }
}
