package com.batchmate.workflow.plugin.compression;

import org.apache.camel.Exchange;

import java.io.*;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

public class GzipHelper {

    public void compress(Exchange exchange) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        // Streams straight from the source (including a fresh file-read GenericFile) into the
        // gzip output instead of first buffering the whole input into a byte[] — halves peak
        // memory for large payloads and fixes GenericFile/InputStream bodies, which previously
        // fell through to Object.toString() here and silently compressed garbage.
        try (InputStream in = toInputStream(exchange.getMessage().getBody(), StandardCharsets.UTF_8);
             GZIPOutputStream gz = new GZIPOutputStream(baos)) {
            in.transferTo(gz);
        }
        exchange.getMessage().setBody(baos.toByteArray());
    }

    public void decompress(Exchange exchange) throws IOException {
        Object body = exchange.getMessage().getBody();
        StringBuilder sb = new StringBuilder();
        try (GZIPInputStream gz = new GZIPInputStream(toInputStream(body, StandardCharsets.ISO_8859_1));
             BufferedReader br = new BufferedReader(new InputStreamReader(gz, StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) sb.append(line).append('\n');
        }
        exchange.getMessage().setBody(sb.toString().trim());
    }

    /**
     * stringCharset only applies to the plain-String fallback branch, so each caller keeps its
     * original encoding: compress() used UTF-8 for String bodies, decompress() used ISO-8859-1
     * for a lossless byte round-trip — swapping either would silently corrupt non-ASCII content.
     */
    private static InputStream toInputStream(Object body, Charset stringCharset) throws IOException {
        if (body instanceof InputStream) return (InputStream) body;
        if (body instanceof byte[])     return new ByteArrayInputStream((byte[]) body);

        // Camel GenericFile — read the underlying file as raw bytes to avoid charset corruption
        if (body != null && body.getClass().getName().contains("GenericFile")) {
            try {
                java.lang.reflect.Method gf = body.getClass().getMethod("getFile");
                java.io.File f = (java.io.File) gf.invoke(body);
                if (f != null) return new java.io.FileInputStream(f);
            } catch (Exception ignored) {}
            try {
                java.lang.reflect.Method gp = body.getClass().getMethod("getAbsoluteFilePath");
                String path = (String) gp.invoke(body);
                if (path != null) return new java.io.FileInputStream(path);
            } catch (Exception ignored) {}
        }

        // String body fallback — charset is caller-specific (see toInputStream javadoc above)
        return new ByteArrayInputStream(body != null
                ? body.toString().getBytes(stringCharset)
                : new byte[0]);
    }
}
