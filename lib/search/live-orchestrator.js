import { matchesHardConstraints } from './constraints.js';
import { rankResults } from './rank.js';
import { createAIEnrichment } from './ai-enrichment.js';

const MAX_ENTITIES = 40;
const MAX_RELATIONS = 80;
const MAX_PATHS = 20;
const MAX_MOVIES = 40;
const MAX_AVAILABILITY = 120;
const MAX_PROVENANCE = 80;
const MAX_GRAPH_DEPTH = 3;
const MAX_GRAPH_CANDIDATES = 40;
const AVAILABILITY_CONCURRENCY = 6;

function boundedArray(value, max) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

export function shouldUseAi({ query = '', parsedIntent = {} } = {}) {
  const concepts = Array.isArray(parsedIntent.concepts) ? parsedIntent.concepts : [];
  const direct = parsedIntent.kind === 'person-filmography' || parsedIntent.kind === 'title';
  const relationshipLanguage = /\b(like|similar|influenc\w*|connected|relationship|compare|why|theme|movement)\b/i.test(query);
  const lowConfidence = Number.isFinite(parsedIntent.confidence) && parsedIntent.confidence < 0.7;

  return relationshipLanguage || concepts.length >= 2 || lowConfidence || !direct;
}

export function buildVerifiedEvidence({
  query = '',
  parsedIntent = {},
  graph = {},
  movies = [],
  currentAvailability = [],
  constraints = {},
  provenance = [],
  confidence = null
} = {}) {
  return {
    query,
    parsedIntent,
    entities: boundedArray(graph?.entities, MAX_ENTITIES),
    relations: boundedArray(graph?.relations, MAX_RELATIONS),
    paths: boundedArray(graph?.paths, MAX_PATHS),
    movies: boundedArray(movies, MAX_MOVIES),
    currentAvailability: boundedArray(currentAvailability, MAX_AVAILABILITY),
    constraints,
    provenance: boundedArray(provenance, MAX_PROVENANCE),
    confidence
  };
}

function nodeToMovie(node) {
  if (!node || String(node.type || '').toLowerCase() !== 'movie') return null;
  return {
    id: node.id,
    title: node.title || node.name || node.id,
    year: node.year ?? node.properties?.releaseYear ?? node.properties?.year ?? null
  };
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  }

  const count = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: count }, () => run()));
  return results;
}

function availabilityEvidence(movies = []) {
  return movies.flatMap(movie => boundedArray(movie?.offers, MAX_AVAILABILITY).map(offer => ({
    movieId: movie.id ?? null,
    title: movie.title ?? null,
    provider: offer?.provider ?? null,
    type: offer?.type ?? null,
    url: offer?.url ?? null,
    checkedAt: movie?.checkedAt ?? offer?.checkedAt ?? null
  }))).slice(0, MAX_AVAILABILITY);
}

async function verifyGraphAvailability(movies, parsedIntent, lookupAvailability) {
  const candidates = boundedArray(movies, MAX_GRAPH_CANDIDATES);
  if (typeof lookupAvailability !== 'function') {
    return {
      movies: candidates,
      currentAvailability: []
    };
  }

  const checked = await mapWithConcurrency(
    candidates,
    AVAILABILITY_CONCURRENCY,
    movie => lookupAvailability(movie, parsedIntent)
  );
  const verified = checked
    .filter(Boolean)
    .filter(movie => matchesHardConstraints(movie, parsedIntent));

  return {
    movies: rankResults(verified, parsedIntent),
    currentAvailability: availabilityEvidence(verified)
  };
}

async function verifyHybridAvailability(movies, parsedIntent, lookupAvailability) {
  const candidates = boundedArray(movies, MAX_GRAPH_CANDIDATES);
  const checked = await mapWithConcurrency(
    candidates,
    AVAILABILITY_CONCURRENCY,
    async movie => {
      if (movie?.checkedAt && Array.isArray(movie?.offers)) return movie;
      if (typeof lookupAvailability !== 'function') return movie;
      return lookupAvailability(movie, parsedIntent);
    }
  );
  const verified = checked
    .filter(Boolean)
    .filter(movie => matchesHardConstraints(movie, parsedIntent));
  return {
    movies: rankResults(verified, parsedIntent),
    currentAvailability: availabilityEvidence(verified)
  };
}


async function enrichVerifiedResults({ modelRouter, results, parsedIntent, evidence }) {
  if (typeof modelRouter?.run !== 'function' || !Array.isArray(results) || !results.length) return results;
  const enrichment=createAIEnrichment({modelRouter});
  const synthesized=await enrichment.synthesize(results,{intent:parsedIntent},{evidence});
  return synthesized.results.map(result=>{
    const explanation=typeof result?.ai?.explanation==='string'?result.ai.explanation.trim():'';
    return explanation?{...result,searchExplanation:explanation}:result;
  });
}

