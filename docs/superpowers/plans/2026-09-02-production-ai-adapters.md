# Production AI Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect MovieFinder's provider-neutral model router to production-ready OpenAI, Anthropic, Gemini, and xAI adapters while preserving deterministic cinema facts, graceful fallback, and provider independence.

**Architecture:** Each provider lives behind the existing `createModelRouter()` contract and converts a shared MovieFinder capability request into its native HTTP request, then normalizes the response back into one MovieFinder result shape. A registry/configuration layer enables only providers with server-side credentials and defines capability-specific fallback order; deterministic MovieFinder search remains authoritative when AI is absent or fails.

**Tech Stack:** Node.js 20+, native `fetch`, Node test runner, existing MovieFinder search modules, provider HTTPS APIs, environment variables.

**Spec:** `docs/superpowers/specs/2026-09-02-production-ai-adapters-design.md`

## Global Constraints

- Supported providers in this phase: OpenAI, Anthropic, Gemini, and xAI.
- Shared capabilities: `intent_interpretation`, `cinema_reasoning`, and `answer_synthesis`.
- No provider SDK types or response objects may leak into MovieFinder search/orchestration code.
- API credentials must remain server-side environment variables and must never be committed, returned to the browser, logged, or stored in the Cinema Graph.
- Verified Cinema Graph facts, streaming availability, provenance, and deterministic verification remain authoritative over model-generated text.
- Tests must not make live paid provider calls; inject/mock HTTP behavior.
- Missing credentials disable an adapter cleanly rather than breaking MovieFinder.
- Keep the existing UI unchanged.

---

### Task 1: Shared AI Adapter Contract and Error Normalization

**Files:**
- Create: `lib/ai/adapter-contract.js`
- Create: `tests/ai/adapter-contract.test.js`

**Interfaces:**
- Produces: `AI_CAPABILITIES`, `normalizeAIResult(result)`, `createProviderError(provider, status, message, cause)`.
- Normalized result shape: `{ provider, model, capability, content, structuredData, usage, latencyMs }`.
- Normalized error codes: `MODEL_AUTH_ERROR`, `MODEL_RATE_LIMITED`, `MODEL_TIMEOUT`, `MODEL_BAD_RESPONSE`, `MODEL_PROVIDER_ERROR`.

- [ ] **Step 1: Write failing contract tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_CAPABILITIES, normalizeAIResult, createProviderError } from '../../lib/ai/adapter-contract.js';

test('normalizes provider output without leaking provider payloads', () => {
  assert.deepEqual(AI_CAPABILITIES, ['intent_interpretation', 'cinema_reasoning', 'answer_synthesis']);
  assert.deepEqual(normalizeAIResult({
    provider: 'openai', model: 'example', capability: 'cinema_reasoning',
    content: 'answer', structuredData: { score: 1 }, usage: { inputTokens: 10, outputTokens: 4 }, latencyMs: 25
  }), {
    provider: 'openai', model: 'example', capability: 'cinema_reasoning',
    content: 'answer', structuredData: { score: 1 }, usage: { inputTokens: 10, outputTokens: 4 }, latencyMs: 25
  });
});

