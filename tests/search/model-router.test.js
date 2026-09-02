import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelRouter } from '../../lib/search/model-router.js';

test('falls back to the next capable provider', async () => {
  const router = createModelRouter({ timeoutMs: 100 });
  router.register('first', { capabilities: ['semantic'], invoke: async () => { throw new Error('down'); } });
  router.register('second', { capabilities: ['semantic'], invoke: async () => ({ concepts: ['paranoid'] }) });
  const result = await router.run('semantic', { query: 'conspiracy films' });
  assert.equal(result.provider, 'second');
  assert.deepEqual(result.output, { concepts: ['paranoid'] });
});

test('supports explicit provider selection', async () => {
  const router = createModelRouter();
  router.register('one', { capabilities: ['semantic'], invoke: async () => 1 });
  router.register('two', { capabilities: ['semantic'], invoke: async () => 2 });
  const result = await router.run('semantic', {}, { provider: 'two' });
  assert.equal(result.output, 2);
});

test('returns normalized failure when no provider can satisfy capability', async () => {
  const router = createModelRouter();
  await assert.rejects(router.run('vision', {}), error => error.code === 'MODEL_PROVIDER_UNAVAILABLE');
});

test('preserves normalized provider failures when every candidate fails', async () => {
  const router = createModelRouter();
  router.register('one', {
    capabilities: ['cinema_reasoning'],
    invoke: async () => { throw Object.assign(new Error('rate limited'), { code: 'MODEL_RATE_LIMITED' }); }
  });
  router.register('two', {
    capabilities: ['cinema_reasoning'],
    invoke: async () => { throw Object.assign(new Error('provider down'), { code: 'MODEL_PROVIDER_ERROR' }); }
  });
  await assert.rejects(
    router.run('cinema_reasoning', {}),
    error => error.code === 'MODEL_PROVIDER_UNAVAILABLE'
      && error.failures?.[0]?.code === 'MODEL_RATE_LIMITED'
      && error.failures?.[1]?.code === 'MODEL_PROVIDER_ERROR'
  );
});

test('explicit unavailable provider does not silently fall back to another provider', async () => {
  const router = createModelRouter();
  router.register('working', { capabilities: ['cinema_reasoning'], invoke: async () => 'wrong fallback' });
  await assert.rejects(
    router.run('cinema_reasoning', {}, { provider: 'missing' }),
    error => error.code === 'MODEL_PROVIDER_UNAVAILABLE'
  );
});

test('uses configured capability-specific default order', async () => {
  const router = createModelRouter({ orders: { cinema_reasoning: ['second', 'first'] } });
  router.register('first', { capabilities: ['cinema_reasoning'], invoke: async () => 'first' });
  router.register('second', { capabilities: ['cinema_reasoning'], invoke: async () => 'second' });
  const result = await router.run('cinema_reasoning', {});
  assert.equal(result.provider, 'second');
});
