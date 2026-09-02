# Phase 5 Advanced RAG + Semantic Cinema Search Design

Date: 2026-09-02
Status: Approved architectural direction; ready for implementation planning
Branch: `feature/phase5-advanced-rag-semantic-search`

## Goal

Add a production semantic retrieval layer to MovieFinder using the existing Supabase/Postgres stack with pgvector, while preserving the Phase 4 authority model: structured Cinema Graph facts remain authoritative for durable cinema knowledge, live availability remains authoritative for current streaming offers, deterministic hard constraints remain authoritative for inclusion/exclusion, and AI may reason only over bounded evidence.

Phase 5 succeeds when MovieFinder can understand concept-heavy natural-language searches such as:

- `slow-burn crime movies with lonely protagonists and bleak endings`
- `movies like The Conversation with paranoid surveillance themes but less action-heavy`
- `dreamlike international thrillers about identity and memory`
- `1970s political films with European influence and a cold visual style`

without weakening simple factual search or requiring AI/vector retrieval for every query.

## Architectural Decision

Use **Supabase/Postgres + pgvector** inside the existing database rather than adding a separate vector database.

Reasons:
- keeps MovieFinder on one durable data platform;
- permits relational joins between semantic documents and canonical Cinema Graph entities;
- simplifies provenance, filtering, deployment, backups, and observability;
- avoids a second database consistency boundary;
- supports both full-text and vector search in PostgreSQL;
- supports HNSW approximate nearest-neighbor indexing for scale.

A separate vector database is explicitly out of scope for Phase 5.

## Authority Model

Phase 5 adds a relevance layer, not a new truth layer.

1. **Cinema Graph / canonical repository** remains authoritative for durable entities, credits, relationships, countries, genres, movements, provenance, and verified factual connections.
2. **Current availability source** remains authoritative for current U.S. streaming/rent/buy offers.
3. **Deterministic parser, constraints and rank rules** remain authoritative for hard filters such as person, title, year, provider, free/rent/buy, and other explicit constraints.
4. **Semantic retrieval** may propose relevant cinema documents and candidate entities based on meaning, but semantic similarity alone does not establish a factual relationship.
5. **AI providers** may interpret and synthesize the final bounded evidence but may not overwrite verified structured facts.

If semantic, graph, availability, deterministic, and AI signals conflict, verified structured facts and hard constraints win.

## High-Level Search Flow

```text
User query
   |
   v
Existing HTTP/security boundary
   |
   v
Deterministic intent parser
   |
   +----------------------------+
   |                            |
   | simple/direct              | concept-heavy/semantic
   v                            v
Phase 4 deterministic path   Query embedding
   |                            |
   |                  +---------+---------+
   |                  |                   |
   |                  v                   v
   |             Full-text search    pgvector search
   |                  |                   |
   |                  +---------+---------+
   |                            |
   |                            v
   |                  Reciprocal-rank fusion
   |                            |
   |                            v
   |               Semantic document candidates
   |                            |
   +-------------+--------------+
                 |
                 v
       Resolve to Cinema Graph entities
                 |
                 v
       Graph facts / relationships
                 |
                 v
     Deterministic constraints + rerank
                 |
                 v
     Live availability when requested
                 |
                 v
       Bounded verified evidence
                 |
        +--------+--------+
        |                 |
        | no AI           | optional AI
        v                 v
 structured response   synthesis/reasoning
        |                 |
        +--------+--------+
                 |
                 v
             API response
```

## Query Routing

Semantic retrieval must be selectively invoked.

Skip embeddings/vector retrieval for high-confidence direct requests such as:
- exact title availability;
- person filmography;
- explicit provider + person/title searches;
- direct factual filters already handled deterministically.

Use semantic retrieval when the query contains one or more of:
- mood, tone, style, pacing, visual or thematic language;
- abstract similarity (`feels like`, `same atmosphere`, `movies with the feeling of`);
- multiple conceptual attributes that are not represented as hard parser fields;
- broad discovery language where meaning matters more than exact tokens;
- queries requiring semantic context before graph traversal.

The decision must remain deterministic and testable. AI does not decide whether semantic retrieval runs.

