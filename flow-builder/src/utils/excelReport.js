import { BASE_URL } from "../config";

const NON_EXECUTABLE = new Set(['section', 'workflowcontainer', 'errorscope']);

function extractInput(workflow) {
  const nodes = (workflow?.workflow?.nodes || [])
    .filter(n => n.section === 'processing' && !NON_EXECUTABLE.has(n.type));
  if (!nodes.length) return '';
  nodes.sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));
  const first = nodes[0];
  if (first.type === 'setbody') {
    const expr = (first.data?.expression || first.data?.body || '').trim();
    return expr || 'setbody';
  }
  return first.data?.name || first.type;
}

export async function exportTestReport(tests, fileName = 'test-report.xlsx') {
  const payload = tests.map(wf => ({
    id:        wf.id,
    name:      wf.name || 'Unnamed',
    inputBody: extractInput(wf),
  }));

  const res = await fetch(`${BASE_URL}/workflows/report`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Report generation failed: ${res.status}`);

  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
