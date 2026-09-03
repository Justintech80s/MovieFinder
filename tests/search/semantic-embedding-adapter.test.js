import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmbeddingAdapter } from '../../lib/search/semantic/embedding-adapter.js';

const vector = (length = 1536, value = 0.1) => Array(length).fill(value);

test('embedding adapter normalizes valid 1536-dimensional output', async () => {
  const adapter = createEmbeddingAdapter({
    provider: 'test',
    model: 'test-1536',
    embedImpl: async ({ texts, signal }) => {
      assert.equal(signal instanceof AbortSignal, true);
      return { vectors: texts.map(() => vector()), usage: { inputTokens: 4 } };
    }
  });

  const result = await adapter.embed({ texts: ['paranoid surveillance'], purpose: 'query' });
  assert.equal(result.provider, 'test');
  assert.equal(result.model, 'test-1536');
  assert.equal(result.dimensions, 1536);
  assert.equal(result.vectors.length, 1);
  assert.equal(result.vectors[0].length, 1536);
  assert.deepEqual(result.usage, { inputTokens: 4 });
  assert.equal(Number.isFinite(result.latencyMs), true);
});

test('embedding adapter rejects incompatible dimensions', async () => {
  const adapter = createEmbeddingAdapter({
    provider: 'test',
    model: 'bad-dimensions',
    embedImpl: async () => ({ vectors: [vector(2)] })
  });

  await assert.rejects(
    () => adapter.embed({ texts: ['x'], purpose: 'query' }),
    error => error?.code === 'EMBEDDING_BAD_RESPONSE' && /dimension/i.test(error.message)
  );
});

test('embedding adapter rejects non-finite vector values', async () => {
  const badVector = vector();
  badVector[8] = Number.NaN;
  const adapter = createEmbeddingAdapter({
    provider: 'test',
    model: 'bad-values',
    embedImpl: async () => ({ vectors: [badVector] })
  });

  await assert.rejects(
    () => adapter.embed({ texts: ['x'], purpose: 'query' }),
    error => error?.code === 'EMBEDDING_BAD_RESPONSE'
  );
});

test('embedding adapter bounds batch size and text length before provider work', async () => {
  let calls = 0;
  const adapter = createEmbeddingAdapter({
    provider: 'test',
    model: 'bounded',
    embedImpl: async ({ texts }) => {
      calls += 1;
      return { vectors: texts.map(() => vector()) };
    }
  });

  await assert.rejects(
    () => adapter.embed({ texts: Array(33).fill('x'), purpose: 'corpus' }),
    error => error?.code === 'EMBEDDING_INVALID_INPUT'
  );
  await assert.rejects(
    () => adapter.embed({ texts: ['x'.repeat(8001)], purpose: 'query' }),
    error => error?.code === 'EMBEDDING_INVALID_INPUT'
  );
  assert.equal(calls, 0);
});

test('embedding adapter maps aborts to a stable timeout error', async () => {
  const adapter = createEmbeddingAdapter({
    provider: 'test',
    model: 'timeout',
    timeoutMs: 5,
    embedImpl: async ({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        const error = new Error('provider-specific timeout detail');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    })
  });

  await assert.rejects(
    () => adapter.embed({ texts: ['x'], purpose: 'query' }),
    error => error?.code === 'EMBEDDING_TIMEOUT' && !error.message.includes('provider-specific')
  );
});
