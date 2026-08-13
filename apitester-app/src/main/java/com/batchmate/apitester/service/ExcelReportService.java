package com.batchmate.apitester.service;

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
import java.util.List;
import java.util.Map;

/**
 * Renders a CollectionRunService "Run All" report as an .xlsx workbook — Summary sheet (metrics +
 * bar/pie charts) + Detailed Results sheet (one row per main request). Chart-building code mirrors
 * app/ReportService.java's proven working pattern verbatim (POI's XDDF chart API is fiddly about
 * exact method signatures, so this deliberately doesn't improvise on that part).
 */
@Service
public class ExcelReportService {

    public byte[] generate(Map<String, Object> report) throws IOException {
        String collectionName = String.valueOf(report.getOrDefault("collectionName", ""));
        String runAt = String.valueOf(report.getOrDefault("runAt", ""));
        int total = asInt(report.get("totalRequests"));
        int passed = asInt(report.get("passedRequests"));
        int failed = asInt(report.get("failedRequests"));
        long duration = asLong(report.get("durationMs"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> results = (List<Map<String, Object>>) report.getOrDefault("results", List.of());

        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            Styles s = new Styles(wb);
            buildSummarySheet(wb, s, collectionName, runAt, total, passed, failed, duration);
            buildDetailSheet(wb, s, results);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            wb.write(out);
            return out.toByteArray();
        }
    }

    // ── Summary sheet ─────────────────────────────────────────────────────────

    private void buildSummarySheet(XSSFWorkbook wb, Styles s, String collectionName, String runAt,
                                    int total, int passed, int failed, long duration) {
        XSSFSheet sheet = wb.createSheet("Summary");
        sheet.setColumnWidth(0, 6000);
        sheet.setColumnWidth(1, 4000);
        sheet.setColumnWidth(2, 7000);

        int r = 0;

        XSSFRow titleRow = sheet.createRow(r++);
        titleRow.setHeightInPoints(36);
        XSSFCell titleCell = titleRow.createCell(0);
        titleCell.setCellValue("Run All — " + collectionName);
        titleCell.setCellStyle(s.title);
        sheet.addMergedRegion(new CellRangeAddress(0, 0, 0, 2));

        sheet.createRow(r++); // blank

        XSSFRow metricHdr = sheet.createRow(r++);
        metricHdr.setHeightInPoints(18);
        cell(metricHdr, 0, "Metric", s.sectionHeader);
        cell(metricHdr, 1, "Value", s.sectionHeader);
        cell(metricHdr, 2, "Notes", s.sectionHeader);

        strRow(sheet, s, r++, "Run At", runAt, s.value);
        numRow(sheet, s, r++, "Total Requests", total, s.value);
        numRow(sheet, s, r++, "Passed", passed, s.passCell);
        numRow(sheet, s, r++, "Failed", failed, s.failCell);
        strRow(sheet, s, r++, "Pass Rate", String.format("%.1f%%", total > 0 ? (passed * 100.0 / total) : 0.0), s.value);
        numRow(sheet, s, r++, "Total Duration (ms)", duration, s.value);

        sheet.createRow(r++); // blank

        XSSFRow statusHdr = sheet.createRow(r++);
        statusHdr.setHeightInPoints(18);
        cell(statusHdr, 0, "Status", s.sectionHeader);
        cell(statusHdr, 1, "Count", s.sectionHeader);
        cell(statusHdr, 2, "", s.sectionHeader);

        numRow(sheet, s, r++, "Pass", passed, s.passCell);
        numRow(sheet, s, r++, "Fail", failed, s.failCell);

        sheet.createRow(r++); // blank before charts

        addBarChart(sheet, r, r + 16, 0, 5, passed, failed);
        addPieChart(sheet, r, r + 16, 6, 11, passed, failed);
    }

    // ── Charts ────────────────────────────────────────────────────────────────

    private void addBarChart(XSSFSheet sheet, int rowStart, int rowEnd, int colStart, int colEnd,
                              int passed, int failed) {
        XSSFDrawing drawing = sheet.createDrawingPatriarch();
        XSSFClientAnchor anchor = drawing.createAnchor(0, 0, 0, 0, colStart, rowStart, colEnd, rowEnd);
        XSSFChart chart = drawing.createChart(anchor);
        chart.setTitleText("Pass / Fail Counts");
        chart.setTitleOverlay(false);

        XDDFChartLegend legend = chart.getOrAddLegend();
        legend.setPosition(LegendPosition.BOTTOM);

        XDDFCategoryAxis catAxis = chart.createCategoryAxis(AxisPosition.BOTTOM);
        XDDFValueAxis valAxis = chart.createValueAxis(AxisPosition.LEFT);
        valAxis.setCrosses(AxisCrosses.AUTO_ZERO);

        XDDFCategoryDataSource cats = XDDFDataSourcesFactory.fromArray(new String[]{"Pass", "Fail"});
        XDDFNumericalDataSource<Integer> vals = XDDFDataSourcesFactory.fromArray(new Integer[]{passed, failed});

        XDDFBarChartData barData = (XDDFBarChartData) chart.createData(ChartTypes.BAR, catAxis, valAxis);
        barData.setBarDirection(BarDirection.COL);
        barData.setBarGrouping(BarGrouping.CLUSTERED);

        XDDFBarChartData.Series series = (XDDFBarChartData.Series) barData.addSeries(cats, vals);
        series.setTitle("Count", null);
        chart.plot(barData);

        colorBars(chart, new String[]{"92D050", "FF0000"});
    }

    private void addPieChart(XSSFSheet sheet, int rowStart, int rowEnd, int colStart, int colEnd,
                              int passed, int failed) {
        XSSFDrawing drawing = sheet.createDrawingPatriarch();
        XSSFClientAnchor anchor = drawing.createAnchor(0, 0, 0, 0, colStart, rowStart, colEnd, rowEnd);
        XSSFChart chart = drawing.createChart(anchor);
        chart.setTitleText("Pass / Fail Ratio");
        chart.setTitleOverlay(false);

        XDDFChartLegend legend = chart.getOrAddLegend();
        legend.setPosition(LegendPosition.RIGHT);

        XDDFCategoryDataSource cats = XDDFDataSourcesFactory.fromArray(new String[]{"Pass", "Fail"});
        XDDFNumericalDataSource<Integer> vals = XDDFDataSourcesFactory.fromArray(new Integer[]{passed, failed});

        XDDFPieChartData pieData = (XDDFPieChartData) chart.createData(ChartTypes.PIE, null, null);
        pieData.addSeries(cats, vals);
        chart.plot(pieData);
    }

    /** Colors individual bars by injecting dPt elements into the chart XML — same technique as
     *  app/ReportService.java's addBarChart/colorBars. */
    private void colorBars(XSSFChart chart, String[] hexColors) {
        try {
            CTBarChart barChart = chart.getCTChart().getPlotArea().getBarChartArray(0);
            CTBarSer ser = barChart.getSerArray(0);
            for (int i = 0; i < hexColors.length; i++) {
                CTDPt dpt = ser.addNewDPt();
                dpt.addNewIdx().setVal(i);
                CTShapeProperties spPr = dpt.addNewSpPr();
                CTSolidColorFillProperties fill = spPr.addNewSolidFill();
                CTSRgbColor rgb = fill.addNewSrgbClr();
                rgb.setVal(hexToBytes(hexColors[i]));
            }
        } catch (Exception ignored) {
            // chart still renders with default colors if schema classes are unavailable
        }
    }

    // ── Detail sheet ──────────────────────────────────────────────────────────

    private void buildDetailSheet(XSSFWorkbook wb, Styles s, List<Map<String, Object>> results) {
        XSSFSheet sheet = wb.createSheet("Detailed Results");
        int[] widths = {1400, 7000, 3500, 3500, 3500, 3500, 3500, 8000};
        for (int i = 0; i < widths.length; i++) sheet.setColumnWidth(i, widths[i]);
        sheet.createFreezePane(0, 1);

        XSSFRow hdr = sheet.createRow(0);
        hdr.setHeightInPoints(18);
        String[] headers = {"#", "Request", "Status", "Duration (ms)", "Checks Passed", "Checks Failed", "Checks Total", "Error"};
        for (int i = 0; i < headers.length; i++) cell(hdr, i, headers[i], s.tableHeader);

        for (int i = 0; i < results.size(); i++) {
            Map<String, Object> r = results.get(i);
            String status = "success".equals(String.valueOf(r.get("status"))) ? "Pass" : "Fail";
            CellStyle statusStyle = "Pass".equals(status) ? s.passCell : s.failCell;

            XSSFRow row = sheet.createRow(i + 1);
            cell(row, 0, i + 1, s.normal);
            cell(row, 1, String.valueOf(r.getOrDefault("requestName", "")), s.normal);
            cell(row, 2, status, statusStyle);
            cell(row, 3, asLong(r.get("durationMs")), s.normal);
            cell(row, 4, asLong(r.get("checksPassed")), s.normal);
            cell(row, 5, asLong(r.get("checksFailed")), s.normal);
            cell(row, 6, asLong(r.get("checksTotal")), s.normal);
            cell(row, 7, r.get("error") != null ? String.valueOf(r.get("error")) : "", s.wrap);
        }
    }

    // ── Value / row / cell helpers ────────────────────────────────────────────

    private static int asInt(Object v) { return v instanceof Number ? ((Number) v).intValue() : 0; }
    private static long asLong(Object v) { return v instanceof Number ? ((Number) v).longValue() : 0L; }

    private void numRow(XSSFSheet sheet, Styles s, int r, String label, long value, CellStyle valueStyle) {
        XSSFRow row = sheet.createRow(r);
        row.setHeightInPoints(16);
        cell(row, 0, label, s.label);
        cell(row, 1, value, valueStyle);
        cell(row, 2, "", s.normal);
    }

    private void strRow(XSSFSheet sheet, Styles s, int r, String label, String value, CellStyle valueStyle) {
        XSSFRow row = sheet.createRow(r);
        row.setHeightInPoints(16);
        cell(row, 0, label, s.label);
        cell(row, 1, value, valueStyle);
        cell(row, 2, "", s.normal);
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
        final CellStyle title, sectionHeader, tableHeader, label, value, normal, wrap, passCell, failCell;

        Styles(XSSFWorkbook wb) {
            title = make(wb, "1F4E79", "FFFFFF", true, 22, HorizontalAlignment.LEFT, false);
            sectionHeader = make(wb, "DDEBF7", "1F4E79", true, 11, HorizontalAlignment.CENTER, false);
            tableHeader = make(wb, "4F81BD", "FFFFFF", true, 11, HorizontalAlignment.CENTER, false);
            label = make(wb, "F2F2F2", "000000", true, 11, HorizontalAlignment.LEFT, false);
            value = make(wb, null, "000000", true, 11, HorizontalAlignment.CENTER, false);
            normal = make(wb, null, "000000", false, 11, HorizontalAlignment.LEFT, false);
            wrap = makeWrap(wb);
            passCell = make(wb, "92D050", "000000", true, 11, HorizontalAlignment.CENTER, false);
            failCell = make(wb, "FF0000", "FFFFFF", true, 11, HorizontalAlignment.CENTER, false);
        }

        private static XSSFCellStyle make(XSSFWorkbook wb, String bg, String fg,
                                           boolean bold, int size, HorizontalAlignment align, boolean wrap) {
            XSSFCellStyle style = wb.createCellStyle();
            if (bg != null) {
                style.setFillForegroundColor(new XSSFColor(ExcelReportService.hexToBytes(bg), null));
                style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            }
            XSSFFont font = wb.createFont();
            if (fg != null) font.setColor(new XSSFColor(ExcelReportService.hexToBytes(fg), null));
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
