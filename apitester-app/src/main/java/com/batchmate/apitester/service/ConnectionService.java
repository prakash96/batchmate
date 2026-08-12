package com.batchmate.apitester.service;

import com.fasterxml.jackson.core.type.TypeReference;
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
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Flat-file CRUD for saved DB connections, copied from workflow-app's ConnectionService.
 * Own data file (apitester-metadata/connections.json) — independent of the workflow tool's.
 */
@Service
public class ConnectionService {

    private static final Logger log = LoggerFactory.getLogger(ConnectionService.class);

    @Value("${connections.file:${metadata.dir:apitester-metadata}/connections.json}")
    private String connectionsFile;

    private Path resolvedFile;

    private final ObjectMapper objectMapper;

    public ConnectionService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    public void init() {
        Path configured = Paths.get(connectionsFile);
        Path resolvedDir = PathResolver.resolveDir(
                configured.getParent() != null ? configured.getParent().toString() : ".",
                "apitester-metadata"
        );
        resolvedFile = resolvedDir.resolve(configured.getFileName().toString()).normalize();
        log.info("Connections file → {}", resolvedFile.toAbsolutePath());
    }

    public List<JsonNode> list() throws IOException {
        return readAll();
    }

    public void save(JsonNode conn) throws IOException {
        List<JsonNode> list = readAll();
        list.add(conn);
        writeAll(list);
    }

    public void update(String id, JsonNode updatedConn) throws IOException {
        List<JsonNode> list = readAll().stream()
                .map(c -> id.equals(c.path("id").asText()) ? updatedConn : c)
                .collect(Collectors.toList());
        writeAll(list);
    }

    public void delete(String id) throws IOException {
        List<JsonNode> list = readAll().stream()
                .filter(c -> !id.equals(c.path("id").asText()))
                .collect(Collectors.toList());
        writeAll(list);
    }

    private List<JsonNode> readAll() throws IOException {
        if (!Files.exists(resolvedFile)) return new ArrayList<>();
        return objectMapper.readValue(resolvedFile.toFile(), new TypeReference<List<JsonNode>>() {});
    }

    private void writeAll(List<JsonNode> connections) throws IOException {
        Files.createDirectories(resolvedFile.getParent());
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(resolvedFile.toFile(), connections);
    }
}
