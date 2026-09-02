import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MovieFinder ships a root homepage that connects to the search API', async () => {
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/MovieFinder/i);
  assert.match(html,/\/api\/search\?q=/);
  assert.match(html,/<form/i);
});
