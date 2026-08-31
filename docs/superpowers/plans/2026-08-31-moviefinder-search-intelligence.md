# MovieFinder Search Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the existing MovieFinder production application while upgrading its backend to correctly understand director/person filmography queries, actor queries, cinema concepts, dynamic providers, and confidence-aware hybrid ranking.

**Architecture:** First recover the exact production baseline and commit it without intentional UI changes. Then implement search intelligence as focused backend modules behind the existing `/api/search` contract, deploy a preview, run regression/acceptance searches, and only then promote the verified version.

**Tech Stack:** JavaScript/Node.js, Vercel Functions, existing JustWatch-compatible availability integration, public structured-data fallback for person resolution, GitHub/Vercel preview deployments.

**Spec:** `docs/superpowers/specs/2026-08-31-moviefinder-search-intelligence-design.md`

## Global Constraints
- Preserve the current visible MovieFinder UI, branding, support screen, support destinations, and keyboard behavior.
- Never commit credentials, API keys, tokens, or private secrets.
- Person/entity recognition must run before generic title/franchise extraction.
- Streaming/rental/purchase claims require current availability evidence.
- Do not scrape IMDb, Rotten Tomatoes, or streaming sites in violation of their terms.
- Do not promote or claim production success until live endpoint tests pass.

---

### Task 1: Recover and lock the production baseline

**Files:**
- Create from recovered source: `index.html` (or exact production frontend path)
- Create from recovered source: `api/search.js` (or exact production API path)
- Create: `.gitignore`
- Create: `README.md`

**Interfaces:**
- Consumes: exact source/artifact behind the current Vercel production deployment.
- Produces: a GitHub baseline whose behavior matches production.

- [ ] **Step 1:** Obtain the exact current production source/build inputs from the Vercel project or original source workspace; do not reconstruct the support/payment UI from memory.
- [ ] **Step 2:** Verify the recovered frontend contains the current MovieFinder headline, search interaction, support screen, and Enter-key behavior.
- [ ] **Step 3:** Verify the recovered backend returns successful responses for `The Godfather` and `Star Wars free` before modification.
- [ ] **Step 4:** Add `.gitignore` entries for `.env`, `.env.*`, `.vercel`, `node_modules`, and local credentials.
- [ ] **Step 5:** Commit the recovered baseline with message `chore: capture current MovieFinder production baseline`.

### Task 2: Add person/director intent parsing with tests

**Files:**
- Create: `lib/search/intent.js`
- Create: `tests/search/intent.test.js`
- Modify: `api/search.js`

**Interfaces:**
- Produces: `parseIntent(query)` returning `{ kind, personName, role, mediaType, availabilityIntent, constraints, confidence }`.

- [ ] **Step 1:** Write failing tests asserting `all Quentin Tarantino movies to stream` returns `kind: person-filmography`, `personName: Quentin Tarantino`, `role: director` and no literal `titleQuery`.
- [ ] **Step 2:** Add failing actor tests for Denzel Washington and Will Smith filmography queries.
- [ ] **Step 3:** Run the tests and confirm the current parser fails these cases.
- [ ] **Step 4:** Implement `parseIntent()` so high-confidence person intent precedes title/franchise extraction.
- [ ] **Step 5:** Run tests and commit with `feat: recognize person and director search intent`.

### Task 3: Add provider-independent person/filmography resolution

**Files:**
- Create: `lib/search/people.js`
- Create: `tests/search/people.test.js`
- Modify: `api/search.js`

**Interfaces:**
- Consumes: `{ personName, role }` from `parseIntent()`.
- Produces: `resolvePersonCredits(name, role)` returning normalized `{ title, year, roles, ids }[]`.

- [ ] **Step 1:** Write fixture-driven failing tests for director and actor credit normalization.
- [ ] **Step 2:** Implement a no-key structured-data resolver with timeout, deduplication, and normalized role handling.
- [ ] **Step 3:** Ensure resolver failure returns an explicit unverified/no-results state rather than falling back to treating the person's name as a movie title.
- [ ] **Step 4:** Run tests and commit with `feat: add filmography resolution layer`.

### Task 4: Normalize availability providers dynamically

**Files:**
- Create: `lib/search/availability.js`
- Create: `tests/search/availability.test.js`
- Modify: `api/search.js`

**Interfaces:**
- Produces: `normalizeOffers(rawOffers)` returning normalized provider, monetization type, price, currency, URL, and freshness fields.

