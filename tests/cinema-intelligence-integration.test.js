import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSearchPlan} from '../lib/search/planner.js';
import {createCinemaGraph,traverseCinemaGraph} from '../lib/search/cinema-graph.js';
import {buildEvidencePacket} from '../lib/search/rag.js';
import {verifyEnrichment} from '../lib/search/verify.js';
import {getModelProvider} from '../lib/ai/index.js';

test('AI-disabled pipeline still produces deterministic graph evidence',async()=>{
 const plan=buildSearchPlan({raw:'movies like Goodfellas',concepts:['gritty'],allowAI:false});
 const graph=createCinemaGraph();graph.upsertNode({id:'movie:goodfellas',type:'movie',label:'Goodfellas'});graph.upsertNode({id:'movie:casino',type:'movie',label:'Casino'});graph.addEdge('movie:goodfellas','movie:casino',{type:'SIMILAR_TO',confidence:.94,provenance:'cinema-graph'});
 const paths=traverseCinemaGraph(graph,'movie:goodfellas',{edgeTypes:['SIMILAR_TO'],maxDepth:1});
 const packet=buildEvidencePacket({query:'movies like Goodfellas',candidates:[{id:'movie:casino'}],graphPaths:paths});
 const ai=await getModelProvider({enabled:false}).generateStructured({task:'enrich'});
 assert.equal(plan.steps.some(x=>x.tool==='cinemaGraph'),true);assert.equal(ai.available,false);assert.equal(packet.evidence[0].claim,'Casino');
 const verified=verifyEnrichment({enrichment:['Casino'],evidence:packet.evidence});assert.equal(verified.accepted.length,1);
});
