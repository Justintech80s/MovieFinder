import {scoreCinemaRelations,buildCinemaGraph,traverseCinemaGraph} from './cinema-graph.js';
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
const fields=movie=>[movie.title,movie.description,...(movie.genres||[]),...(movie.tags||[]),...(movie.actors||[]),...(movie.directors||[]),...(movie.writers||[]),...(movie.themes||[]),...(movie.styles||[]),...(movie.movements||[]),movie.year].map(v=>typeof v==='object'?(v.name||v.label||v.title||''):v).join(' ');
const bySignal=(candidates,signals,key)=>[...candidates].sort((a,b)=>(signals[resultIdentity(b)]?.[key]||0)-(signals[resultIdentity(a)]?.[key]||0)||normalizeSearchText(a.title).localeCompare(normalizeSearchText(b.title)));
const normalizeGenre=value=>{const n=normalizeSearchText(value);return n==='sci fi'?'sci-fi':n;};
const phraseInQuery=(query,label)=>{const q=normalizeSearchText(query),l=normalizeSearchText(label);return Boolean(l&&q.includes(l));};
function typedGraphSignal(movie,intent={}){
 const graph=buildCinemaGraph([movie],{provenance:'candidate-metadata',confidence:.9});
 const movieId=graph.nodes().find(node=>node.type==='movie')?.id;if(!movieId)return {score:0,paths:[]};
 const paths=traverseCinemaGraph(graph,movieId,{maxDepth:1});
 const requestedGenres=new Set((intent.genreWords||intent.genres||[]).map(normalizeGenre));
 const requestedEra=intent.yearMin!=null&&intent.yearMax!=null&&Number(intent.yearMax)-Number(intent.yearMin)===9?`${Math.floor(Number(intent.yearMin)/10)*10}s`:null;
 const q=intent.raw||'';
 const matched=paths.filter(p=>{
  if(p.edge?.type==='HAS_GENRE'&&requestedGenres.has(normalizeGenre(p.node?.label)))return true;
  if(p.edge?.type==='FROM_ERA'&&requestedEra&&normalizeSearchText(p.node?.label)===normalizeSearchText(requestedEra))return true;
  if(['STARS','DIRECTED_BY','WRITTEN_BY','HAS_THEME','HAS_STYLE','PART_OF_MOVEMENT','INFLUENCED_BY','FROM_COUNTRY'].includes(p.edge?.type)&&phraseInQuery(q,p.node?.label))return true;
  return false;
 });
 return {score:clamp(matched.reduce((sum,p)=>sum+((p.edge?.confidence??1)*.12),0)),paths:matched};
}

export function buildHybridRankings(candidates=[],queryExpansion={},intent={}){
 const signals={},graphPathsById={};
 const queryText=intent.titleQuery||queryExpansion.normalized||intent.raw||'';
 const originalTokens=new Set(queryExpansion.tokens||[]),expandedTokens=new Set(queryExpansion.expandedTokens||queryExpansion.tokens||[]);
 for(const movie of candidates){
  const id=resultIdentity(movie),title=normalizeSearchText(movie.title),exactTitle=Boolean(intent.titleQuery&&title===normalizeSearchText(intent.titleQuery));
  const hay=tokens(fields(movie));
  const titleOverlap=overlap(originalTokens,tokens(movie.title));
  const lexical=exactTitle?1:Math.max(titleOverlap*.72,fuzzyTitle(queryText,movie.title));
  const semantic=overlap(expandedTokens,hay);
  const legacyGraph=scoreCinemaRelations(movie,intent);const typed=typedGraphSignal(movie,intent);const graphScore=clamp(legacyGraph.score+typed.score);
  signals[id]={lexical:+clamp(lexical).toFixed(3),semantic:+clamp(semantic).toFixed(3),cinemaGraph:+graphScore.toFixed(3),exactTitle};
  graphPathsById[movie.id||id]=typed.paths;graphPathsById[id]=typed.paths;
 }
 const baseline=rankResults(candidates,intent);
 const lists=[{name:'lexical',results:bySignal(candidates,signals,'lexical')},{name:'semantic',results:bySignal(candidates,signals,'semantic')},{name:'cinemaGraph',results:bySignal(candidates,signals,'cinemaGraph')},{name:'baseline',results:baseline}];
 const signalsById={};for(const movie of candidates){const signal=signals[resultIdentity(movie)];signalsById[movie.id||resultIdentity(movie)]=signal;signalsById[resultIdentity(movie)]=signal;}
 return {lists,signalsById,graphPathsById};
}
