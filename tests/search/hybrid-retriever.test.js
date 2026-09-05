import test from 'node:test';
import assert from 'node:assert/strict';
import { createHybridRetriever } from '../../lib/search/hybrid-retriever.js';

test('hybrid retriever merges exact full-text semantic and graph candidates without duplicates', async () => {
  const retriever=createHybridRetriever({
    exactSearch:async()=>[{id:'m1',title:'Heat',year:1995}],
    fullTextSearch:async()=>[{id:'m1',title:'Heat',year:1995},{id:'m2',title:'Thief',year:1981}],
    semanticSearch:async()=>[{id:'m3',title:'Collateral',year:2004,semanticScore:.91}],
    graphSearch:async()=>[{id:'m2',title:'Thief',year:1981},{id:'m4',title:'Manhunter',year:1986}]
  });
  const result=await retriever.search({query:'movies like Heat',parsedIntent:{kind:'discovery'}});
  assert.deepEqual(result.map(x=>x.id),['m1','m2','m3','m4']);
  assert.deepEqual(result[0].retrievalSources,['exact','fulltext']);
  assert.deepEqual(result[1].retrievalSources,['fulltext','graph']);
});

test('hybrid retriever preserves deterministic hard filters after candidate fusion', async () => {
  const retriever=createHybridRetriever({
    exactSearch:async()=>[],
    fullTextSearch:async()=>[
      {id:'m1',title:'Heat',year:1995,genres:['Crime']},
      {id:'m2',title:'Toy Story',year:1995,genres:['Animation']}
    ]
  });
  const result=await retriever.search({
    query:'1995 crime movies',
    parsedIntent:{yearMin:1995,yearMax:1995,genreWords:['Crime']}
  });
  assert.deepEqual(result.map(x=>x.title),['Heat']);
});

test('optional semantic or graph failures do not break exact and full-text retrieval', async () => {
  const retriever=createHybridRetriever({
    exactSearch:async()=>[{id:'m1',title:'Heat',year:1995}],
    fullTextSearch:async()=>[{id:'m2',title:'Thief',year:1981}],
    semanticSearch:async()=>{throw new Error('ml unavailable');},
    graphSearch:async()=>{throw new Error('graph unavailable');}
  });
  const result=await retriever.search({query:'crime movies',parsedIntent:{}});
  assert.deepEqual(result.map(x=>x.title),['Heat','Thief']);
});


test('discovery retrieval expands concept terms instead of searching only the literal phrase',async()=>{
  const seen=[];
  const retriever=createHybridRetriever({
    fullTextSearch:async ({query})=>{seen.push(query);return query==='robbery'?[{id:'m1',title:'Heat',year:1995}]:[];}
  });
  const result=await retriever.search({
    query:'Best Heist Films',
    parsedIntent:{kind:'discovery',concepts:['heist'],discoveryTerms:['heist','robbery','caper']}
  });
  assert.ok(seen.includes('Best Heist Films'));
  assert.ok(seen.includes('robbery'));
  assert.deepEqual(result.map(x=>x.title),['Heat']);
});

test('discovery query expansion is bounded and deduplicated',async()=>{
  const seen=[];
  const retriever=createHybridRetriever({
    semanticSearch:async ({query})=>{seen.push(query);return [];}
  });
  await retriever.search({
    query:'Car Films',
    parsedIntent:{kind:'discovery',discoveryTerms:['car','car','cars','racing','street racing','car chase','automotive','getaway driver','extra']}
  });
  assert.equal(new Set(seen).size,seen.length);
  assert.ok(seen.length<=7);
});
