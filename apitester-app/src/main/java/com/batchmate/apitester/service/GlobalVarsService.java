package com.batchmate.apitester.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Flat-file storage for global variables — the lowest-precedence tier available to every request
 * (collection variables, then an explicit per-run override, both still win over these — see
 * RequestExecutionService's merge order in its run() javadoc). These used to live only in the
 * browser's localStorage (per-browser/per-machine, never shared), which is why they'd vanish or
 * differ across machines/teammates; this persists them server-side instead, one flat name→value
 * object, mirroring how collection variables are already stored in _collections.json.
 */
@Service
public class GlobalVarsService {

    private static final String GLOBALS_FILE = "_globals.json";

    private final ObjectMapper objectMapper;
    private final RequestService requestService;

    private Path resolvedBaseDir;

    public GlobalVarsService(ObjectMapper objectMapper, RequestService requestService) {
        this.objectMapper = objectMapper;
        this.requestService = requestService;
    }

    @PostConstruct
    public void init() {
        resolvedBaseDir = requestService.baseDir();
    }

    /** Reads the raw stored object (for the GET /globals endpoint — the UI edits name/value pairs
     *  directly, same shape as a collection's "variables" node). Missing file → empty object. */
    public ObjectNode read() throws IOException {
        Path file = resolvedBaseDir.resolve(GLOBALS_FILE);
        if (!Files.exists(file)) return objectMapper.createObjectNode();
        JsonNode node = objectMapper.readTree(file.toFile());
        return node.isObject() ? (ObjectNode) node : objectMapper.createObjectNode();
    }

    public void write(JsonNode variables) throws IOException {
        Files.createDirectories(resolvedBaseDir);
        ObjectNode toWrite = (variables != null && variables.isObject())
            ? (ObjectNode) variables
            : objectMapper.createObjectNode();
        objectMapper.writerWithDefaultPrettyPrinter()
                .writeValue(resolvedBaseDir.resolve(GLOBALS_FILE).toFile(), toWrite);
    }

    /** Read as a plain Map<String,Object> — used by RequestExecutionService to seed the
     *  globalVars "floor" for every run, independent of whatever the client sends. */
    public Map<String, Object> readAsMap() throws IOException {
        ObjectNode node = read();
        Map<String, Object> map = new LinkedHashMap<>();
        node.fields().forEachRemaining(e -> map.put(e.getKey(), e.getValue().asText("")));
        return map;
    }
}
