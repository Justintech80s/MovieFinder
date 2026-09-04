import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuntimeConfig, publicConfigSummary } from '../../lib/config/runtime-config.js';

test('runtime config applies bounded defaults when optional env values are absent', () => {
  const config=readRuntimeConfig({});
  assert.equal(config.justWatchTimeoutMs,8000);
  assert.equal(config.searchRateLimit,60);
  assert.equal(config.searchRateWindowMs,60000);
  assert.equal(config.databaseConfigured,false);
  assert.equal(config.cacheConfigured,false);
  assert.equal(config.pythonConfigured,false);
});

test('runtime config rejects invalid numeric backend settings', () => {
  assert.throws(()=>readRuntimeConfig({JUSTWATCH_TIMEOUT_MS:'0'}),/JUSTWATCH_TIMEOUT_MS/);
  assert.throws(()=>readRuntimeConfig({SEARCH_RATE_LIMIT:'not-a-number'}),/SEARCH_RATE_LIMIT/);
});

test('public runtime summary never exposes secret values', () => {
  const config=readRuntimeConfig({
    SUPABASE_URL:'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY:'secret-db-key',
    REDIS_URL:'rediss://user:secret@cache.example.com',
    PYTHON_BRAIN_URL:'https://brain.example.com',
    OPENAI_API_KEY:'secret-ai-key',
    OPENAI_MODEL:'gpt-test'
  });
  const summary=publicConfigSummary(config);
  const serialized=JSON.stringify(summary);
  assert.equal(summary.databaseConfigured,true);
  assert.equal(summary.cacheConfigured,true);
  assert.equal(summary.pythonConfigured,true);
  assert.equal(summary.aiConfigured,true);
  assert.doesNotMatch(serialized,/secret-db-key|secret-ai-key|user:secret/);
});