## Data Model

Add a dedicated semantic document table rather than placing vectors directly on `cinema_entities`.

### `cinema_documents`

Recommended fields:

- `id uuid primary key`
- `entity_id uuid null` — canonical Cinema Graph entity when applicable
- `document_type text not null`
- `title text null`
- `content text not null`
- `content_hash text not null`
- `source_kind text not null`
- `source_ref text null`
- `source_url text null`
- `provenance jsonb not null default '{}'`
- `language text not null default 'en'`
- `embedding_model text null`
- `embedding_version text null`
- `embedding vector(1536) null`
- `fts tsvector generated/stored or maintained deterministically`
- `metadata jsonb not null default '{}'`
- `embedded_at timestamptz null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

The initial embedding contract uses **1536 dimensions** because it fits comfortably within current pgvector `vector` HNSW limits and provides a practical production baseline. The embedding adapter remains provider-neutral at the application boundary, but any future model with a different dimension requires an explicit migration and corpus re-embedding rather than silently mixing dimensions.

### Document types

Initial supported types:
- `movie_summary`
- `movie_themes`
- `movie_style`
- `movie_context`
- `person_context`
- `genre_context`
- `movement_context`
- `relationship_context`

Do not create many tiny arbitrary document categories in Phase 5. Extend only when retrieval evaluation shows a need.

## Document Construction and Chunking

Prefer **meaningful cinema units** over blind fixed-token chunks whenever possible.

Examples:
- one concise movie theme/style document;
- one canonical synopsis/context document;
- one filmmaker context document;
- one movement/genre context document;
- one verified relationship explanation document.

When source material is longer than the embedding/context budget, chunk at semantic boundaries such as paragraphs/sections with small overlap rather than cutting mid-sentence.

Each chunk/document must retain:
- canonical entity reference;
- source/provenance;
- document type;
- content hash;
- embedding model/version.

No unsupported claims are manufactured during document generation. If source evidence is insufficient, omit the claim/document.

## Embedding Adapter

Add a provider-neutral embedding interface under `lib/ai/` or `lib/search/semantic/`.

Conceptual contract:

```js
embed({ texts, purpose }) => {
  provider,
  model,
  dimensions,
  vectors,
  usage,
  latencyMs
}
```

Requirements:
- server-side credentials only;
- bounded batch size;
- timeout and normalized errors;
- dimension validation before persistence;
- deterministic model/version metadata stored with each vector;
- no raw user headers/environment values passed to provider;
- query and document embeddings must use compatible embedding space.

Missing embedding provider configuration disables semantic retrieval and falls back to Phase 4 behavior.

## Embedding Generation Pipeline

Embedding generation should not block the normal ingestion path.

Recommended flow:

```text
Cinema data ingested/updated
       |
       v
Build deterministic semantic documents
       |
       v
Hash document content
       |
       +--> unchanged hash? --> keep existing embedding
       |
       v
Mark embedding pending
       |
       v
Bounded async worker/job
       |
       v
Generate embedding
       |
       v
Validate dimension/model
       |
       v
Persist embedding + embedded_at
```

Use existing ingestion-job patterns where practical rather than inventing a second unrelated job model.

Retries must be bounded and idempotent. A provider failure must not corrupt or delete the previous valid vector.

## Full-Text Search

Use PostgreSQL `tsvector` and a GIN index for lexical retrieval.

Full-text retrieval is important because exact names, phrases, titles, filmmakers, movements and niche cinema terms can outperform embeddings when literal token matches are strong.

Keyword search and vector search run independently and return ranked bounded candidate lists.

## Vector Search

Use pgvector cosine distance and an HNSW index compatible with that operator.

Recommended conceptual index:

```sql
create index cinema_documents_embedding_hnsw_idx
on cinema_documents
using hnsw (embedding vector_cosine_ops)
where embedding is not null;
```

Exact SQL will be finalized after checking the target project's installed pgvector version and testing the migration in the actual database.

Do not hand-tune HNSW `m`, `ef_construction`, or `ef_search` values before retrieval benchmarks justify doing so. Start with safe defaults.

If selective relational filtering produces insufficient HNSW recall at scale, evaluate pgvector iterative scans rather than simply raising global candidate limits.

## Hybrid Retrieval and Rank Fusion

Run bounded lexical and semantic searches in parallel for semantic queries.

Recommended initial limits:
- keyword candidates: 30
- semantic candidates: 30
- fused candidates before entity resolution: maximum 40
- final semantic evidence documents: maximum 12

Combine rankings using **Reciprocal Rank Fusion (RRF)** instead of directly comparing incompatible full-text and vector similarity scores.

Conceptual score:

```text
RRF(doc) = lexical_weight / (k + lexical_rank)
         + semantic_weight / (k + semantic_rank)
