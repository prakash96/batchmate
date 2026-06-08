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

    private static void disableSslVerification() {
        try {
            javax.net.ssl.TrustManager[] trustAll = { new javax.net.ssl.X509TrustManager() {
                public java.security.cert.X509Certificate[] getAcceptedIssuers() { return new java.security.cert.X509Certificate[0]; }
                public void checkClientTrusted(java.security.cert.X509Certificate[] c, String t) {}
                public void checkServerTrusted(java.security.cert.X509Certificate[] c, String t) {}
            }};
            javax.net.ssl.SSLContext sc = javax.net.ssl.SSLContext.getInstance("TLS");
            sc.init(null, trustAll, new java.security.SecureRandom());
            javax.net.ssl.SSLContext.setDefault(sc);
            javax.net.ssl.HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());
            javax.net.ssl.HttpsURLConnection.setDefaultHostnameVerifier((h, s) -> true);
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

