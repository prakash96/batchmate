package com.batchmate.workflow.plugin.notification;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.camel.Exchange;

import javax.activation.DataHandler;
import javax.mail.util.ByteArrayDataSource;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class NotificationHelper {

    private static final ObjectMapper OM = new ObjectMapper();

    /**
     * Reads exchange properties set up by the smtp converter and builds the
     * CamelMailAttachments header so Camel mail sends them as MIME attachments.
     *
     * Properties consumed:
     *   _smtp_ab_content  — body content to attach (set before setBody overwrites it)
     *   _smtp_ab_name     — filename for the body attachment
     *   _smtp_av_content  — variable content to attach
     *   _smtp_av_name     — filename for the variable attachment
     */
    public void buildAttachments(Exchange exchange) throws Exception {
        Map<String, DataHandler> attachments = new LinkedHashMap<>();

        Object bodyContent = exchange.getProperty("_smtp_ab_content");
        if (bodyContent != null) {
            String name = strProp(exchange, "_smtp_ab_name", "attachment.bin");
            attachments.put(name, toDataHandler(bodyContent, name));
        }

        Object varContent = exchange.getProperty("_smtp_av_content");
        if (varContent != null) {
            String name = strProp(exchange, "_smtp_av_name", "attachment.bin");
            attachments.put(name, toDataHandler(varContent, name));
        }

        if (!attachments.isEmpty()) {
            exchange.getMessage().setHeader("CamelMailAttachments", attachments);
        }
    }

    private static DataHandler toDataHandler(Object val, String filename) throws Exception {
        byte[] bytes = toBytes(val);
        return new DataHandler(new ByteArrayDataSource(bytes, mimeType(filename)));
    }

    private static byte[] toBytes(Object val) throws Exception {
        if (val instanceof byte[]) return (byte[]) val;
        if (val instanceof String) return ((String) val).getBytes(StandardCharsets.UTF_8);
        if (val instanceof List || val instanceof Map) {
            return OM.writeValueAsString(val).getBytes(StandardCharsets.UTF_8);
        }
        return String.valueOf(val).getBytes(StandardCharsets.UTF_8);
    }

    private static String mimeType(String filename) {
        if (filename == null) return "application/octet-stream";
        String lower = filename.toLowerCase();
        if (lower.endsWith(".json"))                          return "application/json";
        if (lower.endsWith(".csv"))                          return "text/csv";
        if (lower.endsWith(".txt") || lower.endsWith(".log")) return "text/plain";
        if (lower.endsWith(".xml"))                          return "application/xml";
        if (lower.endsWith(".pdf"))                          return "application/pdf";
        return "application/octet-stream";
    }

    private static String strProp(Exchange exchange, String key, String fallback) {
        Object v = exchange.getProperty(key);
        if (v == null || String.valueOf(v).isEmpty()) return fallback;
        return String.valueOf(v);
    }
}
