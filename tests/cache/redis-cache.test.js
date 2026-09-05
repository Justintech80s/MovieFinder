import test from 'node:test';
import assert from 'node:assert/strict';
import { createRedisCompatibleCache, createCacheKey } from '../../lib/cache/redis-cache.js';

test('cache key is deterministic and namespaces MovieFinder values',()=>{
  assert.equal(createCacheKey('search',['Heat','US',40]),createCacheKey('search',['Heat','US',40]));
  assert.match(createCacheKey('search',['Heat','US',40]),/^moviefinder:search:/);
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
