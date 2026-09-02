# Persistent Cinema Graph + Wikidata Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a durable Supabase/Postgres-backed Cinema Graph plus a resumable, idempotent Wikidata seed-ingestion pipeline without changing MovieFinder's current UI or requiring a new API key.

**Architecture:** Extend the existing Supabase schema with canonical graph entities, directed relations, provenance, and ingestion-job tables. Keep `lib/search/graph-store.js` as the in-memory implementation, add a database-backed adapter behind the same conceptual API, and build a source-isolated Wikidata client -> normalizer -> repository -> ingestion coordinator pipeline that mirrors compatible people/movies/credits into existing tables.

**Tech Stack:** Node.js 20+ ES modules, Node built-in test runner, Supabase/Postgres SQL, dependency-injected `fetch`, existing MovieFinder search modules.

**Spec:** `docs/superpowers/specs/2026-09-02-persistent-cinema-graph-ingestion-design.md`

## Global Constraints

- Extend the existing Supabase schema rather than introduce a second graph database.
- Preserve the current `people`, `movies`, `credits`, and `availability_snapshots` tables and existing search behavior.
- Wikidata is the only new external knowledge source in this phase and requires no API key.
- Do not make current search depend on live Wikidata access.
- No MovieFinder UI redesign.
- Ingestion must be idempotent and resumable.
- Source identifiers, source URLs, and retrieval timestamps must survive normalization and persistence.
- Unit tests must run offline and without live Supabase credentials.
- Existing availability logic remains unchanged.

---

## File Structure

- Create `supabase/migrations/20260902_persistent_cinema_graph.sql` — canonical graph, provenance, ingestion-job tables and indexes.
- Create `lib/search/persistent-graph-store.js` — async database-backed graph adapter.
- Create `lib/ingestion/wikidata-client.js` — bounded Wikidata entity-fetch client.
- Create `lib/ingestion/wikidata-normalizer.js` — source record -> canonical entity/relation conversion.
- Create `lib/ingestion/cinema-graph-repository.js` — persistence/upsert boundary, provenance, legacy table mirroring, ingestion-job state.
- Create `lib/ingestion/wikidata-ingestion.js` — seed ingestion coordinator and checkpoint logic.
- Create `tests/search/persistent-graph-store.test.js`.
- Create `tests/ingestion/wikidata-client.test.js`.
- Create `tests/ingestion/wikidata-normalizer.test.js`.
- Create `tests/ingestion/cinema-graph-repository.test.js`.
- Create `tests/ingestion/wikidata-ingestion.test.js`.
- Modify `README.md` — document persistence and seed ingestion.

---

### Task 1: Persistent Cinema Graph Schema

**Files:**
- Create: `supabase/migrations/20260902_persistent_cinema_graph.sql`
- Test: `tests/ingestion/cinema-graph-repository.test.js`

**Interfaces:**
- Consumes: existing `people`, `movies`, `credits`, `availability_snapshots` tables.
- Produces: `cinema_entities`, `cinema_entity_sources`, `cinema_relations`, `cinema_relation_sources`, `cinema_ingestion_jobs` with uniqueness and traversal indexes.

- [ ] **Step 1: Write a schema contract test**

Create `tests/ingestion/cinema-graph-repository.test.js` with a test that reads the SQL migration text from disk and asserts that the five required tables, canonical/source uniqueness constraints, relation uniqueness constraint, job status constraint, and traversal/source indexes are present.

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL('../../supabase/migrations/20260902_persistent_cinema_graph.sql', import.meta.url);

