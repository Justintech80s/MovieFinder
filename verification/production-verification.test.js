import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../lib/search/intent.js';
import { matchesHardConstraints } from '../lib/search/constraints.js';
import { createHybridRetriever } from '../lib/search/hybrid-retriever.js';
import { assessSearchQuality, chooseVerifiedResponse } from '../lib/search/verification-retry.js';
import { createRedisCompatibleCache, createCacheKey } from '../lib/cache/redis-cache.js';

const queryMatrix=[
  ['Horror RT 90+ rent <$5', intent => intent.kind==='discovery' && intent.genreWords.includes('horror') && intent.rtMin===90 && intent.rentOnly && intent.maxPrice===5],
  ['1994 crime movies', intent => intent.kind==='discovery' && intent.yearMin===1994 && intent.yearMax===1994 && intent.genreWords.includes('crime')],
  ['movies directed by Christopher Nolan', intent => intent.kind==='person-filmography' && intent.role==='director' && intent.personName==='Christopher Nolan'],
  ['all Will Smith movies available on streaming', intent => intent.kind==='person-filmography' && intent.role==='all' && intent.filmographyView==='available'],
  ['comedy TV shows on Hulu', intent => intent.kind==='discovery' && intent.mediaType==='SHOW' && intent.provider==='Hulu'],
  ['free action movies', intent => intent.kind==='discovery' && intent.genreWords.includes('action') && intent.freeOnly],
  ['movies like Heat', intent => intent.similarityTitle==='Heat' && intent.mediaType==='MOVIE'],
  ['popular sci-fi films', intent => intent.kind==='discovery' && intent.rankingIntent==='popular' && intent.genreWords.includes('sci-fi')]
];

test('production accuracy matrix parses difficult natural-language queries',()=>{
  for(const [query,check] of queryMatrix){
    const intent=parseIntent(query);
    assert.equal(check(intent),true,`${query} parsed incorrectly: ${JSON.stringify(intent)}`);
  }
});

test('production hard constraints reject wrong provider price rating year and genre',()=>{
  const intent=parseIntent('1994 horror RT 90 rent <$5 on Amazon Prime');
  const valid={
    title:'Verified Movie',year:1994,mediaType:'MOVIE',genres:['Horror'],ratings:{rottenTomatoes:94},
    offers:[{provider:'Prime Video',type:'RENT',price:4.99,currency:'USD'}]
  };
  assert.equal(matchesHardConstraints(valid,intent),true);
  assert.equal(matchesHardConstraints({...valid,year:1995},intent),false);
  assert.equal(matchesHardConstraints({...valid,genres:['Comedy']},intent),false);
  assert.equal(matchesHardConstraints({...valid,ratings:{rottenTomatoes:88}},intent),false);
  assert.equal(matchesHardConstraints({...valid,offers:[{provider:'Prime Video',type:'RENT',price:5.99,currency:'USD'}]},intent),false);
  assert.equal(matchesHardConstraints({...valid,offers:[{provider:'Netflix',type:'RENT',price:4.99,currency:'USD'}]},intent),false);
});

test('production hybrid retrieval favors multi-source semantic consensus',async()=>{
  const retriever=createHybridRetriever({
    exactSearch:async()=>[{id:'m1',title:'Literal',year:2000}],
    fullTextSearch:async()=>[{id:'m2',title:'Consensus',year:2001,fullTextScore:.92}],
    semanticSearch:async()=>[
      {id:'m2',title:'Consensus',year:2001,semanticScore:.96},
      {id:'m3',title:'Semantic Only',year:2002,semanticScore:.99}
    ],
    graphSearch:async()=>[{id:'m2',title:'Consensus',year:2001,graphScore:.9}]
  });
  const results=await retriever.search({query:'paranoid crime films like Heat',parsedIntent:{kind:'discovery'}});
  assert.equal(results[0].id,'m2');
  assert.deepEqual(results[0].retrievalSources,['fulltext','semantic','graph']);
  assert.ok(results[0].retrievalScore>results.find(item=>item.id==='m3').retrievalScore);
});

test('production verification retry uses stronger fallback but never downgrades a strong response',()=>{
  const intent={kind:'discovery',provider:'Netflix'};
  const weak={parsed:intent,reasoningMode:'hybrid',results:[{id:'m1',title:'Weak',retrievalScore:.1,retrievalSources:['semantic'],offers:[]}]};
  const strong={parsed:intent,reasoningMode:'deterministic',results:[{id:'m2',title:'Strong',matchScore:.9,offers:[{provider:'Netflix',type:'FLATRATE'}]}]};
  assert.equal(assessSearchQuality({parsedIntent:intent,results:weak.results}).retry,true);
  const upgraded=chooseVerifiedResponse(weak,strong,{parsedIntent:intent});
  assert.equal(upgraded.results[0].title,'Strong');
  assert.equal(upgraded.verificationRetry.used,true);
  const preserved=chooseVerifiedResponse(strong,{...weak,results:[]},{parsedIntent:intent});
  assert.equal(preserved.results[0].title,'Strong');
  assert.equal(preserved.verificationRetry.used,false);
});

test('production cache collapses a 100-request same-key burst to one upstream read',async()=>{
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
    fetchImpl,
    localTtlMs:5000
  });
  const key=createCacheKey('stress',['Heat','US']);
  const burst=Array.from({length:100},()=>cache.get(key));
  release();
  const values=await Promise.all(burst);
  assert.equal(reads,1);
  assert.equal(values.length,100);
  assert.ok(values.every(value=>value?.title==='Heat'));
});

test('production cache and upstream parsing fail open on malformed responses',async()=>{
  const cache=createRedisCompatibleCache({
    env:{UPSTASH_REDIS_REST_URL:'https://redis.example.com',UPSTASH_REDIS_REST_TOKEN:'token'},
    fetchImpl:async()=>({ok:true,status:200,json:async()=>({result:'not-json'})})
  });
  assert.equal(await cache.get('moviefinder:bad:value'),null);
});
