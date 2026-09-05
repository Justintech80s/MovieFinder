import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { createSearchHandler, selectAvailabilityMatch } from '../../api/search.js';

function responseRecorder(){
  return {
    statusCode:200,
    body:null,
    headers:{},
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;return this;}
  };
}

function jwNode({id,title,year,imdb=8,votes=100000,rt=null,genres=[],provider='Example Streamer',type='FLATRATE',objectType='MOVIE'}){
  return {
    id,
    objectType,
    content:{
      title,
      shortDescription:'',
      originalReleaseYear:year,
      fullPath:`/us/movie/${id}`,
      posterUrl:null,
      genres:genres.map(shortName=>({shortName})),
      scoring:{imdbScore:imdb,imdbVotes:votes,tomatoMeter:rt}
    },
    offers:[{
      monetizationType:type,
      retailPrice:null,
      retailPriceValue:null,
      currency:'USD',
      presentationType:'HD',
      standardWebURL:`https://example.com/${id}`,
      package:{clearName:provider}
    }]
  };
}

async function withCatalog(edges,query,onRequest=()=>{}){
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async(_url,options)=>{
    const requestBody=JSON.parse(options.body);
    if(requestBody.variables?.search!==undefined) onRequest(requestBody);
    return {ok:true,status:200,json:async()=>({data:{popularTitles:{edges}}})};
  };
  try {
    const res=responseRecorder();
    await handler({method:'GET',query:{q:query},headers:{}},res);
    return res;
  } finally {
    globalThis.fetch=previousFetch;
  }
}

test('generic search returns a controlled availability-unavailable response for upstream HTTP failure', async () => {
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async()=>({ok:false,status:503,json:async()=>({})});
  try {
    const res=responseRecorder();
    await handler({method:'GET',query:{q:'Where can I watch The Godfather?'},headers:{}},res);
    assert.equal(res.statusCode,503);
    assert.equal(res.body.code,'AVAILABILITY_UNAVAILABLE');
    assert.match(res.body.error,/availability/i);
  } finally {
    globalThis.fetch=previousFetch;
  }
});

test('plain exact movie title is sent upstream unchanged and ranks first', async () => {
  let upstreamSearch=null;
  const res=await withCatalog([
    {node:jwNode({id:'something-wild',title:'Something Wild',year:1961})},
    {node:jwNode({id:'the-godfather',title:'The Godfather',year:1972,imdb:9.2,votes:2200000})}
  ],'The Godfather',body=>{upstreamSearch=body.variables.search;});
  assert.equal(res.statusCode,200);
  assert.equal(upstreamSearch,'The Godfather');
  assert.equal(res.body.parsed.titleQuery,'The Godfather');
  assert.equal(res.body.results[0].title,'The Godfather');
});

test('free suffix is removed from title before upstream search', async () => {
  let upstreamSearch=null;
  const res=await withCatalog([
    {node:jwNode({id:'star-wars',title:'Star Wars',year:1977,provider:'Tubi',type:'ADS'})}
  ],'Star Wars free',body=>{upstreamSearch=body.variables.search;});
  assert.equal(res.statusCode,200);
  assert.equal(upstreamSearch,'Star Wars');
  assert.equal(res.body.parsed.titleQuery,'Star Wars');
  assert.deepEqual(res.body.results.map(x=>x.title),['Star Wars']);
});

test('generic API enforces exact-year and genre constraints before ranking', async () => {
  const res=await withCatalog([
    {node:jwNode({id:'crime-1994',title:'Crime 1994',year:1994,genres:['Crime']})},
    {node:jwNode({id:'crime-1995',title:'Crime 1995',year:1995,genres:['Crime']})},
    {node:jwNode({id:'comedy-1994',title:'Comedy 1994',year:1994,genres:['Comedy']})}
  ],'1994 crime movies');
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body.results.map(x=>x.title),['Crime 1994']);
});

test('generic API enforces Rotten Tomatoes threshold with inferred horror genre', async () => {
  const res=await withCatalog([
    {node:jwNode({id:'great-horror',title:'Great Horror',year:2024,rt:95,genres:['Horror']})},
    {node:jwNode({id:'low-horror',title:'Low Horror',year:2024,rt:88,genres:['Horror']})},
    {node:jwNode({id:'great-drama',title:'Great Drama',year:2024,rt:98,genres:['Drama']})}
  ],'scary movies Rotten Tomatoes 90%+');
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body.results.map(x=>x.title),['Great Horror']);
});

