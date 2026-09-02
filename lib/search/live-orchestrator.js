const MAX_ENTITIES = 40;
const MAX_RELATIONS = 80;
const MAX_PATHS = 20;
const MAX_MOVIES = 40;
const MAX_AVAILABILITY = 120;
const MAX_PROVENANCE = 80;
const MAX_GRAPH_DEPTH = 3;
const MAX_GRAPH_CANDIDATES = 40;

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
    year: node.year ?? node.properties?.year ?? null
  };
}

async function readGraphCandidates(graphStore, parsedIntent = {}) {
  const startId = parsedIntent.similarityAnchor || parsedIntent.graphSeedId || null;
  if (!graphStore || !startId) return null;

  const seed = await graphStore.getNode(startId);
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

export function createLiveOrchestrator({ graphStore = null, deterministicSearch = async () => ({ parsed: {}, results: [] }) } = {}) {
  return {
    async search({ query = '', parsedIntent = {} } = {}) {
      try {
        const graph = await readGraphCandidates(graphStore, parsedIntent);
        if (graph?.movies?.length) {
          const evidence = buildVerifiedEvidence({
            query,
            parsedIntent,
            graph,
            movies: graph.movies,
            constraints: parsedIntent,
            confidence: 1
          });
          return {
            parsed: parsedIntent,
            results: graph.movies,
            reasoningMode: 'graph',
            evidence
          };
        }
      } catch {
        // Persistent graph is optional in the live path; deterministic search remains the fallback.
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
