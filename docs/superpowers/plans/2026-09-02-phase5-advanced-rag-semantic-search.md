# Phase 5 Advanced RAG + Semantic Cinema Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add selective, production-grade hybrid semantic cinema retrieval to MovieFinder using Supabase/Postgres pgvector while preserving Cinema Graph facts, deterministic hard constraints, live availability authority, and Phase 4 fallbacks.

**Architecture:** Complex/concept-heavy queries optionally generate a bounded 1536-dimensional query embedding and execute lexical plus pgvector retrieval against internal `cinema_documents`. Reciprocal-rank fusion resolves semantic documents to canonical Cinema Graph entities before deterministic filtering, live availability verification, and optional AI synthesis; direct searches continue on the existing Phase 4 path with no embedding latency.

**Tech Stack:** Node.js ES modules, Supabase/Postgres, pgvector, PostgreSQL full-text search (`tsvector` + GIN), HNSW cosine index, REST/RPC boundaries already used by MovieFinder, Node `node:test`, existing GitHub Actions + CodeQL.

**Spec:** `docs/superpowers/specs/2026-09-02-phase5-advanced-rag-semantic-search-design.md`

## Global Constraints

- Use Supabase/Postgres + pgvector; do not add Pinecone, Qdrant, or another vector database.
- Initial embedding dimension is exactly `1536`; model/dimension changes require explicit migration and corpus re-embedding.
- Phase 5 English full-text corpus uses `to_tsvector('english', ...)`.
- HNSW uses cosine distance / `vector_cosine_ops`; start with pgvector defaults and benchmark before tuning.
- Hybrid retrieval starts with lexical limit `30`, semantic limit `30`, fused candidate maximum `40`, evidence-document maximum `12`, and RRF smoothing constant `60` with equal weights.
- Semantic similarity is relevance evidence only; it cannot create verified Cinema Graph facts or current streaming claims.
- Deterministic year/person/provider/free/rent/buy constraints remain authoritative and must have zero bypasses.
- Current streaming claims still require the existing live availability boundary.
- AI receives bounded verified evidence only and cannot overwrite structured movie/availability facts.
- Missing/failed embedding or semantic retrieval must fall back to Phase 4 behavior.
- No live Wikidata calls are added to `/api/search`.
- `SUPABASE_SERVICE_ROLE_KEY` and embedding-provider credentials remain server-side only.
- `cinema_documents` is internal/server-managed; no broad `anon` or `authenticated` write policy.
- `SEMANTIC_SEARCH_ENABLED` is the single kill switch; disabled means Phase 4 behavior.
- TDD is mandatory: write the focused failing contract, verify RED in CI, implement minimally, verify GREEN, then commit the production change.
- Do not merge the Phase 5 PR until exact-head Search Brain Tests and CodeQL are green.

---

## File Structure

New focused modules:
- `lib/search/semantic/routing.js` — deterministic decision for whether semantic retrieval is warranted.
- `lib/search/semantic/embedding-adapter.js` — provider-neutral embedding contract, dimension/batch/timeout validation.
- `lib/search/semantic/document-builder.js` — deterministic semantic document construction and SHA-256 content hashing.
- `lib/search/semantic/rrf.js` — pure reciprocal-rank fusion.
- `lib/search/semantic/semantic-store.js` — bounded Supabase REST/RPC boundary for semantic documents/retrieval.
- `lib/search/semantic/hybrid-retriever.js` — query embedding + hybrid retrieval + bounded evidence normalization.
- `supabase/migrations/20260902_phase5_semantic_search.sql` — pgvector table/index/RPC/RLS schema.
- `tests/search/semantic/*.test.js` — focused contracts.
- `tests/fixtures/semantic-search-evaluation.json` — curated quality fixture.

Existing files modified:
- `lib/search/live-orchestrator.js` — insert selective semantic retrieval before graph resolution/final evidence.
- `api/search.js` — production construction/config only; HTTP/security boundary stays first.
- ingestion code under `lib/ingestion/` — deterministic semantic-document upsert/enqueue after canonical persistence.
- `README.md` — Phase 5 behavior, configuration, authority and fallback documentation.

---

### Task 1: Define semantic routing and RRF contracts

**Files:**
- Create: `lib/search/semantic/routing.js`
- Create: `lib/search/semantic/rrf.js`
- Create: `tests/search/semantic/routing.test.js`
- Create: `tests/search/semantic/rrf.test.js`

