import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../../supabase/migrations/20260903_core_moviefinder_database.sql', import.meta.url);

test('core MovieFinder migration adds the simplified PostgreSQL domain tables without rebuilding existing movies or people', async () => {
  const sql = (await readFile(migrationUrl, 'utf8')).toLowerCase();

  for (const table of [
    'genres',
    'movie_genres',
    'companies',
    'movie_companies',
    'streaming_services',
    'users',
    'search_history',
    'ratings',
    'cinema_relations',
  ]) {
    assert.match(sql, new RegExp(`create table if not exists (public\\.)?${table}\\b`));
  }

  assert.doesNotMatch(sql, /drop\s+(table|schema|database)/);
  assert.match(sql, /alter table .* enable row level security/);
});

test('core MovieFinder migration extends credits for writers while preserving the people-as-one-table model', async () => {
  const sql = (await readFile(migrationUrl, 'utf8')).toLowerCase();
  assert.match(sql, /credits/);
  assert.match(sql, /writer/);
  assert.doesNotMatch(sql, /create table if not exists (public\.)?(actors|directors)\b/);
});
