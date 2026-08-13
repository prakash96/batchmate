package com.batchmate.apitester.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.batchmate.apitester.service.GlobalVarsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;

@RestController
@RequestMapping("/globals")
public class GlobalVarsController {

    private final GlobalVarsService globalVarsService;

    public GlobalVarsController(GlobalVarsService globalVarsService) {
        this.globalVarsService = globalVarsService;
    }

    @GetMapping
    public ResponseEntity<ObjectNode> getGlobals() {
        try {
            return ResponseEntity.ok(globalVarsService.read());
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PutMapping
    public ResponseEntity<String> setGlobals(@RequestBody JsonNode variables) {
        try {
            globalVarsService.write(variables);
            return ResponseEntity.ok("Global variables saved");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }
}
