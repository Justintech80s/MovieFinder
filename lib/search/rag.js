import {createEvidenceRecord,dedupeEvidence} from './evidence.js';
export function buildEvidencePacket({query='',candidates=[],graphPaths=[],sources=[]}={}){
 const evidence=[];
 for(const p of graphPaths){const edges=p.path||[p.edge].filter(Boolean);evidence.push(createEvidenceRecord({kind:'graph',source:p.edge?.provenance||'cinema-graph',claim:p.node?.label||p.node?.id||'',confidence:p.edge?.confidence??1,path:edges.map(e=>({from:e.from,to:e.to,type:e.type}))}));}
 for(const s of sources)evidence.push(createEvidenceRecord(s));
 return {query:String(query),candidateIds:candidates.map(c=>c.id||c.tmdbId||c.title).filter(Boolean),evidence:dedupeEvidence(evidence)};
}
