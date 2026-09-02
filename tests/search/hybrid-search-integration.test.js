import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/search.js';

const responseRecorder=()=>({statusCode:200,body:null,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}});
function node(id,title,provider='Netflix') {return {id,objectType:'MOVIE',content:{title,shortDescription:'crime drama',originalReleaseYear:1995,fullPath:`/us/movie/${id}`,posterUrl:null,genres:[{shortName:'Crime'}],scoring:{imdbScore:8,imdbVotes:1000,tomatoMeter:90}},offers:[{monetizationType:'FLATRATE',retailPrice:null,retailPriceValue:null,currency:'USD',presentationType:'HD',standardWebURL:`https://example.com/${id}`,package:{clearName:provider}}]};}
async function search(query,items){const old=globalThis.fetch;globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({data:{popularTitles:{edges:items.map(x=>({node:x}))}}})});try{const res=responseRecorder();await handler({query:{q:query}},res);return res;}finally{globalThis.fetch=old;}}

test('catalog API exposes additive Hybrid Search metadata',async()=>{
 const res=await search('Heat',[node('heat','Heat'),node('heatwave','Heatwave')]);
 assert.equal(res.statusCode,200);
 assert.equal(res.body.searchMode,'hybrid-v1');
 assert.equal(res.body.results[0].title,'Heat');
 assert.equal(typeof res.body.results[0].hybridScore,'number');
 assert.equal(typeof res.body.results[0].searchSignals,'object');
 assert.ok(res.body.parsed&&res.body.plan&&res.body.evidence);
});

test('provider hard constraint removes candidates before hybrid fusion',async()=>{
 const res=await search('crime movies on Netflix',[node('netflix','Netflix Crime','Netflix'),node('hulu','Hulu Crime','Hulu')]);
 assert.equal(res.statusCode,200);
 assert.deepEqual(res.body.results.map(x=>x.id),['netflix']);
});
