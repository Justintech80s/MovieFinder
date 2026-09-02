import {
  AI_CAPABILITIES,
  createProviderError,
  normalizeAIResult
} from './adapter-contract.js';

function safeJsonParse(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function extractText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const parts = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n');
}

function buildInput(input, context) {
  const value = typeof input === 'string' ? { prompt: input } : { ...(input || {}) };
  if (context && Object.keys(context).length) value.runtimeContext = context;
  if (typeof value.prompt === 'string') {
    const prompt = value.prompt;
    delete value.prompt;
    return Object.keys(value).length ? `${prompt}\n\nMovieFinder context:\n${JSON.stringify(value)}` : prompt;
  }
  return JSON.stringify(value);
}

export function createOpenAICompatibleAdapter({ provider, apiKey, baseUrl, model, fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 5000 } = {}) {
  if (!provider || !baseUrl || !model) throw new TypeError('provider, baseUrl, and model are required');
  if (!apiKey) throw new TypeError(`${provider} API key is required`);
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');

  return {
    capabilities: [...AI_CAPABILITIES],
    async invoke(capability, input, context = {}) {
      if (!AI_CAPABILITIES.includes(capability)) throw Object.assign(new Error('unsupported AI capability'), { code: 'MODEL_BAD_RESPONSE', provider });
      const startedAt = now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/responses`, {
          method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, input: buildInput(input, context) }), signal: controller.signal
        });
      } catch (cause) {
        const error = createProviderError(provider, cause?.name === 'AbortError' ? 408 : null, `${provider} request failed`, cause);
        if (cause?.name === 'AbortError') error.status = null;
        throw error;
      } finally { clearTimeout(timer); }

      let payload;
      try { payload = await response.json(); }
      catch (cause) { const error = createProviderError(provider, 400, `${provider} returned malformed JSON`, cause); error.code = 'MODEL_BAD_RESPONSE'; throw error; }
      if (!response.ok) throw createProviderError(provider, response.status, typeof payload?.error?.message === 'string' ? payload.error.message : `${provider} request failed`);
      const content = extractText(payload);
      if (!content) { const error = createProviderError(provider, 400, `${provider} returned no text output`); error.code = 'MODEL_BAD_RESPONSE'; throw error; }
      return normalizeAIResult({ provider, model: payload?.model || model, capability, content, structuredData: safeJsonParse(content), usage: payload?.usage ? { inputTokens: payload.usage.input_tokens ?? null, outputTokens: payload.usage.output_tokens ?? null } : null, latencyMs: Math.max(0, now() - startedAt) });
    }
  };
}
