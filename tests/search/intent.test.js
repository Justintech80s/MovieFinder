import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../../lib/search/intent.js';

test('generic Quentin Tarantino movie search requests all roles before title parsing', () => {
  const p = parseIntent('Where can I find all of Quentin Tarantino movies to stream?');
  assert.equal(p.kind, 'person-filmography');
  assert.equal(p.personName, 'Quentin Tarantino');
  assert.equal(p.role, 'all');
  assert.equal(p.titleQuery, null);
});

test('detects explicit directed-by wording', () => {
  const p = parseIntent('films directed by Christopher Nolan');
  assert.equal(p.kind, 'person-filmography');
  assert.equal(p.personName, 'Christopher Nolan');
  assert.equal(p.role, 'director');
});

test('generic actor filmography search requests all supported roles', () => {
  const p = parseIntent('All Denzel Washington films available on streaming');
  assert.equal(p.kind, 'person-filmography');
  assert.equal(p.personName, 'Denzel Washington');
  assert.equal(p.role, 'all');
});

test('preserves free intent for actor filmography', () => {
  const p = parseIntent('All Will Smith movies available free');
  assert.equal(p.personName, 'Will Smith');
  assert.equal(p.role, 'all');
  assert.equal(p.freeOnly, true);
});

test('does not mistake a normal movie title query for a person', () => {
  const p = parseIntent('Where can I watch The Godfather?');
  assert.notEqual(p.kind, 'person-filmography');
});

test('detects producer filmography search', () => {
  const p = parseIntent('movies produced by Jerry Bruckheimer');
  assert.equal(p.kind, 'person-filmography');
  assert.equal(p.personName, 'Jerry Bruckheimer');
  assert.equal(p.role, 'producer');
  assert.equal(p.filmographyView, 'complete');
});

test('detects all credits and complete view', () => {
  const p = parseIntent('all credits for Clint Eastwood');
  assert.equal(p.kind, 'person-filmography');
  assert.equal(p.personName, 'Clint Eastwood');
  assert.equal(p.role, 'all');
  assert.equal(p.filmographyView, 'complete');
});

test('streaming wording selects available view', () => {
  const p = parseIntent('All Denzel Washington films available on streaming');
  assert.equal(p.filmographyView, 'available');
});

test('plain filmography wording selects complete view', () => {
  const p = parseIntent('Quentin Tarantino filmography');
  assert.equal(p.kind, 'person-filmography');
  assert.equal(p.personName, 'Quentin Tarantino');
  assert.equal(p.role, 'all');
  assert.equal(p.filmographyView, 'complete');
});


test('parses explicit TV-series intent and removes it from title identity', () => {
  const p=parseIntent('The Office TV show');
  assert.equal(p.kind,'catalog');
  assert.equal(p.mediaType,'SHOW');
});

test('parses requested TV season number without treating it as a release year', () => {
  const p=parseIntent('The Office season 2');
  assert.equal(p.mediaType,'SHOW');
  assert.equal(p.requestedSeason,2);
  assert.equal(p.yearMin,null);
  assert.equal(p.yearMax,null);
});


test('parses TV season and episode intent without treating episode number as title text', () => {
  const p=parseIntent('The Office season 2 episode 1');
  assert.equal(p.mediaType,'SHOW');
  assert.equal(p.requestedSeason,2);
  assert.equal(p.requestedEpisode,1);
});


test('parses Best Heist Films as ranked discovery instead of a literal title search',()=>{
  const p=parseIntent('Best Heist Films');
  assert.equal(p.kind,'discovery');
  assert.equal(p.mediaType,'MOVIE');
  assert.equal(p.rankingIntent,'best');
  assert.ok(p.concepts.includes('heist'));
  assert.ok(p.discoveryTerms.includes('robbery'));
});

test('parses Car Films as automotive discovery',()=>{
  const p=parseIntent('Car Films');
  assert.equal(p.kind,'discovery');
  assert.equal(p.mediaType,'MOVIE');
  assert.ok(p.concepts.includes('car'));
  assert.ok(p.discoveryTerms.includes('racing'));
  assert.ok(p.discoveryTerms.includes('car chase'));
});

test('parses broader natural-language movie discovery vocabulary',()=>{
  const cases=[
    ['underrated prison escape movies','prison escape','underrated'],
    ['great samurai films','samurai','best'],
    ['best mob movies','mob','best'],
    ['cult martial arts films','martial arts','cult'],
    ['highest rated spy movies','spy','highest-rated'],
    ['movies about serial killers','serial killer',null]
  ];
  for(const [query,concept,ranking] of cases){
    const p=parseIntent(query);
    assert.equal(p.kind,'discovery',query);
    assert.ok(p.concepts.includes(concept),query);
    assert.equal(p.rankingIntent,ranking,query);
  }
});


test('unknown category phrases still become bounded discovery intent',()=>{
  const p=parseIntent('best courtroom films');
  assert.equal(p.kind,'discovery');
  assert.equal(p.rankingIntent,'best');
  assert.ok(p.concepts.includes('courtroom'));
  assert.ok(p.discoveryTerms.includes('courtroom'));
});

test('generic about phrasing becomes discovery without hijacking known person filmography',()=>{
  const p=parseIntent('movies about journalism');
  assert.equal(p.kind,'discovery');
  assert.ok(p.concepts.includes('journalism'));
  const person=parseIntent('All Denzel Washington films');
  assert.equal(person.kind,'person-filmography');
  assert.equal(person.personName,'Denzel Washington');
});

test('generic discovery extraction strips ranking and media filler words',()=>{
  const p=parseIntent('top political corruption movies');
  assert.equal(p.kind,'discovery');
  assert.ok(p.concepts.includes('political corruption'));
  assert.ok(!p.discoveryTerms.includes('top'));
  assert.ok(!p.discoveryTerms.includes('movies'));
});


test('simple conversational discovery wording is understood',()=>{
  const cases=[
    ['show me courtroom movies','courtroom'],
    ['find car chase films','car'],
    ['give me movies about journalism','journalism'],
    ['I want political corruption movies','political corruption'],
    ['recommend heist movies','heist']
  ];
  for(const [query,concept] of cases){
    const p=parseIntent(query);
    assert.equal(p.kind,'discovery',query);
    assert.ok(p.concepts.includes(concept),query);
  }
});

test('simple recommendation words do not become discovery concepts',()=>{
  const p=parseIntent('recommend courtroom movies');
  assert.deepEqual(p.concepts,['courtroom']);
  assert.deepEqual(p.discoveryTerms,['courtroom']);
});


test('simple discovery keeps provider, decade and free filters separate from the concept',()=>{
  const p=parseIntent('show me free courtroom movies from the 1990s on Tubi');
  assert.equal(p.kind,'discovery');
  assert.ok(p.concepts.includes('courtroom'));
  assert.equal(p.provider,'Tubi');
  assert.equal(p.freeOnly,true);
  assert.equal(p.yearMin,1990);
  assert.equal(p.yearMax,1999);
  assert.ok(!p.discoveryTerms.some(term=>/free|1990|tubi/i.test(term)));
});

test('simple discovery keeps genre filters separate from unknown subject concept',()=>{
  const p=parseIntent('recommend political corruption thriller movies');
  assert.equal(p.kind,'discovery');
  assert.ok(p.concepts.includes('political corruption'));
  assert.ok(p.genreWords.includes('thriller'));
  assert.ok(!p.discoveryTerms.includes('thriller'));
});
