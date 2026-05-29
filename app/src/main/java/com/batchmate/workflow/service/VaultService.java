package com.batchmate.workflow.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.batchmate.workflow.util.PathResolver;
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

@Service
public class VaultService {

    private static final Logger log = LoggerFactory.getLogger(VaultService.class);

    @Value("${vault.file:${metadata.dir:../metadata}/vault.json}")
    private String vaultFile;

    private Path resolvedFile;

    private final ObjectMapper objectMapper;

    public VaultService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    public void init() {
        Path configured = Paths.get(vaultFile);
        Path resolvedDir = PathResolver.resolveDir(
                configured.getParent() != null ? configured.getParent().toString() : ".",
                "metadata"
        );
        resolvedFile = resolvedDir.resolve(configured.getFileName().toString()).normalize();
        log.info("Vault file → {}", resolvedFile.toAbsolutePath());
    }

    public List<JsonNode> list() throws IOException {
        return readAll();
    }

    public void save(JsonNode entry) throws IOException {
        List<JsonNode> list = readAll();
        list.add(entry);
        writeAll(list);
    }

    public void update(String id, JsonNode updated) throws IOException {
        List<JsonNode> list = readAll().stream()
                .map(e -> id.equals(e.path("id").asText()) ? updated : e)
                .collect(Collectors.toList());
        writeAll(list);
    }

    public void delete(String id) throws IOException {
        List<JsonNode> list = readAll().stream()
                .filter(e -> !id.equals(e.path("id").asText()))
                .collect(Collectors.toList());
        writeAll(list);
    }

    /** Removes the packageId from all entries belonging to the given package (called on package delete). */
    public void clearPackageId(String packageId) throws IOException {
        List<JsonNode> list = readAll().stream()
                .map(e -> {
                    if (!packageId.equals(e.path("packageId").asText(null))) return e;
                    ((com.fasterxml.jackson.databind.node.ObjectNode) e).remove("packageId");
                    return e;
                })
                .collect(Collectors.toList());
        writeAll(list);
    }

    private List<JsonNode> readAll() throws IOException {
        if (!Files.exists(resolvedFile)) return new ArrayList<>();
        return objectMapper.readValue(resolvedFile.toFile(), new TypeReference<List<JsonNode>>() {});
    }

    private void writeAll(List<JsonNode> entries) throws IOException {
        Files.createDirectories(resolvedFile.getParent());
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(resolvedFile.toFile(), entries);
    }
}
