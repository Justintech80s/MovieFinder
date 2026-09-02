# Phase 4 Live Search Orchestration Design

Date: 2026-09-02
Status: Proposed for implementation
Branch: `feature/phase4-live-search-orchestration`

## Goal

Connect MovieFinder's persistent Cinema Graph and production AI adapter/router stack to the live `/api/search` pipeline without weakening deterministic correctness, current streaming availability, or the backend security controls already merged into `main`.

The phase is successful when straightforward searches remain fast and deterministic, complex cinema questions can use stored graph relationships plus AI reasoning, streaming availability remains current and authoritative, and AI failure never causes the core search path to fail.

## Product Behavior

MovieFinder will use **selective AI orchestration** rather than invoking an AI model for every search.

Simple requests such as:
- `Will Smith movies on Netflix`
- `Where can I watch Heat?`
- `all Marlon Brando movies available on streaming`

stay on the deterministic path whenever the existing parser, graph/filmography data, hard constraints, and availability logic can answer them reliably.

Complex requests such as:
- `1970s paranoid thrillers influenced by European cinema that are streaming now`
- `crime films connected to Sidney Lumet and New Hollywood with a bleak tone`
- `movies like The Conversation but with political surveillance themes and current streaming availability`

may use the Cinema Graph for candidate relationships and the model router for intent interpretation, reasoning, and final natural-language synthesis.

## Authority Model

Truth is split by data type:

1. **Persistent Cinema Graph / canonical repository** is authoritative for durable cinema entities, credits, relationships, provenance, and stored factual knowledge.
2. **Live availability source** is authoritative for current U.S. streaming/rent/buy availability.
3. **Deterministic search constraints/ranking** remain authoritative for hard filters and result inclusion/exclusion.
4. **AI providers** may interpret intent, reason over supplied facts, and synthesize an answer, but may not invent or overwrite verified graph or availability facts.

If AI output conflicts with verified facts, verified facts win.

## Architecture

```text
User query
   |
   v
Security boundary
(method, validation, rate limit, headers)
   |
   v
Deterministic intent parser
   |
   +-------------------------------+
   |                               |
   | simple / high-confidence      | complex / ambiguous
   v                               v
Deterministic path           Selective AI intent assist
   |                               |
   +---------------+---------------+
                   |
                   v
         Search orchestration layer
                   |
        +----------+-----------+
        |                      |
        v                      v
Persistent Cinema Graph   Filmography/legacy facts
        |                      |
        +----------+-----------+
                   |
                   v
           Candidate result set
                   |
                   v
        Live JustWatch availability
                   |
                   v
     Hard constraints + deterministic rank
                   |
                   v
       Verified structured result package
                   |
        +----------+-----------+
        |                      |
        | no AI needed         | complex answer benefits
        v                      v
  Existing JSON result     AI reasoning/synthesis
        |                      |
        +----------+-----------+
                   |
                   v
              API response
```

## New Orchestration Layer

Add a small application-layer coordinator under `lib/search/` rather than moving business logic into `api/search.js`.

Recommended module:

`lib/search/live-orchestrator.js`

Responsibilities:
- accept normalized query + deterministic parsed intent;
- decide whether AI assistance is warranted;
- query the persistent graph when configured;
- preserve compatibility with existing person-filmography and title search paths;
- combine graph-derived candidates with current availability data;
- apply hard constraints and deterministic ranking;
- build a verified evidence/result package;
- optionally invoke AI reasoning/synthesis using only that verified package;
- return structured results plus orchestration metadata.

`api/search.js` remains the HTTP/security adapter and delegates search behavior to the orchestrator.

## Selective AI Decision

AI should be skipped when the deterministic parser has high-confidence intent and the request is directly answerable through existing title/person/provider/free/rent/buy constraints.

AI may be used when one or more of the following are true:
- query expresses multiple cinema concepts or relationships;
- query is comparative or explanatory rather than direct lookup;
- deterministic intent confidence is low;
- graph traversal is required to connect people, films, genres, themes, movements, countries, or influences;
- a natural-language synthesis materially improves usefulness.

The decision must be deterministic and testable. AI itself does not decide whether it should be called.

## Persistent Graph Integration

Use the existing persistent graph adapter/repository created in Phase 2.

Graph reads may provide:
- canonical movies and people;
- credits and creator relationships;
- genre/theme/movement/country relationships;
- influence/similarity relationships where stored;
- provenance/source metadata;
- path explanations for complex relationship questions.

The live search path must tolerate graph storage being unavailable or unconfigured. In that case, MovieFinder falls back to existing deterministic behavior rather than failing the request.

No live Wikidata access is introduced into `/api/search`.

## Availability Integration

Current streaming availability remains fetched through the existing JustWatch path.

For graph-derived movie candidates:
- availability lookups occur only for bounded candidate sets;
- exact title/year matching remains conservative;
- current offers are normalized through existing availability helpers;
- provider/free/rent/buy filters are applied after current availability is known;
- stale graph facts cannot be treated as current availability.

The existing timeout and safe-error behavior on JustWatch calls remains intact.

## AI Router Integration

Use the existing production model router and adapters.

Capabilities used in this phase:
- `intent_interpretation` only when deterministic parsing is insufficient;
- `cinema_reasoning` for complex relationship reasoning over verified evidence;
- `answer_synthesis` for concise final explanations.

