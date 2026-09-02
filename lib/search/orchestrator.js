import { buildQueryPlan } from './query-plan.js';
import { verifyMatch } from './verification.js';

export function createSearchOrchestrator({
  parseIntent,
  findFilmography,
  checkAvailability,
  rankResults,
  relationEvidence = () => [],
  now
}) {
  if (typeof parseIntent !== 'function' || typeof findFilmography !== 'function' || typeof rankResults !== 'function') {
    throw new TypeError('orchestrator requires parseIntent, findFilmography, and rankResults');
  }

  return {
    async search(query, context = {}) {
      const intent = await parseIntent(query, context);
      const plan = buildQueryPlan(intent, context);
      let results = await findFilmography(plan, context);
      if (!Array.isArray(results)) results = [];

      if (plan.availability.required && typeof checkAvailability === 'function') {
        results = await Promise.all(results.map(movie => checkAvailability(movie, plan.availability)));
      }

      results = await rankResults(results, plan, context);
      if (!Array.isArray(results)) results = [];
      results = results.map(movie => verifyMatch(
        movie,
        relationEvidence(movie, plan) || [],
        { availabilityRequested: plan.availability.required, region: plan.availability.region, now }
      ));

      return { query, plan, results };
    }
  };
}