test('API delegates validated searches to the live orchestrator while preserving response compatibility', async () => {
  const calls=[];
  const liveOrchestrator={
    async search(input){
      calls.push(input);
      return {
        parsed:input.parsedIntent,
        results:[{id:'graph-1',title:'Verified Graph Movie',year:1974,offers:[]}],
        reasoningMode:'graph+ai',
        answer:'Verified explanation',
        evidence:{movies:[{id:'graph-1',title:'Verified Graph Movie',year:1974}]},
        ai:{provider:'openai',model:'test-model'}
      };
    }
  };
  const searchHandler=createSearchHandler({
    liveOrchestrator,
    analyticsStore:{insert:async()=>true},
    analyticsSecret:'test-analytics-secret',
    outboundSecret:null,
    rateLimiter:{consume:async()=>({allowed:true})},
    logger:{warn(){}}
  });
  const res=responseRecorder();

  await searchHandler({method:'GET',query:{q:'1970s paranoid thrillers influenced by European cinema'},headers:{}},res);

  assert.equal(res.statusCode,200);
  assert.equal(calls.length,1);
  assert.equal(calls[0].query,'1970s paranoid thrillers influenced by European cinema');
  assert.equal(calls[0].parsedIntent.concepts.length>0,true);
  assert.equal(res.body.results[0].title,'Verified Graph Movie');
  assert.equal(res.body.reasoningMode,'graph+ai');
  assert.equal(res.body.answer,'Verified explanation');
  assert.deepEqual(res.body.ai,{provider:'openai',model:'test-model'});
  assert.ok(res.body.liveAt);
  assert.equal(res.headers['x-content-type-options'],'nosniff');
});

test('default API resolves a movies-like query through the configured graph store factory', async () => {
  let factoryCalls=0;
  let findCalls=0;
  let traverseCalls=0;
  const graphStore={
    async findMovieByTitle(title){
      findCalls+=1;
      assert.equal(title,'The Conversation');
      return {id:'movie:conversation',type:'Movie',name:'The Conversation',properties:{year:1974}};
    },
    async getNode(id){
      assert.equal(id,'movie:conversation');
      return {id:'movie:conversation',type:'Movie',name:'The Conversation',properties:{year:1974}};
    },
    async traverse(startId){
      traverseCalls+=1;
      assert.equal(startId,'movie:conversation');
      return [];
    }
  };
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async(_url,options)=>{
    const body=JSON.parse(options.body);
    assert.equal(body.variables.search,'The Conversation');
    return {ok:true,status:200,json:async()=>({data:{popularTitles:{edges:[
      {node:jwNode({id:'the-conversation',title:'The Conversation',year:1974,provider:'Max'})}
    ]}}})};
  };
  try {
    const searchHandler=createSearchHandler({
      graphStoreFactory(){factoryCalls+=1;return graphStore;},
      analyticsStore:{enabled:false,insertEvent:async()=>false},
      rateLimiter:{consume:()=>({allowed:true})},
      modelRouter:{async run(){throw new Error('AI should not be required for graph verification');}},
      logger:{warn(){},error(){}}
    });
    const res=responseRecorder();

    await searchHandler({method:'GET',query:{q:'movies like The Conversation with surveillance themes'},headers:{}},res);

    assert.equal(res.statusCode,200);
    assert.equal(factoryCalls,1);
    assert.equal(findCalls,1);
    assert.equal(traverseCalls,1);
    assert.equal(res.body.parsed.similarityTitle,'The Conversation');
    assert.equal(res.body.reasoningMode,'graph');
    assert.equal(res.body.results[0].title,'The Conversation');
  } finally {
    globalThis.fetch=previousFetch;
  }
});


test('exact title search suppresses loose title variants when an exact match exists', async () => {
  const res=await withCatalog([
    {node:jwNode({id:'inception',title:'Inception',year:2010})},
    {node:jwNode({id:'bikini-inception',title:'Bikini Inception',year:2015})},
    {node:jwNode({id:'crack-inception',title:'The Crack: Inception',year:2019})}
  ],'Inception');
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body.results.map(x=>x.title),['Inception']);
});


test('filmography availability matching prefers the verified release-year identity', () => {
  const credit={title:'The Thing',year:1982,workId:'Q1'};
  const match=selectAvailabilityMatch(credit,[
    {id:'remake',title:'The Thing',year:2011,mediaType:'MOVIE',offers:[{provider:'Max',type:'FLATRATE'}]},
    {id:'original',title:'The Thing',year:1982,mediaType:'MOVIE',offers:[{provider:'Peacock',type:'FLATRATE'}]}
  ]);
  assert.equal(match?.id,'original');
});

