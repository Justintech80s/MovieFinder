import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../../lib/search/intent.js';

test('parses decade wording into year bounds', () => {
  const p = parseIntent('Find me crime movies from the 1990s');
  assert.equal(p.yearMin, 1990);
  assert.equal(p.yearMax, 1999);
});
