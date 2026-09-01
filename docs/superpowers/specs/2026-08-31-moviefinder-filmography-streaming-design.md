# MovieFinder Filmography + Streaming Timeline Design

## Goal
Make MovieFinder reliably connect any resolved actor, director, or producer to a complete movie filmography, distinguish complete credits from titles available now, and attach current or reliably announced upcoming U.S. streaming availability without guessing.

## Baseline constraints
- Preserve the current MovieFinder UI, branding, support screen, support destinations, keyboard behavior, and existing working title search.
- Do not promote the feature branch to production until the preview passes regression and acceptance tests.
- Do not scrape Rotten Tomatoes, IMDb, streaming services, or other sites in violation of their terms.
- Do not commit API keys, passwords, tokens, private credentials, or payment secrets.
- Supabase is optional persistence/cache infrastructure; it is not an authoritative movie or streaming source by itself.

## Architecture
The person-search path becomes:

User query -> intent/entity parser -> person resolver -> stable person ID -> role-aware credits -> stable work IDs -> complete filmography -> availability resolver -> available-now subset + streaming timeline -> response formatter.

The system must keep filmography identity and availability separate. A movie remains in the complete filmography even when no current streaming offer exists or the availability source is temporarily unavailable.

## Person and role model
Actor, director, and producer are first-class roles. The same interfaces should allow later expansion to writers, cinematographers, composers, editors, and other crew roles.

Each resolved person has:
- `personId`: stable source identifier (initially Wikidata QID when using the no-key fallback)
- `name`
- `description`
- `source`

Each credit has:
- `workId`: stable movie identifier from the credit source when available
- `title`
- `year`
- `imdbId` when legally available from structured metadata
- `role`: `cast`, `director`, or `producer`
- `source`

Role mappings for the initial Wikidata fallback:
- cast -> `P161`
- director -> `P57`
- producer -> `P162`

`all` credits may combine the supported role mappings and deduplicate by stable work ID plus role.

## Search intent
The parser must recognize explicit role wording before generic title extraction, including:
- `movies directed by Christopher Nolan`
- `movies starring Denzel Washington`
- `movies produced by Jerry Bruckheimer`
- `Quentin Tarantino filmography`
- `all credits for Clint Eastwood`

It also determines filmography view:
- `complete`: user requests a filmography/all movies/credits without an availability constraint
- `available`: query asks for streaming, available now, free, rent, buy, or a provider

The backend should support both views without requiring a UI redesign. It may add backward-compatible response fields while preserving the existing `results` array.

## Complete filmography vs available now
For person searches the API returns:
- `filmography`: complete role-filtered credits, normalized to movie-like records with empty offers when availability is unknown or absent
- `results`: records matching the requested view; for `available` this is the current watchable subset, and for `complete` this may include every credit
- `availabilitySummary`: counts for available now, unavailable/no-offer, and temporarily unknown

Current streaming data must never be used to decide whether a title belongs in the filmography.

## Availability adapter and failure handling
Availability queries run behind a normalized adapter. The JustWatch prototype adapter must use a GraphQL query valid for the current schema and must surface structured source failures.

If the availability source fails for one title or for the request:
- do not discard the underlying filmography credit
- do not fail the whole person-filmography request solely because availability failed
- mark the affected title `availabilityStatus: 'UNKNOWN'`
- include `availabilityError` only as non-sensitive diagnostic metadata when appropriate

Generic title searches should return a controlled `availability temporarily unavailable` response rather than an opaque crash when the external availability source fails.

## Streaming timeline
Each movie record can carry a `streamingTimeline` array. Normalized entries use:
- `provider`
- `region` (initially `US`)
- `accessType`: `FREE`, `ADS`, `FLATRATE`, `RENT`, or `BUY`
- `status`: `NOW`, `UPCOMING`, `ANNOUNCED`, or `UNKNOWN`
- `availableFrom`: ISO date/time or null
- `availableUntil`: ISO date/time or null
- `price`
- `currency`
- `source`
- `sourceCheckedAt`
- `confidence`

Current offers become `NOW`. Future dates may only become `UPCOMING` or `ANNOUNCED` when a reliable source actually supplies a date or announcement. MovieFinder must not infer future service dates from theatrical, home-video, or historical release patterns.

## Stable IDs and optional persistence
A persistence layer may store people, movies, credits, external IDs, and availability snapshots. The preferred schema is compatible with Supabase/Postgres:
- `people`
- `movies`
- `credits`
- `availability_snapshots`

The runtime must still work without Supabase configured by using source adapters directly. When Supabase is configured, it acts as a cache/index that reduces repeated external lookups and supports future Cinema Brain relationships.

## Acceptance requirements
Person/role behavior:
- Quentin Tarantino director search returns directing credits rather than zero films.
- Denzel Washington actor search returns acting credits.
- Jerry Bruckheimer producer search returns producing credits.
- Clint Eastwood all-credits search can distinguish actor/director/producer credits.
- Complete filmography includes films with no current offers.
- Available-now view contains only titles with matching current offers.

Regression behavior:
- `Where can I watch The Godfather?` must not return HTTP 500 because of a malformed availability query.
- `Where can I watch the Star Wars movie for free?` preserves free intent.
- Existing provider, price-label, and title-search response fields remain backward compatible.

Streaming timeline behavior:
- Current offers normalize to `NOW` timeline entries.
- A supplied future availability record normalizes to `UPCOMING`/`ANNOUNCED` without guessing.
- Missing future information remains `UNKNOWN`/absent rather than fabricated.

## Deployment strategy
1. Implement on `feature/search-brain-v2` only.
2. Add a failing test before every behavior change.
3. Verify tests locally/materialized from the exact branch files.
4. Let Git-connected Vercel create Preview deployments.
5. Test person, producer, complete-filmography, available-now, Godfather, Star Wars, and existing legacy searches against Preview.
6. Do not merge/promote until Preview passes and the visible app remains unchanged.
7. After production promotion, re-test the live endpoint before claiming completion.
