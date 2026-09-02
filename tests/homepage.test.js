import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MovieFinder ships a root homepage that connects to the search API', async () => {
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/MovieFinder/i);
  assert.match(html,/\/api\/search\?q=/);
  assert.match(html,/<form/i);
});

test('MovieFinder homepage includes the restored crypto receiving screen', async () => {
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/data-screen="crypto"/i);
  assert.match(html,/Bitcoin/i);
  assert.match(html,/Ethereum/i);
  assert.match(html,/Copy Address/i);
  assert.match(html,/35pjN4cz6XHpGyyEBAgSAAjuDTbwLK4iSU/);
  assert.match(html,/0x8AdE34252Ef275b2b503387209e0f56056D29A34/i);
});