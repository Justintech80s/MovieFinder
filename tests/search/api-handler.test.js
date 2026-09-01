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

function jwNode({id,title,year,imdb=8,votes=100000}){
  return {
    id,
    objectType:'MOVIE',
    content:{
      title,
      shortDescription:'',
      originalReleaseYear:year,
      fullPath:`/us/movie/${id}`,
      posterUrl:null,
      scoring:{imdbScore:imdb,imdbVotes:votes,tomatoMeter:null}
    },
    offers:[{
      monetizationType:'FLATRATE',
      retailPrice:null,
      retailPriceValue:null,
      currency:'USD',
      presentationType:'HD',
      standardWebURL:`https://example.com/${id}`,
      package:{clearName:'Example Streamer'}
    }]
  };
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

test('exact movie title ranks ahead of unrelated catalog results', async () => {
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async()=>({
    ok:true,
    status:200,
    json:async()=>({
      data:{popularTitles:{edges:[
        {node:jwNode({id:'something-wild',title:'Something Wild',year:1961})},
        {node:jwNode({id:'the-godfather',title:'The Godfather',year:1972,imdb:9.2,votes:2200000})}
      ]}}
    })
  });
  try {
    const res=responseRecorder();
    await handler({query:{q:'Where can I watch The Godfather?'}},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.parsed.titleQuery,'The Godfather');
    assert.equal(res.body.results[0].title,'The Godfather');
    assert.ok(res.body.results[0].matchScore > res.body.results[1].matchScore);
  } finally {
    globalThis.fetch=previousFetch;
  }
});
