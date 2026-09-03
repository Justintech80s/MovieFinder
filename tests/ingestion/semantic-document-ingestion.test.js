import test from 'node:test';
import assert from 'node:assert/strict';

import { syncSemanticDocuments } from '../../lib/ingestion/semantic-document-ingestion.js';

const VECTOR = Array.from({ length: 1536 }, () => 0.02);
const MOVIE = {
  id: 'wikidata:Q1',
  type: 'Movie',
  label: 'Example',
  properties: { summary: 'A patient crime drama.', themes: ['loneliness'] }
};
const SOURCES = [{ entityId: 'wikidata:Q1', kind: 'wikidata', ref: 'Q1', url: 'https://www.wikidata.org/wiki/Q1' }];

function semanticStore({ pending = [] } = {}) {
  const calls = { upsert: [], pending: [], save: [] };
  return {
    calls,
    async upsertDocuments(rows) { calls.upsert.push(rows); return rows; },
    async documentsNeedingEmbedding(args) { calls.pending.push(args); return pending; },
    async saveEmbeddings(rows) { calls.save.push(rows); return rows; }
  };
}

test('unchanged semantic documents do not call the embedding provider when no rows are stale', async () => {
  const store = semanticStore({ pending: [] });
  let embedCalls = 0;
  const result = await syncSemanticDocuments({
    entities: [MOVIE], relations: [], sources: SOURCES, semanticStore: store,
    embeddingAdapter: { async embed() { embedCalls += 1; return { provider: 'test', model: 'embed-v1', dimensions: 1536, vectors: [VECTOR] }; } },
    embeddingModel: 'embed-v1', embeddingVersion: 'v1'
  });

  assert.equal(embedCalls, 0);
  assert.equal(result.embedded, 0);
  assert.equal(store.calls.upsert.length, 1);
  assert.equal(store.calls.upsert[0][0].sourceRef, 'Q1');
});

test('stale documents are embedded in bounded batches and saved with model metadata', async () => {
  const pending = Array.from({ length: 40 }, (_, index) => ({ id: `doc-${index}`, content: `text ${index}` }));
  const store = semanticStore({ pending });
  const batches = [];
  const adapter = {
    async embed({ texts }) {
      batches.push(texts);
      return { provider: 'test', model: 'embed-v2', dimensions: 1536, vectors: texts.map(() => VECTOR) };
    }
  };

  const result = await syncSemanticDocuments({
    entities: [MOVIE], relations: [], sources: SOURCES, semanticStore: store,
    embeddingAdapter: adapter, embeddingModel: 'embed-v2', embeddingVersion: 'v2'
  });

  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 32);
  assert.equal(store.calls.save[0].length, 32);
  assert.equal(store.calls.save[0][0].embeddingModel, 'embed-v2');
  assert.equal(store.calls.save[0][0].embeddingVersion, 'v2');
  assert.equal(result.embedded, 32);
});

test('embedding provider failure degrades without failing canonical ingestion or saving bad vectors', async () => {
  const store = semanticStore({ pending: [{ id: 'doc-1', content: 'text' }] });
  const result = await syncSemanticDocuments({
    entities: [MOVIE], relations: [], sources: SOURCES, semanticStore: store,
    embeddingAdapter: { async embed() { throw new Error('provider unavailable'); } },
    embeddingModel: 'embed-v1', embeddingVersion: 'v1'
  });

  assert.equal(result.degraded, true);
  assert.equal(result.embedded, 0);
  assert.equal(store.calls.save.length, 0);
});

test('missing semantic dependencies is a harmless no-op', async () => {
  const result = await syncSemanticDocuments({ entities: [MOVIE] });
  assert.deepEqual(result, { documents: 0, embedded: 0, degraded: false, skipped: true });
});
