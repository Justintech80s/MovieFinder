# MovieFinder Backend Hardening Design

Date: 2026-09-02
Branch: feature/python-search-adapter
Scope: Backend architecture only. No UI redesign.

## Goal

Harden MovieFinder's existing search architecture so it is easier to maintain, safer across JavaScript/Python boundaries, more resilient to upstream failures, and better prepared for scale without changing the public `/api/search` contract or the existing frontend appearance.

## Data sources

Keep Wikidata as the person/filmography source and JustWatch as the U.S. streaming-availability source for this pass. Do not add TMDB yet. The provider layer introduced here must make future providers replaceable without changing search orchestration.

## Architecture

Preserve the current request flow:

UI -> `/api/search` -> intent parsing -> person/catalog routing -> Python person search when configured -> JavaScript fallback -> availability -> ranking -> JSON response.

Refactor the backend into explicit boundaries:

- `api/search.js`: thin HTTP orchestration only.
- `lib/search/providers/justwatch.js`: JustWatch transport, response mapping, timeout/retry policy.
- `lib/search/providers/wikidata.js` or the existing people resolver behind a provider boundary.
- `lib/search/python-service.js`: guarded JavaScript-to-Python client.
- `lib/search/contracts.js`: runtime validation of Python responses and shared response shapes.
- `lib/search/cache.js`: bounded in-memory TTL cache for safe, non-sensitive search data.
- `lib/search/telemetry.js`: request IDs and structured diagnostic events.
- `python_search/moviebrain/models.py`: typed Pydantic request/response contracts.
- `python_search/moviebrain/errors.py`: typed availability/provider errors.

## JavaScript/Python contract

The JS adapter must not accept arbitrary JSON as a valid Python response. It must validate required fields including:

- `person`
- `filmography`
- `results`
- `availabilitySummary`
- `verified`

If validation fails, the adapter returns `null` and the JavaScript engine remains the fallback. A malformed Python response must never break `/api/search`.

Python request and response objects should use Pydantic models instead of free-form dictionaries at the service boundary. Internal helper code can still convert to dictionaries only where compatibility requires it.

## Reliability

Add bounded request timeouts to all upstream requests. The Python adapter keeps a short timeout. JustWatch and Wikidata transports should have explicit timeouts and a small retry policy for transient failures only.

Retry only safe transient failures such as timeouts, 429 responses, and selected 5xx responses. Do not retry malformed responses or deterministic 4xx failures. Use exponential backoff with a strict attempt cap to avoid request amplification.

Create typed errors so transport failures can be distinguished from malformed upstream data and application bugs.

## Caching

Add a small TTL cache abstraction with deterministic keys and bounded memory.

Initial policy:

- Person identity / filmography resolution: longer TTL, measured in hours.
- Streaming availability: shorter TTL, measured in minutes.
- Failed upstream responses: no long-lived caching.

The first implementation should be in-memory and dependency-free. It must expose a narrow interface so Redis or another shared cache can replace it later without changing search logic.

## Provider adapters

Move source-specific HTTP and mapping logic out of `api/search.js`. Search orchestration should ask providers for normalized MovieFinder data rather than knowing JustWatch GraphQL details directly.

Provider interfaces should return normalized domain data and throw typed provider errors. This allows future provider changes without rewriting intent parsing, ranking, or person aggregation.

## Observability

Generate a request ID for each search request and emit structured logs containing non-sensitive operational fields such as:

- request ID
- query kind
- selected engine (`python` or `javascript-fallback`)
- filmography count
- availability count
- duration
- provider failure category

Do not log secrets, authorization headers, or full upstream payloads.

## Availability batching and concurrency

Keep existing deduplication before availability lookup. Preserve bounded concurrency. Introduce an availability provider interface that can support batch lookup later. Do not invent unsupported JustWatch batch behavior in this pass; focus on a batch-capable internal contract and retain safe per-title calls underneath it.

## Readability

Restore `api/search.js` to readable multi-line functions and remove dense one-line control flow introduced during the adapter work. This is a maintainability refactor only and must not alter user-visible behavior.

## Testing strategy

Use TDD for each behavioral change.

Required coverage:

- Python adapter accepts a valid response.
- Python adapter rejects malformed payloads and falls back.
- Python adapter timeout falls back.
- Catalog searches never call Python.
- Provider timeout and transient retry behavior.
- No retry for deterministic 4xx failures.
- Cache hit/miss/expiry behavior.
- Person search uses cached filmography safely.
- Availability cache has a shorter TTL than filmography data.
- Structured request ID is stable within one request.
- Existing regressions remain green: exact title, free search cleanup, year/genre constraints, RT threshold, person aggregation.
- Python Pydantic contract tests reject malformed input.
- Python typed provider errors produce `UNKNOWN` availability rather than crashing the search.

## Performance validation

Add lightweight performance tests or benchmarks for representative queries. The goal is not a fixed internet-dependent latency threshold in CI. Instead, test bounded concurrency, cache effectiveness, and that repeated cached work avoids duplicate provider calls.

## Compatibility and rollout

No frontend files should change. `/api/search` remains the public interface. Python remains guarded by `MOVIEFINDER_PYTHON_SEARCH_URL`; if it is absent, malformed, slow, or unavailable, the JavaScript path continues to operate.

Roll out in small commits with CI after each layer. Preview acceptance must cover person searches and existing catalog regressions before merge or production promotion.

## Out of scope

- Frontend redesign
- TMDB integration
- New authentication system
- Redis deployment
- New recommendation UI
- New user tracking
- Replacing JustWatch or Wikidata

## Success criteria

The hardening pass is complete when:

1. `api/search.js` is readable and source-specific transport code is moved behind provider adapters.
2. JS/Python payloads are runtime-validated.
3. Python uses typed request/response models at the API boundary.
4. Upstream calls have explicit timeout/retry behavior.
5. Filmography and availability have separate TTL caching policies.
6. Structured request IDs/logging exist.
7. Existing behavior and UI remain unchanged.
8. Full Node and Python test suites pass.
9. Preview acceptance tests pass for Tarantino, Will Smith, Nolan, year/genre/RT constraints, The Godfather, and Star Wars free.
