import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAICompatibleAdapter } from '../../lib/ai/openai-compatible-adapter.js';
import { createOpenAIAdapter } from '../../lib/ai/openai-adapter.js';
import { createXAIAdapter } from '../../lib/ai/xai-adapter.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; }
  };
}

test('sends a Responses API request with bearer auth and normalizes text output', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      model: 'test-model',
      output_text: 'A verified cinema answer',
      usage: { input_tokens: 12, output_tokens: 7 }
    });
  };
  const adapter = createOpenAICompatibleAdapter({
    provider: 'openai',
    apiKey: 'test-key',
    baseUrl: 'https://example.test/v1',
    model: 'test-model',
    fetchImpl,
    now: () => 100
  });

  const result = await adapter.invoke('cinema_reasoning', {
    prompt: 'Compare these films',
    evidence: [{ source: 'cinema-graph' }]
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.test/v1/responses');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-key');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, 'test-model');
  assert.match(body.input, /Compare these films/);
  assert.deepEqual(result, {
    provider: 'openai',
    model: 'test-model',
    capability: 'cinema_reasoning',
    content: 'A verified cinema answer',
    structuredData: null,
    usage: { inputTokens: 12, outputTokens: 7 },
    latencyMs: 0
  });
});

test('parses JSON model output into structuredData while preserving content', async () => {
  const fetchImpl = async () => jsonResponse(200, {
    model: 'test-model',
    output_text: '{"intent":"filmography","confidence":0.9}',
    usage: { input_tokens: 4, output_tokens: 8 }
  });
  const adapter = createOpenAICompatibleAdapter({
    provider: 'openai', apiKey: 'key', baseUrl: 'https://example.test/v1', model: 'test-model', fetchImpl
  });
  const result = await adapter.invoke('intent_interpretation', { prompt: 'all films by an actor' });
  assert.equal(result.content, '{"intent":"filmography","confidence":0.9}');
  assert.deepEqual(result.structuredData, { intent: 'filmography', confidence: 0.9 });
});

test('extracts text from Responses API output items when output_text is absent', async () => {
  const fetchImpl = async () => jsonResponse(200, {
    model: 'test-model',
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'fallback text' }] }]
  });
  const adapter = createOpenAICompatibleAdapter({
    provider: 'xai', apiKey: 'key', baseUrl: 'https://example.test/v1', model: 'test-model', fetchImpl
  });
  const result = await adapter.invoke('answer_synthesis', { prompt: 'Summarize' });
  assert.equal(result.content, 'fallback text');
});

test('maps authentication, rate limit, and provider failures to shared codes', async () => {
  for (const [status, code] of [[401, 'MODEL_AUTH_ERROR'], [429, 'MODEL_RATE_LIMITED'], [503, 'MODEL_PROVIDER_ERROR']]) {
    const fetchImpl = async () => jsonResponse(status, { error: { message: 'provider rejected request' } });
    const adapter = createOpenAICompatibleAdapter({
      provider: 'openai', apiKey: 'secret-key', baseUrl: 'https://example.test/v1', model: 'test-model', fetchImpl
    });
    await assert.rejects(
      () => adapter.invoke('cinema_reasoning', { prompt: 'x' }),
      error => error?.code === code && !error.message.includes('secret-key')
    );
  }
});

test('maps malformed provider JSON to MODEL_BAD_RESPONSE', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    async json() { throw new SyntaxError('invalid json'); }
  });
  const adapter = createOpenAICompatibleAdapter({
    provider: 'openai', apiKey: 'key', baseUrl: 'https://example.test/v1', model: 'test-model', fetchImpl
  });
  await assert.rejects(
    () => adapter.invoke('cinema_reasoning', { prompt: 'x' }),
    error => error?.code === 'MODEL_BAD_RESPONSE'
  );
});

test('rejects unsupported capabilities before making a provider request', async () => {
  let calls = 0;
  const adapter = createOpenAICompatibleAdapter({
    provider: 'openai', apiKey: 'key', baseUrl: 'https://example.test/v1', model: 'test-model',
    fetchImpl: async () => { calls += 1; return jsonResponse(200, {}); }
  });
  await assert.rejects(
    () => adapter.invoke('unsupported', { prompt: 'x' }),
    error => error?.code === 'MODEL_BAD_RESPONSE'
  );
  assert.equal(calls, 0);
});

test('OpenAI and xAI factories configure the correct providers and base URLs', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return jsonResponse(200, { model: 'factory-model', output_text: 'ok' });
  };

  const openai = createOpenAIAdapter({ apiKey: 'o', model: 'factory-model', fetchImpl });
  const xai = createXAIAdapter({ apiKey: 'x', model: 'factory-model', fetchImpl });
  const openaiResult = await openai.invoke('answer_synthesis', { prompt: 'one' });
  const xaiResult = await xai.invoke('answer_synthesis', { prompt: 'two' });

  assert.equal(openaiResult.provider, 'openai');
  assert.equal(xaiResult.provider, 'xai');
  assert.equal(calls[0], 'https://api.openai.com/v1/responses');
  assert.equal(calls[1], 'https://api.x.ai/v1/responses');
});
