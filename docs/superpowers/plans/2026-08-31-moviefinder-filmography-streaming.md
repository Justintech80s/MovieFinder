# MovieFinder Filmography + Streaming Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reliably connect actors, directors, and producers to complete movie filmographies, expose complete vs available-now views, normalize current/upcoming streaming timeline data, and prevent external availability failures from erasing filmography results or crashing searches.

**Architecture:** Keep filmography identity separate from streaming availability. Resolve a stable person ID and stable work IDs first, then enrich each credit with current availability; preserve the credit even if enrichment fails. Add backward-compatible response fields so the existing frontend can keep using `results` while future UI can use `filmography`, `availabilitySummary`, and `streamingTimeline`.

**Tech Stack:** Node.js >=20, ES modules, Node test runner, Vercel Functions, Wikidata structured data fallback, JustWatch GraphQL prototype availability adapter, optional Supabase/Postgres persistence schema.

**Spec:** `docs/superpowers/specs/2026-08-31-moviefinder-filmography-streaming-design.md`

## Global Constraints

- Preserve the current MovieFinder UI, branding, support screen, support destinations, keyboard behavior, and existing working title search.
- Do not promote `feature/search-brain-v2` to production until Preview passes regression and acceptance tests.
- Do not scrape Rotten Tomatoes, IMDb, streaming services, or other sites in violation of their terms.
- Do not commit API keys, passwords, tokens, private credentials, or payment secrets.
- Supabase remains optional persistence/cache infrastructure and must not be required for runtime correctness.
- Every production behavior change follows RED -> verify failure -> GREEN -> verify pass.

---

### Task 1: Expand person intent to producer, all-credits, and filmography view

**Files:**
- Modify: `lib/search/intent.js`
- Modify: `tests/search/intent.test.js`

**Interfaces:**
- Consumes: user query string.
- Produces: `parseIntent(query)` with `kind`, `personName`, `role`, `filmographyView`, `provider`, `freeOnly`, `rentOnly`, `buyOnly`.

- [ ] **Step 1: Write failing parser tests**

Add tests equivalent to:

```js
test('detects producer filmography search', () => {
  const p = parseIntent('movies produced by Jerry Bruckheimer');
  assert.equal(p.kind, 'person-filmography');
  assert.equal(p.personName, 'Jerry Bruckheimer');
  assert.equal(p.role, 'producer');
  assert.equal(p.filmographyView, 'complete');
});

test('detects all credits and complete view', () => {
  const p = parseIntent('all credits for Clint Eastwood');
  assert.equal(p.role, 'all');
  assert.equal(p.filmographyView, 'complete');
});

test('streaming wording selects available view', () => {
  const p = parseIntent('All Denzel Washington films available on streaming');
  assert.equal(p.filmographyView, 'available');
});
```

- [ ] **Step 2: Run the intent tests and verify RED**

Run: `node --test tests/search/intent.test.js`

Expected: new producer/all/view assertions fail because those behaviors are missing.

- [ ] **Step 3: Implement minimal parser support**

Add explicit patterns for `produced by`, `producer`, `all credits for`, and `filmography`; assign `filmographyView: 'available'` when provider/free/rent/buy/stream/available-now intent exists, otherwise `complete`.

- [ ] **Step 4: Run intent tests and verify GREEN**

Run: `node --test tests/search/intent.test.js`

Expected: all intent tests pass.

- [ ] **Step 5: Commit**

Commit message: `feat: expand person filmography intent`

---

### Task 2: Resolve stable work IDs for actor, director, producer, and all-credit filmographies

**Files:**
- Modify: `lib/search/people.js`
- Create: `tests/search/people.test.js`

**Interfaces:**
- Produces: `resolvePersonCredits(name, role)` returning `{ person, credits, verified }`.
- Credit shape: `{ workId, title, year, imdbId, role, source }`.
- Supported roles: `cast`, `director`, `producer`, `all`.

