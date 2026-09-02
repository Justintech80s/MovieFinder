import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createCinemaGraphRepository } from '../../lib/ingestion/cinema-graph-repository.js';

const migrationPath = new URL('../../supabase/migrations/20260902_persistent_cinema_graph.sql', import.meta.url);

test('persistent cinema graph migration defines required durable structures', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  for (const table of ['cinema_entities','cinema_entity_sources','cinema_relations','cinema_relation_sources','cinema_ingestion_jobs']) {
    assert.match(sql, new RegExp(`create table if not exists ${table}`, 'i'));
  }
  assert.match(sql, /unique\s*\(source, external_id\)/i);
  assert.match(sql, /unique\s*\(from_entity_id, relation_type, to_entity_id\)/i);
  assert.match(sql, /pending.*running.*completed.*failed/is);
});

function createMemoryDb() {
  const tables = new Map();
  const ids = new Map();
  const table = name => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name);
  };
  const nextId = name => `${name}-${(ids.set(name, (ids.get(name) || 0) + 1), ids.get(name))}`;

  function from(name) {
    const filters = [];
    let payload;
    let mode = 'select';
    return {
      select() { return this; },
      eq(key, value) { filters.push([key, value]); return this; },
      maybeSingle() {
        const data = table(name).find(row => filters.every(([k,v]) => row[k] === v)) || null;
        return Promise.resolve({ data, error: null });
      },
      single() {
        if (mode === 'upsert') {
          const rows = table(name);
          const candidates = Array.isArray(payload) ? payload : [payload];
          let saved;
          for (const candidate of candidates) {
            const conflictSets = {
              cinema_entities: ['canonical_key'],
              cinema_entity_sources: ['source','external_id'],
              cinema_relations: ['from_entity_id','relation_type','to_entity_id'],
              cinema_relation_sources: ['relation_id','source','external_id'],
              people: ['source','external_id'],
              movies: ['source','external_id'],
              credits: ['person_id','movie_id','role']
            };
            const keys = conflictSets[name] || ['id'];
            const existing = rows.find(row => keys.every(k => row[k] === candidate[k]));
            if (existing) Object.assign(existing, candidate);
            else rows.push(saved = { id: candidate.id || nextId(name), ...candidate });
            saved = existing || saved;
          }
          return Promise.resolve({ data: saved, error: null });
        }
        if (mode === 'update') {
          const rows = table(name).filter(row => filters.every(([k,v]) => row[k] === v));
          rows.forEach(row => Object.assign(row, payload));
          return Promise.resolve({ data: rows[0] || null, error: null });
        }
        const data = table(name).find(row => filters.every(([k,v]) => row[k] === v)) || null;
        return Promise.resolve({ data, error: null });
      },
      upsert(value) { mode = 'upsert'; payload = value; return this; },
      insert(value) { mode = 'upsert'; payload = value; return this; },
      update(value) { mode = 'update'; payload = value; return this; },
      then(resolve) {
        const data = table(name).filter(row => filters.every(([k,v]) => row[k] === v));
        return resolve({ data, error: null });
      }
    };
  }

  return { from, tables };
}

test('repository upserts entities, relations, provenance, and resumes jobs idempotently', async () => {
  const db = createMemoryDb();
  const repo = createCinemaGraphRepository({ db });

  const person = await repo.upsertEntity({ canonicalKey: 'wikidata:Q1', entityType: 'Person', name: 'Person One', properties: {} });
  await repo.upsertEntity({ canonicalKey: 'wikidata:Q2', entityType: 'Movie', name: 'Film Two', properties: { releaseYear: 1999, imdbId: 'tt123' } });
  const personAgain = await repo.upsertEntity({ canonicalKey: 'wikidata:Q1', entityType: 'Person', name: 'Person One Updated', properties: {} });
  assert.equal(person.id, personAgain.id);

  await repo.upsertEntitySource(person.id, { source: 'wikidata', externalId: 'Q1', sourceUrl: 'https://www.wikidata.org/wiki/Q1', retrievedAt: '2026-09-02T00:00:00Z' });
  const relation = await repo.upsertRelation({ fromCanonicalKey: 'wikidata:Q1', toCanonicalKey: 'wikidata:Q2', relationType: 'ACTED_IN', properties: {}, confidence: 1 });
  await repo.upsertRelationSource(relation.id, { source: 'wikidata', externalId: 'claim-1', sourceUrl: 'https://www.wikidata.org/wiki/Q1', retrievedAt: '2026-09-02T00:00:00Z' });

  assert.equal((await repo.listEntities()).length, 2);
  assert.equal((await repo.listRelations()).length, 1);
  assert.equal((await repo.getRelationSources(relation.id)).length, 1);

  const first = await repo.createOrResumeJob({ source: 'wikidata', jobType: 'seed', seedExternalId: 'Q1' });
  await repo.updateJobCheckpoint(first.id, { checkpoint: { processedQids: ['Q1'] }, stats: { entitiesStored: 1 } });
  const resumed = await repo.createOrResumeJob({ source: 'wikidata', jobType: 'seed', seedExternalId: 'Q1' });
  assert.equal(resumed.id, first.id);
});

test('repository mirrors only legacy-compatible entities and credits', async () => {
  const db = createMemoryDb();
  const repo = createCinemaGraphRepository({ db });

  const person = { canonicalKey: 'wikidata:Q10', entityType: 'Person', name: 'Actor', description: 'Actor', properties: {}, source: { source: 'wikidata', externalId: 'Q10' } };
  const movie = { canonicalKey: 'wikidata:Q20', entityType: 'Movie', name: 'Movie', properties: { releaseYear: 2001, imdbId: 'tt20' }, source: { source: 'wikidata', externalId: 'Q20' } };
  await repo.mirrorLegacyEntity(person);
  await repo.mirrorLegacyEntity(movie);

  await repo.mirrorLegacyRelation({ fromCanonicalKey: 'wikidata:Q10', toCanonicalKey: 'wikidata:Q20', relationType: 'ACTED_IN', source: { source: 'wikidata' } });
  await repo.mirrorLegacyRelation({ fromCanonicalKey: 'wikidata:Q10', toCanonicalKey: 'wikidata:Q20', relationType: 'WROTE', source: { source: 'wikidata' } });

  assert.equal(db.tables.get('people').length, 1);
  assert.equal(db.tables.get('movies').length, 1);
  assert.equal(db.tables.get('credits').length, 1);
  assert.equal(db.tables.get('credits')[0].role, 'cast');
});
