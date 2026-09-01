package com.batchmate.apitester.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.batchmate.apitester.service.TemplateService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;

/** Mirrors apitester-mule's templates-api.xml exactly (paths + JSON shapes) — see
 *  TemplateService's own file comment for the storage model. */
@RestController
@RequestMapping("/templates")
public class TemplateController {

    private final TemplateService templateService;
    private final ObjectMapper objectMapper;

    public TemplateController(TemplateService templateService, ObjectMapper objectMapper) {
        this.templateService = templateService;
        this.objectMapper = objectMapper;
    }

    @GetMapping
    public ResponseEntity<List<ObjectNode>> list() {
        try {
            return ResponseEntity.ok(templateService.list());
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping
    public ResponseEntity<ObjectNode> create(@RequestBody JsonNode body) {
        try {
            String id = templateService.create(body);
            ObjectNode result = objectMapper.createObjectNode();
            result.put("id", id);
            return ResponseEntity.ok(result);
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/{id}/save")
    public ResponseEntity<String> save(@PathVariable String id, @RequestBody JsonNode body) {
        try {
            templateService.save(id, body);
            return ResponseEntity.ok("Template saved");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<String> delete(@PathVariable String id) {
        try {
            templateService.delete(id);
            return ResponseEntity.ok("Template deleted");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }
}
