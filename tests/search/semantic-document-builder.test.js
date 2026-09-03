import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSemanticDocuments,
  hashSemanticContent
} from '../../lib/search/semantic/document-builder.js';

test('buildSemanticDocuments creates deterministic provenance-aware movie documents', () => {
  const entity = {
    id: 'movie-1',
    type: 'Movie',
    label: 'The Example',
    properties: {
      summary: 'A surveillance thriller about memory and identity.',
      themes: ['memory', 'identity'],
      style: ['slow-burn', 'paranoid']
    }
  };

  const sources = [{ kind: 'wikidata', ref: 'Q123', url: 'https://www.wikidata.org/wiki/Q123' }];
  const docs = buildSemanticDocuments({ entity, relations: [], sources });

  assert.deepEqual(docs.map(doc => doc.documentType), ['movie_summary', 'movie_themes', 'movie_style']);
  assert.ok(docs.every(doc => doc.entityId === 'movie-1'));
  assert.ok(docs.every(doc => doc.language === 'en'));
  assert.ok(docs.every(doc => doc.provenance.some(item => item.ref === 'Q123')));
  assert.ok(docs.every(doc => /^[a-f0-9]{64}$/.test(doc.contentHash)));
});

test('hashSemanticContent normalizes whitespace deterministically', () => {
  const a = hashSemanticContent({
    documentType: 'movie_summary',
    entityId: 'movie-1',
    content: 'A  paranoid   thriller\nabout memory.',
    sourceRef: 'Q123'
  });
  const b = hashSemanticContent({
    documentType: 'movie_summary',
    entityId: 'movie-1',
    content: 'A paranoid thriller about memory.',
    sourceRef: 'Q123'
  });
  const changed = hashSemanticContent({
    documentType: 'movie_summary',
    entityId: 'movie-1',
    content: 'A paranoid thriller about identity.',
    sourceRef: 'Q123'
  });

  assert.equal(a, b);
  assert.notEqual(a, changed);
});

test('builder omits empty semantic documents and never invents text', () => {
  const docs = buildSemanticDocuments({
    entity: { id: 'movie-2', type: 'Movie', label: 'Minimal', properties: {} },
    relations: [],
    sources: []
  });
  assert.deepEqual(docs, []);
});
