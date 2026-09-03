import { buildSemanticDocuments } from '../search/semantic/document-builder.js';

const MAX_EMBEDDING_BATCH = 32;
const EMBEDDING_DIMENSIONS = 1536;

function sourceForEntity(entity, sources = []) {
  const id = entity?.id || entity?.canonicalKey || '';
  return sources.filter(source => {
    const sourceEntityId = source?.entityId || source?.entity_id || source?.canonicalKey;
    return !sourceEntityId || sourceEntityId === id;
  });
}

function validateEmbeddingResult(result, expectedCount) {
  const vectors = result?.vectors;
  if (!Array.isArray(vectors) || vectors.length !== expectedCount) {
    throw new Error('semantic embedding returned invalid vector count');
  }
  for (const vector of vectors) {
    if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS || vector.some(value => !Number.isFinite(value))) {
      throw new Error('semantic embedding returned invalid dimensions');
    }
  }
  return vectors;
}

export async function syncSemanticDocuments({
  entities = [],
  relations = [],
  sources = [],
  semanticStore,
  embeddingAdapter,
  embeddingModel,
  embeddingVersion
} = {}) {
  if (!semanticStore?.upsertDocuments || !semanticStore?.documentsNeedingEmbedding || !semanticStore?.saveEmbeddings || !embeddingAdapter?.embed) {
    return { documents: 0, embedded: 0, degraded: false, skipped: true };
  }

  const documents = [];
  for (const entity of entities.slice(0, 100)) {
    documents.push(...buildSemanticDocuments({
      entity,
      relations,
      sources: sourceForEntity(entity, sources)
    }));
  }

  if (documents.length) await semanticStore.upsertDocuments(documents);

  const pending = (await semanticStore.documentsNeedingEmbedding({
    limit: MAX_EMBEDDING_BATCH,
    embeddingModel,
    embeddingVersion
  })) || [];
  const work = pending.slice(0, MAX_EMBEDDING_BATCH).filter(row => row?.id && String(row?.content || '').trim());

  if (!work.length) {
    return { documents: documents.length, embedded: 0, degraded: false, skipped: false };
  }

  try {
    const result = await embeddingAdapter.embed({
      texts: work.map(row => String(row.content)),
      purpose: 'corpus'
    });
    const vectors = validateEmbeddingResult(result, work.length);
    const model = embeddingModel || result?.model || null;
    const version = embeddingVersion || null;
    const rows = work.map((row, index) => ({
      id: row.id,
      embedding: vectors[index],
      embeddingModel: model,
      embeddingVersion: version
    }));
    await semanticStore.saveEmbeddings(rows);
    return { documents: documents.length, embedded: rows.length, degraded: false, skipped: false };
  } catch {
    return { documents: documents.length, embedded: 0, degraded: true, skipped: false };
  }
}
