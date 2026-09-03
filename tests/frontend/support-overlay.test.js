import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');

test('support stays hidden until the Support button opens the overlay', () => {
  assert.match(html, /id="supportOverlay"[^>]*hidden/);
  assert.match(html, /data-support-open/);
  assert.match(html, /supportOverlay\.hidden=false/);
});

test('closing support returns to MovieFinder without replacing the page', () => {
  assert.match(html, /data-support-close/);
  assert.match(html, /supportOverlay\.hidden=true/);
  assert.doesNotMatch(html, /data-screen="crypto"/);
});

test('support overlay contains the approved receiving methods', () => {
  assert.match(html, /35pjN4cz6XHpGyyEBAgSAAjuDTbwLK4iSU/);
  assert.match(html, /0x8AdE34252Ef275b2b503387209e0f56056D29A34/);
  assert.match(html, /paypal\.biz\/Justsaving/);
});