**Interfaces:**
- Produces: `shouldUseSemanticRetrieval({ query, parsedIntent, enabled }) -> boolean`
- Produces: `fuseRanks({ lexical, semantic, k = 60, lexicalWeight = 1, semanticWeight = 1, limit = 40 }) -> ranked documents`

- [ ] **Step 1: Write failing routing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldUseSemanticRetrieval } from '../../../lib/search/semantic/routing.js';

test('direct filmography search skips semantic retrieval', () => {
  assert.equal(shouldUseSemanticRetrieval({
    enabled: true,
    query: 'Will Smith movies on Netflix',
    parsedIntent: { kind: 'person-filmography', personName: 'Will Smith', provider: 'Netflix' }
  }), false);
});

test('concept-heavy discovery uses semantic retrieval', () => {
  assert.equal(shouldUseSemanticRetrieval({
    enabled: true,
    query: 'slow-burn crime movies with lonely protagonists and bleak endings',
    parsedIntent: { kind: 'discovery', concepts: ['slow-burn', 'lonely protagonists', 'bleak endings'] }
  }), true);
});

test('kill switch disables semantic retrieval', () => {
  assert.equal(shouldUseSemanticRetrieval({ enabled: false, query: 'dreamlike thrillers', parsedIntent: { kind: 'discovery' } }), false);
});
```

- [ ] **Step 2: Write failing RRF tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { fuseRanks } from '../../../lib/search/semantic/rrf.js';

test('RRF favors a document ranked in both lists and stays bounded', () => {
  const fused = fuseRanks({
    lexical: [{ id: 'a' }, { id: 'b' }],
    semantic: [{ id: 'b' }, { id: 'c' }],
    limit: 2
  });
  assert.equal(fused[0].id, 'b');
  assert.equal(fused.length, 2);
  assert.equal(fused[0].lexicalRank, 2);
  assert.equal(fused[0].semanticRank, 1);
});
```

- [ ] **Step 3: Verify RED**

Run: `node --test tests/search/semantic/routing.test.js tests/search/semantic/rrf.test.js`
Expected: FAIL because semantic routing/RRF modules do not exist.

- [ ] **Step 4: Implement the minimal pure modules**

```js
// routing.js
const SEMANTIC_LANGUAGE = /\b(mood|tone|style|pacing|atmosphere|dreamlike|bleak|slow[- ]burn|feels? like|similar|theme|thematic|visual|identity|memory|lonely|paranoid)\b/i;
export function shouldUseSemanticRetrieval({ query = '', parsedIntent = {}, enabled = false } = {}) {
  if (!enabled) return false;
  if (parsedIntent.kind === 'person-filmography' || parsedIntent.kind === 'title') return false;
  const concepts = Array.isArray(parsedIntent.concepts) ? parsedIntent.concepts : [];
  return concepts.length >= 2 || SEMANTIC_LANGUAGE.test(query);
}
```

```js
// rrf.js
export function fuseRanks({ lexical = [], semantic = [], k = 60, lexicalWeight = 1, semanticWeight = 1, limit = 40 } = {}) {
  const byId = new Map();
  const add = (items, field, weight) => items.forEach((item, index) => {
    if (!item?.id) return;
    const current = byId.get(item.id) || { ...item, lexicalRank: null, semanticRank: null, fusedScore: 0 };
    current[field] = index + 1;
    current.fusedScore += weight / (k + index + 1);
    byId.set(item.id, current);
  });
  add(lexical, 'lexicalRank', lexicalWeight);
  add(semantic, 'semanticRank', semanticWeight);
  return [...byId.values()].sort((a, b) => b.fusedScore - a.fusedScore || String(a.id).localeCompare(String(b.id))).slice(0, Math.min(40, Math.max(0, limit)));
}
```

- [ ] **Step 5: Verify GREEN and commit**

Run: `node --test tests/search/semantic/routing.test.js tests/search/semantic/rrf.test.js`
Expected: PASS.
Commit: `feat: add semantic routing and rank fusion`

---

### Task 2: Add the provider-neutral embedding boundary

**Files:**
- Create: `lib/search/semantic/embedding-adapter.js`
- Create: `tests/search/semantic/embedding-adapter.test.js`

**Interfaces:**
- Produces: `createEmbeddingAdapter({ provider, model, dimensions = 1536, embedImpl, timeoutMs })`
- Produces: `adapter.embed({ texts, purpose }) -> { provider, model, dimensions, vectors, usage, latencyMs }`

