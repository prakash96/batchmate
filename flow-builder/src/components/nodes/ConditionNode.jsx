import { Handle, Position } from "@xyflow/react";

export default function ConditionNode({ data }) {
  return (
    <div className={`diamond-wrapper ${data?.isExecuting ? 'executing' : ''} ${data?.hasError ? 'error' : ''}`}>


      <div className="diamond">
        <div className="diamond-inner">
           {data?.name || "IF"}
        </div>
      </div>

      <Handle type="target" position={Position.Left} id="false" />
      <Handle type="source" position={Position.Right} id="true" />
      <Handle type="source" position={Position.Bottom} id="false" style={{
        bottom: -6,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#999"
      }} />

    </div>
  );
}