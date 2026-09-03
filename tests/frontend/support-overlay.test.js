import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('header uses Support control instead of a person/profile control', () => {
  assert.match(html, /data-support-open/);
  assert.match(html, />\s*♥\s*Support\s*</i);
  assert.doesNotMatch(html, /aria-label=["'](?:profile|person|account)["']/i);
});

test('support content is a dismissible overlay and is hidden by default', () => {
  assert.match(html, /id=["']supportOverlay["'][^>]*hidden/i);
  assert.match(html, /data-support-close/);
  assert.match(html, /aria-modal=["']true["']/i);
});

test('closing support returns to MovieFinder without removing the support trigger', () => {
  assert.match(html, /supportOverlay\.hidden\s*=\s*true/);
  assert.match(html, /supportOverlay\.hidden\s*=\s*false/);
  assert.match(html, /Continue without supporting/i);
});

test('support overlay contains Bitcoin Ethereum and PayPal support options', () => {
  assert.match(html, /Bitcoin/i);
  assert.match(html, /Ethereum/i);
  assert.match(html, /PayPal/i);
  assert.match(html, /paypal\.biz\/Justsaving/i);
});
