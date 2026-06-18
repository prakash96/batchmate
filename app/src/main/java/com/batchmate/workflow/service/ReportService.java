package com.batchmate.workflow.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xddf.usermodel.chart.*;
import org.apache.poi.xssf.usermodel.*;
import org.openxmlformats.schemas.drawingml.x2006.chart.CTBarChart;
import org.openxmlformats.schemas.drawingml.x2006.chart.CTBarSer;
import org.openxmlformats.schemas.drawingml.x2006.chart.CTDPt;
import org.openxmlformats.schemas.drawingml.x2006.main.CTShapeProperties;
import org.openxmlformats.schemas.drawingml.x2006.main.CTSolidColorFillProperties;
import org.openxmlformats.schemas.drawingml.x2006.main.CTSRgbColor;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.*;

@Service
public class ReportService {

    private final WorkflowService workflowService;

    public ReportService(WorkflowService workflowService) {
        this.workflowService = workflowService;
    }

    public byte[] generateReport(List<Map<String, String>> workflows) throws IOException {
        workflows = workflows.stream()
                .filter(wf -> !wf.getOrDefault("name", "").toLowerCase(java.util.Locale.ROOT).startsWith("common"))
                .collect(java.util.stream.Collectors.toList());
        List<JsonNode> allLogs = workflowService.listAllLogs();

        Map<String, JsonNode> latestLogMap = new HashMap<>();
        for (JsonNode log : allLogs) {
            String id = log.path("workflowId").asText(null);
            if (id == null) continue;
            JsonNode existing = latestLogMap.get(id);
            if (existing == null ||
                    log.path("runDateTime").asText().compareTo(existing.path("runDateTime").asText()) > 0) {
                latestLogMap.put(id, log);
            }
        }

        int total = workflows.size();
        int passed = 0, failed = 0, notRun = 0;
        long totalDuration = 0;
        for (Map<String, String> wf : workflows) {
            JsonNode log = latestLogMap.get(wf.get("id"));
            if (log == null) { notRun++; continue; }
            if ("success".equals(log.path("status").asText())) passed++;
            else failed++;
            totalDuration += log.path("durationMs").asLong(0);
        }

        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            Styles s = new Styles(wb);
            buildSummarySheet(wb, s, total, passed, failed, notRun, totalDuration);
            buildDetailSheet(wb, s, workflows, latestLogMap);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            wb.write(out);
            return out.toByteArray();
        }
    }

    // ── Summary sheet ─────────────────────────────────────────────────────────

    private void buildSummarySheet(XSSFWorkbook wb, Styles s,
                                   int total, int passed, int failed, int notRun,
                                   long totalDuration) {
        XSSFSheet sheet = wb.createSheet("Summary");
        sheet.setColumnWidth(0, 6000);
        sheet.setColumnWidth(1, 4000);
        sheet.setColumnWidth(2, 7000);

        int r = 0;

        // Title
        XSSFRow titleRow = sheet.createRow(r++);
        titleRow.setHeightInPoints(36);
        XSSFCell titleCell = titleRow.createCell(0);
        titleCell.setCellValue("Test Execution Summary");
        titleCell.setCellStyle(s.title);
        sheet.addMergedRegion(new CellRangeAddress(0, 0, 0, 2));

        sheet.createRow(r++); // blank

        // Metrics table
        XSSFRow metricHdr = sheet.createRow(r++);
        metricHdr.setHeightInPoints(18);
        cell(metricHdr, 0, "Metric",  s.sectionHeader);
        cell(metricHdr, 1, "Value",   s.sectionHeader);
        cell(metricHdr, 2, "Notes",   s.sectionHeader);

        numRow(sheet, s, r++, "Total Tests",          total,         s.value);
        numRow(sheet, s, r++, "Passed",               passed,        s.passCell);
        numRow(sheet, s, r++, "Failed",               failed,        s.failCell);
        numRow(sheet, s, r++, "Not Run",              notRun,        s.notRunCell);
        strRow(sheet, s, r++, "Pass Rate",
                String.format("%.1f%%", total > 0 ? (passed * 100.0 / total) : 0.0), s.value);
        numRow(sheet, s, r++, "Total Duration (ms)",  totalDuration, s.value);

        sheet.createRow(r++); // blank

        // Status count table
        XSSFRow statusHdr = sheet.createRow(r++);
        statusHdr.setHeightInPoints(18);
        cell(statusHdr, 0, "Status", s.sectionHeader);
        cell(statusHdr, 1, "Count",  s.sectionHeader);
        cell(statusHdr, 2, "",       s.sectionHeader);

        numRow(sheet, s, r++, "Pass",    passed,  s.passCell);
        numRow(sheet, s, r++, "Fail",    failed,  s.failCell);
        numRow(sheet, s, r++, "Not Run", notRun,  s.notRunCell);

        sheet.createRow(r++); // blank before chart

        addBarChart(sheet, r, r + 16, 0, 5, passed, failed, notRun);
    }

    // ── Bar chart ─────────────────────────────────────────────────────────────

    private void addBarChart(XSSFSheet sheet,
                             int rowStart, int rowEnd, int colStart, int colEnd,
                             int passed, int failed, int notRun) {
        XSSFDrawing drawing = sheet.createDrawingPatriarch();
        XSSFClientAnchor anchor = drawing.createAnchor(0, 0, 0, 0, colStart, rowStart, colEnd, rowEnd);
        XSSFChart chart = drawing.createChart(anchor);
        chart.setTitleText("Test Results");
        chart.setTitleOverlay(false);

        XDDFChartLegend legend = chart.getOrAddLegend();
        legend.setPosition(LegendPosition.BOTTOM);

        XDDFCategoryAxis catAxis = chart.createCategoryAxis(AxisPosition.BOTTOM);
        XDDFValueAxis valAxis   = chart.createValueAxis(AxisPosition.LEFT);
        valAxis.setCrosses(AxisCrosses.AUTO_ZERO);

        XDDFCategoryDataSource      cats = XDDFDataSourcesFactory.fromArray(new String[]{"Pass", "Fail", "Not Run"});
        XDDFNumericalDataSource<Integer> vals = XDDFDataSourcesFactory.fromArray(new Integer[]{passed, failed, notRun});

        XDDFBarChartData barData = (XDDFBarChartData) chart.createData(ChartTypes.BAR, catAxis, valAxis);
        barData.setBarDirection(BarDirection.COL);
        barData.setBarGrouping(BarGrouping.CLUSTERED);

        XDDFBarChartData.Series series = (XDDFBarChartData.Series) barData.addSeries(cats, vals);
        series.setTitle("Count", null);
        chart.plot(barData);

        colorBars(chart, new String[]{"92D050", "FF0000", "FFC000"});
    }

    /** Colors individual bars by injecting dPt elements into the chart XML. */
    private void colorBars(XSSFChart chart, String[] hexColors) {
        try {
            CTBarChart barChart = chart.getCTChart().getPlotArea().getBarChartArray(0);
            CTBarSer   ser      = barChart.getSerArray(0);
            for (int i = 0; i < hexColors.length; i++) {
                CTDPt dpt = ser.addNewDPt();
                dpt.addNewIdx().setVal(i);
                CTShapeProperties       spPr = dpt.addNewSpPr();
                CTSolidColorFillProperties fill = spPr.addNewSolidFill();
                CTSRgbColor              rgb  = fill.addNewSrgbClr();
                rgb.setVal(hexToBytes(hexColors[i]));
            }
        } catch (Exception ignored) {
            // chart still renders with default colors if schema classes are unavailable
        }
    }

    // ── Detail sheet ──────────────────────────────────────────────────────────

    private void buildDetailSheet(XSSFWorkbook wb, Styles s,
                                  List<Map<String, String>> workflows,
                                  Map<String, JsonNode> latestLogMap) {
        XSSFSheet sheet = wb.createSheet("Detailed Results");
        int[] widths = {1400, 7000, 3500, 3500, 8000, 8000, 8000, 8000};
        for (int i = 0; i < widths.length; i++) sheet.setColumnWidth(i, widths[i]);
        sheet.createFreezePane(0, 1);

        // Header row
        XSSFRow hdr = sheet.createRow(0);
        hdr.setHeightInPoints(18);
        String[] headers = {"#", "Test Case", "Status", "Duration (ms)", "Errors", "Logs", "Input Body", "Result Body"};
        for (int i = 0; i < headers.length; i++) cell(hdr, i, headers[i], s.tableHeader);

        // Data rows
        for (int i = 0; i < workflows.size(); i++) {
            Map<String, String> wf  = workflows.get(i);
            JsonNode            log = latestLogMap.get(wf.get("id"));

            String status     = log == null ? "Not Run"
                                : "success".equals(log.path("status").asText()) ? "Pass" : "Fail";
            long   duration   = log == null ? 0 : log.path("durationMs").asLong(0);
            String errors     = log == null ? "" : log.path("error").asText("");
            String stepsText  = buildStepsText(log);
            String inputBody  = wf.getOrDefault("inputBody", "");
            String resultBody = log == null ? "" : log.path("resultBody").asText("");

            CellStyle statusStyle = "Pass".equals(status) ? s.passCell
                                  : "Fail".equals(status) ? s.failCell
                                  : s.notRunCell;

            XSSFRow row = sheet.createRow(i + 1);
            cell(row, 0, i + 1,                                  s.normal);
            cell(row, 1, wf.getOrDefault("name", wf.get("id")), s.normal);
            cell(row, 2, status,                                  statusStyle);
            cell(row, 3, duration,                                s.normal);
            cell(row, 4, errors,                                  s.wrap);
            cell(row, 5, stepsText,                               s.wrap);
            cell(row, 6, inputBody,                               s.wrap);
            cell(row, 7, resultBody,                              s.wrap);
        }
    }

    private String buildStepsText(JsonNode log) {
        if (log == null || !log.has("steps")) return "";
        StringBuilder sb = new StringBuilder();
        for (JsonNode step : log.get("steps")) {
            if (sb.length() > 0) sb.append("\n");
            sb.append(step.path("nodeName").asText())
              .append(" (").append(step.path("nodeType").asText()).append(")");
        }
        return sb.toString();
    }

    // ── Row / cell helpers ────────────────────────────────────────────────────

    private void numRow(XSSFSheet sheet, Styles s, int r, String label, long value, CellStyle valueStyle) {
        XSSFRow row = sheet.createRow(r);
        row.setHeightInPoints(16);
        cell(row, 0, label, s.label);
        cell(row, 1, value, valueStyle);
        cell(row, 2, "",    s.normal);
    }

    private void strRow(XSSFSheet sheet, Styles s, int r, String label, String value, CellStyle valueStyle) {
        XSSFRow row = sheet.createRow(r);
        row.setHeightInPoints(16);
        cell(row, 0, label, s.label);
        cell(row, 1, value, valueStyle);
        cell(row, 2, "",    s.normal);
    }

    private void cell(Row row, int col, Object value, CellStyle style) {
        Cell c = row.createCell(col);
        if (value instanceof Number) c.setCellValue(((Number) value).doubleValue());
        else c.setCellValue(value != null ? value.toString() : "");
        if (style != null) c.setCellStyle(style);
    }

    static byte[] hexToBytes(String hex) {
        return new byte[]{
            (byte) Integer.parseInt(hex.substring(0, 2), 16),
            (byte) Integer.parseInt(hex.substring(2, 4), 16),
            (byte) Integer.parseInt(hex.substring(4, 6), 16)
        };
    }

    // ── Cell styles ───────────────────────────────────────────────────────────

    private static final class Styles {
        final CellStyle title, sectionHeader, tableHeader, label, value,
                        normal, wrap, passCell, failCell, notRunCell;

        Styles(XSSFWorkbook wb) {
            title         = make(wb, "1F4E79", "FFFFFF", true,  22, HorizontalAlignment.LEFT,   false);
            sectionHeader = make(wb, "DDEBF7", "1F4E79", true,  11, HorizontalAlignment.CENTER, false);
            tableHeader   = make(wb, "4F81BD", "FFFFFF", true,  11, HorizontalAlignment.CENTER, false);
            label         = make(wb, "F2F2F2", "000000", true,  11, HorizontalAlignment.LEFT,   false);
            value         = make(wb, null,     "000000", true,  11, HorizontalAlignment.CENTER, false);
            normal        = make(wb, null,     "000000", false, 11, HorizontalAlignment.LEFT,   false);
            wrap          = makeWrap(wb);
            passCell      = make(wb, "92D050", "000000", true,  11, HorizontalAlignment.CENTER, false);
            failCell      = make(wb, "FF0000", "FFFFFF", true,  11, HorizontalAlignment.CENTER, false);
            notRunCell    = make(wb, "FFC000", "000000", true,  11, HorizontalAlignment.CENTER, false);
        }

        private static XSSFCellStyle make(XSSFWorkbook wb, String bg, String fg,
                                          boolean bold, int size,
                                          HorizontalAlignment align, boolean wrap) {
            XSSFCellStyle style = wb.createCellStyle();
            if (bg != null) {
                style.setFillForegroundColor(new XSSFColor(ReportService.hexToBytes(bg), null));
                style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            }
            XSSFFont font = wb.createFont();
            if (fg != null) font.setColor(new XSSFColor(ReportService.hexToBytes(fg), null));
            font.setBold(bold);
            font.setFontName("Calibri");
            font.setFontHeightInPoints((short) size);
            style.setFont(font);
            style.setAlignment(align);
            style.setVerticalAlignment(VerticalAlignment.CENTER);
            if (wrap) style.setWrapText(true);
            return style;
        }

        private static XSSFCellStyle makeWrap(XSSFWorkbook wb) {
            XSSFCellStyle style = wb.createCellStyle();
            style.setWrapText(true);
            style.setVerticalAlignment(VerticalAlignment.TOP);
            return style;
        }
    }
}
