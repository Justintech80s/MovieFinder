import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyEnrichment} from '../lib/search/verify.js';

test('supported claims survive and unsupported model claims are rejected',()=>{const result=verifyEnrichment({enrichment:{claims:['Crime','Directed by Christopher Nolan']},evidence:[{claim:'Crime',confidence:.98,source:'catalog'}]});assert.deepEqual(result.accepted.map(x=>x.claim),['Crime']);assert.deepEqual(result.rejected.map(x=>x.claim),['Directed by Christopher Nolan']);assert.equal(result.confidence,.98);});
test('verification confidence comes from evidence rather than model assertion',()=>{const result=verifyEnrichment({enrichment:[{claim:'Gangster',confidence:1}],evidence:[{claim:'Gangster film',confidence:.72,source:'graph'}]});assert.equal(result.accepted.length,1);assert.equal(result.confidence,.72);});