async function addVerifiedAiReasoning({ modelRouter, query, parsedIntent, evidence, baseMode }) {
  if (!shouldUseAi({ query, parsedIntent }) || typeof modelRouter?.run !== 'function') return null;

  try {
    const response = await modelRouter.run(
      'cinema_reasoning',
      {
        prompt: 'Reason about this verified MovieFinder evidence. Treat structured movie and availability facts as immutable.',
        evidence
      },
      { context: evidence }
    );
    const content = typeof response?.output?.content === 'string' ? response.output.content : '';
    return {
      ...(content ? { answer: content } : {}),
      ai: {
        provider: response?.provider ?? null,
        model: response?.output?.model ?? null
      },
      reasoningMode: `${baseMode}+ai`
    };
  } catch {
    return null;
  }
}

async function readGraphCandidates(graphStore, parsedIntent = {}) {
  if (!graphStore) return null;

  let startId = parsedIntent.similarityAnchor || parsedIntent.graphSeedId || null;
  let seed = null;
  if (!startId && parsedIntent.similarityTitle && typeof graphStore.findMovieByTitle === 'function') {
    seed = await graphStore.findMovieByTitle(parsedIntent.similarityTitle);
    startId = seed?.id || null;
  }
  if (!startId) return null;

  if (!seed) seed = await graphStore.getNode(startId);
  if (!seed) return null;

  const relations = await graphStore.traverse(startId, {
    maxDepth: MAX_GRAPH_DEPTH,
    maxResults: MAX_GRAPH_CANDIDATES
  });

  const ids = [];
  const seen = new Set();
  for (const id of [startId, ...relations.flatMap(edge => [edge?.from, edge?.to])]) {
    if (!id || seen.has(id) || ids.length >= MAX_GRAPH_CANDIDATES) continue;
    seen.add(id);
    ids.push(id);
  }

  const entities = [];
  for (const id of ids) {
    const node = id === startId ? seed : await graphStore.getNode(id);
    if (node) entities.push(node);
  }

  const movies = entities.map(nodeToMovie).filter(Boolean).slice(0, MAX_GRAPH_CANDIDATES);
  return {
    entities: entities.slice(0, MAX_ENTITIES),
    relations: boundedArray(relations, MAX_RELATIONS),
    paths: [],
    movies
  };
}

export function createLiveOrchestrator({
  graphStore = null,
  hybridRetriever = null,
  deterministicSearch = async () => ({ parsed: {}, results: [] }),
  lookupAvailability = null,
  modelRouter = null
} = {}) {
  return {
    async search({ query = '', parsedIntent = {} } = {}) {
      try {
        const graph = await readGraphCandidates(graphStore, parsedIntent);
        if (graph?.movies?.length) {
          const verified = await verifyGraphAvailability(graph.movies, parsedIntent, lookupAvailability);
          const evidence = buildVerifiedEvidence({
            query,
            parsedIntent,
            graph,
            movies: verified.movies,
            currentAvailability: verified.currentAvailability,
            constraints: parsedIntent,
            confidence: 1
          });
          const ai = await addVerifiedAiReasoning({
            modelRouter,
            query,
            parsedIntent,
            evidence,
            baseMode: 'graph'
          });
          return {
            parsed: parsedIntent,
            results: verified.movies,
            reasoningMode: ai?.reasoningMode || 'graph',
            evidence,
            ...(ai ? {
              ...(ai.answer ? { answer: ai.answer } : {}),
              ai: ai.ai
            } : {})
          };
        }
      } catch {
        // Persistent graph and graph-derived availability are optional in the live path;
        // hybrid/deterministic search remain fallbacks if graph enrichment fails.
      }

      const hybridEligible =
        parsedIntent.kind === 'discovery' ||
        Boolean(parsedIntent.similarityTitle) ||
        (Array.isArray(parsedIntent.concepts) && parsedIntent.concepts.length > 0);
      if (parsedIntent.kind !== 'person-filmography' && hybridEligible && typeof hybridRetriever?.search === 'function') {
        try {
          const candidates = await hybridRetriever.search({ query, parsedIntent });
          if (Array.isArray(candidates) && candidates.length) {
            const verified = await verifyHybridAvailability(candidates, parsedIntent, lookupAvailability);
            if (verified.movies.length) {
              const evidence = buildVerifiedEvidence({
                query,
                parsedIntent,
                movies: verified.movies,
                currentAvailability: verified.currentAvailability,
                constraints: parsedIntent,
                confidence: 0.9
              });
              const ai = await addVerifiedAiReasoning({
                modelRouter,
                query,
                parsedIntent,
                evidence,
                baseMode: 'hybrid'
              });
              const enrichedMovies=await enrichVerifiedResults({
                modelRouter,
                results:verified.movies,
                parsedIntent,
                evidence
              });
              return {
                parsed: parsedIntent,
                results: enrichedMovies,
                reasoningMode: ai?.reasoningMode || 'hybrid',
                evidence,
                ...(ai ? {
                  ...(ai.answer ? { answer: ai.answer } : {}),
                  ai: ai.ai
                } : {})
              };
            }
          }
        } catch {
          // Hybrid retrieval is optional; preserve the existing deterministic fallback.
        }
      }

      const fallback = await deterministicSearch({ query, parsedIntent });
      return {
        ...fallback,
        parsed: fallback?.parsed || parsedIntent,
        results: Array.isArray(fallback?.results) ? fallback.results : [],
        reasoningMode: 'deterministic'
      };
    }
  };
}