test('persistent cinema graph migration defines required durable structures', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  for (const table of [
    'cinema_entities',
    'cinema_entity_sources',
    'cinema_relations',
    'cinema_relation_sources',
    'cinema_ingestion_jobs'
  ]) assert.match(sql, new RegExp(`create table if not exists ${table}`));

  assert.match(sql, /unique\s*\(source, external_id\)/i);
  assert.match(sql, /unique\s*\(from_entity_id, relation_type, to_entity_id\)/i);
  assert.match(sql, /pending.*running.*completed.*failed/is);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `node --test tests/ingestion/cinema-graph-repository.test.js`

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Add the SQL migration**

Implement all five tables exactly as defined in the approved spec, including `pgcrypto`, UUID primary keys, JSONB property/checkpoint/stat fields, timestamps, foreign-key cascades, confidence bounds, uniqueness constraints, and indexes for:

```sql
create index if not exists idx_cinema_entities_type_name
  on cinema_entities (entity_type, lower(name));
create index if not exists idx_cinema_entity_sources_lookup
  on cinema_entity_sources (source, external_id);
create index if not exists idx_cinema_relations_from_type
  on cinema_relations (from_entity_id, relation_type);
create index if not exists idx_cinema_relations_to_type
  on cinema_relations (to_entity_id, relation_type);
create index if not exists idx_cinema_ingestion_jobs_resume
  on cinema_ingestion_jobs (source, job_type, seed_external_id, status, updated_at desc);
```

- [ ] **Step 4: Run the schema contract test**

Run: `node --test tests/ingestion/cinema-graph-repository.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260902_persistent_cinema_graph.sql tests/ingestion/cinema-graph-repository.test.js
git commit -m "feat: add persistent cinema graph schema"
```

---

### Task 2: Persistent Graph Store Adapter

**Files:**
- Create: `lib/search/persistent-graph-store.js`
- Create: `tests/search/persistent-graph-store.test.js`

**Interfaces:**
- Consumes: injected repository with `upsertEntity`, `upsertRelation`, `getEntity`, `listEntities`, `listRelations`, `listOutgoingRelations`, and `getRelationSources`.
- Produces: `createPersistentGraphStore({ repository })` exposing async `addNode`, `addEdge`, `getNode`, `nodes`, `edges`, `neighbors`, `traverse`, and `explainPath`.

- [ ] **Step 1: Write failing adapter tests**

Use an in-memory fake repository and assert:

```js
const graph = createPersistentGraphStore({ repository });
await graph.addNode({ id: 'wikidata:Q1', type: 'Person', name: 'Example Person' });
await graph.addNode({ id: 'wikidata:Q2', type: 'Movie', title: 'Example Film' });
await graph.addEdge({ from: 'wikidata:Q1', to: 'wikidata:Q2', type: 'ACTED_IN' });
assert.equal((await graph.neighbors('wikidata:Q1')).length, 1);
assert.deepEqual((await graph.explainPath('wikidata:Q1', 'wikidata:Q2')).map(x => x.type), ['ACTED_IN']);
```

Also test missing-node edge rejection and bounded traversal depth.

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/search/persistent-graph-store.test.js`

Expected: FAIL because `persistent-graph-store.js` does not exist.

- [ ] **Step 3: Implement the adapter**

Implement `createPersistentGraphStore({ repository })` with argument validation and directed outgoing traversal. Normalize returned nodes to the existing graph-store shape and keep database calls behind the repository interface.

- [ ] **Step 4: Run tests**

Run: `node --test tests/search/persistent-graph-store.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/search/persistent-graph-store.js tests/search/persistent-graph-store.test.js
git commit -m "feat: add persistent cinema graph adapter"
```

---

### Task 3: Wikidata Client + Deterministic Normalizer

**Files:**
- Create: `lib/ingestion/wikidata-client.js`
- Create: `lib/ingestion/wikidata-normalizer.js`
- Create: `tests/ingestion/wikidata-client.test.js`
- Create: `tests/ingestion/wikidata-normalizer.test.js`

**Interfaces:**
- Produces `createWikidataClient({ fetchImpl, timeoutMs = 5000, maxRetries = 2 })` with `fetchEntities(qids)` and `fetchSeed(qid)`.
- Produces `normalizeWikidataBatch({ entities, retrievedAt }) -> { entities, relations, skipped }`.
- Canonical entity shape: `{ canonicalKey, entityType, name, description, properties, source }`.
- Canonical relation shape: `{ fromCanonicalKey, toCanonicalKey, relationType, properties, confidence, source }`.

- [ ] **Step 1: Write failing Wikidata client tests**

Use an injected fake `fetchImpl` and verify URL encoding, bounded retry, timeout/error normalization, and entity lookup from a fixture shaped like Wikidata's `wbgetentities` response.

Expected error shape:

```js
{
  code: 'WIKIDATA_UNAVAILABLE',
  retryable: true,
  cause: Error
}
```

- [ ] **Step 2: Run client test and verify failure**

Run: `node --test tests/ingestion/wikidata-client.test.js`

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement the client**

Use `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels%7Cdescriptions%7Cclaims%7Csitelinks&languages=en&ids=...`, injected `fetch`, `AbortController`, deduplicated QIDs, max 50 IDs/request, bounded retry, and no database concerns.

- [ ] **Step 4: Write failing normalizer tests**

Create fixtures for one person and one film. Verify deterministic mapping for supported claims:

```text
P31 -> entity typing
P161 -> ACTED_IN
P57 -> DIRECTED
P58 -> WROTE
P162 -> PRODUCED
P344 -> SHOT_BY
P136 -> HAS_GENRE
P495 -> FROM_COUNTRY
P577 -> release year property
P345 -> IMDb identifier property
```

Unknown claims must increment `skipped` and produce no guessed relation.

- [ ] **Step 5: Run normalizer test and verify failure**

Run: `node --test tests/ingestion/wikidata-normalizer.test.js`

Expected: FAIL because normalizer module does not exist.

- [ ] **Step 6: Implement normalizer**

Implement pure functions only. Every normalized entity and relation must carry:

```js
source: {
  source: 'wikidata',
  externalId: qid,
  sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
  retrievedAt
}
```

Use canonical keys `wikidata:<QID>` and deduplicate by canonical key / `(from,type,to)`.

- [ ] **Step 7: Run both test files**

Run: `node --test tests/ingestion/wikidata-client.test.js tests/ingestion/wikidata-normalizer.test.js`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/ingestion/wikidata-client.js lib/ingestion/wikidata-normalizer.js tests/ingestion/wikidata-client.test.js tests/ingestion/wikidata-normalizer.test.js
git commit -m "feat: add wikidata client and normalizer"
```

---

### Task 4: Cinema Graph Repository + Legacy Table Mirroring

**Files:**
- Create: `lib/ingestion/cinema-graph-repository.js`
- Modify: `tests/ingestion/cinema-graph-repository.test.js`

**Interfaces:**
- Produces `createCinemaGraphRepository({ db })`.
- Required methods:

```js
upsertEntity(entity)
upsertEntitySource(entityId, source)
upsertRelation(relation)
upsertRelationSource(relationId, source)
getEntity(canonicalKey)
listEntities()
listRelations()
listOutgoingRelations(canonicalKey, relationType)
getRelationSources(relationId)
mirrorLegacyEntity(entity)
mirrorLegacyRelation(relation)
createOrResumeJob({ source, jobType, seedExternalId })
updateJobCheckpoint(jobId, { checkpoint, stats })
completeJob(jobId, stats)
failJob(jobId, error, stats)
```

- [ ] **Step 1: Extend repository tests with a fake Supabase-style client**

Build a narrow fake supporting chained `.from(table).select().eq().maybeSingle()`, `.upsert(...).select().single()`, and `.update(...).eq()` operations. Assert idempotent entity/relation upserts, provenance attachment, and job resume behavior.

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test tests/ingestion/cinema-graph-repository.test.js`

Expected: FAIL because repository module does not exist.

- [ ] **Step 3: Implement repository methods**

Use database uniqueness as the final deduplication boundary. Do not embed Wikidata-specific parsing in this file.

Legacy mirroring rules:
- `Person` -> `people` using `source='wikidata'`, `external_id=<QID>`.
- `Movie` -> `movies` using the same source ID plus normalized `release_year` and `imdb_id` when present.
- `ACTED_IN` -> `credits.role='cast'`.
- `DIRECTED` -> `credits.role='director'`.
- `PRODUCED` -> `credits.role='producer'`.
- Unsupported relation types do not write legacy credits.

- [ ] **Step 4: Run repository tests**

Run: `node --test tests/ingestion/cinema-graph-repository.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ingestion/cinema-graph-repository.js tests/ingestion/cinema-graph-repository.test.js
git commit -m "feat: add cinema graph persistence repository"
```

---

### Task 5: Resumable Wikidata Seed Ingestion

**Files:**
- Create: `lib/ingestion/wikidata-ingestion.js`
- Create: `tests/ingestion/wikidata-ingestion.test.js`

**Interfaces:**
- Produces `createWikidataIngestionService({ client, normalizer, repository, now })`.
- Public operation:

```js
await service.ingestWikidataSeed(qid, {
  maxLinkedEntities: 50,
  batchSize: 20
});
```

- Return shape:

```js
{
  jobId,
  seed: qid,
  status: 'completed',
  stats: {
    entitiesSeen,
    entitiesStored,
    relationsStored,
    mirroredLegacyRecords,
    skipped
  }
}
```

- [ ] **Step 1: Write the end-to-end fixture test**

Test a real-shaped cinema fixture through fake fetch -> client -> normalizer -> fake repository. Verify the seed and directly linked entities are persisted, provenance is attached, legacy rows are mirrored, and a graph path can be explained after reload.

- [ ] **Step 2: Add checkpoint/resume and idempotency tests**

Simulate failure after the first durable batch. Assert the job checkpoint records the completed QIDs and a second call resumes without rewriting the completed batch. Re-run a completed seed and assert no duplicate entity/relation counts.

- [ ] **Step 3: Run and verify failure**

Run: `node --test tests/ingestion/wikidata-ingestion.test.js`

Expected: FAIL because ingestion coordinator does not exist.

- [ ] **Step 4: Implement coordinator**

Algorithm:

```text
validate QID
createOrResumeJob
read checkpoint.processedQids
fetch seed if not processed
collect supported linked QIDs from normalized relations
cap to maxLinkedEntities
process in batchSize chunks
for each batch:
  fetch entities
  normalize
  upsert entities + provenance
  upsert relations + provenance
  mirror supported legacy entities/relations
  update checkpoint only after durable writes
complete job
```

On error, call `failJob` with the latest durable checkpoint and rethrow a normalized ingestion error.

- [ ] **Step 5: Run ingestion tests**

Run: `node --test tests/ingestion/wikidata-ingestion.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/ingestion/wikidata-ingestion.js tests/ingestion/wikidata-ingestion.test.js
git commit -m "feat: add resumable wikidata seed ingestion"
```

---

### Task 6: Documentation + Full Regression Verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Documents the new persistent graph and ingestion entry points without changing runtime interfaces.

- [ ] **Step 1: Update README**

Add sections describing:
- durable Supabase Cinema Graph;
- Wikidata as initial ingestion source;
- seed-based ingestion rather than full crawl;
- idempotency/checkpoints;
- provenance;
- separation from time-sensitive availability;
- no required Wikidata API key;
- persistent and in-memory graph adapters;
- future TMDb/semantic-model work remaining out of scope.

Include a minimal example:

```js
const service = createWikidataIngestionService({
  client,
  normalizer: normalizeWikidataBatch,
  repository,
  now: () => new Date()
});

await service.ingestWikidataSeed('Q12345');
```

- [ ] **Step 2: Run all JavaScript tests**

Run: `npm test`

Expected: all existing and new Node tests PASS with zero failures. The repository currently defines `npm test` as `node --test tests/**/*.test.js` and requires Node 20+.

- [ ] **Step 3: Run the existing Python search tests**

Use the repository's existing Python test command/workflow exactly as configured in `.github/workflows/tests.yml`.

Expected: all existing Python search tests PASS.

- [ ] **Step 4: Review scope and secrets**

Run:

```bash
git diff main...HEAD -- README.md lib tests supabase
```

Verify there are no API keys, Supabase credentials, UI changes, TMDb integration, vector-model code, or unrelated refactors.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md
git commit -m "docs: document persistent cinema graph ingestion"
```

- [ ] **Step 6: Final verification**

Run again:

```bash
npm test
```

Expected: PASS with zero failures before opening the PR.
