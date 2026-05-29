import { Handle, Position } from "@xyflow/react";

export default function ErrorScopeNode({ data }) {
    return (
        <div
            className={`error-scope ${data?.isExecuting ? "executing" : ""}`}
            style={{ width: "100%", height: "100%", position: "relative" }}
        >
            <div className="error-scope-header">
                {data?.name || "Error Handler"}
            </div>
            <div className="error-scope-body">
                Drop nodes here - runs on error
            </div>
            <Handle type="target" position={Position.Left} />
            <Handle type="source" position={Position.Right} />
        </div>
    );
}