Provider fallback remains:
OpenAI -> Anthropic -> Gemini -> xAI -> deterministic fallback.

Missing provider keys simply disable those adapters.

The orchestrator passes AI a bounded context object containing verified facts rather than raw database access.

## Verified Evidence Package

Before any AI reasoning/synthesis, build a structured object similar to:

```js
{
  query,
  parsedIntent,
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

Rules:
- all factual movie/person/relationship claims in the package must originate from deterministic data sources;
- current availability must include source/check time;
- unsupported facts are omitted rather than guessed;
- AI receives identifiers and concise evidence, not database credentials or arbitrary SQL access.

## Response Contract

Preserve existing response fields so the current frontend continues working.

Existing fields such as `parsed`, `results`, `filmography`, `availabilitySummary`, `liveAt`, and `dataQuality` remain compatible.

Phase 4 may add optional fields:
- `answer` — AI or deterministic natural-language summary;
- `reasoningMode` — `deterministic`, `graph`, or `graph+ai`;
- `evidence` — bounded provenance/path summary;
- `ai` — provider/model metadata only when an AI provider was actually used.

No frontend change is required for the initial Phase 4 backend integration.

## Failure and Fallback Behavior

### AI unavailable or errors
Return deterministic/graph results normally. Do not fail the request because AI failed.

### Persistent graph unavailable
Use existing filmography/title search behavior and current availability.

### Availability unavailable
Preserve the existing safe `503 AVAILABILITY_UNAVAILABLE` behavior when current streaming availability is required.

### Ambiguous AI interpretation
Reject unverified interpretation and retain deterministic parser output unless the AI output conforms to the bounded intent schema.

### Conflicting facts
Deterministic verified facts override AI text. AI text must be generated from the final verified result package after constraints/ranking.

## Security Constraints

Preserve all Phase 3/4 hardening already merged:
- GET-only `/api/search`;
- bounded query validation;
- rate limiting;
- security headers;
- safe public errors;
- bounded JustWatch requests;
- server-side AI keys only;
- no provider endpoint/identity override from user input.

Additional Phase 4 requirements:
- cap graph traversal depth and candidate count;
- cap AI evidence/context size;
- never pass secrets, environment variables, raw request headers, or database credentials to providers;
- AI-generated text must not alter redirect destinations, provider URLs, or verified offer metadata;
- log only normalized failure codes, not provider secrets or raw sensitive payloads.

## Performance Budget

Simple deterministic searches should not incur AI latency.

Complex graph searches use bounded traversal and candidate sets.

AI calls remain bounded by existing adapter timeouts. If AI does not complete in time, deterministic results return.

Availability fan-out remains concurrency-limited.

## TDD Test Strategy

Tests are written before production integration.

Required RED contracts:
1. simple direct query does not call AI;
2. complex relationship query can request graph reasoning;
3. graph-derived candidates are filtered by live availability before final output;
4. AI receives only verified evidence package;
5. AI cannot overwrite title/year/provider/availability facts;
6. AI provider failure falls back to deterministic result;
7. graph failure falls back to existing search path;
8. unsupported/ambiguous AI intent cannot bypass deterministic hard constraints;
9. current `/api/search` security behavior remains unchanged;
10. existing response fields remain frontend-compatible.

Integration-style fixture:
- query representing a complex cinema relationship;
- fake persistent graph returns known entities/relations/path;
- fake availability source returns current offers;
- fake AI router receives the verified package and returns synthesis;
- final response contains only verified candidates/offers plus synthesized explanation.

## Files Expected To Change

Likely additions/changes:
- `lib/search/live-orchestrator.js` — new coordinator;
- `lib/search/ai-enrichment.js` and/or `lib/search/model-router.js` — bounded integration hooks if needed;
- `lib/search/persistent-graph-store.js` — only if a missing read interface is discovered;
- `api/search.js` — delegate live search behavior while preserving HTTP/security boundary;
- `tests/search/live-orchestrator.test.js` — core TDD coverage;
- `tests/search/api-handler.test.js` and security tests — compatibility/regression assertions;
- README docs describing selective AI search behavior.

Avoid schema/migration changes unless implementation proves a graph read operation is genuinely missing.

## Non-Goals

- No UI redesign.
- No requirement that every query use AI.
- No live Wikidata calls from the user request path.
- No replacement of JustWatch as current availability authority.
- No vector database or embedding subsystem in this phase.
- No autonomous web browsing by the AI router.
- No user login requirement.
- No weakening of cybersecurity controls.

## Acceptance Criteria

Phase 4 implementation is complete when:
- simple searches still work without an AI provider configured;
- simple deterministic searches do not make unnecessary AI calls;
- complex supported queries can traverse stored Cinema Graph relationships;
- current availability is checked before final streaming claims;
- AI reasoning/synthesis is based only on verified structured evidence;
- AI failure falls back cleanly without failing core search;
- graph failure falls back cleanly to current deterministic behavior;
- existing frontend response fields remain compatible;
- security regression tests remain green;
- full Node and Python test suites pass;
- live JustWatch and Wikidata CI checks remain green where already configured;
- CodeQL remains green on the final PR head.
