import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFilmographyRecord, partitionFilmography } from '../../lib/search/filmography.js';

test('complete filmography keeps titles even when no current offer exists', () => {
  const records = [
    buildFilmographyRecord({workId:'Q1',title:'Film A',year:1994,role:'director'}, null),
    buildFilmographyRecord(
      {workId:'Q2',title:'Film B',year:1995,role:'director'},
      {id:'tm2',title:'Film B',year:1995,mediaType:'MOVIE',offers:[{provider:'Max',type:'FLATRATE',timeline:{status:'NOW'}}]}
    )
  ];

  const complete = partitionFilmography(records, {filmographyView:'complete'});
  assert.equal(complete.filmography.length, 2);
  assert.equal(complete.results.length, 2);
  assert.equal(complete.availabilitySummary.availableNow, 1);
  assert.equal(complete.availabilitySummary.unavailable, 1);
});

test('available view keeps the full filmography but filters results to watchable titles', () => {
  const records = [
    buildFilmographyRecord({workId:'Q1',title:'Film A',year:1994,role:'cast'}, null),
    buildFilmographyRecord(
      {workId:'Q2',title:'Film B',year:1995,role:'cast'},
      {id:'tm2',title:'Film B',year:1995,mediaType:'MOVIE',offers:[{provider:'Tubi',type:'FREE',timeline:{status:'NOW'}}]}
    )
  ];

  const available = partitionFilmography(records, {filmographyView:'available'});
  assert.equal(available.filmography.length, 2);
  assert.equal(available.results.length, 1);
  assert.equal(available.results[0].title, 'Film B');
});

test('availability errors mark a credit UNKNOWN instead of deleting it', () => {
  const record = buildFilmographyRecord(
    {workId:'Q3',title:'Film C',year:2001,role:'producer'},
    {error:'availability source 503'}
  );

  assert.equal(record.title, 'Film C');
  assert.equal(record.availabilityStatus, 'UNKNOWN');
  assert.deepEqual(record.offers, []);
});

test('filmography records expose current streaming timeline entries', () => {
  const record = buildFilmographyRecord(
    {workId:'Q4',title:'Film D',year:2002,role:'producer'},
    {offers:[{provider:'Netflix',type:'FLATRATE',timeline:{provider:'Netflix',status:'NOW',accessType:'FLATRATE'}}]}
  );

  assert.equal(record.streamingTimeline.length, 1);
  assert.equal(record.streamingTimeline[0].status, 'NOW');
});