test('filmography availability matching refuses a same-title remake when credit year disagrees', () => {
  const credit={title:'The Thing',year:1982,workId:'Q1'};
  const match=selectAvailabilityMatch(credit,[
    {id:'remake',title:'The Thing',year:2011,mediaType:'MOVIE',offers:[{provider:'Max',type:'FLATRATE'}]}
  ]);
  assert.equal(match,null);
});

test('filmography availability matching normalizes punctuation in verified titles', () => {
  const credit={title:'Once Upon a Time… in Hollywood',year:2019,workId:'Q1'};
  const match=selectAvailabilityMatch(credit,[
    {id:'movie',title:'Once Upon a Time in Hollywood',year:2019,mediaType:'MOVIE',offers:[]}
  ]);
  assert.equal(match?.id,'movie');
});


test('explicit TV-show search prefers the series over a same-name movie', async () => {
  const res=await withCatalog([
    {node:jwNode({id:'office-movie',title:'The Office',year:2015,objectType:'MOVIE'})},
    {node:jwNode({id:'office-show',title:'The Office',year:2005,objectType:'SHOW',provider:'Peacock'})}
  ],'The Office TV show');
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body.results.map(x=>x.id),['office-show']);
  assert.equal(res.body.results[0].mediaType,'SHOW');
  assert.equal(res.body.results[0].availabilityScope,'SERIES');
});

test('season-specific TV query preserves series identity but marks season availability unverified', async () => {
  let upstreamSearch=null;
  const res=await withCatalog([
    {node:jwNode({id:'office-show',title:'The Office',year:2005,objectType:'SHOW',provider:'Peacock'})}
  ],'The Office season 2',body=>{upstreamSearch=body.variables.search;});
  assert.equal(res.statusCode,200);
  assert.equal(upstreamSearch,'The Office');
  assert.equal(res.body.parsed.requestedSeason,2);
  assert.equal(res.body.results[0].mediaType,'SHOW');
  assert.equal(res.body.results[0].requestedSeason,2);
  assert.equal(res.body.results[0].seasonAvailabilityStatus,'UNKNOWN');
  assert.deepEqual(res.body.results[0].seasonOffers,[]);
});


test('episode-specific TV query never promotes series offers to verified episode availability', async () => {
  let upstreamSearch=null;
  const res=await withCatalog([
    {node:jwNode({id:'office-show',title:'The Office',year:2005,objectType:'SHOW',provider:'Peacock'})}
  ],'The Office season 2 episode 1',body=>{upstreamSearch=body.variables.search;});
  assert.equal(res.statusCode,200);
  assert.equal(upstreamSearch,'The Office');
  assert.equal(res.body.parsed.requestedSeason,2);
  assert.equal(res.body.parsed.requestedEpisode,1);
  assert.equal(res.body.results[0].requestedEpisode,1);
  assert.equal(res.body.results[0].episodeAvailabilityStatus,'UNKNOWN');
  assert.deepEqual(res.body.results[0].episodeOffers,[]);
});


test('season lookup attaches only verified season offers when upstream exposes season data', async () => {
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async(_url,options)=>{
    const body=JSON.parse(options.body);
    if(body.query.includes('GetTitleSeasons')){
      return {ok:true,status:200,json:async()=>({data:{node:{
        seasons:[{seasonNumber:2,offers:[{monetizationType:'FLATRATE',standardWebURL:'https://example.com/office-s2',package:{clearName:'Peacock'}}]}]
      }}})};
    }
    return {ok:true,status:200,json:async()=>({data:{popularTitles:{edges:[
      {node:jwNode({id:'office-show',title:'The Office',year:2005,objectType:'SHOW',provider:'Peacock'})}
    ]}}})};
  };
  try{
    const res=responseRecorder();
    await handler({method:'GET',query:{q:'The Office season 2'},headers:{}},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.results[0].seasonAvailabilityStatus,'VERIFIED');
    assert.deepEqual(res.body.results[0].seasonOffers.map(x=>x.provider),['Peacock']);
  }finally{globalThis.fetch=previousFetch;}
});

