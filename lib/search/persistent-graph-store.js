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

function repositoryNode(node) {
  return {
    canonicalKey: node.id,
    entityType: node.type,
    name: node.name || node.title || node.id,
    description: node.description,
    properties: node.properties || {}
  };
}

function graphNode(row) {
  if (!row) return null;
  if (row.id && row.type) return row;
  return {
    id: row.canonical_key || row.canonicalKey,
    type: row.entity_type || row.entityType,
    name: row.name,
    description: row.description,
    properties: row.properties || {}
  };
}

function repositoryEdge(edge) {
  return {
    fromCanonicalKey: edge.from,
    toCanonicalKey: edge.to,
    relationType: edge.type,
    properties: edge.properties || {},
    confidence: edge.confidence
  };
}

async function graphEdges(repo, rows) {
  if (!rows?.length) return [];
  if (rows.every(row => row.from && row.to && row.type)) return rows;
  const entities = await repo.listEntities();
  const byDbId = new Map(entities.map(row => [row.id, row.canonical_key || row.canonicalKey || row.id]));
  return rows.map(row => ({
    from: row.from || byDbId.get(row.from_entity_id),
    to: row.to || byDbId.get(row.to_entity_id),
    type: row.type || row.relation_type,
    properties: row.properties || {},
    confidence: row.confidence
  }));
}

export function createPersistentGraphStore({ repository } = {}) {
  const repo = requireRepository(repository);

  async function addNode(node) {
    validateNode(node);
    const saved = await repo.upsertEntity(repositoryNode(node));
    return graphNode(saved);
  }

  async function addEdge(edge) {
    validateEdge(edge);
    const [from, to] = await Promise.all([repo.getEntity(edge.from), repo.getEntity(edge.to)]);
    if (!from || !to) throw new Error('graph edge references unknown node');
    const saved = await repo.upsertRelation(repositoryEdge(edge));
    return (await graphEdges(repo, [saved]))[0];
  }

  async function getNode(id) {
    return graphNode(await repo.getEntity(id));
  }

  async function nodes() {
    return (await repo.listEntities()).map(graphNode);
  }

  async function edges() {
    return graphEdges(repo, await repo.listRelations());
  }

  async function outgoing(id, type) {
    const entity = await repo.getEntity(id);
    if (!entity) return [];
    const lookupId = entity.canonical_key || entity.canonicalKey ? entity.id : id;
    return graphEdges(repo, await repo.listOutgoingRelations(lookupId, type));
  }

  async function neighbors(id, { type, direction = 'both' } = {}) {
    if (direction === 'out') return outgoing(id, type);
    const all = await edges();
    return all.filter(edge => {
      const touches = direction === 'in' ? edge.to === id : edge.from === id || edge.to === id;
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
      for (const edge of await outgoing(current.id)) {
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
      for (const edge of await outgoing(current.id)) {
        if (seen.has(edge.to)) continue;
        seen.add(edge.to);
        queue.push({ id: edge.to, nodes: [...current.nodes, edge.to], edges: [...current.edges, edge.type] });
      }
    }
    return null;
  }

  return { addNode, addEdge, getNode, nodes, edges, neighbors, traverse, explainPath };
}
