package com.batchmate.workflow.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.batchmate.workflow.util.PathResolver;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

@Service
public class VaultPackageService {

    @Value("${vault.packages.file:${metadata.dir:../metadata}/_vault-packages.json}")
    private String packagesFile;

    private Path resolvedFile;

    private final ObjectMapper objectMapper;
    private final VaultService vaultService;

    public VaultPackageService(ObjectMapper objectMapper, VaultService vaultService) {
        this.objectMapper = objectMapper;
        this.vaultService = vaultService;
    }

    @PostConstruct
    public void init() {
        Path configured = Paths.get(packagesFile);
        Path resolvedDir = PathResolver.resolveDir(
                configured.getParent() != null ? configured.getParent().toString() : ".",
                "metadata"
        );
        resolvedFile = resolvedDir.resolve(configured.getFileName().toString()).normalize();
    }

    // ── Packages file ─────────────────────────────────────────────────────────

    public List<ObjectNode> readPackages() throws IOException {
        if (!Files.exists(resolvedFile)) return new ArrayList<>();
        JsonNode arr = objectMapper.readTree(resolvedFile.toFile());
        List<ObjectNode> result = new ArrayList<>();
        if (arr.isArray()) {
            arr.forEach(n -> { if (n.isObject()) result.add((ObjectNode) n); });
        }
        return result;
    }

    private void writePackages(List<ObjectNode> packages) throws IOException {
        Files.createDirectories(resolvedFile.getParent());
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(resolvedFile.toFile(), packages);
    }

    // ── CRUD ─────────────────────────────────────────────────────────────────

    public ObjectNode createPackage(String name, String parentId) throws IOException {
        List<ObjectNode> packages = readPackages();
        ObjectNode pkg = objectMapper.createObjectNode();
        pkg.put("id", UUID.randomUUID().toString());
        pkg.put("name", name);
        pkg.set("packages", objectMapper.createArrayNode());

        if (parentId == null || parentId.isBlank()) {
            packages.add(pkg);
        } else {
            if (!addToParent(packages, parentId, pkg)) packages.add(pkg);
        }
        writePackages(packages);
        return pkg;
    }

    public void renamePackage(String packageId, String name) throws IOException {
        List<ObjectNode> packages = readPackages();
        renameInTree(packages, packageId, name);
        writePackages(packages);
    }

    public void deletePackage(String packageId) throws IOException {
        List<ObjectNode> packages = readPackages();
        List<String> allIds = new ArrayList<>();
        collectIds(findNode(packages, packageId), allIds);
        removeFromTree(packages, packageId);
        writePackages(packages);
        for (String id : allIds) {
            vaultService.clearPackageId(id);
        }
    }

    public void movePackage(String pkgId, String newParentId) throws IOException {
        List<ObjectNode> packages = readPackages();
        ObjectNode found = findNode(packages, pkgId);
        if (found == null) return;
        ObjectNode copy = found.deepCopy();
        removeFromTree(packages, pkgId);
        if (newParentId == null || newParentId.isBlank()) {
            packages.add(copy);
        } else {
            if (!addToParent(packages, newParentId, copy)) packages.add(copy);
        }
        writePackages(packages);
    }

    // ── Aggregated view ───────────────────────────────────────────────────────

    public List<ObjectNode> getPackagesWithEntries() throws IOException {
        List<ObjectNode> packages = readPackages();
        if (packages.isEmpty()) {
            createPackage("Default", null);
            packages = readPackages();
        }
        Map<String, List<JsonNode>> byPackage = buildEntryIndex();
        List<ObjectNode> result = attachEntries(packages, byPackage);

        List<JsonNode> unassigned = byPackage.getOrDefault("", Collections.emptyList());
        if (!unassigned.isEmpty()) {
            ObjectNode uncategorized = objectMapper.createObjectNode();
            uncategorized.putNull("id");
            uncategorized.put("name", "Uncategorized");
            uncategorized.set("packages", objectMapper.createArrayNode());
            ArrayNode entArr = objectMapper.createArrayNode();
            unassigned.forEach(entArr::add);
            uncategorized.set("entries", entArr);
            result.add(uncategorized);
        }

        return result;
    }

