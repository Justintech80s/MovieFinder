import { matchesHardConstraints } from './constraints.js';

const SOURCE_ORDER=['exact','fulltext','semantic','graph'];

function candidateKey(item){
  if(item?.id!=null) return `id:${item.id}`;
  return `title:${String(item?.title||'').toLowerCase()}:${item?.year??''}`;
}

async function safeSearch(fn,args){
  if(typeof fn!=='function') return [];
  try{
    const value=await fn(args);
    return Array.isArray(value)?value:[];
  }catch{
    return [];
  }
}

function expandedQueries(query,parsedIntent={}){
  const base=String(query||'').trim();
  if(parsedIntent.kind!=='discovery') return base?[base]:[];
  const terms=Array.isArray(parsedIntent.discoveryTerms)?parsedIntent.discoveryTerms:[];
  return [...new Set([base,...terms].map(value=>String(value||'').trim()).filter(Boolean))].slice(0,7);
}

function meaningful(value){
  if(value==null) return false;
  if(typeof value==='string') return value.trim().length>0;
  if(Array.isArray(value)) return value.length>0;
  return true;
}

function mergeCandidate(current,item){
  const merged={...current};
  for(const [key,value] of Object.entries(item||{})){
    if(meaningful(value)) merged[key]=value;
  }
  return merged;
}

function clamp01(value){
  const number=Number(value);
  return Number.isFinite(number)?Math.max(0,Math.min(1,number)):0;
}

function sourceSignal(source,item={}){
  if(source==='exact') return .38;
  if(source==='fulltext'){
    const score=clamp01(item.fullTextScore);
    return .24*(score||.5);
  }
  if(source==='semantic') return .34*clamp01(item.semanticScore);
  if(source==='graph'){
    const confidence=clamp01(item.graphScore??item.relationConfidence??item.confidence);
    return .22*(confidence||.5);
  }
  return 0;
}

function fusedScore(sourceScores={}){
  const sources=SOURCE_ORDER.filter(source=>Number(sourceScores[source])>0);
  const evidence=Object.values(sourceScores).reduce((sum,value)=>sum+Number(value||0),0);
  const multiSourceBonus=Math.max(0,sources.length-1)*.08;
  return +Math.min(1,evidence+multiSourceBonus).toFixed(4);
}

export function createHybridRetriever({
  exactSearch=null,
  fullTextSearch=null,
  semanticSearch=null,
  graphSearch=null,
  maxCandidates=80
}={}){
  return {
    async search({query='',parsedIntent={}}={}){
      const queries=expandedQueries(query,parsedIntent);
      const searches=[
        ['exact',exactSearch,queries.slice(0,1)],
        ['fulltext',fullTextSearch,queries],
        ['semantic',semanticSearch,queries],
        ['graph',graphSearch,queries.slice(0,1)]
      ];
      const settled=await Promise.all(searches.map(async([source,fn,sourceQueries])=>{
        const batches=await Promise.all(sourceQueries.map(async(expandedQuery,index)=>{
          const items=await safeSearch(fn,{query:expandedQuery,parsedIntent});
          const decay=Math.max(.76,1-(index*.06));
          return items.map(item=>({item,decay}));
        }));
        return [source,batches.flat()];
      }));

      const merged=new Map();
      for(const [source,entries] of settled){
        for(const {item,decay} of entries){
          if(!item) continue;
          const key=candidateKey(item);
          if(merged.size>=maxCandidates&&!merged.has(key)) continue;
          const current=merged.get(key);
          const signal=sourceSignal(source,item)*decay;
          if(current){
            const sources=new Set([...(current.retrievalSources||[]),source]);
            const sourceScores={...(current._sourceScores||{})};
            sourceScores[source]=Math.max(Number(sourceScores[source]||0),signal);
            const combined=mergeCandidate(current,item);
            merged.set(key,{
              ...combined,
              retrievalSources:SOURCE_ORDER.filter(name=>sources.has(name)),
              retrievalScore:fusedScore(sourceScores),
              _sourceScores:sourceScores
            });
          }else{
            const sourceScores={[source]:signal};
            merged.set(key,{
              ...item,
              retrievalSources:[source],
              retrievalScore:fusedScore(sourceScores),
              _sourceScores:sourceScores
            });
          }
        }
      }

      return [...merged.values()]
        .filter(item=>matchesHardConstraints(item,parsedIntent))
        .sort((a,b)=>(b.retrievalScore||0)-(a.retrievalScore||0))
        .map(({_sourceScores,...item})=>item);
    }
  };
}
