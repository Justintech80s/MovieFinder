# Phase 4 Live Search Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect MovieFinder's persistent Cinema Graph and production AI router to the live `/api/search` path with selective AI use, verified evidence, deterministic constraints, current JustWatch availability, and clean fallback behavior.

**Architecture:** Add `lib/search/live-orchestrator.js` as the application coordinator between the existing parser/search primitives and the HTTP handler. Simple high-confidence searches remain deterministic; complex relationship searches may use persistent graph reads and the existing model router, but only after a verified evidence package has been assembled and current availability has been checked. `api/search.js` remains the security/HTTP boundary and delegates application search behavior without weakening existing controls.

**Tech Stack:** Node.js ES modules, built-in `node:test`, existing MovieFinder search modules, persistent Cinema Graph adapter, existing production model router/adapters, JustWatch GraphQL availability, Supabase-backed graph repository through injected interfaces, GitHub Actions, CodeQL.

**Spec:** `docs/superpowers/specs/2026-09-02-phase4-live-search-orchestration-design.md`

## Global Constraints

- `/api/search` remains GET-only with existing bounded query validation, rate limiting, security headers, safe public errors, and bounded JustWatch requests.
- Simple deterministic searches must not incur AI latency or require an AI provider key.
- Persistent graph failure or missing graph configuration must fall back to existing deterministic behavior.
- AI failure must not fail a request that deterministic/graph search can answer.
- Streaming availability is authoritative only from the current availability path; graph facts never become current streaming claims by themselves.
- Hard constraints and deterministic ranking remain authoritative for final result inclusion/exclusion.
- AI receives only bounded verified evidence; never secrets, environment variables, raw request headers, database credentials, arbitrary SQL, or provider endpoint overrides.
- Graph traversal depth, candidate count, availability fan-out, and AI context size must be bounded.
- Existing frontend response fields remain compatible; Phase 4 fields are additive and optional.
- No live Wikidata access is introduced into `/api/search`.
- No schema migration or UI redesign unless a missing graph read operation is proven during implementation.

---

## File Structure

- Create `lib/search/live-orchestrator.js`: selective-AI decision, graph read coordination, verified evidence assembly, AI invocation/fallback, result metadata.
- Modify `api/search.js`: inject/delegate to the new orchestrator while retaining HTTP/security/analytics/outbound tracking behavior.
- Modify `lib/search/ai-enrichment.js` only if needed to expose a bounded verified-evidence synthesis helper; do not duplicate provider routing.
- Reuse `lib/search/model-router.js`: provider/capability routing and deterministic fallback.
- Reuse `lib/search/persistent-graph-store.js`: bounded graph reads/traversal; extend only if the exact read needed by tests does not exist.
- Reuse `lib/search/constraints.js`, `lib/search/rank.js`, `lib/search/person-search.js`, and `lib/search/availability.js`: authoritative filtering/ranking/availability semantics.
- Create `tests/search/live-orchestrator.test.js`: Phase 4 core TDD contracts and integration-style fixture.
- Modify `tests/search/api-handler.test.js`: response compatibility and delegation behavior.
- Modify `tests/security/backend-security.test.js`: regression assertions only if delegation could affect security boundaries.
- Modify `README.md`: selective AI + graph/live-availability architecture and fallback documentation.

---

### Task 1: Define selective orchestration and verified-evidence contracts

**Files:**
- Create: `tests/search/live-orchestrator.test.js`
- Create: `lib/search/live-orchestrator.js`

**Interfaces:**
- Produces: `shouldUseAi({ query, parsedIntent }) -> boolean`
- Produces: `buildVerifiedEvidence({ query, parsedIntent, graph, movies, currentAvailability, constraints, provenance, confidence }) -> object`
- Produces: `createLiveOrchestrator(dependencies) -> { search(input) }`
- `search({ query, parsedIntent })` returns `{ parsed, results, filmography?, availabilitySummary?, answer?, reasoningMode, evidence?, ai? }`.

- [ ] **Step 1: Write failing tests for deterministic AI selection**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldUseAi } from '../../lib/search/live-orchestrator.js';

