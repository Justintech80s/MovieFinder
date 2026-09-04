import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../../supabase/migrations/20260904_backend_schema_completion.sql',import.meta.url),'utf8');

test('schema completion is additive and preserves existing core tables', () => {
  assert.match(sql,/alter table if exists movies/i);
  assert.match(sql,/alter table if exists people/i);
  assert.match(sql,/alter table if exists credits/i);
  assert.match(sql,/alter table if exists availability_snapshots/i);
  assert.doesNotMatch(sql,/drop table/i);
});

test('schema completion adds structured TV and taxonomy entities', () => {
  for (const table of ['shows','genres','themes','countries','streaming_providers','movie_genres','movie_themes','movie_countries','show_genres','show_themes','show_countries']) {
    assert.match(sql,new RegExp(`create table if not exists ${table}`,'i'));
  }
});

test('credits support writer role and show credits without replacing movie credits', () => {
  assert.match(sql,/role in \('cast','director','producer','writer'\)/i);
  assert.match(sql,/create table if not exists show_credits/i);
});

test('availability records include source attribution and verification timestamps', () => {
  assert.match(sql,/provider_id uuid references streaming_providers/i);
  assert.match(sql,/verified_at timestamptz/i);
  assert.match(sql,/source_url text/i);
  assert.match(sql,/confidence numeric\(4,3\)/i);
});
