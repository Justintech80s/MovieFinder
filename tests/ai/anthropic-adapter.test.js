import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnthropicAdapter } from '../../lib/ai/anthropic-adapter.js';
function jsonResponse(status, body) { return { ok: status >= 200 && status < 300, status, async json() { return body; } }; }

test('sends Anthropic messages request with required headers and normalizes text', async () => {
  const calls = []; const fetchImpl = async (url, options) => { calls.push({ url, options }); return jsonResponse(200, { model: 'claude-test', content: [{ type: 'text', text: 'Anthropic cinema answer' }], usage: { input_tokens: 11, output_tokens: 6 } }); };
  const adapter = createAnthropicAdapter({ apiKey: 'test-key', model: 'claude-test', baseUrl: 'https://example.test/v1', fetchImpl, now: () => 100 });
  const result = await adapter.invoke('cinema_reasoning', { prompt: 'Compare these films', evidence: [{ source: 'cinema-graph' }] });
  assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://example.test/v1/messages'); assert.equal(calls[0].options.method, 'POST'); assert.equal(calls[0].options.headers['x-api-key'], 'test-key'); assert.equal(calls[0].options.headers['anthropic-version'], '2023-06-01'); assert.equal(calls[0].options.headers['Content-Type'], 'application/json'); assert.ok(calls[0].options.signal instanceof AbortSignal);
  const body = JSON.parse(calls[0].options.body); assert.equal(body.model, 'claude-test'); assert.equal(body.messages[0].role, 'user'); assert.match(body.messages[0].content, /Compare these films/);
  assert.deepEqual(result, { provider: 'anthropic', model: 'claude-test', capability: 'cinema_reasoning', content: 'Anthropic cinema answer', structuredData: null, usage: { inputTokens: 11, outputTokens: 6 }, latencyMs: 0 });
});

test('Anthropic AbortError is normalized as MODEL_TIMEOUT', async () => {
  const adapter = createAnthropicAdapter({ apiKey: 'key', model: 'claude-test', fetchImpl: async () => { const error = new Error('aborted'); error.name = 'AbortError'; throw error; } });
  await assert.rejects(() => adapter.invoke('cinema_reasoning', 'x'), error => error?.code === 'MODEL_TIMEOUT' && error?.status === null);
});

test('parses JSON text output into structuredData', async () => { const adapter = createAnthropicAdapter({ apiKey: 'key', model: 'claude-test', fetchImpl: async () => jsonResponse(200, { model: 'claude-test', content: [{ type: 'text', text: '{"intent":"filmography"}' }] }) }); const result = await adapter.invoke('intent_interpretation', { prompt: 'find every film' }); assert.deepEqual(result.structuredData, { intent: 'filmography' }); });
test('joins multiple Anthropic text blocks', async () => { const adapter = createAnthropicAdapter({ apiKey: 'key', model: 'claude-test', fetchImpl: async () => jsonResponse(200, { model: 'claude-test', content: [{ type: 'text', text: 'First' }, { type: 'tool_use', id: 'x' }, { type: 'text', text: 'Second' }] }) }); const result = await adapter.invoke('answer_synthesis', { prompt: 'summarize' }); assert.equal(result.content, 'First\nSecond'); });
test('maps Anthropic auth, rate limit, and provider errors to shared codes', async () => { for (const [status, code] of [[401, 'MODEL_AUTH_ERROR'], [403, 'MODEL_AUTH_ERROR'], [429, 'MODEL_RATE_LIMITED'], [500, 'MODEL_PROVIDER_ERROR']]) { const adapter = createAnthropicAdapter({ apiKey: 'secret-key', model: 'claude-test', fetchImpl: async () => jsonResponse(status, { error: { message: 'request rejected' } }) }); await assert.rejects(() => adapter.invoke('cinema_reasoning', { prompt: 'x' }), error => error?.code === code && !error.message.includes('secret-key')); } });
test('maps malformed JSON and empty text responses to MODEL_BAD_RESPONSE', async () => { const malformed = createAnthropicAdapter({ apiKey: 'key', model: 'claude-test', fetchImpl: async () => ({ ok: true, status: 200, async json() { throw new SyntaxError('bad'); } }) }); await assert.rejects(() => malformed.invoke('cinema_reasoning', { prompt: 'x' }), error => error?.code === 'MODEL_BAD_RESPONSE'); const empty = createAnthropicAdapter({ apiKey: 'key', model: 'claude-test', fetchImpl: async () => jsonResponse(200, { model: 'claude-test', content: [] }) }); await assert.rejects(() => empty.invoke('cinema_reasoning', { prompt: 'x' }), error => error?.code === 'MODEL_BAD_RESPONSE'); });
test('rejects unsupported capabilities before calling Anthropic', async () => { let calls = 0; const adapter = createAnthropicAdapter({ apiKey: 'key', model: 'claude-test', fetchImpl: async () => { calls += 1; return jsonResponse(200, {}); } }); await assert.rejects(() => adapter.invoke('unsupported', { prompt: 'x' }), error => error?.code === 'MODEL_BAD_RESPONSE'); assert.equal(calls, 0); });
