package com.batchmate.apitester.controller;

import com.batchmate.apitester.service.CollectionRunService;
import com.batchmate.apitester.service.ExcelReportService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Map;

/** "Run All" for a collection — runs every main request (see CollectionRunService's javadoc) and
 *  serves the resulting consolidated report, including as a downloadable .xlsx. */
@RestController
@RequestMapping("/collections/{collectionId}/run-all")
public class CollectionRunController {

    private final CollectionRunService runService;
    private final ExcelReportService excelReportService;

    public CollectionRunController(CollectionRunService runService, ExcelReportService excelReportService) {
        this.runService = runService;
        this.excelReportService = excelReportService;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> runAll(@PathVariable String collectionId) {
        try {
            return ResponseEntity.ok(runService.runAll(collectionId));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/last")
    public ResponseEntity<Map<String, Object>> lastReport(@PathVariable String collectionId) {
        try {
            Map<String, Object> report = runService.getLastReport(collectionId);
            return report != null ? ResponseEntity.ok(report) : ResponseEntity.notFound().build();
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/last/excel")
    public ResponseEntity<byte[]> lastReportExcel(@PathVariable String collectionId) {
        try {
            Map<String, Object> report = runService.getLastReport(collectionId);
            if (report == null) return ResponseEntity.notFound().build();
            byte[] xlsx = excelReportService.generate(report);
            String name = String.valueOf(report.getOrDefault("collectionName", "collection"))
                    .replaceAll("[^a-zA-Z0-9_-]+", "_");
            return ResponseEntity.ok()
                    .header("Content-Disposition", "attachment; filename=\"run-all-" + name + ".xlsx\"")
                    .contentType(MediaType.parseMediaType(
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(xlsx);
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }
}
