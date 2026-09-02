import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHybridRankings} from '../../lib/search/hybrid-search.js';
import {buildEvidencePacket} from '../../lib/search/rag.js';
import {expandSearchQuery} from '../../lib/search/query-expansion.js';
import {parseIntent} from '../../lib/search/intent.js';

test('typed Cinema Graph rewards explicit era and genre relationships and emits evidence paths',()=>{
 const candidates=[
  {id:'m1974',title:'Parallax',year:1974,genres:['Thriller'],description:''},
  {id:'m1995',title:'Modern Thriller',year:1995,genres:['Thriller'],description:''}
 ];
 const intent=parseIntent('1970s thriller');intent.concepts=[];
 const hybrid=buildHybridRankings(candidates,expandSearchQuery(intent.raw),intent);
 assert.ok(hybrid.signalsById.m1974.cinemaGraph>hybrid.signalsById.m1995.cinemaGraph);
 const paths=hybrid.graphPathsById.m1974;
 assert.ok(paths.some(p=>p.edge?.type==='FROM_ERA'&&p.node?.label==='1970s'));
 assert.ok(paths.some(p=>p.edge?.type==='HAS_GENRE'&&p.node?.label==='Thriller'));
 const packet=buildEvidencePacket({query:intent.raw,candidates:[candidates[0]],graphPaths:paths});
 assert.ok(packet.evidence.some(e=>e.kind==='graph'&&e.path?.some(step=>step.type==='FROM_ERA')));
});
