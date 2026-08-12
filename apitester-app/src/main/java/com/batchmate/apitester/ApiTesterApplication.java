package com.batchmate.apitester;

import com.batchmate.apitester.camel.RequestConverterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ApiTesterApplication implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(ApiTesterApplication.class);

    private final RequestConverterRegistry requestConverterRegistry;

    public ApiTesterApplication(RequestConverterRegistry requestConverterRegistry) {
        this.requestConverterRegistry = requestConverterRegistry;
    }

    public static void main(String[] args) {
        disableSslVerification();
        SpringApplication.run(ApiTesterApplication.class, args);
    }

    // Same trust-all bootstrap as workflow-app's WorkflowApplication — this environment's
    // internal/staging APIs are commonly fronted by self-signed certs.
    public static final class TrustAllTMFSpi extends javax.net.ssl.TrustManagerFactorySpi {
        private static final javax.net.ssl.TrustManager[] TMS = { new javax.net.ssl.X509TrustManager() {
            public java.security.cert.X509Certificate[] getAcceptedIssuers() { return new java.security.cert.X509Certificate[0]; }
            public void checkClientTrusted(java.security.cert.X509Certificate[] c, String t) {}
            public void checkServerTrusted(java.security.cert.X509Certificate[] c, String t) {}
        }};
        @Override protected void engineInit(java.security.KeyStore ks) {}
        @Override protected void engineInit(javax.net.ssl.ManagerFactoryParameters s) {}
        @Override protected javax.net.ssl.TrustManager[] engineGetTrustManagers() { return TMS; }
    }

    private static void disableSslVerification() {
        try {
            String spiClass = TrustAllTMFSpi.class.getName();
            java.security.Security.insertProviderAt(
                new java.security.Provider("TrustAll", "1.0", "Trust-all TrustManagerFactory") {
                    private static final long serialVersionUID = 1L;
                    { for (String alg : new String[]{"PKIX","SunX509","X509","X.509"})
                          put("TrustManagerFactory." + alg, spiClass); }
                }, 1);

            javax.net.ssl.TrustManager[] trustAll = TrustAllTMFSpi.TMS;
            javax.net.ssl.SSLContext sc = javax.net.ssl.SSLContext.getInstance("TLS");
            sc.init(null, trustAll, new java.security.SecureRandom());
            javax.net.ssl.SSLContext.setDefault(sc);
            javax.net.ssl.HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());
            javax.net.ssl.HttpsURLConnection.setDefaultHostnameVerifier((h, s) -> true);

            System.out.println("INFO: SSL certificate verification disabled (trust-all)");
        } catch (Exception e) {
            System.err.println("WARN: Could not disable SSL verification: " + e.getMessage());
        }
    }

    @Override
    public void run(String... args) throws Exception {
        log.info("─── Plugin Registry ─────────────────────────────────");
        requestConverterRegistry.getPluginStatus().forEach(line -> log.info("{}", line));
    }
}
