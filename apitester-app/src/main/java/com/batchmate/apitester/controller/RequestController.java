package com.batchmate.apitester.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.batchmate.apitester.service.RequestExecutionService;
import com.batchmate.apitester.service.RequestService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/requests")
public class RequestController {

    private final RequestService requestService;
    private final RequestExecutionService executionService;

    public RequestController(RequestService requestService, RequestExecutionService executionService) {
        this.requestService  = requestService;
        this.executionService = executionService;
    }

    @GetMapping
    public ResponseEntity<List<JsonNode>> listRequests() {
        try {
            return ResponseEntity.ok(requestService.list());
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/{requestId}")
    public ResponseEntity<JsonNode> getRequest(@PathVariable String requestId) {
        try {
            JsonNode req = requestService.findById(requestId);
            return req != null ? ResponseEntity.ok(req) : ResponseEntity.notFound().build();
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/{requestId}/save")
    public ResponseEntity<String> saveRequest(
            @PathVariable String requestId,
            @RequestBody JsonNode payload) {
        try {
            requestService.save(requestId, payload);
            return ResponseEntity.ok("Request saved");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body("Failed to save request: " + e.getMessage());
        }
    }

    @PostMapping("/{requestId}/run")
    public ResponseEntity<Map<String, Object>> runRequest(
            @PathVariable String requestId,
            @RequestBody(required = false) Map<String, Object> requestBody) {
        @SuppressWarnings("unchecked")
        Map<String, Object> overrideVars = requestBody != null && requestBody.get("variables") instanceof Map
            ? (Map<String, Object>) requestBody.get("variables")
            : Collections.emptyMap();
        try {
            Map<String, Object> result = executionService.run(requestId, overrideVars);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("status", "failed", "error", e.getMessage()));
        }
    }

    @GetMapping("/{requestId}/runs")
    public ResponseEntity<List<JsonNode>> listRuns(@PathVariable String requestId) {
        try {
            return ResponseEntity.ok(requestService.listLogs(requestId));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }
}
