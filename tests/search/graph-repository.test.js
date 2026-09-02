import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphRepository } from '../../lib/search/graph-repository.js';
import { createGraphStore } from '../../lib/search/graph-store.js';

test('graph repository supports node and edge upserts with metadata', async () => {
  const store = createGraphStore();
  const repo = createGraphRepository(store);

  await repo.upsertNode({ id: 'person:gene-hackman', type: 'Person', name: 'Gene Hackman', metadata: { source: 'test' } });
  await repo.upsertNode({ id: 'movie:conversation', type: 'Movie', title: 'The Conversation' });
  await repo.upsertEdge({ from: 'person:gene-hackman', to: 'movie:conversation', type: 'ACTED_IN', metadata: { confidence: 0.99 } });

  assert.deepEqual(await repo.getNode('person:gene-hackman'), {
    id: 'person:gene-hackman',
    type: 'Person',
    name: 'Gene Hackman',
    metadata: { source: 'test' }
  });
  const neighbors = await repo.neighbors('person:gene-hackman', { direction: 'out' });
  assert.equal(neighbors.length, 1);
  assert.deepEqual(neighbors[0].metadata, { confidence: 0.99 });
});

test('graph repository finds and explains directed paths', async () => {
  const repo = createGraphRepository(createGraphStore());
  await repo.upsertNode({ id: 'person:a', type: 'Person' });
  await repo.upsertNode({ id: 'movie:b', type: 'Movie' });
  await repo.upsertNode({ id: 'director:c', type: 'Person' });
  await repo.upsertEdge({ from: 'person:a', to: 'movie:b', type: 'ACTED_IN' });
  await repo.upsertEdge({ from: 'movie:b', to: 'director:c', type: 'DIRECTED_BY' });

  assert.deepEqual(await repo.findPath('person:a', 'director:c'), {
    nodes: ['person:a', 'movie:b', 'director:c'],
    edges: ['ACTED_IN', 'DIRECTED_BY']
  });
  assert.deepEqual(await repo.explainPath('person:a', 'director:c'), {
    nodes: ['person:a', 'movie:b', 'director:c'],
    edges: ['ACTED_IN', 'DIRECTED_BY']
  });
});

test('graph repository rejects incomplete adapters', () => {
  assert.throws(() => createGraphRepository({}), /adapter must implement/i);
});
