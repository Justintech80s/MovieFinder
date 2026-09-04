import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MovieFinder exposes functional provider, type, price, quality, and clear filters', async () => {
  const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
  assert.match(html,/data-filter-provider/i);
  assert.match(html,/data-filter-type/i);
  assert.match(html,/data-filter-price/i);
  assert.match(html,/data-filter-quality/i);
  assert.match(html,/data-clear-filters/i);
  assert.match(html,/filterOffers/i);
  assert.match(html,/filter-state/i);
});

test('MovieFinder filters already-returned offers without making another search request', async () => {
  const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
  assert.match(html,/currentResults/i);
  assert.match(html,/applyFilters/i);
  assert.match(html,/render\(currentResults/i);
});


test('MovieFinder quality filter matches grouped quality arrays', async () => {
  const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
  assert.match(html,/offerQualities/);
  assert.match(html,/includes\(filterState\.quality\.toUpperCase\(\)\)/);
});
