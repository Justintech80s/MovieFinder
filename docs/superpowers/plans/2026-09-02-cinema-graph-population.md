# Cinema Graph Population Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert explicit MovieFinder movie/person metadata into deterministic typed Cinema Graph nodes and provenance-backed relationships.

**Architecture:** A focused metadata-normalization module converts loose upstream movie records into one stable internal graph-ingestion shape. A builder consumes that shape and writes through the existing `createCinemaGraph()` API. Existing concept scoring remains untouched and the builder is exported from the public Cinema Graph module.

**Tech Stack:** Node.js ES modules, existing MovieFinder Cinema Graph store/types, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-02-cinema-graph-population-design.md`

## Global Constraints

- Deterministic ingestion only; never invent missing film facts.
- Prefer explicit upstream IDs and use deterministic fallback IDs.
- All relationship confidence must remain bounded by existing graph normalization.
- Preserve existing Cinema Graph concept-scoring APIs.
- No Neo4j, vector DB, AI model, crawler, or new runtime dependency in this step.

---

### Task 1: Normalize Graph Metadata

**Files:**
- Create: `lib/search/cinema-graph/metadata.js`
- Test: `tests/cinema-graph-metadata.test.js`

**Interfaces:**
- Produces: `normalizeMovieMetadata(movie, defaults={})` returning either `null` for unusable input or `{movie, people, genres, countries, themes, styles, movements, influences, era, provenance, confidence}`.

- [ ] **Step 1: Write failing tests**

Cover string/object cast and director inputs, deterministic IDs, 1974 -> `1970s`, duplicate values, invalid years, and missing title.

- [ ] **Step 2: Run focused test**

Run: `node --test tests/cinema-graph-metadata.test.js`
Expected: FAIL because `metadata.js` does not exist.

- [ ] **Step 3: Implement normalization**

Normalize labels by trimming/collapsing whitespace. Prefer explicit IDs. Fallback IDs use a slug of type/label, and movie fallback identity includes valid year. Normalize singular fields to arrays. Deduplicate by normalized identity. Derive decade only from a valid four-digit year.

- [ ] **Step 4: Run focused test**

Run: `node --test tests/cinema-graph-metadata.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: normalize Cinema Graph metadata`

### Task 2: Build Typed Graph Relationships

**Files:**
- Create: `lib/search/cinema-graph/builder.js`
- Modify: `lib/search/cinema-graph.js`
- Test: `tests/cinema-graph-builder.test.js`

**Interfaces:**
- Consumes: `normalizeMovieMetadata(movie, defaults)` and an existing graph store.
- Produces: `ingestMovieMetadata(graph, movie, defaults={})` returning `{movieId, nodeCount, edgeCount}` or `{movieId:null,nodeCount:0,edgeCount:0}` for unusable metadata.
- Produces: `buildCinemaGraph(movies=[], defaults={})` returning a populated graph.

- [ ] **Step 1: Write failing builder tests**

Create a fixture for a 1974 conspiracy thriller with explicit actor, director, writer, genre, country, theme, style, and movement. Assert the expected typed nodes and edge directions. Ingest twice and assert node/edge counts do not grow.

- [ ] **Step 2: Run focused builder test**

Run: `node --test tests/cinema-graph-builder.test.js`
Expected: FAIL because `builder.js` does not exist.

- [ ] **Step 3: Implement ingestion**

Upsert the movie node first. Upsert related typed nodes and add only the explicit edge types defined in the spec. Attach `{confidence, provenance}` to each edge. Actor edges point person -> movie; director/writer and categorical edges point movie -> related node.

- [ ] **Step 4: Implement batch builder and public exports**

`buildCinemaGraph` creates one `createCinemaGraph()` store and ingests each supplied movie. Export `normalizeMovieMetadata`, `ingestMovieMetadata`, and `buildCinemaGraph` from `lib/search/cinema-graph.js` while leaving existing exports/functions intact.

- [ ] **Step 5: Run focused tests**

Run: `node --test tests/cinema-graph-metadata.test.js tests/cinema-graph-builder.test.js tests/cinema-graph.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: populate typed Cinema Graph relationships`

### Task 3: Full Regression Verification

**Files:**
- Modify only if a verified regression requires a minimal fix.

**Interfaces:**
- Consumes the public Cinema Graph APIs.
- Produces verified compatibility with Hybrid Search and existing MovieFinder tests.

- [ ] **Step 1: Run complete Node suite**

Run: `npm test`
Expected: zero failing tests.

- [ ] **Step 2: Run Python MovieBrain contracts**

Run: `PYTHONPATH=python_search python -m pytest python_search/tests -q`
Expected: zero failing tests.

- [ ] **Step 3: Verify GitHub Actions on the exact final head**

Both Node and Python jobs must conclude `success` on the final commit SHA.

- [ ] **Step 4: Check deployment status separately**

Record Vercel build-rate limiting as an external deployment blocker if it remains. Do not merge PR #4 while production deployment cannot be verified.
