import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTvRatingsHandler } from '../../api/tv-ratings.js';

function responseRecorder(){
  return {
    statusCode:200, body:null, headers:{},
    setHeader(name,value){ this.headers[String(name).toLowerCase()]=value; },
    status(code){ this.statusCode=code; return this; },
    json(body){ this.body=body; return this; }
  };
}

test('homepage exposes TV SHOW RATINGS beside support', async () => {
  const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
  assert.match(html,/TV SHOW RATINGS/i);
  assert.match(html,/data-tv-ratings-open/i);
  assert.match(html,/data-tv-ratings-panel/i);
});

test('TV ratings endpoint returns sourced season and episode ratings without inventing missing scores', async () => {
  const calls=[];
  const fetchImpl=async url=>{
    calls.push(String(url));
    if(String(url).includes('/search/shows')){
      return {ok:true,json:async()=>[
        {show:{id:52,name:'Hannibal',premiered:'2013-04-04',image:{medium:'poster.jpg'},rating:{average:8.5},network:{name:'NBC'}}},
        {show:{id:999,name:'Hannibal Something Else',premiered:'2020-01-01'}}
      ]};
    }
    if(String(url).includes('/shows/52/episodes')){
      return {ok:true,json:async()=>[
        {id:1,season:1,number:1,name:'Apéritif',airdate:'2013-04-04',rating:{average:8.3}},
        {id:2,season:1,number:2,name:'Amuse-Bouche',airdate:'2013-04-11',rating:{average:null}},
        {id:3,season:2,number:1,name:'Kaiseki',airdate:'2014-02-28',rating:{average:8.8}}
      ]};
    }
    throw new Error('unexpected url '+url);
  };

  const handler=createTvRatingsHandler({fetchImpl});
  const res=responseRecorder();
  await handler({method:'GET',query:{q:'Hannibal'}},res);

  assert.equal(res.statusCode,200);
  assert.equal(res.body.show.name,'Hannibal');
  assert.equal(res.body.source.name,'TVmaze');
  assert.equal(res.body.seasons.length,2);
  assert.equal(res.body.seasons[0].episodes[0].rating,8.3);
  assert.equal(res.body.seasons[0].episodes[1].rating,null);
  assert.equal(res.body.seasons[0].average,8.3);
  assert.equal(res.body.seasons[1].average,8.8);
  assert.ok(calls.some(url=>url.includes('/search/shows')));
  assert.ok(calls.some(url=>url.includes('/shows/52/episodes')));
});

test('TV ratings endpoint validates method and query', async () => {
  const handler=createTvRatingsHandler({fetchImpl:async()=>{ throw new Error('should not fetch'); }});

  const badMethod=responseRecorder();
  await handler({method:'POST',query:{}},badMethod);
  assert.equal(badMethod.statusCode,405);

  const missingQuery=responseRecorder();
  await handler({method:'GET',query:{}},missingQuery);
  assert.equal(missingQuery.statusCode,400);
});