- [ ] **Step 1: Write failing tests for dimension, bounds, timeout and normalized output**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmbeddingAdapter } from '../../../lib/search/semantic/embedding-adapter.js';

test('embedding adapter validates 1536-dimensional output', async () => {
  const adapter = createEmbeddingAdapter({ provider: 'test', model: 'test-1536', embedImpl: async texts => texts.map(() => Array(1536).fill(0.1)) });
  const result = await adapter.embed({ texts: ['paranoid surveillance'], purpose: 'query' });
  assert.equal(result.dimensions, 1536);
  assert.equal(result.vectors[0].length, 1536);
});

test('embedding adapter rejects incompatible dimensions', async () => {
  const adapter = createEmbeddingAdapter({ provider: 'test', model: 'bad', embedImpl: async () => [[0.1, 0.2]] });
  await assert.rejects(() => adapter.embed({ texts: ['x'], purpose: 'query' }), /dimension/i);
});
```

- [ ] **Step 2: Verify RED**
Run: `node --test tests/search/semantic/embedding-adapter.test.js`
Expected: FAIL because adapter module does not exist.

- [ ] **Step 3: Implement bounded adapter**
Implementation requirements: max 32 texts/batch, max 8,000 characters/text, default 5s timeout, exact vector length validation, finite-number validation, stable error codes `EMBEDDING_TIMEOUT`, `EMBEDDING_BAD_RESPONSE`, `EMBEDDING_INVALID_INPUT`.

- [ ] **Step 4: Verify GREEN and commit**
Run: `node --test tests/search/semantic/embedding-adapter.test.js`
Expected: PASS.
Commit: `feat: add embedding adapter contract`

---

### Task 3: Add semantic document construction and idempotent hashing

**Files:**
- Create: `lib/search/semantic/document-builder.js`
- Create: `tests/search/semantic/document-builder.test.js`

**Interfaces:**
- Produces: `buildSemanticDocuments({ entity, relations, sources }) -> SemanticDocument[]`
- Produces: `hashSemanticContent({ documentType, entityId, content, sourceRef }) -> hex SHA-256`

- [ ] **Step 1: Write failing tests**
Assert that movie summary/theme/style inputs produce deterministic document types, provenance, canonical `entityId`, English language, and identical hashes for unchanged normalized content; changed content must produce a different hash.

- [ ] **Step 2: Verify RED**
Run: `node --test tests/search/semantic/document-builder.test.js`
Expected: FAIL because builder does not exist.

- [ ] **Step 3: Implement deterministic builder**
Use `node:crypto` SHA-256. Normalize whitespace only; never generate new factual prose. Construct documents solely from supplied canonical properties/source-backed text. Omit empty documents.

- [ ] **Step 4: Verify GREEN and commit**
Run: `node --test tests/search/semantic/document-builder.test.js`
Expected: PASS.
Commit: `feat: build provenance-aware semantic documents`

---

### Task 4: Add pgvector schema, full-text index, HNSW index and secure hybrid RPC

**Files:**
- Create: `supabase/migrations/20260902_phase5_semantic_search.sql`
- Create: `tests/search/semantic/schema.test.js`

**Interfaces:**
- Produces table: `public.cinema_documents`
- Produces function: `public.search_cinema_documents(query_text text, query_embedding extensions.vector(1536), match_count integer default 40)`
- RPC returns only bounded evidence fields: document id/entity id/type/title/content/source/provenance plus lexical/semantic/fused ranks.

- [ ] **Step 1: Write schema contract test**
Read the migration as text and assert it contains: `create extension if not exists vector with schema extensions`, `extensions.vector(1536)`, generated stored English `tsvector`, GIN index, HNSW `vector_cosine_ops`, RLS enablement, `revoke all ... from public`, and bounded `least(match_count, 40)`.

- [ ] **Step 2: Verify RED**
Run: `node --test tests/search/semantic/schema.test.js`
Expected: FAIL because migration does not exist.

- [ ] **Step 3: Implement migration**
Core SQL shape:

```sql
create extension if not exists vector with schema extensions;

create table if not exists public.cinema_documents (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid references public.cinema_entities(id) on delete cascade,
  document_type text not null,
  title text,
  content text not null,
  content_hash text not null,
  source_kind text not null,
  source_ref text,
  source_url text,
  provenance jsonb not null default '{}'::jsonb,
  language text not null default 'en' check (language = 'en'),
  embedding_model text,
  embedding_version text,
  embedding extensions.vector(1536),
  fts tsvector generated always as (to_tsvector('english', coalesce(title, '') || ' ' || content)) stored,
  metadata jsonb not null default '{}'::jsonb,
  embedded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entity_id, document_type, content_hash, source_kind, source_ref)
);

