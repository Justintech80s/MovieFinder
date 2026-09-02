# MovieFinder Backend Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden MovieFinder's hybrid JavaScript/Python search backend without changing its UI or public `/api/search` interface.

**Architecture:** Keep `/api/search` as the stable gateway, move upstream-specific transport behind providers, validate the JS/Python boundary, add bounded caching/reliability/telemetry, and keep JavaScript as the automatic fallback whenever Python cannot safely answer. Changes are incremental and test-first.

**Tech Stack:** Node.js ES modules, node:test, Python 3.11, FastAPI, Pydantic, pytest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-02-moviefinder-backend-hardening-design.md`

## Global Constraints

- No frontend files or visual behavior changes.
- Preserve the public `/api/search` contract.
- Keep Wikidata and JustWatch as primary sources for this pass.
- Do not add TMDB, Redis, authentication, tracking, or a recommendation UI.
- Python remains guarded by `MOVIEFINDER_PYTHON_SEARCH_URL` and JavaScript remains the fallback.
- Use TDD: failing test, verified RED, minimal implementation, verified GREEN.
- Preserve existing exact-title, free, year/genre, Rotten Tomatoes, and person-filmography regressions.

---

### Task 1: Runtime-validate the Python service contract

**Files:**
- Create: `lib/search/contracts.js`
- Modify: `lib/search/python-service.js`
- Modify: `tests/search/python-service.test.js`

**Interfaces:**
- Produces: `validatePythonPersonSearchResponse(value) -> normalized object | null`
- `runPythonPersonSearch()` returns validated data or `null`.

- [ ] Add failing tests for malformed `filmography`, missing `availabilitySummary`, and malformed `person` responses; each must return `null`.
- [ ] Run `node --test tests/search/python-service.test.js` and verify RED.
- [ ] Implement dependency-free structural validation in `contracts.js`; require object response, `person` object or null, array `filmography`, array `results`, object `availabilitySummary`, and boolean-compatible `verified`.
- [ ] Make `runPythonPersonSearch()` pass decoded JSON through the validator.
- [ ] Re-run the focused Node test and verify GREEN.
- [ ] Commit with `feat: validate Python search contract`.

### Task 2: Add explicit Python timeout coverage

**Files:**
- Modify: `tests/search/python-service.test.js`
- Modify: `lib/search/python-service.js` only if the test reveals a defect.

**Interfaces:**
- `runPythonPersonSearch(intent, { timeoutMs }) -> Promise<object|null>`.

- [ ] Add a failing timeout test using a fetch stub that rejects when its AbortSignal fires.
- [ ] Run the focused test and verify RED if current behavior is incomplete.
- [ ] Make the smallest timeout/AbortController correction required.
- [ ] Verify the focused suite GREEN.
- [ ] Commit with `test: cover Python service timeout fallback`.

### Task 3: Extract the JustWatch provider

**Files:**
- Create: `lib/search/providers/justwatch.js`
- Create: `tests/search/justwatch-provider.test.js`
- Modify: `api/search.js`

**Interfaces:**
- Produces: `searchJustWatch(search, { first, fetchImpl, timeoutMs, retries }) -> Promise<Movie[]>`
- Produces normalized MovieFinder movie objects including offers and ratings.

- [ ] Add provider tests that prove GraphQL variables preserve the exact title and normalized output preserves title/year/offers.
- [ ] Run the focused test and verify RED because the provider does not exist.
- [ ] Move `JUSTWATCH_QUERY`, transport, poster mapping, node mapping, and best-offer helpers behind the provider without changing semantics.
- [ ] Change `api/search.js` to consume the provider instead of knowing GraphQL details.
- [ ] Run provider tests plus `tests/search/api-handler.test.js`; verify GREEN.
- [ ] Commit with `refactor: isolate JustWatch provider`.

### Task 4: Add bounded upstream timeout and retry policy

**Files:**
- Modify: `lib/search/providers/justwatch.js`
- Modify: `tests/search/justwatch-provider.test.js`

**Interfaces:**
- Retry only timeout/429/selected 5xx failures.
- Deterministic 4xx and malformed responses fail immediately.

- [ ] Add tests: 503 then success performs one retry; 400 performs no retry; timeout is bounded; malformed GraphQL response is not retried.
- [ ] Verify RED.
- [ ] Implement a strict attempt cap and exponential backoff with injectable sleep for deterministic tests.
- [ ] Verify GREEN.
- [ ] Commit with `feat: harden availability transport`.

### Task 5: Add bounded TTL cache abstraction

**Files:**
- Create: `lib/search/cache.js`
- Create: `tests/search/cache.test.js`

**Interfaces:**
- Produces: `createTTLCache({ maxEntries, now })` with `get(key)`, `set(key,value,ttlMs)`, `delete(key)`, `clear()`.

- [ ] Add tests for miss, hit, expiry, overwrite, and max-entry eviction.
- [ ] Verify RED.
- [ ] Implement a dependency-free Map-based bounded TTL cache.
- [ ] Verify GREEN.
- [ ] Commit with `feat: add bounded search cache`.

### Task 6: Cache filmography and availability separately

**Files:**
- Modify: `lib/search/people.js`
- Modify: `lib/search/providers/justwatch.js`
- Create or modify focused tests under `tests/search/`.

**Interfaces:**
- Filmography cache TTL is longer than availability TTL.
- Cache keys include normalized person/title and relevant role/provider constraints.

- [ ] Add a failing test proving repeated identical person resolution avoids duplicate resolver transport work.
- [ ] Add a failing test proving repeated availability lookup avoids duplicate JustWatch calls within TTL.
- [ ] Add a test proving the two TTL policies are distinct and expired availability refreshes without forcing filmography refresh.
- [ ] Verify RED.
- [ ] Wire independent cache instances/policies into the two provider boundaries without caching failures long-term.
- [ ] Verify GREEN.
- [ ] Commit with `feat: cache filmography and availability`.

### Task 7: Add structured request telemetry

**Files:**
- Create: `lib/search/telemetry.js`
- Create: `tests/search/telemetry.test.js`
- Modify: `api/search.js`

**Interfaces:**
- Produces: `createRequestContext({ now, randomUUID })` containing `requestId` and start time.
- Produces structured operational event objects; never include headers/secrets/upstream payloads.

- [ ] Add tests proving one request keeps one request ID and emitted data contains engine/count/duration fields without request headers.
- [ ] Verify RED.
- [ ] Implement request context and structured logger using `crypto.randomUUID()` with dependency injection for tests.
- [ ] Add request ID to response metadata only if doing so does not break existing response tests; otherwise keep it server-side.
- [ ] Verify GREEN.
- [ ] Commit with `feat: add search request telemetry`.

### Task 8: Type the Python API boundary and provider failures

**Files:**
- Modify: `python_search/moviebrain/models.py`
- Create: `python_search/moviebrain/errors.py`
- Modify: `python_search/moviebrain/app.py`
- Modify: `python_search/moviebrain/person_search.py`
- Modify: `python_search/tests/test_api.py`
- Modify: `python_search/tests/test_person_search.py`

**Interfaces:**
- Add Pydantic request/response models for person search.
- Add typed `AvailabilityError`, `AvailabilityTimeout`, `InvalidAvailabilityResponse`.

- [ ] Add failing API tests for malformed intent and malformed credits/request fields.
- [ ] Add failing orchestration tests proving typed availability failures become `UNKNOWN` records rather than crashing the search.
- [ ] Verify RED with `PYTHONPATH=python_search python -m pytest python_search/tests -q`.
- [ ] Implement Pydantic boundary models while preserving existing JSON field names expected by JS.
- [ ] Implement typed provider errors and narrow expected availability exception handling; unexpected programming exceptions should remain observable rather than silently masquerading as provider outages.
- [ ] Verify Python suite GREEN.
- [ ] Commit with `feat: type Python search boundary`.

### Task 9: Restore readable API orchestration

**Files:**
- Modify: `api/search.js`
- Test: `tests/search/api-handler.test.js`

**Interfaces:**
- No public behavior changes.

- [ ] Snapshot/extend behavior tests for exact title, free cleanup, year/genre, RT threshold, and person fallback before refactoring.
- [ ] Run and verify existing tests GREEN before refactor.
- [ ] Expand dense one-line functions/control flow into named readable helpers; keep provider details out of the handler.
- [ ] Re-run the same tests and verify GREEN.
- [ ] Commit with `refactor: simplify search API orchestration`.

### Task 10: Prepare batch-capable availability interface

**Files:**
- Modify: `lib/search/providers/justwatch.js`
- Modify: `lib/search/person-search.js`
- Create or modify focused tests under `tests/search/`.

**Interfaces:**
- Produce `lookupAvailabilityBatch(credits, intent) -> Promise<Map|Array>` while retaining bounded per-title calls internally until a real batch source exists.

- [ ] Add a failing test proving duplicate movie credits cause only one provider lookup and concurrency remains bounded.
- [ ] Verify RED if current abstraction cannot satisfy the batch interface.
- [ ] Implement the batch-capable internal interface without inventing unsupported JustWatch API behavior.
- [ ] Verify GREEN.
- [ ] Commit with `refactor: prepare batched availability lookup`.

### Task 11: Add performance/reliability regression tests

**Files:**
- Create: `tests/search/performance.test.js`
- Modify: `.github/workflows/tests.yml` only if normal `npm test` does not already discover the test.

**Interfaces:**
- CI assertions are deterministic call-count/concurrency assertions, not internet latency thresholds.

- [ ] Add tests proving cached repeated searches reduce provider calls and availability concurrency never exceeds configured bounds.
- [ ] Verify RED for any missing instrumentation/behavior.
- [ ] Implement only the minimal hooks required to make deterministic tests possible.
- [ ] Run full `npm test` and full Python pytest suite; verify GREEN.
- [ ] Commit with `test: add search performance regressions`.

### Task 12: Preview acceptance and integration

**Files:**
- No frontend changes.
- Update docs only if configuration behavior changed.

**Interfaces:**
- Production candidate must preserve current UI and `/api/search` behavior.

- [ ] Run full Node and Python CI on the final SHA.
- [ ] Verify a Vercel Preview for the exact MovieFinder project.
- [ ] Smoke-test: `Quentin Tarantino streaming movies`, `Quentin Tarantino movies`, `all Will Smith movies available on streaming`, `movies directed by Christopher Nolan`, `1994 crime movies`, `scary movies Rotten Tomatoes 90%+`, `The Godfather`, and `Star Wars free`.
- [ ] Inspect logs for Python fallback, provider errors, and request IDs.
- [ ] Only after all checks pass, merge/promote according to the repository release workflow.
