import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../../supabase/migrations/20260905_postgres_hybrid_search.sql',import.meta.url),'utf8');

test('hybrid search migration enables pgvector and searchable text columns',()=>{
  assert.match(sql,/create extension if not exists vector/i);
  assert.match(sql,/add column if not exists search_document tsvector/i);
  assert.match(sql,/add column if not exists embedding vector\(384\)/i);
});

test('hybrid search migration indexes movie and show text plus vectors',()=>{
  assert.match(sql,/using gin \(search_document\)/i);
  assert.match(sql,/using hnsw \(embedding vector_cosine_ops\)/i);
  assert.match(sql,/idx_movies_search_document/i);
  assert.match(sql,/idx_shows_search_document/i);
});

test('hybrid search migration exposes bounded full-text and semantic RPCs',()=>{
  assert.match(sql,/create or replace function search_movies_full_text/i);
  assert.match(sql,/create or replace function search_shows_full_text/i);
  assert.match(sql,/create or replace function search_movies_semantic/i);
  assert.match(sql,/create or replace function search_shows_semantic/i);
  assert.match(sql,/least\(greatest\(match_count, 1\), 80\)/i);
});

test('semantic RPCs require a query embedding and use cosine distance',()=>{
  assert.match(sql,/query_embedding vector\(384\)/i);
  assert.match(sql,/1 - \(.*embedding <=> query_embedding\)/is);
});


test('catalog embedding metadata tracks model and refresh time',()=>{
  const maintenance=fs.readFileSync(new URL('../../supabase/migrations/20260905_catalog_embedding_metadata.sql',import.meta.url),'utf8');
  assert.match(maintenance,/add column if not exists embedding_model text/i);
  assert.match(maintenance,/add column if not exists embedding_updated_at timestamptz/i);
  assert.match(maintenance,/idx_movies_embedding_pending/i);
  assert.match(maintenance,/idx_shows_embedding_pending/i);
});
