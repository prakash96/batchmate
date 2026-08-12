package com.batchmate.workflow.plugin.ibmmq;

import com.fasterxml.jackson.databind.JsonNode;
import com.batchmate.workflow.camel.api.ConnectionTester;
import com.batchmate.workflow.camel.api.ConversionUtils;
import com.batchmate.workflow.camel.api.NodeConverter;
import com.batchmate.workflow.camel.api.NodeConverterPlugin;
import com.batchmate.workflow.camel.api.TestResult;
import com.ibm.mq.MQException;
import com.ibm.mq.MQQueueManager;

import java.util.*;

public class IbmMqPlugin implements NodeConverterPlugin {

    private final IbmMqHelper ibmMqHelper = new IbmMqHelper();

    @Override
    public String pluginId() { return "ibmmq"; }

    @Override
    public Map<String, NodeConverter> converters() {
        Map<String, NodeConverter> m = new LinkedHashMap<>();
        m.put("mqpublish", this::convertMqPublish);
        m.put("mqconsume", this::convertMqConsume);
        return m;
    }

    @Override
    public Map<String, Object> beans() {
        return Collections.singletonMap("ibmMqHelper", ibmMqHelper);
    }

    @Override
    public Map<String, ConnectionTester> connectionTesters() {
        return Collections.singletonMap("ibmmq", config -> {
            String host   = config.path("host").asText("localhost");
            int    port   = config.path("port").asInt(1414);
            String ch     = config.path("channel").asText("SYSTEM.DEF.SVRCONN");
            String qmgr   = config.path("queueManager").asText("");
            String user   = config.path("username").asText("");
            String pass   = config.path("password").asText("");

            Hashtable<String, Object> props = new Hashtable<>();
            props.put("hostname", host);
            props.put("port", port);
            props.put("channel", ch);
            props.put("transportType", 1);
            if (!user.isEmpty()) props.put("userID", user);
            if (!pass.isEmpty()) props.put("password", pass);

            try {
                MQQueueManager qm = new MQQueueManager(qmgr, props);
                qm.disconnect();
                return new TestResult(true, "Connected to " + host + ":" + port + " / " + qmgr);
            } catch (MQException e) {
                return new TestResult(false, "MQ error " + e.reasonCode + ": " + e.getMessage());
            } catch (Exception e) {
                return new TestResult(false, e.getMessage());
            }
        });
    }

    private List<Map<String, Object>> convertMqPublish(JsonNode data) {
        String host         = data.path("host").asText("localhost");
        String port         = String.valueOf(data.path("port").asInt(1414));
        String channel      = data.path("channel").asText("SYSTEM.DEF.SVRCONN");
        String queueManager = data.path("queueManager").asText("").trim();
        String username     = data.path("username").asText("").trim();
        String password     = data.path("password").asText("").trim();
        String destType     = data.path("destType").asText("QUEUE").trim();
        String destName     = ConversionUtils.uiToSimple(data.path("destName").asText("").trim());
        boolean persistent  = data.path("persistent").asBoolean(true);
        String expiry       = String.valueOf(data.path("expiry").asInt(0));
        String priority     = String.valueOf(data.path("priority").asInt(-1));
        String corrId       = ConversionUtils.uiToSimple(data.path("correlationId").asText("").trim());
        String resultVar    = data.path("resultVar").asText("").trim();

        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("mqpublish: Sending to " + destType + " [" + destName + "] on " + host + ":" + port));
        steps.add(ConversionUtils.setVarExpr("_op_host",         Map.of("constant", host)));
        steps.add(ConversionUtils.setVarExpr("_op_port",         Map.of("constant", port)));
        steps.add(ConversionUtils.setVarExpr("_op_channel",      Map.of("constant", channel)));
        steps.add(ConversionUtils.setVarExpr("_op_queueManager", Map.of("constant", queueManager)));
        steps.add(ConversionUtils.setVarExpr("_op_username",     Map.of("constant", username)));
        steps.add(ConversionUtils.setVarExpr("_op_password",     Map.of("constant", password)));
        steps.add(ConversionUtils.setVarExpr("_op_destType",     Map.of("constant", destType)));
        steps.add(ConversionUtils.setVarExpr("_op_destName",     ConversionUtils.simpleOrConstant(destName)));
        steps.add(ConversionUtils.setVarExpr("_op_persistent",   Map.of("constant", String.valueOf(persistent))));
        steps.add(ConversionUtils.setVarExpr("_op_expiry",       Map.of("constant", expiry)));
        steps.add(ConversionUtils.setVarExpr("_op_priority",     Map.of("constant", priority)));
        steps.add(ConversionUtils.setVarExpr("_op_correlationId",ConversionUtils.simpleOrConstant(corrId)));
        steps.add(ConversionUtils.setVarExpr("_op_var",          Map.of("constant", resultVar)));
        steps.add(beanStep("ibmMqHelper", "publish"));
        return steps;
    }

    private List<Map<String, Object>> convertMqConsume(JsonNode data) {
        String host         = data.path("host").asText("localhost");
        String port         = String.valueOf(data.path("port").asInt(1414));
        String channel      = data.path("channel").asText("SYSTEM.DEF.SVRCONN");
        String queueManager = data.path("queueManager").asText("").trim();
        String username     = data.path("username").asText("").trim();
        String password     = data.path("password").asText("").trim();
        String destName     = ConversionUtils.uiToSimple(data.path("destName").asText("").trim());
        String waitInterval = String.valueOf(data.path("waitInterval").asInt(0));
        String corrId       = ConversionUtils.uiToSimple(data.path("correlationId").asText("").trim());
        String resultVar    = data.path("resultVar").asText("").trim();

        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("mqconsume: Reading from queue [" + destName + "] on " + host + ":" + port));
        steps.add(ConversionUtils.setVarExpr("_op_host",         Map.of("constant", host)));
        steps.add(ConversionUtils.setVarExpr("_op_port",         Map.of("constant", port)));
        steps.add(ConversionUtils.setVarExpr("_op_channel",      Map.of("constant", channel)));
        steps.add(ConversionUtils.setVarExpr("_op_queueManager", Map.of("constant", queueManager)));
        steps.add(ConversionUtils.setVarExpr("_op_username",     Map.of("constant", username)));
        steps.add(ConversionUtils.setVarExpr("_op_password",     Map.of("constant", password)));
        steps.add(ConversionUtils.setVarExpr("_op_destName",     ConversionUtils.simpleOrConstant(destName)));
        steps.add(ConversionUtils.setVarExpr("_op_waitInterval", Map.of("constant", waitInterval)));
        steps.add(ConversionUtils.setVarExpr("_op_correlationId",ConversionUtils.simpleOrConstant(corrId)));
        steps.add(ConversionUtils.setVarExpr("_op_var",          Map.of("constant", resultVar)));
        steps.add(beanStep("ibmMqHelper", "consume"));
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
