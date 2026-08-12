package com.batchmate.workflow.plugin.as2;

import org.apache.camel.Exchange;
import org.apache.camel.component.as2.api.AS2ClientConnection;
import org.apache.camel.component.as2.api.AS2ClientManager;
import org.apache.camel.component.as2.api.AS2MessageStructure;
import org.apache.camel.component.as2.api.AS2SignatureAlgorithm;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.conn.ssl.NoopHostnameVerifier;
import org.apache.http.conn.ssl.SSLConnectionSocketFactory;
import org.apache.http.entity.ByteArrayEntity;
import org.apache.http.entity.ContentType;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClientBuilder;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.protocol.HttpCoreContext;

import javax.net.ssl.*;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.UUID;

public class As2Helper {

    /**
     * Sends the exchange body as an AS2 message to a trading partner.
     * Parameters are read from exchange properties set by As2Plugin.
     *
     * PLAIN messages use Apache HttpClient directly to avoid Camel AS2 entity-
     * creation issues.  SIGNED messages fall back to AS2ClientManager (requires
     * a configured keystore).
     */
    public void send(Exchange exchange) throws Exception {
        String host         = prop(exchange, "_op_host", "localhost");
        int    port         = Integer.parseInt(prop(exchange, "_op_port", "4080"));
        boolean https       = "true".equals(prop(exchange, "_op_https", "false"));
        String requestUri   = prop(exchange, "_op_requestUri", "/as2");
        String as2From      = prop(exchange, "_op_as2From", "");
        String as2To        = prop(exchange, "_op_as2To", "");
        String subject      = prop(exchange, "_op_subject", "AS2 Message");
        String from         = prop(exchange, "_op_from", "");
        String clientFqdn   = prop(exchange, "_op_clientFqdn", "batchmate.local");
        String as2Version   = prop(exchange, "_op_as2Version", "1.1");
        String contentType  = prop(exchange, "_op_contentType", "application/EDI-X12");
        String fileName     = prop(exchange, "_op_fileName", "message.edi");
        String msgStructure = prop(exchange, "_op_msgStructure", "PLAIN");
        String signingAlgStr = prop(exchange, "_op_signingAlg", "SHA256WITHRSA");
        String keystorePath  = prop(exchange, "_op_keystorePath", "");
        String keystorePass  = prop(exchange, "_op_keystorePass", "");
        String keyAlias      = prop(exchange, "_op_keyAlias", "");
        String mdnEmail     = prop(exchange, "_op_mdnEmail", "");
        String resultVar    = prop(exchange, "_op_var", "");

        byte[] bodyBytes = exchange.getMessage().getBody(byte[].class);
        if (bodyBytes == null) {
            String s = exchange.getMessage().getBody(String.class);
            bodyBytes = s != null ? s.getBytes(StandardCharsets.UTF_8) : null;
        }
        if (bodyBytes == null || bodyBytes.length == 0) {
            throw new IllegalArgumentException("AS2 body is empty — cannot send an empty EDI message");
        }

        boolean needSigning = "SIGNED".equals(msgStructure) && !keystorePath.isEmpty();
        if (needSigning) {
            sendViaCamelAs2(exchange, bodyBytes, host, port, https, requestUri, as2From, as2To,
                    subject, from, clientFqdn, as2Version, contentType, fileName,
                    signingAlgStr, keystorePath, keystorePass, keyAlias, mdnEmail, resultVar);
        } else {
            sendPlain(exchange, bodyBytes, host, port, https, requestUri, as2From, as2To,
                    subject, from, clientFqdn, as2Version, contentType, fileName, mdnEmail, resultVar);
        }
    }

    // ── PLAIN: direct Apache HttpClient POST ──────────────────────────────────

