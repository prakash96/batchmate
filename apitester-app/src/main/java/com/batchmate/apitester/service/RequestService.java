package com.batchmate.apitester.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.batchmate.apitester.util.PathResolver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Flat-file storage for requests + run logs, one directory per request — same
 * convention as workflow-app's WorkflowService (requests/<id>/request.json).
 */
@Service
public class RequestService {

    private static final Logger log = LoggerFactory.getLogger(RequestService.class);

    private static final String REQUEST_FILE = "request.json";
    private static final DateTimeFormatter LOG_TS = DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss");

    @Value("${requests.base-dir:apitester-data}")
    private String baseDir;

    @Value("${requests.logs-dir:apitester-logs}")
    private String logsDirConfig;

    private Path resolvedBaseDir;
    private Path resolvedLogsDir;

    private final ObjectMapper objectMapper;

    public RequestService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    public void init() {
        resolvedBaseDir = PathResolver.resolveDir(baseDir, "apitester-data");
        resolvedLogsDir = PathResolver.resolveDir(logsDirConfig, "apitester-logs");
        log.info("Requests dir → {}", resolvedBaseDir.toAbsolutePath());
        log.info("Logs dir     → {}", resolvedLogsDir.toAbsolutePath());
    }

    public Path baseDir() { return resolvedBaseDir; }

    // ── Request ──────────────────────────────────────────────────────────────

    public void save(String requestId, JsonNode payload) throws IOException {
        Path dir = requestDir(requestId);
        Files.createDirectories(dir);
        objectMapper.writerWithDefaultPrettyPrinter()
                .writeValue(dir.resolve(REQUEST_FILE).toFile(), payload);
    }

    public List<JsonNode> list() throws IOException {
        if (!Files.exists(resolvedBaseDir)) return Collections.emptyList();
        try (Stream<Path> entries = Files.list(resolvedBaseDir)) {
            return entries
                    .filter(Files::isDirectory)
                    .sorted()
                    .map(d -> {
                        try {
                            Path rf = d.resolve(REQUEST_FILE);
                            return Files.exists(rf) ? objectMapper.readTree(rf.toFile()) : null;
                        } catch (IOException e) {
                            return (JsonNode) null;
                        }
                    })
                    .filter(Objects::nonNull)
                    .collect(Collectors.toList());
        }
    }

    public JsonNode findById(String requestId) throws IOException {
        Path rf = requestDir(requestId).resolve(REQUEST_FILE);
        return Files.exists(rf) ? objectMapper.readTree(rf.toFile()) : null;
    }

    public void deleteRequest(String requestId) throws IOException {
        Path dir = requestDir(requestId);
        if (!Files.exists(dir)) return;
        try (Stream<Path> walk = Files.walk(dir)) {
            walk.sorted(Comparator.reverseOrder())
                .forEach(p -> { try { Files.delete(p); } catch (IOException ignored) {} });
        }
    }

    public void setCollectionId(String requestId, String collectionId) throws IOException {
        JsonNode node = findById(requestId);
        if (node == null || !(node instanceof com.fasterxml.jackson.databind.node.ObjectNode)) return;
        com.fasterxml.jackson.databind.node.ObjectNode obj = (com.fasterxml.jackson.databind.node.ObjectNode) node;
        if (collectionId == null || collectionId.isBlank()) obj.remove("collectionId");
        else obj.put("collectionId", collectionId);
        save(requestId, obj);
    }

    /** Removes the collectionId field from all requests belonging to the given collection. */
    public void clearCollectionId(String collectionId) throws IOException {
        for (JsonNode req : list()) {
            if (!collectionId.equals(req.path("collectionId").asText(null))) continue;
            String requestId = req.path("id").asText(null);
            if (requestId == null) continue;
            if (req instanceof com.fasterxml.jackson.databind.node.ObjectNode) {
                ((com.fasterxml.jackson.databind.node.ObjectNode) req).remove("collectionId");
                save(requestId, req);
            }
        }
    }

    // ── Camel YAML (written per-run for debugging; overwritten on every run) ──

    public Path saveCamelYaml(String requestId, String yaml) throws IOException {
        Path dir = requestDir(requestId);
        Files.createDirectories(dir);
        Path yamlFile = dir.resolve("camel-route.yaml");
        Files.writeString(yamlFile, yaml, java.nio.charset.StandardCharsets.UTF_8);
        return yamlFile;
    }

    // ── Run logs ──────────────────────────────────────────────────────────────

    public void saveLog(String requestId, String runId, String status, JsonNode payload) throws IOException {
        Path logsDir = resolvedLogsDir.resolve(requestId);
        Files.createDirectories(logsDir);
        String timestamp = LocalDateTime.now().format(LOG_TS);
        String filename  = runId + "_" + timestamp + "_" + status + ".json";
        objectMapper.writerWithDefaultPrettyPrinter()
                .writeValue(logsDir.resolve(filename).toFile(), payload);
    }

    public List<JsonNode> listLogs(String requestId) throws IOException {
        Path logsDir = resolvedLogsDir.resolve(requestId);
        if (!Files.exists(logsDir)) return Collections.emptyList();
        try (Stream<Path> files = Files.list(logsDir)) {
            return files
                    .filter(p -> p.getFileName().toString().endsWith(".json"))
                    .sorted(Comparator.<Path, String>comparing(p -> p.getFileName().toString()).reversed())
                    .map(p -> {
                        try { return objectMapper.readTree(p.toFile()); }
                        catch (IOException e) { return (JsonNode) null; }
                    })
                    .filter(Objects::nonNull)
                    .collect(Collectors.toList());
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Path requestDir(String requestId) {
        return resolvedBaseDir.resolve(requestId);
    }
}
