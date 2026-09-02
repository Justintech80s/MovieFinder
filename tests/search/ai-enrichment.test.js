import test from 'node:test';
import assert from 'node:assert/strict';
import { createAIEnrichment } from '../../lib/search/ai-enrichment.js';

test('AI synthesis cannot overwrite verified deterministic fields', async () => {
  const modelRouter = {
    async run(capability) {
      assert.equal(capability, 'answer_synthesis');
      return {
        provider: 'openai',
        output: {
          provider: 'openai', model: 'test-model', capability, content: 'Useful explanation',
          structuredData: { results: [{ id: 'evil-id', title: 'Wrong Title', availability: { provider: 'FakeStream', region: 'US' }, evidence: [{ source: 'model', claim: 'invented' }], confidence: 0, verification: { availability: { state: 'available' } }, explanation: 'A model-generated explanation', semanticTags: ['paranoid thriller'] }] },
          usage: null, latencyMs: 1
        }
      };
    }
  };
  const enrichment = createAIEnrichment({ modelRouter });
  const verified = [{ id: 'movie:conversation', title: 'The Conversation', availability: null, evidence: [{ source: 'cinema-graph', claim: 'verified actor credit' }], confidence: 1, verification: { availability: { state: 'unknown' } } }];
  const output = await enrichment.synthesize(verified, { version: 1 }, {});
  assert.equal(output.results[0].id, 'movie:conversation');
  assert.equal(output.results[0].title, 'The Conversation');
  assert.equal(output.results[0].availability, null);
  assert.deepEqual(output.results[0].evidence, verified[0].evidence);
  assert.equal(output.results[0].confidence, 1);
  assert.deepEqual(output.results[0].verification, verified[0].verification);
  assert.equal(output.results[0].ai.explanation, 'A model-generated explanation');
  assert.deepEqual(output.results[0].ai.semanticTags, ['paranoid thriller']);
  assert.equal(output.ai.provider, 'openai');
  assert.equal(output.ai.content, 'Useful explanation');
});

test('AI result metadata is matched by stable id rather than array position', async () => {
  const modelRouter = {
    async run(capability) {
      return { provider: 'openai', output: { provider: 'openai', model: 'm', capability, content: 'ok', structuredData: { results: [
        { id: 'movie:two', explanation: 'Two explanation' },
        { id: 'movie:one', explanation: 'One explanation' }
      ] } } };
    }
  };
  const enrichment = createAIEnrichment({ modelRouter });
  const verified = [{ id: 'movie:one', title: 'One' }, { id: 'movie:two', title: 'Two' }];
  const output = await enrichment.synthesize(verified, { version: 1 }, {});
  assert.equal(output.results[0].ai.explanation, 'One explanation');
  assert.equal(output.results[1].ai.explanation, 'Two explanation');
});

test('top-level AI metadata does not expose untrusted structured result claims', async () => {
  const modelRouter = {
    async run(capability) {
      return { provider: 'openai', output: { provider: 'openai', model: 'm', capability, content: 'ok', structuredData: { results: [{ id: 'movie:one', title: 'Wrong', availability: 'invented', explanation: 'safe' }], note: 'model note' } } };
    }
  };
  const output = await createAIEnrichment({ modelRouter }).synthesize([{ id: 'movie:one', title: 'One' }], { version: 1 }, {});
  assert.equal(output.ai.structuredData, null);
  assert.equal(output.results[0].title, 'One');
  assert.equal(output.results[0].ai.explanation, 'safe');
});

test('AI enrichment degrades cleanly when every model provider is unavailable', async () => {
  const modelRouter = { async run() { throw Object.assign(new Error('none available'), { code: 'MODEL_PROVIDER_UNAVAILABLE' }); } };
  const enrichment = createAIEnrichment({ modelRouter });
  const verified = [{ id: 'movie:one', title: 'One', confidence: 1 }];
  const output = await enrichment.synthesize(verified, { version: 1 }, {});
  assert.deepEqual(output.results, verified);
  assert.equal(output.ai, null);
});

test('interpret and reason expose only optional AI metadata', async () => {
  const calls = [];
  const modelRouter = { async run(capability) { calls.push(capability); return { provider: 'gemini', output: { content: capability, structuredData: { hint: capability } } }; } };
  const enrichment = createAIEnrichment({ modelRouter });
  const interpreted = await enrichment.interpret('find paranoid thrillers', {});
  const reasoned = await enrichment.reason([{ title: 'Example' }], { version: 1 }, {});
  assert.deepEqual(calls, ['intent_interpretation', 'cinema_reasoning']);
  assert.equal(interpreted.ai.provider, 'gemini');
  assert.deepEqual(reasoned.ai.structuredData, { hint: 'cinema_reasoning' });
});
