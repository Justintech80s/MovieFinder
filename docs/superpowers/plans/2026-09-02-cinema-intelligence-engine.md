# Cinema Intelligence Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production-capable Cinema Intelligence Engine milestone underneath MovieFinder without changing the current visible interface.

**Architecture:** Extend the existing search modules rather than replacing them. Add replaceable persistence and semantic-retrieval contracts around the Cinema Graph, fuse graph/lexical/semantic candidates in orchestration, preserve deterministic fallbacks, then prove behavior with benchmarks and compatible API contracts.

**Tech Stack:** Node.js 20+, existing JavaScript search layer, existing Python search service where useful, Supabase/Postgres, optional pgvector-compatible embeddings, Vercel, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-02-cinema-intelligence-engine-design.md`

## Global Constraints

- Preserve the current MovieFinder visual interface.
- Existing result shapes remain compatible; intelligence metadata is additive.
- Deterministic search must work without an external AI model or embedding provider.
- `unknown` must never be silently converted to streaming `unavailable`.
- Provider, graph-storage, embedding, and availability implementations remain replaceable.
- New functionality requires automated regression coverage.

---

### Task 1: Graph Repository Contract

**Files:**
- Create: `lib/search/graph-repository.js`
- Modify: `lib/search/graph-store.js`
- Test: `tests/search/graph-repository.test.js`

**Interfaces:**
- Produces: `createGraphRepository(adapter)` with `upsertNode`, `upsertEdge`, `getNode`, `neighbors`, `findPath`, and `explainPath` methods.
- Existing in-memory graph store becomes a conforming adapter.

- [ ] Write failing contract tests proving node/edge upserts, neighbor traversal, path explanation, and metadata preservation.
- [ ] Run `node --test tests/search/graph-repository.test.js` and confirm the contract tests fail before implementation.
- [ ] Implement `createGraphRepository(adapter)` with validation for required adapter methods and normalized async return values.
- [ ] Adapt the in-memory graph store without removing its current public methods.
- [ ] Run graph repository tests and the existing search suite.
- [ ] Commit with `feat: add graph repository contract`.

### Task 2: Persistent Supabase Graph Adapter

**Files:**
- Create: `lib/search/supabase-graph-adapter.js`
- Create: `supabase/migrations/20260902_cinema_graph.sql`
- Test: `tests/search/supabase-graph-adapter.test.js`

**Interfaces:**
- Consumes: graph repository adapter contract from Task 1.
- Produces: `createSupabaseGraphAdapter(client)` implementing the same graph operations.

- [ ] Write failing adapter tests using a fake Supabase client and assert exact table operations for nodes, edges, neighbors, and metadata.
- [ ] Run the focused test and verify failure.
- [ ] Add schema for `cinema_nodes` and `cinema_edges`, stable external IDs, typed relationships, provenance/confidence fields, observation timestamps, and indexes on entity/edge lookup keys.
- [ ] Implement the adapter with dependency injection; do not embed credentials.
- [ ] Run focused and full search tests.
- [ ] Commit with `feat: add persistent cinema graph adapter`.

### Task 3: Semantic Retrieval Contracts

**Files:**
- Create: `lib/search/embedding-provider.js`
- Create: `lib/search/semantic-index.js`
- Test: `tests/search/semantic-index.test.js`

**Interfaces:**
- Produces: `createEmbeddingProvider(adapter)` exposing `embedText(text)` and `embedBatch(texts)`.
- Produces: `createSemanticIndex(adapter)` exposing `upsert(document)` and `search(vector, options)`.

- [ ] Write failing tests for provider validation, deterministic fake embeddings, semantic index insertion, top-k search, filters, and no-provider fallback behavior.
- [ ] Run focused tests and verify failure.
- [ ] Implement the provider/index contracts without selecting a mandatory commercial model.
- [ ] Add a null semantic provider whose search returns an empty candidate list rather than failing deterministic search.
- [ ] Run focused and full tests.
- [ ] Commit with `feat: add semantic retrieval interfaces`.

### Task 4: Hybrid Candidate Fusion

**Files:**
- Create: `lib/search/hybrid-retrieval.js`
- Modify: `lib/search/rank.js`
- Modify: `lib/search/orchestrator.js`
- Test: `tests/search/hybrid-retrieval.test.js`
- Test: `tests/search/orchestrator.test.js`

**Interfaces:**
- Consumes: lexical candidates, graph candidates, semantic candidates, structured constraints.
- Produces: `retrieveHybridCandidates(queryPlan, dependencies)` returning ranked candidates with additive `matchSignals`.

- [ ] Write failing tests showing a candidate can rank through combined lexical, graph, and semantic evidence and that deterministic results still work when semantic retrieval is absent.
- [ ] Run focused tests and verify failure.
- [ ] Implement normalized score fusion with explicit source weights supplied through configuration rather than hidden constants.
- [ ] Integrate hybrid retrieval into orchestration behind dependency injection.
- [ ] Ensure existing MovieFinder result fields remain unchanged and add `matchSignals` only as optional metadata.
- [ ] Run all search tests.
- [ ] Commit with `feat: add hybrid cinema retrieval`.

### Task 5: Provenance and Evidence Hardening

**Files:**
- Modify: `lib/search/evidence.js`
- Modify: `lib/search/verification.js`
- Modify: `lib/search/availability.js`
- Test: `tests/search/verification.test.js`

**Interfaces:**
- Produces normalized evidence records with `source`, `sourceType`, `observedAt`, `confidence`, `claimType`, and optional validity interval.

- [ ] Write failing tests for stale evidence, conflicting evidence, unknown availability, and unsupported factual claims.
- [ ] Run focused tests and verify failure.
- [ ] Implement evidence normalization and freshness evaluation.
- [ ] Extend verification to summarize support/conflict state without converting unknown availability to unavailable.
- [ ] Run all tests.
- [ ] Commit with `feat: strengthen evidence provenance`.

### Task 6: Bounded Agent Contracts

**Files:**
- Create: `lib/search/agents.js`
- Modify: `lib/search/model-router.js`
- Test: `tests/search/agents.test.js`

**Interfaces:**
- Produces: `createCinemaAgent({ name, capability, modelRouter, validateOutput })`.
- Agent output is structured enrichment/evidence only; it cannot directly mark an unverified fact as verified.

- [ ] Write failing tests for capability routing, structured output validation, timeout/failure fallback, and rejection of invalid evidence.
- [ ] Run focused tests and verify failure.
- [ ] Implement bounded agent execution using the existing provider-neutral model router.
- [ ] Add deterministic no-model behavior that skips agent enrichment cleanly.
- [ ] Run all tests.
- [ ] Commit with `feat: add bounded cinema agents`.

### Task 7: Benchmark and Regression Corpus

**Files:**
- Create: `benchmarks/cinema-queries.json`
- Create: `lib/search/evaluate.js`
- Create: `tests/search/evaluate.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `evaluateCases(cases, executeSearch)` with relevance, evidence coverage, unsupported-claim, availability, latency, and pass/fail summaries.

