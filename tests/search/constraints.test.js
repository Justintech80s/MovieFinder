import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesHardConstraints } from '../../lib/search/constraints.js';

const movie = (overrides={}) => ({
  year: 1994,
  genres: ['Crime','Drama'],
  ratings: { rottenTomatoes: 96 },
  offers: [{ provider: 'Netflix', type: 'FLATRATE', price: null }],
  ...overrides
});

test('rejects movies outside exact year or decade constraints', () => {
  assert.equal(matchesHardConstraints(movie(), {yearMin:1994, yearMax:1994}), true);
  assert.equal(matchesHardConstraints(movie({year:1995}), {yearMin:1994, yearMax:1994}), false);
  assert.equal(matchesHardConstraints(movie({year:1989}), {yearMin:1990, yearMax:1999}), false);
});

test('rejects movies below Rotten Tomatoes minimum or without a score', () => {
  assert.equal(matchesHardConstraints(movie(), {rtMin:90}), true);
  assert.equal(matchesHardConstraints(movie({ratings:{rottenTomatoes:89}}), {rtMin:90}), false);
  assert.equal(matchesHardConstraints(movie({ratings:{rottenTomatoes:null}}), {rtMin:90}), false);
});

test('requires all explicitly requested genres', () => {
  assert.equal(matchesHardConstraints(movie(), {genreWords:['crime']}), true);
  assert.equal(matchesHardConstraints(movie(), {genreWords:['crime','drama']}), true);
  assert.equal(matchesHardConstraints(movie(), {genreWords:['horror']}), false);
  assert.equal(matchesHardConstraints(movie({genres:['Science Fiction']}), {genreWords:['sci-fi']}), true);
});

test('enforces provider and offer-type constraints together', () => {
  assert.equal(matchesHardConstraints(movie(), {provider:'Netflix'}), true);
  assert.equal(matchesHardConstraints(movie(), {provider:'Hulu'}), false);
  assert.equal(matchesHardConstraints(movie(), {freeOnly:true}), false);
  assert.equal(matchesHardConstraints(movie({offers:[{provider:'Tubi',type:'ADS'}]}), {freeOnly:true}), true);
  assert.equal(matchesHardConstraints(movie({offers:[{provider:'Prime Video',type:'RENT'}]}), {provider:'Prime Video',rentOnly:true}), true);
});
