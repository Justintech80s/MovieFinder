import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../../lib/search/intent.js';

test('parses Rotten Tomatoes minimum score from natural language', () => {
  const p = parseIntent('Find me a scary movie with a Rotten Tomatoes score of 90% or higher');
  assert.equal(p.rtMin, 90);
});
