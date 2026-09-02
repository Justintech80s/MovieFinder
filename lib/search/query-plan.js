const streamingRequested = raw => /\b(stream|streaming|watch|available)\b/i.test(String(raw || ''));
const unique = values => [...new Set((values || []).filter(Boolean))];

export function buildQueryPlan(intent = {}, context = {}) {
  const raw = String(intent.raw || intent.query || '').trim();
  const plan = {
    version: 1,
    raw,
    workType: intent.workType || 'movie',
    people: unique(intent.people || (intent.person ? [intent.person] : [])),
    genres: unique(intent.genres),
    concepts: unique(intent.concepts),
    years: intent.years || intent.yearRange || null,
    similarityAnchor: intent.similarityAnchor || null,
    availability: {
      required: Boolean(intent.streamingOnly || intent.availabilityRequired || streamingRequested(raw)),
      region: context.region || intent.region || 'US'
    },
    verificationRequired: intent.verificationRequired !== false
  };
  return validateQueryPlan(plan);
}

export function validateQueryPlan(plan) {
  if (!plan || typeof plan !== 'object' || !String(plan.raw || '').trim()) {
    throw new TypeError('query plan requires a non-empty raw query');
  }
  if (plan.version !== 1) throw new TypeError('query plan requires version 1');
  if (!plan.availability?.region) throw new TypeError('query plan requires an availability region');
  return plan;
}
