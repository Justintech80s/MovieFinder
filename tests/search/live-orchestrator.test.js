import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldUseAi, buildVerifiedEvidence, createLiveOrchestrator } from '../../lib/search/live-orchestrator.js';

test('simple direct provider lookup skips AI', () => {
  assert.equal(shouldUseAi({
    query: 'Will Smith movies on Netflix',
    parsedIntent: {
      kind: 'person-filmography',
      person: 'Will Smith',
      provider: 'Netflix',
      concepts: []
    }
  }), false);
});

test('multi-concept relationship query requests AI-capable orchestration', () => {
  assert.equal(shouldUseAi({
    query: '1970s paranoid thrillers influenced by European cinema that are streaming now',
    parsedIntent: {
      kind: 'discovery',
      concepts: ['paranoia', 'influence', 'european-cinema']
    }
  }), true);
});

test('verified evidence contains only explicit supplied facts and is bounded', () => {
  const evidence = buildVerifiedEvidence({
    query: 'movies like The Conversation',
    parsedIntent: { kind: 'discovery' },
    graph: {
      entities: [{ id: 'm1', name: 'The Conversation' }],
      relations: [],
      paths: []
    },
    movies: [{ id: 'm1', title: 'The Conversation', year: 1974 }],
    currentAvailability: [{
      movieId: 'm1',
      provider: 'Max',
      checkedAt: '2026-09-02T12:00:00.000Z'
    }],
    constraints: {},
    provenance: [{ source: 'Wikidata', externalId: 'Q123' }],
    confidence: 0.93,
    env: { SECRET: 'must-not-leak' },
    headers: { authorization: 'must-not-leak' }
  });

  assert.equal(evidence.movies[0].title, 'The Conversation');
  assert.equal(evidence.currentAvailability[0].provider, 'Max');
  assert.equal('env' in evidence, false);
  assert.equal('headers' in evidence, false);
});

test('verified evidence caps graph, movie, availability, and provenance arrays', () => {
  const make = (count, prefix) => Array.from({ length: count }, (_, index) => ({ id: `${prefix}${index}` }));
  const evidence = buildVerifiedEvidence({
    query: 'complex cinema query',
    parsedIntent: { kind: 'discovery' },
    graph: {
      entities: make(50, 'entity-'),
      relations: make(90, 'relation-'),
      paths: make(30, 'path-')
    },
    movies: make(50, 'movie-'),
    currentAvailability: make(130, 'availability-'),
    constraints: {},
    provenance: make(90, 'source-'),
    confidence: 0.8
  });

  assert.equal(evidence.entities.length, 40);
  assert.equal(evidence.relations.length, 80);
  assert.equal(evidence.paths.length, 20);
  assert.equal(evidence.movies.length, 40);
  assert.equal(evidence.currentAvailability.length, 120);
  assert.equal(evidence.provenance.length, 80);
});

test('complex anchored query reads bounded persistent graph candidates', async () => {
  const nodes = new Map([
    ['movie:conversation', { id: 'movie:conversation', type: 'Movie', name: 'The Conversation', properties: { year: 1974 } }],
    ['theme:surveillance', { id: 'theme:surveillance', type: 'Theme', name: 'Surveillance' }],
    ['movie:parallax', { id: 'movie:parallax', type: 'Movie', name: 'The Parallax View', properties: { year: 1974 } }]
  ]);
  let traversalOptions = null;
  const graphStore = {
    async getNode(id) { return nodes.get(id) || null; },
    async traverse(startId, options) {
      assert.equal(startId, 'movie:conversation');
      traversalOptions = options;
      return [
        { from: 'movie:conversation', to: 'theme:surveillance', type: 'HAS_THEME' },
        { from: 'theme:surveillance', to: 'movie:parallax', type: 'RELATED_TO' }
      ];
    }
  };
  const orchestrator = createLiveOrchestrator({
    graphStore,
    deterministicSearch: async () => ({ parsed: {}, results: [] })
  });

  const result = await orchestrator.search({
    query: 'movies like The Conversation with surveillance themes',
    parsedIntent: {
      kind: 'discovery',
      similarityAnchor: 'movie:conversation',
      concepts: ['similarity', 'surveillance']
    }
  });

  assert.deepEqual(traversalOptions, { maxDepth: 3, maxResults: 40 });
  assert.equal(result.reasoningMode, 'graph');
  assert.deepEqual(result.results.map(movie => movie.title), ['The Conversation', 'The Parallax View']);
  assert.equal(result.evidence.relations.length, 2);
});

