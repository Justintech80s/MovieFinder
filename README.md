# MovieFinder

MovieFinder is a cinema-intelligence search project for questions that ordinary streaming search handles poorly: filmographies, eras, genres, creative relationships, stylistic connections, and current availability.

The project combines deterministic search infrastructure with an explicit Cinema Graph, structured query plans, evidence-aware verification, and an optional provider-neutral AI routing layer. The current MovieFinder interface does not need to change to use these capabilities.

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
Filmography + Cinema Graph + Availability
        |
        v
Ranking -> Verification / Evidence
        |
        v
MovieFinder-compatible results
```

### Cinema Graph

`lib/search/graph-store.js` provides an in-memory directed graph for explicit relationships between cinema entities. Nodes can represent movies, people, genres, themes, movements, companies, countries, and providers. Edges can represent relationships such as `ACTED_IN`, `DIRECTED`, `WROTE`, `SHOT_BY`, `HAS_GENRE`, `HAS_THEME`, `AVAILABLE_ON`, `INFLUENCED_BY`, and `SIMILAR_TO`.

The existing concept-scoring functions in `lib/search/cinema-graph.js` remain compatible with the older search system.

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

`lib/search/model-router.js` can register model adapters by capability and use explicit selection or fallback ordering. Deterministic MovieFinder functionality does not require an external model, and no API credentials are stored in this repository.

### Orchestration

`lib/search/orchestrator.js` composes intent parsing, filmography retrieval, optional availability checks, ranking, relation evidence, and verification behind dependency-injected interfaces. Existing search modules can be adapted at this boundary without rewriting the UI.

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

## Design principles

1. Structured facts should come from structured data and deterministic code when possible.
2. AI may enrich semantic interpretation, but it should not become the only source of truth.
3. Availability must include regional and verification context because streaming catalogs change.
4. Unknown is different from unavailable.
5. Existing MovieFinder result shapes and UI behavior should remain compatible; intelligence metadata is additive.
6. Provider adapters and storage engines should remain replaceable.

## Current scope

Implemented on the cinema-intelligence feature branch are the graph core, query-plan contract, provider-neutral model router, evidence/confidence utilities, verification semantics, cinema-knowledge facade, orchestration interface, and automated unit/integration coverage for those modules.

MovieFinder does **not** claim exhaustive worldwide streaming coverage without an appropriate availability source. It also does not currently train its own foundation model or require a dedicated graph database.

## Roadmap

Future work can include persistent graph storage, production provider adapters, broader cinema-data ingestion, richer provenance rules, API packaging for third-party developers, semantic similarity models, and eventually extracting stable Cinema Graph / Film Query Engine interfaces into reusable packages.

## Project direction

The long-term goal is larger than recommendations: make cinema searchable as a connected knowledge system so applications can reason across people, works, eras, styles, creative relationships, and changing availability while showing why a result matched.