test('simple direct provider lookup skips AI', () => {
  assert.equal(shouldUseAi({
    query: 'Will Smith movies on Netflix',
    parsedIntent: { kind: 'person-filmography', person: 'Will Smith', provider: 'Netflix', concepts: [] }
  }), false);
});

test('multi-concept relationship query requests AI-capable orchestration', () => {
  assert.equal(shouldUseAi({
    query: '1970s paranoid thrillers influenced by European cinema that are streaming now',
    parsedIntent: { kind: 'discovery', concepts: ['paranoia', 'influence', 'european-cinema'] }
  }), true);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/search/live-orchestrator.test.js`

Expected: FAIL because `lib/search/live-orchestrator.js` / `shouldUseAi` does not exist.

- [ ] **Step 3: Implement the minimal deterministic selector**

```js
export function shouldUseAi({ query='', parsedIntent={} }={}) {
  const concepts = Array.isArray(parsedIntent.concepts) ? parsedIntent.concepts : [];
  const direct = parsedIntent.kind === 'person-filmography' || parsedIntent.kind === 'title';
  const relationshipLanguage = /\b(like|similar|influenc|connected|relationship|compare|why|theme|movement)\b/i.test(query);
  const lowConfidence = Number.isFinite(parsedIntent.confidence) && parsedIntent.confidence < 0.7;
  return relationshipLanguage || concepts.length >= 2 || lowConfidence || !direct;
}
```

Keep the selector pure and deterministic. If existing intent shapes use different exact `kind` values, adapt the tests to the repository's real parser output before implementation rather than inventing a parallel schema.

- [ ] **Step 4: Add failing evidence-package tests**

```js
import { buildVerifiedEvidence } from '../../lib/search/live-orchestrator.js';

test('verified evidence contains only explicit supplied facts and is bounded', () => {
  const evidence = buildVerifiedEvidence({
    query: 'movies like The Conversation',
    parsedIntent: { kind: 'discovery' },
    graph: { entities: [{ id:'m1', name:'The Conversation' }], relations: [], paths: [] },
    movies: [{ id:'m1', title:'The Conversation', year:1974 }],
    currentAvailability: [{ movieId:'m1', provider:'Max', checkedAt:'2026-09-02T12:00:00.000Z' }],
    constraints: {},
    provenance: [{ source:'Wikidata', externalId:'Q123' }],
    confidence: 0.93
  });
  assert.equal(evidence.movies[0].title, 'The Conversation');
  assert.equal(evidence.currentAvailability[0].provider, 'Max');
  assert.equal('env' in evidence, false);
  assert.equal('headers' in evidence, false);
});
```

- [ ] **Step 5: Implement bounded evidence assembly and verify GREEN**

Implement exact caps as constants in `live-orchestrator.js`:

```js
const MAX_ENTITIES = 40;
const MAX_RELATIONS = 80;
const MAX_PATHS = 20;
const MAX_MOVIES = 40;
const MAX_AVAILABILITY = 120;
const MAX_PROVENANCE = 80;
```

`buildVerifiedEvidence` must copy only the explicit whitelisted keys from its arguments and slice arrays to those caps. Do not serialize arbitrary dependency objects.

Run: `node --test tests/search/live-orchestrator.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/search/live-orchestrator.js tests/search/live-orchestrator.test.js
git commit -m "feat: define live search orchestration contracts"
```

---

### Task 2: Add bounded persistent-graph candidate retrieval with fallback

**Files:**
- Modify: `lib/search/live-orchestrator.js`
- Test: `tests/search/live-orchestrator.test.js`
- Modify only if required by failing test: `lib/search/persistent-graph-store.js`

**Interfaces:**
- Consumes: injected `graphStore` supporting existing persistent graph read/traversal methods.
- Produces internal `readGraphCandidates({ query, parsedIntent }) -> { entities, relations, paths, movies }`.
- Graph errors return an empty graph package plus fallback metadata; they do not throw through the normal search path.

- [ ] **Step 1: Write failing graph-success and graph-failure tests**

Use a fake graph store whose traversal returns a known path connecting a seed film to a theme/movement and whose movie node list contains two known candidates. Assert `reasoningMode` can become `graph` for complex queries and that graph failure calls the injected deterministic fallback.

```js
test('graph failure falls back to deterministic search', async () => {
  let fallbackCalls = 0;
  const orchestrator = createLiveOrchestrator({
    graphStore: { traverse: async () => { throw new Error('db unavailable'); } },
    deterministicSearch: async () => { fallbackCalls += 1; return { parsed:{}, results:[{title:'Heat',year:1995}] }; }
  });
  const result = await orchestrator.search({ query:'Heat', parsedIntent:{kind:'title'} });
  assert.equal(fallbackCalls, 1);
  assert.equal(result.results[0].title, 'Heat');
  assert.equal(result.reasoningMode, 'deterministic');
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `node --test tests/search/live-orchestrator.test.js`

Expected: FAIL because graph coordination/fallback is not implemented.

- [ ] **Step 3: Implement bounded graph reads**

Use injected dependencies only. Add constants `MAX_GRAPH_DEPTH = 3` and `MAX_GRAPH_CANDIDATES = 40`. Never perform unbounded traversal. Preserve source/provenance returned by the graph adapter.

If the persistent store lacks the exact bounded read required, first add a failing unit test in `tests/search/persistent-graph-store.test.js`, then add the smallest compatible read method. Do not change schema.

- [ ] **Step 4: Run focused graph suites**

Run: `node --test tests/search/live-orchestrator.test.js tests/search/persistent-graph-store.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/search/live-orchestrator.js lib/search/persistent-graph-store.js tests/search/live-orchestrator.test.js tests/search/persistent-graph-store.test.js
git commit -m "feat: add bounded persistent graph search"
```

---

### Task 3: Enforce live availability before graph-derived streaming claims

**Files:**
- Modify: `lib/search/live-orchestrator.js`
- Test: `tests/search/live-orchestrator.test.js`
- Reuse: `lib/search/availability.js`
- Reuse: `lib/search/constraints.js`
- Reuse: `lib/search/rank.js`

**Interfaces:**
- Consumes injected `lookupAvailability(movie, parsedIntent)` returning current normalized movie/offers or `null`.
- Produces final `results` only after availability checks, hard constraints, and deterministic ranking.

- [ ] **Step 1: Write failing availability-authority test**

Create two graph candidate movies. Fake availability returns a Netflix offer for only one. Use a parsed provider constraint for Netflix. Assert only the currently available candidate survives even if both graph candidates match the thematic relationship.

- [ ] **Step 2: Run focused test and verify RED**

Run: `node --test tests/search/live-orchestrator.test.js`

Expected: FAIL because graph candidates are not yet passed through live availability.

- [ ] **Step 3: Implement bounded availability fan-out**

Limit graph-derived availability candidates to `MAX_GRAPH_CANDIDATES` and concurrency to 6, matching the established person-filmography behavior. Reuse normalized availability helpers and `matchesHardConstraints` / `rankResults`; do not duplicate provider semantics.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/search/live-orchestrator.test.js tests/search/availability.test.js tests/search/constraints.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/search/live-orchestrator.js tests/search/live-orchestrator.test.js
git commit -m "feat: verify graph candidates with live availability"
```

---

### Task 4: Integrate the production model router over verified evidence only

**Files:**
- Modify: `lib/search/live-orchestrator.js`
- Modify only if required: `lib/search/ai-enrichment.js`
- Reuse: `lib/search/model-router.js`
- Test: `tests/search/live-orchestrator.test.js`
- Regression: `tests/search/model-router.test.js`, `tests/search/ai-enrichment.test.js`

**Interfaces:**
- Consumes injected `modelRouter` exposing existing capability invocation.
- Uses capabilities `intent_interpretation`, `cinema_reasoning`, `answer_synthesis` only as warranted.
- Produces optional `answer` and `ai:{provider,model}` metadata; verified `results` remain untouched by model text.

- [ ] **Step 1: Write failing test proving simple search never calls AI**

Use a fake router whose method throws if called. A direct person/provider query must still succeed through the deterministic dependency.

- [ ] **Step 2: Write failing test proving AI receives only verified evidence**

Capture the fake router input. Assert the context equals the evidence package and contains no request headers, environment values, fetch objects, database client, or outbound URLs that were not already verified result data.

- [ ] **Step 3: Write failing test proving AI cannot overwrite verified facts**

Return synthesis that falsely claims a different year/provider. Assert `results[0].year` and normalized offers remain the verified values. `answer` may contain provider text only after sanitization/grounding rules; safest initial implementation is to treat `answer` as commentary and never parse it back into structured fields.

- [ ] **Step 4: Write failing AI-failure fallback test**

Fake router throws `provider timeout`. Assert final structured results return normally with `reasoningMode:'graph'` or `'deterministic'`, no `ai` field, and no 5xx propagated from the orchestrator.

- [ ] **Step 5: Run and verify RED**

Run: `node --test tests/search/live-orchestrator.test.js`

Expected: FAIL on the new AI contracts.

- [ ] **Step 6: Implement minimal router integration**

Call the existing model router only when `shouldUseAi(...)` is true. Pass the bounded verified package as context. Do not allow model output to mutate `results`, `filmography`, availability offers, redirect URLs, title/year IDs, or provenance. On router error, drop optional AI enrichment and return verified results.

- [ ] **Step 7: Verify router regression suites**

Run: `node --test tests/search/live-orchestrator.test.js tests/search/model-router.test.js tests/search/ai-enrichment.test.js`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/search/live-orchestrator.js lib/search/ai-enrichment.js tests/search/live-orchestrator.test.js
git commit -m "feat: add verified AI reasoning to live search"
```

---

### Task 5: Delegate `/api/search` application behavior to the live orchestrator

**Files:**
- Modify: `api/search.js`
- Modify: `tests/search/api-handler.test.js`
- Modify if needed for regression assertions: `tests/security/backend-security.test.js`
- Test: `tests/search/live-orchestrator.test.js`

**Interfaces:**
- `createSearchHandler({ ..., liveOrchestrator })` accepts an injected orchestrator for tests.
- Default handler constructs/uses production dependencies without exposing secrets to AI.
- HTTP/security/analytics/outbound tracking remain in `api/search.js`.

- [ ] **Step 1: Write failing API delegation and compatibility tests**

Assert an injected orchestrator is called only after method validation, query validation, and rate limiting. Assert existing successful response keys (`parsed`, `results`, `filmography`, `availabilitySummary`, `liveAt`, `dataQuality` where applicable) remain unchanged and optional Phase 4 fields may be appended.

- [ ] **Step 2: Write security-order regression assertion**

For invalid/oversized query, inject an orchestrator that throws if called. Assert existing 400 response occurs and the orchestrator call count is zero.

- [ ] **Step 3: Run API/security tests and verify RED**

Run: `node --test tests/search/api-handler.test.js tests/security/backend-security.test.js`

Expected: FAIL because the handler has not yet delegated to the new coordinator.

- [ ] **Step 4: Refactor minimally**

Keep `applyApiSecurityHeaders`, method enforcement, `validateSearchQuery`, limiter, analytics identity/events, tracked outbound URLs, and safe error normalization in the HTTP layer. Move search-domain branching into the orchestrator through injected callbacks/dependencies rather than duplicating JustWatch or filmography logic.

The safe error boundary remains:
- required availability failure -> `503 AVAILABILITY_UNAVAILABLE`;
- unexpected HTTP-layer failure -> `500 SEARCH_INTERNAL_ERROR`;
- AI/graph optional-enrichment failures are absorbed by the orchestrator and should not reach this boundary.

- [ ] **Step 5: Run API/security suites and verify GREEN**

Run: `node --test tests/search/api-handler.test.js tests/security/backend-security.test.js tests/security/protected-endpoints-security.test.js tests/search/live-orchestrator.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/search.js tests/search/api-handler.test.js tests/security/backend-security.test.js tests/search/live-orchestrator.test.js
git commit -m "feat: connect live orchestrator to search API"
```

---

### Task 6: Add the complex-query integration fixture

**Files:**
- Modify: `tests/search/live-orchestrator.test.js`

**Interfaces:**
- Fake graph -> known entities/relations/path.
- Fake availability -> current offers/check time.
- Fake AI router -> captures verified evidence and returns synthesis.
- Final response -> verified candidates/offers plus optional explanation and `reasoningMode:'graph+ai'`.

- [ ] **Step 1: Write the full integration-style fixture**

Use a complex query such as `movies like The Conversation with political surveillance themes that are streaming now`. The graph fake should return The Conversation plus one supported related movie and one candidate that fails the final hard/availability constraints. Availability should leave only verified currently-streaming candidates. AI synthesis should mention only evidence supplied to it.

- [ ] **Step 2: Verify focused fixture GREEN**

Run: `node --test tests/search/live-orchestrator.test.js`

Expected: PASS with no live network/database requirement.

- [ ] **Step 3: Commit**

```bash
git add tests/search/live-orchestrator.test.js
git commit -m "test: cover complex live cinema orchestration"
```

---

### Task 7: Document selective AI production behavior

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add architecture documentation**

Document these exact behaviors in the existing architecture/usage style:
- simple searches: deterministic, no AI required;
- complex searches: bounded persistent graph + optional AI reasoning;
- JustWatch remains current availability authority;
- AI cannot overwrite structured verified facts;
- fallback order: graph/AI optional enrichment -> deterministic search survives;
- supported provider keys remain server-side only;
- no live Wikidata in request path.

- [ ] **Step 2: Run README-related/static tests if present**

Run: `npm test`

Expected: full Node suite PASS before commit.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: explain selective AI live search"
```

---

### Task 8: Full exact-head verification and PR preparation

**Files:**
- No production changes unless verification exposes a rooted defect.
- GitHub Actions: `.github/workflows/tests.yml`, `.github/workflows/codeql.yml` unchanged unless a verified CI configuration defect is found.

- [ ] **Step 1: Run the full local/available test commands**

```bash
npm test
cd python_search && pytest -q
```

Expected: all Node and Python tests PASS.

If local execution is unavailable in the current tool environment, do not claim pass; push the exact head and use GitHub Actions as fresh execution evidence.

- [ ] **Step 2: Open a pull request against `main`**

Title: `feat: connect Cinema Graph and AI to live search`

Body must summarize selective AI behavior, graph fallback, live-availability authority, verified-evidence boundary, security preservation, and current verification status without claiming checks that have not run.

- [ ] **Step 3: Verify exact PR head through GitHub Actions**

Require fresh successful results for:
- Search Brain Tests (full Node + Python + existing live JustWatch/Wikidata checks where configured);
- CodeQL Security Scan.

Inspect exact-head run/job logs rather than relying only on an older branch run.

- [ ] **Step 4: Review final diff against the spec**

Confirm:
- no AI call on simple direct query;
- graph/AI failures degrade to deterministic behavior;
- current availability is checked before streaming claims;
- no model output mutates structured facts;
- query/security boundaries still execute before application orchestration;
- existing frontend keys remain compatible;
- no new secret, live Wikidata request, schema migration, or UI change was introduced unintentionally.

- [ ] **Step 5: Stop at merge gate**

Do not merge automatically. Present the exact PR head SHA and fresh CI/CodeQL evidence and wait for explicit merge authorization.

---

## Self-Review Results

- **Spec coverage:** Selective AI, graph integration, availability authority, verified evidence, AI safety/fallback, graph fallback, API compatibility, security preservation, bounded performance, documentation, full CI, live checks, and CodeQL each map to a task above.
- **Placeholder scan:** No `TBD`, `TODO`, “implement later,” or unspecified error-handling steps remain. Conditional edits are allowed only when a failing test proves the existing interface is insufficient.
- **Type/interface consistency:** `createLiveOrchestrator`, `shouldUseAi`, `buildVerifiedEvidence`, injected `graphStore`, `deterministicSearch`, `lookupAvailability`, and `modelRouter` are used consistently across tasks.
- **Scope:** No schema migration, UI redesign, vector database, live Wikidata request path, login system, or autonomous model browsing is included.
