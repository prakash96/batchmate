package com.batchmate.workflow.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.batchmate.workflow.camel.CancellationService;
import com.batchmate.workflow.camel.ExecutionCapture;
import com.batchmate.workflow.camel.NodeConverterRegistry;
import com.batchmate.workflow.camel.WorkflowToCamelAdapter;
import com.batchmate.workflow.logging.RunLoggingSetup;
import com.batchmate.workflow.service.CamelRouteDeployService;
import com.batchmate.workflow.service.ReportService;
import com.batchmate.workflow.service.WorkflowService;
import org.apache.camel.Exchange;
import org.apache.camel.ProducerTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

@RestController
@RequestMapping("/workflows")
public class WorkflowController {

    private static final Logger log = LoggerFactory.getLogger(WorkflowController.class);

    private final Map<String, Future<?>>           activeRuns  = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> runResults  = new ConcurrentHashMap<>();
    private final ExecutorService runExecutor = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "workflow-runner");
        t.setDaemon(true);
        return t;
    });

    private static final Set<String> CORE_NODE_TYPES = new HashSet<>(Arrays.asList(
        "http", "setbody", "setvariable", "condition", "iteration",
        "assertion", "log", "wait", "jsoncompare", "dbexecute",
        "throwerror", "workflowref", "textcompare"
    ));

    private final WorkflowService workflowService;
    private final WorkflowToCamelAdapter camelAdapter;
    private final CamelRouteDeployService camelDeployService;
    private final ProducerTemplate producerTemplate;
    private final ObjectMapper objectMapper;
    private final ExecutionCapture executionCapture;
    private final RunLoggingSetup runLoggingSetup;
    private final NodeConverterRegistry nodeConverterRegistry;
    private final ReportService reportService;
    private final CancellationService cancellationService;

    public WorkflowController(WorkflowService workflowService,
                               WorkflowToCamelAdapter camelAdapter,
                               CamelRouteDeployService camelDeployService,
                               ProducerTemplate producerTemplate,
                               ObjectMapper objectMapper,
                               ExecutionCapture executionCapture,
                               RunLoggingSetup runLoggingSetup,
                               NodeConverterRegistry nodeConverterRegistry,
                               ReportService reportService,
                               CancellationService cancellationService) {
        this.workflowService       = workflowService;
        this.camelAdapter          = camelAdapter;
        this.camelDeployService    = camelDeployService;
        this.producerTemplate      = producerTemplate;
        this.objectMapper          = objectMapper;
        this.executionCapture      = executionCapture;
        this.runLoggingSetup       = runLoggingSetup;
        this.nodeConverterRegistry = nodeConverterRegistry;
        this.reportService         = reportService;
        this.cancellationService   = cancellationService;
    }

    @GetMapping
    public ResponseEntity<List<JsonNode>> listWorkflows() {
        try {
            return ResponseEntity.ok(workflowService.list());
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/{workflowId}/save")
    public ResponseEntity<String> saveWorkflow(
            @PathVariable String workflowId,
            @RequestBody JsonNode payload) {
        try {
            workflowService.save(workflowId, payload);
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body("Failed to save workflow: " + e.getMessage());
        }

        try {
            String yaml = camelAdapter.convert(payload);
            Path yamlPath = workflowService.saveCamelYaml(workflowId, yaml);
            camelDeployService.deploy(workflowId, yamlPath);
            return ResponseEntity.ok("Workflow saved and deployed");
        } catch (Exception e) {
            log.warn("Workflow {} route error: {}", workflowId, e.getMessage());
            return ResponseEntity.unprocessableEntity()
                    .body("Workflow saved, but the route has errors:\n" + e.getMessage());
        }
    }

    // ── Run ───────────────────────────────────────────────────────────────────

    @PostMapping("/{workflowId}/run")
    public ResponseEntity<Map<String, Object>> runWorkflow(
            @PathVariable String workflowId,
            @RequestParam(value = "async", defaultValue = "false") boolean async,
            @RequestBody(required = false) Map<String, Object> requestBody) {
        @SuppressWarnings("unchecked")
        final Map<String, Object> requestVars = requestBody != null && requestBody.get("globalVariables") instanceof Map
            ? (Map<String, Object>) requestBody.get("globalVariables")
            : Collections.emptyMap();

        String runId = "run-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        String runDateTime = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);

        // Extract workflow node list for step logging
        String workflowName = "Unknown";
        List<Map<String, Object>> workflowNodes = new ArrayList<>();
        Map<String, Object> configVars = new LinkedHashMap<>();
        try {
            JsonNode wf = findWorkflow(workflowId);
            if (wf != null) {
                workflowName = wf.path("name").asText("Unnamed");

                // Load saved workflow config (default variables set via the UI config modal).
                // These are applied on every trigger so external POST callers don't have to
                // repeat them. Request-body vars override config defaults.
                JsonNode config = wf.path("config");
                if (config.isObject()) {
                    config.fields().forEachRemaining(e -> {
                        JsonNode v = e.getValue();
                        configVars.put(e.getKey(), v.isTextual() ? v.asText() : v.toString());
                    });
                }
                JsonNode nodes = wf.path("workflow").path("nodes");
                Set<String> skipTypes = new HashSet<>(Arrays.asList("section", "workflowcontainer", "errorscope"));
                if (nodes.isArray()) {
                    for (JsonNode node : nodes) {
                        String type = node.path("type").asText();
                        if (!skipTypes.contains(type)) {
                            Map<String, Object> step = new LinkedHashMap<>();
                            step.put("nodeId",   node.path("id").asText());
                            step.put("nodeType", type);
                            step.put("nodeName", node.path("data").path("name").asText(type));
                            step.put("section",  node.path("section").asText("processing"));
                            step.put("posX",     node.path("position").path("x").asDouble(0));
                            workflowNodes.add(step);
                        }
                    }
                }
            }
        } catch (IOException ignored) {}

        // Merge: saved config is the baseline; request vars override
        final Map<String, Object> finalVars = new LinkedHashMap<>(configVars);
        finalVars.putAll(requestVars);

        final String finalWorkflowName = workflowName;
        final List<Map<String, Object>> finalNodes = workflowNodes;

        if (!async) {
            // Synchronous — block until complete, return full result directly
            Map<String, Object> result = executeRun(workflowId, runId, runDateTime, finalWorkflowName, finalNodes, finalVars);
            runResults.put(runId, result);
            return ResponseEntity.ok(result);
        }

        // Asynchronous — return runId immediately, execute in background
        Map<String, Object> initial = new LinkedHashMap<>();
        initial.put("runId",  runId);
        initial.put("status", "running");
        runResults.put(runId, initial);

        Future<?> future = runExecutor.submit(() ->
            runResults.put(runId, executeRun(workflowId, runId, runDateTime, finalWorkflowName, finalNodes, finalVars)));
        activeRuns.put(runId, future);

        return ResponseEntity.ok(initial);
    }

    @GetMapping("/executions/{runId}")
    public ResponseEntity<Map<String, Object>> getRunStatus(@PathVariable String runId) {
        Map<String, Object> result = runResults.get(runId);
        if (result == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(result);
    }

    @PostMapping("/executions/{runId}/cancel")
    public ResponseEntity<Map<String, Object>> cancelRun(@PathVariable String runId) {
        Future<?> future = activeRuns.get(runId);
        if (future != null) {
            cancellationService.request(runId); // cooperative: stops at next step boundary
            future.cancel(true);                // also interrupt for any blocking IO
            log.info("Run {} cancel requested by user", runId);
            return ResponseEntity.ok(Map.of("cancelled", true));
        }
        return ResponseEntity.ok(Map.of("cancelled", false));
    }

    private Map<String, Object> executeRun(
            String workflowId, String runId, String runDateTime,
            String workflowName, List<Map<String, Object>> workflowNodes,
            Map<String, Object> globalVars) {

        executionCapture.startCapture(runId);
        MDC.put("runId", runId);
        String status;
        String error = null;
        long startMs = System.currentTimeMillis();
        Exchange resultExchange = null;
        try {
            log.info("─────────────────────────────────────────────────────");
            log.info("Workflow '{}' run started [runId={}]", workflowName, runId);
            resultExchange = producerTemplate.send("direct:" + workflowId, e -> {
                e.getMessage().setBody(null);
                e.setProperty("_runId", runId);
                globalVars.forEach(e::setProperty);
            });
            if (Thread.currentThread().isInterrupted()) throw new InterruptedException("cancelled");
            Exception ex = resultExchange.getException();
            if (ex != null) throw new RuntimeException(ex.getMessage(), ex);
            status = "success";
            log.info("Workflow '{}' run completed successfully in {}ms", workflowName, System.currentTimeMillis() - startMs);
        } catch (Exception e) {
            boolean interrupted = Thread.currentThread().isInterrupted()
                || e instanceof InterruptedException
                || e.getCause() instanceof InterruptedException;
            if (interrupted || "cancelled".equals(e.getMessage())) {
                status = "cancelled";
                error  = "Cancelled by user";
                log.info("Workflow '{}' run cancelled [runId={}]", workflowName, runId);
            } else {
                status = "failed";
                error  = e.getMessage();
                log.error("Workflow '{}' run failed: {}", workflowName, e.getMessage());
            }
        } finally {
            MDC.remove("runId");
            activeRuns.remove(runId);
            cancellationService.clear(runId);
        }
        long durationMs = System.currentTimeMillis() - startMs;
        List<Map<String, Object>> endpointCalls = executionCapture.stopCapture(runId);

        // Persist enriched log entry
        try {
            ObjectNode entry = objectMapper.createObjectNode();
            entry.put("runId",         runId);
            entry.put("workflowId",    workflowId);
            entry.put("workflowName",  workflowName);
            entry.put("runDateTime",   runDateTime);
            entry.put("status",        status);
            entry.put("durationMs",    durationMs);
            if (error != null) entry.put("error", error);
            if (resultExchange != null) {
                String lastNodeType = workflowNodes.stream()
                    .filter(n -> "processing".equals(n.get("section")))
                    .max(Comparator.comparingDouble(n -> ((Number) n.get("posX")).doubleValue()))
                    .map(n -> (String) n.get("nodeType"))
                    .orElse(null);
                if (lastNodeType != null && !CORE_NODE_TYPES.contains(lastNodeType)) {
                    entry.put("resultBody", lastNodeType);
                } else {
                    Object body = resultExchange.getMessage().getBody();
                    entry.put("resultBody", body != null ? body.toString() : "");
                }
            }
            ArrayNode stepsArr = entry.putArray("steps");
            for (Map<String, Object> node : workflowNodes) {
                ObjectNode s = objectMapper.createObjectNode();
                s.put("nodeId",   (String) node.get("nodeId"));
                s.put("nodeType", (String) node.get("nodeType"));
                s.put("nodeName", (String) node.get("nodeName"));
                s.put("section",  (String) node.get("section"));
                stepsArr.add(s);
            }
            ArrayNode callsArr = entry.putArray("endpointCalls");
            for (Map<String, Object> call : endpointCalls) {
                ObjectNode c = objectMapper.createObjectNode();
                c.put("uri",        (String) call.get("uri"));
                c.put("durationMs", ((Number) call.get("durationMs")).longValue());
                c.put("status",     (String) call.get("status"));
                if (call.containsKey("error")) c.put("error", (String) call.get("error"));
                callsArr.add(c);
            }
            workflowService.saveLog(workflowId, runId, status, entry);
        } catch (IOException e) {
            log.error("Failed to write run log for {}: {}", workflowId, e.getMessage());
        }

        // Capture exchange context (vars + headers) for frontend autocomplete suggestions
        Map<String, Object> contextVars    = new LinkedHashMap<>();
        Map<String, Object> contextHeaders = new LinkedHashMap<>();
        if ("success".equals(status) && resultExchange != null) {
            for (Map.Entry<String, Object> e : resultExchange.getProperties().entrySet()) {
                String k = e.getKey();
                if (k.startsWith("Camel") || k.startsWith("_")) continue;
                contextVars.put(k, e.getValue() != null ? e.getValue().toString() : "");
            }
            for (Map.Entry<String, Object> e : resultExchange.getMessage().getHeaders().entrySet()) {
                String k = e.getKey();
                if (k.startsWith("Camel")) continue;
                contextHeaders.put(k, e.getValue() != null ? e.getValue().toString() : "");
            }
        }
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("vars",    contextVars);
        context.put("headers", contextHeaders);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("runId",   runId);
        result.put("status",  status);
        if (error != null) result.put("error", error);
        result.put("context", context);
        return result;
    }

    // ── Report ───────────────────────────────────────────────────────────────

    @PostMapping("/report")
    public ResponseEntity<byte[]> generateReport(
            @RequestBody List<Map<String, String>> workflows) {
        try {
            byte[] xlsx = reportService.generateReport(workflows);
            return ResponseEntity.ok()
                    .header("Content-Disposition", "attachment; filename=\"test-report.xlsx\"")
                    .contentType(MediaType.parseMediaType(
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(xlsx);
        } catch (IOException e) {
            log.error("Report generation failed: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    // ── Logs ─────────────────────────────────────────────────────────────────

    @GetMapping("/all-logs")
    public ResponseEntity<List<JsonNode>> listAllLogs() {
        try {
            return ResponseEntity.ok(workflowService.listAllLogs());
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/{workflowId}/logs")
    public ResponseEntity<List<JsonNode>> listLogs(@PathVariable String workflowId) {
        try {
            return ResponseEntity.ok(workflowService.listLogs(workflowId));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/{workflowId}/logs/{runId}/lines")
    public ResponseEntity<List<String>> getRunLogLines(
            @PathVariable String workflowId,
            @PathVariable String runId) {
        Path logFile = runLoggingSetup.getRunLogPath(runId);
        if (!Files.exists(logFile)) return ResponseEntity.ok(Collections.emptyList());
        try {
            List<String> lines = Files.readAllLines(logFile, StandardCharsets.UTF_8);
            return ResponseEntity.ok(lines);
        } catch (IOException e) {
            return ResponseEntity.ok(Collections.emptyList());
        }
    }

    @PostMapping("/{workflowId}/logs/{runId}/{status}")
    public ResponseEntity<String> saveLog(
            @PathVariable String workflowId,
            @PathVariable String runId,
            @PathVariable String status,
            @RequestBody JsonNode payload) {
        try {
            workflowService.saveLog(workflowId, runId, status, payload);
            return ResponseEntity.ok("Log saved");
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body("Failed to save log: " + e.getMessage());
        }
    }

    // ── Camel YAML DSL ────────────────────────────────────────────────────────

    @GetMapping(value = "/{workflowId}/camel", produces = "text/yaml;charset=UTF-8")
    public ResponseEntity<String> getCamelYaml(@PathVariable String workflowId) {
        try {
            JsonNode workflow = findWorkflow(workflowId);
            if (workflow == null) return ResponseEntity.notFound().build();
            return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/yaml;charset=UTF-8"))
                .body(camelAdapter.convert(workflow));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body("Conversion failed: " + e.getMessage());
        }
    }

    @PostMapping("/{workflowId}/camel/save")
    public ResponseEntity<String> saveCamelYaml(@PathVariable String workflowId) {
        try {
            JsonNode workflow = findWorkflow(workflowId);
            if (workflow == null) return ResponseEntity.notFound().build();
            String yaml = camelAdapter.convert(workflow);
            Path saved  = workflowService.saveCamelYaml(workflowId, yaml);
            return ResponseEntity.ok(saved.toAbsolutePath().toString());
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body("Failed: " + e.getMessage());
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private JsonNode findWorkflow(String workflowId) throws IOException {
        return workflowService.list().stream()
            .filter(w -> workflowId.equals(w.path("id").asText()))
            .findFirst().orElse(null);
    }
}
