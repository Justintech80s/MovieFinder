import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchOrchestrator } from '../../lib/search/orchestrator.js';

test('orchestrator returns compatible results plus intelligence metadata', async () => {
  const orchestrator = createSearchOrchestrator({
    parseIntent: query => ({ raw: query, people: ['Gene Hackman'], genres: ['thriller'] }),
    findFilmography: async () => [{ id: 'movie:conversation', title: 'The Conversation', year: 1974 }],
    checkAvailability: async movie => ({ ...movie, availability: { provider: 'Example', region: 'US' } }),
    rankResults: items => items,
    relationEvidence: movie => [{ source: 'cinema-graph', kind: 'relation', claim: 'actor credit', value: movie.id, quality: 1 }],
    now: () => new Date('2026-09-02T12:00:00Z')
  });

  const response = await orchestrator.search('Gene Hackman thrillers streaming', { region: 'US' });
  assert.equal(response.results[0].title, 'The Conversation');
  assert.ok(Array.isArray(response.results[0].evidence));
  assert.equal(response.results[0].confidence, 1);
  assert.equal(response.results[0].verification.availability.state, 'available');
  assert.equal(response.plan.version, 1);
});

test('orchestrator degrades to unknown when availability lookup is absent', async () => {
  const orchestrator = createSearchOrchestrator({
    parseIntent: query => ({ raw: query }),
    findFilmography: async () => [{ title: 'Example' }],
    rankResults: items => items
  });
  const response = await orchestrator.search('Example streaming', { region: 'US' });
  assert.equal(response.results[0].verification.availability.state, 'unknown');
});
