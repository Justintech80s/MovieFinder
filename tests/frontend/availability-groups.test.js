import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MovieFinder groups title availability into stream, free, rent, and buy sections', async () => {
  const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
  assert.match(html,/Stream with subscription/i);
  assert.match(html,/Free\s*\/\s*with ads/i);
  assert.match(html,/Rent/i);
  assert.match(html,/Buy/i);
  assert.match(html,/groupOffersByAccess/i);
});

test('MovieFinder explains when a title has no current availability', async () => {
  const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
  assert.match(html,/No current streaming, rental, or purchase availability found/i);
});
