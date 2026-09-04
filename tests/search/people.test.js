import test from 'node:test';
import assert from 'node:assert/strict';
import { creditPropertiesForRole, normalizeCreditBindings } from '../../lib/search/people.js';

test('maps actor director producer and writer roles to Wikidata properties', () => {
  assert.deepEqual(creditPropertiesForRole('cast'), [{ role:'cast', property:'P161' }]);
  assert.deepEqual(creditPropertiesForRole('director'), [{ role:'director', property:'P57' }]);
  assert.deepEqual(creditPropertiesForRole('producer'), [{ role:'producer', property:'P162' }]);
  assert.deepEqual(creditPropertiesForRole('writer'), [{ role:'writer', property:'P58' }]);
});

test('all credits expands to all supported first-class roles including writer', () => {
  assert.deepEqual(creditPropertiesForRole('all'), [
    { role:'cast', property:'P161' },
    { role:'director', property:'P57' },
    { role:'producer', property:'P162' },
    { role:'writer', property:'P58' }
  ]);
});

test('normalizes stable work IDs and preserves role', () => {
  const credits = normalizeCreditBindings([
    {
      work:{value:'http://www.wikidata.org/entity/Q104123'},
      workLabel:{value:'Example Film'},
      date:{value:'1994-10-14T00:00:00Z'},
      imdb:{value:'tt0123456'}
    }
  ], 'director');

  assert.deepEqual(credits, [{
    workId:'Q104123',
    title:'Example Film',
    year:1994,
    imdbId:'tt0123456',
    role:'director',
    source:'Wikidata'
  }]);
});

test('deduplicates the same work within a role but keeps cross-role credits separate for later role aggregation', () => {
  const bindings = [
    { work:{value:'http://www.wikidata.org/entity/Q1'}, workLabel:{value:'Same Film'}, date:{value:'2000-01-01T00:00:00Z'} },
    { work:{value:'http://www.wikidata.org/entity/Q1'}, workLabel:{value:'Same Film'}, date:{value:'2000-05-01T00:00:00Z'} }
  ];
  assert.equal(normalizeCreditBindings(bindings, 'cast').length, 1);
  assert.notEqual(
    `${normalizeCreditBindings(bindings, 'cast')[0].workId}:cast`,
    `${normalizeCreditBindings(bindings, 'director')[0].workId}:director`
  );
});


test('person resolution retries a transient Wikidata failure before succeeding', async () => {
  const { resolvePerson } = await import('../../lib/search/people.js');
  const previousFetch=globalThis.fetch;
  let attempts=0;
  globalThis.fetch=async()=>{
    attempts+=1;
    if(attempts===1) return {ok:false,status:503,json:async()=>({})};
    return {ok:true,status:200,json:async()=>({search:[{id:'Q3772',label:'Quentin Tarantino',description:'American filmmaker'}]})};
  };
  try{
    const person=await resolvePerson('Quentin Tarantino');
    assert.equal(person.id,'Q3772');
    assert.equal(attempts,2);
  }finally{
    globalThis.fetch=previousFetch;
  }
});

test('all-role person credits preserve successful roles when one Wikidata role query fails', async () => {
  const { resolvePersonCredits } = await import('../../lib/search/people.js');
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async(url)=>{
    const value=String(url);
    if(value.includes('wbsearchentities')){
      return {ok:true,status:200,json:async()=>({search:[{id:'Q3772',label:'Quentin Tarantino'}]})};
    }
    const decoded=decodeURIComponent(value);
    if(decoded.includes('wdt:P162')) return {ok:false,status:503,json:async()=>({})};
    const roleTitle=decoded.includes('wdt:P57')?'Director Film':decoded.includes('wdt:P58')?'Writer Film':'Cast Film';
    const workId=decoded.includes('wdt:P57')?'Q1':decoded.includes('wdt:P58')?'Q2':'Q3';
    return {ok:true,status:200,json:async()=>({results:{bindings:[{
      work:{value:`http://www.wikidata.org/entity/${workId}`},
      workLabel:{value:roleTitle},
      date:{value:'1994-01-01T00:00:00Z'}
    }]}})};
  };
  try{
    const result=await resolvePersonCredits('Quentin Tarantino','all');
    assert.equal(result.person.id,'Q3772');
    assert.equal(result.partial,true);
    assert.deepEqual(result.failedRoles,['producer']);
    assert.deepEqual(result.credits.map(x=>x.role).sort(),['cast','director','writer']);
  }finally{
    globalThis.fetch=previousFetch;
  }
});
