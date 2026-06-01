package com.batchmate.workflow.plugin.compression;

import org.apache.camel.Exchange;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

public class GzipHelper {

    public void compress(Exchange exchange) throws IOException {
        Object body = exchange.getMessage().getBody();
        byte[] input;
        if (body instanceof byte[]) {
            input = (byte[]) body;
        } else {
            String s = body != null ? body.toString() : "";
            input = s.getBytes(StandardCharsets.UTF_8);
        }
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (GZIPOutputStream gz = new GZIPOutputStream(baos)) {
            gz.write(input);
        }
        exchange.getMessage().setBody(baos.toByteArray());
    }

    public void decompress(Exchange exchange) throws IOException {
        Object body = exchange.getMessage().getBody();
        StringBuilder sb = new StringBuilder();
        try (GZIPInputStream gz = new GZIPInputStream(toInputStream(body));
             BufferedReader br = new BufferedReader(new InputStreamReader(gz, StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) sb.append(line).append('\n');
        }
        exchange.getMessage().setBody(sb.toString().trim());
    }

    private static InputStream toInputStream(Object body) throws IOException {
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

        // String body: ISO-8859-1 preserves all byte values 0-255 for a lossless round-trip
        return new ByteArrayInputStream(body != null
                ? body.toString().getBytes(StandardCharsets.ISO_8859_1)
                : new byte[0]);
    }
}
