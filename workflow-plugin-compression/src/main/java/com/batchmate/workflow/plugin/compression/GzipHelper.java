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
        InputStream is;
        if (body instanceof InputStream) {
            is = (InputStream) body;
        } else if (body instanceof byte[]) {
            is = new ByteArrayInputStream((byte[]) body);
        } else {
            // String bodies: ISO-8859-1 is a lossless byte round-trip for values 0-255
            is = new ByteArrayInputStream(body.toString().getBytes(StandardCharsets.ISO_8859_1));
        }
        StringBuilder sb = new StringBuilder();
        try (GZIPInputStream gz = new GZIPInputStream(is);
             BufferedReader br = new BufferedReader(new InputStreamReader(gz, StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line).append('\n');
            }
        }
        exchange.getMessage().setBody(sb.toString().trim());
    }
}