- [ ] Create representative benchmark cases for actors, directors, producers, eras, genres, semantic concepts, relationships, streaming availability, and compound searches.
- [ ] Write failing evaluator tests using controlled search outputs.
- [ ] Implement deterministic metric calculation and JSON summary output.
- [ ] Add an `npm run benchmark` command.
- [ ] Run unit tests and the benchmark command.
- [ ] Commit with `test: add cinema intelligence benchmarks`.

### Task 8: Cinema Intelligence Service Contracts

**Files:**
- Create: `lib/search/cinema-service.js`
- Create: `api/cinema-search.js`
- Create: `api/cinema-person.js`
- Create: `api/cinema-explain.js`
- Test: `tests/search/cinema-service.test.js`

**Interfaces:**
- Produces service methods `search`, `person`, and `explain` using existing orchestration.
- New endpoints are additive; existing endpoints are not removed.

- [ ] Write failing service tests for compatible search results, person filmography, and explanation/evidence output.
- [ ] Run focused tests and verify failure.
- [ ] Implement the service facade and thin Vercel endpoint adapters.
- [ ] Verify no existing endpoint or frontend contract is removed.
- [ ] Run all tests.
- [ ] Commit with `feat: expose cinema intelligence service`.

### Task 9: Positioning and Architecture Documentation

**Files:**
- Modify: `README.md`
- Create: `docs/CINEMA_INTELLIGENCE_ENGINE.md`

**Interfaces:**
- Documentation distinguishes current capabilities from roadmap capabilities.

- [ ] Update the repository headline to describe MovieFinder as the first application powered by the Cinema Intelligence Engine.
- [ ] Document the implemented data flow, extension interfaces, evidence model, deterministic fallback, benchmark command, and API surfaces.
- [ ] Keep future persistent/semantic/agent features labeled accurately until their tasks are implemented.
- [ ] Run documentation-sensitive/homepage tests and the complete suite.
- [ ] Commit with `docs: position MovieFinder as cinema intelligence platform`.

### Task 10: Production Verification

**Files:**
- Modify only files required by failures discovered during verification.

**Interfaces:**
- Produces a release candidate whose current MovieFinder UI remains compatible.

- [ ] Run `npm test`.
- [ ] Run `npm run benchmark`.
- [ ] Verify representative searches for actor, director, producer, era/genre, semantic relationship, and availability behavior.
- [ ] Verify no credentials or private provider keys are committed.
- [ ] Verify Vercel configuration still routes the current application correctly.
- [ ] Review the branch diff for accidental UI changes.
- [ ] Commit any verification fixes separately and prepare the branch for pull-request review.
