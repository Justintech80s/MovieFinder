import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHealthStatus, buildReadinessStatus } from '../../lib/health/status.js';

test('health status is shallow and does not require external systems', () => {
  const result=buildHealthStatus({now:'2026-09-04T17:00:00.000Z'});
  assert.deepEqual(result,{status:'ok',service:'moviefinder-node',time:'2026-09-04T17:00:00.000Z'});
});

test('readiness is true when required Node path is ready even if optional systems are unconfigured', async () => {
  const result=await buildReadinessStatus({
    config:{databaseConfigured:false,cacheConfigured:false,pythonConfigured:false,aiConfigured:false},
    checks:{}
  });
  assert.equal(result.ready,true);
  assert.equal(result.subsystems.node.status,'ready');
  assert.equal(result.subsystems.database.status,'not_configured');
});

test('configured required database failure makes readiness false without exposing error detail', async () => {
  const result=await buildReadinessStatus({
    config:{databaseConfigured:true,cacheConfigured:false,pythonConfigured:false,aiConfigured:false},
    checks:{database:async()=>{throw new Error('postgres://user:secret@db.internal');}}
  });
  assert.equal(result.ready,false);
  assert.equal(result.subsystems.database.status,'unavailable');
  assert.doesNotMatch(JSON.stringify(result),/secret|db\.internal/);
});

test('optional cache Python and AI failures do not make Node search unready', async () => {
  const result=await buildReadinessStatus({
    config:{databaseConfigured:false,cacheConfigured:true,pythonConfigured:true,aiConfigured:true},
    checks:{cache:async()=>false,python:async()=>false,ai:async()=>false}
  });
  assert.equal(result.ready,true);
  assert.equal(result.subsystems.cache.status,'unavailable');
  assert.equal(result.subsystems.python.status,'unavailable');
  assert.equal(result.subsystems.ai.status,'unavailable');
});
