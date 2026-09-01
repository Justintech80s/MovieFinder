import test from 'node:test';
import assert from 'node:assert/strict';
import { creditPropertiesForRole, normalizeCreditBindings } from '../../lib/search/people.js';

test('maps actor director and producer roles to Wikidata properties', () => {
  assert.deepEqual(creditPropertiesForRole('cast'), [{ role:'cast', property:'P161' }]);
  assert.deepEqual(creditPropertiesForRole('director'), [{ role:'director', property:'P57' }]);
  assert.deepEqual(creditPropertiesForRole('producer'), [{ role:'producer', property:'P162' }]);
});

test('all credits expands to all supported first-class roles', () => {
  assert.deepEqual(creditPropertiesForRole('all'), [
    { role:'cast', property:'P161' },
    { role:'director', property:'P57' },
    { role:'producer', property:'P162' }
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

test('deduplicates the same work within a role but keeps cross-role credits separate', () => {
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
