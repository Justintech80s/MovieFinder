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

export function createHybridRetriever({
  exactSearch=null,
  fullTextSearch=null,
  semanticSearch=null,
  graphSearch=null,
  maxCandidates=80
}={}){
  return {
    async search({query='',parsedIntent={}}={}){
      const searches=[
        ['exact',exactSearch],
        ['fulltext',fullTextSearch],
        ['semantic',semanticSearch],
        ['graph',graphSearch]
      ];
      const settled=await Promise.all(searches.map(async([source,fn])=>[
        source,
        await safeSearch(fn,{query,parsedIntent})
      ]));
      const merged=new Map();
      for(const [source,items] of settled){
        for(const item of items){
          if(!item||merged.size>=maxCandidates&&!merged.has(candidateKey(item))) continue;
          const key=candidateKey(item);
          const current=merged.get(key);
          if(current){
            const sources=new Set([...(current.retrievalSources||[]),source]);
            merged.set(key,{...current,...item,retrievalSources:SOURCE_ORDER.filter(name=>sources.has(name))});
          }else{
            merged.set(key,{...item,retrievalSources:[source]});
          }
        }
      }
      return [...merged.values()].filter(item=>matchesHardConstraints(item,parsedIntent));
    }
  };
}
