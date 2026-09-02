import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHybridRankings} from '../../lib/search/hybrid-search.js';
import {expandSearchQuery} from '../../lib/search/query-expansion.js';
import {buildCinemaGraph} from '../../lib/search/cinema-graph.js';

test('explicit queried people themes styles movements and influences become searchable graph evidence',()=>{
 const movie={id:'movie:test',title:'Test Film',year:1977,genres:['Crime'],actors:['Gene Hackman'],directors:['Alan J. Pakula'],writers:['David Giler'],themes:['conspiracy'],styles:['paranoid'],movements:['New Hollywood'],influences:[{id:'movie:seven-samurai',title:'Seven Samurai',type:'movie'}]};
 const intent={raw:'Gene Hackman Alan J Pakula David Giler paranoid conspiracy New Hollywood Seven Samurai',concepts:[]};
 const hybrid=buildHybridRankings([movie],expandSearchQuery(intent.raw),intent);
 const types=new Set(hybrid.graphPathsById['movie:test'].map(p=>p.edge?.type));
 for(const type of ['STARS','DIRECTED_BY','WRITTEN_BY','HAS_THEME','HAS_STYLE','PART_OF_MOVEMENT','INFLUENCED_BY'])assert.ok(types.has(type),`missing ${type}`);
 assert.ok(hybrid.signalsById['movie:test'].cinemaGraph>.4);
});

test('Cinema Graph builder persists explicit influences only',()=>{
 const graph=buildCinemaGraph([{id:'movie:a',title:'A',influences:[{id:'movie:b',title:'B',type:'movie'}]}]);
 assert.ok(graph.edges().some(e=>e.from==='movie:a'&&e.to==='movie:b'&&e.type==='INFLUENCED_BY'));
 const noInfluence=buildCinemaGraph([{id:'movie:c',title:'C'}]);
 assert.equal(noInfluence.edges().some(e=>e.type==='INFLUENCED_BY'),false);
});