    // ── Tree helpers ──────────────────────────────────────────────────────────

    private boolean addToParent(List<ObjectNode> nodes, String parentId, ObjectNode newPkg) {
        for (ObjectNode p : nodes) {
            if (parentId.equals(p.path("id").asText(null))) {
                p.withArray("packages").add(newPkg);
                return true;
            }
            List<ObjectNode> children = toList(p.path("packages"));
            if (addToParent(children, parentId, newPkg)) {
                ArrayNode arr = objectMapper.createArrayNode();
                children.forEach(arr::add);
                p.set("packages", arr);
                return true;
            }
        }
        return false;
    }

    private boolean renameInTree(List<ObjectNode> nodes, String pkgId, String name) {
        for (ObjectNode p : nodes) {
            if (pkgId.equals(p.path("id").asText(null))) { p.put("name", name); return true; }
            List<ObjectNode> children = toList(p.path("packages"));
            if (renameInTree(children, pkgId, name)) {
                ArrayNode arr = objectMapper.createArrayNode();
                children.forEach(arr::add);
                p.set("packages", arr);
                return true;
            }
        }
        return false;
    }

    private boolean removeFromTree(List<ObjectNode> nodes, String pkgId) {
        Iterator<ObjectNode> it = nodes.iterator();
        while (it.hasNext()) {
            ObjectNode p = it.next();
            if (pkgId.equals(p.path("id").asText(null))) { it.remove(); return true; }
            List<ObjectNode> children = toList(p.path("packages"));
            if (removeFromTree(children, pkgId)) {
                ArrayNode arr = objectMapper.createArrayNode();
                children.forEach(arr::add);
                p.set("packages", arr);
                return true;
            }
        }
        return false;
    }

    private ObjectNode findNode(List<ObjectNode> nodes, String pkgId) {
        for (ObjectNode p : nodes) {
            if (pkgId.equals(p.path("id").asText(null))) return p;
            ObjectNode found = findNode(toList(p.path("packages")), pkgId);
            if (found != null) return found;
        }
        return null;
    }

    private void collectIds(ObjectNode node, List<String> ids) {
        if (node == null) return;
        String id = node.path("id").asText(null);
        if (id != null) ids.add(id);
        toList(node.path("packages")).forEach(child -> collectIds(child, ids));
    }

    private List<ObjectNode> attachEntries(List<ObjectNode> packages, Map<String, List<JsonNode>> byPackage) {
        List<ObjectNode> result = new ArrayList<>();
        for (ObjectNode pkg : packages) {
            ObjectNode out = pkg.deepCopy();
            String pkgId = pkg.path("id").asText(null);
            ArrayNode entArr = objectMapper.createArrayNode();
            byPackage.getOrDefault(pkgId != null ? pkgId : "", Collections.emptyList()).forEach(entArr::add);
            out.set("entries", entArr);
            ArrayNode subArr = objectMapper.createArrayNode();
            attachEntries(toList(pkg.path("packages")), byPackage).forEach(subArr::add);
            out.set("packages", subArr);
            result.add(out);
        }
        return result;
    }

    private Map<String, List<JsonNode>> buildEntryIndex() {
        List<JsonNode> allEntries;
        try { allEntries = vaultService.list(); } catch (IOException e) { allEntries = Collections.emptyList(); }
        Map<String, List<JsonNode>> byPackage = new LinkedHashMap<>();
        for (JsonNode e : allEntries) {
            String pkgId = e.path("packageId").asText(null);
            String key = (pkgId == null || pkgId.isBlank()) ? "" : pkgId;
            byPackage.computeIfAbsent(key, k -> new ArrayList<>()).add(e);
        }
        return byPackage;
    }

    private List<ObjectNode> toList(JsonNode arr) {
        List<ObjectNode> result = new ArrayList<>();
        if (arr != null && arr.isArray()) {
            arr.forEach(n -> { if (n.isObject()) result.add((ObjectNode) n); });
        }
        return result;
    }
}
