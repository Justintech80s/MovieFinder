import test from 'node:test';
import assert from 'node:assert/strict';

import { createSupabaseSemanticStore } from '../../lib/search/semantic/semantic-store.js';

const VECTOR = Array.from({ length: 1536 }, () => 0.01);

function response(body = [], { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() { return body; }
  };
}

test('semantic store stays disabled without server-side Supabase credentials', () => {
  let called = false;
  const store = createSupabaseSemanticStore({
    env: {},
    fetchImpl: async () => { called = true; return response(); }
  });
  assert.equal(store, null);
  assert.equal(called, false);
});

test('hybrid search uses the fixed RPC with service-role headers, bounded limit and timeout', async () => {
  const calls = [];
  const store = createSupabaseSemanticStore({
    env: {
      SUPABASE_URL: 'https://movie.example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'server-secret',
      SEMANTIC_DB_TIMEOUT_MS: '2500'
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response([{ id: 'doc-1', entity_id: 'movie-1', fused_score: 0.03 }]);
    }
  });

  const rows = await store.hybridSearch({ queryText: 'bleak paranoid thrillers', queryEmbedding: VECTOR, limit: 999 });
  assert.equal(rows.length, 1);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/search_cinema_documents$/);
  assert.equal(calls[0].options.headers.apikey, 'server-secret');
  assert.equal(calls[0].options.headers.authorization, 'Bearer server-secret');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.match_count, 40);
  assert.equal(body.query_text, 'bleak paranoid thrillers');
  assert.equal(body.query_embedding.length, 1536);
});

test('documents needing embedding is fixed to cinema_documents and capped at 32', async () => {
  const calls = [];
  const store = createSupabaseSemanticStore({
    env: {
      SUPABASE_URL: 'https://movie.example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'server-secret'
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response([]);
    }
  });

  await store.documentsNeedingEmbedding({ limit: 500 });
  assert.match(calls[0].url, /\/rest\/v1\/cinema_documents\?/);
  const parsed = new URL(calls[0].url);
  assert.equal(parsed.searchParams.get('limit'), '32');
  assert.equal(parsed.searchParams.get('embedding'), 'is.null');
});

test('upsert and save embedding requests cannot choose arbitrary database endpoints', async () => {
  const calls = [];
  const store = createSupabaseSemanticStore({
    env: {
      SUPABASE_URL: 'https://movie.example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'server-secret'
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response([]);
    }
  });

  await store.upsertDocuments([{ entityId: 'movie-1', documentType: 'movie_summary', title: 'Test', content: 'Summary', contentHash: 'a'.repeat(64), sourceKind: 'wikidata', sourceRef: 'Q1', provenance: {}, language: 'en', metadata: {} }]);
  await store.saveEmbeddings([{ id: 'doc-1', embedding: VECTOR, embeddingModel: 'model', embeddingVersion: 'v1' }]);

  assert.equal(calls.length, 2);
  for (const call of calls) assert.match(call.url, /\/rest\/v1\/cinema_documents(?:\?|$)/);
});

test('semantic store errors never expose the service-role key', async () => {
  const store = createSupabaseSemanticStore({
    env: {
      SUPABASE_URL: 'https://movie.example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'do-not-leak-this'
    },
    fetchImpl: async () => response({ message: 'do-not-leak-this database detail' }, { ok: false, status: 500 })
  });

  await assert.rejects(
    store.hybridSearch({ queryText: 'dreamlike thrillers', queryEmbedding: VECTOR, limit: 10 }),
    error => {
      assert.doesNotMatch(String(error.message), /do-not-leak-this/);
      return true;
    }
  );
});
