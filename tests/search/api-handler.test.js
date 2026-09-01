import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/search.js';

function responseRecorder(){
  return {
    statusCode:200,
    body:null,
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;return this;}
  };
}

function jwNode({id,title,year,imdb=8,votes=100000,rt=null,genres=[],provider='Example Streamer',type='FLATRATE'}){
  return {
    id,
    objectType:'MOVIE',
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
    onRequest(JSON.parse(options.body));
    return {ok:true,status:200,json:async()=>({data:{popularTitles:{edges}}})};
  };
  try {
    const res=responseRecorder();
    await handler({query:{q:query}},res);
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
    await handler({query:{q:'Where can I watch The Godfather?'}},res);
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
