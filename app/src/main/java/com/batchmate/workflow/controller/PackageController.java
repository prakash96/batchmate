package com.batchmate.workflow.controller;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.batchmate.workflow.service.PackageService;
import com.batchmate.workflow.service.WorkflowService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/packages")
public class PackageController {

    private final PackageService  packageService;
    private final WorkflowService workflowService;
    private final ObjectMapper    objectMapper;

    public PackageController(PackageService packageService,
                             WorkflowService workflowService,
                             ObjectMapper objectMapper) {
        this.packageService  = packageService;
        this.workflowService = workflowService;
        this.objectMapper    = objectMapper;
    }

    // ── Packages ──────────────────────────────────────────────────────────────

    @GetMapping
    public ResponseEntity<List<ObjectNode>> listPackages() {
        try {
            return ResponseEntity.ok(packageService.getPackagesWithWorkflows());
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping
    public ResponseEntity<ObjectNode> createPackage(@RequestBody Map<String, String> body) {
        try {
            String name     = body.getOrDefault("name", "New Package");
            String parentId = body.get("parentId");
            return ResponseEntity.ok(packageService.createPackage(name, parentId));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PutMapping("/{packageId}")
    public ResponseEntity<String> renamePackage(
            @PathVariable String packageId,
            @RequestBody Map<String, String> body) {
        try {
            packageService.renamePackage(packageId, body.getOrDefault("name", ""));
            return ResponseEntity.ok("Package renamed");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    @DeleteMapping("/{packageId}")
    public ResponseEntity<String> deletePackage(@PathVariable String packageId) {
        try {
            packageService.deletePackage(packageId);
            return ResponseEntity.ok("Package deleted");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    // ── Workflows inside a package ────────────────────────────────────────────

    @PostMapping("/{packageId}/workflows")
    public ResponseEntity<JsonNode> createWorkflow(
            @PathVariable String packageId,
            @RequestBody Map<String, String> body) {
        try {
            String name = body.getOrDefault("name", "New Workflow");
            String workflowId = UUID.randomUUID().toString();

            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("id",          workflowId);
            payload.put("packageId",   packageId);
            payload.put("name",        name);
            payload.put("description", "");
            payload.set("inputBody",    objectMapper.createObjectNode());
            payload.set("inputHeaders", objectMapper.createObjectNode());
            ObjectNode workflow = objectMapper.createObjectNode();
            workflow.set("nodes", objectMapper.createArrayNode());
            workflow.set("edges", objectMapper.createArrayNode());
            payload.set("workflow", workflow);

            workflowService.save(workflowId, payload);
            return ResponseEntity.ok(payload);
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PatchMapping("/{packageId}/move")
    public ResponseEntity<String> movePackage(
            @PathVariable String packageId,
            @RequestBody Map<String, String> body) {
        try {
            packageService.movePackage(packageId, body.get("parentId"));
            return ResponseEntity.ok("Package moved");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    @PatchMapping("/{packageId}/workflows/{workflowId}/move")
    public ResponseEntity<String> moveWorkflow(
            @PathVariable String packageId,
            @PathVariable String workflowId,
            @RequestBody Map<String, String> body) {
        try {
            workflowService.setPackageId(workflowId, body.get("packageId"));
            return ResponseEntity.ok("Workflow moved");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    @DeleteMapping("/{packageId}/workflows/{workflowId}")
    public ResponseEntity<String> deleteWorkflow(
            @PathVariable String packageId,
            @PathVariable String workflowId) {
        try {
            workflowService.deleteWorkflow(workflowId);
            return ResponseEntity.ok("Workflow deleted");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }
}
