import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveOrchestrator } from '../../lib/search/live-orchestrator.js';

test('live orchestrator retries weak hybrid discovery once and uses stronger fallback', async () => {
  let fallbackCalls=0;
  const orchestrator=createLiveOrchestrator({
    hybridRetriever:{
      async search(){
        return [{id:'weak',title:'Weak Match',year:2000,retrievalScore:.1,retrievalSources:['semantic']}];
      }
    },
    deterministicSearch:async()=>{
      fallbackCalls+=1;
      return {
        parsed:{kind:'discovery'},
        results:[{id:'strong',title:'Better Match',year:2001,matchScore:.8}],
        reasoningMode:'deterministic'
      };
    }
  });

  const result=await orchestrator.search({
    query:'something unusual to watch',
    parsedIntent:{kind:'discovery',concepts:[]}
  });

  assert.equal(fallbackCalls,1);
  assert.equal(result.results[0].title,'Better Match');
  assert.equal(result.verificationRetry.attempted,true);
  assert.equal(result.verificationRetry.used,true);
});

test('live orchestrator does not retry a strong hybrid discovery response', async () => {
  let fallbackCalls=0;
  const orchestrator=createLiveOrchestrator({
    hybridRetriever:{
      async search(){
        return [{id:'strong',title:'Strong Match',year:2000,retrievalScore:.82,retrievalSources:['fulltext','semantic']}];
      }
    },
    deterministicSearch:async()=>{
      fallbackCalls+=1;
      return {parsed:{kind:'discovery'},results:[]};
    }
  });

  const result=await orchestrator.search({
    query:'strong conceptual match',
    parsedIntent:{kind:'discovery',concepts:[]}
  });

  assert.equal(fallbackCalls,0);
  assert.equal(result.results[0].title,'Strong Match');
  assert.equal(result.verificationRetry.attempted,false);
});
