# MovieFinder Python Search Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Python-capable Cinema Brain backend that returns complete, deduplicated person filmographies and preserves MovieFinder's existing visual UI and `/api/search` contract.

**Architecture:** Keep the current Vercel frontend and JavaScript `/api/search` route as the compatibility boundary. First make filmography aggregation a tested contract, then implement the same contract in a focused FastAPI service and add a guarded adapter so Python can own person-search intelligence without requiring any frontend change. Existing catalog search remains untouched unless a regression test requires a compatibility fix.

**Tech Stack:** JavaScript/Node.js, Python 3.11+, FastAPI, Pydantic, pytest, Node test runner, Vercel preview deployment.

**Spec:** `docs/superpowers/specs/2026-09-01-moviefinder-python-search-backend.md`

## Global Constraints

- Do not redesign or intentionally modify the visible MovieFinder frontend.
- Preserve the existing `/api/search` response shape and existing result fields.
- Generic person searches include cast, director, producer, and writer credits.
- Explicit role searches remain role-specific.
- Aggregate duplicate movie credits before any availability fan-out.
- Availability lookup occurs once per unique movie.
- Existing genre/year/Rotten Tomatoes/provider/free/rent/buy hard constraints continue working.
- Test-first development is mandatory.
- Production remains untouched until CI and Preview acceptance pass.

---

### Task 1: Lock the cross-role filmography contract

**Files:**
- Modify: `tests/search/person-search.test.js`
- Modify: `lib/search/person-search.js`

**Interfaces:**
- Consumes: `runPersonFilmographySearch(intent, options)` and resolver credits shaped as `{workId,title,year,role,...}`.
- Produces: unique credits with `roles: string[]` plus backward-compatible `role: string` before availability lookup.

- [ ] **Step 1: Write the failing aggregation test**

Add a test where the resolver returns the same `Pulp Fiction` work ID three times with `director`, `writer`, and `cast`, plus a second movie. Assert that the final filmography contains `Pulp Fiction` once, its roles are deterministic, and availability is invoked once for that movie.

```js
assert.equal(result.filmography.filter(x=>x.title==='Pulp Fiction').length,1);
assert.deepEqual(result.filmography.find(x=>x.title==='Pulp Fiction').roles,['director','writer','cast']);
assert.equal(availabilityCalls.filter(x=>x==='Pulp Fiction').length,1);
```

- [ ] **Step 2: Run the person-search test and verify RED**

Run: `node --test tests/search/person-search.test.js`
Expected: FAIL because duplicate role credits are currently processed independently.

- [ ] **Step 3: Implement minimal credit aggregation**

In `lib/search/person-search.js`, add a focused helper that keys by `workId`, falling back to normalized title + year, merges role values in deterministic order `director`, `writer`, `producer`, `cast`, and returns one credit per work.

```js
const ROLE_ORDER=['director','writer','producer','cast'];
function aggregateCredits(credits=[]){
  const byWork=new Map();
  for(const credit of credits){
    const key=credit.workId||`${String(credit.title||'').toLowerCase().trim()}:${credit.year||''}`;
    const current=byWork.get(key)||{...credit,roles:[]};
    for(const role of credit.roles||[credit.role]) if(role&&!current.roles.includes(role)) current.roles.push(role);
    current.roles.sort((a,b)=>ROLE_ORDER.indexOf(a)-ROLE_ORDER.indexOf(b));
    current.role=current.roles[0]||credit.role||null;
    byWork.set(key,current);
  }
  return [...byWork.values()];
}
```

Use the aggregated credits for both complete-filmography records and availability fan-out.

- [ ] **Step 4: Run the focused test and full Node suite**

Run: `node --test tests/search/person-search.test.js`
Expected: PASS.

