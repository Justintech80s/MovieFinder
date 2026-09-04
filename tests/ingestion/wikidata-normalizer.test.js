import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeWikidataBatch } from '../../lib/ingestion/wikidata-normalizer.js';

const itemClaim = qid => [{ mainsnak: { datavalue: { value: { 'entity-type': 'item', id: qid } } } }];
const stringClaim = value => [{ mainsnak: { datavalue: { value } } }];
const timeClaim = time => [{ mainsnak: { datavalue: { value: { time } } } }];

test('normalizer maps supported cinema claims deterministically with provenance', () => {
  const retrievedAt = '2026-09-02T08:00:00.000Z';
  const entities = {
    Q100: {
      id: 'Q100',
      labels: { en: { value: 'Example Film' } },
      descriptions: { en: { value: 'film' } },
      claims: {
        P31: itemClaim('Q11424'),
        P161: itemClaim('Q200'),
        P57: itemClaim('Q300'),
        P58: itemClaim('Q400'),
        P162: itemClaim('Q500'),
        P344: itemClaim('Q600'),
        P136: itemClaim('Q700'),
        P495: itemClaim('Q800'),
        P577: timeClaim('+1999-01-01T00:00:00Z'),
        P345: stringClaim('tt0123456'),
        P999999: stringClaim('ignored')
      }
    },
    Q200: { id: 'Q200', labels: { en: { value: 'Actor' } }, claims: { P31: itemClaim('Q5') } }
  };

  const result = normalizeWikidataBatch({ entities, retrievedAt });
  const film = result.entities.find(entity => entity.canonicalKey === 'wikidata:Q100');

  assert.equal(film.entityType, 'Movie');
  assert.equal(film.properties.releaseYear, 1999);
  assert.equal(film.properties.imdbId, 'tt0123456');
  assert.deepEqual(film.source, {
    source: 'wikidata',
    externalId: 'Q100',
    sourceUrl: 'https://www.wikidata.org/wiki/Q100',
    retrievedAt
  });

  assert.deepEqual(
    result.relations.map(relation => relation.relationType).sort(),
    ['ACTED_IN', 'DIRECTED', 'FROM_COUNTRY', 'HAS_GENRE', 'PRODUCED', 'SHOT_BY', 'WROTE'].sort()
  );

  const acted = result.relations.find(relation => relation.relationType === 'ACTED_IN');
  assert.equal(acted.fromCanonicalKey, 'wikidata:Q200');
  assert.equal(acted.toCanonicalKey, 'wikidata:Q100');

  const directed = result.relations.find(relation => relation.relationType === 'DIRECTED');
  assert.equal(directed.fromCanonicalKey, 'wikidata:Q300');
  assert.equal(directed.toCanonicalKey, 'wikidata:Q100');

  const genre = result.relations.find(relation => relation.relationType === 'HAS_GENRE');
  assert.equal(genre.fromCanonicalKey, 'wikidata:Q100');
  assert.equal(genre.toCanonicalKey, 'wikidata:Q700');
  assert.ok(result.skipped >= 1);
});

test('normalizer deduplicates identical relations', () => {
  const entities = {
    Q10: {
      id: 'Q10', labels: { en: { value: 'Film' } }, claims: {
        P31: itemClaim('Q11424'),
        P57: [...itemClaim('Q20'), ...itemClaim('Q20')]
      }
    }
  };

  const result = normalizeWikidataBatch({ entities, retrievedAt: '2026-09-02T08:00:00.000Z' });
  assert.equal(result.relations.filter(r => r.relationType === 'DIRECTED').length, 1);
});


test('normalizer stores theme and influence relationships with provenance', () => {
  const entities={
    Q100:{
      id:'Q100',
      labels:{en:{value:'Example Film'}},
      claims:{
        P31:itemClaim('Q11424'),
        P921:itemClaim('Q900'),
        P737:itemClaim('Q901')
      }
    },
    Q900:{id:'Q900',labels:{en:{value:'Surveillance'}},claims:{}},
    Q901:{id:'Q901',labels:{en:{value:'Blow-Up'}},claims:{P31:itemClaim('Q11424')}}
  };
  const result=normalizeWikidataBatch({entities,retrievedAt:'2026-09-04T18:30:00.000Z'});
  const theme=result.relations.find(r=>r.relationType==='HAS_THEME');
  const influence=result.relations.find(r=>r.relationType==='INFLUENCED_BY');
  assert.equal(theme.fromCanonicalKey,'wikidata:Q100');
  assert.equal(theme.toCanonicalKey,'wikidata:Q900');
  assert.equal(influence.fromCanonicalKey,'wikidata:Q100');
  assert.equal(influence.toCanonicalKey,'wikidata:Q901');
  assert.equal(influence.source.source,'wikidata');
});

test('normalizer classifies known genre and country targets as structured graph entities', () => {
  const entities={
    Q700:{id:'Q700',labels:{en:{value:'Crime film'}},claims:{P31:itemClaim('Q201658')}},
    Q800:{id:'Q800',labels:{en:{value:'United States of America'}},claims:{P31:itemClaim('Q6256')}}
  };
  const result=normalizeWikidataBatch({entities,retrievedAt:'2026-09-04T18:30:00.000Z'});
  assert.equal(result.entities.find(e=>e.canonicalKey==='wikidata:Q700').entityType,'Genre');
  assert.equal(result.entities.find(e=>e.canonicalKey==='wikidata:Q800').entityType,'Country');
});
