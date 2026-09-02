# MovieFinder Cinema Intelligence Platform — Design

Date: 2026-09-02
Status: Approved design, pending implementation plan

## Purpose

Evolve MovieFinder from a movie-search backend into reusable cinema-intelligence infrastructure while preserving the current application look and existing search behavior.

MovieFinder should be able to accept difficult natural-language film questions, convert them into structured constraints and relationships, retrieve candidate titles and people, verify factual and streaming claims, rank results, and explain why each result matched.

## Success criteria

1. Existing MovieFinder UI behavior remains compatible.
2. Existing filmography and streaming searches continue to work.
3. Complex searches can be represented as deterministic query plans rather than relying entirely on an LLM response.
4. Cinema relationships are modeled explicitly instead of only as keyword weights.
5. Model providers are replaceable behind one interface.
6. Returned intelligence can carry evidence, confidence, and match reasons.
7. Core modules can be imported independently by other applications.
8. Automated tests cover graph traversal, planning, routing, verification, and compatibility.
9. Public repository documentation clearly explains the reusable architecture without claiming capabilities that are not implemented.

## Recommended architecture

Use a hybrid deterministic + AI architecture. Deterministic code owns entity relationships, constraints, provider availability, ranking, evidence, and verification. AI is used where semantic interpretation or synthesis is valuable, but it must not be the sole source of truth for structured facts.

Flow:

`Natural-language query -> intent parser -> query planner -> cinema graph/retrieval -> specialist services -> verification -> ranking -> evidence-backed response`

This approach is preferred over an LLM-only agent because it is testable and reduces hallucination, and over a graph-only system because natural-language film questions frequently contain fuzzy stylistic and thematic concepts.

## Components

### 1. Cinema Graph

Replace the current concept-only interpretation of `lib/search/cinema-graph.js` with a backward-compatible graph layer.

Core node types:

- Movie
- Person
- Director
- Writer
- Cinematographer
- Character
- Genre
- Subgenre
- Theme
- Movement / era
- Country
- Production company
- Streaming provider

Core edge types:

- ACTED_IN
- DIRECTED
- WROTE
- SHOT_BY
- PLAYS
- HAS_GENRE
- HAS_THEME
- PART_OF_MOVEMENT
- PRODUCED_BY
- AVAILABLE_ON
- INFLUENCED_BY
- SIMILAR_TO

The existing cinema concept scoring API remains available so callers do not break. New graph APIs provide node registration, edge registration, neighbor lookup, bounded traversal, path explanation, and relation scoring.

The first implementation is an in-memory graph with a storage adapter boundary. A dedicated graph database is explicitly out of scope for this phase; the adapter allows one later without forcing MovieFinder to adopt operational complexity now.

### 2. Film Query Engine

Add a planner that turns parsed intent into a structured plan.

Example input:

`Find 1970s political thrillers starring Gene Hackman that are streaming in the US and feel like The Parallax View.`

Representative plan:

- entity: Gene Hackman
- work type: movie
- release range: 1970-1979
- genres/concepts: political thriller
- similarity anchor: The Parallax View
- availability region: US
- availability required: true
- verification required: true

Plans are plain serializable objects. This keeps execution inspectable and lets future API consumers build or modify plans directly without natural language.

### 3. Specialist services

Do not create free-roaming autonomous agents in the initial implementation. Use narrowly scoped services with agent-compatible interfaces:

- Filmography service: canonical credits and role filtering.
- Availability service: streaming/provider checks using MovieFinder's existing availability layer.
- Cinema knowledge service: graph relationships, concepts, eras, themes, and similarity evidence.
- Recommendation service: ranking candidates against explicit dimensions.
- Verification service: validates claims and attaches provenance/confidence.

An orchestrator composes these services according to the query plan. This provides the benefits of specialization without unnecessary autonomous-agent complexity.

### 4. AI provider router

Introduce a provider-neutral interface for semantic interpretation and synthesis.