    private void sendPlain(Exchange exchange, byte[] bodyBytes,
            String host, int port, boolean https, String requestUri,
            String as2From, String as2To, String subject, String from,
            String clientFqdn, String as2Version, String contentType,
            String fileName, String mdnEmail, String resultVar) throws Exception {

        SSLContext sslCtx = https ? trustAllSslContext() : null;

        HttpClientBuilder builder = HttpClients.custom()
                .setDefaultRequestConfig(RequestConfig.custom()
                        .setConnectTimeout(10_000)
                        .setSocketTimeout(30_000)
                        .build());
        if (sslCtx != null) {
            builder.setSSLSocketFactory(
                    new SSLConnectionSocketFactory(sslCtx, NoopHostnameVerifier.INSTANCE));
        }

        String url = (https ? "https" : "http") + "://" + host + ":" + port + requestUri;
        HttpPost post = new HttpPost(url);

        post.setHeader("AS2-Version",              as2Version);
        post.setHeader("AS2-From",                 as2From);
        post.setHeader("AS2-To",                   as2To);
        post.setHeader("Subject",                  subject);
        post.setHeader("Message-ID",               "<" + UUID.randomUUID() + "@" + clientFqdn + ">");
        post.setHeader("MIME-Version",             "1.0");
        post.setHeader("Content-Transfer-Encoding","binary");
        if (!from.isEmpty())     post.setHeader("From",                        from);
        if (!mdnEmail.isEmpty()) post.setHeader("Disposition-Notification-To", mdnEmail);
        if (!fileName.isEmpty()) post.setHeader("Content-Disposition",
                "attachment; filename=\"" + fileName + "\"");

        ContentType ct;
        try {
            ct = ContentType.parse(contentType);
        } catch (Exception e) {
            ct = ContentType.create(contentType.trim());
        }
        post.setEntity(new ByteArrayEntity(bodyBytes, ct));

        try (CloseableHttpClient client = builder.build();
             CloseableHttpResponse response = client.execute(post)) {

            int statusCode = response.getStatusLine().getStatusCode();
            boolean success = statusCode >= 200 && statusCode < 300;
            writeResult(exchange, resultVar, success, statusCode, as2From, as2To);
        }
    }

    // ── SIGNED: Camel AS2ClientManager ────────────────────────────────────────

    private void sendViaCamelAs2(Exchange exchange, byte[] bodyBytes,
            String host, int port, boolean https, String requestUri,
            String as2From, String as2To, String subject, String from,
            String clientFqdn, String as2Version, String contentType,
            String fileName, String signingAlgStr, String keystorePath,
            String keystorePass, String keyAlias, String mdnEmail,
            String resultVar) throws Exception {

        String ediMessage = new String(bodyBytes, StandardCharsets.UTF_8);
        SSLContext sslContext = https ? trustAllSslContext() : null;

        AS2ClientConnection connection = new AS2ClientConnection(
                as2Version, "BatchMate/1.0", clientFqdn,
                host, port,
                Duration.ofSeconds(30),
                Duration.ofSeconds(10),
                5,
                Duration.ofMinutes(5),
                sslContext,
                null);
        AS2ClientManager clientManager = new AS2ClientManager(connection);

        AS2MessageStructure structure = AS2MessageStructure.PLAIN;
        AS2SignatureAlgorithm signingAlgorithm = null;
        Certificate[] signingCertChain = null;
        PrivateKey privateKey = null;

        if (!keystorePath.isEmpty()) {
            KeyStore ks = KeyStore.getInstance("PKCS12");
            try (FileInputStream fis = new FileInputStream(keystorePath)) {
                ks.load(fis, keystorePass.toCharArray());
            }
            String alias = keyAlias.isEmpty() ? ks.aliases().nextElement() : keyAlias;
            privateKey = (PrivateKey) ks.getKey(alias, keystorePass.toCharArray());
            signingCertChain = ks.getCertificateChain(alias);
            if (signingCertChain == null || signingCertChain.length == 0) {
                throw new RuntimeException("No certificate chain for alias '" + alias + "' in: " + keystorePath);
            }
            signingAlgorithm = AS2SignatureAlgorithm.valueOf(signingAlgStr);
            structure = AS2MessageStructure.SIGNED;
        }

        HttpCoreContext httpContext = clientManager.send(
                ediMessage, requestUri, subject,
                from.isEmpty() ? null : from,
                as2From, as2To, structure,
                ContentType.create(contentType),
                "binary",
                signingAlgorithm, signingCertChain, privateKey,
                null,
                mdnEmail.isEmpty() ? null : mdnEmail,
                null, null, null,
                fileName);

        org.apache.http.HttpResponse response = httpContext.getResponse();
        int statusCode = (response != null && response.getStatusLine() != null)
                ? response.getStatusLine().getStatusCode() : -1;
        writeResult(exchange, resultVar, statusCode >= 200 && statusCode < 300, statusCode, as2From, as2To);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static SSLContext trustAllSslContext() throws Exception {
        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(null, new TrustManager[]{new X509TrustManager() {
            public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            public void checkClientTrusted(X509Certificate[] c, String a) {}
            public void checkServerTrusted(X509Certificate[] c, String a) {}
        }}, new SecureRandom());
        return ctx;
    }

    private static void writeResult(Exchange exchange, String resultVar,
            boolean success, int statusCode, String as2From, String as2To) {
        String result = "{\"success\":" + success + ",\"httpStatus\":" + statusCode
                + ",\"as2From\":\"" + as2From + "\",\"as2To\":\"" + as2To + "\"}";
        if (!resultVar.isEmpty()) exchange.setProperty(resultVar, result);
        else exchange.getMessage().setBody(result);
    }

    private static String prop(Exchange exchange, String key, String defaultVal) {
        Object v = exchange.getProperty(key);
        return v != null ? v.toString() : defaultVal;
    }
}
