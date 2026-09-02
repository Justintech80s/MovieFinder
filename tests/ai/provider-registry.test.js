import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionModelRouter } from '../../lib/ai/provider-registry.js';

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

const models = {
  openai: 'openai-test',
  anthropic: 'anthropic-test',
  gemini: 'gemini-test',
  xai: 'xai-test'
};

test('missing credentials register no production providers', () => {
  const router = createProductionModelRouter({ env: {}, models, fetchImpl: async () => response(200, {}) });
  assert.deepEqual(router.providers(), []);
});

test('registers only providers with matching server-side credentials', () => {
  const router = createProductionModelRouter({
    env: { OPENAI_API_KEY: 'o', GEMINI_API_KEY: 'g' },
    models,
    fetchImpl: async () => response(200, {})
  });
  assert.deepEqual(router.providers(), ['openai', 'gemini']);
});

test('uses default provider order independent of env property order', async () => {
  const calls = [];
  const router = createProductionModelRouter({
    env: { ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o' },
    models,
    fetchImpl: async url => {
      calls.push(url);
      if (url.includes('openai.com')) return response(200, { model: 'openai-test', output_text: 'openai' });
      return response(200, { model: 'anthropic-test', content: [{ type: 'text', text: 'anthropic' }] });
    }
  });
  const result = await router.run('answer_synthesis', { prompt: 'answer' });
  assert.equal(result.provider, 'openai');
  assert.match(calls[0], /openai\.com/);
});

test('capability-specific order overrides default order', async () => {
  const calls = [];
  const router = createProductionModelRouter({
    env: { OPENAI_API_KEY: 'o', ANTHROPIC_API_KEY: 'a' },
    models,
    orders: { cinema_reasoning: ['anthropic', 'openai'] },
    fetchImpl: async url => {
      calls.push(url);
      if (url.includes('anthropic.com')) return response(200, { model: 'anthropic-test', content: [{ type: 'text', text: 'anthropic' }] });
      return response(200, { model: 'openai-test', output_text: 'openai' });
    }
  });
  const result = await router.run('cinema_reasoning', { prompt: 'reason' });
  assert.equal(result.provider, 'anthropic');
  assert.match(calls[0], /anthropic\.com/);
});

test('OpenAI failure falls through to Anthropic', async () => {
  const router = createProductionModelRouter({
    env: { OPENAI_API_KEY: 'o', ANTHROPIC_API_KEY: 'a' },
    models,
    fetchImpl: async url => {
      if (url.includes('openai.com')) return response(503, { error: { message: 'down' } });
      return response(200, { model: 'anthropic-test', content: [{ type: 'text', text: 'fallback' }] });
    }
  });
  const result = await router.run('cinema_reasoning', { prompt: 'reason' });
  assert.equal(result.provider, 'anthropic');
  assert.equal(result.output.content, 'fallback');
});
