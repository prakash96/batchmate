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
import javax.crypto.SecretKey;
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

    private Path       resolvedFile;
    private SecretKey  vaultKey;

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

        Path keyFile = resolvedFile.getParent().resolve(".vault.key");
        try {
            vaultKey = VaultEncryption.loadOrGenerateKey(keyFile);
            if (!Files.exists(keyFile) || System.getenv("VAULT_MASTER_KEY") != null) {
                log.info("Vault encryption key loaded from environment variable");
            } else {
                log.info("Vault encryption key loaded from {}", keyFile.toAbsolutePath());
                log.warn("Back up {} — losing it makes all vault entries unrecoverable", keyFile.toAbsolutePath());
            }
        } catch (Exception e) {
            log.error("Failed to initialize vault encryption key: {}", e.getMessage());
            throw new RuntimeException("Cannot start: vault encryption key unavailable", e);
        }
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
        List<JsonNode> raw = objectMapper.readValue(resolvedFile.toFile(), new TypeReference<List<JsonNode>>() {});
        return raw.stream().map(this::decryptEntry).collect(Collectors.toList());
    }

    private void writeAll(List<JsonNode> entries) throws IOException {
        Files.createDirectories(resolvedFile.getParent());
        List<JsonNode> encrypted = entries.stream().map(this::encryptEntry).collect(Collectors.toList());
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(resolvedFile.toFile(), encrypted);
    }

    /** Encrypts the config object to a single "enc:..." string before persisting. */
    private JsonNode encryptEntry(JsonNode entry) {
        if (!(entry instanceof com.fasterxml.jackson.databind.node.ObjectNode)) return entry;
        com.fasterxml.jackson.databind.node.ObjectNode obj = (com.fasterxml.jackson.databind.node.ObjectNode) entry;
        JsonNode config = obj.path("config");
        if (config.isObject()) {
            try {
                String json      = objectMapper.writeValueAsString(config);
                String encrypted = VaultEncryption.encrypt(json, vaultKey);
                obj = obj.deepCopy();
                obj.put("config", encrypted);
            } catch (Exception e) {
                log.error("Failed to encrypt vault entry {}: {}", obj.path("id").asText(), e.getMessage());
            }
        }
        return obj;
    }

    /** Decrypts the "enc:..." config string back to an object node after loading. */
    private JsonNode decryptEntry(JsonNode entry) {
        if (!(entry instanceof com.fasterxml.jackson.databind.node.ObjectNode)) return entry;
        com.fasterxml.jackson.databind.node.ObjectNode obj = (com.fasterxml.jackson.databind.node.ObjectNode) entry;
        JsonNode config = obj.path("config");
        if (config.isTextual()) {
            String text = config.asText();
            if (VaultEncryption.isEncrypted(text)) {
                try {
                    String json      = VaultEncryption.decrypt(text, vaultKey);
                    JsonNode decoded = objectMapper.readTree(json);
                    obj = obj.deepCopy();
                    obj.set("config", decoded);
                } catch (Exception e) {
                    log.error("Failed to decrypt vault entry {}: {}", obj.path("id").asText(), e.getMessage());
                }
            }
            // If not "enc:" prefixed, it's a legacy plain-text entry — leave as-is
        }
        return obj;
    }
}
