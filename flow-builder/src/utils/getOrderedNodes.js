export function getOrderedNodes(nodes, edges) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // 1. Build adjacency list
  const graph = new Map();
  const inDegree = new Map();

  nodes.forEach(n => {
    graph.set(n.id, []);
    inDegree.set(n.id, 0);
  });

  edges.forEach(e => {
    graph.get(e.source).push(e.target);
    inDegree.set(e.target, inDegree.get(e.target) + 1);
  });

  // 2. Find start nodes (no incoming edges)
  const queue = [];

  for (const [id, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(id);
  }

  const ordered = [];

  // 3. BFS Topological Sort
  while (queue.length) {
    const current = queue.shift();
    ordered.push(nodeMap.get(current));

    for (const neighbor of graph.get(current)) {
      inDegree.set(neighbor, inDegree.get(neighbor) - 1);

      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }

  return ordered;
}