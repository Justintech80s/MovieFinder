import test from 'node:test';
import assert from 'node:assert/strict';

test('exact title outranks nearby fuzzy title',async()=>{
 const [{expandSearchQuery},{buildHybridRankings}]=await Promise.all([import('../../lib/search/query-expansion.js'),import('../../lib/search/hybrid-search.js')]);
 const candidates=[{id:'goodfellas',title:'Goodfellas',description:'gangster crime drama',genres:['Crime'],offers:[]},{id:'good-fella',title:'Good Fella',description:'crime drama',genres:['Crime'],offers:[]}];
 const intent={raw:'Goodfellas',titleQuery:'Goodfellas',concepts:[]};
 const result=buildHybridRankings(candidates,expandSearchQuery('Goodfellas'),intent);
 assert.equal(result.lists.find(x=>x.name==='lexical').results[0].id,'goodfellas');
 assert.equal(result.signalsById.goodfellas.exactTitle,true);
});

test('small title typo receives useful but bounded fuzzy relevance',async()=>{
 const [{expandSearchQuery},{buildHybridRankings}]=await Promise.all([import('../../lib/search/query-expansion.js'),import('../../lib/search/hybrid-search.js')]);
 const result=buildHybridRankings([{id:'goodfellas',title:'Goodfellas',description:'',genres:['Crime'],offers:[]}],expandSearchQuery('Godfellas'),{raw:'Godfellas',titleQuery:'Godfellas',concepts:[]});
 const signal=result.signalsById.goodfellas;
 assert.ok(signal.lexical>.5);
 assert.ok(signal.lexical<1);
 assert.equal(signal.exactTitle,false);
});

test('synonym expansion and Cinema Graph concepts create independent signals',async()=>{
 const [{expandSearchQuery},{buildHybridRankings}]=await Promise.all([import('../../lib/search/query-expansion.js'),import('../../lib/search/hybrid-search.js')]);
 const movie={id:'parallax',title:'The Parallax View',description:'A conspiracy investigation',genres:['Thriller'],tags:['paranoia'],offers:[]};
 const result=buildHybridRankings([movie],expandSearchQuery('scary paranoid thriller'),{raw:'scary paranoid thriller',titleQuery:null,concepts:['paranoid']});
 const signal=result.signalsById.parallax;
 assert.ok(signal.semantic>0);
 assert.ok(signal.cinemaGraph>0);
 assert.ok(signal.semantic<=1&&signal.cinemaGraph<=1);
});
