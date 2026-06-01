import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { BASE_URL } from "./config";
import { ReactFlowProvider } from "@xyflow/react";
import PackageTree from "./components/grid/PackageTree";
import WorkflowPanel from "./components/grid/WorkflowDetail";
import NodeSidebar from "./components/sidebar/NodeSidebar";
import ConnectionsPanel from "./components/connections/ConnectionsPanel";
import VaultPanel from "./components/vault/VaultPanel";
import ConfigPanel from "./components/panels/ConfigPanel";
import DocsPanel from "./components/docs/DocsPanel";
import ReportingPanel from "./components/panels/ReportingPanel";
import GlobalVarsPanel from "./components/GlobalVarsPanel";
import { persistentStore } from "./store/persistentStore";
import TreeView from "./components/tree/TreeView";
import { useWorkflowStore } from "./store/workflowStore";
import { useConnectionStore } from "./store/connectionStore";
import { useVaultStore } from "./store/vaultStore";
import { useMetadataStore } from "./store/metadataStore";
import { annotateNodesWithSection } from "./utils/annotateWorkflow";
import { autoLayout } from "./utils/autoLayout";
import { useTheme } from "./hooks/useTheme";
import { useThemeStore } from "./store/themeStore";

const GRID_MIN = 160;
const GRID_MAX = 560;
const GRID_DEFAULT = 220;

const CONFIG_MIN = 220;
const CONFIG_MAX = 520;
const CONFIG_DEFAULT = 280;

