# Persistent Cinema Graph + Wikidata Ingestion Design

Date: 2026-09-02
Status: Proposed for implementation
Branch: `feature/persistent-cinema-graph-ingestion`

## Goal

Turn MovieFinder's in-memory Cinema Graph into a durable cinema knowledge layer backed by the project's existing Supabase/Postgres schema, then populate it through a resumable Wikidata ingestion pipeline. Existing MovieFinder UI behavior must remain unchanged.

The phase is successful when MovieFinder can ingest a real person or film from Wikidata, persist normalized entities and relationships, reload them in a later process, traverse those relationships through the existing Cinema Graph interface, and expose source/provenance metadata for the stored facts.

## Constraints

- Extend the existing Supabase schema rather than introduce a second graph database.
- Preserve the current `people`, `movies`, `credits`, and `availability_snapshots` data model and existing search behavior.
- Do not require TMDb or a new paid/API-key data source in this phase.
- Wikidata is the initial public knowledge source; the ingestion interfaces must allow TMDb and other sources later.
- Existing availability providers remain authoritative for streaming availability and continue to write availability snapshots independently.
- No MovieFinder UI redesign.
- Ingestion must be idempotent and resumable.
- Source attribution and source identifiers must survive normalization.

## Architecture

```text
Wikidata
   |
   v
Wikidata Client
   |
   v
Source Records
   |
   v
Normalizer + Entity Resolution
   |
   +--------------------+
   |                    |
   v                    v
Canonical Entities   Canonical Relations
   |                    |
   +---------+----------+
             |
             v
      Supabase/Postgres
             |
             v
 Persistent Graph Adapter
             |
             v
 Cinema Knowledge / Orchestrator
             |
             v
 Existing MovieFinder Results
```

The graph remains an application-level abstraction. Postgres stores canonical entities, relations, and provenance; MovieFinder does not depend on database-specific graph extensions.

## Persistent Data Model

### Existing tables retained

- `people`
- `movies`
- `credits`
- `availability_snapshots`

The existing tables remain compatible with current code. New graph tables complement them instead of replacing them.

### `cinema_entities`

Canonical graph-addressable entities.

Fields:
- `id uuid primary key`
- `entity_type text not null`
- `canonical_key text not null unique`
- `name text not null`
- `description text`
- `properties jsonb not null default '{}'`
- `created_at timestamptz`
- `updated_at timestamptz`

Initial entity types include `Movie`, `Person`, `Genre`, `Theme`, `Movement`, `Country`, `Company`, `Character`, and `Provider`.

`canonical_key` provides a stable application identifier such as `wikidata:Q12345`. Future source aliases can point to the same canonical entity without changing graph consumers.

### `cinema_entity_sources`

Maps canonical entities to source-specific identifiers and provenance.

Fields:
- `entity_id uuid references cinema_entities`
- `source text`
- `external_id text`
- `source_url text`
- `retrieved_at timestamptz`
- `payload_hash text`
- unique `(source, external_id)`

### `cinema_relations`

Directed graph edges.

Fields:
- `id uuid primary key`
- `from_entity_id uuid references cinema_entities`
- `to_entity_id uuid references cinema_entities`
- `relation_type text not null`
- `properties jsonb not null default '{}'`
- `confidence numeric(4,3)`
- `created_at timestamptz`
- `updated_at timestamptz`
- unique `(from_entity_id, relation_type, to_entity_id)`

Initial relation types include `ACTED_IN`, `DIRECTED`, `WROTE`, `PRODUCED`, `SHOT_BY`, `PLAYS`, `HAS_GENRE`, `HAS_THEME`, `PART_OF_MOVEMENT`, `FROM_COUNTRY`, `PRODUCED_BY`, `INFLUENCED_BY`, and `SIMILAR_TO`.

### `cinema_relation_sources`

Provenance for individual relationships.

Fields:
- `relation_id uuid references cinema_relations`
- `source text`
- `external_id text`
- `source_url text`
- `retrieved_at timestamptz`
- unique `(relation_id, source, external_id)`

A relationship may have multiple independent sources later.

### `cinema_ingestion_jobs`

Tracks ingestion progress and makes jobs resumable.

