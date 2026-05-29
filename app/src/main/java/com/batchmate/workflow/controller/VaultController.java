package com.batchmate.workflow.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.batchmate.workflow.service.VaultPackageService;
import com.batchmate.workflow.service.VaultService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/vault")
public class VaultController {

    private final VaultService vaultService;
    private final VaultPackageService vaultPackageService;

    public VaultController(VaultService vaultService, VaultPackageService vaultPackageService) {
        this.vaultService        = vaultService;
        this.vaultPackageService = vaultPackageService;
    }

    // ── Entries ───────────────────────────────────────────────────────────────

    @GetMapping
    public ResponseEntity<List<JsonNode>> list() {
        try {
            return ResponseEntity.ok(vaultService.list());
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping
    public ResponseEntity<String> save(@RequestBody JsonNode entry) {
        try {
            vaultService.save(entry);
            return ResponseEntity.ok("Vault entry saved");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body("Failed to save vault entry: " + e.getMessage());
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<String> update(@PathVariable String id, @RequestBody JsonNode entry) {
        try {
            vaultService.update(id, entry);
            return ResponseEntity.ok("Vault entry updated");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body("Failed to update vault entry: " + e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<String> delete(@PathVariable String id) {
        try {
            vaultService.delete(id);
            return ResponseEntity.ok("Vault entry deleted");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body("Failed to delete vault entry: " + e.getMessage());
        }
    }

    // ── Packages ──────────────────────────────────────────────────────────────

    @GetMapping("/packages")
    public ResponseEntity<List<ObjectNode>> listPackages() {
        try {
            return ResponseEntity.ok(vaultPackageService.getPackagesWithEntries());
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/packages")
    public ResponseEntity<ObjectNode> createPackage(@RequestBody Map<String, String> body) {
        try {
            String name     = body.getOrDefault("name", "New Package");
            String parentId = body.get("parentId");
            return ResponseEntity.ok(vaultPackageService.createPackage(name, parentId));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PutMapping("/packages/{id}")
    public ResponseEntity<String> renamePackage(@PathVariable String id, @RequestBody Map<String, String> body) {
        try {
            vaultPackageService.renamePackage(id, body.getOrDefault("name", ""));
            return ResponseEntity.ok("Package renamed");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    @DeleteMapping("/packages/{id}")
    public ResponseEntity<String> deletePackage(@PathVariable String id) {
        try {
            vaultPackageService.deletePackage(id);
            return ResponseEntity.ok("Package deleted");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    @PatchMapping("/packages/{id}/move")
    public ResponseEntity<String> movePackage(@PathVariable String id, @RequestBody Map<String, String> body) {
        try {
            vaultPackageService.movePackage(id, body.get("parentId"));
            return ResponseEntity.ok("Package moved");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }
}
