import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchHandler } from '../../api/search.js';

function responseRecorder(){
  const headers={};
  return {
    statusCode:200,
    body:null,
    headers,
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;return this;},
    setHeader(name,value){headers[String(name).toLowerCase()]=String(value);return this;},
    end(){return this;}
  };
}

function request({method='GET',q='The Godfather',headers={}}={}){
  return {method,query:{q},headers,socket:{remoteAddress:'203.0.113.10'}};
}

function quietStore(){
  return {enabled:false,insertEvent:async()=>false};
}

test('search rejects unsupported methods before upstream network work', async()=>{
  let fetchCalls=0;
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async()=>{fetchCalls++;throw new Error('network should not run');};
  try{
    const handler=createSearchHandler({analyticsStore:quietStore()});
    const res=responseRecorder();
    await handler(request({method:'POST'}),res);
    assert.equal(res.statusCode,405);
    assert.equal(fetchCalls,0);
    assert.equal(res.headers.allow,'GET');
  } finally { globalThis.fetch=previousFetch; }
});

test('search rejects oversized queries before upstream network work', async()=>{
  let fetchCalls=0;
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async()=>{fetchCalls++;throw new Error('network should not run');};
  try{
    const handler=createSearchHandler({analyticsStore:quietStore()});
    const res=responseRecorder();
    await handler(request({q:'x'.repeat(1001)}),res);
    assert.equal(res.statusCode,400);
    assert.equal(res.body.code,'INVALID_QUERY');
    assert.equal(fetchCalls,0);
  } finally { globalThis.fetch=previousFetch; }
});

test('search applies defensive API response headers', async()=>{
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({data:{popularTitles:{edges:[]}}})});
  try{
    const handler=createSearchHandler({analyticsStore:quietStore()});
    const res=responseRecorder();
    await handler(request(),res);
    assert.equal(res.headers['x-content-type-options'],'nosniff');
    assert.equal(res.headers['referrer-policy'],'no-referrer');
    assert.equal(res.headers['x-frame-options'],'DENY');
  } finally { globalThis.fetch=previousFetch; }
});

test('search enforces an injectable abuse limiter before upstream work', async()=>{
  let fetchCalls=0;
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async()=>{fetchCalls++;return {ok:true,status:200,json:async()=>({data:{popularTitles:{edges:[]}}})};};
  try{
    const rateLimiter={consume:()=>({allowed:false,retryAfterSeconds:30})};
    const handler=createSearchHandler({analyticsStore:quietStore(),rateLimiter});
    const res=responseRecorder();
    await handler(request(),res);
    assert.equal(res.statusCode,429);
    assert.equal(res.body.code,'RATE_LIMITED');
    assert.equal(res.headers['retry-after'],'30');
    assert.equal(fetchCalls,0);
  } finally { globalThis.fetch=previousFetch; }
});

test('search bounds JustWatch requests with an AbortSignal', async()=>{
  let signal=null;
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async(_url,options)=>{
    signal=options.signal;
    return {ok:true,status:200,json:async()=>({data:{popularTitles:{edges:[]}}})};
  };
  try{
    const handler=createSearchHandler({analyticsStore:quietStore()});
    const res=responseRecorder();
    await handler(request(),res);
    assert.ok(signal instanceof AbortSignal);
  } finally { globalThis.fetch=previousFetch; }
});

test('search never exposes internal upstream error detail to clients', async()=>{
  const secret='provider-secret-that-must-not-leak';
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error(`availability source failed ${secret}`);};
  try{
    const handler=createSearchHandler({analyticsStore:quietStore(),logger:{warn(){},error(){}}});
    const res=responseRecorder();
    await handler(request(),res);
    assert.equal(res.statusCode,503);
    assert.equal(res.body.code,'AVAILABILITY_UNAVAILABLE');
    assert.equal(JSON.stringify(res.body).includes(secret),false);
    assert.equal(Object.hasOwn(res.body,'detail'),false);
  } finally { globalThis.fetch=previousFetch; }
});
