import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MovieFinder renders screenshot-style wide results with watch-provider cards', async () => {
  const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
  assert.match(html,/class="[^"]*movie-card/i);
  assert.match(html,/class="[^"]*movie-overview/i);
  assert.match(html,/class="[^"]*watch-panel/i);
  assert.match(html,/class="[^"]*offer-strip/i);
  assert.match(html,/class="[^"]*offer-card/i);
  assert.match(html,/Where to Watch/i);
  assert.match(html,/Availability and prices may vary by region and time/i);
});

test('MovieFinder keeps support hidden until the Support button opens the overlay', async () => {
  const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
  assert.match(html,/data-support-open/i);
  assert.match(html,/id="supportOverlay"[^>]*hidden/i);
  assert.match(html,/data-support-close/i);
  assert.match(html,/♥ Support/i);
});
