package com.batchmate.workflow.plugin.compression;

import org.apache.camel.Exchange;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

public class Base64Helper {

    public void encode(Exchange exchange) {
        String source     = prop(exchange, "_b64_source",    "body");
        String sourceVar  = prop(exchange, "_b64_sourceVar", "");
        String sourceLit  = prop(exchange, "_b64_sourceLit", "");
        String resultVar  = prop(exchange, "_b64_resultVar", "");
        boolean setAsBody = "true".equals(prop(exchange, "_b64_setAsBody", "true"));

        byte[] input = resolveBytes(exchange, source, sourceVar, sourceLit);
        String encoded = Base64.getEncoder().encodeToString(input);

        if (!resultVar.isEmpty()) exchange.setProperty(resultVar, encoded);
        if (setAsBody) exchange.getMessage().setBody(encoded);
    }

    public void decode(Exchange exchange) {
        String source      = prop(exchange, "_b64_source",    "body");
        String sourceVar   = prop(exchange, "_b64_sourceVar", "");
        String sourceLit   = prop(exchange, "_b64_sourceLit", "");
        String outputEnc   = prop(exchange, "_b64_outputEnc", "utf8");
        String resultVar   = prop(exchange, "_b64_resultVar", "");
        boolean setAsBody  = "true".equals(prop(exchange, "_b64_setAsBody", "true"));

        String raw = resolveString(exchange, source, sourceVar, sourceLit).trim();
        byte[] decoded = Base64.getDecoder().decode(raw);

        // Body is always byte[] so binary downstream processors (e.g. gzip) receive raw bytes
        // without charset corruption. outputEncoding only controls the resultVar representation.
        if (setAsBody) exchange.getMessage().setBody(decoded);
        if (!resultVar.isEmpty()) {
            Object varResult = "binary".equals(outputEnc) ? decoded : new String(decoded, StandardCharsets.UTF_8);
            exchange.setProperty(resultVar, varResult);
        }
    }

    private byte[] resolveBytes(Exchange exchange, String source, String varName, String literal) {
        if ("body".equals(source)) {
            Object body = exchange.getMessage().getBody();
            if (body instanceof byte[]) return (byte[]) body;
        } else if ("variable".equals(source)) {
            Object v = exchange.getProperty(varName);
            if (v instanceof byte[]) return (byte[]) v;
        }
        String s = resolveString(exchange, source, varName, literal);
        return s.getBytes(StandardCharsets.UTF_8);
    }

    private String resolveString(Exchange exchange, String source, String varName, String literal) {
        switch (source) {
            case "variable": {
                Object v = exchange.getProperty(varName);
                return v != null ? v.toString() : "";
            }
            case "literal":
                return literal;
            default: {
                Object body = exchange.getMessage().getBody();
                if (body == null) return "";
                if (body instanceof byte[]) return new String((byte[]) body, StandardCharsets.UTF_8);
                return body.toString();
            }
        }
    }

    private static String prop(Exchange exchange, String key, String defaultVal) {
        Object v = exchange.getProperty(key);
        return v != null ? v.toString() : defaultVal;
    }
}
