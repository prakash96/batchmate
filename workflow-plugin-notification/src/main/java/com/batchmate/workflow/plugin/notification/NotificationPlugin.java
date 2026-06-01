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
        m.put("smtp",    this::convertEmail);
        m.put("webhook", this::convertWebhook);
        m.put("slack",   this::convertSlack);
        return m;
    }

    private List<Map<String, Object>> convertEmail(JsonNode data) {
        String host = data.path("smtpHost").asText("localhost").trim();
        int    port = data.path("smtpPort").asInt(587);

        // Manual entry uses smtpUsername; connection merge uses smtpUser
        String username = data.path("smtpUsername").asText("").trim();
        if (username.isEmpty()) username = data.path("smtpUser").asText("").trim();
        String password = data.path("smtpPassword").asText("").trim();

        // Manual entry uses smtpSecurity (starttls/ssl/none); connection uses smtpTls (boolean)
        String security = data.path("smtpSecurity").asText("").trim();
        if (security.isEmpty())
            security = data.path("smtpTls").asBoolean(false) ? "starttls" : "none";

        String to         = data.path("to").asText("").trim();
        String cc         = data.path("cc").asText("").trim();
        String bcc        = data.path("bcc").asText("").trim();
        String replyTo    = data.path("replyTo").asText("").trim();
        String fromAddr   = data.path("fromAddress").asText("").trim();
        String fromName   = data.path("fromName").asText("").trim();
        String subject    = data.path("subject").asText("Notification").trim();
        String body       = data.path("body").asText("").trim();
        String bodyFormat = data.path("bodyFormat").asText("html").trim();

        String scheme = "ssl".equals(security) ? "smtps" : "smtp";
        StringBuilder uri = new StringBuilder(scheme).append("://").append(host).append(":").append(port);
        uri.append("?to=").append(enc(to));
        if (!subject.isEmpty())  uri.append("&subject=").append(enc(subject));
        if (!fromAddr.isEmpty()) {
            String from = fromName.isEmpty() ? fromAddr : fromName + " <" + fromAddr + ">";
            uri.append("&from=").append(enc(from));
        }
        if (!cc.isEmpty())       uri.append("&CC=").append(enc(cc));
        if (!bcc.isEmpty())      uri.append("&BCC=").append(enc(bcc));
        if (!replyTo.isEmpty())  uri.append("&replyTo=").append(enc(replyTo));
        if (!username.isEmpty()) uri.append("&username=").append(enc(username));
        if (!password.isEmpty()) uri.append("&password=").append(enc(password));
        if ("html".equals(bodyFormat)) uri.append("&contentType=text%2Fhtml");
        if ("starttls".equals(security)) uri.append("&mail.smtp.starttls.enable=true");

        List<Map<String, Object>> steps = new ArrayList<>();
        if (!body.isEmpty()) steps.add(ConversionUtils.setBodyConstant(body));
        steps.add(ConversionUtils.logMsg("smtp: Sending email to " + to));
        steps.add(ConversionUtils.toStep(uri.toString(), null));
        return steps;
    }

    /** URL-encodes a value, but passes Camel property placeholders ({{...}}) through unchanged. */
    private static String enc(String s) {
        if (s.startsWith("{{") && s.endsWith("}}")) return s;
        try {
            return java.net.URLEncoder.encode(s, "UTF-8").replace("+", "%20");
        } catch (java.io.UnsupportedEncodingException e) {
            return s;
        }
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