Run: `npm test`
Expected: all existing search tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/search/person-search.test.js lib/search/person-search.js
git commit -m "fix: merge person credits before availability lookup"
```

### Task 2: Define Python typed search models and role aggregation

**Files:**
- Create: `python_search/moviebrain/__init__.py`
- Create: `python_search/moviebrain/models.py`
- Create: `python_search/moviebrain/roles.py`
- Create: `python_search/moviebrain/filmography.py`
- Create: `python_search/tests/test_filmography.py`
- Create: `python_search/requirements.txt`

**Interfaces:**
- Consumes: raw person credits with work ID, title, year, and role.
- Produces: `aggregate_credits(credits: list[Credit]) -> list[AggregatedCredit]` with deterministic `roles` and primary `role`.

- [ ] **Step 1: Write failing pytest cases**

Test stable-ID deduplication, title/year fallback deduplication, role ordering, and distinct same-title/different-year works.

```python
def test_merges_same_work_across_roles():
    credits = [
        Credit(work_id="Q1", title="Pulp Fiction", year=1994, role="cast"),
        Credit(work_id="Q1", title="Pulp Fiction", year=1994, role="director"),
        Credit(work_id="Q1", title="Pulp Fiction", year=1994, role="writer"),
    ]
    merged = aggregate_credits(credits)
    assert len(merged) == 1
    assert merged[0].roles == ["director", "writer", "cast"]
    assert merged[0].role == "director"