test('graph failure falls back to deterministic search without failing the request', async () => {
  let fallbackCalls = 0;
  const orchestrator = createLiveOrchestrator({
    graphStore: {
      async getNode() { return { id: 'movie:conversation', type: 'Movie', name: 'The Conversation' }; },
      async traverse() { throw new Error('db unavailable'); }
    },
    deterministicSearch: async () => {
      fallbackCalls += 1;
      return { parsed: { kind: 'discovery' }, results: [{ id: 'movie:heat', title: 'Heat', year: 1995 }] };
    }
  });

  const result = await orchestrator.search({
    query: 'movies like The Conversation',
    parsedIntent: { kind: 'discovery', similarityAnchor: 'movie:conversation', concepts: ['similarity'] }
  });

  assert.equal(fallbackCalls, 1);
  assert.equal(result.results[0].title, 'Heat');
  assert.equal(result.reasoningMode, 'deterministic');
});

test('provider-constrained graph results require current matching availability before inclusion', async () => {
  const nodes = new Map([
    ['movie:conversation', { id: 'movie:conversation', type: 'Movie', name: 'The Conversation', properties: { year: 1974 } }],
    ['movie:parallax', { id: 'movie:parallax', type: 'Movie', name: 'The Parallax View', properties: { year: 1974 } }]
  ]);
  const graphStore = {
    async getNode(id) { return nodes.get(id) || null; },
    async traverse() {
      return [{ from: 'movie:conversation', to: 'movie:parallax', type: 'RELATED_TO' }];
    }
  };
  const lookupAvailability = async movie => {
    if (movie.id === 'movie:parallax') {
      return { ...movie, offers: [{ provider: 'Netflix', type: 'FLATRATE', url: 'https://www.netflix.com/title/example' }] };
    }
    return { ...movie, offers: [{ provider: 'Max', type: 'FLATRATE', url: 'https://www.max.com/example' }] };
  };
  const orchestrator = createLiveOrchestrator({
    graphStore,
    lookupAvailability,
    deterministicSearch: async () => ({ parsed: {}, results: [] })
  });

  const result = await orchestrator.search({
    query: 'movies like The Conversation on Netflix',
    parsedIntent: {
      kind: 'discovery',
      similarityAnchor: 'movie:conversation',
      concepts: ['similarity'],
      provider: 'Netflix'
    }
  });

  assert.deepEqual(result.results.map(movie => movie.title), ['The Parallax View']);
  assert.equal(result.results[0].offers[0].provider, 'Netflix');
  assert.equal(result.evidence.currentAvailability.length, 1);
});

test('simple deterministic search never invokes the model router', async () => {
  let aiCalls = 0;
  const orchestrator = createLiveOrchestrator({
    modelRouter: {
      async run() {
        aiCalls += 1;
        throw new Error('AI should not be called');
      }
    },
    deterministicSearch: async () => ({
      parsed: { kind: 'person-filmography', person: 'Will Smith', provider: 'Netflix' },
      results: [{ id: 'movie:heat', title: 'Heat', year: 1995 }]
    })
  });

  const result = await orchestrator.search({
    query: 'Will Smith movies on Netflix',
    parsedIntent: { kind: 'person-filmography', person: 'Will Smith', provider: 'Netflix', concepts: [] }
  });

  assert.equal(aiCalls, 0);
  assert.equal(result.reasoningMode, 'deterministic');
});

test('complex graph search sends only verified evidence to the model router', async () => {
  const nodes = new Map([
    ['movie:conversation', { id: 'movie:conversation', type: 'Movie', name: 'The Conversation', properties: { year: 1974 } }],
    ['movie:parallax', { id: 'movie:parallax', type: 'Movie', name: 'The Parallax View', properties: { year: 1974 } }]
  ]);
  let captured = null;
  const orchestrator = createLiveOrchestrator({
    graphStore: {
      async getNode(id) { return nodes.get(id) || null; },
      async traverse() { return [{ from: 'movie:conversation', to: 'movie:parallax', type: 'RELATED_TO' }]; }
    },
    lookupAvailability: async movie => ({ ...movie, offers: [{ provider: 'Max', type: 'FLATRATE' }] }),
    modelRouter: {
      async run(capability, input, options) {
        captured = { capability, input, options };
        return { provider: 'test-provider', output: { model: 'test-model', content: 'Verified relationship explanation.' } };
      }
    },
    deterministicSearch: async () => ({ parsed: {}, results: [] })
  });

  const result = await orchestrator.search({
    query: 'movies like The Conversation with political surveillance themes',
    parsedIntent: { kind: 'discovery', similarityAnchor: 'movie:conversation', concepts: ['similarity', 'surveillance'] },
    headers: { authorization: 'must-not-leak' },
    env: { SECRET: 'must-not-leak' }
  });

  assert.equal(captured.capability, 'cinema_reasoning');
  assert.deepEqual(captured.input.evidence, result.evidence);
  assert.deepEqual(captured.options.context, result.evidence);
  assert.equal('headers' in captured.input.evidence, false);
  assert.equal('env' in captured.input.evidence, false);
  assert.equal(result.reasoningMode, 'graph+ai');
  assert.equal(result.ai.provider, 'test-provider');
  assert.equal(result.ai.model, 'test-model');
});

