import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiAdapter } from '../../lib/ai/gemini-adapter.js';

function jsonResponse(status, body) { return { ok: status >= 200 && status < 300, status, async json() { return body; } }; }

test('sends Gemini generateContent request and normalizes candidate text', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push({ url, options }); return jsonResponse(200, { candidates: [{ content: { parts: [{ text: 'Gemini cinema answer' }] } }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 5 } }); };
  const adapter = createGeminiAdapter({ apiKey: 'test-key', model: 'gemini-test', baseUrl: 'https://example.test/v1beta', fetchImpl, now: () => 100 });
  const result = await adapter.invoke('cinema_reasoning', { prompt: 'Compare these films', evidence: [{ source: 'cinema-graph' }] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.test/v1beta/models/gemini-test:generateContent');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].options.headers['x-goog-api-key'], 'test-key');
  const body = JSON.parse(calls[0].options.body); assert.equal(body.contents[0].role, 'user'); assert.match(body.contents[0].parts[0].text, /Compare these films/);
  assert.deepEqual(result, { provider: 'gemini', model: 'gemini-test', capability: 'cinema_reasoning', content: 'Gemini cinema answer', structuredData: null, usage: { inputTokens: 9, outputTokens: 5 }, latencyMs: 0 });
});

test('parses JSON candidate text into structuredData', async () => {
  const adapter = createGeminiAdapter({ apiKey: 'key', model: 'gemini-test', fetchImpl: async () => jsonResponse(200, { candidates: [{ content: { parts: [{ text: '{"intent":"filmography"}' }] } }] }) });
  const result = await adapter.invoke('intent_interpretation', { prompt: 'find every film' }); assert.deepEqual(result.structuredData, { intent: 'filmography' });
});

test('joins multiple Gemini text parts', async () => {
  const adapter = createGeminiAdapter({ apiKey: 'key', model: 'gemini-test', fetchImpl: async () => jsonResponse(200, { candidates: [{ content: { parts: [{ text: 'First' }, { text: 'Second' }] } }] }) });
  const result = await adapter.invoke('answer_synthesis', { prompt: 'summarize' }); assert.equal(result.content, 'First\nSecond');
});

test('maps Gemini auth, rate limit, and provider errors to shared codes without leaking the key', async () => {
  for (const [status, code] of [[401, 'MODEL_AUTH_ERROR'], [403, 'MODEL_AUTH_ERROR'], [429, 'MODEL_RATE_LIMITED'], [500, 'MODEL_PROVIDER_ERROR']]) {
    const adapter = createGeminiAdapter({ apiKey: 'secret-key', model: 'gemini-test', fetchImpl: async () => jsonResponse(status, { error: { message: 'request rejected' } }) });
    await assert.rejects(() => adapter.invoke('cinema_reasoning', { prompt: 'x' }), error => error?.code === code && !error.message.includes('secret-key'));
  }
});

test('maps malformed JSON and empty candidates to MODEL_BAD_RESPONSE', async () => {
  const malformed = createGeminiAdapter({ apiKey: 'key', model: 'gemini-test', fetchImpl: async () => ({ ok: true, status: 200, async json() { throw new SyntaxError('bad'); } }) });
  await assert.rejects(() => malformed.invoke('cinema_reasoning', { prompt: 'x' }), error => error?.code === 'MODEL_BAD_RESPONSE');
  const empty = createGeminiAdapter({ apiKey: 'key', model: 'gemini-test', fetchImpl: async () => jsonResponse(200, { candidates: [] }) });
  await assert.rejects(() => empty.invoke('cinema_reasoning', { prompt: 'x' }), error => error?.code === 'MODEL_BAD_RESPONSE');
});

test('rejects unsupported capabilities before calling Gemini', async () => {
  let calls = 0; const adapter = createGeminiAdapter({ apiKey: 'key', model: 'gemini-test', fetchImpl: async () => { calls += 1; return jsonResponse(200, {}); } });
  await assert.rejects(() => adapter.invoke('unsupported', { prompt: 'x' }), error => error?.code === 'MODEL_BAD_RESPONSE'); assert.equal(calls, 0);
});
