package com.batchmate.workflow.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.batchmate.workflow.camel.NodeConverterRegistry;
import com.batchmate.workflow.camel.api.TestResult;
import com.batchmate.workflow.service.ConnectionService;
import com.batchmate.workflow.service.DataSourceRegistry;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/connections")
public class ConnectionController {

    private final ConnectionService connectionService;
    private final DataSourceRegistry dataSourceRegistry;
    private final NodeConverterRegistry nodeConverterRegistry;

    public ConnectionController(ConnectionService connectionService,
                                DataSourceRegistry dataSourceRegistry,
                                NodeConverterRegistry nodeConverterRegistry) {
        this.connectionService     = connectionService;
        this.dataSourceRegistry    = dataSourceRegistry;
        this.nodeConverterRegistry = nodeConverterRegistry;
    }

    @GetMapping
    public ResponseEntity<List<JsonNode>> list() {
        try {
            return ResponseEntity.ok(connectionService.list());
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping
    public ResponseEntity<String> save(@RequestBody JsonNode conn) {
        try {
            connectionService.save(conn);
            dataSourceRegistry.refresh(conn);
            return ResponseEntity.ok("Connection saved");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body("Failed to save connection: " + e.getMessage());
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<String> update(@PathVariable String id, @RequestBody JsonNode conn) {
        try {
            connectionService.update(id, conn);
            dataSourceRegistry.refresh(conn);
            return ResponseEntity.ok("Connection updated");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body("Failed to update connection: " + e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<String> delete(@PathVariable String id) {
        try {
            connectionService.delete(id);
            dataSourceRegistry.remove(id);
            return ResponseEntity.ok("Connection deleted");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body("Failed to delete connection: " + e.getMessage());
        }
    }

    @PostMapping("/test")
    public ResponseEntity<TestResult> test(@RequestBody JsonNode body) {
        String type = body.path("type").asText();
        JsonNode config = body.has("config") ? body.path("config") : body;
        return ResponseEntity.ok(nodeConverterRegistry.testConnection(type, config));
    }
}