test('AI output cannot overwrite verified movie identity year or availability', async () => {
  const nodes = new Map([
    ['movie:conversation', { id: 'movie:conversation', type: 'Movie', name: 'The Conversation', properties: { year: 1974 } }]
  ]);
  const orchestrator = createLiveOrchestrator({
    graphStore: {
      async getNode(id) { return nodes.get(id) || null; },
      async traverse() { return []; }
    },
    lookupAvailability: async movie => ({ ...movie, offers: [{ provider: 'Max', type: 'FLATRATE' }] }),
    modelRouter: {
      async run() {
        return {
          provider: 'test-provider',
          output: {
            model: 'test-model',
            content: 'AI commentary only.',
            structuredData: {
              results: [{ id: 'movie:conversation', title: 'False Title', year: 2001, offers: [{ provider: 'Netflix' }] }]
            }
          }
        };
      }
    },
    deterministicSearch: async () => ({ parsed: {}, results: [] })
  });

  const result = await orchestrator.search({
    query: 'why is The Conversation an important surveillance film',
    parsedIntent: { kind: 'discovery', similarityAnchor: 'movie:conversation', concepts: ['surveillance'] }
  });

  assert.equal(result.results[0].title, 'The Conversation');
  assert.equal(result.results[0].year, 1974);
  assert.equal(result.results[0].offers[0].provider, 'Max');
  assert.equal(result.answer, 'AI commentary only.');
});

test('AI provider failure preserves verified graph results without propagating an error', async () => {
  const nodes = new Map([
    ['movie:conversation', { id: 'movie:conversation', type: 'Movie', name: 'The Conversation', properties: { year: 1974 } }]
  ]);
  let aiCalls = 0;
  const orchestrator = createLiveOrchestrator({
    graphStore: {
      async getNode(id) { return nodes.get(id) || null; },
      async traverse() { return []; }
    },
    modelRouter: {
      async run() {
        aiCalls += 1;
        throw Object.assign(new Error('provider timeout'), { code: 'MODEL_TIMEOUT' });
      }
    },
    deterministicSearch: async () => ({ parsed: {}, results: [] })
  });

  const result = await orchestrator.search({
    query: 'why is The Conversation influential',
    parsedIntent: { kind: 'discovery', similarityAnchor: 'movie:conversation', concepts: ['influence'] }
  });

  assert.equal(aiCalls, 1);
  assert.equal(result.results[0].title, 'The Conversation');
  assert.equal(result.reasoningMode, 'graph');
  assert.equal('ai' in result, false);
});

