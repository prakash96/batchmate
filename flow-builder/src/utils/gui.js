export function startResize(e, nodeId, updateNodeSize, setResizing) {
  setResizing(true);

  const startX = e.clientX;
  const startY = e.clientY;

  const nodeEl = document.querySelector(`[data-id="${nodeId}"]`);
  const rect = nodeEl?.getBoundingClientRect();

  const startWidth = rect.width;
  const startHeight = rect.height;

  //  KEY FIX: capture pointer so ReactFlow cannot steal it
  const target = e.currentTarget;
  target.setPointerCapture(e.pointerId);

  function onMove(ev) {
    const newWidth = Math.max(150, startWidth + (ev.clientX - startX));
    const newHeight = Math.max(100, startHeight + (ev.clientY - startY));

  }

  function onUp(ev) {
    setResizing(false);

    target.releasePointerCapture(ev.pointerId);

    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}