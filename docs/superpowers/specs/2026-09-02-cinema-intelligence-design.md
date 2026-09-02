# MovieFinder Cinema Intelligence Architecture

## Goal
Upgrade MovieFinder from keyword-oriented cinema scoring into a relationship-aware Cinema Graph + RAG + planning + verification architecture while preserving the existing Vercel, Node.js, FastAPI, filmography, availability, ranking, and analytics foundations.

## Architecture decision
Use Architecture A. MovieFinder remains deployable on Vercel and does not require local GPU infrastructure. AI inference is accessed through a provider-neutral interface so hosted frontier models can be used now and Ollama, vLLM, or Transformers-backed services can be attached later without rewriting search orchestration.

## Constraints
- Preserve the current user-facing application design.
- Preserve existing filmography and availability modules as deterministic retrieval tools.
- Do not make LangChain, Ollama, vLLM, or Transformers hard runtime dependencies in Phase 1.
- AI failures must not prevent baseline MovieFinder search from returning useful results.
- Claims used for ranking or explanations must retain provenance/evidence when available.
- Keep components independently testable.

## Components

### 1. Typed Cinema Graph
Replace the conceptual keyword table in `lib/search/cinema-graph.js` with a graph abstraction built from typed nodes and edges.

Initial node types: `movie`, `person`, `genre`, `theme`, `era`, `movement`, `country`, `style`, `source`.

Initial edge types: `STARS`, `DIRECTED_BY`, `WRITTEN_BY`, `HAS_GENRE`, `HAS_THEME`, `FROM_ERA`, `FROM_COUNTRY`, `HAS_STYLE`, `PART_OF_MOVEMENT`, `SIMILAR_TO`, `INFLUENCED_BY`, `BASED_ON`.

Each relationship may carry weight, confidence, provenance, and metadata. The first implementation uses an in-process typed graph/storage adapter. Consumers depend on the adapter rather than its storage implementation, leaving a later path to Neo4j or another graph database.

### 2. Retrieval/RAG layer
Add a retrieval layer that turns graph neighborhoods and trusted movie metadata into compact evidence packets. Retrieval is deterministic and usable without an LLM. Semantic/vector retrieval can later be added behind the same interface.

### 3. Search planner
Add a planner that converts parsed intent into a structured search plan. Plans specify which deterministic tools to call (people, filmography, graph traversal, availability), constraints to apply, and whether optional AI enrichment is useful. The planner must have a deterministic fallback.

### 4. Verification and evidence
Every candidate can accumulate evidence records containing source, relationship/path, confidence, and reason. Verification rejects unsupported AI-generated claims and keeps deterministic metadata authoritative. Explanations are generated from verified evidence rather than unconstrained model output.

### 5. Model provider abstraction
Define one provider contract for optional structured AI operations. Provider selection comes from configuration. Phase 1 includes a disabled/no-op provider and an HTTP-compatible provider boundary; external hosted providers can be attached without coupling search modules to a vendor SDK. Future Ollama/vLLM/Transformers services implement the same contract.

## Search data flow
1. Receive query.
2. Parse existing intent and constraints.
3. Build a structured search plan.
4. Execute deterministic retrieval tools.
5. Traverse Cinema Graph relationships relevant to the plan.
6. Build RAG/evidence packets.
7. Optionally ask the configured model provider for structured enrichment.
8. Verify enrichment against evidence.
9. Rank and deduplicate candidates.
10. Resolve availability when requested.
11. Return results plus concise verified reasons.

## Failure behavior
Provider timeout/error: continue with deterministic search. Graph miss: continue with existing metadata scoring. Availability failure: return movie matches without asserting unavailable status. Malformed model output: discard enrichment. Unsupported model claims: do not expose them as facts.

## Testing
Add unit tests for graph construction/traversal, evidence packets, deterministic planning, provider fallback, verification, and ranking integration. Add integration tests showing existing searches still work with AI disabled and that relationship searches receive graph-derived evidence.

## Deferred work
Dedicated Neo4j deployment, GPU hosting, Ollama/vLLM/Transformers installation, large-scale embedding ingestion, autonomous browsing agents, and LangChain framework adoption are explicitly deferred. Their integration points are interfaces created by this design, not Phase 1 dependencies.