Provider adapters may support OpenAI-compatible APIs, Anthropic, Google, xAI, or local/open models later. No external provider becomes mandatory for deterministic MovieFinder functionality.

The router must support:

- capability declaration
- explicit provider selection
- fallback ordering configured by the host application
- timeout/error normalization
- deterministic no-model fallback where possible

API keys and secrets are never committed to the repository.

### 5. Evidence and confidence

Every enriched match can carry:

- `reasons`: human-readable match explanations
- `evidence`: structured source/provenance records
- `confidence`: normalized confidence value
- `verifiedAt`: timestamp when appropriate

Confidence is not presented as mathematical certainty. It reflects evidence quality/completeness according to documented rules.

Streaming availability must remain especially explicit about region and freshness because catalogs change.

### 6. Public developer surface

Create a repository README that explains MovieFinder as a cinema-intelligence/search project, shows the architecture, documents setup/testing, and includes truthful usage examples.

Expose stable entry points for graph construction/traversal and structured query planning. The internal app can use the same interfaces so the open-source layer is not merely demonstration code.

Potential future packages such as `cinema-graph` or `film-query-engine` remain future work; this phase keeps them inside MovieFinder until the APIs stabilize.

## Data flow

1. Receive query and request context (including region where available).
2. Parse deterministic constraints using the existing intent system.
3. Optionally enrich ambiguous semantic concepts through the configured model provider.
4. Produce a structured query plan.
5. Resolve people/titles and retrieve candidate filmography.
6. Traverse Cinema Graph relationships needed by the plan.
7. Check streaming availability when requested.
8. Rank candidates using explicit constraint, graph, similarity, and availability signals.
9. Verify important claims and attach evidence/confidence.
10. Return the current MovieFinder-compatible result shape plus optional intelligence metadata.

## Compatibility

This project must not redesign MovieFinder's UI.

Existing exported functions should either remain intact or receive compatibility wrappers. New intelligence metadata should be additive. API consumers that do not request or understand the new fields should continue to function.

## Error handling

- Invalid/empty query plans fail with typed validation errors.
- Unknown graph nodes return empty results rather than throwing during ordinary lookup.
- Provider failures degrade to deterministic behavior where possible.
- Availability failures are represented as unknown/unverified, never silently converted to unavailable.
- Verification failures lower confidence or mark evidence incomplete; they must not fabricate support.
- Traversal uses depth/result limits to prevent runaway graph exploration.

## Testing strategy

Use test-driven implementation.

Required coverage:

- graph node/edge creation and deduplication
- traversal and path explanations
- compatibility with current cinema concept scoring
- deterministic query-plan generation
- complex actor/era/genre/availability plans
- provider router fallback and normalized failures using mocks
- evidence/confidence aggregation
- availability unknown-vs-unavailable behavior
- orchestrator integration using fixtures
- regression tests for existing filmography/search behavior

CI must run the existing test suite plus the new tests before the feature is considered merge-ready.

## Repository presentation

The README should lead with the user problem rather than inflated AI claims: streaming catalogs and film databases are difficult to query across people, eras, styles, relationships, and current availability.

It should show one compelling complex query, the resulting structured plan, a concise architecture diagram, installation/testing instructions, and the distinction between implemented features and roadmap items.

## Scope boundaries

Included in this phase:

- graph core and compatibility layer
- structured query planner
- specialist service interfaces/orchestration
- provider-neutral AI routing interface
- evidence/confidence model
- tests
- README/developer documentation

Not included:

- UI redesign
- training a proprietary foundation model
- scraping services that prohibit it
- committing API credentials
- deploying a Neo4j/other graph cluster
- autonomous browser agents
- claiming exhaustive worldwide streaming coverage without a data source that supports it
- extracting the modules into separate repositories/packages before their APIs stabilize

## Rollout

All implementation occurs on `feature/cinema-intelligence-platform`. The branch is tested and reviewed through a pull request before `main` is changed. The current production behavior remains the compatibility baseline.
