import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveOrchestrator } from '../../lib/search/live-orchestrator.js';

function graphFixture() {
  const nodes = new Map([
    ['movie:conversation', { id: 'movie:conversation', type: 'Movie', name: 'The Conversation', properties: { year: 1974 } }],
    ['movie:parallax', { id: 'movie:parallax', type: 'Movie', name: 'The Parallax View', properties: { year: 1974 } }]
  ]);
  return {
    async getNode(id) { return nodes.get(id) || null; },
    async traverse() { return [{ from: 'movie:conversation', to: 'movie:parallax', type: 'RELATED_TO' }]; }
  };
}

const lookupAvailability = async movie => ({
  ...movie,
  offers: [{ provider: 'Max', type: 'FLATRATE', url: 'https://www.max.com/example' }],
  checkedAt: '2026-09-02T18:00:00.000Z'
});

test('simple direct search never calls the AI router', async () => {
  let aiCalls = 0;
  const orchestrator = createLiveOrchestrator({
    modelRouter: { async run() { aiCalls += 1; throw new Error('AI must not run'); } },
    deterministicSearch: async () => ({ parsed: { kind: 'title' }, results: [{ id: 'movie:heat', title: 'Heat', year: 1995 }] })
  });

  const result = await orchestrator.search({
    query: 'Heat',
    parsedIntent: { kind: 'title', concepts: [] }
  });

  assert.equal(result.results[0].title, 'Heat');
  assert.equal(aiCalls, 0);
});

test('complex graph search sends only bounded verified evidence to AI', async () => {
  const calls = [];
  const modelRouter = {
    async run(capability, input, options) {
      calls.push({ capability, input, options });
      return { provider: 'openai', output: { model: 'test-model', content: 'Verified cinema context.', structuredData: null } };
    }
  };
  const orchestrator = createLiveOrchestrator({ graphStore: graphFixture(), lookupAvailability, modelRouter });

  const result = await orchestrator.search({
    query: 'movies like The Conversation and why they connect',
    parsedIntent: { kind: 'discovery', similarityAnchor: 'movie:conversation', concepts: ['similarity', 'connection'] },
    headers: { authorization: 'must-not-leak' },
    env: { SECRET: 'must-not-leak' }
  });

  assert.ok(calls.length >= 1);
  const context = calls[0].options.context;
  assert.deepEqual(context, result.evidence);
  assert.equal('headers' in context, false);
  assert.equal('env' in context, false);
  assert.equal(result.ai.provider, 'openai');
});

test('AI output cannot overwrite verified movie identity year or availability', async () => {
  const modelRouter = {
    async run() {
      return {
        provider: 'openai',
        output: {
          model: 'test-model',
          content: 'The movie is from 2001 and streams on FakeFlix.',
          structuredData: {
            results: [{ id: 'movie:conversation', title: 'Wrong Title', year: 2001, offers: [{ provider: 'FakeFlix' }] }]
          }
        }
      };
    }
  };
  const orchestrator = createLiveOrchestrator({ graphStore: graphFixture(), lookupAvailability, modelRouter });

  const result = await orchestrator.search({
    query: 'movies like The Conversation and explain why',
    parsedIntent: { kind: 'discovery', similarityAnchor: 'movie:conversation', concepts: ['similarity', 'connection'] }
  });

  assert.equal(result.results[0].title, 'The Conversation');
  assert.equal(result.results[0].year, 1974);
  assert.equal(result.results[0].offers[0].provider, 'Max');
});

test('AI provider failure returns verified graph results without a 5xx-style failure', async () => {
  const orchestrator = createLiveOrchestrator({
    graphStore: graphFixture(),
    lookupAvailability,
    modelRouter: { async run() { throw Object.assign(new Error('provider timeout'), { code: 'MODEL_TIMEOUT' }); } }
  });

  const result = await orchestrator.search({
    query: 'movies like The Conversation and explain the relationship',
    parsedIntent: { kind: 'discovery', similarityAnchor: 'movie:conversation', concepts: ['similarity', 'relationship'] }
  });

  assert.equal(result.reasoningMode, 'graph');
  assert.equal(result.results[0].title, 'The Conversation');
  assert.equal(result.ai, undefined);
});
