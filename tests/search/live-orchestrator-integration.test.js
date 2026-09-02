import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveOrchestrator } from '../../lib/search/live-orchestrator.js';

test('complex query flows through graph, live availability, hard filtering, and verified AI reasoning', async () => {
  const aiCalls=[];
  const graphStore={
    async getNode(id){
      const nodes={
        conversation:{id:'conversation',type:'movie',title:'The Conversation',year:1974},
        paranoia:{id:'paranoia',type:'movie',title:'The Parallax View',year:1974},
        unsupported:{id:'unsupported',type:'movie',title:'Unsupported Candidate',year:1974}
      };
      return nodes[id]||null;
    },
    async traverse(){
      return [
        {from:'conversation',to:'paranoia',type:'similar_theme'},
        {from:'conversation',to:'unsupported',type:'similar_theme'}
      ];
    }
  };
  const lookupAvailability=async movie => {
    if(movie.id==='unsupported') return null;
    return {
      ...movie,
      genres:['Thriller'],
      offers:[{provider:'Criterion Channel',type:'FLATRATE',url:`https://example.com/${movie.id}`}],
      checkedAt:'2026-09-02T18:00:00.000Z'
    };
  };
  const modelRouter={
    async run(capability,input,context){
      aiCalls.push({capability,input,context});
      return {provider:'openai',output:{model:'integration-model',content:'Verified thematic connection.'}};
    }
  };
  const orchestrator=createLiveOrchestrator({
    graphStore,
    lookupAvailability,
    modelRouter,
    deterministicSearch:async()=>{throw new Error('deterministic fallback should not run');}
  });

  const result=await orchestrator.search({
    query:'movies like The Conversation with political surveillance themes that are streaming now',
    parsedIntent:{kind:'discovery',similarityAnchor:'conversation',genres:['Thriller'],concepts:['political surveillance','paranoia']}
  });

  assert.equal(result.reasoningMode,'graph+ai');
  assert.deepEqual(result.results.map(movie=>movie.id),['conversation','paranoia']);
  assert.equal(result.results.some(movie=>movie.id==='unsupported'),false);
  assert.equal(aiCalls.length,1);
  assert.equal(aiCalls[0].capability,'cinema_reasoning');
  assert.deepEqual(aiCalls[0].input.evidence.movies.map(movie=>movie.id),['conversation','paranoia']);
  assert.equal(aiCalls[0].input.evidence.movies.some(movie=>movie.id==='unsupported'),false);
  assert.deepEqual(aiCalls[0].context.context,aiCalls[0].input.evidence);
  assert.equal(result.answer,'Verified thematic connection.');
});
