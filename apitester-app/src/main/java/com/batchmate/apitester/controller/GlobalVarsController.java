package com.batchmate.apitester.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.batchmate.apitester.service.GlobalVarsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;

// Scoped per workspace (see GlobalVarsService's own file comment) — mirrors apitester-mule's
// globals-api.xml paths exactly (/workspaces/{workspaceId}/globals), replacing the old flat
// /globals entirely.
@RestController
@RequestMapping("/workspaces/{workspaceId}/globals")
public class GlobalVarsController {

    private final GlobalVarsService globalVarsService;

    public GlobalVarsController(GlobalVarsService globalVarsService) {
        this.globalVarsService = globalVarsService;
    }

    @GetMapping
    public ResponseEntity<ObjectNode> getGlobals(@PathVariable String workspaceId) {
        try {
            return ResponseEntity.ok(globalVarsService.read(workspaceId));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PutMapping
    public ResponseEntity<String> setGlobals(@PathVariable String workspaceId, @RequestBody JsonNode variables) {
        try {
            globalVarsService.write(workspaceId, variables);
            return ResponseEntity.ok("Global variables saved");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }
}
