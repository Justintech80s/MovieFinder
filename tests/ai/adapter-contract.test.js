import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_CAPABILITIES,
  normalizeAIResult,
  createProviderError
} from '../../lib/ai/adapter-contract.js';

test('exposes the supported MovieFinder AI capabilities', () => {
  assert.deepEqual(AI_CAPABILITIES, [
    'intent_interpretation',
    'cinema_reasoning',
    'answer_synthesis'
  ]);
});

test('normalizes provider output without leaking provider-native payloads', () => {
  const result = normalizeAIResult({
    provider: 'openai',
    model: 'example-model',
    capability: 'cinema_reasoning',
    content: 'answer',
    structuredData: { score: 1 },
    usage: { inputTokens: 10, outputTokens: 4 },
    latencyMs: 25,
    rawResponse: { secret: 'provider-specific' }
  });

  assert.deepEqual(result, {
    provider: 'openai',
    model: 'example-model',
    capability: 'cinema_reasoning',
    content: 'answer',
    structuredData: { score: 1 },
    usage: { inputTokens: 10, outputTokens: 4 },
    latencyMs: 25
  });
  assert.equal('rawResponse' in result, false);
});

test('rejects unsupported capabilities as malformed provider output', () => {
  assert.throws(
    () => normalizeAIResult({ provider: 'openai', model: 'x', capability: 'unsupported' }),
    error => error?.code === 'MODEL_BAD_RESPONSE'
  );
});

test('maps provider HTTP failures to shared error codes', () => {
  assert.equal(createProviderError('openai', 401, 'bad key').code, 'MODEL_AUTH_ERROR');
  assert.equal(createProviderError('openai', 403, 'forbidden').code, 'MODEL_AUTH_ERROR');
  assert.equal(createProviderError('openai', 429, 'slow down').code, 'MODEL_RATE_LIMITED');
  assert.equal(createProviderError('openai', 408, 'timeout').code, 'MODEL_TIMEOUT');
  assert.equal(createProviderError('openai', 400, 'bad request').code, 'MODEL_BAD_RESPONSE');
  assert.equal(createProviderError('openai', 500, 'down').code, 'MODEL_PROVIDER_ERROR');
});

test('provider errors preserve safe metadata without requiring a cause', () => {
  const error = createProviderError('anthropic', 503, 'temporarily unavailable');
  assert.equal(error.provider, 'anthropic');
  assert.equal(error.status, 503);
  assert.equal(error.message, 'temporarily unavailable');
});
