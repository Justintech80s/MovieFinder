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
