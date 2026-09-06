import test from 'node:test';
import assert from 'node:assert/strict';
import { createResilientSource } from '../../lib/search/source-resilience.js';

test('retries transient upstream failures before succeeding', async () => {
  let calls=0;
  const source=createResilientSource({retries:2,staleTtlMs:60_000});
  const value=await source.get('movie:a',async()=>{
    calls+=1;
    if(calls<3){
      const error=new Error('HTTP 503');
      error.status=503;
      throw error;
    }
    return ['ok'];
  });
  assert.deepEqual(value,['ok']);
  assert.equal(calls,3);
});

test('returns recently cached stale data when a transient upstream request fails', async () => {
  let now=1_000;
  const source=createResilientSource({retries:0,freshTtlMs:100,staleTtlMs:1_000,now:()=>now});
  await source.get('movie:a',async()=>['cached']);
  now=1_500;
  const value=await source.get('movie:a',async()=>{
    const error=new Error('timeout');
    error.name='AbortError';
    throw error;
  });
  assert.deepEqual(value,['cached']);
});

test('does not mask permanent client failures with stale cache', async () => {
  let now=1_000;
  const source=createResilientSource({retries:0,freshTtlMs:100,staleTtlMs:1_000,now:()=>now});
  await source.get('movie:a',async()=>['cached']);
  now=1_500;
  await assert.rejects(
    source.get('movie:a',async()=>{
      const error=new Error('HTTP 400');
      error.status=400;
      throw error;
    }),
    /HTTP 400/
  );
});

test('deduplicates concurrent requests for the same cache key', async () => {
  let calls=0;
  let release;
  const wait=new Promise(resolve=>{ release=resolve; });
  const source=createResilientSource({retries:0});
  const fetcher=async()=>{ calls+=1; await wait; return ['ok']; };
  const a=source.get('movie:a',fetcher);
  const b=source.get('movie:a',fetcher);
  release();
  const [va,vb]=await Promise.all([a,b]);
  assert.deepEqual(va,['ok']);
  assert.deepEqual(vb,['ok']);
  assert.equal(calls,1);
});
