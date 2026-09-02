import assert from 'node:assert/strict';
import test from 'node:test';

import { createWikidataClient } from '../../lib/ingestion/wikidata-client.js';

test('wikidata client fetches and deduplicates requested entities', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(String(url));
    return {
      ok: true,
      async json() {
        return {
          entities: {
            Q1: { id: 'Q1', labels: { en: { value: 'Example' } }, claims: {} }
          }
        };
      }
    };
  };

  const client = createWikidataClient({ fetchImpl });
  const result = await client.fetchEntities(['Q1', 'Q1']);

  assert.equal(calls.length, 1);
  assert.match(calls[0], /action=wbgetentities/);
  assert.match(calls[0], /ids=Q1/);
  assert.deepEqual(Object.keys(result.entities), ['Q1']);
});

test('wikidata client retries retryable failures and succeeds', async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) return { ok: false, status: 503, async json() { return {}; } };
    return {
      ok: true,
      async json() {
        return { entities: { Q2: { id: 'Q2', claims: {} } } };
      }
    };
  };

  const client = createWikidataClient({ fetchImpl, maxRetries: 1 });
  const result = await client.fetchSeed('Q2');

  assert.equal(attempts, 2);
  assert.equal(result.id, 'Q2');
});

test('wikidata client returns a normalized unavailable error after retries', async () => {
  const fetchImpl = async () => { throw new Error('network down'); };
  const client = createWikidataClient({ fetchImpl, maxRetries: 1, timeoutMs: 100 });

  await assert.rejects(client.fetchSeed('Q3'), error => {
    assert.equal(error.code, 'WIKIDATA_UNAVAILABLE');
    assert.equal(error.retryable, true);
    assert.ok(error.cause instanceof Error);
    return true;
  });
});