export default function App() {
  const { workflows, expandedRowId, setExpandedRowId, runValidation, clearValidation, validationIssues, fetchPackages, nodes, edges, setRunContext } = useWorkflowStore();

  const { setNodes, setEdges } = useWorkflowStore();
  const { fetchConnections } = useConnectionStore();
  const { fetchVaultPackages } = useVaultStore();
  const { fetchAll: fetchMetadata } = useMetadataStore();

  useEffect(() => {
    fetchMetadata();
    fetchConnections();
    fetchVaultPackages();
    fetchPackages();
  }, []);

  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState(null);
  const runPollRef = useRef(null);
  const [logRefreshKey, setLogRefreshKey] = useState(0);
  const [logFilterWorkflow, setLogFilterWorkflow] = useState(null); // { id, name } or null
  const [showPalette, setShowPalette] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showLogPanel, setShowLogPanel] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [showVault, setShowVault] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [showReporting, setShowReporting] = useState(false);
  const [showGlobalVars, setShowGlobalVars] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [runResult, setRunResult] = useState(null); // { status, error, runId }
  const [saveError, setSaveError] = useState(null);
  const [gridWidth, setGridWidth] = useState(GRID_DEFAULT);
  const [configWidth, setConfigWidth] = useState(CONFIG_DEFAULT);
  const [canvasView, setCanvasView] = useState("canvas"); // 'canvas' | 'json' | 'tree'

  const infoRef = useRef(null);       // wraps the portal popup div
  const infoBtnRef = useRef(null);    // the i button itself
  const [infoPopoverPos, setInfoPopoverPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!showInfo) return;
    if (infoBtnRef.current) {
      const r = infoBtnRef.current.getBoundingClientRect();
      setInfoPopoverPos({ top: r.bottom + 8, left: r.left });
    }
    const handler = (e) => {
      const clickedBtn = infoBtnRef.current && infoBtnRef.current.contains(e.target);
      const clickedPopover = infoRef.current && infoRef.current.contains(e.target);
      if (!clickedBtn && !clickedPopover) setShowInfo(false);
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [showInfo]);

  async function handleRun() {
    if (!expandedRowId || running) return;
    setRunning(true);
    setRunResult(null);
    try {
      const globalVariables = persistentStore.getState().globalVariables || {};
      const res = await fetch(`${BASE_URL}/workflows/${expandedRowId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ globalVariables }),
      });
      const data = await res.json();
      setRunId(data.runId);
      // Poll for completion
      runPollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${BASE_URL}/workflows/executions/${data.runId}`);
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();
          if (statusData.status !== "running") {
            clearInterval(runPollRef.current);
            runPollRef.current = null;
            if (statusData.context) setRunContext(expandedRowId, statusData.context);
            setRunResult({ status: statusData.status, error: statusData.error, runId: statusData.runId });
            setRunning(false);
            setRunId(null);
            setLogRefreshKey(k => k + 1);
          }
        } catch (e) {
          clearInterval(runPollRef.current);
          runPollRef.current = null;
          setRunning(false);
          setRunId(null);
        }
      }, 500);
    } catch (err) {
      console.error("Run error:", err);
      setRunResult({ status: "failed", error: err.message });
      setRunning(false);
      setRunId(null);
    }
  }

  async function handleStop() {
    if (!runId) return;
    if (runPollRef.current) { clearInterval(runPollRef.current); runPollRef.current = null; }
    try {
      await fetch(`${BASE_URL}/workflows/executions/${runId}/cancel`, { method: "POST" });
    } catch (e) { console.error("Cancel error:", e); }
    setRunResult({ status: "cancelled", error: "Cancelled by user", runId });
    setRunning(false);
    setRunId(null);
    setLogRefreshKey(k => k + 1);
  }

  function handleResetLayout() {
    if (!expandedRowId) return;
    setNodes(autoLayout(nodes, edges));
  }

  async function handleSave() {
    if (!expandedRowId) return;
    const row = workflows.find(t => t.id === expandedRowId);
    if (!row) return;

    const issues = runValidation(expandedRowId);
    if (issues.length > 0) return;

    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`${BASE_URL}/workflows/${expandedRowId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...row, workflow: { nodes: annotateNodesWithSection(nodes), edges } })
      });
      if (!res.ok) {
        const text = await res.text();
        setSaveError(text || `Save failed (${res.status})`);
      }
    } catch (err) {
      console.error(err);
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedRowId, workflows, nodes, edges]);

  const onResizeStart = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = gridWidth;
    const onMove = (ev) => {
      const delta = ev.clientX - startX;
      setGridWidth(Math.max(GRID_MIN, Math.min(GRID_MAX, startW + delta)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onConfigResizeStart = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = configWidth;
    const onMove = (ev) => {
      const delta = startX - ev.clientX; // drag left = expand
      setConfigWidth(Math.max(CONFIG_MIN, Math.min(CONFIG_MAX, startW + delta)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const t = useTheme();
  const { theme, toggleTheme } = useThemeStore();

  const selectedWorkflow = workflows.find(wf => wf.id === expandedRowId);

  useEffect(() => { setCanvasView("canvas"); setShowInfo(false); }, [expandedRowId]);

  const infoPortal = showInfo && expandedRowId && createPortal(
    <div ref={infoRef} style={{
      position: "fixed", top: infoPopoverPos.top, left: infoPopoverPos.left, zIndex: 9999,
      background: t.bgApp, border: "1px solid rgba(59,130,246,0.25)", borderRadius: 9,
      padding: "14px 16px", width: 380, maxWidth: "calc(100vw - 24px)",
      boxShadow: "0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(59,130,246,0.06)",
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "#3B82F6", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
        Workflow Info
      </div>
      <InfoRow label="Run Endpoint" value={`POST  ${BASE_URL}/workflows/${expandedRowId}/run`} />
      <InfoRow label="Camel Route" value={`direct:${expandedRowId}`} />
      <InfoRow label="Workflow ID" value={expandedRowId} />
      <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 5, background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.1)" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>Request Body (optional)</div>
        <pre style={{ margin: 0, fontSize: 10, color: "var(--text-2)", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6 }}>{'{ "globalVariables": { "key": "value" } }'}</pre>
      </div>
    </div>,
    document.body
  );

  return (
    <ReactFlowProvider>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/*  LEFT ICON NAV BAR  */}
          <div style={{
            width: 46,
            background: t.bgDeep,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 10,
            gap: 2,
            flexShrink: 0,
            borderRight: "1px solid rgba(59,130,246,0.1)",
            boxShadow: "2px 0 16px rgba(0,0,0,0.5)",
          }}>
            <NavIcon title="Workflows" active={showGrid} onClick={() => setShowGrid(v => !v)}>
              <svg width="14" height="11" viewBox="0 0 14 11" fill="currentColor">
                <rect x="0" y="0" width="14" height="2"/><rect x="0" y="4.5" width="14" height="2"/>
                <rect x="0" y="9" width="14" height="2"/>
              </svg>
            </NavIcon>
            <NavIcon title="Node Palette" active={showPalette} onClick={() => setShowPalette(v => !v)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="0" y="0" width="6" height="6"/><rect x="8" y="0" width="6" height="6"/>
                <rect x="0" y="8" width="6" height="6"/><rect x="8" y="8" width="6" height="6"/>
              </svg>
            </NavIcon>
            <NavIcon title="Execution Logs" active={showLogPanel} onClick={() => { setLogFilterWorkflow(null); setShowLogPanel(v => !v); }}>
              <svg width="13" height="14" viewBox="0 0 13 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <rect x="1" y="1" width="11" height="12" rx="1.5"/>
                <line x1="3.5" y1="4.5" x2="9.5" y2="4.5"/>
                <line x1="3.5" y1="7" x2="9.5" y2="7"/>
                <line x1="3.5" y1="9.5" x2="7" y2="9.5"/>
              </svg>
            </NavIcon>
            <NavIcon title="Connections" active={showConnections} onClick={() => setShowConnections(v => !v)}>
              <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
                <rect x="2" y="0" width="2" height="4"/><rect x="8" y="0" width="2" height="4"/>
                <rect x="0" y="4" width="12" height="5" rx="1"/>
                <rect x="5" y="9" width="2" height="5"/>
              </svg>
            </NavIcon>
            <NavIcon title="Vault" active={showVault} onClick={() => setShowVault(v => !v)}>
              <svg width="13" height="14" viewBox="0 0 13 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1.5" y="6" width="10" height="7.5" rx="1.5"/>
                <path d="M4 6 V4 A2.5 2.5 0 0 1 9 4 V6"/>
                <circle cx="6.5" cy="9.5" r="1.2" fill="currentColor" stroke="none"/>
              </svg>
            </NavIcon>
            <NavIcon title="Analytics" active={showReporting} onClick={() => setShowReporting(v => !v)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/>
                <line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
                <line x1="2" y1="20" x2="22" y2="20"/>
              </svg>
            </NavIcon>

            {/* Bottom utilities */}
            <div style={{ flex: 1 }} />
            <div style={{ width: 22, height: 1, background: "rgba(59,130,246,0.15)", margin: "4px 0" }} />
            <NavIcon title="Global Variables" active={showGlobalVars} onClick={() => setShowGlobalVars(v => !v)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M4 2 Q1.5 2 1.5 4.5 v1 Q1.5 7 3.5 7 Q1.5 7 1.5 8.5 v1 Q1.5 12 4 12"/>
                <path d="M10 2 Q12.5 2 12.5 4.5 v1 Q12.5 7 10.5 7 Q12.5 7 12.5 8.5 v1 Q12.5 12 10 12"/>
              </svg>
            </NavIcon>
            <NavIcon title="Documentation" active={showDocs} onClick={() => setShowDocs(v => !v)}>
              <svg width="14" height="13" viewBox="0 0 14 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 2 C5.5 1 3 1 1.5 1.5 L1.5 12 C3 11.5 5.5 11.5 7 12.5"/>
                <path d="M7 2 C8.5 1 11 1 12.5 1.5 L12.5 12 C11 11.5 8.5 11.5 7 12.5"/>
              </svg>
            </NavIcon>
            <NavIcon title={theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'} active={false} onClick={toggleTheme}>
              {theme === 'dark' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </NavIcon>
            <div style={{ height: 8 }} />
          </div>

          {/*  WORKFLOW LIST LEFT PANEL  */}
          {(showGrid || showLogPanel) && (
            <div style={{
              width: gridWidth,
              flexShrink: 0,
              display: "flex",
              flexDirection: "row",
              borderRight: "1px solid rgba(59,130,246,0.1)",
              overflow: "hidden",
            }}>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <PackageTree runStatusRefreshKey={logRefreshKey} />
              </div>
              <div
                onMouseDown={onResizeStart}
                title="Drag to resize"
                style={{
                  width: 3,
                  cursor: "ew-resize",
                  background: "rgba(59,130,246,0.08)",
                  flexShrink: 0,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => e.target.style.background = "rgba(59,130,246,0.3)"}
                onMouseLeave={e => e.target.style.background = "rgba(59,130,246,0.08)"}
              />
            </div>
          )}

          {/*  NODE PALETTE FLYOUT  */}
          {showPalette && (
            <div style={{
              width: 166,
              background: t.bgPanel,
              overflowY: "auto",
              flexShrink: 0,
              borderRight: "1px solid rgba(59,130,246,0.1)",
            }}>
              <NodeSidebar />
            </div>
          )}

          {/*  CONNECTIONS FLYOUT  */}
          {showConnections && (
            <div style={{
              width: 240,
              background: t.bgPanel,
              display: "flex",
              flexDirection: "column",
              flexShrink: 0,
              borderRight: "1px solid rgba(59,130,246,0.1)",
              overflow: "hidden",
            }}>
              <ConnectionsPanel />
            </div>
          )}

          {/*  VAULT FLYOUT  */}
          {showVault && (
            <div style={{
              width: 240,
              background: t.bgPanel,
              display: "flex",
              flexDirection: "column",
              flexShrink: 0,
              borderRight: "1px solid rgba(245,158,11,0.15)",
              overflow: "hidden",
            }}>
              <VaultPanel />
            </div>
          )}

          {/*  MAIN CONTENT  */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Canvas action bar */}
            <div style={{
              height: 40,
              background: t.bgToolbar,
              borderBottom: "1px solid rgba(59,130,246,0.12)",
              display: "flex",
              alignItems: "center",
              padding: "0 14px",
              gap: 8,
              flexShrink: 0,
              fontSize: 11,
              backdropFilter: "blur(12px)",
            }}>
              {selectedWorkflow ? (
                <>
                  {/* Workflow name + info */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", boxShadow: "0 0 6px #10B981" }} />
                    <span style={{ fontWeight: 700, color: "var(--text-1)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, letterSpacing: "0.01em" }}>
                      {selectedWorkflow.name || "Untitled"}
                    </span>
                    {/* Info icon */}
                    <div>
                      <button
                        ref={infoBtnRef}
                        onClick={() => setShowInfo(v => !v)}
                        title="Workflow info"
                        style={{
                          width: 18, height: 18, borderRadius: "50%", border: "none", padding: 0,
                          background: showInfo ? "rgba(59,130,246,0.25)" : "var(--surface-2)",
                          color: showInfo ? "#60A5FA" : "var(--text-3)",
                          cursor: "pointer", fontSize: 10, fontWeight: 700, fontStyle: "italic",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "all 0.12s",
                          outline: showInfo ? "1px solid rgba(59,130,246,0.4)" : "none",
                        }}
                        onMouseEnter={e => { if (!showInfo) { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--text-2)"; } }}
                        onMouseLeave={e => { if (!showInfo) { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--text-3)"; } }}
                      >i</button>
                    </div>
                    {infoPortal}
                  </div>
                  <div style={{ width: 1, height: 16, background: "var(--border)" }} />
                  <ActionButton onClick={handleSave} disabled={saving} color="#10B981" glow="rgba(16,185,129,0.35)" title={saving ? "Saving…" : "Save (Ctrl+S)"}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 2h7.5L12 4.5V12H2V2z"/>
                      <rect x="4" y="8" width="6" height="4" rx="0.5"/>
                      <path d="M4 2h5v3H4V2z"/>
                    </svg>
                  </ActionButton>
                  <ActionButton onClick={() => runValidation(selectedWorkflow.id)} color="#8B5CF6" glow="rgba(139,92,246,0.35)" title="Validate nodes">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 1L2 3.5V7c0 3 2.2 5.1 5 6 2.8-.9 5-3 5-6V3.5L7 1z"/>
                      <polyline points="4.5,7 6,8.5 9.5,5"/>
                    </svg>
                  </ActionButton>
                  {running ? (
                    <ActionButton onClick={handleStop} color="#EF4444" glow="rgba(239,68,68,0.4)" title="Stop run">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                        <rect x="1" y="1" width="10" height="10" rx="1.5"/>
                      </svg>
                    </ActionButton>
                  ) : (
                    <ActionButton onClick={handleRun} color="#3B82F6" glow="rgba(59,130,246,0.4)" title="Run workflow">
                      <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
                        <polygon points="1,1 1,13 12,7"/>
                      </svg>
                    </ActionButton>
                  )}
                  <ActionButton
                    onClick={() => { setLogFilterWorkflow({ id: expandedRowId, name: selectedWorkflow?.name }); setShowLogPanel(true); }}
                    color="#06B6D4" glow="rgba(6,182,212,0.35)" title="View latest run logs"
                  >
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="1" width="11" height="11" rx="1.5"/>
                      <line x1="3.5" y1="4" x2="9.5" y2="4"/>
                      <line x1="3.5" y1="6.5" x2="9.5" y2="6.5"/>
                      <line x1="3.5" y1="9" x2="7" y2="9"/>
                    </svg>
                  </ActionButton>
                  <ActionButton onClick={handleResetLayout} color="#F59E0B" glow="rgba(245,158,11,0.35)" title="Auto-arrange nodes">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="5" width="3" height="4" rx="0.5"/>
                      <rect x="5.5" y="5" width="3" height="4" rx="0.5"/>
                      <rect x="10" y="5" width="3" height="4" rx="0.5"/>
                      <line x1="4" y1="7" x2="5.5" y2="7"/>
                      <line x1="8.5" y1="7" x2="10" y2="7"/>
                    </svg>
                  </ActionButton>
                </>
              ) : (
                <span style={{ color: t.text1, fontSize: 11 }}>Select a workflow to begin</span>
              )}
              <span style={{ flex: 1 }} />
              {/* View switch */}
              {selectedWorkflow && !showLogPanel && (
                <div style={{
                  display: "flex", alignItems: "center",
                  background: "var(--surface-2)", border: "1px solid var(--border-sm)",
                  borderRadius: 6, padding: 2, gap: 1, marginRight: 8,
                }}>
                  {[
                    { value: "canvas", label: "Canvas" },
                    { value: "tree",   label: "Tree"   },
                    { value: "json",   label: "JSON"   },
                  ].map(({ value, label }) => {
                    const active = canvasView === value;
                    return (
                      <button
                        key={value}
                        onClick={() => setCanvasView(value)}
                        style={{
                          padding: "3px 9px", fontSize: 10, fontWeight: active ? 700 : 500,
                          color: active ? "var(--text-1)" : "var(--text-3)",
                          background: active ? "rgba(59,130,246,0.2)" : "transparent",
                          border: active ? "1px solid rgba(59,130,246,0.35)" : "1px solid transparent",
                          borderRadius: 4, cursor: "pointer", transition: "all 0.12s",
                          letterSpacing: "0.02em",
                        }}
                        onMouseEnter={e => { if (!active) e.currentTarget.style.color = "var(--text-2)"; }}
                        onMouseLeave={e => { if (!active) e.currentTarget.style.color = "var(--text-3)"; }}
                      >{label}</button>
                    );
                  })}
                </div>
              )}
              {selectedWorkflow && (
                <button onClick={() => setExpandedRowId(null)}
                  style={{ padding: "3px 8px", fontSize: 12, background: "transparent", border: "1px solid var(--border)", borderRadius: 5, cursor: "pointer", color: "var(--text-1)", transition: "all 0.15s" }}
                  onMouseEnter={e => { e.target.style.borderColor = "rgba(239,68,68,0.4)"; e.target.style.color = "#EF4444"; }}
                  onMouseLeave={e => { e.target.style.borderColor = "var(--border)"; e.target.style.color = "var(--text-4)"; }}>
                  ×
                </button>
              )}
            </div>

            {/*  CANVAS / LOG / JSON / TREE AREA  */}
            <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
              {validationIssues !== null && (
                <ValidationPanel issues={validationIssues} onClose={clearValidation} />
              )}

              {/* Canvas view (kept mounted so ReactFlow state survives view switches) */}
              {expandedRowId && (
                <div style={{
                  position: "absolute", inset: 0,
                  visibility: canvasView === "canvas" && !showLogPanel ? "visible" : "hidden",
                  pointerEvents: canvasView === "canvas" && !showLogPanel ? "auto" : "none",
                }}>
                  <WorkflowPanel layoutKey={`${showPalette}-${showGrid || showLogPanel}-${showConnections}-${showVault}-${!showLogPanel}`} />
                </div>
              )}

              {/* LogPanel overlays on top when active */}
              {showLogPanel && (
                <div style={{ position: "absolute", inset: 0, zIndex: 10 }}>
                  <LogPanel
                    refreshKey={logRefreshKey}
                    workflowId={logFilterWorkflow?.id ?? null}
                    workflowName={logFilterWorkflow?.name ?? null}
                    onClose={() => setShowLogPanel(false)}
                  />
                </div>
              )}

              {/* JSON view */}
              {canvasView === "json" && expandedRowId && (
                <div style={{ position: "absolute", inset: 0 }}>
                  <JsonView nodes={nodes} edges={edges} />
                </div>
              )}

              {/* Tree view */}
              {canvasView === "tree" && expandedRowId && (
                <div style={{ position: "absolute", inset: 0 }}>
                  <TreeView />
                </div>
              )}

              {/* Docs full-screen overlay */}
              {showDocs && (
                <div style={{ position: "absolute", inset: 0, zIndex: 200, background: t.bgApp }}>
                  <DocsPanel onClose={() => setShowDocs(false)} />
                </div>
              )}

              {/* Analytics / Reporting full-screen overlay */}
              {showReporting && (
                <div style={{ position: "absolute", inset: 0, zIndex: 200 }}>
                  <ReportingPanel onClose={() => setShowReporting(false)} />
                </div>
              )}

              {/* Global Variables modal */}
              {showGlobalVars && (
                <GlobalVarsPanel onClose={() => setShowGlobalVars(false)} />
              )}

              {/* Empty state */}
              {!expandedRowId && (
                <div style={{
                  height: "100%",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  gap: 16,
                  background: t.bgApp,
                  backgroundImage: "linear-gradient(rgba(59,130,246,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.03) 1px, transparent 1px)",
                  backgroundSize: "32px 32px",
                }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: 18,
                    background: "rgba(59,130,246,0.08)",
                    border: "1px solid rgba(59,130,246,0.2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 0 32px rgba(59,130,246,0.15)",
                  }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round">
                      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: t.text1, textAlign: "center", marginBottom: 6 }}>No workflow selected</div>
                    <div style={{ fontSize: 12, color: t.text2, textAlign: "center" }}>Open a workflow from the explorer panel</div>
                  </div>
                </div>
              )}

            </div>


          </div>

          {/*  CONFIG PANEL RIGHT SIDEBAR  */}
          {expandedRowId && !showLogPanel && (
            <div style={{
              width: configWidth,
              flexShrink: 0,
              display: "flex",
              flexDirection: "row",
              borderLeft: "1px solid rgba(59,130,246,0.1)",
              background: t.bgPanel,
              overflow: "hidden",
              boxShadow: "-2px 0 16px rgba(0,0,0,0.4)",
            }}>
              {/* Resize handle on the left edge */}
              <div
                onMouseDown={onConfigResizeStart}
                title="Drag to resize"
                style={{
                  width: 3,
                  cursor: "ew-resize",
                  background: "rgba(59,130,246,0.08)",
                  flexShrink: 0,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => e.target.style.background = "rgba(59,130,246,0.3)"}
                onMouseLeave={e => e.target.style.background = "rgba(59,130,246,0.08)"}
              />
              <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <ConfigPanel />
              </div>
            </div>
          )}

        </div>
      </div>

      {runResult && createPortal(
        <RunResultPopup result={runResult} onClose={() => setRunResult(null)} />,
        document.body
      )}
      {saveError && createPortal(
        <SaveErrorToast message={saveError} onClose={() => setSaveError(null)} />,
        document.body
      )}
    </ReactFlowProvider>
  );
}

// ─── Run Result Popup ─────────────────────────────────────────────────────────
function RunResultPopup({ result, onClose }) {
  const success = result.status === "success";
  return (
    <div style={{
      position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 9999, background: "rgba(0,0,0,0.45)",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--bg-panel, #1a1d23)",
        border: `1px solid ${success ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)"}`,
        borderRadius: 10, padding: "24px 28px", minWidth: 320, maxWidth: 480,
        boxShadow: `0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px ${success ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)"}`,
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: success ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
            border: `1px solid ${success ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`,
            fontSize: 16,
          }}>
            {success ? "✓" : "✕"}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: success ? "#10B981" : "#EF4444" }}>
              {success ? "Run Completed" : "Run Failed"}
            </div>
            {result.runId && (
              <div style={{ fontSize: 10, color: "var(--text-3, #6b7280)", marginTop: 1, fontFamily: "monospace" }}>
                {result.runId}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer",
            color: "var(--text-3, #6b7280)", fontSize: 18, lineHeight: 1, padding: "2px 4px",
          }}>×</button>
        </div>

        {/* Error detail */}
        {!success && result.error && (
          <div style={{
            background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 6, padding: "10px 12px",
            fontSize: 11, color: "#FCA5A5", fontFamily: "monospace",
            whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 200, overflowY: "auto",
            lineHeight: 1.6,
          }}>
            {result.error}
          </div>
        )}

        {/* Footer button */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "5px 18px", fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: "pointer",
            background: success ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.12)",
            color: success ? "#10B981" : "#EF4444",
            border: `1px solid ${success ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
          }}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Save Error Toast ─────────────────────────────────────────────────────────
function SaveErrorToast({ message, onClose }) {
  return (
    <div style={{
      position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, maxWidth: 560, width: "calc(100vw - 48px)",
      background: "var(--bg-panel, #1a1d23)",
      border: "1px solid rgba(239,68,68,0.4)",
      borderRadius: 10, padding: "14px 18px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(239,68,68,0.1)",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)",
          fontSize: 13, color: "#EF4444", fontWeight: 700,
        }}>!</div>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#EF4444" }}>Route Error</span>
        <button onClick={onClose} style={{
          marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer",
          color: "var(--text-3, #6b7280)", fontSize: 18, lineHeight: 1, padding: "2px 4px",
        }}>×</button>
      </div>
      <div style={{
        background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)",
        borderRadius: 6, padding: "9px 12px",
        fontSize: 11, color: "#FCA5A5", fontFamily: "monospace",
        whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 160, overflowY: "auto",
        lineHeight: 1.6,
      }}>{message}</div>
    </div>
  );
}

// ─── JSON View ───────────────────────────────────────────────────────────────
function JsonView({ nodes, edges }) {
  const data = { nodes, edges };
  const json = JSON.stringify(data, null, 2);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#1e1e1e" }}>
      <div style={{ padding: "5px 12px", background: "#252526", borderBottom: "1px solid #333", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ color: "#9cdcfe", fontSize: 11, fontFamily: "monospace" }}>workflow.json</span>
        <button onClick={handleCopy} style={{ fontSize: 10, padding: "2px 8px", background: copied ? "#1a7a3c" : "#2d6cdf", color: "#fff", border: "none", borderRadius: 3, cursor: "pointer" }}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre style={{ flex: 1, overflow: "auto", margin: 0, padding: "12px 16px", color: "#d4d4d4", fontSize: 11, fontFamily: "monospace", lineHeight: 1.6, background: "#1e1e1e" }}>
        {json}
      </pre>
    </div>
  );
}

function InfoRow({ label, value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <code style={{
          flex: 1, fontSize: 10, color: "var(--text-2)", fontFamily: "'JetBrains Mono', monospace",
          background: "var(--bg-input)", border: "1px solid var(--border-xs)",
          borderRadius: 4, padding: "3px 7px", wordBreak: "break-all", lineHeight: 1.5,
        }}>{value}</code>
        <button
          onClick={() => { navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
          style={{
            flexShrink: 0, padding: "3px 7px", fontSize: 9, fontWeight: 600,
            background: copied ? "rgba(16,185,129,0.15)" : "rgba(59,130,246,0.1)",
            border: `1px solid ${copied ? "rgba(16,185,129,0.3)" : "rgba(59,130,246,0.2)"}`,
            borderRadius: 4, color: copied ? "#10B981" : "#60A5FA", cursor: "pointer",
          }}
        >{copied ? "✓" : "Copy"}</button>
      </div>
    </div>
  );
}

function ActionButton({ children, onClick, disabled, color = "#3B82F6", glow, title }) {
  const [hovered, setHovered] = useState(false);
  const glowColor = glow || `${color}55`;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "5px 8px", fontSize: 11, fontWeight: 600,
        background: hovered ? `linear-gradient(135deg, ${color}, ${color}cc)` : `linear-gradient(135deg, ${color}cc, ${color}99)`,
        border: `1px solid ${color}60`,
        borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer",
        color: "#fff", whiteSpace: "nowrap",
        boxShadow: hovered ? `0 0 16px ${glowColor}` : `0 0 6px ${glowColor}55`,
        opacity: disabled ? 0.55 : 1,
        transition: "all 0.15s ease",
        fontFamily: "'Inter', sans-serif",
        letterSpacing: "0.02em",
      }}
    >
      {children}
    </button>
  );
}

function NavIcon({ children, title, active, onClick }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 32,
        height: 32,
        background: active ? "rgba(59,130,246,0.18)" : "transparent",
        border: active ? "1px solid rgba(59,130,246,0.4)" : "1px solid transparent",
        borderRadius: 8,
        color: active ? "#60A5FA" : "var(--text-4)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.12s ease",
        boxShadow: active ? "0 0 10px rgba(59,130,246,0.25)" : "none",
      }}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }) {
  const colors = {
    success: { bg: "rgba(16,185,129,0.12)", text: "#10B981", border: "rgba(16,185,129,0.3)", glow: "rgba(16,185,129,0.2)" },
    failed:  { bg: "rgba(239,68,68,0.12)",  text: "#EF4444", border: "rgba(239,68,68,0.3)",  glow: "rgba(239,68,68,0.2)" },
    running: { bg: "rgba(245,158,11,0.12)", text: "#F59E0B", border: "rgba(245,158,11,0.3)", glow: "rgba(245,158,11,0.2)" },
  };
  const c = colors[status] || colors.running;
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      textTransform: "uppercase", letterSpacing: "0.06em",
      boxShadow: `0 0 8px ${c.glow}`,
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      {status}
    </span>
  );
}

function formatRunDateTime(dt) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleString("en-GB", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    });
  } catch { return dt; }
}

const LOG_PAGE_SIZE = 10;

function FunnelIcon({ size = 9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="currentColor">
      <path d="M1 1.5h8L6 5v3.5l-2-1V5L1 1.5z" />
    </svg>
  );
}

function ColHeader({ label, filterValue, onFilterChange, filterType }) {
  const [isOpen, setIsOpen] = useState(false);
  const thRef = useRef(null);
  const isActive = !!filterValue;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (thRef.current && !thRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [isOpen]);

  const popoverInputStyle = {
    width: "100%", background: "var(--bg-input)",
    border: "1px solid rgba(59,130,246,0.35)", borderRadius: 4,
    color: "var(--text-1)", fontSize: 11, padding: "5px 8px",
    outline: "none", boxSizing: "border-box", fontFamily: "'Inter', sans-serif",
  };

  return (
    <th ref={thRef} style={{ ...thStyle, position: "relative", userSelect: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ flex: 1 }}>{label}</span>
        <button
          onClick={() => setIsOpen(v => !v)}
          style={{
            background: isOpen ? "rgba(59,130,246,0.2)" : "transparent",
            border: `1px solid ${isOpen || isActive ? "rgba(59,130,246,0.45)" : "transparent"}`,
            borderRadius: 3, padding: "2px 3px",
            color: isActive ? "#3B82F6" : isOpen ? "#93C5FD" : "var(--text-3)",
            cursor: "pointer", display: "flex", alignItems: "center",
            transition: "all 0.12s", lineHeight: 1, flexShrink: 0,
          }}
          title={isActive ? "Filter active — click to change" : "Filter column"}
        >
          <FunnelIcon />
        </button>
      </div>

      {isOpen && (
        <div style={{
          position: "absolute", top: "calc(100% + 3px)", left: 0, zIndex: 300,
          background: "var(--bg-panel)", border: "1px solid rgba(59,130,246,0.35)",
          borderRadius: 7, padding: "10px 12px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.75), 0 0 0 1px rgba(59,130,246,0.08)",
          minWidth: 200,
        }}>
          {filterType === "select" ? (
            <select
              autoFocus
              value={filterValue}
              onChange={e => { onFilterChange(e.target.value); setIsOpen(false); }}
              style={{ ...popoverInputStyle, cursor: "pointer" }}
            >
              <option value="">All statuses</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Contains
              </div>
              <input
                autoFocus
                value={filterValue}
                onChange={e => onFilterChange(e.target.value)}
                placeholder={`Search…`}
                style={popoverInputStyle}
                onKeyDown={e => { if (e.key === "Escape" || e.key === "Enter") setIsOpen(false); }}
              />
              {isActive && (
                <button
                  onClick={() => { onFilterChange(""); setIsOpen(false); }}
                  style={{
                    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
                    color: "#EF4444", borderRadius: 4, padding: "3px 0",
                    fontSize: 10, cursor: "pointer", width: "100%",
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  Clear filter
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </th>
  );
}

function LogPanel({ refreshKey, workflowId, workflowName, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [directOpen, setDirectOpen] = useState(false);
  const [filterName,   setFilterName]   = useState(workflowName || "");
  const [filterDate,   setFilterDate]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(0);
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    autoOpenedRef.current = false;
    setSelectedLog(null);
    setDirectOpen(false);
    setFilterName(workflowName || "");
  }, [workflowId, workflowName]);

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE_URL}/workflows/all-logs`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        const sorted = [...data].sort((a, b) =>
          new Date(b.runDateTime).getTime() - new Date(a.runDateTime).getTime()
        );
        setLogs(sorted);
        setLoading(false);
        if (workflowId && !autoOpenedRef.current) {
          autoOpenedRef.current = true;
          const latest = sorted.find(l => l.workflowId === workflowId);
          if (latest) { setSelectedLog(latest); setDirectOpen(true); }
        }
      })
      .catch(() => setLoading(false));
  }, [refreshKey, workflowId]);

  useEffect(() => { setPage(0); }, [filterName, filterDate, filterStatus]);

  if (selectedLog) {
    return <LogDetail
      log={selectedLog}
      onBack={directOpen ? onClose : () => setSelectedLog(null)}
      onClose={onClose}
    />;
  }

  const filtered = logs.filter(entry => {
    const name   = (entry.workflowName || "").toLowerCase();
    const date   = formatRunDateTime(entry.runDateTime).toLowerCase();
    const status = (entry.status || "").toLowerCase();
    return (!filterName   || name.includes(filterName.toLowerCase()))
        && (!filterDate   || date.includes(filterDate.toLowerCase()))
        && (!filterStatus || status === filterStatus);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / LOG_PAGE_SIZE));
  const safePage   = Math.min(page, totalPages - 1);
  const pageRows   = filtered.slice(safePage * LOG_PAGE_SIZE, (safePage + 1) * LOG_PAGE_SIZE);

  return (
    <div style={{ width: "100%", height: "100%", background: "var(--bg-app)", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{
        padding: "9px 16px", background: "var(--bg-panel)",
        borderBottom: "1px solid rgba(59,130,246,0.12)", flexShrink: 0,
        display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(12px)",
      }}>
        <div style={{ width: 3, height: 12, borderRadius: 2, background: "linear-gradient(180deg, #3B82F6, #06B6D4)" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-1)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Run History</span>
        {(filterName || filterDate || filterStatus) && (
          <span style={{ fontSize: 10, color: "#3B82F6", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 10, padding: "1px 8px" }}>
            filtered
          </span>
        )}
        {!loading && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-3)", fontFamily: "'JetBrains Mono', monospace" }}>
            {filtered.length} / {logs.length} run{logs.length !== 1 ? "s" : ""}
          </span>
        )}
        {onClose && (
          <button
            onClick={onClose}
            title="Close"
            style={{
              marginLeft: !loading ? 8 : "auto",
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--text-3)", fontSize: 16, lineHeight: 1, padding: "0 2px",
              display: "flex", alignItems: "center",
              transition: "color 0.12s",
            }}
            onMouseEnter={e => e.currentTarget.style.color = "#EF4444"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--text-3)"}
          >×</button>
        )}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <div style={{ padding: 32, color: "var(--text-3)", textAlign: "center", fontSize: 12 }}>Loading…</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, color: "var(--text-4)" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--bg-app)" }}>
              <tr>
                <ColHeader label="Workflow Name"    filterValue={filterName}   onFilterChange={setFilterName}   filterType="text"   />
                <ColHeader label="Run Date / Time ↓" filterValue={filterDate}   onFilterChange={setFilterDate}   filterType="text"   />
                <ColHeader label="Status"           filterValue={filterStatus} onFilterChange={setFilterStatus} filterType="select" />
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ padding: 40, color: "var(--text-3)", textAlign: "center", fontSize: 12 }}>
                    {logs.length === 0 ? "No runs yet — run a workflow to see logs here." : "No runs match the current filters."}
                  </td>
                </tr>
              ) : (
                pageRows.map((entry, i) => (
                  <tr
                    key={entry.runId || i}
                    onClick={() => { setSelectedLog(entry); setDirectOpen(false); }}
                    style={{ background: i % 2 === 0 ? "transparent" : "var(--surface)", cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(59,130,246,0.07)"}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "var(--surface)"}
                  >
                    <td style={tdStyle}>{entry.workflowName || "—"}</td>
                    <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{formatRunDateTime(entry.runDateTime)}</td>
                    <td style={tdStyle}><StatusBadge status={entry.status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Paging footer */}
      {!loading && filtered.length > LOG_PAGE_SIZE && (
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "7px 16px", background: "var(--bg-app)",
          borderTop: "1px solid rgba(59,130,246,0.1)", fontSize: 11,
        }}>
          <span style={{ color: "var(--text-3)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
            {safePage * LOG_PAGE_SIZE + 1}–{Math.min((safePage + 1) * LOG_PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <PageBtn disabled={safePage === 0} onClick={() => setPage(0)}>«</PageBtn>
            <PageBtn disabled={safePage === 0} onClick={() => setPage(p => p - 1)}>‹</PageBtn>
            <span style={{ color: "var(--text-4)", fontSize: 10, padding: "0 8px", fontFamily: "'JetBrains Mono', monospace" }}>
              {safePage + 1} / {totalPages}
            </span>
            <PageBtn disabled={safePage >= totalPages - 1} onClick={() => setPage(p => p + 1)}>›</PageBtn>
            <PageBtn disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</PageBtn>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle = {
  padding: "8px 10px", textAlign: "left", fontWeight: 600,
  color: "var(--text-1)", borderBottom: "1px solid var(--border-xs)",
  whiteSpace: "nowrap", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
};

const tdStyle = {
  padding: "9px 10px", borderBottom: "1px solid var(--surface)", color: "var(--text-1)", fontWeight: 500,
};

function PageBtn({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "transparent" : "var(--surface-2)",
        border: "1px solid var(--border-sm)",
        color: disabled ? "var(--text-3)" : "var(--text-4)",
        borderRadius: 4, width: 24, height: 24,
        cursor: disabled ? "default" : "pointer",
        fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 0, lineHeight: 1,
        transition: "all 0.12s",
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-sm)"; }}
    >{children}</button>
  );
}

function lineStyle(line) {
  if (line.includes(" ERROR") || line.includes("failed") || line.includes("FAILED")) return { color: "#EF4444" };
  if (line.includes(" WARN")) return { color: "#F59E0B" };
  if (line.includes("completed successfully") || line.includes("run started")) return { color: "#60A5FA", fontWeight: "bold" };
  if (line.includes(" INFO")) return { color: "var(--text-4)" };
  return { color: "#94A3B8" };
}

function LogDetail({ log, onBack, onClose }) {
  const workflowId = log.workflowId;
  const containerRef = useRef(null);
  const [logLines, setLogLines] = useState(null);
  const [loadingLines, setLoadingLines] = useState(true);

  const steps = log.steps || [];
  const isSuccess = log.status === "success";
  const durationLabel = log.durationMs != null ? (log.durationMs >= 1000 ? `${(log.durationMs / 1000).toFixed(2)}s` : `${log.durationMs}ms`) : null;

  useEffect(() => {
    setLoadingLines(true);
    fetch(`${BASE_URL}/workflows/${workflowId}/logs/${log.runId}/lines`)
      .then(r => r.ok ? r.json() : [])
      .then(lines => { setLogLines(lines); setLoadingLines(false); })
      .catch(() => { setLogLines([]); setLoadingLines(false); });
  }, [log.runId, workflowId]);

  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [logLines]);

  return (
    <div style={{ width: "100%", height: "100%", background: "var(--bg-app)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        padding: "8px 14px", background: "var(--bg-panel)",
        borderBottom: "1px solid rgba(59,130,246,0.12)",
        display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
        backdropFilter: "blur(12px)",
      }}>
        <button
          onClick={onBack}
          style={{
            background: "var(--surface-2)", border: "1px solid var(--border)",
            color: "var(--text-1)", borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600,
          }}
          onMouseEnter={e => { e.target.style.borderColor = "rgba(59,130,246,0.4)"; e.target.style.color = "#60A5FA"; }}
          onMouseLeave={e => { e.target.style.borderColor = "var(--border)"; e.target.style.color = "var(--text-1)"; }}
        >← Back</button>
        <span style={{ color: "var(--text-1)", fontSize: 12, fontWeight: 700 }}>Run Detail</span>
        <span style={{ color: "#06B6D4", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>{log.runId}</span>
        <StatusBadge status={log.status} />
        {durationLabel && (
          <span style={{ marginLeft: "auto", color: "var(--text-3)", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
            {durationLabel}
          </span>
        )}
        {onClose && (
          <button
            onClick={onClose}
            title="Close"
            style={{
              marginLeft: durationLabel ? 8 : "auto",
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--text-3)", fontSize: 16, lineHeight: 1, padding: "0 2px",
              display: "flex", alignItems: "center",
              transition: "color 0.12s",
            }}
            onMouseEnter={e => e.currentTarget.style.color = "#EF4444"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--text-3)"}
          >×</button>
        )}
      </div>

      {/* Body */}
      <div ref={containerRef} style={{
        flex: 1, overflow: "auto", background: "var(--bg-app)",
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11, lineHeight: 1.65,
      }}>
        {loadingLines ? (
          <div style={{ padding: 32, color: "var(--text-3)", textAlign: "center" }}>Loading logs…</div>
        ) : logLines && logLines.length > 0 ? (
          /* ── Real Camel log lines ── */
          <div style={{ padding: "12px 0" }}>
            {logLines.map((line, i) => (
              <div key={i} style={{
                display: "flex", gap: 0,
                padding: "1px 0",
                background: line.includes(" ERROR ") || line.includes("— ERROR") || line.includes("failed")
                  ? "rgba(239,68,68,0.06)" : "transparent",
              }}>
                <span style={{
                  width: 42, flexShrink: 0, textAlign: "right", paddingRight: 12,
                  color: "var(--text-3)", userSelect: "none", fontSize: 10,
                }}>{i + 1}</span>
                <span style={lineStyle(line)}>{line}</span>
              </div>
            ))}
          </div>
        ) : (
          /* ── Fallback: node step list ── */
          <div style={{ padding: "16px 20px" }}>
            <div style={{ color: "#60A5FA", fontWeight: 700, marginBottom: 16 }}>
              [{formatRunDateTime(log.runDateTime)}] Starting — {log.workflowName}
            </div>
            {steps.length > 0 ? steps.map((step, i) => (
              <div key={step.nodeId || i} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "5px 0", borderBottom: "1px solid var(--surface-2)",
              }}>
                <span style={{ width: 22, textAlign: "right", color: "var(--text-3)", fontSize: 10 }}>{i + 1}</span>
                <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                  background: isSuccess ? "#10B981" : "#64748B",
                  boxShadow: isSuccess ? "0 0 5px #10B981" : "none" }} />
                <span style={{ color: "var(--text-1)", minWidth: 90 }}>{step.nodeName}</span>
                <span style={{ color: "var(--text-3)", fontSize: 10 }}>{step.nodeType}</span>
              </div>
            )) : (
              <div style={{ color: "var(--text-3)" }}>No execution data — rebuild and redeploy the workflow, then run again.</div>
            )}
            {log.error && (
              <div style={{ margin: "12px 0", padding: "8px 12px", background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)", borderRadius: 5, color: "#EF4444" }}>
                {log.error}
              </div>
            )}
            <div style={{ marginTop: 16, fontWeight: 700, color: isSuccess ? "#10B981" : "#EF4444" }}>
              [{formatRunDateTime(log.runDateTime)}] {isSuccess ? "Completed successfully" : "FAILED"}
              {durationLabel ? ` — ${durationLabel}` : ""}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


function ValidationPanel({ issues, onClose }) {
  const allGood = issues.length === 0;
  const accent = allGood ? "#10B981" : "#F59E0B";

  useEffect(() => {
    if (!allGood) return;
    const t = setTimeout(onClose, 1000);
    return () => clearTimeout(t);
  }, [allGood]);
  return (
    <div style={{
      position: "absolute", top: 12, right: 12, zIndex: 1000,
      background: "var(--bg-panel)", border: `1px solid ${accent}40`,
      borderRadius: 10, width: 320, maxHeight: 420, display: "flex", flexDirection: "column",
      boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${accent}18`,
      backdropFilter: "blur(16px)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: `1px solid ${accent}20`,
        background: `${accent}08`, borderRadius: "10px 10px 0 0",
      }}>
        <span style={{ fontWeight: 700, fontSize: 11, color: accent, letterSpacing: "0.03em" }}>
          {allGood ? "✓ All nodes configured" : `⚠ ${issues.length} node${issues.length > 1 ? "s" : ""} need config`}
        </span>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--text-1)", cursor: "pointer", fontSize: 16, lineHeight: 1, transition: "color 0.12s" }}
          onMouseEnter={e => e.target.style.color = "#EF4444"}
          onMouseLeave={e => e.target.style.color = "var(--text-4)"}
        >×</button>
      </div>

      {!allGood && (
        <div style={{ overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
          {issues.map((issue) => (
            <div key={issue.nodeId} style={{ background: "rgba(245,158,11,0.06)", borderRadius: 7, padding: "8px 10px", border: "1px solid rgba(245,158,11,0.18)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-1)", marginBottom: 4 }}>
                {issue.nodeName}
                <span style={{ marginLeft: 6, fontSize: 10, color: "var(--text-2)", fontWeight: 400, fontFamily: "'JetBrains Mono', monospace" }}>{issue.nodeType}</span>
              </div>
              {issue.errors.map((err, i) => (
                <div key={i} style={{ fontSize: 11, color: "#EF4444", display: "flex", alignItems: "flex-start", gap: 5 }}>
                  <span style={{ flexShrink: 0 }}>•</span><span>{err}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
