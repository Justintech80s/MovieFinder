import test from 'node:test';
import assert from 'node:assert/strict';
import { JUSTWATCH_QUERY } from '../../api/search.js';
import { resolvePersonCredits } from '../../lib/search/people.js';

test('live JustWatch query accepts MovieFinder schema and returns The Godfather', async () => {
  const response = await fetch('https://apis.justwatch.com/graphql', {
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json'},
    body:JSON.stringify({
      query:JUSTWATCH_QUERY,
      variables:{country:'US',language:'en',first:10,search:'The Godfather'}
    })
  });
  assert.equal(response.ok,true,`JustWatch HTTP ${response.status}`);
  const body = await response.json();
  assert.deepEqual(body.errors ?? [], [], `JustWatch GraphQL errors: ${JSON.stringify(body.errors)}`);
  const titles=(body.data?.popularTitles?.edges||[]).map(edge=>edge.node?.content?.title).filter(Boolean);
  assert.ok(titles.includes('The Godfather'),`The Godfather missing from ${JSON.stringify(titles)}`);
});

test('live Wikidata resolver returns Quentin Tarantino director credits', async () => {
  const result=await resolvePersonCredits('Quentin Tarantino','director');
  assert.equal(result.person?.name,'Quentin Tarantino');
  assert.ok(result.credits.length>0,'No Quentin Tarantino director credits returned');
  assert.ok(result.credits.some(credit=>credit.title==='Pulp Fiction'),`Pulp Fiction missing from ${JSON.stringify(result.credits.slice(0,20))}`);
});
