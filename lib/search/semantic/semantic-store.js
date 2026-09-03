const DEFAULT_TIMEOUT_MS = 1500;
const MAX_TIMEOUT_MS = 10_000;
const MAX_SEARCH_RESULTS = 40;
const MAX_EMBEDDING_WORK = 32;
const MAX_DOCUMENT_BATCH = 32;
const EMBEDDING_DIMENSIONS = 1536;

function boundedInteger(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(number)));
}

function configuredTimeoutMs(env = {}) {
  return boundedInteger(env.SEMANTIC_DB_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
}

function ensureVector(vector) {
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error('semantic store invalid embedding');
  }
  if (vector.some(value => !Number.isFinite(value))) {
    throw new Error('semantic store invalid embedding');
  }
  return vector;
}

function normalizeDocument(document = {}) {
  return {
    entity_id: document.entityId ?? document.entity_id ?? null,
    document_type: document.documentType ?? document.document_type,
    title: String(document.title || ''),
    content: String(document.content || ''),
    content_hash: document.contentHash ?? document.content_hash,
    source_kind: document.sourceKind ?? document.source_kind,
    source_ref: document.sourceRef ?? document.source_ref ?? null,
    source_url: document.sourceUrl ?? document.source_url ?? null,
    provenance: document.provenance || {},
    language: document.language || 'en',
    embedding_model: document.embeddingModel ?? document.embedding_model ?? null,
    embedding_version: document.embeddingVersion ?? document.embedding_version ?? null,
    metadata: document.metadata || {}
  };
}

function normalizeEmbeddingRow(row = {}) {
  return {
    id: row.id,
    embedding: ensureVector(row.embedding),
    embedding_model: row.embeddingModel ?? row.embedding_model ?? null,
    embedding_version: row.embeddingVersion ?? row.embedding_version ?? null,
    embedded_at: row.embeddedAt ?? row.embedded_at ?? new Date().toISOString()
  };
}

export function createSupabaseSemanticStore({ fetchImpl = globalThis.fetch, env = process.env } = {}) {
  const base = String(env?.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceKey = String(env?.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!base || !serviceKey || typeof fetchImpl !== 'function') return null;

  const timeoutMs = configuredTimeoutMs(env);
  const baseHeaders = {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    accept: 'application/json',
    'content-type': 'application/json'
  };

  async function request(url, options = {}) {
    const response = await fetchImpl(url, {
      ...options,
      headers: { ...baseHeaders, ...(options.headers || {}) },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) throw new Error(`semantic store request failed (${response.status})`);
    if (response.status === 204) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : data || [];
  }

  async function upsertDocuments(documents = []) {
    const rows = documents.slice(0, MAX_DOCUMENT_BATCH).map(normalizeDocument);
    if (!rows.length) return [];
    const url = `${base}/rest/v1/cinema_documents?on_conflict=entity_id,document_type,content_hash,source_kind,source_ref`;
    return request(url, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(rows)
    });
  }

  async function documentsNeedingEmbedding({ limit = MAX_EMBEDDING_WORK } = {}) {
    const safeLimit = boundedInteger(limit, MAX_EMBEDDING_WORK, MAX_EMBEDDING_WORK);
    const url = new URL(`${base}/rest/v1/cinema_documents`);
    url.searchParams.set('select', 'id,entity_id,document_type,title,content,content_hash,source_kind,source_ref,source_url,provenance,language,embedding_model,embedding_version,metadata');
    url.searchParams.set('embedding', 'is.null');
    url.searchParams.set('order', 'updated_at.asc,id.asc');
    url.searchParams.set('limit', String(safeLimit));
    return request(url.toString(), { method: 'GET' });
  }

  async function saveEmbeddings(rows = []) {
    const boundedRows = rows.slice(0, MAX_EMBEDDING_WORK).map(normalizeEmbeddingRow);
    const saved = [];
    for (const row of boundedRows) {
      if (!row.id) throw new Error('semantic store invalid embedding row');
      const url = new URL(`${base}/rest/v1/cinema_documents`);
      url.searchParams.set('id', `eq.${row.id}`);
      const { id, ...body } = row;
      const result = await request(url.toString(), {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(body)
      });
      if (Array.isArray(result)) saved.push(...result);
    }
    return saved;
  }

  async function hybridSearch({ queryText = '', queryEmbedding = null, limit = MAX_SEARCH_RESULTS } = {}) {
    const safeLimit = boundedInteger(limit, MAX_SEARCH_RESULTS, MAX_SEARCH_RESULTS);
    const vector = queryEmbedding == null ? null : ensureVector(queryEmbedding);
    const url = `${base}/rest/v1/rpc/search_cinema_documents`;
    const result = await request(url, {
      method: 'POST',
      body: JSON.stringify({
        query_text: String(queryText || '').trim().slice(0, 500),
        query_embedding: vector,
        match_count: safeLimit
      })
    });
    return Array.isArray(result) ? result.slice(0, safeLimit) : [];
  }

  return { upsertDocuments, documentsNeedingEmbedding, saveEmbeddings, hybridSearch };
}
