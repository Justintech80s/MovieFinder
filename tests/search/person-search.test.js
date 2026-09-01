import test from 'node:test';
import assert from 'node:assert/strict';
import { runPersonFilmographySearch } from '../../lib/search/person-search.js';

test('person search preserves every credit when availability lookup fails for one title', async () => {
  const intent={personName:'Example Person',role:'producer',filmographyView:'available'};
  const resolveCredits=async()=>({
    person:{id:'Q10',name:'Example Person',source:'Wikidata'},
    credits:[
      {workId:'Q1',title:'Film A',year:1994,role:'producer'},
      {workId:'Q2',title:'Film B',year:1995,role:'producer'}
    ],
    verified:true
  });
  const lookupAvailability=async credit=>{
    if(credit.workId==='Q1') throw new Error('availability source 503');
    return {id:'tm2',title:'Film B',year:1995,mediaType:'MOVIE',offers:[{provider:'Max',type:'FLATRATE',timeline:{status:'NOW'}}]};
  };

  const result=await runPersonFilmographySearch(intent,{resolveCredits,lookupAvailability,rank:items=>items,availabilityLimit:10});

  assert.equal(result.filmography.length,2);
  assert.equal(result.results.length,1);
  assert.equal(result.filmography.find(x=>x.workId==='Q1').availabilityStatus,'UNKNOWN');
  assert.equal(result.availabilitySummary.unknown,1);
});

test('complete person search returns credits even without current offers', async () => {
  const intent={personName:'Example Person',role:'director',filmographyView:'complete'};
  const resolveCredits=async()=>({
    person:{id:'Q10',name:'Example Person',source:'Wikidata'},
    credits:[{workId:'Q1',title:'Film A',year:1994,role:'director'}],
    verified:true
  });

  const result=await runPersonFilmographySearch(intent,{resolveCredits,lookupAvailability:async()=>null,rank:items=>items,availabilityLimit:10});

  assert.equal(result.filmography.length,1);
  assert.equal(result.results.length,1);
  assert.equal(result.filmography[0].availabilityStatus,'UNAVAILABLE');
});
