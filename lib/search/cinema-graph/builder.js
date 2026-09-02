import {createCinemaGraph} from './store.js';
import {normalizeMovieMetadata} from './metadata.js';

const edgeOptions=normalized=>({provenance:normalized.provenance,confidence:normalized.confidence});
const upsert=(graph,node)=>node&&graph.upsertNode(node);

export function ingestMovieMetadata(graph,movie,defaults={}){
 if(!graph||typeof graph.upsertNode!=='function'||typeof graph.addEdge!=='function')throw new TypeError('Cinema graph is required');
 const normalized=normalizeMovieMetadata(movie,defaults);
 if(!normalized)return null;
 const movieNode=upsert(graph,normalized.movie);
 const options=edgeOptions(normalized);
 for(const person of normalized.people){
  const {role,...node}=person;upsert(graph,node);
  if(role==='actor')graph.addEdge(movieNode.id,node.id,{type:'STARS',...options,metadata:{role:'actor'}});
  if(role==='director')graph.addEdge(movieNode.id,node.id,{type:'DIRECTED_BY',...options,metadata:{role:'director'}});
  if(role==='writer')graph.addEdge(movieNode.id,node.id,{type:'WRITTEN_BY',...options,metadata:{role:'writer'}});
 }
 const connect=(nodes,type)=>{for(const node of nodes){upsert(graph,node);graph.addEdge(movieNode.id,node.id,{type,...options});}};
 connect(normalized.genres,'HAS_GENRE');
 connect(normalized.themes,'HAS_THEME');
 connect(normalized.countries,'FROM_COUNTRY');
 connect(normalized.styles,'HAS_STYLE');
 connect(normalized.movements,'PART_OF_MOVEMENT');
 connect(normalized.influences,'INFLUENCED_BY');
 if(normalized.era){upsert(graph,normalized.era);graph.addEdge(movieNode.id,normalized.era.id,{type:'FROM_ERA',...options});}
 return {movieId:movieNode.id,normalized};
}

export function buildCinemaGraph(movies=[],defaults={}){
 const graph=createCinemaGraph();
 for(const movie of movies||[])ingestMovieMetadata(graph,movie,defaults);
 return graph;
}
