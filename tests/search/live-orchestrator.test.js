import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldUseAi, buildVerifiedEvidence, createLiveOrchestrator } from '../../lib/search/live-orchestrator.js';

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

test('complex anchored query reads bounded persistent graph candidates', async () => {
  const nodes = new Map([
    ['movie:conversation', { id: 'movie:conversation', type: 'Movie', name: 'The Conversation', properties: { year: 1974 } }],
    ['theme:surveillance', { id: 'theme:surveillance', type: 'Theme', name: 'Surveillance' }],
    ['movie:parallax', { id: 'movie:parallax', type: 'Movie', name: 'The Parallax View', properties: { year: 1974 } }]
  ]);
  let traversalOptions = null;
  const graphStore = {
    async getNode(id) { return nodes.get(id) || null; },
    async traverse(startId, options) {
      assert.equal(startId, 'movie:conversation');
      traversalOptions = options;
      return [
        { from: 'movie:conversation', to: 'theme:surveillance', type: 'HAS_THEME' },
        { from: 'theme:surveillance', to: 'movie:parallax', type: 'RELATED_TO' }
      ];
    }
  };
  const orchestrator = createLiveOrchestrator({
    graphStore,
    deterministicSearch: async () => ({ parsed: {}, results: [] })
  });

  const result = await orchestrator.search({
    query: 'movies like The Conversation with surveillance themes',
    parsedIntent: {
      kind: 'discovery',
      similarityAnchor: 'movie:conversation',
      concepts: ['similarity', 'surveillance']
    }
  });

  assert.deepEqual(traversalOptions, { maxDepth: 3, maxResults: 40 });
  assert.equal(result.reasoningMode, 'graph');
  assert.deepEqual(result.results.map(movie => movie.title), ['The Conversation', 'The Parallax View']);
  assert.equal(result.evidence.relations.length, 2);
});

test('graph failure falls back to deterministic search without failing the request', async () => {
  let fallbackCalls = 0;
  const orchestrator = createLiveOrchestrator({
    graphStore: {
      async getNode() { return { id: 'movie:conversation', type: 'Movie', name: 'The Conversation' }; },
      async traverse() { throw new Error('db unavailable'); }
    },
    deterministicSearch: async () => {
      fallbackCalls += 1;
      return { parsed: { kind: 'discovery' }, results: [{ id: 'movie:heat', title: 'Heat', year: 1995 }] };
    }
  });

  const result = await orchestrator.search({
    query: 'movies like The Conversation',
    parsedIntent: { kind: 'discovery', similarityAnchor: 'movie:conversation', concepts: ['similarity'] }
  });

  assert.equal(fallbackCalls, 1);
  assert.equal(result.results[0].title, 'Heat');
  assert.equal(result.reasoningMode, 'deterministic');
});

test('provider-constrained graph results require current matching availability before inclusion', async () => {
  const nodes = new Map([
    ['movie:conversation', { id: 'movie:conversation', type: 'Movie', name: 'The Conversation', properties: { year: 1974 } }],
    ['movie:parallax', { id: 'movie:parallax', type: 'Movie', name: 'The Parallax View', properties: { year: 1974 } }]
  ]);
  const graphStore = {
    async getNode(id) { return nodes.get(id) || null; },
    async traverse() {
      return [{ from: 'movie:conversation', to: 'movie:parallax', type: 'RELATED_TO' }];
    }
  };
  const lookupAvailability = async movie => {
    if (movie.id === 'movie:parallax') {
      return { ...movie, offers: [{ provider: 'Netflix', type: 'FLATRATE', url: 'https://www.netflix.com/title/example' }] };
    }
    return { ...movie, offers: [{ provider: 'Max', type: 'FLATRATE', url: 'https://www.max.com/example' }] };
  };
  const orchestrator = createLiveOrchestrator({
    graphStore,
    lookupAvailability,
    deterministicSearch: async () => ({ parsed: {}, results: [] })
  });

  const result = await orchestrator.search({
    query: 'movies like The Conversation on Netflix',
    parsedIntent: {
      kind: 'discovery',
      similarityAnchor: 'movie:conversation',
      concepts: ['similarity'],
      provider: 'Netflix'
    }
  });

  assert.deepEqual(result.results.map(movie => movie.title), ['The Parallax View']);
  assert.equal(result.results[0].offers[0].provider, 'Netflix');
  assert.equal(result.evidence.currentAvailability.length, 1);
});
