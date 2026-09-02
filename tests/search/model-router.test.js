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
