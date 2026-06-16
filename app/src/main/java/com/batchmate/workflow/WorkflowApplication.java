package com.batchmate.workflow;

import com.fasterxml.jackson.databind.JsonNode;
import com.batchmate.workflow.camel.NodeConverterRegistry;
import com.batchmate.workflow.camel.WorkflowToCamelAdapter;
import com.batchmate.workflow.service.CamelRouteDeployService;
import com.batchmate.workflow.service.WorkflowService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.nio.file.Path;
import java.util.List;

@SpringBootApplication
public class WorkflowApplication implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(WorkflowApplication.class);

    private final NodeConverterRegistry nodeConverterRegistry;
    private final WorkflowService workflowService;
    private final WorkflowToCamelAdapter camelAdapter;
    private final CamelRouteDeployService camelDeployService;

    public WorkflowApplication(NodeConverterRegistry nodeConverterRegistry,
                                WorkflowService workflowService,
                                WorkflowToCamelAdapter camelAdapter,
                                CamelRouteDeployService camelDeployService) {
        this.nodeConverterRegistry = nodeConverterRegistry;
        this.workflowService       = workflowService;
        this.camelAdapter          = camelAdapter;
        this.camelDeployService    = camelDeployService;
    }

    public static void main(String[] args) {
        disableSslVerification();
        SpringApplication.run(WorkflowApplication.class, args);
    }

    // ── TrustManagerFactorySpi that returns a no-op X509TrustManager ─────────
    // Registered as a Security Provider so ALL SSL code in the JVM — including
    // Apache HttpClient which calls SSLContext.init(null,null,null) internally —
    // gets a trust-all manager instead of the PKIX validator that reads cacerts.
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
            // 1. Register a Security Provider that intercepts TrustManagerFactory instantiation
            //    for all standard algorithms. This covers Apache HttpClient (and any other code
            //    that calls TrustManagerFactory.getInstance("PKIX").init(null)).
            String spiClass = TrustAllTMFSpi.class.getName();
            java.security.Security.insertProviderAt(
                new java.security.Provider("TrustAll", "1.0", "Trust-all TrustManagerFactory") {
                    private static final long serialVersionUID = 1L;
                    { for (String alg : new String[]{"PKIX","SunX509","X509","X.509"})
                          put("TrustManagerFactory." + alg, spiClass); }
                }, 1);

            // 2. Also set JVM default SSLContext + HttpsURLConnection defaults (belt-and-suspenders).
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
        nodeConverterRegistry.getPluginStatus().forEach(line -> log.info("{}", line));

        log.info("─── Workflow Startup Load ───────────────────────────");
        List<JsonNode> workflows = workflowService.list();
        int deployed = 0, failed = 0;
        for (JsonNode workflow : workflows) {
            String workflowId = workflow.path("id").asText(null);
            if (workflowId == null || workflowId.isBlank()) continue;
            String workflowName = workflow.path("name").asText(workflowId);
            try {
                String yaml     = camelAdapter.convert(workflow);
                Path   yamlPath = workflowService.saveCamelYaml(workflowId, yaml);
                camelDeployService.deploy(workflowId, yamlPath);
                log.info("  ✓  {}", workflowName);
                deployed++;
            } catch (Exception e) {
                log.warn("  ✗  {} — {}", workflowName, e.getMessage());
                failed++;
            }
        }
        log.info("Startup: {} deployed, {} skipped/failed (total {})",
                 deployed, failed, workflows.size());
    }
}

