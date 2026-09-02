# Cinema Intelligence Engine Design

## Purpose

Evolve MovieFinder from a consumer movie-search application into the first application powered by a reusable Cinema Intelligence Engine, while preserving the existing MovieFinder visual interface and result compatibility.

## Product positioning

MovieFinder is powered by the Cinema Intelligence Engine: a graph-and-AI reasoning platform for understanding films, people, creative relationships, semantic cinema concepts, and changing viewing availability.

This positioning must remain evidence-based. Documentation and UI copy must distinguish implemented capabilities from roadmap capabilities.

## Architecture

```text
MovieFinder UI
    |
    v
Cinema Intelligence API / Orchestrator
    |
    v
Structured Query Planner
    |
    +----------------------+----------------------+
    |                      |                      |
    v                      v                      v
Cinema Graph        Semantic Retrieval      Structured Sources
    |                      |               filmography/availability
    +----------------------+----------------------+
                           |
                           v
                 Candidate Fusion + Ranking
                           |
                           v
                  Verification / Evidence
                           |
                           v
                  Compatible MovieFinder Results
```

## Design principles

1. Preserve the current MovieFinder visual experience unless a later change is explicitly approved.
2. Structured facts remain deterministic whenever reliable structured sources exist.
3. Semantic/AI systems enrich retrieval and interpretation; they do not silently replace factual sources.
4. Every externally derived factual claim should be capable of carrying provenance, confidence, freshness, and verification state.
5. `unknown` remains distinct from `unavailable` for streaming availability.
6. Model providers, graph storage, embedding providers, and availability providers remain replaceable behind interfaces.
7. New intelligence metadata is additive so existing MovieFinder consumers do not break.
8. Every architectural stage must ship with tests and measurable evaluation criteria.

## Stage 1 — Persistent Cinema Graph abstraction

Introduce a graph repository contract above the existing in-memory graph store. Keep the in-memory implementation for tests and local operation, then add a persistent adapter that can use MovieFinder's existing Supabase/Postgres infrastructure.

Core entities include Person, Movie, Series, Genre, Theme, Movement, Country, Company, Award, and Provider. Core relationships include ACTED_IN, DIRECTED, WROTE, PRODUCED, SHOT_BY, HAS_GENRE, HAS_THEME, PART_OF_MOVEMENT, FROM_COUNTRY, WON_AWARD, NOMINATED_FOR, AVAILABLE_ON, INFLUENCED_BY, and SIMILAR_TO.

Edges may carry source/provenance, confidence, observedAt, validFrom, and validTo metadata.

## Stage 2 — Hybrid semantic retrieval

Add an embedding-provider interface and semantic index abstraction. Combine structured constraints, Cinema Graph traversal, lexical relevance, and semantic similarity into a hybrid candidate set. Embeddings must be optional; deterministic search continues to operate when no embedding provider is configured.

## Stage 3 — Controlled research and verification agents

Introduce bounded agents behind explicit interfaces for query enrichment, relationship research, availability verification, and evidence validation. Agents produce structured outputs and may not directly bypass MovieFinder verification rules. Model routing remains provider-neutral.

## Stage 4 — Evaluation and benchmarks

Create a versioned benchmark corpus covering person resolution, complete filmographies, director/producer searches, eras, genres, semantic concepts, creative relationships, streaming availability, and compound natural-language questions.

Track at minimum precision/relevance, filmography recall where a reference set exists, availability correctness, unsupported-claim rate, evidence coverage, latency, and regression status.

## Stage 5 — Cinema Intelligence API

Stabilize reusable service contracts for search, people, graph relationships, availability, and explanations. Initial conceptual routes are `/cinema/search`, `/cinema/person`, `/cinema/graph`, `/cinema/availability`, and `/cinema/explain`. Existing MovieFinder endpoints remain compatible during migration.

## Stage 6 — Production hardening

Add caching/freshness policies, observability, provider health metrics, rate limiting where appropriate, data-ingestion jobs, failure isolation, security review, performance benchmarks, and deployment verification.

## Success criteria

The first major milestone is complete when MovieFinder can execute a compound query through a persistent-capable graph abstraction and hybrid retrieval pipeline, return evidence-aware compatible results, run without any external model configured, and pass a repeatable benchmark/regression suite without changing the current visible interface.

## Non-goals for v1

- Training a proprietary foundation model.
- Claiming exhaustive worldwide streaming availability.
- Replacing all deterministic search with an LLM.
- Rebuilding the MovieFinder frontend.
- Locking the system to a single model, vector database, graph database, or streaming provider.