- [ ] **Step 1:** Write failing fixtures covering subscription, free, ads, rent, and buy offers plus an unfamiliar provider name.
- [ ] **Step 2:** Implement dynamic provider normalization while retaining aliases for common services.
- [ ] **Step 3:** Verify an unfamiliar legitimate provider is retained rather than silently dropped.
- [ ] **Step 4:** Run tests and commit with `feat: normalize dynamic streaming providers`.

### Task 5: Add Cinema Graph concept scoring and hybrid ranking

**Files:**
- Create: `lib/search/cinema-graph.js`
- Create: `lib/search/rank.js`
- Create: `tests/search/rank.test.js`
- Modify: `api/search.js`

**Interfaces:**
- Produces: `scoreCinemaRelations(movie, intent)` and `rankResults(results, intent)`.

- [ ] **Step 1:** Write failing ranking tests for `grimy 1970s revenge thriller like Rolling Thunder`, `giallo`, and `spaghetti western`.
- [ ] **Step 2:** Implement concept expansion for film movements/subgenres/style/reference-film relationships already defined by MovieFinder Search Brain v2.
- [ ] **Step 3:** Implement hybrid ranking where hard constraints and exact entity intent outrank soft Cinema Graph similarity.
- [ ] **Step 4:** Add `cinemaWhy` and numeric match/confidence values without requiring visible frontend changes.
- [ ] **Step 5:** Run tests and commit with `feat: add Cinema Graph hybrid ranking`.

### Task 6: Add confidence and verification routing

**Files:**
- Create: `lib/search/verify.js`
- Create: `tests/search/verify.test.js`
- Modify: `api/search.js`

**Interfaces:**
- Produces: `assessConfidence(result, intent)` and `needsVerification(result)`.

- [ ] **Step 1:** Write failing tests for ambiguous person matches, exact title matches, and stale/missing availability.
- [ ] **Step 2:** Implement confidence thresholds and explicit verification-needed state.
- [ ] **Step 3:** Ensure MovieFinder does not present low-confidence filmography/title guesses as verified results.
- [ ] **Step 4:** Run tests and commit with `feat: add search confidence verification`.

### Task 7: Preserve the existing `/api/search` response and frontend behavior

**Files:**
- Modify: `api/search.js`
- Test: `tests/search/regression.test.js`

**Interfaces:**
- Consumes: new search modules.
- Produces: backward-compatible response consumed by the existing frontend.

- [ ] **Step 1:** Add regression fixtures for Godfather, Star Wars free, horror RT threshold, provider-specific horror, and TV title searches.
- [ ] **Step 2:** Route person intent through filmography + availability; route other intents through the existing catalog path plus new ranking.
- [ ] **Step 3:** Confirm existing response fields remain present and additive fields do not break rendering.
- [ ] **Step 4:** Run the complete test suite and commit with `feat: integrate MovieFinder search brain v2`.

### Task 8: Preview deployment and acceptance verification

**Files:**
- No intentional frontend changes.

**Interfaces:**
- Consumes: feature branch.
- Produces: verified Vercel preview candidate.

- [ ] **Step 1:** Deploy the feature branch as a Vercel preview, not production.
- [ ] **Step 2:** Test all acceptance searches from the design spec against the preview API/UI.
- [ ] **Step 3:** Confirm Tarantino/Scorsese/Nolan/Spike Lee resolve as people/directors and Denzel Washington/Will Smith resolve as actors.
- [ ] **Step 4:** Confirm current availability offers are returned only when supported by the availability adapter.
- [ ] **Step 5:** Confirm the visible UI and support screen are unchanged from baseline.
- [ ] **Step 6:** Inspect Vercel runtime/build errors and fix any regressions before merge.

### Task 9: Production promotion and post-deploy verification

**Files:**
- No additional code unless verification finds a regression.

**Interfaces:**
- Produces: verified live MovieFinder release.

- [ ] **Step 1:** Merge the reviewed feature branch only after preview acceptance passes.
- [ ] **Step 2:** Confirm the resulting Vercel production deployment reaches READY.
- [ ] **Step 3:** Re-run Tarantino, Scorsese, Denzel Washington, Will Smith, Godfather, and Star Wars-free smoke tests against production.
- [ ] **Step 4:** Confirm homepage HTTP success, Enter-key search, and unchanged support screen.
- [ ] **Step 5:** Only after all checks pass, report the director/person search upgrade as live.
