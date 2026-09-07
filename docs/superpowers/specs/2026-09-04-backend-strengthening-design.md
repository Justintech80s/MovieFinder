# MovieFinder Backend Strengthening Design

Date: 2026-09-04

## Goal

Strengthen the existing MovieFinder backend without replacing working features and without changing the current frontend. The implementation must extend the current Node/Vercel request layer, Supabase/Postgres persistence, Cinema Graph, Python/FastAPI Cinema Brain, availability verification, and provider-neutral AI architecture.

## Non-goals

- No frontend redesign or visual changes.
- No Kubernetes.
- No OpenCV or Whisper.
- No vLLM process inside Vercel.
- No replacement of working deterministic search, current JustWatch availability checks, or existing Cinema Graph APIs.

## Existing foundations to preserve

MovieFinder already contains:

- Node search API and live orchestrator.
- Supabase/Postgres persistence and persistent Cinema Graph tables.
- Wikidata ingestion with provenance.
- Deterministic hard filtering and ranking.
- Current streaming verification semantics.
- Provider-neutral model routing.
- Security headers, validation/rate-limit boundary, analytics, and automated Node tests.
- Separate Python search infrastructure.

All new work must extend these systems rather than duplicate them.

## Architecture

The production request path remains:

User request -> Vercel/Node API -> intent/query plan -> exact/full-text/graph/semantic retrieval -> current availability verification -> deterministic filtering/ranking -> optional verified AI reasoning -> existing frontend-compatible response.

Permanent structured data remains in Supabase/Postgres. The Python Cinema Brain becomes the heavier semantic/ML service behind a stable internal API. Redis-compatible caching is optional and must fail open. DuckDB/Arrow are offline/batch tools only.

Future self-hosted inference uses a secure external adapter compatible with vLLM or llama.cpp. Vercel never runs those GPU runtimes directly.

## Phases

### Phase 1 — Backend stabilization

Audit the current Node and Python/FastAPI paths for broken imports, endpoints, environment handling, timeouts, public error normalization, retry/fallback behavior, rate limits, and deployment health. Add explicit health/readiness coverage and regression tests. Preserve existing response contracts.

### Phase 2 — PostgreSQL schema completion

Extend the existing Supabase/Postgres schema rather than replacing it. Add structured durable records where missing for movies, shows, people, credits, genres, themes, countries, release years, providers, availability snapshots, source attribution, verification timestamps, and vector/search metadata. Migrations must be additive and idempotent.

### Phase 3 — Stored Cinema Graph enrichment

Continue using cinema_entities/cinema_relations and expand normalized entity/relationship coverage for Movie, Show, Person, Genre, Era, Country, Theme, Influence, Similar Film, and Provider/Availability links. Keep current graph-store interfaces compatible.

### Phase 4 — Python Cinema Brain ML

Add configurable Hugging Face Transformers/PyTorch components for query classification, NER, embeddings, similarity, and reranking. Models are selected by environment variables and initialized lazily. Failure of Python ML must not break deterministic Node search.

### Phase 5 — Hybrid search

Combine exact matches, Postgres full-text search, semantic/vector similarity, Cinema Graph traversal, and current availability verification. Deterministic filters remain authoritative for person, director, genre, year, country, service, and availability.

### Phase 6 — DuckDB and Arrow offline processing

Use DuckDB and Apache Arrow for large imports, dedupe, filmography processing, analytics, and bulk availability reconciliation. They do not replace Postgres.

### Phase 7 — External AI/model adapter

Extend the existing provider-neutral router with a secure generic OpenAI-compatible/self-hosted adapter suitable for future vLLM or llama.cpp endpoints. Endpoint and credentials are server-side environment configuration only.

### Phase 8 — Redis-compatible cache

Add an optional cache abstraction for common searches, filmographies, metadata, and provider responses. Streaming availability uses a short TTL and must never be served as current after expiry. Cache failure falls back to uncached execution.

### Phase 9 — Verification/data quality

Strengthen provenance, confidence, duplicate reconciliation, freshness timestamps, unsupported-claim rejection, and cross-source checks. Preserve explicit AVAILABLE / UNAVAILABLE / UNKNOWN semantics.

### Phase 10 — Security hardening

Continue schema validation, sanitization, request-size limits, rate limiting, restricted CORS, safe logging, dependency checks, auth on internal/admin endpoints, and secret isolation. No credentials or private values are logged.

### Phase 11 — Test expansion

Add unit/integration/E2E coverage for Node, FastAPI, migrations, hybrid retrieval, filmographies, availability verification, caching, health checks, AI fallbacks, and failure modes. Live external tests must be clearly separated from deterministic CI tests.

### Phase 12 — Operations and documentation

Add health/readiness endpoints for Node, Python, Postgres, cache, and AI-provider state. Update README, architecture docs, .env.example, migrations, and local development instructions.

## Data authority and failure behavior

Structured identity and relationships come from stored structured data and verified ingestion. Current streaming claims come from current availability checks, not stale graph data. AI output remains commentary/enrichment and cannot overwrite verified identity, year, provider, or availability.

If Postgres graph access, Redis, Python ML, or an AI provider fails, MovieFinder should degrade to the strongest verified deterministic path available. A failed availability check remains UNKNOWN rather than UNAVAILABLE.

## Frontend lock

No implementation phase may alter index.html, CSS, visual layout, colors, spacing, navigation, support UI, result-card design, or other frontend presentation unless the user separately and explicitly approves that visual change.

## Phase 1 success criteria

Phase 1 is complete only when:

- Node and Python health/readiness paths are defined and tested.
- Environment configuration is validated without exposing secrets.
- External requests have bounded timeouts and normalized public errors.
- Optional subsystem failures degrade safely.
- Rate-limit behavior is deterministic and tested.
- Existing search response compatibility remains intact.
- Node unit/integration tests and Python tests pass.
- No frontend file is changed.
- Vercel production deployment is attempted only after CI passes; any account/build-rate limitation is reported accurately rather than treated as an application failure.
