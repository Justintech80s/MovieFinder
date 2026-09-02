import {scoreCinemaRelations} from './cinema-graph.js';
import {rankResults} from './rank.js';
import {normalizeSearchText} from './query-expansion.js';
import {resultIdentity} from './rank-fusion.js';

const clamp=value=>Math.max(0,Math.min(1,Number(value)||0));
const tokens=value=>new Set(normalizeSearchText(value).split(' ').filter(Boolean));
const overlap=(queryTokens,hayTokens)=>{if(!queryTokens.size)return 0;let hits=0;for(const token of queryTokens)if(hayTokens.has(token))hits++;return hits/queryTokens.size;};
function levenshtein(a='',b=''){
 const x=normalizeSearchText(a),y=normalizeSearchText(b);if(!x)return y.length;if(!y)return x.length;
 let prev=Array.from({length:y.length+1},(_,i)=>i);
 for(let i=1;i<=x.length;i++){const next=[i];for(let j=1;j<=y.length;j++)next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+(x[i-1]===y[j-1]?0:1));prev=next;}return prev[y.length];
}
function fuzzyTitle(query,title){
 const q=normalizeSearchText(query),t=normalizeSearchText(title);if(!q||!t)return 0;
 const longest=Math.max(q.length,t.length);if(Math.abs(q.length-t.length)>Math.max(3,Math.floor(longest*.3)))return 0;
 const similarity=1-levenshtein(q,t)/longest;return similarity>=.65?clamp(similarity*.82):0;
}
const fields=movie=>[movie.title,movie.description,...(movie.genres||[]),...(movie.tags||[]),movie.year].join(' ');
const bySignal=(candidates,signals,key)=>[...candidates].sort((a,b)=>(signals[resultIdentity(b)]?.[key]||0)-(signals[resultIdentity(a)]?.[key]||0)||normalizeSearchText(a.title).localeCompare(normalizeSearchText(b.title)));

export function buildHybridRankings(candidates=[],queryExpansion={},intent={}){
 const signals={};
 const queryText=intent.titleQuery||queryExpansion.normalized||intent.raw||'';
 const originalTokens=new Set(queryExpansion.tokens||[]),expandedTokens=new Set(queryExpansion.expandedTokens||queryExpansion.tokens||[]);
 for(const movie of candidates){
  const id=resultIdentity(movie),title=normalizeSearchText(movie.title),exactTitle=Boolean(intent.titleQuery&&title===normalizeSearchText(intent.titleQuery));
  const hay=tokens(fields(movie));
  const titleOverlap=overlap(originalTokens,tokens(movie.title));
  const lexical=exactTitle?1:Math.max(titleOverlap*.72,fuzzyTitle(queryText,movie.title));
  const semantic=overlap(expandedTokens,hay);
  const graph=scoreCinemaRelations(movie,intent);
  signals[id]={lexical:+clamp(lexical).toFixed(3),semantic:+clamp(semantic).toFixed(3),cinemaGraph:+clamp(graph.score).toFixed(3),exactTitle};
 }
 const baseline=rankResults(candidates,intent);
 const lists=[{name:'lexical',results:bySignal(candidates,signals,'lexical')},{name:'semantic',results:bySignal(candidates,signals,'semantic')},{name:'cinemaGraph',results:bySignal(candidates,signals,'cinemaGraph')},{name:'baseline',results:baseline}];
 const signalsById={};for(const movie of candidates){const signal=signals[resultIdentity(movie)];signalsById[movie.id||resultIdentity(movie)]=signal;signalsById[resultIdentity(movie)]=signal;}
 return {lists,signalsById};
}
