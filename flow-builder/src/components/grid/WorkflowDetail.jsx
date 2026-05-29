import FlowCanvas from "../canvas/FlowCanvas";
import { useWorkflowStore } from "../../store/workflowStore";

export default function WorkflowPanel({ layoutKey }) {
  const { workflows, expandedRowId } = useWorkflowStore();
  const row = workflows.find(t => t.id === expandedRowId);
  if (!row) return null;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <FlowCanvas
        key={row.id}
        initialNodes={row.nodes || []}
        expandedRowId={expandedRowId}
        layoutKey={layoutKey}
      />
    </div>
  );
}
