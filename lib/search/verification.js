import { aggregateConfidence, normalizeEvidence } from './evidence.js';

export function verifyMatch(match, evidence = [], { availabilityRequested = false, region = 'US', now = () => new Date() } = {}) {
  const normalized = evidence.map(normalizeEvidence);
  const availabilityState = !availabilityRequested
    ? 'not_requested'
    : match.availability == null
      ? 'unknown'
      : match.availability === false
        ? 'unavailable'
        : 'available';

  return {
    ...match,
    evidence: normalized,
    confidence: aggregateConfidence(normalized),
    verification: {
      availability: { state: availabilityState, region },
      verifiedAt: now().toISOString()
    }
  };
}
