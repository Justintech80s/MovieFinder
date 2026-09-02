import test from 'node:test';
import assert from 'node:assert/strict';

test('query expansion normalizes punctuation and preserves original terms', async()=>{
  const {expandSearchQuery}=await import('../lib/search/query-expansion.js');
  const result=expandSearchQuery('  Sci-Fi!!!  Movies ');
  assert.equal(result.original,'  Sci-Fi!!!  Movies ');
  assert.equal(result.normalized,'sci fi movies');
  assert.deepEqual(result.tokens,['sci','fi','movies']);
  assert.ok(result.expandedTokens.includes('science'));
  assert.ok(result.expandedTokens.includes('fiction'));
});

test('film-domain synonyms expand deterministically', async()=>{
  const {expandSearchQuery}=await import('../lib/search/query-expansion.js');
  const result=expandSearchQuery('scary gangster romcom');
  for(const token of ['horror','crime','romantic','comedy']) assert.ok(result.expandedTokens.includes(token));
  assert.ok(result.variants.includes('horror'));
  assert.ok(result.variants.includes('crime'));
});
