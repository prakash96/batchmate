package com.batchmate.apitester.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.batchmate.apitester.service.MockService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/** Mirrors apitester-mule's mock-api.xml exactly (paths + JSON shapes + matching rules) — see
 *  MockService's own file comment for the storage/matching model. */
@RestController
public class MockController {

    private final MockService mockService;
    private final ObjectMapper objectMapper;

    public MockController(MockService mockService, ObjectMapper objectMapper) {
        this.mockService = mockService;
        this.objectMapper = objectMapper;
    }

    // ── CRUD ─────────────────────────────────────────────────────────────────

    @GetMapping("/mock-endpoints")
    public ResponseEntity<List<ObjectNode>> list() {
        try {
            return ResponseEntity.ok(mockService.list());
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/mock-endpoints")
    public ResponseEntity<ObjectNode> create(@RequestBody JsonNode body) {
        try {
            String id = mockService.create(body);
            ObjectNode result = objectMapper.createObjectNode();
            result.put("id", id);
            return ResponseEntity.ok(result);
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/mock-endpoints/{id}/save")
    public ResponseEntity<String> save(@PathVariable String id, @RequestBody JsonNode body) {
        try {
            mockService.save(id, body);
            return ResponseEntity.ok("Mock endpoint saved");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    @DeleteMapping("/mock-endpoints/{id}")
    public ResponseEntity<String> delete(@PathVariable String id) {
        try {
            mockService.delete(id);
            return ResponseEntity.ok("Mock endpoint deleted");
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    // ── The mock server itself ────────────────────────────────────────────────

    /** Catches every method under /mock/** (no explicit "method=" restriction on the mapping, so
     *  GET/POST/PUT/PATCH/DELETE/... all land here alike) — same catch-all shape as
     *  mock-api.xml's serve-mock. On no match: a 404 with a small JSON body naming what was
     *  looked up, so "why didn't my mock fire" is answerable from the response alone. */
    @RequestMapping("/mock/**")
    public ResponseEntity<byte[]> serveMock(HttpServletRequest request) {
        String fullPath = request.getRequestURI();
        String path = fullPath.startsWith("/mock") ? fullPath.substring(5) : fullPath;
        String method = request.getMethod();
        try {
            MockService.MatchResult match = mockService.findMatch(method, path);
            if (match == null) {
                ObjectNode err = objectMapper.createObjectNode();
                err.put("error", "No mock endpoint configured for this method/path");
                err.put("method", method);
                err.put("path", path);
                byte[] bytes = objectMapper.writeValueAsBytes(err);
                return ResponseEntity.status(404).contentType(MediaType.APPLICATION_JSON).body(bytes);
            }
            HttpHeaders headers = new HttpHeaders();
            for (Map.Entry<String, String> e : match.responseHeaders.entrySet()) {
                if (e.getKey().equalsIgnoreCase("Content-Type")) continue; // contentType field always wins — see below
                headers.add(e.getKey(), e.getValue());
            }
            headers.set("Content-Type", match.contentType);
            return ResponseEntity.status(match.statusCode).headers(headers)
                    .body(match.responseBody.getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }
}
