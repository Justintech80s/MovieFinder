import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldUseExactTitleMode, selectExactTitleResults } from '../../lib/search/exact-title-results.js';

test('plain movie titles and title-plus-availability requests use exact-title mode', () => {
  assert.equal(shouldUseExactTitleMode({ query: 'Inception', titleQuery: 'Inception', parsedIntent: { genreWords: [] } }), true);
  assert.equal(shouldUseExactTitleMode({ query: 'Inception rent', titleQuery: 'Inception', parsedIntent: { genreWords: [], rentOnly: true } }), true);
});

test('discovery and similarity queries do not use exact-title mode', () => {
  assert.equal(shouldUseExactTitleMode({ query: '1990s crime movies', titleQuery: '1990s crime movies', parsedIntent: { genreWords: ['crime'], yearMin: 1990, yearMax: 1999 } }), false);
  assert.equal(shouldUseExactTitleMode({ query: 'movies like Inception', titleQuery: 'movies like Inception', parsedIntent: { genreWords: [], similarityTitle: 'Inception' } }), false);
});

test('exact-title mode returns only the canonical matching movie', () => {
  const results = selectExactTitleResults([
    { id: 'inception-short', title: 'Inception: The Cobol Job', year: 2010 },
    { id: 'inception', title: 'Inception', year: 2010 },
    { id: 'unrelated', title: 'Interstellar', year: 2014 }
  ], { titleQuery: 'Inception' });

  assert.deepEqual(results.map(movie => movie.id), ['inception']);
});

test('exact-title mode respects an explicitly requested year when duplicate titles exist', () => {
  const results = selectExactTitleResults([
    { id: 'old', title: 'The Thing', year: 1951 },
    { id: 'new', title: 'The Thing', year: 1982 }
  ], { titleQuery: 'The Thing', yearMin: 1982, yearMax: 1982 });

  assert.deepEqual(results.map(movie => movie.id), ['new']);
});
