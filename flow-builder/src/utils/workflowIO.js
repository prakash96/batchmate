// EXPORT
export function exportWorkflow(nodes, edges) {
  const data = {
    version: 1,
    nodes,
    edges
  };

  const json = JSON.stringify(data, null, 2);

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "workflow.json";
  a.click();

  URL.revokeObjectURL(url);
}

export function exportGrid(rowData) {
  const data = {
    version: 1,
    rows: rowData
  };

  const json = JSON.stringify(data, null, 2);

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "test-grid.json";
  a.click();

  URL.revokeObjectURL(url);
}

// IMPORT
export function importWorkflow(file, setNodes, setEdges) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);

      if (!data.nodes || !data.edges) {
        throw new Error("Invalid file format");
      }

      // reset first (important for ReactFlow)
      setNodes([]);
      setEdges([]);

      setTimeout(() => {
        setNodes(data.nodes);
        setEdges(data.edges);

        console.log(useWorkflowStore.getState());
      }, 0);

    } catch (err) {
      console.error(err);
      alert("Invalid workflow file");
    }
  };

  reader.readAsText(file);
}