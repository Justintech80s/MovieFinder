import test from 'node:test';
import assert from 'node:assert/strict';
import { createRedisCompatibleCache, createCacheKey } from '../../lib/cache/redis-cache.js';

test('cache key is deterministic and namespaces MovieFinder values',()=>{
  assert.equal(createCacheKey('search',['Heat','US',40]),createCacheKey('search',['Heat','US',40]));
  assert.match(createCacheKey('search',['Heat','US',40]),/^moviefinder:search:/);
});

test('cache key normalizes equivalent string parts',()=>{
  assert.equal(createCacheKey('search',['  HEAT  ',' us ']),createCacheKey('search',['heat','US']));
});

test('unconfigured Redis-compatible cache fails open as disabled',()=>{
  const cache=createRedisCompatibleCache({env:{},fetchImpl:async()=>{throw new Error('network')}});
  assert.equal(cache.enabled,false);
});

test('Upstash REST cache stores values with bounded TTL and reads JSON safely',async()=>{
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).includes('/get/')){
      return {ok:true,status:200,json:async()=>({result:JSON.stringify({title:'Heat'})})};
    }
    return {ok:true,status:200,json:async()=>({result:'OK'})};
  };
  const cache=createRedisCompatibleCache({
    env:{UPSTASH_REDIS_REST_URL:'https://redis.example.com',UPSTASH_REDIS_REST_TOKEN:'token'},
    fetchImpl
  });
  await cache.set('moviefinder:test:key',{title:'Heat'},{ttlSeconds:120});
  const value=await cache.get('moviefinder:test:key');
  assert.deepEqual(value,{title:'Heat'});
  const setCall=calls.find(call=>call.url.includes('/set/'));
  assert.match(setCall.url,/\/EX\/120$/);
  assert.ok(!setCall.url.includes('token'));
});

test('local hot cache avoids repeated Redis reads inside the short local TTL',async()=>{
  let reads=0;
  const fetchImpl=async url=>{
    if(String(url).includes('/get/')){
      reads+=1;
      return {ok:true,status:200,json:async()=>({result:JSON.stringify({title:'Heat'})})};
    }
    return {ok:true,status:200,json:async()=>({result:'OK'})};
  };
  const cache=createRedisCompatibleCache({
    env:{UPSTASH_REDIS_REST_URL:'https://redis.example.com',UPSTASH_REDIS_REST_TOKEN:'token'},
    fetchImpl,
    localTtlMs:5000
  });
  assert.deepEqual(await cache.get('same-key'),{title:'Heat'});
  assert.deepEqual(await cache.get('same-key'),{title:'Heat'});
  assert.equal(reads,1);
});

test('concurrent cache reads for the same key share one Redis request',async()=>{
  let reads=0;
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const fetchImpl=async url=>{
    if(String(url).includes('/get/')){
      reads+=1;
      await gate;
      return {ok:true,status:200,json:async()=>({result:JSON.stringify({title:'Heat'})})};
    }
    return {ok:true,status:200,json:async()=>({result:'OK'})};
  };
  const cache=createRedisCompatibleCache({
    env:{UPSTASH_REDIS_REST_URL:'https://redis.example.com',UPSTASH_REDIS_REST_TOKEN:'token'},
    fetchImpl
  });
  const a=cache.get('same-key');
  const b=cache.get('same-key');
  release();
  const [va,vb]=await Promise.all([a,b]);
  assert.deepEqual(va,{title:'Heat'});
  assert.deepEqual(vb,{title:'Heat'});
  assert.equal(reads,1);
});

test('cache network failure returns a miss instead of breaking search',async()=>{
  const cache=createRedisCompatibleCache({
    env:{UPSTASH_REDIS_REST_URL:'https://redis.example.com',UPSTASH_REDIS_REST_TOKEN:'token'},
    fetchImpl:async()=>{throw new Error('redis down')}
  });
  assert.equal(await cache.get('moviefinder:test:key'),null);
  assert.equal(await cache.set('moviefinder:test:key',{ok:true},{ttlSeconds:60}),false);
});

test('availability cache entries cannot outlive their verification freshness TTL',async()=>{
  const calls=[];
  const fetchImpl=async(url)=>{calls.push(String(url));return {ok:true,status:200,json:async()=>({result:'OK'})};};
  const cache=createRedisCompatibleCache({
    env:{UPSTASH_REDIS_REST_URL:'https://redis.example.com',UPSTASH_REDIS_REST_TOKEN:'token'},
    fetchImpl
  });
  await cache.setAvailability('heat-us',{offers:[{provider:'Max'}]},{ttlSeconds:900});
  const setCall=calls.find(url=>url.includes('/set/'));
  assert.match(setCall,/\/EX\/300$/);
});
