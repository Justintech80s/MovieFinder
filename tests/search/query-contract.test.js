import test from 'node:test';
import assert from 'node:assert/strict';
import { JUSTWATCH_QUERY } from '../../api/search.js';

function graphqlBracesAreBalanced(source='') {
  let depth=0;
  for (const char of source) {
    if (char === '{') depth++;
    if (char === '}') depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

test('JustWatch GraphQL query has balanced selection braces', () => {
  assert.equal(graphqlBracesAreBalanced(JUSTWATCH_QUERY), true);
});

test('JustWatch offer query passes required language argument to retailPrice', () => {
  assert.match(JUSTWATCH_QUERY, /retailPrice\s*\(\s*language\s*:\s*\$language\s*\)/);
});

test('JustWatch query still requests the normalized offer fields MovieFinder needs', () => {
  assert.match(JUSTWATCH_QUERY, /retailPriceValue/);
  assert.match(JUSTWATCH_QUERY, /currency/);
  assert.match(JUSTWATCH_QUERY, /presentationType/);
  assert.match(JUSTWATCH_QUERY, /monetizationType/);
  assert.match(JUSTWATCH_QUERY, /standardWebURL/);
  assert.match(JUSTWATCH_QUERY, /clearName/);
});
