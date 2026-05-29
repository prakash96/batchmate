package com.batchmate.workflow.plugin.compression;

import com.fasterxml.jackson.databind.JsonNode;
import com.batchmate.workflow.camel.api.ConversionUtils;
import com.batchmate.workflow.camel.api.NodeConverter;
import com.batchmate.workflow.camel.api.NodeConverterPlugin;

import java.util.*;

public class CompressionPlugin implements NodeConverterPlugin {

    private final Base64Helper base64Helper = new Base64Helper();
    private final GzipHelper   gzipHelper   = new GzipHelper();

    @Override
    public String pluginId() { return "compression"; }

    @Override
    public Map<String, Object> beans() {
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("base64Helper", base64Helper);
        b.put("gzipHelper",   gzipHelper);
        return b;
    }

    @Override
    public Map<String, NodeConverter> converters() {
        Map<String, NodeConverter> m = new LinkedHashMap<>();
        m.put("compress",       this::convertCompress);
        m.put("decompress",     this::convertDecompress);
        m.put("gzipcompress",   this::convertGzipCompress);
        m.put("gzipdecompress", this::convertGzipDecompress);
        m.put("gzipextract",    this::convertGzipDecompress);
        m.put("zip",            this::convertZip);
        m.put("unzip",          this::convertUnzip);
        m.put("base64encode",   this::convertBase64Encode);
        m.put("base64decode",   this::convertBase64Decode);
        return m;
    }

    private List<Map<String, Object>> convertCompress(JsonNode data) {
        String format = data.path("format").asText("gzip").toLowerCase().trim();
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("marshal", Map.of(format, new LinkedHashMap<>()));
        return List.of(step);
    }

    private List<Map<String, Object>> convertDecompress(JsonNode data) {
        String format = data.path("format").asText("gzip").toLowerCase().trim();
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("unmarshal", Map.of(format, new LinkedHashMap<>()));
        return List.of(step);
    }

    private List<Map<String, Object>> convertGzipCompress(JsonNode data) {
        return List.of(beanStep("gzipHelper", "compress"));
    }

    private List<Map<String, Object>> convertGzipDecompress(JsonNode data) {
        return List.of(beanStep("gzipHelper", "decompress"));
    }

    private static Map<String, Object> beanStep(String ref, String method) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ref", ref);
        body.put("method", method);
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("bean", body);
        return step;
    }

    private List<Map<String, Object>> convertZip(JsonNode data) {
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("marshal", Map.of("zipFile", new LinkedHashMap<>()));
        return List.of(step);
    }

    private List<Map<String, Object>> convertUnzip(JsonNode data) {
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("unmarshal", Map.of("zipFile", new LinkedHashMap<>()));
        return List.of(step);
    }

    private List<Map<String, Object>> convertBase64Encode(JsonNode data) {
        return base64Steps(data, "encode");
    }

    private List<Map<String, Object>> convertBase64Decode(JsonNode data) {
        String outputEnc = data.path("outputEncoding").asText("utf8");
        List<Map<String, Object>> steps = base64Steps(data, "decode");
        steps.add(0, ConversionUtils.setVarExpr("_b64_outputEnc", Map.of("constant", outputEnc)));
        return steps;
    }

    private List<Map<String, Object>> base64Steps(JsonNode data, String method) {
        String source     = data.path("source").asText("body");
        String sourceVar  = data.path("sourceVar").asText("");
        String sourceLit  = data.path("sourceLiteral").asText("");
        String resultVar  = data.path("resultVar").asText("").trim();
        boolean setAsBody = data.path("setAsBody").asBoolean(true);

        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.setVarExpr("_b64_source",    Map.of("constant", source)));
        steps.add(ConversionUtils.setVarExpr("_b64_sourceVar", Map.of("constant", sourceVar)));
        steps.add(ConversionUtils.setVarExpr("_b64_sourceLit", Map.of("constant", sourceLit)));
        steps.add(ConversionUtils.setVarExpr("_b64_resultVar", Map.of("constant", resultVar)));
        steps.add(ConversionUtils.setVarExpr("_b64_setAsBody", Map.of("constant", String.valueOf(setAsBody))));

        Map<String, Object> beanBody = new LinkedHashMap<>();
        beanBody.put("ref", "base64Helper");
        beanBody.put("method", method);
        Map<String, Object> beanStep = new LinkedHashMap<>();
        beanStep.put("bean", beanBody);
        steps.add(beanStep);
        return steps;
    }
}