test('complex live cinema fixture combines graph relationships, current availability, and grounded AI reasoning', async () => {
  const nodes = new Map([
    ['movie:conversation', { id: 'movie:conversation', type: 'Movie', name: 'The Conversation', properties: { year: 1974 } }],
    ['theme:surveillance', { id: 'theme:surveillance', type: 'Theme', name: 'Political Surveillance' }],
    ['movie:parallax', { id: 'movie:parallax', type: 'Movie', name: 'The Parallax View', properties: { year: 1974 } }],
    ['movie:condor', { id: 'movie:condor', type: 'Movie', name: 'Three Days of the Condor', properties: { year: 1975 } }]
  ]);
  let capturedEvidence = null;

  const orchestrator = createLiveOrchestrator({
    graphStore: {
      async getNode(id) { return nodes.get(id) || null; },
      async traverse() {
        return [
          { from: 'movie:conversation', to: 'theme:surveillance', type: 'HAS_THEME' },
          { from: 'theme:surveillance', to: 'movie:parallax', type: 'RELATED_TO' },
          { from: 'theme:surveillance', to: 'movie:condor', type: 'RELATED_TO' }
        ];
      }
    },
    lookupAvailability: async movie => {
      const checkedAt = '2026-09-02T18:00:00.000Z';
      if (movie.id === 'movie:condor') {
        return { ...movie, checkedAt, offers: [{ provider: 'Netflix', type: 'FLATRATE', checkedAt }] };
      }
      return { ...movie, checkedAt, offers: [{ provider: 'Max', type: 'FLATRATE', checkedAt }] };
    },
    modelRouter: {
      async run(_capability, input) {
        capturedEvidence = input.evidence;
        const titles = input.evidence.movies.map(movie => movie.title);
        return {
          provider: 'fixture-ai',
          output: {
            model: 'fixture-model',
            content: `${titles.join(' and ')} are the verified currently-streaming surveillance matches.`
          }
        };
      }
    },
    deterministicSearch: async () => {
      throw new Error('complex fixture should not fall back to deterministic search');
    }
  });

  const result = await orchestrator.search({
    query: 'movies like The Conversation with political surveillance themes that are streaming now on Max',
    parsedIntent: {
      kind: 'discovery',
      similarityAnchor: 'movie:conversation',
      concepts: ['similarity', 'surveillance'],
      provider: 'Max'
    }
  });

  assert.equal(result.reasoningMode, 'graph+ai');
  assert.deepEqual(result.results.map(movie => movie.title), ['The Conversation', 'The Parallax View']);
  assert.deepEqual(result.results.map(movie => movie.offers[0].provider), ['Max', 'Max']);
  assert.deepEqual(result.evidence.movies.map(movie => movie.title), ['The Conversation', 'The Parallax View']);
  assert.equal(result.evidence.currentAvailability.length, 2);
  assert.equal(result.evidence.currentAvailability.every(offer => offer.provider === 'Max'), true);
  assert.deepEqual(capturedEvidence, result.evidence);
  assert.equal(result.answer, 'The Conversation and The Parallax View are the verified currently-streaming surveillance matches.');
  assert.equal(result.answer.includes('Three Days of the Condor'), false);
  assert.deepEqual(result.ai, { provider: 'fixture-ai', model: 'fixture-model' });
});


test('live discovery search uses hybrid candidates before deterministic fallback', async () => {
  let hybridCalls=0;
  let fallbackCalls=0;
  const orchestrator=createLiveOrchestrator({
    hybridRetriever:{
      async search({query,parsedIntent}){
        hybridCalls+=1;
        assert.equal(query,'crime movies like Heat');
        assert.equal(parsedIntent.kind,'discovery');
        return [
          {id:'heat',title:'Heat',year:1995,retrievalSources:['exact','semantic']},
          {id:'thief',title:'Thief',year:1981,retrievalSources:['semantic']}
        ];
      }
    },
    lookupAvailability:async movie=>({
      ...movie,
      offers:[{provider:'Example Streamer',type:'FLATRATE'}],
      checkedAt:'2026-09-05T15:00:00.000Z'
    }),
    deterministicSearch:async()=>{
      fallbackCalls+=1;
      return {parsed:{kind:'discovery'},results:[]};
    }
  });

  const result=await orchestrator.search({
    query:'crime movies like Heat',
    parsedIntent:{kind:'discovery',concepts:['similarity']}
  });

  assert.equal(hybridCalls,1);
  assert.equal(fallbackCalls,0);
  assert.equal(result.reasoningMode,'hybrid');
  assert.deepEqual(result.results.map(movie=>movie.id),['heat','thief']);
  assert.deepEqual(result.results[0].retrievalSources,['exact','semantic']);
});

test('hybrid retrieval failure falls back to existing deterministic search', async () => {
  let fallbackCalls=0;
  const orchestrator=createLiveOrchestrator({
    hybridRetriever:{async search(){throw new Error('hybrid unavailable');}},
    deterministicSearch:async()=>{
      fallbackCalls+=1;
      return {parsed:{kind:'discovery'},results:[{id:'heat',title:'Heat',year:1995}]};
    }
  });

  const result=await orchestrator.search({
    query:'crime movies',
    parsedIntent:{kind:'discovery'}
  });

  assert.equal(fallbackCalls,1);
  assert.equal(result.reasoningMode,'deterministic');
  assert.equal(result.results[0].title,'Heat');
});

test('person filmography keeps its existing deterministic person pipeline instead of hybrid fusion', async () => {
  let hybridCalls=0;
  const orchestrator=createLiveOrchestrator({
    hybridRetriever:{async search(){hybridCalls+=1;return [{id:'wrong',title:'Wrong'}];}},
    deterministicSearch:async()=>({
      parsed:{kind:'person-filmography'},
      results:[{id:'pf',title:'Pulp Fiction',year:1994}]
    })
  });

  const result=await orchestrator.search({
    query:'Quentin Tarantino movies',
    parsedIntent:{kind:'person-filmography',personName:'Quentin Tarantino'}
  });

  assert.equal(hybridCalls,0);
  assert.equal(result.results[0].title,'Pulp Fiction');
});
