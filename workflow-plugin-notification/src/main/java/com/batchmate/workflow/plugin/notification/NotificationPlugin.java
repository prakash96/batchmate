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

        String username = data.path("smtpUsername").asText("").trim();
        if (username.isEmpty()) username = data.path("smtpUser").asText("").trim();
        String password = data.path("smtpPassword").asText("").trim();

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

        List<Map<String, Object>> steps = new ArrayList<>();

        // Body — setBody with expression evaluation so ${vars.x} is resolved
        if (!body.isEmpty()) {
            Map<String, Object> sb = new LinkedHashMap<>();
            sb.put("expression", ConversionUtils.simpleOrConstant(body));
            Map<String, Object> sbStep = new LinkedHashMap<>();
            sbStep.put("setBody", sb);
            steps.add(sbStep);
        }

        // Set message headers before the mail step — Camel mail reads these and they
        // override the URI parameters, so expressions like ${vars.subject} are evaluated.
        if (!subject.isEmpty())  steps.add(mailHeader("subject",  subject));
        if (!to.isEmpty())       steps.add(mailHeader("to",       to));
        if (!cc.isEmpty())       steps.add(mailHeader("cc",       cc));
        if (!bcc.isEmpty())      steps.add(mailHeader("bcc",      bcc));
        if (!replyTo.isEmpty())  steps.add(mailHeader("Reply-To", replyTo));
        if (!fromAddr.isEmpty()) {
            String fromFull = fromName.isEmpty() ? fromAddr : fromName + " <" + fromAddr + ">";
            steps.add(mailHeader("from", fromFull));
        }

        // URI carries only connection/auth/TLS/format — no subject/recipients.
        // The `to` param is required by Camel mail as a default; the header above overrides it.
        String scheme = "ssl".equals(security) ? "smtps" : "smtp";
        String uriTo  = to.contains("${") ? "to@batchmate.local" : enc(to);
        StringBuilder uri = new StringBuilder(scheme).append("://").append(host).append(":").append(port)
            .append("?to=").append(uriTo);
        if (!username.isEmpty()) uri.append("&username=").append(enc(username));
        if (!password.isEmpty()) uri.append("&password=").append(enc(password));
        if ("html".equals(bodyFormat)) uri.append("&contentType=text%2Fhtml");
        if ("starttls".equals(security)) uri.append("&mail.smtp.starttls.enable=true");

        steps.add(ConversionUtils.logMsg("smtp: Sending email to " + to));
        steps.add(ConversionUtils.toStep(uri.toString(), null));
        return steps;
    }

    /**
     * Builds a setHeader step whose value is evaluated as a Simple expression when it
     * contains ${…} (so vars.x / headers.x are resolved at runtime), or as a constant otherwise.
     */
    private static Map<String, Object> mailHeader(String name, String value) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("expression", ConversionUtils.simpleOrConstant(value));
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("setHeader", body);
        return step;
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
