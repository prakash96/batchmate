import { AgGridReact } from "ag-grid-react";
import { useMemo } from "react";
import { useWorkflowStore } from "../../store/workflowStore";
import { createDefaultSections } from "../../utils/defaultSections";

export default function WorkflowGrid() {
    const {
        workflows,
        setWorkflows,
        expandedRowId,
        setExpandedRowId,
        loadWorkflow
    } = useWorkflowStore();

    function addWorkflow() {
        const newRow = {
            id: crypto.randomUUID(),
            name: "New workflow",
            inputBody: {},
            inputHeaders: {},
            workflow: { nodes: createDefaultSections(), edges: [] }
        };
        setWorkflows(prev => [...(Array.isArray(prev) ? prev : []), newRow]);
    }

    function removeWorkflow(id) {
        setWorkflows(prev => prev.filter(r => r.id !== id));
    }

    const firstId = workflows[0]?.id;

    const columnDefs = useMemo(() => [
        {
            headerName: "Workflow",
            field: "name",
            flex: 1,
            editable: true,
            onCellValueChanged: (params) => {
                setWorkflows(prev =>
                    prev.map(r => r.id === params.data.id ? { ...r, name: params.newValue } : r)
                );
            }
        },
        {
            headerName: "",
            field: "_actions",
            width: 40,
            sortable: false,
            filter: false,
            resizable: false,
            cellRenderer: (params) => {
                if (params.data.id === firstId) return null;
                return (
                    <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
                        <button
                            title="Remove workflow"
                            onClick={(e) => { e.stopPropagation(); removeWorkflow(params.data.id); }}
                            style={btnStyle("#dc2626")}
                        >-</button>
                    </div>
                );
            },
        },
    ], [firstId]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>

            {/*  Header  */}
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 10px",
                borderBottom: "1px solid #e0e0e0",
                background: "#f8f9fb",
                flexShrink: 0
            }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", letterSpacing: "0.03em" }}>
                    WORKFLOWS
                </span>
                <button
                    onClick={addWorkflow}
                    title="Add workflow"
                    style={{
                        padding: "2px 10px",
                        fontSize: 11,
                        background: "#2d6cdf",
                        color: "#fff",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                        fontWeight: 600
                    }}
                >+ Add</button>
            </div>

            {/*  Grid  */}
            <div className="ag-theme-quartz" style={{ flex: 1 }}>
                <AgGridReact
                    rowData={workflows}
                    columnDefs={columnDefs}
                    defaultColDef={{ resizable: true, sortable: false, filter: false }}
                    getRowStyle={(params) => {
                        if (params.data.id === expandedRowId)
                            return { background: "#eaf3ff", borderLeft: "3px solid #2d6cdf" };
                    }}
                    onRowClicked={(params) => {
                        setExpandedRowId(params.data.id);
                        loadWorkflow(params.data.id);
                    }}
                />
            </div>
        </div>
    );
}

const btnStyle = (bg) => ({
    width: 22,
    height: 22,
    padding: 0,
    fontSize: 14,
    lineHeight: 1,
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
});
