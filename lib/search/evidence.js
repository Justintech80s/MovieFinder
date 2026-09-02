export function normalizeEvidence(item = {}) {
  return {
    source: item.source || 'unknown',
    kind: item.kind || 'fact',
    claim: item.claim || null,
    value: item.value,
    quality: Math.max(0, Math.min(1, Number(item.quality ?? 0.5))),
    observedAt: item.observedAt || null
  };
}

export function aggregateConfidence(items = []) {
  if (!items.length) return 0;
  const values = items.map(normalizeEvidence).map(item => item.quality);
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
}
