import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchHandler } from '../../api/search.js';

function responseRecorder(){
  const headers=new Map();
  return {
    statusCode:200,
    body:null,
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;return this;},
    setHeader(name,value){headers.set(name.toLowerCase(),value);return this;},
    getHeader(name){return headers.get(name.toLowerCase());}
  };
}

function jwNode({id='movie-1',title='The Godfather',year=1972,offerUrl=null}){
  return {
    id,
    objectType:'MOVIE',
    content:{title,shortDescription:'',originalReleaseYear:year,fullPath:`/us/movie/${id}`,posterUrl:null,genres:[],scoring:{imdbScore:9.2,imdbVotes:1000000,tomatoMeter:97}},
    offers:offerUrl?[{monetizationType:'RENT',retailPrice:null,retailPriceValue:3.99,currency:'USD',presentationType:'HD',standardWebURL:offerUrl,package:{clearName:'Prime Video'}}]:[]
  };
}

async function withFetch(fetchImpl,fn){
  const previous=globalThis.fetch;
  globalThis.fetch=fetchImpl;
  try{return await fn();}finally{globalThis.fetch=previous;}
}

function request(query){
  return {query:{q:query},headers:{cookie:'mf_vid=v1; mf_sid=s1'}};
}

const now=()=>new Date('2026-09-01T12:00:00Z');

test('successful catalog search records one anonymous search_completed event', async () => {
  const events=[];
  const handler=createSearchHandler({analyticsStore:{insertEvent:async event=>{events.push(event);return true;}},analyticsSecret:'test-secret',now,logger:{warn:()=>{}}});
  await withFetch(async()=>({ok:true,status:200,json:async()=>({data:{popularTitles:{edges:[{node:jwNode({})}]}}})}),async()=>{
    const res=responseRecorder();
    await handler(request('The Godfather'),res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.results[0].title,'The Godfather');
    assert.equal(events.length,1);
    assert.equal(events[0].event_type,'search_completed');
    assert.equal(events[0].result_count,1);
    assert.equal(events[0].query_text,'The Godfather');
  });
});

test('valid search with no usable results records search_no_results', async () => {
  const events=[];
  const handler=createSearchHandler({analyticsStore:{insertEvent:async event=>{events.push(event);return true;}},analyticsSecret:'test-secret',now,logger:{warn:()=>{}}});
  await withFetch(async()=>({ok:true,status:200,json:async()=>({data:{popularTitles:{edges:[]}}})}),async()=>{
    const res=responseRecorder();
    await handler(request('Unknown Movie'),res);
    assert.equal(res.statusCode,200);
    assert.deepEqual(res.body.results,[]);
    assert.equal(events.length,1);
    assert.equal(events[0].event_type,'search_no_results');
  });
});

test('availability source failure records controlled search_failed code', async () => {
  const events=[];
  const handler=createSearchHandler({analyticsStore:{insertEvent:async event=>{events.push(event);return true;}},analyticsSecret:'test-secret',now,logger:{warn:()=>{}}});
  await withFetch(async()=>({ok:false,status:503,json:async()=>({})}),async()=>{
    const res=responseRecorder();
    await handler(request('The Godfather'),res);
    assert.equal(res.statusCode,503);
    assert.equal(events.length,1);
    assert.equal(events[0].event_type,'search_failed');
    assert.equal(events[0].error_code,'availability_unavailable');
  });
});

test('analytics write failure never changes a successful search response', async () => {
  const handler=createSearchHandler({analyticsStore:{insertEvent:async()=>{throw new Error('database unavailable');}},analyticsSecret:'test-secret',now,logger:{warn:()=>{}}});
  await withFetch(async()=>({ok:true,status:200,json:async()=>({data:{popularTitles:{edges:[{node:jwNode({})}]}}})}),async()=>{
    const res=responseRecorder();
    await handler(request('The Godfather'),res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.results[0].title,'The Godfather');
  });
});

test('configured outbound secret replaces provider URL with signed MovieFinder redirect', async () => {
  const handler=createSearchHandler({analyticsStore:{insertEvent:async()=>true},analyticsSecret:'test-secret',outboundSecret:'outbound-secret',now,logger:{warn:()=>{}}});
  await withFetch(async()=>({ok:true,status:200,json:async()=>({data:{popularTitles:{edges:[{node:jwNode({offerUrl:'https://example.com/rent'})}]}}})}),async()=>{
    const res=responseRecorder();
    await handler(request('The Godfather'),res);
    assert.equal(res.statusCode,200);
    assert.match(res.body.results[0].offers[0].url,/^\/api\/out\?token=/);
    assert.match(res.body.results[0].best.url,/^\/api\/out\?token=/);
  });
});
