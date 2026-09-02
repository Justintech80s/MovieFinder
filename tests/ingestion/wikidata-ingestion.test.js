import assert from 'node:assert/strict';
import test from 'node:test';

import { createWikidataIngestionService } from '../../lib/ingestion/wikidata-ingestion.js';

function fixtureEntity(id, claims = {}) {
  return { id, labels: { en: { value: id } }, claims };
}

const itemClaim = qid => [{ mainsnak: { datavalue: { value: { id: qid } } } }];

function createHarness({ failOnce = false, checkpoint = {} } = {}) {
  const storedEntities = new Map();
  const storedRelations = new Map();
  const sources = [];
  const mirrors = [];
  const job = { id: 'job-1', status: 'running', checkpoint, stats: {} };
  let shouldFail = failOnce;

  const client = {
    async fetchEntities(qids) {
      const entities = {};
      for (const qid of qids) {
        if (qid === 'Q1') entities.Q1 = fixtureEntity('Q1', { P31: itemClaim('Q11424'), P161: itemClaim('Q2') });
        if (qid === 'Q2') entities.Q2 = fixtureEntity('Q2', { P31: itemClaim('Q5') });
      }
      return { entities };
    }
  };

  const normalizer = ({ entities, retrievedAt }) => {
    const normalized = Object.values(entities).map(entity => ({
      canonicalKey: `wikidata:${entity.id}`,
      entityType: entity.id === 'Q1' ? 'Movie' : 'Person',
      name: entity.id,
      properties: {},
      source: { source: 'wikidata', externalId: entity.id, retrievedAt }
    }));
    const relations = entities.Q1 ? [{
      fromCanonicalKey: 'wikidata:Q2', toCanonicalKey: 'wikidata:Q1', relationType: 'ACTED_IN',
      properties: {}, confidence: 1,
      source: { source: 'wikidata', externalId: 'Q1', retrievedAt }
    }] : [];
    return { entities: normalized, relations, skipped: 0 };
  };

  const repository = {
    async createOrResumeJob() { return job; },
    async upsertEntity(entity) {
      if (shouldFail) { shouldFail = false; throw new Error('database unavailable'); }
      const saved = { id: entity.canonicalKey, ...entity };
      storedEntities.set(entity.canonicalKey, saved);
      return saved;
    },
    async upsertEntitySource(id, source) { sources.push(['entity', id, source.externalId]); },
    async upsertRelation(relation) {
      const key = `${relation.fromCanonicalKey}|${relation.relationType}|${relation.toCanonicalKey}`;
      const saved = { id: key, ...relation };
      storedRelations.set(key, saved);
      return saved;
    },
    async upsertRelationSource(id, source) { sources.push(['relation', id, source.externalId]); },
    async mirrorLegacyEntity(entity) { mirrors.push(['entity', entity.canonicalKey]); },
    async mirrorLegacyRelation(relation) { mirrors.push(['relation', relation.relationType]); },
    async updateJobCheckpoint(id, patch) { Object.assign(job, patch); return job; }
  };

  return { client, normalizer, repository, job, storedEntities, storedRelations, sources, mirrors };
}

test('seed ingestion persists seed and linked cinema entities with provenance', async () => {
  const h = createHarness();
  const service = createWikidataIngestionService({
    client: h.client, normalizer: h.normalizer, repository: h.repository,
    now: () => new Date('2026-09-02T09:00:00Z')
  });

  const result = await service.ingestWikidataSeed('Q1', { maxLinkedEntities: 10, batchSize: 10 });

  assert.equal(result.status, 'completed');
  assert.equal(h.storedEntities.size, 2);
  assert.equal(h.storedRelations.size, 1);
  assert.deepEqual(new Set(h.job.checkpoint.processedQids), new Set(['Q1', 'Q2']));
  assert.equal(h.job.stats.entitiesStored, 2);
  assert.equal(h.job.stats.relationsStored, 1);
  assert.ok(h.sources.length >= 3);
  assert.ok(h.mirrors.some(entry => entry[1] === 'ACTED_IN'));
});

test('seed ingestion resumes without reprocessing checkpointed QIDs', async () => {
  const h = createHarness({ checkpoint: { processedQids: ['Q1'] } });
  const requested = [];
  const original = h.client.fetchEntities;
  h.client.fetchEntities = async qids => { requested.push(...qids); return original(qids); };
  const service = createWikidataIngestionService({ client: h.client, normalizer: h.normalizer, repository: h.repository });

  await service.ingestWikidataSeed('Q1');
  assert.ok(!requested.includes('Q1'));
});

test('seed ingestion records failure without advancing checkpoint for failed batch', async () => {
  const h = createHarness({ failOnce: true });
  const service = createWikidataIngestionService({ client: h.client, normalizer: h.normalizer, repository: h.repository });

  await assert.rejects(service.ingestWikidataSeed('Q1'), /database unavailable/);
  assert.equal(h.job.status, 'failed');
  assert.deepEqual(h.job.checkpoint?.processedQids || [], []);
  assert.match(h.job.error, /database unavailable/);
});
