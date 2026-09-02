import { AI_CAPABILITIES, createProviderError, normalizeAIResult } from './adapter-contract.js';

function safeJsonParse(text) { if (typeof text !== 'string' || !text.trim()) return null; try { return JSON.parse(text); } catch { return null; } }
function buildPrompt(input, context) {
  const value = typeof input === 'string' ? { prompt: input } : { ...(input || {}) };
  if (context && Object.keys(context).length) value.runtimeContext = context;
  if (typeof value.prompt === 'string') { const prompt = value.prompt; delete value.prompt; return Object.keys(value).length ? `${prompt}\n\nMovieFinder context:\n${JSON.stringify(value)}` : prompt; }
  return JSON.stringify(value);
}
function extractText(payload) { const candidate = payload?.candidates?.[0]; const parts = []; for (const part of candidate?.content?.parts || []) if (typeof part?.text === 'string') parts.push(part.text); return parts.join('\n'); }
function safeProviderMessage(payload) { return typeof payload?.error?.message === 'string' ? payload.error.message : 'gemini request failed'; }

export function createGeminiAdapter({ apiKey, model, fetchImpl = globalThis.fetch, baseUrl = 'https://generativelanguage.googleapis.com/v1beta', now = Date.now, timeoutMs = 5000 } = {}) {
  if (!apiKey) throw new TypeError('Gemini API key is required');
  if (!model) throw new TypeError('Gemini model is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  return {
    capabilities: [...AI_CAPABILITIES],
    async invoke(capability, input, context = {}) {
      if (!AI_CAPABILITIES.includes(capability)) throw Object.assign(new Error('unsupported AI capability'), { code: 'MODEL_BAD_RESPONSE', provider: 'gemini' });
      const startedAt = now();
      const endpoint = `${baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(model)}:generateContent`;
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: buildPrompt(input, context) }] }] }), signal: controller.signal });
      } catch (cause) {
        const error = createProviderError('gemini', cause?.name === 'AbortError' ? 408 : null, 'gemini request failed', cause); if (cause?.name === 'AbortError') error.status = null; throw error;
      } finally { clearTimeout(timer); }
      let payload;
      try { payload = await response.json(); } catch (cause) { const error = createProviderError('gemini', 400, 'gemini returned malformed JSON', cause); error.code = 'MODEL_BAD_RESPONSE'; throw error; }
      if (!response.ok) { let message = safeProviderMessage(payload); if (message.includes(apiKey)) message = 'gemini request failed'; throw createProviderError('gemini', response.status, message); }
      const content = extractText(payload); if (!content) { const error = createProviderError('gemini', 400, 'gemini returned no text output'); error.code = 'MODEL_BAD_RESPONSE'; throw error; }
      return normalizeAIResult({ provider: 'gemini', model, capability, content, structuredData: safeJsonParse(content), usage: payload?.usageMetadata ? { inputTokens: payload.usageMetadata.promptTokenCount ?? null, outputTokens: payload.usageMetadata.candidatesTokenCount ?? null } : null, latencyMs: Math.max(0, now() - startedAt) });
    }
  };
}