test('season lookup keeps UNKNOWN when upstream cannot expose season-specific data', async () => {
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async(_url,options)=>{
    const body=JSON.parse(options.body);
    if(body.query.includes('GetTitleSeasons')) return {ok:true,status:200,json:async()=>({data:{node:{seasons:[]}}})};
    return {ok:true,status:200,json:async()=>({data:{popularTitles:{edges:[
      {node:jwNode({id:'office-show',title:'The Office',year:2005,objectType:'SHOW',provider:'Peacock'})}
    ]}}})};
  };
  try{
    const res=responseRecorder();
    await handler({method:'GET',query:{q:'The Office season 99'},headers:{}},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.results[0].seasonAvailabilityStatus,'UNKNOWN');
    assert.deepEqual(res.body.results[0].seasonOffers,[]);
  }finally{globalThis.fetch=previousFetch;}
});


test('episode lookup attaches only verified exact-episode offers', async () => {
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async(_url,options)=>{
    const body=JSON.parse(options.body);
    if(body.query.includes('GetTitleEpisodes')){
      return {ok:true,status:200,json:async()=>({data:{node:{
        seasons:[{seasonNumber:2,episodes:[
          {episodeNumber:1,offers:[{monetizationType:'FLATRATE',standardWebURL:'https://example.com/office-s2e1',package:{clearName:'Peacock'}}]},
          {episodeNumber:2,offers:[{monetizationType:'BUY',standardWebURL:'https://example.com/office-s2e2',package:{clearName:'Apple TV Store'}}]}
        ]}]
      }}})};
    }
    if(body.query.includes('GetTitleSeasons')) return {ok:true,status:200,json:async()=>({data:{node:{seasons:[]}}})};
    return {ok:true,status:200,json:async()=>({data:{popularTitles:{edges:[
      {node:jwNode({id:'office-show',title:'The Office',year:2005,objectType:'SHOW',provider:'Peacock'})}
    ]}}})};
  };
  try{
    const res=responseRecorder();
    await handler({method:'GET',query:{q:'The Office season 2 episode 1'},headers:{}},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.results[0].episodeAvailabilityStatus,'VERIFIED');
    assert.deepEqual(res.body.results[0].episodeOffers.map(x=>x.provider),['Peacock']);
  }finally{globalThis.fetch=previousFetch;}
});

test('episode lookup keeps UNKNOWN for nonexistent exact episode', async () => {
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async(_url,options)=>{
    const body=JSON.parse(options.body);
    if(body.query.includes('GetTitleEpisodes')){
      return {ok:true,status:200,json:async()=>({data:{node:{seasons:[{seasonNumber:2,episodes:[{episodeNumber:1,offers:[]}]}]}}})};
    }
    if(body.query.includes('GetTitleSeasons')) return {ok:true,status:200,json:async()=>({data:{node:{seasons:[]}}})};
    return {ok:true,status:200,json:async()=>({data:{popularTitles:{edges:[
      {node:jwNode({id:'office-show',title:'The Office',year:2005,objectType:'SHOW',provider:'Peacock'})}
    ]}}})};
  };
  try{
    const res=responseRecorder();
    await handler({method:'GET',query:{q:'The Office season 2 episode 99'},headers:{}},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.results[0].episodeAvailabilityStatus,'UNKNOWN');
    assert.deepEqual(res.body.results[0].episodeOffers,[]);
  }finally{globalThis.fetch=previousFetch;}
});

test('episode lookup applies requested provider constraints to exact-episode offers', async () => {
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async(_url,options)=>{
    const body=JSON.parse(options.body);
    if(body.query.includes('GetTitleEpisodes')){
      return {ok:true,status:200,json:async()=>({data:{node:{seasons:[{seasonNumber:2,episodes:[{episodeNumber:1,offers:[
        {monetizationType:'FLATRATE',standardWebURL:'https://example.com/peacock',package:{clearName:'Peacock'}},
        {monetizationType:'BUY',standardWebURL:'https://example.com/apple',package:{clearName:'Apple TV Store'}}
      ]}]}]}}})};
    }
    if(body.query.includes('GetTitleSeasons')) return {ok:true,status:200,json:async()=>({data:{node:{seasons:[]}}})};
    return {ok:true,status:200,json:async()=>({data:{popularTitles:{edges:[
      {node:jwNode({id:'office-show',title:'The Office',year:2005,objectType:'SHOW',provider:'Peacock'})}
    ]}}})};
  };
  try{
    const res=responseRecorder();
    await handler({method:'GET',query:{q:'The Office season 2 episode 1 on Peacock'},headers:{}},res);
    assert.equal(res.statusCode,200);
    assert.deepEqual(res.body.results[0].episodeOffers.map(x=>x.provider),['Peacock']);
  }finally{globalThis.fetch=previousFetch;}
});

