import test from 'node:test';
import assert from 'node:assert/strict';
import { assessSearchQuality, chooseVerifiedResponse } from '../../lib/search/verification-retry.js';

test('weak discovery results request one bounded retry', () => {
  const quality=assessSearchQuality({
    parsedIntent:{kind:'discovery'},
    results:[{id:'m1',title:'Weak Match',retrievalScore:.12,retrievalSources:['semantic']}]
  });
  assert.equal(quality.retry,true);
  assert.match(quality.reasons.join(' '),/low retrieval confidence/i);
});

test('strong multi-source discovery results do not retry', () => {
  const quality=assessSearchQuality({
    parsedIntent:{kind:'discovery'},
    results:[{id:'m1',title:'Strong Match',retrievalScore:.78,retrievalSources:['fulltext','semantic'],offers:[{provider:'Max',type:'FLATRATE'}]}]
  });
  assert.equal(quality.retry,false);
});

test('availability-constrained results without live offers request retry', () => {
  const quality=assessSearchQuality({
    parsedIntent:{kind:'discovery',provider:'Netflix'},
    results:[{id:'m1',title:'Candidate',retrievalScore:.75,retrievalSources:['fulltext','semantic'],offers:[]}]
  });
  assert.equal(quality.retry,true);
  assert.match(quality.reasons.join(' '),/availability/i);
});

test('verified retry replaces the first response only when it is stronger', () => {
  const first={
    parsed:{kind:'discovery'},
    results:[{id:'m1',title:'Weak Match',retrievalScore:.15,retrievalSources:['semantic']}],
    reasoningMode:'hybrid'
  };
  const retry={
    parsed:{kind:'discovery'},
    results:[{id:'m2',title:'Verified Match',matchScore:.82,offers:[{provider:'Netflix',type:'FLATRATE'}]}],
    reasoningMode:'deterministic'
  };
  const chosen=chooseVerifiedResponse(first,retry,{parsedIntent:{kind:'discovery',provider:'Netflix'}});
  assert.equal(chosen.results[0].title,'Verified Match');
  assert.equal(chosen.verificationRetry.attempted,true);
  assert.equal(chosen.verificationRetry.used,true);
});

test('verified retry keeps a stronger first response when fallback is weaker', () => {
  const first={
    parsed:{kind:'discovery'},
    results:[{id:'m1',title:'Strong Match',retrievalScore:.84,retrievalSources:['fulltext','semantic'],offers:[{provider:'Max',type:'FLATRATE'}]}],
    reasoningMode:'hybrid'
  };
  const retry={parsed:{kind:'discovery'},results:[],reasoningMode:'deterministic'};
  const chosen=chooseVerifiedResponse(first,retry,{parsedIntent:{kind:'discovery'}});
  assert.equal(chosen.results[0].title,'Strong Match');
  assert.equal(chosen.verificationRetry.attempted,true);
  assert.equal(chosen.verificationRetry.used,false);
});