Fields:
- `id uuid primary key`
- `source text not null`
- `job_type text not null`
- `seed_external_id text`
- `status text` constrained to `pending`, `running`, `completed`, `failed`
- `checkpoint jsonb not null default '{}'`
- `stats jsonb not null default '{}'`
- `error text`
- `started_at timestamptz`
- `completed_at timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

## Compatibility With Existing Tables

Wikidata movie/person ingestion should also upsert the existing `movies`, `people`, and `credits` tables when the normalized record maps cleanly to those concepts. This preserves existing filmography/search paths while the graph becomes richer.

The new graph layer must not make current search dependent on successful Wikidata access. Stored graph knowledge is an enrichment and persistence layer, not a single point of failure.

## Storage Adapter

Add a persistent adapter implementing the same conceptual operations as `lib/search/graph-store.js`:

- `addNode`
- `addEdge`
- `getNode`
- `nodes`
- `edges`
- `neighbors`
- `traverse`
- `explainPath`

The adapter accepts an injected database client. Tests use a fake client/repository so the unit suite does not require live Supabase credentials.

The existing in-memory graph remains available for deterministic tests and lightweight usage.

## Wikidata Client

The Wikidata client owns HTTP/source concerns only. It must not write to the database directly.

Responsibilities:
- fetch a seed entity by Wikidata QID;
- fetch required linked entities in bounded batches;
- identify supported cinema claims;
- preserve source IDs and retrieval timestamps;
- return source-shaped records to the normalizer;
- enforce request timeouts and bounded retries;
- surface partial/failure states without fabricating facts.

The client should use dependency-injected `fetch` so tests are fully offline.

## Normalization

The normalizer converts source-shaped Wikidata records into MovieFinder canonical records.

Normalization includes:
- deterministic canonical keys;
- entity type mapping;
- names/descriptions;
- release year when available;
- IMDb identifiers when available;
- cinema relation mapping;
- source metadata;
- deduplication within an ingestion batch.

Unknown or unsupported Wikidata claims are ignored rather than guessed.

## Ingestion Service

The ingestion service coordinates client, normalizer, and repository.

Initial public operation:

`ingestWikidataSeed(qid, options)`

The first implementation is deliberately seed-based rather than attempting to crawl all of Wikidata. A seed may be a person or film. The service ingests the seed and supported directly linked cinema entities/relations within configured limits.

Flow:
1. create/resume ingestion job;
2. load checkpoint;
3. fetch seed/source records;
4. normalize records;
5. upsert entities;
6. upsert relations;
7. attach provenance;
8. mirror compatible person/movie/credit data into existing tables;
9. update checkpoint/stats after durable batches;
10. mark job completed or failed.

Re-running the same seed must not create duplicate entities or edges.

## Failure Handling

- Network timeout: retry a bounded number of times, then persist failed job state.
- Partial source response: store only validated records and preserve checkpoint.
- Unknown relation/entity type: skip and record a stat rather than inventing a mapping.
- Database batch failure: do not advance the checkpoint for that batch.
- Duplicate ingestion: resolve through source IDs/canonical keys and relation uniqueness.
- Missing optional facts: persist the entity without fabricating values.

## Evidence and Provenance

Graph reads should be able to return source metadata for entities and relations. This metadata can later feed the existing MovieFinder evidence/confidence layer.

For this phase, Wikidata-derived graph facts receive explicit source provenance. Confidence is not inflated merely because a fact exists; multi-source confidence aggregation remains future work.

## Availability Boundary

Streaming availability stays separate because it is time-sensitive. Existing availability logic continues to create `availability_snapshots` with region and source-check timestamps. Graph relations may later expose `AVAILABLE_ON`, but persistent historical availability remains in snapshots rather than being flattened into permanent Wikidata facts.

## Security and Operations

- No Supabase service keys or API credentials committed to the repository.
- Database client/configuration supplied through environment/runtime injection.
- Wikidata ingestion has bounded depth, batch sizes, timeout, and retry limits.
- No arbitrary SPARQL supplied by end users in this phase.
- SQL migrations include indexes for canonical/source lookup and relation traversal.

## Testing

Tests must cover:
- migration/schema expectations where practical;
- deterministic Wikidata normalization;
- duplicate entity/edge handling;
- source/provenance persistence;
- graph adapter reads and traversal;
- seed ingestion success;
- retry/failure behavior;
- checkpoint/resume behavior;
- mirroring people/movies/credits;
- no live network or Supabase requirement in unit tests;
- existing MovieFinder tests remain green.

An integration-style test should demonstrate a fixture representing a real cinema seed flowing through fetch fixture -> normalization -> repository -> persistent graph read -> path explanation.

## Out of Scope

- Full Wikidata crawl.
- TMDb integration.
- Dedicated Neo4j/graph database.
- Vector embeddings/semantic similarity models.
- Production OpenAI/Claude/Gemini/Grok adapters.
- Multi-source truth reconciliation.
- UI redesign.
- Automatic background scheduling infrastructure.

## Deliverables

1. Supabase migration for graph/provenance/job tables.
2. Persistent graph repository/adapter.
3. Wikidata source client.
4. Wikidata normalizer.
5. Seed ingestion coordinator with checkpoints.
6. Existing table mirroring for supported people/movies/credits.
7. Unit and integration-style tests.
8. README documentation for persistent Cinema Graph ingestion.

## Acceptance Criteria

The implementation is complete when:

- a Wikidata QID can be passed to the ingestion service;
- supported entities and relations are normalized deterministically;
- the same seed can be ingested repeatedly without duplicates;
- ingestion progress can resume from a persisted checkpoint;
- stored graph knowledge can be loaded after process restart;
- graph traversal and path explanation work through the persistent adapter;
- provenance identifies Wikidata and its source identifier/retrieval time;
- compatible records populate existing people/movies/credits structures;
- availability behavior remains unchanged;
- no new API key is required for Wikidata;
- all existing and new automated tests pass;
- the current MovieFinder UI is unchanged.