```

- [ ] **Step 2: Run pytest and verify RED**

Run: `python -m pytest python_search/tests/test_filmography.py -q`
Expected: FAIL because the Python package does not exist yet.

- [ ] **Step 3: Implement typed models and aggregation**

Use Pydantic models for `Credit` and `AggregatedCredit`; implement the same stable work-key and role-order contract as Task 1. `requirements.txt` must pin compatible minimums for FastAPI, Pydantic, httpx, uvicorn, and pytest.

- [ ] **Step 4: Run pytest**

Run: `python -m pytest python_search/tests/test_filmography.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python_search
git commit -m "feat: add Python filmography aggregation core"
```

### Task 3: Add Python person-search orchestration

**Files:**
- Create: `python_search/moviebrain/person_search.py`
- Create: `python_search/tests/test_person_search.py`

**Interfaces:**
- Consumes: `resolve_credits(person_name, role)` and async `lookup_availability(credit)` callables.
- Produces: `run_person_search(intent, resolve_credits, lookup_availability)` with `person`, `filmography`, `results`, `availabilitySummary`, and `verified` fields matching the JavaScript contract.

- [ ] **Step 1: Write failing orchestration tests**

Cover complete view with zero availability calls; streaming view with one call per unique movie; one availability failure yielding an unknown record without dropping the movie; and no resolved person yielding an empty compatible response.

- [ ] **Step 2: Run pytest and verify RED**

Run: `python -m pytest python_search/tests/test_person_search.py -q`
Expected: FAIL because `person_search.py` does not exist.

- [ ] **Step 3: Implement minimal async orchestration**

Aggregate first, then branch on `filmographyView`. Use bounded async concurrency for availability calls and retain every credit even when an availability lookup fails.

- [ ] **Step 4: Run Python tests**

Run: `python -m pytest python_search/tests -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python_search/moviebrain/person_search.py python_search/tests/test_person_search.py
git commit -m "feat: orchestrate person searches in Python"
```

### Task 4: Add a FastAPI compatibility boundary

**Files:**
- Create: `python_search/moviebrain/app.py`
- Create: `python_search/tests/test_api.py`

**Interfaces:**
- Consumes: POST `/person-search` JSON containing normalized person intent and credits during contract testing; production resolver/availability adapters are injected behind the service boundary.
- Produces: JSON matching the existing person-search response fields expected by `/api/search`.

- [ ] **Step 1: Write failing API contract tests**

Use FastAPI TestClient/httpx to assert HTTP 200, one aggregated Pulp Fiction record, roles retained, and required top-level keys.

- [ ] **Step 2: Run API test and verify RED**

Run: `python -m pytest python_search/tests/test_api.py -q`
Expected: FAIL because the FastAPI app does not exist.

- [ ] **Step 3: Implement the minimal FastAPI app**

Create `/health` returning `{\"ok\": true}` and `/person-search` returning the typed compatibility response. Do not add frontend routes or templates.

- [ ] **Step 4: Run Python suite**

Run: `python -m pytest python_search/tests -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python_search/moviebrain/app.py python_search/tests/test_api.py
git commit -m "feat: expose Python MovieFinder search service"
```

### Task 5: Add a guarded JavaScript-to-Python adapter

**Files:**
- Create: `lib/search/python-service.js`
- Modify: `api/search.js`
- Create or modify: `tests/search/api-search.test.js`

**Interfaces:**
- Consumes: environment variable `MOVIEFINDER_PYTHON_SEARCH_URL` and normalized person-search request.
- Produces: the same person-search object consumed by the existing `/api/search` response builder.

- [ ] **Step 1: Write failing adapter tests**

Mock `fetch` and assert: configured service receives only person-search requests; successful Python response is used; timeout/non-2xx causes an explicit controlled fallback to the existing in-process person search; catalog searches do not call Python.

- [ ] **Step 2: Run adapter/API tests and verify RED**

Run: `node --test tests/search/api-search.test.js`
Expected: FAIL because no Python adapter exists.

- [ ] **Step 3: Implement minimal guarded adapter**

Add `runPythonPersonSearch(intent, options)` with a short AbortController timeout. In `api/search.js`, use it only when `MOVIEFINDER_PYTHON_SEARCH_URL` is configured; otherwise retain the existing in-process implementation. Do not modify frontend files.

- [ ] **Step 4: Run Node and Python suites**

Run: `npm test`
Expected: PASS.

Run: `python -m pytest python_search/tests -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/search/python-service.js api/search.js tests/search/api-search.test.js
git commit -m "feat: add guarded Python search adapter"
```

### Task 6: CI verification for both runtimes

**Files:**
- Modify: `.github/workflows/search-brain-tests.yml`

**Interfaces:**
- Consumes: Node and Python test suites.
- Produces: one green PR check that proves both compatibility layers pass.

- [ ] **Step 1: Update CI with a Python test step**

Configure Python 3.11, install `python_search/requirements.txt`, run `python -m pytest python_search/tests -q`, then run the existing Node tests.

- [ ] **Step 2: Push and verify GitHub Actions**

Expected: Search Brain Tests concludes `success` on the feature-branch commit.

- [ ] **Step 3: Commit workflow change if not already committed by the push operation**

```bash
git add .github/workflows/search-brain-tests.yml
git commit -m "ci: verify Python MovieFinder search service"
```

### Task 7: Preview acceptance without UI changes

**Files:**
- No frontend file modifications expected.
- Modify tests only if a reproducible backend regression is found.

**Interfaces:**
- Consumes: Vercel Preview from `feature/search-brain-v2` and optional deployed Python service URL.
- Produces: verified acceptance evidence before production integration.

- [ ] **Step 1: Verify deployment metadata**

Confirm the Preview is built from the final feature-branch SHA and is READY.

- [ ] **Step 2: Run person-search acceptance queries**

Verify at minimum `Quentin Tarantino streaming movies`, `Quentin Tarantino filmography`, `all Will Smith movies available on streaming`, and `movies directed by Christopher Nolan`.

Expected: generic searches use all roles; explicit Nolan query stays director-only; duplicate titles appear once.

- [ ] **Step 3: Run legacy regression queries**

Verify `1994 crime movies`, `scary movies Rotten Tomatoes 90%+`, `The Godfather`, and `Star Wars free`.

Expected: existing hard constraints and title behavior remain correct.

- [ ] **Step 4: Verify the UI contract**

Confirm no intentional frontend files changed and the visible MovieFinder layout/workflow is unchanged.

- [ ] **Step 5: Stop before production promotion**

Report Preview/CI evidence. Merge/promote only after explicit integration choice and final verification.