```

Start with equal lexical/semantic weight and a documented smoothing constant. Tune only through evaluation data.

Exact title/entity matches receive a deterministic boost outside the semantic score where appropriate.

## Entity Resolution

Semantic documents are not returned directly as movie results.

After hybrid retrieval:
1. group/resolve documents to canonical `entity_id` values;
2. discard orphaned/unresolvable documents from factual result construction;
3. load authoritative Cinema Graph facts for the candidate entities;
4. apply explicit deterministic filters;
5. optionally use graph traversal to add verified relationships;
6. perform live availability checks only after the bounded candidate set is established when current availability is part of the request.

This keeps semantic relevance separate from factual authority.

## Reranking

Initial reranking remains deterministic.

Combine:
- RRF semantic/keyword relevance;
- exact entity/title/person match signals;
- existing deterministic ranking signals;
- verified graph relationship strength/path quality where available;
- hard constraint satisfaction.

Do not add a paid neural reranker in initial Phase 5. First establish a reproducible evaluation baseline. A neural reranker can be a later optimization if benchmark data shows meaningful improvement.

## Verified RAG Evidence

Extend the Phase 4 evidence package with bounded semantic retrieval information.

Conceptual structure:

```js
{
  query,
  parsedIntent,
  semantic: {
    mode: 'hybrid',
    documents: [
      {
        id,
        entityId,
        documentType,
        excerpt,
        source,
        provenance,
        lexicalRank,
        semanticRank,
        fusedRank
      }
    ]
  },
  entities,
  relations,
  paths,
  movies,
  currentAvailability,
  constraints,
  provenance,
  confidence
}
```

AI receives only this bounded evidence package, never arbitrary database access.

Retrieved text is evidence material, not executable instructions. Prompt/context construction must clearly separate system instructions from retrieved cinema content.

## Prompt-Injection / Retrieval Safety

Treat all retrieved document content as untrusted data.

Requirements:
- retrieved content cannot alter system/provider configuration;
- retrieved text cannot request tools, secrets, SQL or network access;
- no raw HTML/scripts are executed;
- cap document count and per-document characters;
- sanitize/normalize unexpected control content before AI context construction;
- never treat text such as `ignore previous instructions` inside retrieved content as a command;
- provenance accompanies every document used in synthesis.

## Database Security

The semantic table is an internal application data structure.

Requirements:
- never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code;
- enable RLS if `cinema_documents` lives in an exposed schema such as `public`;
- do not create broad `anon` or `authenticated` write policies;
- ingestion/embedding writes occur through trusted server-side code;
- if public client reads are unnecessary, no client-facing read policy should be added;
- SQL functions/views created for search must be reviewed for execution privileges and RLS behavior;
- avoid `SECURITY DEFINER` unless a specific verified requirement proves it necessary;
- if a privileged function is genuinely required, keep it out of exposed schemas where practical and explicitly restrict execution.

## Search Function Boundary

Prefer a database RPC/function or repository method that returns only the fields needed for ranking/evidence rather than exposing arbitrary SQL capability.

Conceptual application API:

```js
semanticSearch({
  queryText,
  queryEmbedding,
  filters,
  keywordLimit,
  semanticLimit,
  finalLimit
})
```

The user cannot submit SQL, table names, operator classes, index parameters, or arbitrary filter expressions.

## Caching

Add cacheability without making current availability stale.

Safe candidates for caching:
- query embeddings keyed by normalized query + embedding model/version;
- semantic retrieval results keyed by query hash + corpus revision + model/version;
- deterministic document embeddings keyed by content hash + model/version.

Do **not** cache live streaming availability inside the semantic cache. Availability continues through its existing freshness boundary.

Cache failure must never fail core search.

## Corpus Revision / Invalidation

Maintain a lightweight semantic corpus revision or equivalent version marker.

Increment/change it when searchable documents materially change so stale retrieval caches can be invalidated.

Document `content_hash` prevents unnecessary re-embedding of unchanged material.

Changing the embedding model/version requires deliberate re-embedding status tracking. Mixed incompatible embedding spaces must never be queried together.

## Failure and Fallback Behavior

### Embedding provider unavailable
Skip semantic retrieval and continue through Phase 4 graph/deterministic search.

### Vector query fails
Log normalized failure code, then use deterministic/graph path.

### Full-text query fails but vector succeeds
Return semantic candidates if safely resolvable; record degraded retrieval mode.

### Vector query fails but full-text succeeds
Use lexical candidates plus existing graph logic.

### Both semantic retrieval methods fail
Use Phase 4 behavior.

### Individual document lacks embedding
It may still participate in lexical retrieval; do not fail the whole query.

### AI unavailable
Return verified deterministic/graph/semantic-ranked structured results without synthesized AI text.

### Live availability unavailable when required
Preserve the existing safe availability failure behavior; semantic data never substitutes for current offers.

## Observability

Add bounded structured metrics/log fields without storing secrets or full sensitive payloads.

Recommended metrics:
- semantic routing rate;
- embedding latency/error rate;
- lexical retrieval latency;
- vector retrieval latency;
- candidate counts before/after fusion;
- graph resolution rate;
- fallback mode frequency;
- semantic cache hit rate;
- zero-result rate;
- optional offline quality metrics.

Avoid logging raw provider keys, service-role credentials, request headers or full retrieved documents.

## Evaluation System

Phase 5 must include a reproducible semantic search evaluation fixture before tuning ranking weights.

Create a curated test set representing:
- exact/factual searches that must stay deterministic;
- theme/mood/style searches;
- similarity queries;
- multi-concept discovery queries;
- hard-filter combinations;
- negative cases where semantically related but factually wrong candidates must be excluded.

For each fixture store expected relevant canonical entities, required exclusions and optional graded relevance.

Initial quality metrics:
- Recall@K
- Precision@K
- Mean Reciprocal Rank (MRR)
- deterministic hard-constraint violation count (must be zero)
- verified availability violation count (must be zero)

Performance checks should track p50/p95 retrieval latency in controlled tests where feasible.

## TDD Strategy

Implementation follows test-first development.

Required contracts include:
1. simple direct query does not request an embedding;
2. concept-heavy query requests semantic retrieval;
3. embedding failure falls back to Phase 4 search;
4. hybrid search combines lexical and semantic candidates deterministically;
5. RRF ordering is stable for deterministic fixtures;
6. semantic document candidates resolve to canonical graph entities before movie output;
7. semantic similarity cannot bypass year/person/provider/hard filters;
8. streaming claims still require current availability;
9. AI receives only bounded verified semantic/graph evidence;
10. retrieved prompt-like text cannot change system behavior or structured facts;
11. unchanged content hashes do not trigger duplicate embeddings;
12. changed document/model version is eligible for re-embedding;
13. missing individual embeddings do not break lexical retrieval;
14. semantic retrieval limits are enforced;
15. existing API/security regression tests remain green;
16. existing Phase 4 direct and graph searches remain compatible.

## Schema / Migration Plan

Phase 5 implementation will add a database migration that:
- enables/checks `vector` extension only as appropriate for the project;
- creates `cinema_documents`;
- creates GIN full-text index;
- creates HNSW cosine vector index;
- adds uniqueness/idempotency constraints around canonical document identity/content version;
- applies RLS/security policy appropriate to an internal server-managed table;
- adds only narrowly scoped search function(s) if needed.

Before finalizing SQL, implementation must query the actual Supabase project for:
- Postgres version;
- installed pgvector version;
- existing schemas/tables/functions/policies;
- Data API exposure configuration where accessible.

Do not assume extension/index capabilities from documentation alone.

## Files Expected to Change

Likely additions/changes:
- `supabase/migrations/...` or the repository's established schema location — vector/document schema;
- `lib/search/semantic/embedding-adapter.js` — normalized embedding contract;
- `lib/search/semantic/hybrid-retriever.js` — lexical + semantic retrieval and RRF;
- `lib/search/semantic/document-builder.js` — deterministic document construction/hashing;
- `lib/search/semantic/semantic-store.js` — Supabase/Postgres repository boundary;
- `lib/search/live-orchestrator.js` — selective semantic routing and evidence merge;
- ingestion modules — enqueue/update semantic documents after canonical ingestion;
- tests for semantic routing, ranking, security, fallbacks and compatibility;
- README architecture/operations documentation.

Final implementation file paths should follow existing repository patterns discovered during Task 1 rather than forcing this exact layout if an equivalent existing boundary is cleaner.

## Performance Budgets

Initial targets:
- no semantic/embedding latency added to simple direct searches;
- bounded query embedding call with existing provider timeout discipline;
- hybrid database retrieval target under 500 ms p95 in the expected initial corpus, measured rather than assumed;
- total semantic candidate pool bounded to 40 before graph resolution;
- evidence documents bounded to 12;
- AI remains optional and timeout-bounded.

If actual Supabase tier/corpus size makes these targets unrealistic, record measured baseline and optimize based on evidence rather than silently increasing timeouts.

## Rollout

Use a staged rollout:

1. schema + document repository behind disabled semantic routing;
2. deterministic document generation and embedding jobs;
3. offline hybrid retrieval/evaluation;
4. semantic retrieval enabled for complex queries only;
5. production metrics and fallback monitoring;
6. ranking tuning based on evaluation results.

A single environment flag/config boundary should be able to disable Phase 5 semantic retrieval without disabling Phase 4 search.

## Non-Goals

- no separate Pinecone/Qdrant/vector database;
- no replacement of the Cinema Graph;
- no replacement of JustWatch/current availability source;
- no autonomous browsing agent;
- no arbitrary user SQL or vector-search parameters;
- no AI-generated facts inserted directly into the canonical graph without verification;
- no semantic retrieval on every query;
- no paid neural reranker until evaluation proves it is needed;
- no frontend redesign required for initial rollout;
- no weakening of Phase 4 cybersecurity controls.

## Acceptance Criteria

Phase 5 is complete when:
- pgvector-backed semantic documents are persisted with provenance and embedding version metadata;
- lexical and semantic retrieval work together through deterministic rank fusion;
- simple direct searches still avoid unnecessary embedding/vector work;
- concept-heavy searches can retrieve relevant canonical cinema entities by meaning;
- semantic candidates resolve through authoritative graph facts before final results;
- hard constraints cannot be bypassed by semantic similarity;
- current streaming claims still require current availability;
- AI receives only bounded verified RAG evidence;
- semantic/embedding failures degrade safely to Phase 4 behavior;
- document hashing prevents unnecessary duplicate embedding work;
- retrieval limits and security boundaries are enforced;
- curated semantic evaluation fixtures meet agreed baseline quality without hard-constraint violations;
- existing Node/Python and security regression suites remain green;
- CodeQL remains green on the final implementation PR head;
- production semantic search can be disabled independently through configuration.

## Current Supabase Compatibility Notes

The design intentionally follows currently documented Supabase/Postgres capabilities:
- hybrid search using PostgreSQL full-text search (`tsvector`) plus pgvector semantic search;
- HNSW as the generally recommended vector index for changing production datasets;
- cosine distance requires `vector_cosine_ops` on the matching HNSW index;
- current pgvector versions support indexed `vector` values up to 2,000 dimensions, making the initial 1,536-dimensional contract compatible;
- filtered ANN queries may require iterative scans at scale to recover enough matches, so recall must be measured under real filters rather than assumed.

These capabilities must still be verified against the actual MovieFinder Supabase project before schema migration execution.