- [ ] **Step 1: Write failing unit tests for role-property mapping and deduplication**

Export a pure `creditPropertiesForRole(role)` helper and test:

```js
assert.deepEqual(creditPropertiesForRole('cast'), [{ role:'cast', property:'P161' }]);
assert.deepEqual(creditPropertiesForRole('director'), [{ role:'director', property:'P57' }]);
assert.deepEqual(creditPropertiesForRole('producer'), [{ role:'producer', property:'P162' }]);
assert.equal(creditPropertiesForRole('all').length, 3);
```

Also export/test a pure normalizer that preserves `workId` and does not collapse the same work across different roles when `all` is requested.

- [ ] **Step 2: Run people tests and verify RED**

Run: `node --test tests/search/people.test.js`

Expected: helpers do not exist yet.

- [ ] **Step 3: Implement role mapping and stable IDs**

Build one SPARQL query per supported property or a UNION query for `all`. Select `?work`, parse the QID from its URI into `workId`, preserve role, release year, and IMDb ID. Deduplicate by `${workId || normalizedTitleYear}:${role}`.

- [ ] **Step 4: Run people tests and verify GREEN**

Run: `node --test tests/search/people.test.js`

Expected: all people unit tests pass.

- [ ] **Step 5: Commit**

Commit message: `feat: resolve role-aware stable filmography credits`

---

### Task 3: Fix the availability query and normalize streaming timeline entries

**Files:**
- Modify: `api/search.js`
- Modify: `lib/search/availability.js`
- Modify: `tests/search/availability.test.js`
- Create: `tests/search/query-contract.test.js`

**Interfaces:**
- `normalizeOffers(raw, { checkedAt, source })` returns existing offer fields plus `streamingTimeline`-compatible metadata.
- Export `toTimelineEntry(offer, options)` for pure tests.
- Export or isolate the GraphQL query string for contract testing.

- [ ] **Step 1: Write failing tests for the GraphQL contract and timeline**

Test that the JustWatch query requests `retailPrice(language: $language)` rather than invalid argument-less `retailPrice` and that timeline entries normalize current offers to `status: 'NOW'`.

```js
assert.match(JUSTWATCH_QUERY, /retailPrice\(language:\s*\$language\)/);
assert.equal(toTimelineEntry({ provider:'Max', type:'FLATRATE' }, { checkedAt:'2026-08-31T00:00:00.000Z' }).status, 'NOW');
```

Add a future-record normalization test where an explicitly supplied future date becomes `UPCOMING`, and no date remains `UNKNOWN` rather than guessed.

- [ ] **Step 2: Run availability/query tests and verify RED**

Run: `node --test tests/search/availability.test.js tests/search/query-contract.test.js`

Expected: query-contract and timeline tests fail.

- [ ] **Step 3: Implement the minimal query/timeline correction**

Change the GraphQL selection to `retailPrice(language:$language)` and keep `retailPriceValue`. Add pure timeline normalization with fields from the spec. Do not invent upcoming dates.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/search/availability.test.js tests/search/query-contract.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit**

Commit message: `fix: repair availability query and add timeline normalization`

---

### Task 4: Preserve complete filmographies when availability is absent or broken

**Files:**
- Modify: `api/search.js`
- Create: `lib/search/filmography.js`
- Create: `tests/search/filmography.test.js`

**Interfaces:**
- `buildFilmographyRecord(credit, availabilityResult)` returns a movie-like record with `availabilityStatus` and `offers`.
- `partitionFilmography(records, intent)` returns `{ filmography, results, availabilitySummary }`.

- [ ] **Step 1: Write failing pure tests**

Test:

```js
const records = [
  buildFilmographyRecord({workId:'Q1',title:'Film A',year:1994,role:'director'}, null),
  buildFilmographyRecord({workId:'Q2',title:'Film B',year:1995,role:'director'}, {offers:[{type:'FLATRATE'}]})
];
const complete = partitionFilmography(records, {filmographyView:'complete'});
assert.equal(complete.filmography.length, 2);
assert.equal(complete.results.length, 2);
const available = partitionFilmography(records, {filmographyView:'available'});
assert.equal(available.filmography.length, 2);
assert.equal(available.results.length, 1);
```

Also assert an availability error marks a record `UNKNOWN` instead of deleting it.

- [ ] **Step 2: Run filmography tests and verify RED**

Run: `node --test tests/search/filmography.test.js`

Expected: module/functions missing.

- [ ] **Step 3: Implement pure filmography partitioning**

Create records from credits first. Availability enrichment mutates/enriches the record but never determines whether the credit belongs to `filmography`. Keep `results` backward compatible.

- [ ] **Step 4: Wire the API to the new separation**

For person searches, return `filmography`, `results`, `availabilitySummary`, and existing `parsed`, `liveAt`, `dataQuality`. Catch per-credit availability failures and preserve each credit.

For generic title searches, catch an external availability-source failure and return a controlled response body/status rather than an opaque uncaught 500 when feasible without masking programming errors.

- [ ] **Step 5: Run all tests and verify GREEN**

Run: `npm test`

Expected: 0 failures.

- [ ] **Step 6: Commit**

Commit message: `feat: separate filmography identity from availability`

---

### Task 5: Add optional Supabase-compatible persistence schema

**Files:**
- Create: `supabase/migrations/20260831_movie_people_credits.sql`
- Create: `tests/search/schema.test.js`

**Interfaces:**
- Tables: `people`, `movies`, `credits`, `availability_snapshots`.
- Unique identities: source + external ID for people/movies; person/movie/role for credits.

- [ ] **Step 1: Write failing schema-content test**

Read the SQL file and assert the four required tables and role/status constraints exist. The test should fail because the file is absent.

- [ ] **Step 2: Run schema test and verify RED**

Run: `node --test tests/search/schema.test.js`

Expected: missing migration file.

- [ ] **Step 3: Add migration file**

Create idempotent-compatible Postgres DDL using UUID primary keys, external source IDs, indexed foreign keys, and check constraints for supported roles and availability statuses. Do not apply it to an unrelated Supabase project.

- [ ] **Step 4: Run schema test and verify GREEN**

Run: `node --test tests/search/schema.test.js`

Expected: pass.

- [ ] **Step 5: Commit**

Commit message: `feat: add cinema data persistence schema`

---

### Task 6: Preview deployment and regression verification

**Files:**
- No production code unless a failing acceptance test identifies a defect.

**Interfaces:**
- Vercel Preview generated from `feature/search-brain-v2`.

- [ ] **Step 1: Verify fresh preview deployment is READY**

Confirm Vercel metadata references the current feature-branch commit.

- [ ] **Step 2: Run required Preview searches**

At minimum:
- `Where can I find all of Quentin Tarantino movies to stream?`
- `All Denzel Washington films available on streaming`
- `movies produced by Jerry Bruckheimer`
- `all credits for Clint Eastwood`
- `Where can I watch The Godfather?`
- `Where can I watch the Star Wars movie for free?`

Expected:
- person queries resolve the intended role/person
- complete filmography is not erased when offers are missing
- available view includes only matching offers
- Godfather no longer fails because of the invalid GraphQL field usage
- free intent remains intact

- [ ] **Step 3: Run existing regression searches**

Verify genre/concept/provider/rating/title behavior required by the existing Search Intelligence spec before promotion.

- [ ] **Step 4: Inspect Preview runtime errors**

No new fatal application errors attributable to this branch.

- [ ] **Step 5: Stop before production promotion if any acceptance requirement fails**

Do not merge/promote on partial success.

- [ ] **Step 6: When all requirements pass, use the finishing-development-branch workflow before production promotion**

After promotion, re-run the same live tests on `https://getmoviefinder.vercel.app` before claiming completion.
