import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchEvent, buildProviderClickEvent, recordEventBestEffort } from '../../lib/analytics/events.js';

test('buildSearchEvent stores only approved sanitized search dimensions', () => {
  const event=buildSearchEvent({
    type:'search_completed',
    query:'scary movies jane@example.com',
    parsed:{genreWords:['horror'],provider:'Netflix',personName:null,role:null,yearMin:1990,yearMax:1999,ignored:'secret'},
    resultCount:12,
    identity:{visitorKey:'v',sessionKey:'s'},
    occurredAt:'2026-09-01T12:00:00Z'
  });
  assert.equal(event.event_type,'search_completed');
  assert.equal(event.query_text,'scary movies [redacted-email]');
  assert.deepEqual(event.genre_words,['horror']);
  assert.equal(event.requested_provider,'Netflix');
  assert.equal(event.year_min,1990);
  assert.equal(event.year_max,1999);
  assert.equal(event.result_count,12);
  assert.ok(!('ignored' in event));
});

test('buildSearchEvent constrains failure codes', () => {
  const event=buildSearchEvent({
    type:'search_failed',query:'The Godfather',parsed:{},resultCount:0,errorCode:'arbitrary-stack-text',
    identity:{visitorKey:'v',sessionKey:'s'},occurredAt:'2026-09-01T12:00:00Z'
  });
  assert.equal(event.error_code,'search_internal_error');
});

test('buildProviderClickEvent stores outbound intent fields only', () => {
  const event=buildProviderClickEvent({
    identity:{visitorKey:'v',sessionKey:'s'},occurredAt:'2026-09-01T12:00:00Z',
    movieId:'m1',movieTitle:'The Godfather',movieYear:1972,provider:'Prime Video',monetizationType:'RENT',price:3.99,
    destination:'https://example.com/watch'
  });
  assert.equal(event.event_type,'provider_click');
  assert.equal(event.movie_title,'The Godfather');
  assert.equal(event.provider,'Prime Video');
  assert.equal(event.monetization_type,'RENT');
  assert.equal(event.price,3.99);
  assert.ok(!('destination' in event));
});

test('recordEventBestEffort isolates database failure', async () => {
  let warned=false;
  const ok=await recordEventBestEffort({
    store:{insertEvent:async()=>{throw new Error('database unavailable');}},
    event:{event_type:'search_completed'},
    logger:{warn:()=>{warned=true;}}
  });
  assert.equal(ok,false);
  assert.equal(warned,true);
});
