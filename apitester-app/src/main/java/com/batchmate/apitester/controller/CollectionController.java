package com.batchmate.apitester.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.batchmate.apitester.service.CollectionService;
import com.batchmate.apitester.service.RequestService;
import com.batchmate.apitester.service.WorkspaceService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/collections")
public class CollectionController {

    private final CollectionService collectionService;
    private final RequestService    requestService;
    private final WorkspaceService  workspaceService;
    private final ObjectMapper      objectMapper;

    public CollectionController(CollectionService collectionService,
                                 RequestService requestService,
                                 WorkspaceService workspaceService,
                                 ObjectMapper objectMapper) {
        this.collectionService = collectionService;
        this.requestService    = requestService;
        this.workspaceService  = workspaceService;
        this.objectMapper      = objectMapper;
    }

    // ── Collections / folders ────────────────────────────────────────────────

    @GetMapping
    public ResponseEntity<List<ObjectNode>> listCollections() {
        try {
            // A collection whose WORKSPACE is password-protected is withheld from this tree
            // entirely (not merely hidden in the UI) — the only way to get it back is
            // WorkspaceController's unlock, for this session. See CollectionService#pruneByWorkspace.
            Set<String> lockedWorkspaceIds = workspaceService.list().stream()
                    .filter(w -> w.path("locked").asBoolean(false))
                    .map(w -> w.path("id").asText(null))
                    .collect(Collectors.toSet());
            List<ObjectNode> tree = collectionService.getCollectionsWithRequests();
            return ResponseEntity.ok(collectionService.pruneByWorkspace(tree, wsId -> !lockedWorkspaceIds.contains(wsId)));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping
    public ResponseEntity<ObjectNode> createCollection(@RequestBody Map<String, String> body) {
        try {
            String name        = body.getOrDefault("name", "New Collection");
            String parentId    = body.get("parentId");
            String workspaceId = body.get("workspaceId");
            return ResponseEntity.ok(collectionService.createCollection(name, parentId, workspaceId));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PutMapping("/{collectionId}")
    public ResponseEntity<String> renameCollection(
            @PathVariable String collectionId,
            @RequestBody Map<String, String> body) {
        try {
            collectionService.renameCollection(collectionId, body.getOrDefault("name", ""));
            return ResponseEntity.ok("Collection renamed");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    @PutMapping("/{collectionId}/variables")
    public ResponseEntity<String> setVariables(
            @PathVariable String collectionId,
            @RequestBody JsonNode variables) {
        try {
            collectionService.setVariables(collectionId, variables);
            return ResponseEntity.ok("Variables saved");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    @DeleteMapping("/{collectionId}")
    public ResponseEntity<String> deleteCollection(@PathVariable String collectionId) {
        try {
            collectionService.deleteCollection(collectionId);
            return ResponseEntity.ok("Collection deleted");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    @PatchMapping("/{collectionId}/move")
    public ResponseEntity<String> moveCollection(
            @PathVariable String collectionId,
            @RequestBody Map<String, String> body) {
        try {
            collectionService.moveCollection(collectionId, body.get("parentId"));
            return ResponseEntity.ok("Collection moved");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    // ── Requests inside a collection ──────────────────────────────────────────

    @PostMapping("/{collectionId}/requests")
    public ResponseEntity<JsonNode> createRequest(
            @PathVariable String collectionId,
            @RequestBody Map<String, String> body) {
        try {
            String name = body.getOrDefault("name", "New Request");
            String requestId = UUID.randomUUID().toString();

            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("id", requestId);
            payload.put("collectionId", collectionId);
            payload.put("name", name);
            payload.put("description", "");
            payload.set("preRequest", objectMapper.createArrayNode());
            ObjectNode request = objectMapper.createObjectNode();
            request.put("method", "GET");
            request.put("url", "");
            request.set("params", objectMapper.createArrayNode());
            request.set("headers", objectMapper.createArrayNode());
            request.put("bodyMode", "raw-json");
            // Default Input template: bare "${body}" passes the Pre-Request chain's output through
            // verbatim — see RequestExecutionService's Input tab evaluation.
            request.put("body", "${body}");
            payload.set("request", request);
            payload.set("postResponse", objectMapper.createArrayNode());

            requestService.save(requestId, payload);
            return ResponseEntity.ok(payload);
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PatchMapping("/{collectionId}/requests/{requestId}/move")
    public ResponseEntity<String> moveRequest(
            @PathVariable String collectionId,
            @PathVariable String requestId,
            @RequestBody Map<String, String> body) {
        try {
            requestService.setCollectionId(requestId, body.get("collectionId"));
            return ResponseEntity.ok("Request moved");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    @DeleteMapping("/{collectionId}/requests/{requestId}")
    public ResponseEntity<String> deleteRequest(
            @PathVariable String collectionId,
            @PathVariable String requestId) {
        try {
            requestService.deleteRequest(requestId);
            return ResponseEntity.ok("Request deleted");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }
}
