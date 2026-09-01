package com.batchmate.apitester.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.batchmate.apitester.service.CollectionService;
import com.batchmate.apitester.service.WorkspaceService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/** Mirrors apitester-mule's workspaces-api.xml exactly (paths + JSON shapes), so apitester-ui
 *  works unchanged whichever backend it's pointed at. See WorkspaceService's own file comment
 *  for the storage model. */
@RestController
@RequestMapping("/workspaces")
public class WorkspaceController {

    private final WorkspaceService workspaceService;
    private final CollectionService collectionService;
    private final ObjectMapper objectMapper;

    public WorkspaceController(WorkspaceService workspaceService, CollectionService collectionService, ObjectMapper objectMapper) {
        this.workspaceService = workspaceService;
        this.collectionService = collectionService;
        this.objectMapper = objectMapper;
    }

    @GetMapping
    public ResponseEntity<List<ObjectNode>> listWorkspaces() {
        try {
            return ResponseEntity.ok(workspaceService.list());
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping
    public ResponseEntity<ObjectNode> createWorkspace(@RequestBody Map<String, String> body) {
        try {
            return ResponseEntity.ok(workspaceService.create(body.get("name"), body.get("password")));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PutMapping("/{workspaceId}")
    public ResponseEntity<String> renameWorkspace(@PathVariable String workspaceId, @RequestBody Map<String, String> body) {
        try {
            workspaceService.rename(workspaceId, body.getOrDefault("name", ""));
            return ResponseEntity.ok("Workspace renamed");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    @DeleteMapping("/{workspaceId}")
    public ResponseEntity<String> deleteWorkspace(@PathVariable String workspaceId) {
        try {
            workspaceService.delete(workspaceId);
            return ResponseEntity.ok("Workspace deleted");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    /** The only way to get a locked workspace's collections back (for this session) — verifies
     *  the posted password against its stored hash, and if correct, returns the full nested
     *  collection/request tree for every collection in this workspace (same shape
     *  CollectionController's own listing produces, scoped to just this workspace). */
    @PostMapping("/{workspaceId}/unlock")
    public ResponseEntity<ObjectNode> unlockWorkspace(@PathVariable String workspaceId, @RequestBody(required = false) Map<String, String> body) {
        try {
            Boolean ok = workspaceService.verifyPassword(workspaceId, body != null ? body.get("password") : null);
            if (ok == null) {
                ObjectNode err = objectMapper.createObjectNode();
                err.put("error", "Workspace not found");
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(err);
            }
            if (!ok) {
                ObjectNode err = objectMapper.createObjectNode();
                err.put("error", "Incorrect password");
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(err);
            }
            List<ObjectNode> tree = collectionService.getCollectionsWithRequests();
            List<ObjectNode> scoped = collectionService.pruneByWorkspace(tree, workspaceId::equals);
            ObjectNode result = objectMapper.createObjectNode();
            result.put("workspaceId", workspaceId);
            com.fasterxml.jackson.databind.node.ArrayNode arr = objectMapper.createArrayNode();
            scoped.forEach(arr::add);
            result.set("collections", arr);
            return ResponseEntity.ok(result);
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }
}
