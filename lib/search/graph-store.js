const edgeKey = edge => `${edge.from}|${edge.type}|${edge.to}`;

export function createGraphStore() {
  const nodeMap = new Map();
  const edgeMap = new Map();

  function addNode(node) {
    if (!node?.id || !node?.type) throw new TypeError('graph node requires id and type');
    nodeMap.set(node.id, { ...(nodeMap.get(node.id) || {}), ...node });
    return nodeMap.get(node.id);
  }

  function addEdge(edge) {
    if (!edge?.from || !edge?.to || !edge?.type) throw new TypeError('graph edge requires from, to, and type');
    if (!nodeMap.has(edge.from) || !nodeMap.has(edge.to)) throw new Error('graph edge references unknown node');
    edgeMap.set(edgeKey(edge), { ...edge });
    return edgeMap.get(edgeKey(edge));
  }

  function neighbors(id, { type, direction = 'both' } = {}) {
    return [...edgeMap.values()].filter(edge => {
      const touches = direction === 'out'
        ? edge.from === id
        : direction === 'in'
          ? edge.to === id
          : edge.from === id || edge.to === id;
      return touches && (!type || edge.type === type);
    });
  }

  function explainPath(fromId, toId, { maxDepth = 4 } = {}) {
    if (!nodeMap.has(fromId) || !nodeMap.has(toId)) return null;
    const queue = [{ id: fromId, nodes: [fromId], edges: [] }];
    const seen = new Set([fromId]);
    while (queue.length) {
      const current = queue.shift();
      if (current.id === toId) return { nodes: current.nodes, edges: current.edges };
      if (current.edges.length >= maxDepth) continue;
      for (const edge of neighbors(current.id, { direction: 'out' })) {
        if (seen.has(edge.to)) continue;
        seen.add(edge.to);
        queue.push({ id: edge.to, nodes: [...current.nodes, edge.to], edges: [...current.edges, edge.type] });
      }
    }
    return null;
  }

  function traverse(startId, { maxDepth = 2, edgeTypes, maxResults = 100 } = {}) {
    if (!nodeMap.has(startId)) return [];
    const matches = [];
    const queue = [{ id: startId, depth: 0 }];
    const seen = new Set([startId]);
    while (queue.length && matches.length < maxResults) {
      const current = queue.shift();
      if (current.depth >= maxDepth) continue;
      for (const edge of neighbors(current.id, { direction: 'out' })) {
        if (edgeTypes?.length && !edgeTypes.includes(edge.type)) continue;
        matches.push(edge);
        if (matches.length >= maxResults) break;
        if (!seen.has(edge.to)) {
          seen.add(edge.to);
          queue.push({ id: edge.to, depth: current.depth + 1 });
        }
      }
    }
    return matches;
  }

  return {
    addNode,
    addEdge,
    getNode: id => nodeMap.get(id) || null,
    nodes: () => [...nodeMap.values()],
    edges: () => [...edgeMap.values()],
    neighbors,
    traverse,
    explainPath
  };
}
