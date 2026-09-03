import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../../supabase/migrations/20260903_phase5_semantic_search.sql', import.meta.url);

async function migrationSql() {
  return (await readFile(migrationUrl, 'utf8')).toLowerCase();
}

test('Phase 5 migration creates provenance-aware semantic documents with English full-text search and 1536-d vectors', async () => {
  const sql = await migrationSql();

  assert.match(sql, /create extension if not exists vector/);
  assert.match(sql, /create table if not exists (?:public\.)?cinema_documents/);
  assert.match(sql, /embedding\s+vector\(1536\)/);
  assert.match(sql, /to_tsvector\('english'/);
  assert.match(sql, /using gin\s*\(fts\)/);
  assert.match(sql, /using hnsw\s*\(embedding vector_cosine_ops\)/);
  assert.match(sql, /enable row level security/);
});

test('Phase 5 hybrid search RPC is bounded and combines lexical and semantic ranks with RRF k=60', async () => {
  const sql = await migrationSql();

  assert.match(sql, /search_cinema_documents/);
  assert.match(sql, /websearch_to_tsquery\('english'/);
  assert.match(sql, /embedding\s*<=>\s*query_embedding/);
  assert.match(sql, /least\(greatest\(match_count,\s*1\),\s*40\)/);
  assert.match(sql, /1\.0\s*\/\s*\(60\s*\+/);
  assert.match(sql, /revoke all on function public\.search_cinema_documents/);
  assert.match(sql, /grant execute on function public\.search_cinema_documents[\s\S]*service_role/);
  assert.doesNotMatch(sql, /security definer/);
});
