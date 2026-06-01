import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { BASE_URL } from "../../config";

// ─── Color constants ───────────────────────────────────────────────────────────
const C_SUCCESS  = "#10B981";
const C_FAILED   = "#EF4444";
const C_CANCELLED = "#F59E0B";
const C_BLUE     = "#3B82F6";
const C_CYAN     = "#06B6D4";

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmtDuration(ms) {
  if (ms == null || isNaN(ms)) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function truncate(str, n) {
  if (!str) return "";
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

function dayKey(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDayLabel(key) {
  if (!key) return "";
  const [, m, d] = key.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]}`;
}

function getDaysAgo(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d;
}

function generateDayRange(days) {
  const result = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    result.push(key);
  }
  return result;
}

// ─── Donut arc helper ──────────────────────────────────────────────────────────
function describeArc(cx, cy, r, startAngle, endAngle) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

function donutSegmentPath(cx, cy, outerR, innerR, startAngle, endAngle) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const ox1 = cx + outerR * Math.cos(toRad(startAngle));
  const oy1 = cy + outerR * Math.sin(toRad(startAngle));
  const ox2 = cx + outerR * Math.cos(toRad(endAngle));
  const oy2 = cy + outerR * Math.sin(toRad(endAngle));
  const ix1 = cx + innerR * Math.cos(toRad(endAngle));
  const iy1 = cy + innerR * Math.sin(toRad(endAngle));
  const ix2 = cx + innerR * Math.cos(toRad(startAngle));
  const iy2 = cy + innerR * Math.sin(toRad(startAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${ox1} ${oy1}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${ox2} ${oy2}`,
    `L ${ix1} ${iy1}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2}`,
    "Z"
  ].join(" ");
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, color, subtitle }) {
  return (
    <div style={{
      flex: 1,
      background: "var(--bg-panel)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: "16px 18px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
      boxShadow: `0 0 16px ${color}22`,
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        color: "var(--text-3)",
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontSize: 28,
        fontWeight: 700,
        color: color || "var(--text-1)",
        lineHeight: 1.1,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>{value}</div>
      {subtitle && (
        <div style={{
          fontSize: 11,
          color: "var(--text-3)",
          marginTop: 2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>{subtitle}</div>
      )}
    </div>
  );
}

// ─── Line Chart ───────────────────────────────────────────────────────────────
function LineChart({ days, width, height }) {
  const PAD = { top: 18, right: 16, bottom: 36, left: 36 };
  const chartW = Math.max(width - PAD.left - PAD.right, 10);
  const chartH = Math.max(height - PAD.top - PAD.bottom, 10);

  const maxVal = useMemo(() => {
    const allVals = days.flatMap(d => [d.success, d.failed]);
    return Math.max(...allVals, 1);
  }, [days]);

  const niceMax = useMemo(() => {
    const step = Math.ceil(maxVal / 4);
    return step * 4;
  }, [maxVal]);

  const xOf = useCallback((i) => {
    if (days.length <= 1) return PAD.left + chartW / 2;
    return PAD.left + (i / (days.length - 1)) * chartW;
  }, [days.length, PAD.left, chartW]);

  const yOf = useCallback((val) => {
    return PAD.top + chartH - (val / niceMax) * chartH;
  }, [PAD.top, chartH, niceMax]);

  const successPoints = days.map((d, i) => ({ x: xOf(i), y: yOf(d.success) }));
  const failedPoints  = days.map((d, i) => ({ x: xOf(i), y: yOf(d.failed) }));

  function polyline(pts) {
    return pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  }

  const areaPath = useMemo(() => {
    if (successPoints.length === 0) return "";
    const bottom = PAD.top + chartH;
    const first = successPoints[0];
    const last  = successPoints[successPoints.length - 1];
    const pts = successPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    return `M ${first.x.toFixed(1)},${bottom.toFixed(1)} L ${pts} L ${last.x.toFixed(1)},${bottom.toFixed(1)} Z`;
  }, [successPoints, PAD.top, chartH]);

  // Y-axis grid lines
  const yTicks = useMemo(() => {
    const ticks = [];
    for (let i = 0; i <= 4; i++) {
      const val = (niceMax / 4) * i;
      ticks.push({ val, y: yOf(val) });
    }
    return ticks;
  }, [niceMax, yOf]);

  // X-axis labels — show at most ~8 labels to avoid crowding
  const xLabels = useMemo(() => {
    const every = Math.max(1, Math.ceil(days.length / 8));
    return days
      .map((d, i) => ({ label: fmtDayLabel(d.key), x: xOf(i), i }))
      .filter((_, i) => i % every === 0 || i === days.length - 1);
  }, [days, xOf]);

  const gradId = "lcAreaGrad";

  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={C_SUCCESS} stopOpacity={0.35} />
          <stop offset="100%" stopColor={C_SUCCESS} stopOpacity={0.03} />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {yTicks.map(t => (
        <g key={t.val}>
          <line
            x1={PAD.left} y1={t.y.toFixed(1)}
            x2={PAD.left + chartW} y2={t.y.toFixed(1)}
            stroke="var(--border)" strokeWidth={1} strokeDasharray="4 4"
          />
          <text
            x={PAD.left - 6} y={t.y.toFixed(1)}
            textAnchor="end" dominantBaseline="middle"
            fill="var(--text-3)" fontSize={10}
          >{t.val}</text>
        </g>
      ))}

      {/* X-axis base line */}
      <line
        x1={PAD.left} y1={PAD.top + chartH}
        x2={PAD.left + chartW} y2={PAD.top + chartH}
        stroke="var(--border)" strokeWidth={1}
      />

      {/* X-axis labels */}
      {xLabels.map(l => (
        <text
          key={l.i}
          x={l.x.toFixed(1)}
          y={PAD.top + chartH + 16}
          textAnchor="middle"
          fill="var(--text-3)"
          fontSize={10}
        >{l.label}</text>
      ))}

      {/* Area fill */}
      {days.length > 0 && (
        <path d={areaPath} fill={`url(#${gradId})`} />
      )}

      {/* Success line */}
      {successPoints.length > 1 && (
        <polyline
          points={polyline(successPoints)}
          fill="none" stroke={C_SUCCESS} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
        />
      )}

      {/* Failed line */}
      {failedPoints.length > 1 && (
        <polyline
          points={polyline(failedPoints)}
          fill="none" stroke={C_FAILED} strokeWidth={2}
          strokeDasharray="5 3"
          strokeLinejoin="round" strokeLinecap="round"
        />
      )}

      {/* Success dots */}
      {successPoints.map((p, i) => (
        <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={3} fill={C_SUCCESS} />
      ))}

      {/* Failed dots */}
      {failedPoints.map((p, i) => (
        <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={3} fill={C_FAILED} />
      ))}
    </svg>
  );
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────
function DonutChart({ success, failed, cancelled, total, size }) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 8;
  const innerR = outerR * 0.58;

  const segments = useMemo(() => {
    const segs = [
      { key: "success",   value: success,   color: C_SUCCESS },
      { key: "failed",    value: failed,    color: C_FAILED  },
      { key: "cancelled", value: cancelled, color: C_CANCELLED },
    ].filter(s => s.value > 0);
    return segs;
  }, [success, failed, cancelled]);

  const paths = useMemo(() => {
    if (total === 0) return [];
    // Full-circle edge case (single segment)
    if (segments.length === 1) {
      const seg = segments[0];
      // Draw two arcs to form a full circle (SVG can't do 360-degree arc directly)
      const p1 = donutSegmentPath(cx, cy, outerR, innerR, -90, 89.999);
      const p2 = donutSegmentPath(cx, cy, outerR, innerR, 90, 269.999);
      return [{ ...seg, paths: [p1, p2] }];
    }
    let angle = -90;
    return segments.map(seg => {
      const sweep = (seg.value / total) * 360;
      const start = angle;
      const end   = angle + sweep;
      angle = end;
      return { ...seg, paths: [donutSegmentPath(cx, cy, outerR, innerR, start, end - 0.3)] };
    });
  }, [segments, total, cx, cy, outerR, innerR]);

  return (
    <svg width={size} height={size}>
      {total === 0 ? (
        <>
          <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="var(--border)" strokeWidth={outerR - innerR} />
          <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--text-3)" fontSize={12}>No data</text>
        </>
      ) : (
        <>
          {paths.map(seg =>
            seg.paths.map((d, pi) => (
              <path key={`${seg.key}-${pi}`} d={d} fill={seg.color} opacity={0.92} />
            ))
          )}
          <text x={cx} y={cy - 7} textAnchor="middle" fill="var(--text-1)" fontSize={18} fontWeight={700}>{total}</text>
          <text x={cx} y={cy + 11} textAnchor="middle" fill="var(--text-3)" fontSize={10}>Total Runs</text>
        </>
      )}
    </svg>
  );
}

// ─── Horizontal Bar Chart ─────────────────────────────────────────────────────
function BarChart({ workflows, width, height }) {
  const PAD_LEFT  = 110;
  const PAD_RIGHT = 42;
  const PAD_TOP   = 10;
  const PAD_BOT   = 10;
  const BAR_GAP   = 6;

  const maxCount = useMemo(() => {
    return Math.max(...workflows.map(w => w.total), 1);
  }, [workflows]);

  const barH = workflows.length > 0
    ? Math.max(8, (height - PAD_TOP - PAD_BOT - BAR_GAP * (workflows.length - 1)) / workflows.length)
    : 16;

  const chartW = Math.max(width - PAD_LEFT - PAD_RIGHT, 10);

  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      {workflows.map((wf, i) => {
        const y = PAD_TOP + i * (barH + BAR_GAP);
        const successW = (wf.success / maxCount) * chartW;
        const failedW  = (wf.failed  / maxCount) * chartW;
        const totalW   = (wf.total   / maxCount) * chartW;

        return (
          <g key={wf.id || wf.name}>
            {/* Label */}
            <text
              x={PAD_LEFT - 8} y={y + barH / 2}
              textAnchor="end" dominantBaseline="middle"
              fill="var(--text-2)" fontSize={11}
            >{truncate(wf.name, 18)}</text>

            {/* Success portion */}
            <rect
              x={PAD_LEFT} y={y}
              width={Math.max(successW, 0)} height={barH}
              rx={3} fill={C_SUCCESS} opacity={0.85}
            />
            {/* Failed portion stacked after success */}
            <rect
              x={PAD_LEFT + successW} y={y}
              width={Math.max(failedW, 0)} height={barH}
              rx={3} fill={C_FAILED} opacity={0.85}
            />

            {/* Count label */}
            <text
              x={PAD_LEFT + totalW + 6} y={y + barH / 2}
              dominantBaseline="middle"
              fill="var(--text-2)" fontSize={11}
            >{wf.total}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const color = status === "success" ? C_SUCCESS : status === "failed" ? C_FAILED : C_CANCELLED;
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 10,
      background: `${color}22`,
      color: color,
      fontSize: 11,
      fontWeight: 600,
      textTransform: "capitalize",
      border: `1px solid ${color}44`,
    }}>{status}</span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ReportingPanel({ onClose }) {
  const [logs, setLogs]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [timeRange, setTimeRange]     = useState("30d");
  const [refreshKey, setRefreshKey]   = useState(0);

  // ResizeObserver widths
  const lineChartRef  = useRef(null);
  const barChartRef   = useRef(null);
  const [lineW, setLineW] = useState(400);
  const [barW,  setBarW]  = useState(400);

  useEffect(() => {
    if (!lineChartRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        setLineW(e.contentRect.width || 400);
      }
    });
    ro.observe(lineChartRef.current);
    setLineW(lineChartRef.current.clientWidth || 400);
    return () => ro.disconnect();
  }, [loading]);

  useEffect(() => {
    if (!barChartRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        setBarW(e.contentRect.width || 400);
      }
    });
    ro.observe(barChartRef.current);
    setBarW(barChartRef.current.clientWidth || 400);
    return () => ro.disconnect();
  }, [loading]);

  // Fetch logs
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${BASE_URL}/workflows/all-logs`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (!cancelled) {
          setLogs(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message);
          setLogs([]);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Filter logs by time range
  const filteredLogs = useMemo(() => {
    if (timeRange === "all") return logs;
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
    const cutoff = getDaysAgo(days);
    return logs.filter(l => {
      const d = new Date(l.runDateTime);
      return !isNaN(d) && d >= cutoff;
    });
  }, [logs, timeRange]);

  // KPI calculations
  const kpi = useMemo(() => {
    const total     = filteredLogs.length;
    const success   = filteredLogs.filter(l => l.status === "success").length;
    const failed    = filteredLogs.filter(l => l.status === "failed").length;
    const cancelled = filteredLogs.filter(l => l.status === "cancelled").length;
    const successRate = total > 0 ? ((success / total) * 100).toFixed(1) : "0.0";
    const durations = filteredLogs.filter(l => l.durationMs != null).map(l => l.durationMs);
    const avgDur = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

    // Most active workflow
    const wfCounts = {};
    filteredLogs.forEach(l => {
      const k = l.workflowName || l.workflowId || "Unknown";
      wfCounts[k] = (wfCounts[k] || 0) + 1;
    });
    const mostActive = Object.entries(wfCounts).sort((a, b) => b[1] - a[1])[0];

    return { total, success, failed, cancelled, successRate, avgDur, mostActive };
  }, [filteredLogs]);

  // Timeline data (daily breakdown)
  const timelineDays = useMemo(() => {
    const numDays = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : timeRange === "90d" ? 90 : 90;
    const keys = timeRange === "all"
      ? (() => {
          if (filteredLogs.length === 0) return generateDayRange(30);
          const allKeys = filteredLogs.map(l => dayKey(l.runDateTime)).filter(Boolean);
          allKeys.sort();
          const first = new Date(allKeys[0]);
          const last  = new Date();
          const days  = Math.ceil((last - first) / 86400000) + 1;
          return generateDayRange(Math.min(days, 180));
        })()
      : generateDayRange(numDays);

    const map = {};
    filteredLogs.forEach(l => {
      const k = dayKey(l.runDateTime);
      if (!k) return;
      if (!map[k]) map[k] = { success: 0, failed: 0, cancelled: 0 };
      if (l.status === "success")   map[k].success++;
      else if (l.status === "failed")    map[k].failed++;
      else if (l.status === "cancelled") map[k].cancelled++;
    });

    return keys.map(k => ({
      key: k,
      success:   (map[k] || {}).success   || 0,
      failed:    (map[k] || {}).failed    || 0,
      cancelled: (map[k] || {}).cancelled || 0,
    }));
  }, [filteredLogs, timeRange]);

  // Workflow bar chart data (top 10)
  const workflowBars = useMemo(() => {
    const map = {};
    filteredLogs.forEach(l => {
      const id   = l.workflowId   || "unknown";
      const name = l.workflowName || l.workflowId || "Unknown";
      if (!map[id]) map[id] = { id, name, success: 0, failed: 0, cancelled: 0, total: 0 };
      map[id].total++;
      if (l.status === "success")        map[id].success++;
      else if (l.status === "failed")    map[id].failed++;
      else if (l.status === "cancelled") map[id].cancelled++;
    });
    return Object.values(map)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [filteredLogs]);

  // Recent runs (last 20)
  const recentRuns = useMemo(() => {
    return [...filteredLogs]
      .sort((a, b) => new Date(b.runDateTime) - new Date(a.runDateTime))
      .slice(0, 20);
  }, [filteredLogs]);

  const barChartHeight = Math.max(workflowBars.length * 28 + 20, 60);
  const LINE_CHART_H = 200;

  const timeRangeBtns = [
    { label: "7d",  value: "7d" },
    { label: "30d", value: "30d" },
    { label: "90d", value: "90d" },
    { label: "All", value: "all" },
  ];

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      zIndex: 200,
      background: "var(--bg-app)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      fontFamily: "inherit",
    }}>
      {/* ── Header ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 20px",
        height: 52,
        background: "var(--bg-toolbar)",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        {/* Gradient accent bar */}
        <div style={{
          width: 4,
          height: 28,
          borderRadius: 2,
          background: `linear-gradient(to bottom, ${C_CYAN}, ${C_BLUE})`,
          flexShrink: 0,
        }} />

        <span style={{
          fontSize: 16,
          fontWeight: 700,
          color: "var(--text-1)",
          letterSpacing: "-0.01em",
          marginRight: "auto",
        }}>Analytics</span>

        {/* Time range buttons */}
        <div style={{ display: "flex", gap: 4 }}>
          {timeRangeBtns.map(btn => (
            <button
              key={btn.value}
              onClick={() => setTimeRange(btn.value)}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                border: timeRange === btn.value ? `1px solid ${C_BLUE}` : "1px solid var(--border)",
                background: timeRange === btn.value ? `${C_BLUE}22` : "var(--bg-input)",
                color: timeRange === btn.value ? C_BLUE : "var(--text-2)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >{btn.label}</button>
          ))}
        </div>

        {/* Refresh button */}
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          title="Refresh"
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--bg-input)",
            color: "var(--text-2)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1.5 7A5.5 5.5 0 0 1 12 4.5"/>
            <path d="M12.5 7A5.5 5.5 0 0 1 2 9.5"/>
            <polyline points="1.5,2.5 1.5,4.5 3.5,4.5"/>
            <polyline points="12.5,11.5 12.5,9.5 10.5,9.5"/>
          </svg>
        </button>

        {/* Close button */}
        <button
          onClick={onClose}
          title="Close"
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--bg-input)",
            color: "var(--text-2)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            fontWeight: 400,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >×</button>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}>
        {loading && (
          <div style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-3)",
            fontSize: 14,
          }}>Loading analytics…</div>
        )}

        {error && !loading && (
          <div style={{
            padding: "16px 20px",
            background: `${C_FAILED}11`,
            border: `1px solid ${C_FAILED}44`,
            borderRadius: 8,
            color: C_FAILED,
            fontSize: 13,
          }}>Failed to load data: {error}</div>
        )}

        {!loading && (
          <>
            {/* ── KPI Cards ── */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <KpiCard
                label="Total Runs"
                value={kpi.total}
                color={C_BLUE}
              />
              <KpiCard
                label="Success Rate"
                value={`${kpi.successRate}%`}
                color={C_SUCCESS}
                subtitle={`${kpi.success} of ${kpi.total} succeeded`}
              />
              <KpiCard
                label="Failed"
                value={kpi.failed}
                color={C_FAILED}
                subtitle={`${kpi.cancelled} cancelled`}
              />
              <KpiCard
                label="Avg Duration"
                value={kpi.avgDur != null ? fmtDuration(kpi.avgDur) : "—"}
                color={C_CYAN}
              />
              <KpiCard
                label="Most Active"
                value={kpi.mostActive ? truncate(kpi.mostActive[0], 18) : "—"}
                color={C_CANCELLED}
                subtitle={kpi.mostActive ? `${kpi.mostActive[1]} runs` : undefined}
              />
            </div>

            {/* ── Middle Row: Line + Donut ── */}
            <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
              {/* Line Chart */}
              <div style={{
                flex: 2,
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "14px 16px",
                minWidth: 0,
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
                    Daily Runs
                  </span>
                  <div style={{ display: "flex", gap: 14 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-3)" }}>
                      <span style={{ display: "inline-block", width: 16, height: 2, background: C_SUCCESS, borderRadius: 1 }} />
                      Success
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-3)" }}>
                      <span style={{ display: "inline-block", width: 16, height: 2, background: C_FAILED, borderRadius: 1, borderTop: `2px dashed ${C_FAILED}` }} />
                      Failed
                    </span>
                  </div>
                </div>
                <div ref={lineChartRef} style={{ width: "100%", minHeight: LINE_CHART_H }}>
                  {lineW > 0 && (
                    <LineChart
                      days={timelineDays}
                      width={lineW}
                      height={LINE_CHART_H}
                    />
                  )}
                </div>
              </div>

              {/* Donut Chart */}
              <div style={{
                flex: 1,
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                minWidth: 200,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", marginBottom: 12 }}>
                  Status Distribution
                </span>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, flex: 1 }}>
                  <DonutChart
                    success={kpi.success}
                    failed={kpi.failed}
                    cancelled={kpi.cancelled}
                    total={kpi.total}
                    size={140}
                  />
                  {/* Legend */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                      { label: "Success",   value: kpi.success,   color: C_SUCCESS   },
                      { label: "Failed",    value: kpi.failed,    color: C_FAILED    },
                      { label: "Cancelled", value: kpi.cancelled, color: C_CANCELLED },
                    ].map(item => (
                      <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          width: 10, height: 10, borderRadius: "50%",
                          background: item.color, flexShrink: 0,
                        }} />
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontSize: 11, color: "var(--text-3)" }}>{item.label}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: item.color }}>{item.value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Bar Chart: Top 10 Workflows ── */}
            <div style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "14px 16px",
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
                  Top Workflows by Run Count
                </span>
                <div style={{ display: "flex", gap: 14 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-3)" }}>
                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: C_SUCCESS }} />
                    Success
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-3)" }}>
                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: C_FAILED }} />
                    Failed
                  </span>
                </div>
              </div>
              {workflowBars.length === 0 ? (
                <div style={{ color: "var(--text-3)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
                  No workflow data for this period.
                </div>
              ) : (
                <div ref={barChartRef} style={{ width: "100%" }}>
                  <BarChart
                    workflows={workflowBars}
                    width={barW}
                    height={barChartHeight}
                  />
                </div>
              )}
            </div>

            {/* ── Recent Runs Table ── */}
            <div style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              overflow: "hidden",
            }}>
              <div style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border)",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-1)",
              }}>
                Recent Runs
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: "var(--text-3)" }}>
                  (last {Math.min(recentRuns.length, 20)} of {filteredLogs.length})
                </span>
              </div>

              {/* Table header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "2fr 1.4fr 0.9fr 0.9fr 2fr",
                padding: "8px 16px",
                borderBottom: "1px solid var(--border-xs, var(--border))",
                background: "var(--bg-toolbar)",
              }}>
                {["Workflow", "Date / Time", "Duration", "Status", "Error"].map(col => (
                  <span key={col} style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}>{col}</span>
                ))}
              </div>

              {recentRuns.length === 0 ? (
                <div style={{ padding: "24px 16px", color: "var(--text-3)", fontSize: 13, textAlign: "center" }}>
                  No runs in this period.
                </div>
              ) : (
                recentRuns.map((run, i) => (
                  <div
                    key={run.runId || i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1.4fr 0.9fr 0.9fr 2fr",
                      padding: "9px 16px",
                      borderBottom: i < recentRuns.length - 1 ? "1px solid var(--border-xs, var(--border))" : "none",
                      background: i % 2 === 0 ? "transparent" : "var(--surface, var(--bg-panel))",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span style={{
                      fontSize: 12,
                      color: "var(--text-1)",
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }} title={run.workflowName || run.workflowId}>
                      {truncate(run.workflowName || run.workflowId || "—", 28)}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                      {fmtDateTime(run.runDateTime)}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                      {fmtDuration(run.durationMs)}
                    </span>
                    <span>
                      <StatusBadge status={run.status} />
                    </span>
                    <span style={{
                      fontSize: 11,
                      color: C_FAILED,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }} title={run.error || ""}>
                      {run.error ? truncate(run.error, 60) : (
                        <span style={{ color: "var(--text-4, var(--text-3))" }}>—</span>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
