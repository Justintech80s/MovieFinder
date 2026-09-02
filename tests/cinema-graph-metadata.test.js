import test from 'node:test';
import assert from 'node:assert/strict';

test('normalizes explicit movie metadata and derives decade era',async()=>{
 const {normalizeMovieMetadata}=await import('../lib/search/cinema-graph/metadata.js');
 const normalized=normalizeMovieMetadata({
  id:'movie:parallax',title:' The Parallax View ',year:1974,
  cast:['Warren Beatty',{id:'person:paula',name:'Paula Prentiss'}],
  director:'Alan J. Pakula',writer:['David Giler'],genres:['Thriller','Thriller'],
  country:'United States',themes:['conspiracy'],styles:['paranoid'],movements:['New Hollywood']
 },{provenance:'fixture',confidence:.9});
 assert.equal(normalized.movie.id,'movie:parallax');
 assert.equal(normalized.movie.label,'The Parallax View');
 assert.equal(normalized.era.label,'1970s');
 assert.equal(normalized.people.filter(x=>x.role==='actor').length,2);
 assert.equal(normalized.people.filter(x=>x.role==='director').length,1);
 assert.equal(normalized.genres.length,1);
 assert.equal(normalized.provenance,'fixture');
 assert.equal(normalized.confidence,.9);
});

test('fallback identities are deterministic and duplicate people collapse',async()=>{
 const {normalizeMovieMetadata}=await import('../lib/search/cinema-graph/metadata.js');
 const a=normalizeMovieMetadata({title:'Heat',year:1995,actors:['Al Pacino',' Al   Pacino ']});
 const b=normalizeMovieMetadata({title:'Heat',year:1995,actors:['Al Pacino']});
 assert.equal(a.movie.id,b.movie.id);
 assert.equal(a.people.length,1);
 assert.match(a.movie.id,/1995/);
});

test('invalid metadata is ignored instead of invented',async()=>{
 const {normalizeMovieMetadata}=await import('../lib/search/cinema-graph/metadata.js');
 assert.equal(normalizeMovieMetadata({year:'not-a-year',actors:['Nobody']}),null);
 const normalized=normalizeMovieMetadata({title:'Unknown Year',year:'future-ish'});
 assert.equal(normalized.era,null);
 assert.deepEqual(normalized.people,[]);
 assert.deepEqual(normalized.themes,[]);
});
