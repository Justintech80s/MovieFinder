import test from 'node:test';
import assert from 'node:assert/strict';

test('ingests explicit movie metadata into typed graph relationships',async()=>{
 const {createCinemaGraph,ingestMovieMetadata}=await import('../lib/search/cinema-graph.js');
 const graph=createCinemaGraph();
 const result=ingestMovieMetadata(graph,{
  id:'movie:parallax',title:'The Parallax View',year:1974,
  actors:[{id:'person:beatty',name:'Warren Beatty'}],
  director:{id:'person:pakula',name:'Alan J. Pakula'},
  writer:{id:'person:giler',name:'David Giler'},
  genres:['Thriller'],country:'United States',themes:['conspiracy'],styles:['paranoid'],movements:['New Hollywood']
 },{provenance:'fixture',confidence:.88});
 assert.equal(result.movieId,'movie:parallax');
 const edges=graph.edges();
 const has=(from,to,type)=>edges.some(e=>e.from===from&&e.to===to&&e.type===type);
 assert.equal(has('person:beatty','movie:parallax','STARS'),true);
 assert.equal(has('movie:parallax','person:pakula','DIRECTED_BY'),true);
 assert.equal(has('movie:parallax','person:giler','WRITTEN_BY'),true);
 assert.equal(has('movie:parallax','genre:thriller','HAS_GENRE'),true);
 assert.equal(has('movie:parallax','theme:conspiracy','HAS_THEME'),true);
 assert.equal(has('movie:parallax','era:1970s','FROM_ERA'),true);
 assert.equal(has('movie:parallax','country:united-states','FROM_COUNTRY'),true);
 assert.equal(has('movie:parallax','style:paranoid','HAS_STYLE'),true);
 assert.equal(has('movie:parallax','movement:new-hollywood','PART_OF_MOVEMENT'),true);
 assert.ok(edges.every(e=>e.provenance==='fixture'&&e.confidence===.88));
});

test('repeated ingestion is idempotent',async()=>{
 const {createCinemaGraph,ingestMovieMetadata}=await import('../lib/search/cinema-graph.js');
 const graph=createCinemaGraph();
 const movie={title:'Heat',year:1995,actors:['Al Pacino'],genres:['Crime']};
 ingestMovieMetadata(graph,movie);
 const first={nodes:graph.nodes().length,edges:graph.edges().length};
 ingestMovieMetadata(graph,movie);
 assert.deepEqual({nodes:graph.nodes().length,edges:graph.edges().length},first);
});

test('batch builder ignores unusable metadata and never invents relationships',async()=>{
 const {buildCinemaGraph}=await import('../lib/search/cinema-graph.js');
 const graph=buildCinemaGraph([{year:2001,actors:['Nobody']},{title:'Minimal Movie'}]);
 assert.equal(graph.nodes().length,1);
 assert.equal(graph.edges().length,0);
 assert.equal(graph.nodes()[0].label,'Minimal Movie');
});