alter table public.cinema_documents enable row level security;
revoke all on public.cinema_documents from anon, authenticated;
create index if not exists cinema_documents_fts_idx on public.cinema_documents using gin(fts);
create index if not exists cinema_documents_embedding_hnsw_idx on public.cinema_documents using hnsw (embedding extensions.vector_cosine_ops) where embedding is not null;
```

The RPC must be `language sql`, use `websearch_to_tsquery('english', query_text)`, cosine `<=>`, rank each list separately, fuse with `1/(60+rank)`, cap each source list to 30 and final output to `least(match_count, 40)`. Revoke execute from `public`, `anon`, and `authenticated`; grant only to `service_role`. Do not use `SECURITY DEFINER`.

- [ ] **Step 4: Verify schema against the actual Supabase project before applying**
Use Supabase SQL read queries to check `server_version`, `pg_extension` row for `vector`, existing `cinema_entities`, conflicting functions/indexes/policies, and current schema. If actual pgvector is below the capability required for the planned index, stop and adjust migration rather than guessing.

- [ ] **Step 5: Apply SQL through Supabase, run a smoke query, and run advisors**
Apply only after Step 4 compatibility checks. Verify table/function/index existence with SQL, execute a small transaction-safe insert/search/delete smoke test, then run available database advisors/security checks. Do not claim deployment complete without these results.

- [ ] **Step 6: Verify GREEN and commit**
Run: `node --test tests/search/semantic/schema.test.js`
Expected: PASS.
Commit: `feat: add pgvector cinema document schema`

---

### Task 5: Add the bounded Supabase semantic store

**Files:**
- Create: `lib/search/semantic/semantic-store.js`
- Create: `tests/search/semantic/semantic-store.test.js`

**Interfaces:**
- Produces: `createSupabaseSemanticStore({ fetchImpl, env })`
- Methods: `upsertDocuments(documents)`, `documentsNeedingEmbedding({ limit })`, `saveEmbeddings(rows)`, `hybridSearch({ queryText, queryEmbedding, limit })`

- [ ] **Step 1: Write failing tests with injected fetch**
Assert service-role credentials are server-side headers, request timeout is bounded, result limits never exceed 40, embedding work limits never exceed 32, RPC name is fixed, arbitrary table/function/filter names cannot be supplied, and public errors never contain service keys.

- [ ] **Step 2: Verify RED**
Run: `node --test tests/search/semantic/semantic-store.test.js`
Expected: FAIL because store does not exist.

- [ ] **Step 3: Implement minimal REST/RPC store following `supabase-live-graph-store.js` patterns**
Use `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AbortSignal.timeout`, fixed `cinema_documents` and `search_cinema_documents` endpoints, and bounded JSON bodies. Return `null` from the factory when credentials/fetch are unavailable so Phase 4 remains usable.

- [ ] **Step 4: Verify GREEN and commit**
Run: `node --test tests/search/semantic/semantic-store.test.js`
Expected: PASS.
Commit: `feat: add bounded semantic document store`

---

### Task 6: Add idempotent embedding work after canonical ingestion

**Files:**
- Modify: `lib/ingestion/wikidata-ingestion.js`
- Create: `lib/ingestion/semantic-document-ingestion.js`
- Create: `tests/ingestion/semantic-document-ingestion.test.js`

**Interfaces:**
- Produces: `syncSemanticDocuments({ entities, relations, sources, semanticStore, embeddingAdapter })`
- Unchanged `content_hash + embedding_model + embedding_version` must not call the embedding provider.

- [ ] **Step 1: Write failing tests**
Cover unchanged hash skip, changed content re-embedding, changed model/version re-embedding, provider failure preserving the previous valid embedding, bounded batch size, and source provenance retention.

- [ ] **Step 2: Verify RED**
Run: `node --test tests/ingestion/semantic-document-ingestion.test.js`
Expected: FAIL because semantic ingestion coordinator does not exist.

- [ ] **Step 3: Implement minimal coordinator**
Build/upsert deterministic documents first. Request only rows whose embedding is missing/stale. Generate embeddings in batches <=32. Validate 1536 dimensions before `saveEmbeddings`. On embedding failure, leave existing valid vector/metadata untouched and return a degraded summary instead of failing canonical Wikidata ingestion.

- [ ] **Step 4: Wire best-effort semantic sync after canonical persistence**
Add an optional injected semantic sync dependency to Wikidata ingestion so existing callers/tests remain compatible. Never make semantic work a prerequisite for canonical graph ingestion success.

- [ ] **Step 5: Verify GREEN and commit**
Run: `node --test tests/ingestion/semantic-document-ingestion.test.js tests/ingestion/wikidata-ingestion.test.js`
Expected: PASS.
Commit: `feat: sync semantic documents after ingestion`

---

### Task 7: Add hybrid retrieval coordinator and bounded RAG evidence

**Files:**
- Create: `lib/search/semantic/hybrid-retriever.js`
- Create: `tests/search/semantic/hybrid-retriever.test.js`

**Interfaces:**
- Produces: `createHybridRetriever({ embeddingAdapter, semanticStore })`
- Method: `retrieve({ query, parsedIntent }) -> { mode, documents, entityIds, degraded }`
- Evidence document cap: 12; entity candidate cap: 40.

- [ ] **Step 1: Write failing tests**
Cover query embedding generation, hybrid store call, bounded 12-document evidence, unique entity IDs, prompt-like retrieved text treated as plain content, embedding failure returning `{ degraded: true, documents: [] }`, and store failure degrading without throwing into the core search path.

- [ ] **Step 2: Verify RED**
Run: `node --test tests/search/semantic/hybrid-retriever.test.js`
Expected: FAIL because retriever does not exist.

- [ ] **Step 3: Implement retriever**
Normalize excerpts to a fixed maximum (for example 1,500 characters/document), preserve provenance/ranks, never execute or reinterpret retrieved text, and never expose credentials/raw database fields.

- [ ] **Step 4: Verify GREEN and commit**
Run: `node --test tests/search/semantic/hybrid-retriever.test.js`
Expected: PASS.
Commit: `feat: add bounded hybrid semantic retrieval`

---

### Task 8: Integrate semantic retrieval into live search without weakening authority

**Files:**
- Modify: `lib/search/live-orchestrator.js`
- Modify: `api/search.js`
- Create: `tests/search/semantic/live-semantic-orchestrator.test.js`
- Modify: `tests/search/api-handler.test.js`
- Modify: `tests/security/backend-security.test.js`

**Interfaces:**
- `createLiveOrchestrator` gains optional `semanticRetriever` and `semanticEnabled` dependencies.
- Semantic candidates must resolve to canonical graph nodes before becoming movies.
- Existing response remains compatible; optional evidence gains `semantic` block and `reasoningMode` may include `semantic`, `semantic+graph`, and `semantic+graph+ai` as appropriate.

- [ ] **Step 1: Write RED integration contracts**
Tests must prove: direct search makes zero semantic calls; concept-heavy search retrieves semantics; semantic entity IDs resolve through graph; semantic candidate failing hard year/provider constraints is excluded; streaming query still calls live availability before output; semantic failure falls back to existing Phase 4 result; AI receives only final bounded semantic+graph evidence; AI structured output cannot reintroduce excluded candidates.

- [ ] **Step 2: Verify RED**
Run: `node --test tests/search/semantic/live-semantic-orchestrator.test.js tests/search/api-handler.test.js tests/security/backend-security.test.js`
Expected: FAIL on missing semantic orchestration behavior while existing security tests remain otherwise intact.

- [ ] **Step 3: Implement semantic path in orchestrator**
Order: semantic route decision -> retrieve bounded semantic docs -> resolve `entityIds` through graph store -> construct candidate movies -> apply existing availability/hard-constraint verification -> build verified evidence with bounded semantic block -> optional existing AI reasoning. Any semantic exception must fall through to the Phase 4 graph/deterministic behavior.

- [ ] **Step 4: Wire production dependencies in `api/search.js`**
Construct semantic store/retriever only when `SEMANTIC_SEARCH_ENABLED === 'true'` and required Supabase + embedding configuration exists. Do not pass raw request/env/headers into semantic retrieval. Preserve method validation, query validation, rate limiting and security headers before orchestration.

- [ ] **Step 5: Verify GREEN and commit**
Run focused tests above, then `node --test tests/search/*.test.js tests/search/semantic/*.test.js tests/security/*.test.js`.
Expected: PASS.
Commit: `feat: connect semantic RAG to live search`

---

### Task 9: Add reproducible semantic quality evaluation

**Files:**
- Create: `tests/fixtures/semantic-search-evaluation.json`
- Create: `tests/search/semantic/evaluation.test.js`

**Interfaces:**
- Fixture fields: `query`, `expectedRelevantEntityIds`, `requiredExclusions`, optional `gradedRelevance`, optional `hardConstraints`.
- Produces deterministic offline metrics: Recall@K, Precision@K, MRR, hard-constraint violations, availability violations.

- [ ] **Step 1: Add fixture cases**
Include at least 12 cases spanning direct negative-control queries, mood/style, similarity, multi-concept discovery, year/person/provider hard filters, and semantically related-but-forbidden candidates.

- [ ] **Step 2: Write metric tests**
Use deterministic fake retrieval rankings so metric math is reproducible and assert hard-constraint/availability violation counts are exactly zero.

- [ ] **Step 3: Run GREEN and commit**
Run: `node --test tests/search/semantic/evaluation.test.js`
Expected: PASS.
Commit: `test: add semantic search quality evaluation`

---

### Task 10: Document rollout, configuration and operational safety

**Files:**
- Modify: `README.md`
- Test: existing documentation/schema tests as applicable.

**Interfaces:**
- Documents `SEMANTIC_SEARCH_ENABLED`, embedding provider/model/version/dimension requirements, Supabase pgvector migration, fallback behavior, authority boundaries, and re-embedding procedure.

- [ ] **Step 1: Update README**
Explain that direct searches avoid embeddings; concept-heavy queries use hybrid retrieval; Cinema Graph/current availability/hard filters remain authoritative; semantic search is kill-switchable; changing embedding spaces requires corpus re-embedding; no live Wikidata is added to request-time search.

- [ ] **Step 2: Run full Node + Python tests**
Run: `node --test tests/**/*.test.js` (or the repository's CI-equivalent command) and `python -m pytest python_search/tests`.
Expected: all pass.

- [ ] **Step 3: Commit**
Commit: `docs: explain Phase 5 semantic search`

---

### Task 11: Final exact-head verification and merge-gate preparation

**Files:**
- No production changes unless verification finds a root-cause defect.
- PR metadata only after all checks are green.

**Interfaces:**
- Final branch must satisfy the spec acceptance criteria and preserve Phase 4 contracts.

- [ ] **Step 1: Review final diff against spec**
Check every acceptance criterion: selective routing, 1536-compatible embedding space, hybrid retrieval/RRF, graph resolution, hard-filter authority, live availability authority, bounded evidence, prompt-injection handling, fallback, idempotent embeddings, security, kill switch, evaluation fixtures.

- [ ] **Step 2: Run/fetch exact-head Search Brain Tests**
Require all Node tests, Python tests and configured live checks to pass. Treat external live-source failures as failures until retried/diagnosed; do not call the branch green without fresh evidence.

- [ ] **Step 3: Run/fetch exact-head CodeQL**
Require CodeQL success on the same exact head SHA.

- [ ] **Step 4: Prepare PR**
Create/update a non-draft PR titled `feat: add Phase 5 semantic cinema search`, accurately summarize schema, hybrid retrieval, semantic routing, security/fallbacks, evaluation and verification. Do not merge yet.

- [ ] **Step 5: Stop at merge gate**
Report exact head SHA, Search Brain Tests result, CodeQL result, migration verification status, and PR URL. Merge only after explicit authorization.

---

## Self-Review Results

- **Spec coverage:** Every Phase 5 spec area maps to a task: routing/RRF (1), embeddings (2), document provenance/idempotency (3/6), schema/RLS/HNSW/FTS/RPC (4), Supabase boundary (5), ingestion/re-embedding (6), retrieval/evidence/prompt-injection boundary (7), live authority/fallback/security (8), quality metrics (9), operations/kill switch (10), exact-head security/CI gate (11).
- **Placeholder scan:** No TBD/TODO/"implement later" steps remain. SQL and critical function contracts are explicit; implementation-only details that depend on actual Supabase version are guarded by a required compatibility query rather than guessed.
- **Type consistency:** Semantic routing, embedding adapter, semantic store, hybrid retriever and live orchestrator interfaces use the same names throughout the plan. Candidate limits remain 30/30/40/12 and embedding dimension remains 1536 throughout.
- **Scope:** Phase 5 remains one coherent subsystem: semantic retrieval/RAG layered onto the existing search path. No UI redesign, separate vector DB, autonomous browsing, or paid reranker is included.
