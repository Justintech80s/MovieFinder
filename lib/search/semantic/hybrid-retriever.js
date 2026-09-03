const MAX_DOCUMENTS = 12;
const MAX_ENTITY_IDS = 40;
const MAX_EXCERPT_CHARS = 1500;
const EMBEDDING_DIMENSIONS = 1536;

function fallback() {
  return { mode: 'fallback', documents: [], entityIds: [], degraded: true };
}

function cleanExcerpt(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_EXCERPT_CHARS);
}

function validQueryVector(result) {
  const vector = result?.vectors?.[0];
  return Array.isArray(vector)
    && vector.length === EMBEDDING_DIMENSIONS
    && vector.every(value => Number.isFinite(value));
}

function evidenceDocument(row) {
  const entityId = row?.entity_id ?? row?.entityId ?? null;
  if (!entityId) return null;
  const excerpt = cleanExcerpt(row?.content);
  if (!excerpt) return null;
  return {
    id: row?.id ?? null,
    entityId,
    type: row?.document_type ?? row?.documentType ?? null,
    excerpt,
    source: {
      kind: row?.source_kind ?? row?.sourceKind ?? null,
      ref: row?.source_ref ?? row?.sourceRef ?? null,
      url: row?.source_url ?? row?.sourceUrl ?? null
    },
    provenance: row?.provenance && typeof row.provenance === 'object' ? row.provenance : {},
    lexicalRank: row?.lexical_rank ?? row?.lexicalRank ?? null,
    semanticRank: row?.semantic_rank ?? row?.semanticRank ?? null,
    fusedRank: row?.fused_score ?? row?.fusedRank ?? null
  };
}

export function createHybridRetriever({ embeddingAdapter, semanticStore } = {}) {
  return {
    async retrieve({ query = '', parsedIntent = {} } = {}) {
      if (!embeddingAdapter?.embed || !semanticStore?.hybridSearch) return fallback();
      const normalizedQuery = String(query || '').trim().slice(0, 500);
      if (!normalizedQuery) return fallback();

      try {
        const embedding = await embeddingAdapter.embed({ texts: [normalizedQuery], purpose: 'query' });
        if (!validQueryVector(embedding)) return fallback();

        const rows = await semanticStore.hybridSearch({
          queryText: normalizedQuery,
          queryEmbedding: embedding.vectors[0],
          limit: MAX_ENTITY_IDS,
          parsedIntent
        });

        const documents = [];
        const entityIds = [];
        const seenEntityIds = new Set();
        for (const row of Array.isArray(rows) ? rows : []) {
          const document = evidenceDocument(row);
          if (!document) continue;
          if (!seenEntityIds.has(document.entityId) && entityIds.length < MAX_ENTITY_IDS) {
            seenEntityIds.add(document.entityId);
            entityIds.push(document.entityId);
          }
          if (documents.length < MAX_DOCUMENTS) documents.push(document);
          if (documents.length >= MAX_DOCUMENTS && entityIds.length >= MAX_ENTITY_IDS) break;
        }

        return { mode: 'hybrid', documents, entityIds, degraded: false };
      } catch {
        return fallback();
      }
    }
  };
}
