package com.batchmate.apitester.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

/**
 * Flat-file storage for templates — mirrors apitester-mule's templates-api.xml exactly (paths +
 * JSON shapes), so apitester-ui's TemplateManagerModal works unchanged whichever backend it's
 * pointed at. A template is exactly {id, name, preRequest:[...], input:{body, headers:[...]},
 * postResponse:[...]} — preRequest/postResponse are the SAME step shapes a real request's own
 * preRequest/postResponse already use, and input is the same {body, headers} shape the Input tab
 * edits; never method/url. Global, not scoped to a workspace/collection, same convention as
 * MockService/WorkspaceService (one flat file, {@code _templates.json}).
 */
@Service
public class TemplateService {

    private static final String TEMPLATES_FILE = "_templates.json";

    private final ObjectMapper objectMapper;
    private final RequestService requestService;

    private Path resolvedBaseDir;

    public TemplateService(ObjectMapper objectMapper, RequestService requestService) {
        this.objectMapper = objectMapper;
        this.requestService = requestService;
    }

    @PostConstruct
    public void init() {
        resolvedBaseDir = requestService.baseDir();
    }

    private List<ObjectNode> readAll() throws IOException {
        Path file = resolvedBaseDir.resolve(TEMPLATES_FILE);
        if (!Files.exists(file)) return new ArrayList<>();
        JsonNode arr = objectMapper.readTree(file.toFile());
        List<ObjectNode> result = new ArrayList<>();
        if (arr.isArray()) arr.forEach(n -> { if (n.isObject()) result.add((ObjectNode) n); });
        return result;
    }

    private void writeAll(List<ObjectNode> templates) throws IOException {
        Files.createDirectories(resolvedBaseDir);
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(resolvedBaseDir.resolve(TEMPLATES_FILE).toFile(), templates);
    }

    public List<ObjectNode> list() throws IOException {
        List<ObjectNode> all = readAll();
        all.sort(Comparator.comparing(t -> t.path("name").asText("")));
        return all;
    }

    public String create(JsonNode body) throws IOException {
        List<ObjectNode> templates = readAll();
        String id = UUID.randomUUID().toString();
        templates.add(toStored(id, body));
        writeAll(templates);
        return id;
    }

    /** Upsert by id — same MERGE-style behavior as apitester-mule's save-template. */
    public void save(String id, JsonNode body) throws IOException {
        List<ObjectNode> templates = readAll();
        boolean found = false;
        for (int i = 0; i < templates.size(); i++) {
            if (id.equals(templates.get(i).path("id").asText(null))) {
                templates.set(i, toStored(id, body));
                found = true;
                break;
            }
        }
        if (!found) templates.add(toStored(id, body));
        writeAll(templates);
    }

    public void delete(String id) throws IOException {
        List<ObjectNode> templates = readAll();
        templates.removeIf(t -> id.equals(t.path("id").asText(null)));
        writeAll(templates);
    }

    private ObjectNode toStored(String id, JsonNode body) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("id", id);
        node.put("name", body.path("name").asText("New Template"));
        node.set("preRequest", body.path("preRequest").isArray() ? body.path("preRequest") : objectMapper.createArrayNode());
        node.set("input", body.path("input").isObject() ? body.path("input") : objectMapper.createObjectNode());
        node.set("postResponse", body.path("postResponse").isArray() ? body.path("postResponse") : objectMapper.createArrayNode());
        return node;
    }
}
