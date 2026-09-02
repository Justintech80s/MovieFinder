const MAX_ENTITIES = 40;
const MAX_RELATIONS = 80;
const MAX_PATHS = 20;
const MAX_MOVIES = 40;
const MAX_AVAILABILITY = 120;
const MAX_PROVENANCE = 80;

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
