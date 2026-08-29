// Client-side replacement for run-all-api.xml's old build-excel-report flow (Groovy + Apache
// POI, server-side) — same 5-sheet layout, built entirely in the browser from the SAME report
// JSON RunAllReportModal already has loaded (GET .../run-all/last or the POST .../run-all
// response), no backend round trip. ExcelJS dynamically imported, same reasoning as
// SwaggerPayloadModal's own Excel export: it's a large library, only fetched when someone
// actually clicks Export.
//
// ARGB colors match SwaggerPayloadModal's own Excel export (and the values the old Groovy report
// used) so both features' exports read as one consistent system:
const TITLE_FILL = 'FF1F4E79';
const HEADER_FILL = 'FF4F81BD';
const PASS_FILL = 'FF92D050';
const FAIL_FILL = 'FFFF0000';

const MAX_CELL_CHARS = 30000; // Excel's real per-cell limit is 32,767 — stay comfortably under it.
function truncate(s) {
    if (s == null) return '';
    const str = String(s);
    return str.length > MAX_CELL_CHARS ? str.slice(0, MAX_CELL_CHARS) + '…(truncated)' : str;
}

// Passes an already-JSON-text string straight through (sentBody/response.body are already
// serialized JSON coming out of the backend); only actually re-encodes real objects (headers).
function toJsonStr(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    try { return JSON.stringify(v); } catch { return String(v); }
}

function styleHeaderRow(row) {
    row.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    });
}

function checksOf(fullResult) {
    if (!fullResult) return [];
    if (fullResult.iterating) return (fullResult.iterations || []).flatMap(it => it.checks || []);
    return fullResult.checks || [];
}

// Same shape run-all-api.xml's old resultOfCallRequest (Groovy) produced, for one Call Request
// log entry (a preRequestLog/postResponseLog entry that isn't a Set Variable step).
function callRequestResultText(step) {
    if (step.status === 'error') return `ERROR: ${step.error || 'unknown error'}`;
    return truncate(toJsonStr({
        subStatus: step.subStatus, responseStatus: step.subResponseStatus,
        responseBody: step.subResponseBody, error: step.subError,
    }));
}

async function loadExcelJS() {
    const { default: ExcelJS } = await import('exceljs');
    return ExcelJS;
}

function buildSummarySheet(wb, report) {
    const total = report.totalRequests || 0;
    const passedCount = report.passedRequests || 0;
    const failedCount = report.failedRequests || 0;
    const duration = report.durationMs || 0;

    const sheet = wb.addWorksheet('Summary');
    sheet.columns = [{ width: 26 }, { width: 20 }];

    const titleRow = sheet.addRow([`Run All — ${report.collectionName || ''}`]);
    sheet.mergeCells(titleRow.number, 1, titleRow.number, 2);
    titleRow.getCell(1).font = { bold: true, size: 22, color: { argb: 'FFFFFFFF' } };
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } };
    sheet.addRow([]);

    styleHeaderRow(sheet.addRow(['Metric', 'Value']));
    sheet.addRow(['Total Requests', total]);
    const passRow = sheet.addRow(['Passed', passedCount]);
    passRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PASS_FILL } };
    const failRow = sheet.addRow(['Failed', failedCount]);
    failRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FAIL_FILL } };
    failRow.getCell(2).font = { color: { argb: 'FFFFFFFF' } };
    sheet.addRow(['Pass Rate', total > 0 ? `${((passedCount * 100) / total).toFixed(1)}%` : '0.0%']);
    sheet.addRow(['Total Duration (ms)', duration]);

    // NOT an in-cell data bar (was, briefly) — ExcelJS has no chart-drawing API at all (confirmed:
    // no such feature exists in this library), so a data bar was the closest native-Excel visual
    // equivalent to the old Groovy/POI version's XDDF bar chart. But ExcelJS 4.4.0's
    // addConditionalFormatting({type: 'dataBar', ...}) writes a second, x14-extension block
    // alongside the legacy one, and that extension block is malformed in a way real Excel
    // rejects outright ("the file format or file extension is not valid") even though it's
    // well-formed XML — confirmed against https://github.com/exceljs/exceljs/issues/3015, open
    // and unfixed as of this library's version. The colored Passed/Failed cells above are the
    // whole visual now; don't re-add addConditionalFormatting here without checking that issue
    // is actually fixed in whatever exceljs version is pinned at the time.

    return sheet;
}

