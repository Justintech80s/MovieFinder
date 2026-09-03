const DEFAULT_DIMENSIONS = 1536;
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_BATCH_SIZE = 32;
const MAX_TEXT_LENGTH = 8000;

class EmbeddingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EmbeddingError';
    this.code = code;
  }
}

function invalidInput(message) {
  return new EmbeddingError('EMBEDDING_INVALID_INPUT', message);
}

function badResponse(message) {
  return new EmbeddingError('EMBEDDING_BAD_RESPONSE', message);
}

function validateTexts(texts) {
  if (!Array.isArray(texts) || texts.length === 0 || texts.length > MAX_BATCH_SIZE) {
    throw invalidInput(`Embedding input must contain 1-${MAX_BATCH_SIZE} texts.`);
  }

  for (const text of texts) {
    if (typeof text !== 'string' || text.length === 0 || text.length > MAX_TEXT_LENGTH) {
      throw invalidInput(`Each embedding text must contain 1-${MAX_TEXT_LENGTH} characters.`);
    }
  }
}

function validateVectors(vectors, expectedCount, dimensions) {
  if (!Array.isArray(vectors) || vectors.length !== expectedCount) {
    throw badResponse('Embedding provider returned an unexpected vector count.');
  }

  for (const vector of vectors) {
    if (!Array.isArray(vector) || vector.length !== dimensions) {
      throw badResponse(`Embedding provider returned an incompatible vector dimension; expected ${dimensions}.`);
    }
    if (!vector.every(Number.isFinite)) {
      throw badResponse('Embedding provider returned a vector containing non-finite values.');
    }
  }
}

export function createEmbeddingAdapter({
  provider,
  model,
  dimensions = DEFAULT_DIMENSIONS,
  embedImpl,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (typeof provider !== 'string' || !provider.trim()) throw invalidInput('Embedding provider is required.');
  if (typeof model !== 'string' || !model.trim()) throw invalidInput('Embedding model is required.');
  if (!Number.isInteger(dimensions) || dimensions <= 0) throw invalidInput('Embedding dimensions must be a positive integer.');
  if (typeof embedImpl !== 'function') throw invalidInput('Embedding implementation is required.');
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw invalidInput('Embedding timeout must be a positive integer.');

  return {
    provider,
    model,
    dimensions,

    async embed({ texts, purpose = 'query' } = {}) {
      validateTexts(texts);
      if (purpose !== 'query' && purpose !== 'corpus') {
        throw invalidInput('Embedding purpose must be query or corpus.');
      }

      const startedAt = performance.now();
      const signal = AbortSignal.timeout(timeoutMs);

      try {
        const raw = await embedImpl({
          texts: [...texts],
          purpose,
          provider,
          model,
          dimensions,
          signal
        });
        const vectors = Array.isArray(raw) ? raw : raw?.vectors;
        validateVectors(vectors, texts.length, dimensions);

        return {
          provider,
          model,
          dimensions,
          vectors,
          usage: Array.isArray(raw) ? null : (raw?.usage ?? null),
          latencyMs: performance.now() - startedAt
        };
      } catch (error) {
        if (error instanceof EmbeddingError) throw error;
        if (error?.name === 'AbortError' || signal.aborted) {
          throw new EmbeddingError('EMBEDDING_TIMEOUT', 'Embedding provider timed out.');
        }
        throw new EmbeddingError('EMBEDDING_BAD_RESPONSE', 'Embedding provider failed.');
      }
    }
  };
}

export const EMBEDDING_LIMITS = Object.freeze({
  dimensions: DEFAULT_DIMENSIONS,
  maxBatchSize: MAX_BATCH_SIZE,
  maxTextLength: MAX_TEXT_LENGTH,
  defaultTimeoutMs: DEFAULT_TIMEOUT_MS
});
