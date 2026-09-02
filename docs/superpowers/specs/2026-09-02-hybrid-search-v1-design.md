# MovieFinder Hybrid Search v1 Design

## Goal

Upgrade MovieFinder from a single-source catalog lookup plus additive ranking into a domain-specialized hybrid film search engine that combines multiple independent relevance signals while preserving the existing UI, deterministic constraints, and verified streaming availability behavior.

## Scope

Hybrid Search v1 is a backend/search-engine upgrade only. It must not redesign the current MovieFinder interface. It must remain compatible with the existing Vercel deployment, current Node search API, Python MovieBrain test surface, Cinema Graph architecture, analytics, outbound tracking, and person-filmography flow.

## Core Search Pipeline

1. Parse the user query with the existing intent parser.
2. Normalize and expand the query into deterministic lexical variants.
3. Retrieve candidate movies from the existing availability/catalog source.
4. Produce multiple ordered relevance lists over the candidate set:
   - exact/title lexical relevance
   - token/semantic-style similarity
   - Cinema Graph/concept relevance
   - availability relevance
   - existing MovieFinder ranking signal
5. Fuse those lists with Reciprocal Rank Fusion (RRF).
6. Apply hard constraints as authoritative filters before final output.
7. Add bounded deterministic boosts for exact title, requested provider, free/rent/buy intent, and evidence-backed graph matches.
8. Return the top results with an explainable `hybridScore` and compact `searchSignals` metadata.
9. Keep AI optional. AI output must never override hard constraints, streaming availability truth, or unsupported evidence.

## Components

### Query Expansion

Create `lib/search/query-expansion.js`.

Responsibilities:
- normalize punctuation, apostrophes, case, and repeated whitespace;
- generate deterministic token forms;
- expand a small curated film-domain synonym map such as `sci fi -> science fiction`, `gangster -> crime`, `scary -> horror`, `romcom -> romantic comedy`;
- preserve the original query;
- expose an interface that can later accept learned synonyms without changing callers.

No external AI call is required for query expansion in v1.

### Lexical and Semantic-Style Retrieval

Create `lib/search/hybrid-search.js`.

Responsibilities:
- score candidate titles, descriptions, genres, and known metadata against the expanded query;
- reward exact title and high token overlap;
- provide typo tolerance with a bounded edit-distance similarity suitable for titles and names;
- provide a lightweight semantic-style score using normalized token sets and synonym-expanded terms;
- consume existing Cinema Graph concept scores rather than duplicating graph logic;
- return independent ranked lists and per-result signal metadata.

This v1 layer intentionally avoids introducing Elasticsearch/OpenSearch or an embedding service yet. Its interfaces should make those engines replaceable retrieval providers later.

### Rank Fusion

Create `lib/search/rank-fusion.js`.

Responsibilities:
- implement Reciprocal Rank Fusion across named ranked lists;
- use a stable default constant `k = 60`;
- deduplicate by MovieFinder result ID, falling back to normalized title/year when an ID is absent;
- return deterministic ordering for ties;
- expose component contributions for debugging and explainability.

### Final Ranking

Modify `lib/search/rank.js`.

Responsibilities:
- preserve existing `rankResults` behavior for callers that still depend on it;
- add a hybrid finalization path that consumes fused retrieval scores plus authoritative existing signals;
- prevent popularity/ratings from overwhelming query relevance;
- cap additive boosts so final scores remain bounded and interpretable.

### Search API Integration

Modify `api/search.js`.

For general catalog searches:
- keep JustWatch/current availability retrieval as the live source;
- keep provider/free/rent/buy filtering and hard constraints authoritative;
- build expanded query terms;
- run hybrid retrieval over the candidate pool;
- fuse independent rankings;
- return the top 40 results;
- preserve analytics, outbound URL tracking, evidence packets, and existing response fields;
- add non-breaking `searchMode: "hybrid-v1"` and per-result signal metadata.

Person-filmography search remains on its existing deterministic path in this phase. Hybrid filmography reranking can be added later after the general catalog path is validated.

## Typo Tolerance

Hybrid Search v1 should tolerate small title/name spelling errors without turning fuzzy matching into the dominant signal. Edit-distance similarity should only provide a meaningful boost when strings are already reasonably close in length and token structure. Exact matches always outrank fuzzy matches.

Examples that should improve:
- `Godfellas` should still surface `Goodfellas` strongly when present in the candidate set.
- `Scorcese crime movies` should receive useful lexical similarity against metadata containing `Scorsese` when that metadata is available.

## Synonyms

Use a small deterministic film-domain synonym table in v1. The table must be transparent and testable. It is not intended to encode subjective film criticism. Cinema Graph relationships remain the correct layer for movements, influences, themes, and deeper film-history relationships.

## Hard Constraints and Availability

The following remain authoritative and must be applied before final output:
- requested streaming provider;
- free-only, rent-only, or buy-only intent;
- media type and existing parsed hard constraints;
- current availability data.

Hybrid ranking may reorder valid candidates. It may not reintroduce candidates removed by hard constraints.

If the availability source fails, MovieFinder must continue using the current explicit availability-unavailable failure behavior rather than inventing streaming status.

## Explainability

Each hybrid-ranked result should expose compact machine-readable signals such as:

```json
{
  "hybridScore": 0.812,
  "searchSignals": {
    "lexical": 0.94,
    "semantic": 0.76,
    "cinemaGraph": 0.18,
    "rrf": 0.049,
    "exactTitle": false
  }
}
```

The existing user-facing UI does not need to render these fields yet.

## Testing

Add tests covering:
- query normalization and synonym expansion;
- exact title ranking above fuzzy title matches;
- bounded typo tolerance;
- deterministic RRF ordering and deduplication;
- graph/concept relevance contributing without overriding exact matches;
- availability/provider hard constraints surviving hybrid reranking;
- integration response preserving current fields and adding `searchMode`/signals;
- malformed or unavailable optional AI providers remaining non-fatal;
- existing Node and Python suites continuing to pass.

Representative relevance cases:
- `movies like Goodfellas`
- `1970s paranoid thrillers`
- `crime movies influenced by Kurosawa`
- `Godfellas`
- provider-specific streaming searches

## Deferred Work

The following are intentionally deferred from Hybrid Search v1:
- Elasticsearch/OpenSearch deployment;
- production vector database;
- embedding generation and ANN vector retrieval;
- cross-encoder reranking;
- large learned synonym dictionaries;
- personalized ranking;
- multimodal/image search;
- autonomous crawling or general web indexing.

The v1 interfaces must permit these systems to replace or augment individual retrieval lists later without rewriting the API orchestration layer.

## Success Criteria

Hybrid Search v1 is complete when:
- the general catalog path uses multiple independent retrieval signals and RRF;
- exact and typo-tolerant title queries behave predictably;
- film-domain synonym expansion is active;
- Cinema Graph relevance participates in ranking;
- hard availability constraints remain authoritative;
- response compatibility is preserved;
- new relevance tests pass;
- the full Node and Python CI suites pass;
- no merge into `main` is performed while required deployment checks are failing for reasons that could mask application defects.
