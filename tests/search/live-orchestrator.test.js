import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldUseAi, buildVerifiedEvidence } from '../../lib/search/live-orchestrator.js';

test('simple direct provider lookup skips AI', () => {
  assert.equal(shouldUseAi({
    query: 'Will Smith movies on Netflix',
    parsedIntent: {
      kind: 'person-filmography',
      person: 'Will Smith',
      provider: 'Netflix',
      concepts: []
    }
  }), false);
});

test('multi-concept relationship query requests AI-capable orchestration', () => {
  assert.equal(shouldUseAi({
    query: '1970s paranoid thrillers influenced by European cinema that are streaming now',
    parsedIntent: {
      kind: 'discovery',
      concepts: ['paranoia', 'influence', 'european-cinema']
    }
  }), true);
});

test('verified evidence contains only explicit supplied facts and is bounded', () => {
  const evidence = buildVerifiedEvidence({
    query: 'movies like The Conversation',
    parsedIntent: { kind: 'discovery' },
    graph: {
      entities: [{ id: 'm1', name: 'The Conversation' }],
      relations: [],
      paths: []
    },
    movies: [{ id: 'm1', title: 'The Conversation', year: 1974 }],
    currentAvailability: [{
      movieId: 'm1',
      provider: 'Max',
      checkedAt: '2026-09-02T12:00:00.000Z'
    }],
    constraints: {},
    provenance: [{ source: 'Wikidata', externalId: 'Q123' }],
    confidence: 0.93,
    env: { SECRET: 'must-not-leak' },
    headers: { authorization: 'must-not-leak' }
  });

  assert.equal(evidence.movies[0].title, 'The Conversation');
  assert.equal(evidence.currentAvailability[0].provider, 'Max');
  assert.equal('env' in evidence, false);
  assert.equal('headers' in evidence, false);
});

test('verified evidence caps graph, movie, availability, and provenance arrays', () => {
  const make = (count, prefix) => Array.from({ length: count }, (_, index) => ({ id: `${prefix}${index}` }));
  const evidence = buildVerifiedEvidence({
    query: 'complex cinema query',
    parsedIntent: { kind: 'discovery' },
    graph: {
      entities: make(50, 'entity-'),
      relations: make(90, 'relation-'),
      paths: make(30, 'path-')
    },
    movies: make(50, 'movie-'),
    currentAvailability: make(130, 'availability-'),
    constraints: {},
    provenance: make(90, 'source-'),
    confidence: 0.8
  });

  assert.equal(evidence.entities.length, 40);
  assert.equal(evidence.relations.length, 80);
  assert.equal(evidence.paths.length, 20);
  assert.equal(evidence.movies.length, 40);
  assert.equal(evidence.currentAvailability.length, 120);
  assert.equal(evidence.provenance.length, 80);
});
