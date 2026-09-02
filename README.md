# MovieFinder

MovieFinder is a cinema-intelligence search project for questions that ordinary streaming search handles poorly: filmographies, eras, genres, creative relationships, stylistic connections, and current availability.

The project combines deterministic search infrastructure with an explicit Cinema Graph, structured query plans, evidence-aware verification, a persistent Supabase/Postgres knowledge layer, resumable Wikidata ingestion, and an optional provider-neutral AI routing layer. The current MovieFinder interface does not need to change to use these capabilities.

## Why MovieFinder

A query such as:

> Find Gene Hackman political thrillers from the 1970s that are streaming in the US and explain the cinema connections behind the matches.

contains several different problems: person resolution, filmography completeness, year and genre constraints, semantic cinema concepts, regional streaming availability, ranking, and factual verification. MovieFinder's goal is to make those steps inspectable instead of asking one language model to guess the entire answer.

## Architecture

```text
Natural-language query
        |
        v
Intent parser -> Structured Query Plan
        |
        v
Filmography + Persistent Cinema Graph + Availability
        |
        v
Ranking -> Verification / Evidence
        |
        v
MovieFinder-compatible results
```

Cinema knowledge can be populated independently of a user search:

```text
Wikidata QID
    |
    v
Bounded entity fetch -> deterministic normalizer
    |
    v
Entity / relation provenance
    |
    v
Supabase Cinema Graph -> legacy people/movies/credits mirror
```

Search never needs to depend on a live Wikidata request.

### Live search orchestration

`lib/search/live-orchestrator.js` coordinates the production search decision after the HTTP boundary has validated a request. MovieFinder deliberately does not send every search to an AI model.

Simple direct searches stay deterministic and require no model call or AI provider key. Complex relationship, thematic, or multi-concept searches may read a bounded set of candidates from the persistent Cinema Graph and may then request optional AI reasoning.

The live path follows an authority order rather than treating model output as a source of record:

```text
Validated query
    |
    +--> simple/direct ------------------------> deterministic search
    |
    +--> complex --> bounded Cinema Graph
                       |
                       v
                 current availability
                       |
                       v
              hard constraints + ranking
                       |
                       v
                verified evidence
                       |
                       +--> optional AI reasoning
                       |
                       v
             MovieFinder-compatible results
```

Graph traversal depth, graph candidate counts, availability fan-out, and evidence arrays are bounded. Graph-derived candidates that make streaming claims must pass the current availability path before inclusion, and hard constraints plus deterministic ranking remain authoritative.

If persistent graph access fails or is not configured, MovieFinder falls back to deterministic search. If AI routing, a model provider, or model synthesis fails, verified graph/deterministic results survive without turning the request into an AI-dependent failure. AI is enrichment, not a required execution layer.

### Current streaming availability authority

JustWatch remains MovieFinder's current streaming-availability authority in the live search path. Cinema Graph relationships and stored provenance can help identify and explain candidate movies, but stored graph facts alone never become a claim that a title is streaming now.

Availability is checked through the existing bounded availability path. Provider, region, offer type, and other hard constraints are applied deterministically. MovieFinder continues to distinguish `available`, `unavailable`, `unknown`, and `not_requested`; a failed or missing lookup is not silently converted into a current availability claim.

### Verified AI boundary

AI receives only a bounded, explicitly assembled verified-evidence package. The package can contain approved movie facts, graph relationships/paths, current availability evidence, constraints, provenance, and confidence metadata needed for cinema reasoning.

Model output is commentary only. It cannot overwrite verified movie identity, title, release year, provider, availability, or other structured result facts. Untrusted model `structuredData` is not allowed to replace MovieFinder's authoritative result fields.

Model provider credentials and supported provider keys remain server-side configuration. MovieFinder does not send environment variables, raw request headers, database credentials, secrets, arbitrary SQL, or provider endpoint overrides to the model.

No live Wikidata lookup is introduced into `/api/search`; Wikidata remains an ingestion-time knowledge source rather than a request-path dependency.

### Cinema Graph

`lib/search/graph-store.js` provides an in-memory directed graph for explicit relationships between cinema entities. `lib/search/persistent-graph-store.js` exposes the same core graph operations against an injected persistent repository so search code can move between in-memory and database-backed storage without changing its graph concepts.

Nodes can represent movies, people, genres, themes, movements, companies, countries, and providers. Edges can represent relationships such as `ACTED_IN`, `DIRECTED`, `WROTE`, `SHOT_BY`, `HAS_GENRE`, `HAS_THEME`, `AVAILABLE_ON`, `INFLUENCED_BY`, and `SIMILAR_TO`.

The existing concept-scoring functions in `lib/search/cinema-graph.js` remain compatible with the older search system.

### Persistent cinema knowledge

`supabase/migrations/20260902_persistent_cinema_graph.sql` adds durable graph and ingestion structures:

- `cinema_entities`
- `cinema_entity_sources`
- `cinema_relations`
- `cinema_relation_sources`
- `cinema_ingestion_jobs`

Entities use deterministic canonical keys such as `wikidata:Q123`. Relationships are deduplicated by source entity, relationship type, and target entity. Source records preserve retrieval metadata separately from canonical graph records.

`lib/ingestion/cinema-graph-repository.js` owns persistence operations and compatibility mirroring. Clean Wikidata people and movies can still populate the pre-existing `people` and `movies` tables. Relationships that fit the legacy schema are mirrored as `cast`, `director`, or `producer` credits; richer relationships remain available in the Cinema Graph without being forced into the older schema.

### Wikidata ingestion

`lib/ingestion/wikidata-client.js` uses Wikidata's `wbgetentities` API through an injected fetch implementation. Requests are QID-based, capped at 50 entities per call, timeout-bounded, and retryable. No API key is required or committed.

