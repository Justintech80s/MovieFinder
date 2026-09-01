import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../../lib/search/intent.js';

test('maps scary movie wording to the horror genre contract', () => {
  const p = parseIntent('Find me a scary movie');
  assert.deepEqual(p.genreWords, ['horror']);
});
