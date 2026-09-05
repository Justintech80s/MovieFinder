import test from 'node:test';
import assert from 'node:assert/strict';
import { rankResults } from '../../lib/search/rank.js';

test('ranked discovery results include a richer verified search explanation',()=>{
  const [result]=rankResults([{
    id:'heat',title:'Heat',year:1995,
    description:'A professional thief faces a relentless detective.',
    genres:['Crime','Drama'],
    tags:['heist','robbery'],
    offers:[{provider:'Max',type:'FLATRATE'}],
    ratings:{imdb:8.3,rottenTomatoes:83,imdbVotes:750000}
  }],{
    kind:'discovery',
    concepts:['heist'],
    rankingIntent:'best'
  });
  assert.match(result.searchExplanation,/Heat/);
  assert.match(result.searchExplanation,/heist|robbery/i);
  assert.match(result.searchExplanation,/IMDb 8\.3/);
  assert.match(result.searchExplanation,/Max/);
});
