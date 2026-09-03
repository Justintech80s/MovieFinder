import test from 'node:test';
import assert from 'node:assert/strict';
import { createWikidataIngestionService } from '../../lib/ingestion/wikidata-ingestion.js';

function makeHarness() {
  const job = { id: 'job-1', checkpoint: {}, stats: {} };
  return {
    job,
    client: { async fetchEntities() { return { entities: { Q1: { id: 'Q1' } } }; } },
    normalizer: () => ({
      entities: [{ canonicalKey: 'wikidata:Q1', entityType: 'Movie', name: 'Q1', properties: {}, source: { source: 'wikidata', externalId: 'Q1' } }],
      relations: [], skipped: 0
    }),
    repository: {
      async createOrResumeJob() { return job; },
      async upsertEntity(entity) { return { id: entity.canonicalKey, ...entity }; },
      async upsertEntitySource() {},
      async mirrorLegacyEntity() {},
      async upsertRelation() { return {}; },
      async upsertRelationSource() {},
      async mirrorLegacyRelation() {},
      async updateJobCheckpoint(id, patch) { Object.assign(job, patch); return job; }
    }
  };
}

test('saved Wikidata graph batch invokes optional semantic sync', async () => {
  const h = makeHarness();
  const calls = [];
  const service = createWikidataIngestionService({
    client: h.client, normalizer: h.normalizer, repository: h.repository,
    semanticSync: async normalized => { calls.push(normalized); }
  });
  const result = await service.ingestWikidataSeed('Q1', { maxLinkedEntities: 0 });
  assert.equal(result.status, 'completed');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].entities[0].canonicalKey, 'wikidata:Q1');
});

test('semantic sync errors do not fail canonical Wikidata ingestion', async () => {
  const h = makeHarness();
  const service = createWikidataIngestionService({
    client: h.client, normalizer: h.normalizer, repository: h.repository,
    semanticSync: async () => { throw new Error('semantic sync failed'); }
  });
  const result = await service.ingestWikidataSeed('Q1', { maxLinkedEntities: 0 });
  assert.equal(result.status, 'completed');
});
