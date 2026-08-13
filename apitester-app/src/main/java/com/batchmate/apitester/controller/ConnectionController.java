package com.batchmate.apitester.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.batchmate.apitester.camel.RequestConverterRegistry;
import com.batchmate.workflow.camel.api.TestResult;
import com.batchmate.apitester.service.ConnectionService;
import com.batchmate.apitester.service.DataSourceRegistry;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/connections")
public class ConnectionController {

    private final ConnectionService connectionService;
    private final DataSourceRegistry dataSourceRegistry;
    private final RequestConverterRegistry requestConverterRegistry;

    public ConnectionController(ConnectionService connectionService,
                                DataSourceRegistry dataSourceRegistry,
                                RequestConverterRegistry requestConverterRegistry) {
        this.connectionService        = connectionService;
        this.dataSourceRegistry       = dataSourceRegistry;
        this.requestConverterRegistry = requestConverterRegistry;
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
            // Generate the id here rather than relying on the client to supply one — the browser's
            // crypto.randomUUID() only exists in "secure contexts" (HTTPS, or localhost/127.0.0.1),
            // so a client opened via a LAN IP/hostname over plain HTTP would have no way to call it
            // at all. Mirrors how collections/requests already get server-generated ids.
            if (conn.isObject() && (!conn.has("id") || conn.path("id").asText("").isBlank())) {
                ((ObjectNode) conn).put("id", UUID.randomUUID().toString());
            }
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
        return ResponseEntity.ok(requestConverterRegistry.testConnection(type, config));
    }
}
