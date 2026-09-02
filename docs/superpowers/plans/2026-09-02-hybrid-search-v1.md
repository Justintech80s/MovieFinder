# Hybrid Search v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic multi-signal film retrieval, typo/synonym handling, Reciprocal Rank Fusion, and explainable hybrid ranking to MovieFinder without changing the UI or weakening authoritative streaming constraints.

**Architecture:** The existing search API remains the orchestrator and JustWatch/current availability feed remains the live candidate source. New focused modules expand queries, generate independent lexical/semantic/Cinema Graph rankings, fuse them with RRF, and finalize results through bounded deterministic boosts. Interfaces are deliberately provider-neutral so production vector/OpenSearch retrieval can be added later.

**Tech Stack:** Node.js ES modules, Node built-in test runner, existing MovieFinder search modules, existing Cinema Graph, existing Python MovieBrain CI.

**Spec:** `docs/superpowers/specs/2026-09-02-hybrid-search-v1-design.md`

## Global Constraints

- Do not redesign or alter the current MovieFinder UI.
- Current streaming availability and parsed hard constraints remain authoritative.
- AI remains optional and cannot introduce unsupported facts or availability claims.
- Preserve existing API response fields; new hybrid metadata must be additive.
- Do not add Elasticsearch, OpenSearch, vector DB, embedding-service, or LangChain dependencies in v1.
- RRF default constant is `k = 60`.
- Existing person-filmography orchestration remains unchanged in v1.

---

### Task 1: Deterministic Query Expansion

**Files:**
- Create: `lib/search/query-expansion.js`
- Test: `tests/query-expansion.test.js`

**Interfaces:**
- Produces: `expandSearchQuery(query)` returning `{original, normalized, tokens, expandedTokens, variants}`.

- [ ] **Step 1: Write failing tests**

Test punctuation/case normalization and transparent domain synonyms including `sci fi -> science fiction`, `gangster -> crime`, `scary -> horror`, and `romcom -> romantic comedy`.

- [ ] **Step 2: Run the focused test**

Run: `node --test tests/query-expansion.test.js`
Expected: FAIL because `lib/search/query-expansion.js` does not exist.

- [ ] **Step 3: Implement the minimal deterministic expansion module**

Use Unicode-safe string normalization, whitespace collapsing, token deduplication, and a frozen synonym table. Preserve original input and never remove the original normalized tokens.

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/query-expansion.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add deterministic film query expansion`

### Task 2: Reciprocal Rank Fusion

**Files:**
- Create: `lib/search/rank-fusion.js`
- Test: `tests/rank-fusion.test.js`

**Interfaces:**
- Consumes: arrays shaped `{name, results}` where each result is a MovieFinder movie object.
- Produces: `reciprocalRankFusion(lists,{k=60})` returning fused movie objects with `rrfScore` and `rrfContributions`.

- [ ] **Step 1: Write failing tests**

Cover deterministic fusion, duplicate IDs, title/year fallback identity, contribution metadata, and stable ties.

- [ ] **Step 2: Run the focused test**

Run: `node --test tests/rank-fusion.test.js`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement RRF**

For rank index `r` beginning at 1, add `1 / (k + r)` for each list occurrence. Deduplicate candidates before sorting. For exact score ties, use normalized title, year, then stable identity.

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/rank-fusion.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add reciprocal rank fusion`

### Task 3: Hybrid Candidate Ranking

**Files:**
- Create: `lib/search/hybrid-search.js`
- Test: `tests/hybrid-search.test.js`

**Interfaces:**
- Consumes: `buildHybridRankings(candidates, queryExpansion, intent)`.
- Produces: `{lists, signalsById}` where lists include `lexical`, `semantic`, `cinemaGraph`, and `baseline` ordered candidates and signals are bounded to `[0,1]`.

- [ ] **Step 1: Write failing relevance tests**

Verify exact `Goodfellas` ranks over fuzzy matches, `Godfellas` gives `Goodfellas` a useful bounded fuzzy signal, expanded genre synonyms affect semantic-style relevance, and Cinema Graph concepts contribute without dominating exact title relevance.

