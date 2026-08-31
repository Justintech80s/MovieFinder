# MovieFinder Search Intelligence Implementation Plan

## Current execution status — 2026-08-31

- Backend rebuild committed on `feature/search-brain-v2`.
- Person/director intent parsing tests verified locally: 5/5 passing.
- Production Vercel deployment remains READY and untouched.
- Production `/api/search` runtime check shows no current fatal application error; only Node's `url.parse()` deprecation warning is recurring.
- Vercel project is not currently auto-creating a preview deployment from the GitHub feature branch.
- Next deployment gate: link/import `Justintech80s/MovieFinder` to the existing `getmoviefinder` Vercel project (or otherwise enable Git preview deployments), then deploy this feature branch as preview and run acceptance tests before merge/promotion.

## Goal

Upgrade MovieFinder search so natural-language person/director/actor searches, film concepts, availability constraints, and related-film reasoning work reliably while preserving the current production frontend and support experience.

## Safety constraints

1. Do not modify the existing support/payment destinations.
2. Do not claim the new backend is live before preview and production verification pass.
3. Do not scrape IMDb, Rotten Tomatoes, Google, or streaming sites in prohibited ways.
4. Preserve the current `/api/search` response shape used by the frontend.
5. Promote only after regression queries pass.

## Tasks

### 1. Recover and lock production baseline

- Capture current production frontend behavior and API contract.
- Keep production deployment unchanged until the feature branch passes preview tests.

### 2. Add person/director intent parsing

- Detect person-filmography intent before generic title extraction.
- Support director phrases such as Quentin Tarantino, Martin Scorsese, Christopher Nolan, and Spike Lee.
- Support cast/actor phrases such as Denzel Washington and Will Smith.
- Preserve free/provider/rent/buy intent.
- Tests must cover these cases.

### 3. Add provider-independent person/filmography resolution

- Use a provider-independent resolver interface.
- Initial no-key implementation may use Wikidata structured data.
- Filmography records should retain title, year, role, and IMDb ID when supplied by the structured source.

### 4. Normalize availability providers dynamically

- Normalize offer/provider names returned by the current availability engine.
- Apply free, subscription, rent, buy, and provider constraints after normalization.
- Do not assume the provider universe is permanently limited to a hard-coded list.

### 5. Add Cinema Graph concept scoring and hybrid ranking

- Recognize film movements/subgenres/styles including giallo, spaghetti western, New Hollywood, grindhouse, exploitation, blaxploitation, neo-noir, revenge thriller, paranoid/conspiracy-driven cinema, and related concepts.
- Combine entity match, semantic/concept match, graph relationship match, availability, rating/popularity when available, freshness, and confidence.

### 6. Add confidence and verification routing

- Return confidence/data-quality signals.
- Mark ambiguous or weakly matched results for verification rather than presenting them as certain.

### 7. Preserve existing `/api/search` response/frontend behavior

- Keep `parsed`, `results`, `liveAt`, result title/year/mediaType/description/poster/ratings/offers/best/freeAvailable fields compatible with the frontend.
- Keep existing title/franchise searches working.

### 8. Vercel preview deployment and acceptance verification

Deploy `feature/search-brain-v2` to a preview, then run at minimum:

- `Where can I find all of Quentin Tarantino movies to stream`
- `Martin Scorsese movies streaming`
- `Christopher Nolan films streaming`
- `Spike Lee films available free`
- `All Denzel Washington films available on streaming`
- `All Will Smith movies available on streaming`
- `Find me a grimy 1970s revenge thriller like Rolling Thunder`
- `Find me a scary movie with a Rotten Tomatoes score of 90% or higher`
- `Where can I watch The Godfather?`
- `Where can I watch the Star Wars movie for free?`
- `Find me a giallo movie`
- `Find me a spaghetti western`

Verify no GraphQL/schema/runtime errors and inspect relevance/availability behavior.

### 9. Production promotion and post-deploy verification

Only after preview passes:

- Merge the feature branch.
- Promote/deploy to production.
- Verify homepage HTTP 200.
- Verify support screen and keyboard search remain unchanged.
- Re-run director/person and legacy title searches against production.
- Do not mark the feature complete until these checks pass.