function buildDetailedResultsSheet(wb, results) {
    const sheet = wb.addWorksheet('Detailed Results');
    sheet.columns = [
        { header: '#', width: 6 }, { header: 'Request', width: 32 }, { header: 'Status', width: 12 },
        { header: 'Duration (ms)', width: 14 }, { header: 'Checks Passed', width: 14 },
        { header: 'Checks Failed', width: 14 }, { header: 'Checks Total', width: 14 }, { header: 'Error', width: 45 },
    ];
    styleHeaderRow(sheet.getRow(1));
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    results.forEach((entry, i) => {
        const ok = entry.status === 'success';
        const row = sheet.addRow([
            i + 1, entry.requestName || '', ok ? 'Pass' : 'Fail', entry.durationMs || 0,
            entry.checksPassed || 0, entry.checksFailed || 0, entry.checksTotal || 0, entry.error || '',
        ]);
        const statusCell = row.getCell(3);
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ok ? PASS_FILL : FAIL_FILL } };
        if (!ok) statusCell.font = { color: { argb: 'FFFFFFFF' } };
    });
}

// One row per request/iteration — the main HTTP call's actual sent/received traffic.
function buildRequestResponseSheet(wb, results) {
    const sheet = wb.addWorksheet('Request-Response Detail');
    sheet.columns = [
        { header: '#', width: 6 }, { header: 'Request', width: 32 }, { header: 'Iteration', width: 14 },
        { header: 'Sent Body', width: 45 }, { header: 'Sent Headers', width: 30 },
        { header: 'Response Status', width: 14 }, { header: 'Response Headers', width: 30 }, { header: 'Response Body', width: 45 },
    ];
    styleHeaderRow(sheet.getRow(1));
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    let n = 0;
    const addRow = (requestName, iterLabel, r) => {
        n++;
        const row = sheet.addRow([
            n, requestName, iterLabel,
            truncate(toJsonStr(r?.sentBody)), truncate(toJsonStr(r?.sentHeaders)),
            r?.response?.status ?? '', truncate(toJsonStr(r?.response?.headers)), truncate(toJsonStr(r?.response?.body)),
        ]);
        row.eachCell(cell => { cell.alignment = { wrapText: true, vertical: 'top' }; });
    };
    results.forEach(entry => {
        const fullResult = entry.fullResult;
        if (fullResult?.iterating) {
            (fullResult.iterations || []).forEach((it, idx) => addRow(entry.requestName || '', `Iteration ${idx + 1}`, it));
        } else {
            addRow(entry.requestName || '', '', fullResult);
        }
    });
}

// One row per pre-request/post-response step that ran (Call Request or Set Variable).
function buildStepsSheet(wb, results) {
    const sheet = wb.addWorksheet('Pre-Post Steps Detail');
    sheet.columns = [
        { header: '#', width: 6 }, { header: 'Request', width: 32 }, { header: 'Iteration', width: 14 },
        { header: 'Phase', width: 16 }, { header: 'Step Type', width: 14 },
        { header: 'Input (target / value)', width: 45 }, { header: 'Result', width: 45 },
    ];
    styleHeaderRow(sheet.getRow(1));
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    let n = 0;
    const addStepRow = (requestName, iterLabel, phase, stepType, input, result) => {
        n++;
        const row = sheet.addRow([n, requestName, iterLabel, phase, stepType, input, result]);
        row.eachCell(cell => { cell.alignment = { wrapText: true, vertical: 'top' }; });
    };
    results.forEach(entry => {
        const fullResult = entry.fullResult;
        const addSteps = (iterLabel, pre, post) => {
            (pre || []).forEach(step => addStepRow(
                entry.requestName || '', iterLabel, 'Pre-Request', 'Call Request',
                truncate(toJsonStr({ targetRequestId: step.requestId, body: step.inputBody, headers: step.inputHeaders })),
                callRequestResultText(step),
            ));
            (post || []).forEach(step => {
                if (step.type === 'setVariable') {
                    addStepRow(entry.requestName || '', iterLabel, 'Post-Response', 'Set Variable', step.name || '', truncate(toJsonStr(step.value)));
                } else {
                    addStepRow(
                        entry.requestName || '', iterLabel, 'Post-Response', 'Call Request',
                        truncate(toJsonStr({ targetRequestId: step.requestId, body: step.inputBody, headers: step.inputHeaders })),
                        callRequestResultText(step),
                    );
                }
            });
        };
        if (fullResult?.iterating) {
            (fullResult.iterations || []).forEach((it, idx) => addSteps(`Iteration ${idx + 1}`, it.preRequestLog, it.postResponseLog));
        } else {
            addSteps('', fullResult?.preRequestLog, fullResult?.postResponseLog);
        }
    });
    if (n === 0) sheet.addRow(['', '(no pre-request or post-response steps ran across any request in this report)']);
}