`lib/ingestion/wikidata-normalizer.js` deterministically maps supported claims into MovieFinder entities and relationships. Current mappings include acting, directing, writing, producing, cinematography, genre, country, release year, and IMDb ID. Cinema credit relationships use the graph direction `Person -> Movie`.

`lib/ingestion/wikidata-ingestion.js` coordinates bounded seed ingestion. It can:

- start from a Wikidata QID,
- discover a bounded number of linked QIDs,
- normalize and persist graph records,
- attach entity and relationship provenance,
- mirror compatible legacy records,
- checkpoint only after durable work,
- resume interrupted jobs without reprocessing completed QIDs,
- record failed jobs without falsely advancing their checkpoint.

The ingestion layer is intentionally bounded and does not implement an unrestricted Wikidata crawl or arbitrary SPARQL execution.

### Film Query Plans

`lib/search/query-plan.js` turns parsed intent into a serializable execution contract.

```js
import { buildQueryPlan } from './lib/search/query-plan.js';

const plan = buildQueryPlan({
  raw: 'Gene Hackman 1970s political thrillers streaming',
  people: ['Gene Hackman'],
  genres: ['thriller'],
  concepts: ['paranoid'],
  yearRange: { min: 1970, max: 1979 }
}, { region: 'US' });
```

This separates understanding a question from executing it and makes complicated searches easier to test and debug.

### Evidence and verification

Results can carry additive `evidence`, `confidence`, and `verification` metadata. Streaming state distinguishes `available`, `unavailable`, `unknown`, and `not_requested`; a failed or missing availability lookup is never silently represented as unavailable.

### Provider-neutral AI routing

`lib/search/model-router.js` can register model adapters by capability and use explicit selection or fallback ordering. Deterministic MovieFinder functionality does not require an external model, and no API credentials are stored in this repository. In live search, the router is invoked selectively only after MovieFinder has assembled bounded verified evidence.

### Orchestration

`lib/search/orchestrator.js` provides the broader dependency-injected cinema orchestration interface. `lib/search/live-orchestrator.js` is the live `/api/search` coordinator for selective AI, bounded persistent graph reads, authoritative current availability, deterministic filtering/ranking, verified evidence, and graceful graph/model fallback.

`api/search.js` remains the HTTP and security boundary. Existing validation, rate limiting, defensive headers, safe public errors, analytics, outbound tracking, and frontend-compatible response behavior execute around the delegated live search path rather than being replaced by AI orchestration.

## Graph example

```js
import { createGraphStore } from './lib/search/graph-store.js';

const graph = createGraphStore();
graph.addNode({ id: 'person:gene-hackman', type: 'Person', name: 'Gene Hackman' });
graph.addNode({ id: 'movie:conversation', type: 'Movie', title: 'The Conversation' });
graph.addEdge({
  from: 'person:gene-hackman',
  to: 'movie:conversation',
  type: 'ACTED_IN'
});

console.log(graph.explainPath('person:gene-hackman', 'movie:conversation'));
```

## Development

Requirements:

- Node.js 20 or newer
- Python dependencies only when working with the separate Python search backend

Run the JavaScript test suite:

```bash
npm test
```

The repository also contains Python search infrastructure and its own tests/dependencies. The cinema-intelligence modules described here are implemented in the Node search layer and are designed to coexist with the existing backend.

Ingestion tests use injected clients and in-memory fakes; the automated test suite does not require Supabase credentials. Some existing live-data checks exercise external availability/knowledge services and can fail independently when those services are unavailable.

## Design principles

1. Structured facts should come from structured data and deterministic code when possible.
2. AI may enrich semantic interpretation and explanations, but it should not become the source of truth for verified result fields.
3. Availability must include regional and verification context because streaming catalogs change; current streaming claims come from the live availability path.
4. Unknown is different from unavailable.
5. Existing MovieFinder result shapes and UI behavior should remain compatible; intelligence metadata is additive.
6. Provider adapters and storage engines should remain replaceable.
7. External ingestion should be bounded, idempotent, resumable, and provenance-aware.
8. Search should query stored cinema knowledge instead of depending on a live third-party knowledge request.
9. Simple direct searches should avoid AI latency; complex searches may use bounded graph and AI enrichment when it adds value.
10. Graph and AI failures should degrade cleanly to verified deterministic behavior whenever that path can answer the request.

## Current scope

Implemented are the graph core, persistent graph adapter, persistent cinema graph schema, Wikidata client and normalizer, resumable seed ingestion, provenance persistence, legacy table mirroring, query-plan contract, provider-neutral model router, evidence/confidence utilities, verification semantics, cinema-knowledge facade, orchestration interfaces, selective live-search AI routing, bounded persistent graph candidate retrieval, current availability verification, deterministic hard filtering/ranking, verified AI evidence boundaries, `/api/search` delegation, and automated unit/integration coverage for these modules.

MovieFinder does **not** claim exhaustive worldwide streaming coverage without an appropriate availability source. It does not perform an unrestricted Wikidata crawl, rely on arbitrary SPARQL queries, train its own foundation model, or require Neo4j or another dedicated graph database.

## Roadmap

Future work can include background ingestion scheduling, broader multi-source cinema ingestion, semantic similarity/embeddings, richer source reconciliation and provenance rules, API packaging for third-party developers, and eventually extracting stable Cinema Graph / Film Query Engine interfaces into reusable packages.

## Project direction

The long-term goal is larger than recommendations: make cinema searchable as a connected knowledge system so applications can reason across people, works, eras, styles, creative relationships, and changing availability while showing why a result matched.