test('episode lookup upstream failure stays UNKNOWN and does not borrow season offers', async () => {
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async(_url,options)=>{
    const body=JSON.parse(options.body);
    if(body.query.includes('GetTitleEpisodes')) return {ok:false,status:503,json:async()=>({})};
    if(body.query.includes('GetTitleSeasons')) return {ok:true,status:200,json:async()=>({data:{node:{seasons:[{seasonNumber:2,offers:[{monetizationType:'FLATRATE',package:{clearName:'Peacock'}}]}]}}})};
    return {ok:true,status:200,json:async()=>({data:{popularTitles:{edges:[
      {node:jwNode({id:'office-show',title:'The Office',year:2005,objectType:'SHOW',provider:'Peacock'})}
    ]}}})};
  };
  try{
    const res=responseRecorder();
    await handler({method:'GET',query:{q:'The Office season 2 episode 1'},headers:{}},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.results[0].seasonAvailabilityStatus,'VERIFIED');
    assert.equal(res.body.results[0].episodeAvailabilityStatus,'UNKNOWN');
    assert.deepEqual(res.body.results[0].episodeOffers,[]);
  }finally{globalThis.fetch=previousFetch;}
});


test('search handler consumes environment-driven rate limit settings', async () => {
  const searchHandler=createSearchHandler({
    env:{SEARCH_RATE_LIMIT:'1',SEARCH_RATE_WINDOW_MS:'60000'},
    liveOrchestrator:{async search({parsedIntent}){return {parsed:parsedIntent,results:[]};}},
    analyticsStore:{enabled:false,insertEvent:async()=>false},
    logger:{warn(){}}
  });
  const first=responseRecorder();
  await searchHandler({method:'GET',query:{q:'Inception'},headers:{},socket:{remoteAddress:'1.2.3.4'}},first);
  assert.equal(first.statusCode,200);

  const second=responseRecorder();
  await searchHandler({method:'GET',query:{q:'The Godfather'},headers:{},socket:{remoteAddress:'1.2.3.4'}},second);
  assert.equal(second.statusCode,429);
  assert.equal(second.body.code,'RATE_LIMITED');
});

test('invalid runtime search configuration fails safely without exposing env values', async () => {
  const searchHandler=createSearchHandler({
    env:{SEARCH_RATE_LIMIT:'bad-secret-value'},
    liveOrchestrator:{async search(){throw new Error('should not execute');}},
    analyticsStore:{enabled:false,insertEvent:async()=>false},
    logger:{warn(){}}
  });
  const res=responseRecorder();
  await searchHandler({method:'GET',query:{q:'Inception'},headers:{}},res);
  assert.equal(res.statusCode,503);
  assert.equal(res.body.code,'BACKEND_MISCONFIGURED');
  assert.doesNotMatch(JSON.stringify(res.body),/bad-secret-value/);
});


test('default production orchestrator uses configured Postgres full-text candidates for discovery', async () => {
  let fullTextCalls=0;
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async(_url,options)=>{
    const body=JSON.parse(options.body);
    const search=body.variables?.search;
    const edges=search==='Heat'
      ? [{node:jwNode({id:'heat-live',title:'Heat',year:1995,provider:'Max'})}]
      : [];
    return {ok:true,status:200,json:async()=>({data:{popularTitles:{edges}}})};
  };
  try{
    const searchHandler=createSearchHandler({
      env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret'},
      graphStoreFactory:()=>null,
      hybridSearchFactory:()=>({
        async fullTextSearch(){
          fullTextCalls+=1;
          return [{id:'db-heat',title:'Heat',year:1995,mediaType:'MOVIE',description:'Crime drama'}];
        }
      }),
      modelRouter:{async run(){throw new Error('AI optional');}},
      analyticsStore:{enabled:false,insertEvent:async()=>false},
      rateLimiter:{consume:()=>({allowed:true})},
      logger:{warn(){}}
    });
    const res=responseRecorder();
    await searchHandler({method:'GET',query:{q:'movies like Heat with crime themes'},headers:{}},res);
    assert.equal(res.statusCode,200);
    assert.equal(fullTextCalls,1);
    assert.match(res.body.reasoningMode,/^hybrid/);
    assert.equal(res.body.results[0].title,'Heat');
  }finally{
    globalThis.fetch=previousFetch;
  }
});