// One outline GROUP per check (per request/iteration): the check's own row, then its conditions
// as indented, collapsible sub-rows right under it — every condition shown, not just the failing
// ones, mirroring ResponseViewer.jsx's CheckEntry, which nests the same way on screen.
function buildChecksSheet(wb, results) {
    const sheet = wb.addWorksheet('Checks Detail');
    sheet.columns = [
        { header: '#', width: 6 }, { header: 'Request', width: 30 }, { header: 'Iteration', width: 14 },
        { header: 'Check', width: 26 }, { header: 'Condition', width: 40 }, { header: 'Result', width: 10 }, { header: 'Detail', width: 50 },
    ];
    styleHeaderRow(sheet.getRow(1));
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.properties.outlineLevelRow = 1;
    sheet.properties.outlineProperties = { summaryBelow: false };

    let n = 0;
    results.forEach(entry => {
        const fullResult = entry.fullResult;
        const addChecks = (iterLabel, checks) => {
            (checks || []).forEach(chk => {
                const conds = chk.conditions || [];
                n++;
                const headerRow = sheet.addRow([
                    n, entry.requestName || '', iterLabel, chk.name || '', '',
                    chk.passed ? 'Pass' : 'Fail', conds.length === 0 ? (chk.message || '') : '',
                ]);
                headerRow.getCell(4).font = { bold: true };
                const resultCell = headerRow.getCell(6);
                resultCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: chk.passed ? PASS_FILL : FAIL_FILL } };
                if (!chk.passed) resultCell.font = { color: { argb: 'FFFFFFFF' } };

                conds.forEach(cond => {
                    n++;
                    const conditionText = `${cond.left || ''} ${cond.operator || ''} ${cond.right || ''}`;
                    const condRow = sheet.addRow([n, '', '', '', conditionText, cond.passed ? 'Pass' : 'Fail', cond.message || '']);
                    condRow.outlineLevel = 1;
                    condRow.getCell(5).alignment = { indent: 1 };
                    const condResultCell = condRow.getCell(6);
                    condResultCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cond.passed ? PASS_FILL : FAIL_FILL } };
                    if (!cond.passed) condResultCell.font = { color: { argb: 'FFFFFFFF' } };
                });
            });
        };
        if (fullResult?.iterating) {
            (fullResult.iterations || []).forEach((it, idx) => addChecks(`Iteration ${idx + 1}`, it.checks));
        } else {
            addChecks('', checksOf(fullResult));
        }
    });
}

export async function buildRunAllWorkbook(report) {
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    const results = report.results || [];
    buildSummarySheet(wb, report);
    buildDetailedResultsSheet(wb, results);
    buildRequestResponseSheet(wb, results);
    buildStepsSheet(wb, results);
    buildChecksSheet(wb, results);
    return wb;
}

/** Builds the workbook and triggers a browser download — the one entry point RunAllReportModal
 *  calls; everything above is an implementation detail. */
export async function downloadRunAllExcel(report) {
    const wb = await buildRunAllWorkbook(report);
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const safeName = (report.collectionName || 'collection').replace(/[^a-zA-Z0-9_-]+/g, '_');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `run-all-${safeName}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
