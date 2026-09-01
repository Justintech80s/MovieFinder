import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl=new URL('../../supabase/migrations/20260831_movie_people_credits.sql',import.meta.url);

test('MovieFinder persistence schema defines people movies credits and availability snapshots', async()=>{
  const sql=await readFile(migrationUrl,'utf8');
  for(const table of ['people','movies','credits','availability_snapshots']){
    assert.match(sql,new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+${table}`,'i'));
  }
  assert.match(sql,/check\s*\(\s*role\s+in\s*\('cast','director','producer'\)\s*\)/i);
  assert.match(sql,/check\s*\(\s*status\s+in\s*\('NOW','UPCOMING','ANNOUNCED','UNKNOWN'\)\s*\)/i);
});
