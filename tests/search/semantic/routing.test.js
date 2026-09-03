import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldUseSemanticRetrieval } from '../../../lib/search/semantic/routing.js';

test('direct filmography search skips semantic retrieval', () => {
  assert.equal(shouldUseSemanticRetrieval({
    enabled: true,
    query: 'Will Smith movies on Netflix',
    parsedIntent: { kind: 'person-filmography', personName: 'Will Smith', provider: 'Netflix' }
  }), false);
});

test('concept-heavy discovery uses semantic retrieval', () => {
  assert.equal(shouldUseSemanticRetrieval({
    enabled: true,
    query: 'slow-burn crime movies with lonely protagonists and bleak endings',
    parsedIntent: { kind: 'discovery', concepts: ['slow-burn', 'lonely protagonists', 'bleak endings'] }
  }), true);
});

test('kill switch disables semantic retrieval', () => {
  assert.equal(shouldUseSemanticRetrieval({
    enabled: false,
    query: 'dreamlike thrillers',
    parsedIntent: { kind: 'discovery' }
  }), false);
});
