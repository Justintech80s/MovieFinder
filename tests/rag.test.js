import test from 'node:test';
import assert from 'node:assert/strict';
import {createEvidenceRecord,dedupeEvidence} from '../lib/search/evidence.js';
import {buildEvidencePacket} from '../lib/search/rag.js';

test('evidence confidence is bounded and duplicates are removed',()=>{
 const records=dedupeEvidence([
  {kind:'metadata',source:'catalog',claim:'Crime',confidence:4},
  {kind:'metadata',source:'catalog',claim:'Crime',confidence:4}
 ]);
 assert.equal(records.length,1);
 assert.equal(records[0].confidence,1);
 assert.equal(createEvidenceRecord({claim:'x',confidence:-2}).confidence,0);
});

test('RAG packet serializes graph paths and candidate ids',()=>{
 const packet=buildEvidencePacket({query:'movies like Goodfellas',candidates:[{id:'movie:casino'}],graphPaths:[{node:{id:'movie:casino',label:'Casino'},edge:{from:'movie:goodfellas',to:'movie:casino',type:'SIMILAR_TO',confidence:.9,provenance:'curated'},path:[{from:'movie:goodfellas',to:'movie:casino',type:'SIMILAR_TO'}]}]});
 assert.deepEqual(packet.candidateIds,['movie:casino']);
 assert.equal(packet.evidence[0].source,'curated');
 assert.deepEqual(packet.evidence[0].path,[{from:'movie:goodfellas',to:'movie:casino',type:'SIMILAR_TO'}]);
});
