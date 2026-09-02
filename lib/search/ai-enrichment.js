const SAFE_RESULT_FIELDS = Object.freeze(['explanation', 'semanticTags', 'themes', 'connections', 'summary']);

function aiMetadata(provider, output, { exposeStructuredData = true } = {}) {
  return { provider, model: output?.model ?? null, content: typeof output?.content === 'string' ? output.content : '', structuredData: exposeStructuredData ? output?.structuredData ?? null : null, usage: output?.usage ?? null, latencyMs: Number.isFinite(output?.latencyMs) ? output.latencyMs : null };
}
function safeResultMetadata(value) { if (!value || typeof value !== 'object') return null; const safe = {}; for (const field of SAFE_RESULT_FIELDS) if (value[field] !== undefined) safe[field] = value[field]; return Object.keys(safe).length ? safe : null; }
function mergeSafeResultMetadata(results, structuredData) {
  const suggestions = Array.isArray(structuredData?.results) ? structuredData.results : [];
  const byId = new Map(suggestions.filter(item => item?.id != null).map(item => [String(item.id), item]));
  return results.map((result, index) => { const suggestion = result?.id != null && byId.has(String(result.id)) ? byId.get(String(result.id)) : suggestions[index]; const safe = safeResultMetadata(suggestion); return safe ? { ...result, ai: safe } : result; });
}
async function optionalRun(modelRouter, capability, input, order, context = {}) {
  if (!modelRouter || typeof modelRouter.run !== 'function') return null;
  try { return await modelRouter.run(capability, input, { ...(order?.length ? { order } : {}), context }); } catch { return null; }
}
export function createAIEnrichment({ modelRouter, orders = {} } = {}) {
  return {
    async interpret(query, context = {}) { const response = await optionalRun(modelRouter, 'intent_interpretation', { prompt: query, context }, orders.intent_interpretation, context); return response ? { ai: aiMetadata(response.provider, response.output) } : { ai: null }; },
    async reason(results, plan, context = {}) { const response = await optionalRun(modelRouter, 'cinema_reasoning', { prompt: 'Reason about these verified MovieFinder cinema results.', results, plan, context }, orders.cinema_reasoning, context); return response ? { ai: aiMetadata(response.provider, response.output) } : { ai: null }; },
    async synthesize(verifiedResults, plan, context = {}) {
      const results = Array.isArray(verifiedResults) ? verifiedResults : [];
      const response = await optionalRun(modelRouter, 'answer_synthesis', { prompt: 'Explain these verified MovieFinder results. Do not change movie identity, availability, evidence, confidence, or verification.', results, plan, context }, orders.answer_synthesis, context);
      if (!response) return { results, ai: null };
      return { results: mergeSafeResultMetadata(results, response.output?.structuredData), ai: aiMetadata(response.provider, response.output, { exposeStructuredData: false }) };
    }
  };
}
