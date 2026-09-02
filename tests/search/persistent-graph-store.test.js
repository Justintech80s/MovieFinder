import assert from 'node:assert/strict';
import test from 'node:test';

import { createPersistentGraphStore } from '../../lib/search/persistent-graph-store.js';

function createFakeRepository() {
  const nodes = new Map();
  const edges = new Map();
  const key = edge => `${edge.from}|${edge.type}|${edge.to}`;

  return {
    async upsertEntity(node) {
      const existing = nodes.get(node.id) || {};
      const stored = { ...existing, ...node };
      nodes.set(stored.id, stored);
      return stored;
    },
    async upsertRelation(edge) {
      if (!nodes.has(edge.from) || !nodes.has(edge.to)) throw new Error('graph edge references unknown node');
      const stored = { ...edge };
      edges.set(key(stored), stored);
      return stored;
    },
    async getEntity(id) { return nodes.get(id) || null; },
    async listEntities() { return [...nodes.values()]; },
    async listRelations() { return [...edges.values()]; },
    async listOutgoingRelations(id, type) { return [...edges.values()].filter(edge => edge.from === id && (!type || edge.type === type)); },
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
  assert.deepEqual(await graph.neighbors('wikidata:Q1', { direction: 'out' }), [{ from: 'wikidata:Q1', to: 'wikidata:Q2', type: 'ACTED_IN' }]);
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
  assert.deepEqual(await graph.traverse('A', { maxDepth: 1 }), [{ from: 'A', to: 'B', type: 'ACTED_IN' }]);
  assert.deepEqual(await graph.traverse('A', { maxDepth: 3, edgeTypes: ['ACTED_IN'] }), [{ from: 'A', to: 'B', type: 'ACTED_IN' }]);
});

test('persistent graph store translates graph nodes and edges to the durable repository contract', async () => {
  const calls = [];
  const entities = new Map();
  const relations = [];
  const repository = {
    async upsertEntity(entity) {
      calls.push(['entity', entity]);
      assert.ok(entity.canonicalKey);
      assert.ok(entity.entityType);
      const stored = { id: `db:${entity.canonicalKey}`, canonical_key: entity.canonicalKey, entity_type: entity.entityType, name: entity.name };
      entities.set(entity.canonicalKey, stored);
      return stored;
    },
    async getEntity(key) { return entities.get(key) || null; },
    async upsertRelation(relation) {
      calls.push(['relation', relation]);
      assert.equal(relation.fromCanonicalKey, 'wikidata:Q1');
      assert.equal(relation.toCanonicalKey, 'wikidata:Q2');
      assert.equal(relation.relationType, 'ACTED_IN');
      const stored = { id: 'rel:1', from_entity_id: 'db:wikidata:Q1', to_entity_id: 'db:wikidata:Q2', relation_type: 'ACTED_IN' };
      relations.push(stored);
      return stored;
    },
    async listEntities() { return [...entities.values()]; },
    async listRelations() { return relations; },
    async listOutgoingRelations() { return relations; }
  };
  const graph = createPersistentGraphStore({ repository });
  await graph.addNode({ id: 'wikidata:Q1', type: 'Person', name: 'Actor' });
  await graph.addNode({ id: 'wikidata:Q2', type: 'Movie', title: 'Film' });
  await graph.addEdge({ from: 'wikidata:Q1', to: 'wikidata:Q2', type: 'ACTED_IN' });
  assert.equal(calls.filter(([kind]) => kind === 'entity').length, 2);
  assert.equal(calls.filter(([kind]) => kind === 'relation').length, 1);
});
