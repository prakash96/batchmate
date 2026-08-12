package com.batchmate.workflow.plugin.as2;

import com.fasterxml.jackson.databind.JsonNode;
import com.batchmate.workflow.camel.api.ConnectionTester;
import com.batchmate.workflow.camel.api.ConversionUtils;
import com.batchmate.workflow.camel.api.NodeConverter;
import com.batchmate.workflow.camel.api.NodeConverterPlugin;
import com.batchmate.workflow.camel.api.TestResult;

import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.*;

public class As2Plugin implements NodeConverterPlugin {

    private final As2Helper as2Helper = new As2Helper();

    @Override
    public String pluginId() { return "as2"; }

    @Override
    public Map<String, NodeConverter> converters() {
        Map<String, NodeConverter> m = new LinkedHashMap<>();
        m.put("as2send", this::convertAs2Send);
        return m;
    }

    @Override
    public Map<String, Object> beans() {
        return Collections.singletonMap("as2Helper", as2Helper);
    }

    @Override
    public Map<String, ConnectionTester> connectionTesters() {
        return Collections.singletonMap("as2", config -> {
            String host = config.path("host").asText("localhost");
            int    port = config.path("port").asInt(4080);
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(host, port), 10_000);
                return new TestResult(true, "Connected to " + host + ":" + port);
            } catch (Exception e) {
                return new TestResult(false, e.getMessage());
            }
        });
    }

    private List<Map<String, Object>> convertAs2Send(JsonNode data) {
        String host         = data.path("host").asText("localhost");
        String port         = String.valueOf(data.path("port").asInt(4080));
        boolean useHttps    = data.path("useHttps").asBoolean(false);
        String requestUri   = data.path("requestUri").asText("/as2").trim();
        String as2From      = ConversionUtils.uiToSimple(data.path("as2From").asText("").trim());
        String as2To        = ConversionUtils.uiToSimple(data.path("as2To").asText("").trim());
        String subject      = ConversionUtils.uiToSimple(data.path("subject").asText("AS2 Message").trim());
        String from         = data.path("from").asText("").trim();
        String clientFqdn   = data.path("clientFqdn").asText("batchmate.local").trim();
        String as2Version   = data.path("as2Version").asText("1.1").trim();
        String contentType  = data.path("contentType").asText("application/EDI-X12").trim();
        String fileName     = ConversionUtils.uiToSimple(data.path("fileName").asText("message.edi").trim());
        String msgStructure  = data.path("messageStructure").asText("PLAIN").trim();
        String signingAlg    = data.path("signingAlgorithm").asText("SHA256WITHRSA").trim();
        String keystorePath  = ConversionUtils.uiToSimple(data.path("keystorePath").asText("").trim());
        String keystorePass  = data.path("keystorePassword").asText("").trim();
        String keyAlias     = data.path("keyAlias").asText("").trim();
        String mdnEmail     = data.path("mdnEmail").asText("").trim();
        String resultVar    = data.path("resultVar").asText("").trim();

        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("as2send: Sending to " + host + ":" + port
                + " [AS2-From=" + as2From + ", AS2-To=" + as2To
                + ", structure=" + msgStructure + "]"));
        steps.add(ConversionUtils.setVarExpr("_op_host",        Map.of("constant", host)));
        steps.add(ConversionUtils.setVarExpr("_op_port",        Map.of("constant", port)));
        steps.add(ConversionUtils.setVarExpr("_op_https",       Map.of("constant", String.valueOf(useHttps))));
        steps.add(ConversionUtils.setVarExpr("_op_requestUri",  Map.of("constant", requestUri)));
        steps.add(ConversionUtils.setVarExpr("_op_as2From",     ConversionUtils.simpleOrConstant(as2From)));
        steps.add(ConversionUtils.setVarExpr("_op_as2To",       ConversionUtils.simpleOrConstant(as2To)));
        steps.add(ConversionUtils.setVarExpr("_op_subject",     ConversionUtils.simpleOrConstant(subject)));
        steps.add(ConversionUtils.setVarExpr("_op_from",        Map.of("constant", from)));
        steps.add(ConversionUtils.setVarExpr("_op_clientFqdn",  Map.of("constant", clientFqdn)));
        steps.add(ConversionUtils.setVarExpr("_op_as2Version",  Map.of("constant", as2Version)));
        steps.add(ConversionUtils.setVarExpr("_op_contentType", Map.of("constant", contentType)));
        steps.add(ConversionUtils.setVarExpr("_op_fileName",    ConversionUtils.simpleOrConstant(fileName)));
        steps.add(ConversionUtils.setVarExpr("_op_msgStructure", Map.of("constant", msgStructure)));
        steps.add(ConversionUtils.setVarExpr("_op_signingAlg",   Map.of("constant", signingAlg)));
        steps.add(ConversionUtils.setVarExpr("_op_keystorePath", ConversionUtils.simpleOrConstant(keystorePath)));
        steps.add(ConversionUtils.setVarExpr("_op_keystorePass",Map.of("constant", keystorePass)));
        steps.add(ConversionUtils.setVarExpr("_op_keyAlias",    Map.of("constant", keyAlias)));
        steps.add(ConversionUtils.setVarExpr("_op_mdnEmail",    Map.of("constant", mdnEmail)));
        steps.add(ConversionUtils.setVarExpr("_op_var",         Map.of("constant", resultVar)));
        steps.add(beanStep("as2Helper", "send"));
        return steps;
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
