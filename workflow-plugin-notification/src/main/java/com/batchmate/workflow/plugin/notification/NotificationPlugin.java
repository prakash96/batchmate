package com.batchmate.workflow.plugin.notification;

import com.fasterxml.jackson.databind.JsonNode;
import com.batchmate.workflow.camel.api.ConversionUtils;
import com.batchmate.workflow.camel.api.NodeConverter;
import com.batchmate.workflow.camel.api.NodeConverterPlugin;

import java.util.*;

public class NotificationPlugin implements NodeConverterPlugin {

    @Override
    public String pluginId() { return "notification"; }

    @Override
    public Map<String, NodeConverter> converters() {
        Map<String, NodeConverter> m = new LinkedHashMap<>();
        m.put("email",   this::convertEmail);
        m.put("webhook", this::convertWebhook);
        m.put("slack",   this::convertSlack);
        return m;
    }

    private List<Map<String, Object>> convertEmail(JsonNode data) {
        String host    = data.path("host").asText("localhost");
        int    port    = data.path("port").asInt(25);
        String to      = data.path("to").asText("").trim();
        String subject = data.path("subject").asText("Notification");
        String body    = data.path("body").asText("").trim();

        List<Map<String, Object>> steps = new ArrayList<>();
        if (!body.isEmpty()) {
            steps.add(ConversionUtils.setBodyConstant(body));
        }
        String uri = "smtp://" + host + ":" + port
                   + "?to=" + to
                   + "&subject=" + ConversionUtils.escapeJs(subject);
        steps.add(ConversionUtils.toStep(uri, null));
        return steps;
    }

    private List<Map<String, Object>> convertWebhook(JsonNode data) {
        String url  = data.path("url").asText("").trim();
        String body = data.path("body").asText("{}").trim();
        return ConversionUtils.webhookPost(url, body);
    }

    private List<Map<String, Object>> convertSlack(JsonNode data) {
        String webhookUrl = data.path("webhookUrl").asText("").trim();
        String message    = data.path("message").asText("").trim();
        String jsonBody   = "{\"text\":\"" + ConversionUtils.escapeJson(message) + "\"}";
        return ConversionUtils.webhookPost(webhookUrl, jsonBody);
    }
}