test('maps provider HTTP failures to shared error codes', () => {
  assert.equal(createProviderError('openai', 401, 'bad key').code, 'MODEL_AUTH_ERROR');
  assert.equal(createProviderError('openai', 429, 'slow down').code, 'MODEL_RATE_LIMITED');
  assert.equal(createProviderError('openai', 500, 'down').code, 'MODEL_PROVIDER_ERROR');
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/ai/adapter-contract.test.js`
Expected: FAIL because `lib/ai/adapter-contract.js` does not exist.

- [ ] **Step 3: Implement the shared contract**

```js
export const AI_CAPABILITIES = Object.freeze([
  'intent_interpretation', 'cinema_reasoning', 'answer_synthesis'
]);

export function normalizeAIResult(value) {
  if (!AI_CAPABILITIES.includes(value?.capability)) throw Object.assign(new Error('unsupported AI capability'), { code: 'MODEL_BAD_RESPONSE' });
  return {
    provider: String(value.provider), model: String(value.model), capability: value.capability,
    content: typeof value.content === 'string' ? value.content : '',
    structuredData: value.structuredData ?? null,
    usage: value.usage ?? null,
    latencyMs: Number.isFinite(value.latencyMs) ? value.latencyMs : null
  };
}

export function createProviderError(provider, status, message, cause) {
  const code = status === 401 || status === 403 ? 'MODEL_AUTH_ERROR'
    : status === 429 ? 'MODEL_RATE_LIMITED'
    : status === 408 ? 'MODEL_TIMEOUT'
    : status >= 400 && status < 500 ? 'MODEL_BAD_RESPONSE'
    : 'MODEL_PROVIDER_ERROR';
  return Object.assign(new Error(message || `${provider} request failed`), { code, provider, status, cause });
}
```

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `node --test tests/ai/adapter-contract.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/adapter-contract.js tests/ai/adapter-contract.test.js
git commit -m "feat: add AI adapter contract"
```

### Task 2: OpenAI and xAI OpenAI-Compatible Adapters

**Files:**
- Create: `lib/ai/openai-compatible-adapter.js`
- Create: `lib/ai/openai-adapter.js`
- Create: `lib/ai/xai-adapter.js`
- Create: `tests/ai/openai-compatible-adapter.test.js`

**Interfaces:**
- Consumes: `normalizeAIResult`, `createProviderError`, shared capabilities.
- Produces: `createOpenAICompatibleAdapter(config)`, `createOpenAIAdapter(config)`, `createXAIAdapter(config)`; each returns `{ capabilities, invoke(capability, input) }`.

- [ ] **Step 1: Write failing tests** covering authorization header construction, request body normalization, successful text/JSON extraction, usage normalization, malformed JSON, 401, 429, 5xx, and injected fetch.

```js
const adapter = createOpenAICompatibleAdapter({
  provider: 'openai', apiKey: 'test-key', baseUrl: 'https://example.test/v1', model: 'test-model', fetchImpl
});
const result = await adapter.invoke('cinema_reasoning', { prompt: 'Compare these films', evidence: [] });
assert.equal(result.provider, 'openai');
assert.equal(result.capability, 'cinema_reasoning');
```

- [ ] **Step 2: Run focused test and confirm RED**

Run: `node --test tests/ai/openai-compatible-adapter.test.js`
Expected: FAIL because adapter modules do not exist.

- [ ] **Step 3: Implement `createOpenAICompatibleAdapter`** using injected/native fetch, `Authorization: Bearer`, JSON content type, configurable endpoint/model, and the shared normalized result/error contract. Never expose the API key in errors.

- [ ] **Step 4: Implement thin OpenAI/xAI factories**

```js
export const createOpenAIAdapter = options => createOpenAICompatibleAdapter({
  provider: 'openai', baseUrl: 'https://api.openai.com/v1', ...options
});

export const createXAIAdapter = options => createOpenAICompatibleAdapter({
  provider: 'xai', baseUrl: 'https://api.x.ai/v1', ...options
});
```

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: `node --test tests/ai/openai-compatible-adapter.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/openai-compatible-adapter.js lib/ai/openai-adapter.js lib/ai/xai-adapter.js tests/ai/openai-compatible-adapter.test.js
git commit -m "feat: add OpenAI and xAI adapters"
```

### Task 3: Anthropic Adapter

**Files:**
- Create: `lib/ai/anthropic-adapter.js`
- Create: `tests/ai/anthropic-adapter.test.js`

**Interfaces:**
- Produces: `createAnthropicAdapter({ apiKey, model, fetchImpl, baseUrl })` returning `{ capabilities, invoke }`.

- [ ] **Step 1: Write failing tests** asserting `x-api-key`, Anthropic version header, messages request shape, text extraction, usage normalization, and shared error mapping.
- [ ] **Step 2: Run `node --test tests/ai/anthropic-adapter.test.js` and confirm RED.**
- [ ] **Step 3: Implement the adapter** with injected fetch and no SDK dependency. Convert the native response into `normalizeAIResult(...)`.
- [ ] **Step 4: Run the focused test and confirm GREEN.**
- [ ] **Step 5: Commit** with `git commit -m "feat: add Anthropic adapter"`.

### Task 4: Gemini Adapter

**Files:**
- Create: `lib/ai/gemini-adapter.js`
- Create: `tests/ai/gemini-adapter.test.js`

**Interfaces:**
- Produces: `createGeminiAdapter({ apiKey, model, fetchImpl, baseUrl })` returning `{ capabilities, invoke }`.

- [ ] **Step 1: Write failing tests** for Gemini request construction, credential handling, candidate text extraction, usage normalization, empty candidates, 401/403, 429, and 5xx.
- [ ] **Step 2: Run `node --test tests/ai/gemini-adapter.test.js` and confirm RED.**
- [ ] **Step 3: Implement the adapter** using injected fetch and the shared contract; ensure error text never contains the credential.
- [ ] **Step 4: Run the focused test and confirm GREEN.**
- [ ] **Step 5: Commit** with `git commit -m "feat: add Gemini adapter"`.

### Task 5: Production Provider Registry and Router Fallback

**Files:**
- Create: `lib/ai/provider-registry.js`
- Modify: `lib/search/model-router.js`
- Create: `tests/ai/provider-registry.test.js`
- Modify: `tests/search/model-router.test.js`

**Interfaces:**
- Consumes: all four provider factories and `createModelRouter`.
- Produces: `createProductionModelRouter({ env, fetchImpl, timeoutMs, models, orders })`.
- Default provider order: `openai`, `anthropic`, `gemini`, `xai`; capability-specific `orders` may override it.

- [ ] **Step 1: Write failing registry tests** proving missing credentials register nothing, configured credentials register only matching providers, capability order is honored, and OpenAI failure can fall through to Anthropic.
- [ ] **Step 2: Extend router tests** to prove normalized provider failures remain in `error.failures` and an explicit unavailable provider cannot silently choose another provider.
- [ ] **Step 3: Run focused tests and confirm RED**

Run: `node --test tests/ai/provider-registry.test.js tests/search/model-router.test.js`
Expected: FAIL for missing registry/behavior.

- [ ] **Step 4: Implement registry configuration** using only `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, and `XAI_API_KEY`; never serialize the env object.
- [ ] **Step 5: Make the smallest router changes** needed for capability-specific default ordering and shared timeout/error semantics while preserving existing callers.
- [ ] **Step 6: Run focused tests and confirm GREEN.**
- [ ] **Step 7: Commit** with `git commit -m "feat: add production AI provider registry"`.

### Task 6: Deterministic Authority Boundary and AI Enrichment

**Files:**
- Create: `lib/search/ai-enrichment.js`
- Create: `tests/search/ai-enrichment.test.js`
- Modify: `lib/search/orchestrator.js`
- Modify: `tests/search/orchestrator.test.js`

**Interfaces:**
- Produces: `createAIEnrichment({ modelRouter, orders })` with optional `interpret(query, context)`, `reason(results, plan, context)`, and `synthesize(verifiedResults, plan, context)`.
- Rule: enrichment may add explanation/semantic metadata but may not replace verified movie identity, availability state, evidence, confidence, or verification fields.

- [ ] **Step 1: Write failing authority tests** where a mocked model claims an unavailable movie is streaming and changes a verified title; assert MovieFinder keeps the deterministic title/availability/evidence and stores only allowed AI explanation metadata.
- [ ] **Step 2: Write failing orchestrator integration test** proving search still returns deterministic results when every model provider throws `MODEL_PROVIDER_UNAVAILABLE`.
- [ ] **Step 3: Run focused tests and confirm RED.**
- [ ] **Step 4: Implement `createAIEnrichment`** with an allowlist merge for AI-produced metadata.
- [ ] **Step 5: Add optional enrichment hooks to the orchestrator** without making AI a required dependency.
- [ ] **Step 6: Run focused tests and confirm GREEN.**
- [ ] **Step 7: Commit** with `git commit -m "feat: add safe AI search enrichment"`.

### Task 7: Documentation and Full Regression Verification

**Files:**
- Modify: `README.md`
- Modify only if needed for branch CI: `.github/workflows/tests.yml`

**Interfaces:**
- Documents environment variable names, provider independence, fallback semantics, supported capabilities, deterministic authority boundary, and local-model extension point.

- [ ] **Step 1: Update README** with production adapter architecture and configuration examples using placeholder values only; do not include real credentials.
- [ ] **Step 2: Run the complete JavaScript suite**

Run: `npm test`
Expected: exit 0 with zero failed tests.

- [ ] **Step 3: Run Python regression suite**

Run: `PYTHONPATH=python_search python -m pytest python_search/tests -q`
Expected: exit 0.

- [ ] **Step 4: Review branch diff** against its base and verify no API keys, tokens, unrelated UI changes, generated dependency folders, or provider-native payload dumps are committed.
- [ ] **Step 5: Run the full test suites again on the exact final head commit** and record the commit SHA plus pass/fail counts before making any completion claim.
- [ ] **Step 6: Open a PR only after fresh verification evidence exists.** Do not merge without explicit user authorization.
