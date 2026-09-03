import test from 'node:test';
import assert from 'node:assert/strict';
import { fuseRanks } from '../../../lib/search/semantic/rrf.js';

test('RRF favors a document ranked in both lists and stays bounded', () => {
  const fused = fuseRanks({
    lexical: [{ id: 'a' }, { id: 'b' }],
    semantic: [{ id: 'b' }, { id: 'c' }],
    limit: 2
  });
  assert.equal(fused[0].id, 'b');
  assert.equal(fused.length, 2);
  assert.equal(fused[0].lexicalRank, 2);
  assert.equal(fused[0].semanticRank, 1);
});
