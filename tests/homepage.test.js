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
});

test('MovieFinder restores the classic natural-language discovery interface', async () => {
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/Ask MovieFinder like you would ask a person\./i);
  assert.match(html,/Search live/i);
  assert.match(html,/Star Wars\s*·\s*free/i);
  assert.match(html,/The Godfather/i);
  assert.match(html,/Horror\s*·\s*RT 90\+\s*·\s*rent &lt;\$5/i);
  assert.match(html,/Horror on Netflix/i);
  assert.match(html,/matching titles/i);
  assert.match(html,/>Matches</i);
  assert.match(html,/BEST OPTION/i);
  assert.match(html,/class="[^"]*movie-card/i);
  assert.match(html,/class="[^"]*poster/i);
  assert.match(html,/class="[^"]*rating/i);
});

test('MovieFinder result cards expose the wide Where to Watch price and availability layout', async () => {
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/Where to Watch/i);
  assert.match(html,/offer-card/i);
  assert.match(html,/offer-price/i);
  assert.match(html,/priceLabel/i);
  assert.match(html,/Subscription/i);
  assert.match(html,/Rent/i);
  assert.match(html,/Buy/i);
});
