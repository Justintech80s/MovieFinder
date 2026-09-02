import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeQuery, deriveAnalyticsKey } from '../../lib/analytics/privacy.js';

test('sanitizeQuery redacts email and US phone patterns', () => {
  const value = sanitizeQuery('find movies for jane@example.com call (617) 555-0100');
  assert.equal(value, 'find movies for [redacted-email] call [redacted-phone]');
});

test('sanitizeQuery normalizes whitespace and caps stored text at 300 chars', () => {
  const value = sanitizeQuery(`  horror\n movies   ${'x'.repeat(400)} `);
  assert.ok(value.length <= 300);
  assert.ok(!value.includes('\n'));
  assert.ok(!value.includes('  '));
});

test('sanitizeQuery strips control characters', () => {
  assert.equal(sanitizeQuery('horror\u0000movie'), 'horrormovie');
});

test('deriveAnalyticsKey is deterministic HMAC and does not return raw id', () => {
  const a = deriveAnalyticsKey('visitor-raw', 'secret-value');
  const b = deriveAnalyticsKey('visitor-raw', 'secret-value');
  assert.equal(a, b);
  assert.notEqual(a, 'visitor-raw');
  assert.match(a, /^[A-Za-z0-9_-]{40,}$/);
});
