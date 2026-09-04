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

test('complete person search returns credits without performing availability fan-out', async () => {
  const intent={personName:'Quentin Tarantino',role:'director',filmographyView:'complete'};
  const resolveCredits=async()=>({
    person:{id:'Q3772',name:'Quentin Tarantino',source:'Wikidata'},
    credits:[
      {workId:'Q1',title:'Pulp Fiction',year:1994,role:'director'},
      {workId:'Q2',title:'Jackie Brown',year:1997,role:'director'}
    ],
    verified:true
  });
  let availabilityCalls=0;
  const lookupAvailability=async()=>{ availabilityCalls+=1; return null; };

  const result=await runPersonFilmographySearch(intent,{resolveCredits,lookupAvailability,rank:items=>items,availabilityLimit:60});

  assert.equal(availabilityCalls,0);
  assert.equal(result.filmography.length,2);
  assert.equal(result.results.length,2);
  assert.ok(result.filmography.every(x=>x.availabilityStatus==='UNKNOWN'));
});

test('person search merges the same movie across roles before availability lookup', async () => {
  const intent={personName:'Quentin Tarantino',role:'all',filmographyView:'available'};
  const resolveCredits=async()=>({
    person:{id:'Q3772',name:'Quentin Tarantino',source:'Wikidata'},
    credits:[
      {workId:'Q1',title:'Pulp Fiction',year:1994,role:'cast'},
      {workId:'Q1',title:'Pulp Fiction',year:1994,role:'director'},
      {workId:'Q1',title:'Pulp Fiction',year:1994,role:'writer'},
      {workId:'Q2',title:'Jackie Brown',year:1997,role:'director'}
    ],
    verified:true
  });
  const availabilityCalls=[];
  const lookupAvailability=async credit=>{
    availabilityCalls.push(credit.title);
    return {id:`stream-${credit.workId}`,title:credit.title,year:credit.year,mediaType:'MOVIE',offers:[{provider:'Example',type:'FLATRATE',timeline:{status:'NOW'}}]};
  };

  const result=await runPersonFilmographySearch(intent,{resolveCredits,lookupAvailability,rank:items=>items,availabilityLimit:60});
  const pulp=result.filmography.find(x=>x.title==='Pulp Fiction');

  assert.equal(result.filmography.filter(x=>x.title==='Pulp Fiction').length,1);
  assert.deepEqual(pulp.roles,['director','writer','cast']);
  assert.equal(pulp.role,'director');
  assert.equal(availabilityCalls.filter(title=>title==='Pulp Fiction').length,1);
  assert.equal(availabilityCalls.length,2);
});


test('person filmography provider constraint returns only movies with matching live provider offers', async () => {
  const intent={personName:'Martin Scorsese',role:'director',filmographyView:'available',provider:'Prime Video',freeOnly:false,rentOnly:false,buyOnly:false};
  const resolveCredits=async()=>({
    person:{id:'Q41148',name:'Martin Scorsese',source:'Wikidata'},
    credits:[
      {workId:'Q1',title:'Film A',year:1990,role:'director'},
      {workId:'Q2',title:'Film B',year:1995,role:'director'}
    ],
    verified:true
  });
  const lookupAvailability=async credit=>({
    id:credit.workId,
    title:credit.title,
    year:credit.year,
    mediaType:'MOVIE',
    offers:credit.workId==='Q1'
      ? [{provider:'Prime Video',type:'FLATRATE',timeline:{status:'NOW'}},{provider:'Max',type:'FLATRATE',timeline:{status:'NOW'}}]
      : [{provider:'Max',type:'FLATRATE',timeline:{status:'NOW'}}]
  });

  const result=await runPersonFilmographySearch(intent,{resolveCredits,lookupAvailability,rank:items=>items});

  assert.equal(result.filmography.length,2);
  assert.deepEqual(result.results.map(x=>x.title),['Film A']);
  assert.deepEqual(result.results[0].offers.map(x=>x.provider),['Prime Video']);
});

