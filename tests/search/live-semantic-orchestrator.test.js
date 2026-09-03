import test from 'node:test';
import assert from 'node:assert/strict';

import { createLiveOrchestrator } from '../../lib/search/live-orchestrator.js';

function graphStore(nodes = {}) {
  const calls = [];
  return {
    calls,
    async getNode(id) { calls.push(id); return nodes[id] || null; },
    async traverse() { return []; }
  };
}

function semanticRetriever(result) {
  const calls = [];
  return {
    calls,
    async retrieve(args) { calls.push(args); return typeof result === 'function' ? result(args) : result; }
  };
}

test('direct title search skips semantic retrieval completely', async () => {
  const semantic = semanticRetriever({ mode: 'hybrid', documents: [], entityIds: ['m1'], degraded: false });
  const orchestrator = createLiveOrchestrator({
    semanticRetriever: semantic,
    semanticEnabled: true,
    deterministicSearch: async () => ({ parsed: { kind: 'title' }, results: [{ id: 'direct' }] })
  });
  const result = await orchestrator.search({ query: 'The Conversation', parsedIntent: { kind: 'title', concepts: [] } });
  assert.equal(semantic.calls.length, 0);
  assert.equal(result.reasoningMode, 'deterministic');
});

test('concept-heavy semantic search resolves entity ids through the graph and exposes bounded semantic evidence', async () => {
  const graph = graphStore({
    m1: { id: 'm1', type: 'Movie', title: 'Cold Film', year: 1974 },
    m2: { id: 'm2', type: 'Movie', title: 'Dream Film', year: 1977 }
  });
  const semantic = semanticRetriever({
    mode: 'hybrid', degraded: false, entityIds: ['m1', 'm2'],
    documents: [{ id: 'd1', entityId: 'm1', type: 'movie_themes', excerpt: 'paranoid surveillance', source: { kind: 'fixture' }, provenance: {}, lexicalRank: 1, semanticRank: 1, fusedRank: 0.03 }]
  });
  const orchestrator = createLiveOrchestrator({
    graphStore: graph, semanticRetriever: semantic, semanticEnabled: true,
    deterministicSearch: async () => ({ results: [] }),
    lookupAvailability: async movie => ({ ...movie, offers: [] })
  });
  const parsedIntent = { kind: 'discovery', concepts: ['paranoia', 'surveillance'] };
  const result = await orchestrator.search({ query: 'bleak paranoid surveillance films', parsedIntent });

  assert.equal(semantic.calls.length, 1);
  assert.deepEqual(graph.calls, ['m1', 'm2']);
  assert.deepEqual(result.results.map(movie => movie.id), ['m1', 'm2']);
  assert.equal(result.reasoningMode, 'semantic+graph');
  assert.equal(result.evidence.semantic.documents.length, 1);
  assert.equal(result.evidence.semantic.documents[0].excerpt, 'paranoid surveillance');
});

test('semantic candidates still obey deterministic hard year constraints after availability verification', async () => {
  const graph = graphStore({
    old: { id: 'old', type: 'Movie', title: 'Old Film', year: 1968 },
    right: { id: 'right', type: 'Movie', title: 'Right Film', year: 1974 }
  });
  const semantic = semanticRetriever({ mode: 'hybrid', degraded: false, documents: [], entityIds: ['old', 'right'] });
  const orchestrator = createLiveOrchestrator({
    graphStore: graph, semanticRetriever: semantic, semanticEnabled: true,
    deterministicSearch: async () => ({ results: [] }),
    lookupAvailability: async movie => ({ ...movie, offers: [] })
  });
  const result = await orchestrator.search({
    query: 'bleak 1974 crime films',
    parsedIntent: { kind: 'discovery', concepts: ['bleak', 'crime'], year: 1974 }
  });
  assert.deepEqual(result.results.map(movie => movie.id), ['right']);
});

test('semantic failure falls back to existing deterministic search', async () => {
  const semantic = semanticRetriever(() => { throw new Error('semantic unavailable'); });
  const orchestrator = createLiveOrchestrator({
    semanticRetriever: semantic, semanticEnabled: true,
    deterministicSearch: async () => ({ parsed: { kind: 'discovery' }, results: [{ id: 'fallback' }] })
  });
  const result = await orchestrator.search({ query: 'dreamlike memory thrillers', parsedIntent: { kind: 'discovery', concepts: ['dreamlike', 'memory'] } });
  assert.equal(result.reasoningMode, 'deterministic');
  assert.deepEqual(result.results.map(movie => movie.id), ['fallback']);
});

test('AI receives only the final verified semantic and graph evidence', async () => {
  const semantic = semanticRetriever({
    mode: 'hybrid', degraded: false, entityIds: ['m1'],
    documents: [{ id: 'd1', entityId: 'm1', type: 'movie_style', excerpt: 'cold visual style', source: { kind: 'fixture' }, provenance: {}, lexicalRank: 1, semanticRank: 1, fusedRank: 0.03 }]
  });
  const calls = [];
  const orchestrator = createLiveOrchestrator({
    graphStore: graphStore({ m1: { id: 'm1', type: 'Movie', title: 'Cold Film', year: 1974 } }),
    semanticRetriever: semantic, semanticEnabled: true,
    lookupAvailability: async movie => ({ ...movie, offers: [] }),
    modelRouter: { async run(capability, input) { calls.push({ capability, input }); return { provider: 'test', output: { content: 'grounded', model: 'test' } }; } },
    deterministicSearch: async () => ({ results: [] })
  });
  const result = await orchestrator.search({ query: 'cold visual style crime movies', parsedIntent: { kind: 'discovery', concepts: ['cold', 'visual'] } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.evidence.semantic.documents.length, 1);
  assert.deepEqual(calls[0].input.evidence.movies.map(movie => movie.id), ['m1']);
  assert.equal(result.reasoningMode, 'semantic+graph+ai');
});
