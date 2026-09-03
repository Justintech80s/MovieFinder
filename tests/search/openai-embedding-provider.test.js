import test from 'node:test';
import assert from 'node:assert/strict';

import { createOpenAIEmbeddingAdapter } from '../../lib/search/semantic/openai-embedding-provider.js';

const VECTOR = Array.from({ length: 1536 }, () => 0.04);

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, async json() { return body; } };
}

test('OpenAI embedding adapter stays disabled without a server-side API key', () => {
  const adapter = createOpenAIEmbeddingAdapter({ env: {} });
  assert.equal(adapter, null);
});

test('OpenAI embedding transport uses v1 embeddings with bearer auth, float output and fixed 1536 dimensions', async () => {
  const calls = [];
  const adapter = createOpenAIEmbeddingAdapter({
    env: { OPENAI_API_KEY: 'server-key', EMBEDDING_MODEL: 'text-embedding-3-small' },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response({ data: [{ index: 0, embedding: VECTOR }], usage: { prompt_tokens: 3, total_tokens: 3 } });
    }
  });

  const result = await adapter.embed({ texts: ['paranoid surveillance'], purpose: 'query' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/embeddings');
  assert.equal(calls[0].options.headers.authorization, 'Bearer server-key');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, 'text-embedding-3-small');
  assert.equal(body.encoding_format, 'float');
  assert.equal(body.dimensions, 1536);
  assert.deepEqual(body.input, ['paranoid surveillance']);
  assert.equal(result.dimensions, 1536);
  assert.equal(result.vectors[0].length, 1536);
});

test('embedding rows are restored to input order using provider indexes', async () => {
  const first = Array.from({ length: 1536 }, () => 0.1);
  const second = Array.from({ length: 1536 }, () => 0.2);
  const adapter = createOpenAIEmbeddingAdapter({
    env: { OPENAI_API_KEY: 'server-key' },
    fetchImpl: async () => response({ data: [{ index: 1, embedding: second }, { index: 0, embedding: first }] })
  });
  const result = await adapter.embed({ texts: ['first', 'second'], purpose: 'corpus' });
  assert.equal(result.vectors[0][0], 0.1);
  assert.equal(result.vectors[1][0], 0.2);
});

test('provider HTTP failures are normalized and never leak the API key or response body', async () => {
  const adapter = createOpenAIEmbeddingAdapter({
    env: { OPENAI_API_KEY: 'do-not-leak' },
    fetchImpl: async () => response({ error: { message: 'do-not-leak internal detail' } }, { ok: false, status: 429 })
  });
  await assert.rejects(adapter.embed({ texts: ['query'], purpose: 'query' }), error => {
    assert.equal(error.code, 'EMBEDDING_BAD_RESPONSE');
    assert.doesNotMatch(error.message, /do-not-leak/);
    return true;
  });
});
