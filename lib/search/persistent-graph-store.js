function requireRepository(repository) {
  if (!repository) throw new TypeError('persistent graph store requires repository');
  return repository;
}

function validateNode(node) {
  if (!node?.id || !node?.type) throw new TypeError('graph node requires id and type');
}

function validateEdge(edge) {
  if (!edge?.from || !edge?.to || !edge?.type) throw new TypeError('graph edge requires from, to, and type');
}

export function createPersistentGraphStore({ repository } = {}) {
  const repo = requireRepository(repository);

  async function addNode(node) {
    validateNode(node);
    return repo.upsertEntity(node);
  }

  async function addEdge(edge) {
    validateEdge(edge);
    const [from, to] = await Promise.all([
      repo.getEntity(edge.from),
      repo.getEntity(edge.to)
    ]);
    if (!from || !to) throw new Error('graph edge references unknown node');
    return repo.upsertRelation(edge);
  }

  async function getNode(id) {
    return repo.getEntity(id);
  }

  async function nodes() {
    return repo.listEntities();
  }

  async function edges() {
    return repo.listRelations();
  }

  async function neighbors(id, { type, direction = 'both' } = {}) {
    if (direction === 'out') return repo.listOutgoingRelations(id, type);

    const all = await repo.listRelations();
    return all.filter(edge => {
      const touches = direction === 'in'
        ? edge.to === id
        : edge.from === id || edge.to === id;
      return touches && (!type || edge.type === type);
    });
  }

  async function traverse(startId, { maxDepth = 2, edgeTypes, maxResults = 100 } = {}) {
    if (!(await repo.getEntity(startId))) return [];

    const matches = [];
    const queue = [{ id: startId, depth: 0 }];
    const seen = new Set([startId]);

    while (queue.length && matches.length < maxResults) {
      const current = queue.shift();
      if (current.depth >= maxDepth) continue;

      const outgoing = await repo.listOutgoingRelations(current.id);
      for (const edge of outgoing) {
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

  async function explainPath(fromId, toId, { maxDepth = 4 } = {}) {
    const [from, to] = await Promise.all([repo.getEntity(fromId), repo.getEntity(toId)]);
    if (!from || !to) return null;

    const queue = [{ id: fromId, nodes: [fromId], edges: [] }];
    const seen = new Set([fromId]);

    while (queue.length) {
      const current = queue.shift();
      if (current.id === toId) return { nodes: current.nodes, edges: current.edges };
      if (current.edges.length >= maxDepth) continue;

      for (const edge of await repo.listOutgoingRelations(current.id)) {
        if (seen.has(edge.to)) continue;
        seen.add(edge.to);
        queue.push({
          id: edge.to,
          nodes: [...current.nodes, edge.to],
          edges: [...current.edges, edge.type]
        });
      }
    }

    return null;
  }

  return {
    addNode,
    addEdge,
    getNode,
    nodes,
    edges,
    neighbors,
    traverse,
    explainPath
  };
}
