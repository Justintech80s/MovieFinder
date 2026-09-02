import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL('../../supabase/migrations/20260902_persistent_cinema_graph.sql', import.meta.url);

test('persistent cinema graph migration defines required durable structures', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  for (const table of [
    'cinema_entities',
    'cinema_entity_sources',
    'cinema_relations',
    'cinema_relation_sources',
    'cinema_ingestion_jobs'
  ]) {
    assert.match(sql, new RegExp(`create table if not exists ${table}`, 'i'));
  }

  assert.match(sql, /unique\s*\(source, external_id\)/i);
  assert.match(sql, /unique\s*\(from_entity_id, relation_type, to_entity_id\)/i);
  assert.match(sql, /pending.*running.*completed.*failed/is);
  assert.match(sql, /idx_cinema_entities_type_name/i);
  assert.match(sql, /idx_cinema_entity_sources_lookup/i);
  assert.match(sql, /idx_cinema_relations_from_type/i);
  assert.match(sql, /idx_cinema_relations_to_type/i);
  assert.match(sql, /idx_cinema_ingestion_jobs_resume/i);
});
