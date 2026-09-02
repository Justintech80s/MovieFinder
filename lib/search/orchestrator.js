import { buildQueryPlan } from './query-plan.js';
import { verifyMatch } from './verification.js';

const SAFE_AI_FIELDS = Object.freeze(['explanation', 'semanticTags', 'themes', 'connections', 'summary']);
function safeAI(value) { if (!value || typeof value !== 'object') return null; const safe = {}; for (const key of SAFE_AI_FIELDS) if (value[key] !== undefined) safe[key] = value[key]; return Object.keys(safe).length ? safe : null; }
function applyAIContext(authoritative, proposed) {
  const byId = new Map((Array.isArray(proposed) ? proposed : []).filter(item => item?.id != null).map(item => [String(item.id), item]));
  return authoritative.map((result, index) => { const candidate = result?.id != null ? byId.get(String(result.id)) : proposed?.[index]; const ai = safeAI(candidate?.ai); return ai ? { ...result, ai } : result; });
}

export function createSearchOrchestrator({ parseIntent, findFilmography, checkAvailability, rankResults, relationEvidence = () => [], aiEnrichment, now }) {
  if (typeof parseIntent !== 'function' || typeof findFilmography !== 'function' || typeof rankResults !== 'function') throw new TypeError('orchestrator requires parseIntent, findFilmography, and rankResults');
  return {
    async search(query, context = {}) {
      const intent = await parseIntent(query, context); const plan = buildQueryPlan(intent, context); let results = await findFilmography(plan, context); if (!Array.isArray(results)) results = [];
      if (plan.availability.required && typeof checkAvailability === 'function') results = await Promise.all(results.map(movie => checkAvailability(movie, plan.availability)));
      results = await rankResults(results, plan, context); if (!Array.isArray(results)) results = [];
      results = results.map(movie => verifyMatch(movie, relationEvidence(movie, plan) || [], { availabilityRequested: plan.availability.required, region: plan.availability.region, now }));
      const authoritative = results;
      let ai = null;
      if (typeof aiEnrichment?.synthesize === 'function') {
        try { const enriched = await aiEnrichment.synthesize(authoritative, plan, { ...context, query }); results = applyAIContext(authoritative, enriched?.results); ai = enriched?.ai ?? null; } catch { results = authoritative; ai = null; }
      }
      return { query, plan, results, ai };
    }
  };
}