- [ ] **Step 2: Run the focused test**

Run: `node --test tests/hybrid-search.test.js`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement candidate field extraction and lexical scoring**

Search over title, description, genres, year, and available normalized metadata. Exact title is the strongest lexical signal. Token overlap is secondary.

- [ ] **Step 4: Implement bounded typo similarity**

Use a small Levenshtein helper only for plausible close strings. Return zero for large length differences and cap fuzzy contribution below exact-match contribution.

- [ ] **Step 5: Implement semantic-style and graph lists**

Use synonym-expanded token overlap for the semantic-style list and existing `scoreCinemaRelations(movie,intent)` for graph ordering. Use existing `rankResults` output for the baseline list.

- [ ] **Step 6: Run the focused test**

Run: `node --test tests/hybrid-search.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat: add hybrid movie retrieval signals`

### Task 4: Hybrid Finalization and API Integration

**Files:**
- Modify: `lib/search/rank.js`
- Modify: `api/search.js`
- Test: `tests/hybrid-search-integration.test.js`

**Interfaces:**
- Consumes: expanded query, independent ranked lists, RRF output, and per-result signals.
- Produces: final movies containing bounded `hybridScore` and `searchSignals`; API adds `searchMode: "hybrid-v1"`.

- [ ] **Step 1: Write failing integration tests**

Inject representative candidate movies and verify hard/provider availability filtering occurs before hybrid ordering, removed candidates cannot be reintroduced, existing response semantics are retained, and new metadata is additive.

- [ ] **Step 2: Run the focused integration test**

Run: `node --test tests/hybrid-search-integration.test.js`
Expected: FAIL because the API does not yet expose hybrid-v1 metadata.

- [ ] **Step 3: Add a hybrid finalization function to `rank.js`**

Keep `rankResults` intact. Add `finalizeHybridResults(fused, signalsById, intent)` that normalizes the fused score, applies small bounded authoritative boosts, and emits `hybridScore` plus `searchSignals`.

- [ ] **Step 4: Wire the general catalog path in `api/search.js`**

After current offer filtering and `matchesHardConstraints`, call `expandSearchQuery`, `buildHybridRankings`, `reciprocalRankFusion`, and `finalizeHybridResults`. Slice to 40 only after fusion. Keep person-filmography unchanged.

- [ ] **Step 5: Run the focused integration test**

Run: `node --test tests/hybrid-search-integration.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: integrate Hybrid Search v1`

### Task 5: Relevance Regression Suite and Full Verification

**Files:**
- Create: `tests/search-relevance.test.js`
- Modify only if a verified regression requires a minimal correction to the modules above.

**Interfaces:**
- Consumes the public hybrid-search functions.
- Produces a stable relevance benchmark for future OpenSearch/vector upgrades.

- [ ] **Step 1: Add representative relevance cases**

Include `movies like Goodfellas`, `1970s paranoid thrillers`, `crime movies influenced by Kurosawa`, `Godfellas`, and provider-constrained streaming queries using deterministic fixtures.

- [ ] **Step 2: Run the complete Node suite**

Run: `npm test`
Expected: zero failing tests.

- [ ] **Step 3: Run Python MovieBrain contracts**

Run: `PYTHONPATH=python_search python -m pytest python_search/tests -q`
Expected: zero failing tests.

- [ ] **Step 4: Verify GitHub Actions on the exact final branch head**

Both `Node search and Cinema Brain tests` and `Python MovieBrain contract tests` must conclude `success`. Do not infer success from a workflow merely starting.

- [ ] **Step 5: Inspect deployment status separately**

If Vercel still reports account build-rate limiting, record that as an external deployment blocker rather than a code-test failure. Do not merge solely on local/CI success if deployment checks required for release remain unable to verify the application.

- [ ] **Step 6: Commit any final test-only benchmark additions**

Commit message: `test: add Hybrid Search relevance benchmarks`
