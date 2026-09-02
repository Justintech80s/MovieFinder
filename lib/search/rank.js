import { scoreCinemaRelations } from './cinema-graph.js';
import { resultIdentity } from './rank-fusion.js';
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function rankResults(results=[],intent={}){return results.map(m=>{let score=0;const why=[];if(intent.titleQuery&&norm(m.title)===norm(intent.titleQuery)){score+=.45;why.push('exact title');}if(m.offers?.length){score+=.14;why.push('current availability');}if(intent.provider&&m.offers?.some(o=>norm(o.provider).includes(norm(intent.provider)))){score+=.16;why.push(`${intent.provider} availability`);}if(intent.freeOnly&&m.offers?.some(o=>['FREE','ADS'].includes(o.type))){score+=.16;why.push('free/legal availability');}const graph=scoreCinemaRelations(m,intent);score+=graph.score;why.push(...graph.reasons);if(m.ratings?.imdb)score+=Math.min(.05,m.ratings.imdb/200);return {...m,matchScore:+Math.min(1,score).toFixed(3),cinemaWhy:why.slice(0,4).join(' · ')||'catalog match'};}).sort((a,b)=>b.matchScore-a.matchScore);}

export function finalizeHybridResults(fused=[],signalsById={},intent={}){
 const maxRrf=Math.max(0,...fused.map(x=>Number(x.rrfScore)||0));
 return fused.map(movie=>{
  const signals=signalsById[movie.id]||signalsById[resultIdentity(movie)]||{};
  const rrf=maxRrf?Math.min(1,(Number(movie.rrfScore)||0)/maxRrf):0;
  let score=rrf*.68+(signals.lexical||0)*.18+(signals.semantic||0)*.08+(signals.cinemaGraph||0)*.06;
  if(signals.exactTitle)score+=.08;
  if(intent.provider&&movie.offers?.some(o=>norm(o.provider).includes(norm(intent.provider))))score+=.03;
  if(intent.freeOnly&&movie.offers?.some(o=>['FREE','ADS'].includes(o.type)))score+=.03;
  score=Math.min(1,score);
  return {...movie,hybridScore:+score.toFixed(3),searchSignals:{lexical:signals.lexical||0,semantic:signals.semantic||0,cinemaGraph:signals.cinemaGraph||0,rrf:+rrf.toFixed(3),exactTitle:Boolean(signals.exactTitle)}};
 }).sort((a,b)=>b.hybridScore-a.hybridScore||b.matchScore-a.matchScore||norm(a.title).localeCompare(norm(b.title)));
}
