package com.batchmate.apitester.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.batchmate.apitester.util.PathResolver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

@RestController
@RequestMapping("/config")
public class ConfigController {

    private static final Logger log = LoggerFactory.getLogger(ConfigController.class);

    @Value("${metadata.dir:apitester-metadata}")
    private String metadataDir;

    private Path resolvedMetadataDir;

    private final ObjectMapper objectMapper;

    public ConfigController(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    public void init() {
        resolvedMetadataDir = PathResolver.resolveDir(metadataDir, "apitester-metadata");
        log.info("Metadata dir → {}", resolvedMetadataDir.toAbsolutePath());
    }

    @GetMapping("/connection-types")
    public ResponseEntity<JsonNode> getConnectionTypes() {
        return readJson("connection-types.json", objectMapper.createObjectNode());
    }

    private ResponseEntity<JsonNode> readJson(String filename, JsonNode fallback) {
        try {
            Path file = resolvedMetadataDir.resolve(filename);
            if (!Files.exists(file)) {
                log.warn("Metadata file not found: {}", file.toAbsolutePath());
                return ResponseEntity.ok(fallback);
            }
            return ResponseEntity.ok(objectMapper.readTree(file.toFile()));
        } catch (IOException e) {
            log.error("Failed to read {}: {}", filename, e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }
}
