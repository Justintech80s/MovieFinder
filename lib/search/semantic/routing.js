const SEMANTIC_LANGUAGE = /\b(mood|tone|style|pacing|atmosphere|dreamlike|bleak|slow[- ]burn|feels? like|similar|theme|thematic|visual|identity|memory|lonely|paranoid)\b/i;

export function shouldUseSemanticRetrieval({ query = '', parsedIntent = {}, enabled = false } = {}) {
  if (!enabled) return false;

  if (parsedIntent.kind === 'person-filmography' || parsedIntent.kind === 'title') {
    return false;
  }

  const concepts = Array.isArray(parsedIntent.concepts) ? parsedIntent.concepts : [];
  return concepts.length >= 2 || SEMANTIC_LANGUAGE.test(String(query));
}
