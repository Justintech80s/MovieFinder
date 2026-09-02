import assert from 'node:assert/strict';
import test from 'node:test';

import { createPersistentGraphStore } from '../../lib/search/persistent-graph-store.js';

function createFakeRepository() {
  const nodes = new Map();
  const edges = new Map();
  let nextId = 1;
  return {
    async upsertEntity(entity) {
      const existing = nodes.get(entity.canonicalKey);
      const stored = { id: existing?.id || `db-${nextId++}`, canonical_key: entity.canonicalKey, entity_type: entity.entityType, name: entity.name, description: entity.description || null, properties: entity.properties || {} };
      nodes.set(entity.canonicalKey, stored);
      return stored;
    },
    async upsertRelation(relation) {
      const from = nodes.get(relation.fromCanonicalKey);
      const to = nodes.get(relation.toCanonicalKey);
      if (!from || !to) throw new Error('graph edge references unknown node');
      const key = `${from.id}|${relation.relationType}|${to.id}`;
      const stored = { id: key, from_entity_id: from.id, to_entity_id: to.id, relation_type: relation.relationType, properties: relation.properties || {}, confidence: relation.confidence };
      edges.set(key, stored);
      return stored;
    },
    async getEntity(id) { return nodes.get(id) || [...nodes.values()].find(node => node.id === id) || null; },
    async listEntities() { return [...nodes.values()]; },
    async listRelations() { return [...edges.values()]; },
    async listOutgoingRelations(id, type) { return [...edges.values()].filter(edge => edge.from_entity_id === id && (!type || edge.relation_type === type)); },
    async getRelationSources() { return []; }
  };
}

test('persistent graph store writes and reads nodes and directed edges', async () => {
  const graph = createPersistentGraphStore({ repository: createFakeRepository() });
  await graph.addNode({ id: 'wikidata:Q1', type: 'Person', name: 'Example Person' });
  await graph.addNode({ id: 'wikidata:Q2', type: 'Movie', title: 'Example Film' });
  await graph.addEdge({ from: 'wikidata:Q1', to: 'wikidata:Q2', type: 'ACTED_IN' });
  assert.equal((await graph.nodes()).length, 2);
  assert.equal((await graph.edges()).length, 1);
  assert.deepEqual(await graph.neighbors('wikidata:Q1', { direction: 'out' }), [{ from: 'wikidata:Q1', to: 'wikidata:Q2', type: 'ACTED_IN', properties: {}, confidence: undefined }]);
  assert.deepEqual(await graph.explainPath('wikidata:Q1', 'wikidata:Q2'), { nodes: ['wikidata:Q1', 'wikidata:Q2'], edges: ['ACTED_IN'] });
});

test('persistent graph store rejects edges that reference unknown nodes', async () => {
  const graph = createPersistentGraphStore({ repository: createFakeRepository() });
  await graph.addNode({ id: 'wikidata:Q1', type: 'Person' });
  await assert.rejects(graph.addEdge({ from: 'wikidata:Q1', to: 'wikidata:Q404', type: 'ACTED_IN' }), /unknown node/i);
});

test('persistent graph traversal is bounded by depth and edge type', async () => {
  const graph = createPersistentGraphStore({ repository: createFakeRepository() });
  for (const node of [{ id: 'A', type: 'Person' }, { id: 'B', type: 'Movie' }, { id: 'C', type: 'Person' }, { id: 'D', type: 'Movie' }]) await graph.addNode(node);
  await graph.addEdge({ from: 'A', to: 'B', type: 'ACTED_IN' });
  await graph.addEdge({ from: 'B', to: 'C', type: 'DIRECTED_BY' });
  await graph.addEdge({ from: 'C', to: 'D', type: 'ACTED_IN' });
  assert.deepEqual((await graph.traverse('A', { maxDepth: 1 })).map(({ from, to, type }) => ({ from, to, type })), [{ from: 'A', to: 'B', type: 'ACTED_IN' }]);
  assert.deepEqual((await graph.traverse('A', { maxDepth: 3, edgeTypes: ['ACTED_IN'] })).map(({ from, to, type }) => ({ from, to, type })), [{ from: 'A', to: 'B', type: 'ACTED_IN' }]);
});

test('persistent graph store translates graph nodes and edges to the durable repository contract', async () => {
  const calls = [];
  const repository = createFakeRepository();
  const originalEntity = repository.upsertEntity;
  const originalRelation = repository.upsertRelation;
  repository.upsertEntity = async entity => { calls.push(['entity', entity]); assert.ok(entity.canonicalKey); assert.ok(entity.entityType); return originalEntity(entity); };
  repository.upsertRelation = async relation => { calls.push(['relation', relation]); assert.equal(relation.fromCanonicalKey, 'wikidata:Q1'); assert.equal(relation.toCanonicalKey, 'wikidata:Q2'); assert.equal(relation.relationType, 'ACTED_IN'); return originalRelation(relation); };
  const graph = createPersistentGraphStore({ repository });
  await graph.addNode({ id: 'wikidata:Q1', type: 'Person', name: 'Actor' });
  await graph.addNode({ id: 'wikidata:Q2', type: 'Movie', title: 'Film' });
  await graph.addEdge({ from: 'wikidata:Q1', to: 'wikidata:Q2', type: 'ACTED_IN' });
  assert.equal(calls.filter(([kind]) => kind === 'entity').length, 2);
  assert.equal(calls.filter(([kind]) => kind === 'relation').length, 1);
});