test('person filmography free constraint excludes subscription rent and buy offers', async () => {
  const intent={personName:'Quentin Tarantino',role:'all',filmographyView:'available',provider:null,freeOnly:true,rentOnly:false,buyOnly:false};
  const resolveCredits=async()=>({
    person:{id:'Q3772',name:'Quentin Tarantino',source:'Wikidata'},
    credits:[{workId:'Q1',title:'Film A',year:1994,role:'director'}],
    verified:true
  });
  const lookupAvailability=async()=>({
    id:'Q1',title:'Film A',year:1994,mediaType:'MOVIE',
    offers:[
      {provider:'Tubi',type:'ADS',timeline:{status:'NOW'}},
      {provider:'Netflix',type:'FLATRATE',timeline:{status:'NOW'}},
      {provider:'Apple TV Store',type:'RENT',timeline:{status:'NOW'}}
    ]
  });

  const result=await runPersonFilmographySearch(intent,{resolveCredits,lookupAvailability,rank:items=>items});

  assert.equal(result.results.length,1);
  assert.deepEqual(result.results[0].offers.map(x=>x.type),['ADS']);
});

test('person filmography rent and buy constraints are enforced independently', async () => {
  const resolveCredits=async()=>({
    person:{id:'Q85',name:'Spike Lee',source:'Wikidata'},
    credits:[{workId:'Q1',title:'Film A',year:1989,role:'director'}],
    verified:true
  });
  const lookupAvailability=async()=>({
    id:'Q1',title:'Film A',year:1989,mediaType:'MOVIE',
    offers:[
      {provider:'Amazon Video',type:'RENT',timeline:{status:'NOW'}},
      {provider:'Amazon Video',type:'BUY',timeline:{status:'NOW'}},
      {provider:'Prime Video',type:'FLATRATE',timeline:{status:'NOW'}}
    ]
  });

  const rent=await runPersonFilmographySearch(
    {personName:'Spike Lee',role:'director',filmographyView:'available',provider:null,freeOnly:false,rentOnly:true,buyOnly:false},
    {resolveCredits,lookupAvailability,rank:items=>items}
  );
  const buy=await runPersonFilmographySearch(
    {personName:'Spike Lee',role:'director',filmographyView:'available',provider:null,freeOnly:false,rentOnly:false,buyOnly:true},
    {resolveCredits,lookupAvailability,rank:items=>items}
  );

  assert.deepEqual(rent.results[0].offers.map(x=>x.type),['RENT']);
  assert.deepEqual(buy.results[0].offers.map(x=>x.type),['BUY']);
});

test('person filmography keeps failed constrained availability lookups UNKNOWN in the full filmography', async () => {
  const intent={personName:'Denzel Washington',role:'all',filmographyView:'available',provider:'Netflix',freeOnly:false,rentOnly:false,buyOnly:false};
  const resolveCredits=async()=>({
    person:{id:'Q42101',name:'Denzel Washington',source:'Wikidata'},
    credits:[
      {workId:'Q1',title:'Film A',year:2001,role:'cast'},
      {workId:'Q2',title:'Film B',year:2004,role:'cast'}
    ],
    verified:true
  });
  const lookupAvailability=async credit=>{
    if(credit.workId==='Q1') throw new Error('availability source timeout');
    return {id:'Q2',title:'Film B',year:2004,mediaType:'MOVIE',offers:[{provider:'Netflix',type:'FLATRATE',timeline:{status:'NOW'}}]};
  };

  const result=await runPersonFilmographySearch(intent,{resolveCredits,lookupAvailability,rank:items=>items});

  assert.equal(result.filmography.length,2);
  assert.equal(result.filmography.find(x=>x.workId==='Q1').availabilityStatus,'UNKNOWN');
  assert.deepEqual(result.results.map(x=>x.title),['Film B']);
  assert.equal(result.availabilitySummary.unknown,1);
});
