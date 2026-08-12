package com.batchmate.workflow.plugin.compression;

import org.apache.camel.Exchange;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

public class Base64Helper {

    public void encode(Exchange exchange) throws IOException {
        String source     = prop(exchange, "_b64_source",    "body");
        String sourceVar  = prop(exchange, "_b64_sourceVar", "");
        String sourceLit  = prop(exchange, "_b64_sourceLit", "");
        String resultVar  = prop(exchange, "_b64_resultVar", "");
        boolean setAsBody = "true".equals(prop(exchange, "_b64_setAsBody", "true"));

        // A fresh file-read result (Camel GenericFile) or raw InputStream is streamed straight
        // through the base64 encoder instead of being buffered into a byte[] first — this also
        // fixes those two body types, which previously fell through to Object.toString() in
        // resolveBytes()/resolveString() and silently encoded garbage instead of file content.
        Object raw = "variable".equals(source) ? exchange.getProperty(sourceVar)
                   : "literal".equals(source)  ? null
                   : exchange.getMessage().getBody();
        InputStream streamed = asStream(raw);

        String encoded;
        if (streamed != null) {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            try (InputStream in = streamed; OutputStream b64out = Base64.getEncoder().wrap(baos)) {
                in.transferTo(b64out);
            }
            encoded = baos.toString(StandardCharsets.US_ASCII);
        } else {
            encoded = Base64.getEncoder().encodeToString(resolveBytes(exchange, source, sourceVar, sourceLit));
        }

        if (!resultVar.isEmpty()) exchange.setProperty(resultVar, encoded);
        if (setAsBody) exchange.getMessage().setBody(encoded);
    }

    /** Returns a readable stream for a GenericFile/InputStream body, or null for anything else
     *  (byte[]/String/literal), in which case the caller falls back to resolveBytes(). */
    private static InputStream asStream(Object body) {
        if (body instanceof InputStream) return (InputStream) body;
        if (body != null && body.getClass().getName().contains("GenericFile")) {
            try {
                java.lang.reflect.Method gf = body.getClass().getMethod("getFile");
                File f = (File) gf.invoke(body);
                if (f != null) return new FileInputStream(f);
            } catch (Exception ignored) {}
            try {
                java.lang.reflect.Method gp = body.getClass().getMethod("getAbsoluteFilePath");
                String path = (String) gp.invoke(body);
                if (path != null) return new FileInputStream(path);
            } catch (Exception ignored) {}
        }
        return null;
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
