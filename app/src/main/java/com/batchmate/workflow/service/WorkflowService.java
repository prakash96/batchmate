package com.batchmate.workflow.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.batchmate.workflow.util.PathResolver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
public class WorkflowService {

    private static final Logger log = LoggerFactory.getLogger(WorkflowService.class);

    private static final String WORKFLOW_FILE = "workflow.json";
    private static final String LOGS_DIR      = "logs";
    private static final DateTimeFormatter LOG_TS = DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss");

    @Value("${workflows.base-dir:../workflows}")
    private String baseDir;

    private Path resolvedBaseDir;

    private final ObjectMapper objectMapper;

    public WorkflowService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    public void init() {
        resolvedBaseDir = PathResolver.resolveDir(baseDir, "workflows");
        log.info("Workflows dir → {}", resolvedBaseDir.toAbsolutePath());
    }

    // ── Workflow ─────────────────────────────────────────────────────────────

    public void save(String workflowId, JsonNode payload) throws IOException {
        Path dir = workflowDir(workflowId);
        Files.createDirectories(dir);
        objectMapper.writerWithDefaultPrettyPrinter()
                .writeValue(dir.resolve(WORKFLOW_FILE).toFile(), payload);
    }

    public List<JsonNode> list() throws IOException {
        if (!Files.exists(resolvedBaseDir)) {
            return Collections.emptyList();
        }
        try (Stream<Path> entries = Files.list(resolvedBaseDir)) {
            return entries
                    .filter(Files::isDirectory)
                    .sorted()
                    .map(d -> {
                        try {
                            Path wf = d.resolve(WORKFLOW_FILE);
                            return Files.exists(wf) ? objectMapper.readTree(wf.toFile()) : null;
                        } catch (IOException e) {
                            return (JsonNode) null;
                        }
                    })
                    .filter(Objects::nonNull)
                    .collect(Collectors.toList());
        }
    }

    // ── Logs ─────────────────────────────────────────────────────────────────

    public void saveLog(String workflowId, String runId, String status, JsonNode payload) throws IOException {
        Path logsDir = workflowDir(workflowId).resolve(LOGS_DIR);
        Files.createDirectories(logsDir);
        String timestamp = LocalDateTime.now().format(LOG_TS);
        String filename  = runId + "_" + timestamp + "_" + status + ".json";
        objectMapper.writerWithDefaultPrettyPrinter()
                .writeValue(logsDir.resolve(filename).toFile(), payload);
    }

    public List<JsonNode> listAllLogs() throws IOException {
        if (!Files.exists(resolvedBaseDir)) return Collections.emptyList();
        List<JsonNode> all = new java.util.ArrayList<>();
        try (Stream<Path> wfDirs = Files.list(resolvedBaseDir)) {
            wfDirs.filter(Files::isDirectory).forEach(dir -> {
                Path logsDir = dir.resolve(LOGS_DIR);
                if (!Files.exists(logsDir)) return;
                try (Stream<Path> files = Files.list(logsDir)) {
                    files.filter(p -> p.getFileName().toString().endsWith(".json"))
                         .forEach(p -> {
                             try { all.add(objectMapper.readTree(p.toFile())); }
                             catch (IOException ignored) {}
                         });
                } catch (IOException ignored) {}
            });
        }
        return all;
    }

    public List<JsonNode> listLogs(String workflowId) throws IOException {
        Path logsDir = workflowDir(workflowId).resolve(LOGS_DIR);
        if (!Files.exists(logsDir)) {
            return Collections.emptyList();
        }
        try (Stream<Path> files = Files.list(logsDir)) {
            return files
                    .filter(p -> p.getFileName().toString().endsWith(".json"))
                    .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                    .map(p -> {
                        try {
                            return objectMapper.readTree(p.toFile());
                        } catch (IOException e) {
                            return (JsonNode) null;
                        }
                    })
                    .filter(Objects::nonNull)
                    .collect(Collectors.toList());
        }
    }

    // ── Camel YAML ────────────────────────────────────────────────────────────

    public Path saveCamelYaml(String workflowId, String yaml) throws IOException {
        Path dir = workflowDir(workflowId);
        Files.createDirectories(dir);
        Path yamlFile = dir.resolve("camel-route.yaml");
        Files.writeString(yamlFile, yaml, StandardCharsets.UTF_8);
        return yamlFile;
    }

    // ── Package assignment ────────────────────────────────────────────────────

    public void setPackageId(String workflowId, String packageId) throws IOException {
        Path wf = workflowDir(workflowId).resolve(WORKFLOW_FILE);
        if (!Files.exists(wf)) return;
        JsonNode node = objectMapper.readTree(wf.toFile());
        if (node instanceof com.fasterxml.jackson.databind.node.ObjectNode) {
            com.fasterxml.jackson.databind.node.ObjectNode obj =
                    (com.fasterxml.jackson.databind.node.ObjectNode) node;
            if (packageId == null || packageId.isBlank()) obj.remove("packageId");
            else obj.put("packageId", packageId);
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(wf.toFile(), obj);
        }
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    /** Deletes the workflow directory and all its contents. */
    public void deleteWorkflow(String workflowId) throws IOException {
        Path dir = workflowDir(workflowId);
        if (!Files.exists(dir)) return;
        try (Stream<Path> walk = Files.walk(dir)) {
            walk.sorted(Comparator.reverseOrder())
                .forEach(p -> { try { Files.delete(p); } catch (IOException ignored) {} });
        }
    }

    /** Removes the packageId field from all workflows that belong to the given package. */
    public void clearPackageId(String packageId) throws IOException {
        List<JsonNode> workflows = list();
        for (JsonNode wf : workflows) {
            if (!packageId.equals(wf.path("packageId").asText(null))) continue;
            String workflowId = wf.path("id").asText(null);
            if (workflowId == null) continue;
            if (wf instanceof com.fasterxml.jackson.databind.node.ObjectNode) {
                ((com.fasterxml.jackson.databind.node.ObjectNode) wf).remove("packageId");
                save(workflowId, wf);
            }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Path workflowDir(String workflowId) {
        return resolvedBaseDir.resolve(workflowId);
    }
}
