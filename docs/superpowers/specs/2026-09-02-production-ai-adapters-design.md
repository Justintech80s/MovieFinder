# MovieFinder Production AI Adapters Design

Date: 2026-09-02
Status: Approved design

## Goal

Connect MovieFinder's provider-neutral model router to production AI providers without making any provider the source of truth for cinema facts or coupling the Cinema Brain to a vendor-specific SDK or response format.

The first production provider set is OpenAI, Anthropic, Google Gemini, and xAI.

## Principles

1. MovieFinder owns the intelligence architecture; external models are replaceable reasoning engines.
2. Filmographies, Cinema Graph relationships, availability, provenance, and verification remain deterministic/structured sources of truth.
3. Provider-specific request and response formats never leak beyond adapter boundaries.
4. Missing credentials or a failed provider must not break deterministic MovieFinder search.
5. Secrets stay server-side and are never committed, returned to clients, or written to the Cinema Graph.
6. The architecture must permit a future local Ollama/vLLM/Llama adapter without changing the router contract.

## Architecture

```text
MovieFinder Search / Cinema Brain
            |
            v
       Model Router
       /   |   |   \
      v    v   v    v
 OpenAI Claude Gemini xAI
       \   |   |   /
            v
 Normalized MovieFinder AI Result
```

`lib/search/model-router.js` remains the central provider switchboard. Each production adapter implements the same internal contract and advertises supported capabilities.

## Capabilities

The first adapter phase supports:

- `intent_interpretation`
- `cinema_reasoning`
- `answer_synthesis`

Models may interpret queries, reason over supplied evidence, compare candidates, and synthesize explanations. They may not silently replace verified Cinema Graph or availability facts.

## Adapter Contract

Each adapter exposes an invocation compatible with the existing router:

```text
invoke(capability, input, context) -> normalized result
```

The normalized result contains provider-independent fields such as:

```text
{
  provider,
  model,
  capability,
  content,
  structuredData,
  usage,
  latencyMs
}
```

Adapters are responsible for:

- validating capability support,
- converting MovieFinder input into the provider's native HTTP request,
- authenticating from server-side configuration,
- parsing the provider response,
- validating structured output when requested,
- mapping provider errors into MovieFinder error codes,
- returning the normalized result.

## Provider Adapters

Create isolated adapters for:

- OpenAI
- Anthropic
- Google Gemini
- xAI

Prefer direct HTTP boundaries with injected `fetch` over forcing provider SDK objects into the application core. This keeps tests deterministic and the adapters small. Provider API versions, endpoint URLs, and default model names are adapter configuration rather than assumptions in the search orchestrator.

## Provider Registry and Configuration

A production registry builds enabled adapters from environment/configuration and registers them with `createModelRouter()`.

Expected secret names:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `XAI_API_KEY`

Missing credentials disable only that provider. Configuration can define default models and capability-specific provider preference order without modifying Cinema Brain code.

The registry must expose enough metadata to inspect which providers/capabilities are enabled without exposing credentials.

## Data Flow

```text
MovieFinder capability request
        |
        v
Model Router
        |
        v
Selected Provider Adapter
        |
        v
Provider API
        |
        v
Provider-specific response
        |
        v
Adapter normalization
        |
        v
MovieFinder AI result
        |
        v
Cinema Brain / Search Orchestrator
```

Evidence supplied to a model should be explicit and bounded. AI output is enrichment. If AI output conflicts with verified MovieFinder evidence, deterministic evidence wins.

## Reliability and Fallback

Every external model is treated as an unreliable dependency.

Normalize at least these failure classes:

- authentication failure
- rate limit
- timeout
- malformed response
- provider unavailable
- unsupported capability
- general provider error

The existing router attempts eligible providers in configured order. A representative sequence is:

```text
OpenAI failure
  -> Anthropic
  -> Gemini
  -> xAI
  -> deterministic MovieFinder path
```

The AI layer must not turn an otherwise answerable deterministic query into a total failure merely because every model provider is unavailable.

Retries should be bounded and limited to retryable failures. Timeouts must prevent a provider from indefinitely blocking a search.

## Security

- Never commit provider API keys.
- Never send keys to browser code.
- Never include secrets in error payloads or logs.
- Never store secrets in Supabase cinema graph tables.
- Keep model invocation server-side.
- Bound model input and output sizes.
- Treat provider output as untrusted data and validate structured output before use.

## Orchestration Boundary

The existing search orchestrator remains dependency-injected. AI capabilities can be injected as optional enrichment stages rather than becoming mandatory dependencies.

The deterministic sequence remains responsible for query planning, filmography/graph retrieval, availability, ranking, evidence, and verification. AI can enhance intent interpretation and final explanation while operating on evidence assembled by MovieFinder.

## Testing

Automated tests must not require paid/live model API calls.

Use injected/mock HTTP implementations to test each adapter for:

- successful response normalization,
- missing credentials,
- authentication errors,
- rate limits,
- provider/server errors,
- malformed payloads,
- timeout behavior,
- capability validation,
- structured-output handling where supported.

Router/integration tests verify provider fallback while preserving one normalized contract. Additional tests verify AI enrichment cannot silently overwrite verified Cinema Graph or availability evidence.

GitHub Actions remains the authoritative regression path for Node and Python tests when local execution is unavailable.

## Files / Components

The implementation should introduce focused modules rather than one large provider file. Expected boundaries include:

- shared AI adapter contract/error utilities,
- OpenAI adapter,
- Anthropic adapter,
- Gemini adapter,
- xAI adapter,
- production provider registry/configuration,
- router integration tests,
- provider adapter tests,
- documentation updates.

Exact filenames may follow existing repository conventions during implementation.

## Out of Scope

This phase does not:

- train a MovieFinder foundation model,
- add embeddings/vector search,
- deploy Ollama or vLLM,
- redesign the MovieFinder UI,
- make AI authoritative for film or streaming facts,
- require live paid API calls in CI.

## Acceptance Criteria

The phase is acceptable when:

1. OpenAI, Anthropic, Gemini, and xAI can be registered through one provider-neutral interface.
2. All four return the same normalized MovieFinder result shape.
3. Missing credentials disable providers cleanly.
4. Provider errors are normalized and fallback can continue.
5. Deterministic MovieFinder functionality remains usable without any model provider.
6. Verified Cinema Graph/availability evidence cannot be silently overwritten by AI enrichment.
7. Secrets are absent from repository code/tests.
8. Tests use mocks/injected HTTP and require no live model credentials.
9. Existing Node and Python regression suites remain green before merge.
