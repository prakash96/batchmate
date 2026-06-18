import * as XLSX from 'xlsx';

const SKIP_TYPES    = new Set(['section', 'workflowcontainer', 'errorscope']);
const NODE_SPACING_X = 160;
const NODE_START_X   = 60;
const NODE_Y         = 110;

function getAllWorkflows(pkg) {
  return [
    ...(pkg.workflows || []),
    ...(pkg.packages  || []).flatMap(getAllWorkflows),
  ];
}

function getContentNodes(wf) {
  return (wf?.workflow?.nodes || [])
    .filter(n => !SKIP_TYPES.has(n.type))
    .sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));
}


// ── Export ────────────────────────────────────────────────────────────────────

export function exportPackageExcel(pkg, fileName) {
  const workflows  = getAllWorkflows(pkg);
  const allNodes   = workflows.map(getContentNodes);

  // Determine the global column sequence.
  // Walk each position 0, 1, 2 … and take the type from the first workflow
  // that has a node at that position.  This keeps the header stable even when
  // some workflows are shorter.
  const maxLen     = Math.max(0, ...allNodes.map(n => n.length));
  const colTypes   = [];          // raw type per column slot
  for (let i = 0; i < maxLen; i++) {
    for (const nodes of allNodes) {
      if (nodes[i]) { colTypes.push(nodes[i].type); break; }
    }
  }
  const header = ['Workflow Name', ...colTypes];

  const data = [header];
  for (let r = 0; r < workflows.length; r++) {
    const nodes = allNodes[r];
    const row   = [workflows[r].name || 'Untitled'];
    for (let i = 0; i < colTypes.length; i++) {
      row.push(nodes[i] ? JSON.stringify(nodes[i].data) : '');
    }
    data.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Column widths: workflow name wider, node-config columns wide for JSON
  ws['!cols'] = [{ wch: 30 }, ...colTypes.map(() => ({ wch: 40 }))];

  // Bold header row
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) ws[addr].s = { font: { bold: true } };
  }

  // Wrap text in data cells so JSON is readable
  for (let rr = 1; rr <= range.e.r; rr++) {
    for (let c = 1; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: rr, c });
      if (ws[addr]) ws[addr].s = { alignment: { wrapText: true, vertical: 'top' } };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Workflows');
  XLSX.writeFile(wb, fileName || `${pkg.name || 'package'}.xlsx`);
}

// ── Import ────────────────────────────────────────────────────────────────────

export function parseExcelFile(file, nodeMetaMap = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (rows.length < 2) { resolve([]); return; }

        const header = rows[0];
        const colTypes = header.slice(1).map(h => String(h));

        const parsed = [];
        for (let r = 1; r < rows.length; r++) {
          const row    = rows[r];
          const wfName = String(row[0] || '').trim();
          if (!wfName) continue;

          const nodeEntries = [];
          for (let c = 0; c < colTypes.length; c++) {
            const cell = String(row[c + 1] || '').trim();
            if (!cell) continue;           // empty = no node at this position

            const type = colTypes[c];
            const meta = nodeMetaMap[type] || {};
            let   data = {};
            try { data = JSON.parse(cell); } catch {
              // If the cell isn't valid JSON treat it as the node name
              data = { name: cell };
            }
            // Merge with metadata defaults so any missing fields are filled in
            nodeEntries.push({ type, data: { ...(meta.defaultData || {}), ...data } });
          }

          const { nodes, edges } = buildNodesAndEdges(nodeEntries, nodeMetaMap);
          parsed.push({ name: wfName, nodes, edges });
        }

        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function buildNodesAndEdges(nodeEntries, nodeMetaMap) {
  const containerWidth = Math.max(760, NODE_START_X + nodeEntries.length * NODE_SPACING_X + 100);

  const nodes = [
    {
      id:       'wc-processing',
      type:     'workflowcontainer',
      position: { x: 20, y: 0 },
      data:     { containerType: 'processing' },
      style:    { width: containerWidth, height: 300 },
      draggable: true,
      selectable: true,
      deletable:  false,
      zIndex:    -1,
    },
  ];
  const edges  = [];
  let   prevId = null;

  nodeEntries.forEach(({ type, data }, i) => {
    const meta = nodeMetaMap[type] || {};
    const id   = crypto.randomUUID();

    nodes.push({
      id,
      type,
      position: { x: NODE_START_X + i * NODE_SPACING_X, y: NODE_Y },
      data,
      style:    { width: meta.width || 58, height: meta.height || 58 },
      parentId: 'wc-processing',
      extent:   'parent',
      section:  'processing',
    });

    if (prevId) {
      edges.push({
        id:       `e-${prevId}-${id}`,
        source:   prevId,
        target:   id,
        animated: false,
        type:     'smoothstep',
        style:    { stroke: '#888' },
      });
    }
    prevId = id;
  });

  return { nodes, edges };
}
