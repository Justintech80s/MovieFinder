# Cinema Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a relationship-aware Cinema Graph, deterministic RAG/evidence layer, search planner, verification pipeline, and plug-and-play model boundary without requiring GPU infrastructure.

**Architecture:** Existing Node search remains the production orchestrator and existing FastAPI/Python capabilities remain available. New intelligence modules expose narrow interfaces and degrade to deterministic search whenever AI is disabled or unavailable.

**Tech Stack:** Node.js ES modules, existing MovieFinder FastAPI/Python service, Vercel, existing test runner.

**Spec:** `docs/superpowers/specs/2026-09-02-cinema-intelligence-design.md`

## Global Constraints
- Preserve current UI and existing search behavior.
- No mandatory LangChain/Ollama/vLLM/Transformers dependency.
- Model calls are optional and fail open to deterministic retrieval.
- Evidence/provenance is required for relationship explanations.
- Existing filmography and availability modules remain authoritative retrieval tools.

---

### Task 1: Typed Cinema Graph Core

**Files:**
- Create: `lib/search/cinema-graph/types.js`
- Create: `lib/search/cinema-graph/store.js`
- Create: `lib/search/cinema-graph/traverse.js`
- Modify: `lib/search/cinema-graph.js`
- Create: `tests/cinema-graph.test.js`

**Interfaces:**
- Produces `createCinemaGraph()`, `upsertNode()`, `addEdge()`, `neighbors()`, and `traverseCinemaGraph()`.
- Graph edges expose `type`, `weight`, `confidence`, `provenance`, and `metadata`.

- [ ] Write failing tests proving typed nodes/edges can be added, duplicate IDs are normalized, and traversal returns only requested relationship types.
- [ ] Run the Cinema Graph tests and verify they fail before implementation.
- [ ] Implement the minimal in-memory typed graph store and bounded traversal.
- [ ] Keep compatibility exports from `lib/search/cinema-graph.js` so current callers do not break.
- [ ] Run graph tests and the existing Node test suite.
- [ ] Commit with `feat: add typed cinema graph core`.

### Task 2: Evidence and RAG Packets

**Files:**
- Create: `lib/search/evidence.js`
- Create: `lib/search/rag.js`
- Create: `tests/rag.test.js`

**Interfaces:**
- Produces `createEvidenceRecord(input)` and `buildEvidencePacket({query, candidates, graphPaths, sources})`.
- Evidence records expose `kind`, `source`, `claim`, `confidence`, `path`, and `metadata`.

- [ ] Write failing tests for evidence normalization, confidence bounds, duplicate evidence removal, and compact graph-path serialization.
- [ ] Run the new tests and verify failure.
- [ ] Implement evidence normalization and deterministic packet construction with no model dependency.
- [ ] Run RAG tests plus the full suite.
- [ ] Commit with `feat: add cinema evidence retrieval layer`.

### Task 3: Deterministic Search Planner

**Files:**
- Create: `lib/search/planner.js`
- Create: `tests/planner.test.js`

**Interfaces:**
- Produces `buildSearchPlan(intent)` returning `{steps, constraints, needsAvailability, allowAI}`.
- Step tools are restricted to registered deterministic tools such as `personSearch`, `filmography`, `cinemaGraph`, and `availability`.

- [ ] Write failing tests for person-filmography, relationship, genre/era, and availability queries.
- [ ] Verify tests fail.
- [ ] Implement rule-based planning from existing intent fields and Cinema Graph concepts.
- [ ] Ensure unknown queries receive a safe baseline retrieval plan rather than an empty plan.
- [ ] Run planner and full tests.
- [ ] Commit with `feat: add deterministic search planner`.

### Task 4: Plug-and-Play Model Provider Boundary

**Files:**
- Create: `lib/ai/provider.js`
- Create: `lib/ai/noop-provider.js`
- Create: `lib/ai/http-provider.js`
- Create: `lib/ai/index.js`
- Create: `tests/ai-provider.test.js`

**Interfaces:**
- Produces `getModelProvider(config)` and provider method `generateStructured({task, input, schema, timeoutMs})`.
- No-op provider returns an explicit unavailable result instead of throwing.

- [ ] Write failing tests for disabled AI, HTTP success, timeout, malformed JSON, and provider failure.
- [ ] Verify tests fail.
- [ ] Implement the no-op and generic HTTP provider with bounded timeout and structured-result validation.
- [ ] Ensure no vendor SDK is required by default.
- [ ] Run provider and full tests.
- [ ] Commit with `feat: add model provider abstraction`.

### Task 5: Verification Layer

**Files:**
- Create: `lib/search/verify.js`
- Create: `tests/verify.test.js`

**Interfaces:**
- Produces `verifyEnrichment({enrichment, evidence})` returning `{accepted, rejected, confidence}`.

- [ ] Write failing tests showing supported claims survive, unsupported claims are rejected, and deterministic evidence outranks model assertions.
- [ ] Verify tests fail.
- [ ] Implement claim matching against normalized evidence and graph paths.
- [ ] Run verification and full tests.
- [ ] Commit with `feat: verify ai cinema enrichment`.

### Task 6: Search Orchestration Integration

**Files:**
- Modify the existing API/search orchestration entry point identified from `api/` during execution.
- Modify: `lib/search/rank.js`
- Modify: `lib/search/cinema-graph.js`
- Create: `tests/cinema-intelligence-integration.test.js`

**Interfaces:**
- Consumes planner, graph traversal, RAG packets, optional provider enrichment, and verification.
- Existing response fields remain backward compatible; verified relationship reasons are additive.

- [ ] Identify the current orchestration entry point and write an integration test around its public contract before changing it.
- [ ] Add a failing test proving AI-disabled searches still return baseline results.
- [ ] Add a failing test proving a relationship query can receive graph-derived ranking evidence.
- [ ] Wire planning and deterministic tools first, then optional enrichment, then verification.
- [ ] Add graph/evidence contribution to ranking without overriding hard constraints or authoritative availability.
- [ ] Run all Node and Python tests.
- [ ] Commit with `feat: integrate cinema intelligence search pipeline`.

### Task 7: Operational Documentation and Compatibility Verification

**Files:**
- Modify: `README.md` if present; otherwise create `docs/cinema-intelligence.md`.
- Modify environment/example documentation if present.

**Interfaces:**
- Documents AI-disabled default behavior and generic provider configuration.

- [ ] Document the pipeline, provider contract, failure fallback, and future Ollama/vLLM service attachment point.
- [ ] Verify no mandatory GPU/model package was added.
- [ ] Run the complete test suite and inspect Vercel configuration for compatibility.
- [ ] Commit with `docs: document cinema intelligence architecture`.
