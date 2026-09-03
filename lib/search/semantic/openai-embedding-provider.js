import { createEmbeddingAdapter, EMBEDDING_LIMITS } from './embedding-adapter.js';

const DEFAULT_MODEL = 'text-embedding-3-small';
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';

function normalizeRows(data, expectedCount) {
  if (!Array.isArray(data) || data.length !== expectedCount) {
    throw new Error('invalid embedding response');
  }

  const rows = [...data].sort((a, b) => Number(a?.index) - Number(b?.index));
  if (rows.some((row, index) => Number(row?.index) !== index || !Array.isArray(row?.embedding))) {
    throw new Error('invalid embedding response');
  }
  return rows.map(row => row.embedding);
}

export function createOpenAIEmbeddingAdapter({ env = process.env, fetchImpl = fetch, timeoutMs } = {}) {
  const apiKey = env?.OPENAI_API_KEY;
  if (typeof apiKey !== 'string' || !apiKey.trim()) return null;

  const model = (typeof env?.EMBEDDING_MODEL === 'string' && env.EMBEDDING_MODEL.trim()) || DEFAULT_MODEL;

  return createEmbeddingAdapter({
    provider: 'openai',
    model,
    dimensions: EMBEDDING_LIMITS.dimensions,
    timeoutMs: timeoutMs ?? EMBEDDING_LIMITS.defaultTimeoutMs,
    async embedImpl({ texts, dimensions, signal }) {
      const response = await fetchImpl(OPENAI_EMBEDDINGS_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          input: texts,
          model,
          encoding_format: 'float',
          dimensions
        }),
        signal
      });

      if (!response?.ok) {
        throw new Error(`embedding provider HTTP ${response?.status ?? 'error'}`);
      }

      const payload = await response.json();
      return {
        vectors: normalizeRows(payload?.data, texts.length),
        usage: payload?.usage ?? null
      };
    }
  });
}
