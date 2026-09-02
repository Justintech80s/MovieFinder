import test from 'node:test';
import assert from 'node:assert/strict';

import { createProviderError } from '../../lib/ai/adapter-contract.js';
import { createOpenAICompatibleAdapter } from '../../lib/ai/openai-compatible-adapter.js';
import { createOpenAIAdapter } from '../../lib/ai/openai-adapter.js';
import { createXAIAdapter } from '../../lib/ai/xai-adapter.js';
import { createGeminiAdapter } from '../../lib/ai/gemini-adapter.js';
import { createModelRouter } from '../../lib/search/model-router.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; }
  };
}

test('network failures keep null HTTP status instead of reporting status zero', () => {
  const error = createProviderError('openai', null, 'network failed');
  assert.equal(error.status, null);
});

test('AbortError from provider transport is normalized as MODEL_TIMEOUT', async () => {
  const adapter = createOpenAICompatibleAdapter({
    provider: 'openai', apiKey: 'key', baseUrl: 'https://example.test/v1', model: 'model',
    fetchImpl: async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }
  });

  await assert.rejects(
    () => adapter.invoke('cinema_reasoning', { prompt: 'x' }),
    error => error?.code === 'MODEL_TIMEOUT' && error?.status === null
  );
});

test('provider transport supplies a bounded AbortSignal to fetch', async () => {
  let signal;
  const adapter = createOpenAICompatibleAdapter({
    provider: 'openai', apiKey: 'key', baseUrl: 'https://example.test/v1', model: 'model', timeoutMs: 50,
    fetchImpl: async (_url, options) => {
      signal = options.signal;
      return jsonResponse(200, { model: 'model', output_text: 'ok' });
    }
  });

  await adapter.invoke('answer_synthesis', { prompt: 'x' });
  assert.ok(signal instanceof AbortSignal);
});

test('OpenAI and xAI factory identity cannot be overridden by caller options', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    return jsonResponse(200, { model: 'model', output_text: 'ok' });
  };
  const openai = createOpenAIAdapter({ apiKey: 'o', model: 'model', fetchImpl, provider: 'evil', baseUrl: 'https://evil.test' });
  const xai = createXAIAdapter({ apiKey: 'x', model: 'model', fetchImpl, provider: 'evil', baseUrl: 'https://evil.test' });

  assert.equal((await openai.invoke('answer_synthesis', 'x')).provider, 'openai');
  assert.equal((await xai.invoke('answer_synthesis', 'x')).provider, 'xai');
  assert.equal(calls[0], 'https://api.openai.com/v1/responses');
  assert.equal(calls[1], 'https://api.x.ai/v1/responses');
});

test('Gemini authenticates with x-goog-api-key and never places the key in the URL', async () => {
  let call;
  const adapter = createGeminiAdapter({
    apiKey: 'secret-key', model: 'gemini-test', baseUrl: 'https://example.test/v1beta',
    fetchImpl: async (url, options) => {
      call = { url, options };
      return jsonResponse(200, { candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
    }
  });

  await adapter.invoke('cinema_reasoning', 'x');
  assert.equal(call.url, 'https://example.test/v1beta/models/gemini-test:generateContent');
  assert.equal(call.options.headers['x-goog-api-key'], 'secret-key');
  assert.equal(call.url.includes('secret-key'), false);
});

test('model router preserves caller context while adding provider identity', async () => {
  let receivedContext;
  const router = createModelRouter();
  router.register('one', {
    capabilities: ['cinema_reasoning'],
    async invoke(_capability, _input, context) {
      receivedContext = context;
      return { provider: 'one', model: 'm', capability: 'cinema_reasoning', content: 'ok' };
    }
  });

  await router.run('cinema_reasoning', { prompt: 'x' }, { context: { requestId: 'req-1', region: 'US' } });
  assert.deepEqual(receivedContext, { requestId: 'req-1', region: 'US', provider: 'one' });
});
