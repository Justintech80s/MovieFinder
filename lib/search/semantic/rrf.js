function boundedLimit(value) {
  const parsed = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 40;
  return Math.min(40, Math.max(0, parsed));
}

export function fuseRanks({
  lexical = [],
  semantic = [],
  k = 60,
  lexicalWeight = 1,
  semanticWeight = 1,
  limit = 40
} = {}) {
  const byId = new Map();

  const add = (items, rankField, weight) => {
    items.forEach((item, index) => {
      if (!item?.id) return;

      const current = byId.get(item.id) || {
        ...item,
        lexicalRank: null,
        semanticRank: null,
        fusedScore: 0
      };

      current[rankField] = index + 1;
      current.fusedScore += Number(weight) / (Number(k) + index + 1);
      byId.set(item.id, current);
    });
  };

  add(lexical, 'lexicalRank', lexicalWeight);
  add(semantic, 'semanticRank', semanticWeight);

  return [...byId.values()]
    .sort((a, b) => b.fusedScore - a.fusedScore || String(a.id).localeCompare(String(b.id)))
    .slice(0, boundedLimit(limit));
}
