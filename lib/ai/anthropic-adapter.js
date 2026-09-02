import { AI_CAPABILITIES, createProviderError, normalizeAIResult } from './adapter-contract.js';
function safeJsonParse(text) { if (typeof text !== 'string' || !text.trim()) return null; try { return JSON.parse(text); } catch { return null; } }
function buildPrompt(input, context) { const value = typeof input === 'string' ? { prompt: input } : { ...(input || {}) }; if (context && Object.keys(context).length) value.runtimeContext = context; if (typeof value.prompt === 'string') { const prompt = value.prompt; delete value.prompt; return Object.keys(value).length ? `${prompt}\n\nMovieFinder context:\n${JSON.stringify(value)}` : prompt; } return JSON.stringify(value); }
function extractText(payload) { return (payload?.content || []).filter(block => block?.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n'); }

export function createAnthropicAdapter({ apiKey, model, fetchImpl = globalThis.fetch, baseUrl = 'https://api.anthropic.com/v1', anthropicVersion = '2023-06-01', maxTokens = 2048, now = Date.now, timeoutMs = 5000 } = {}) {
  if (!apiKey) throw new TypeError('Anthropic API key is required'); if (!model) throw new TypeError('Anthropic model is required'); if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  return { capabilities: [...AI_CAPABILITIES], async invoke(capability, input, context = {}) {
    if (!AI_CAPABILITIES.includes(capability)) throw Object.assign(new Error('unsupported AI capability'), { code: 'MODEL_BAD_RESPONSE', provider: 'anthropic' });
    const startedAt = now(); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); let response;
    try { response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/messages`, { method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': anthropicVersion, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: buildPrompt(input, context) }] }), signal: controller.signal }); }
    catch (cause) { const error = createProviderError('anthropic', cause?.name === 'AbortError' ? 408 : null, 'anthropic request failed', cause); if (cause?.name === 'AbortError') error.status = null; throw error; }
    finally { clearTimeout(timer); }
    let payload; try { payload = await response.json(); } catch (cause) { const error = createProviderError('anthropic', 400, 'anthropic returned malformed JSON', cause); error.code = 'MODEL_BAD_RESPONSE'; throw error; }
    if (!response.ok) throw createProviderError('anthropic', response.status, typeof payload?.error?.message === 'string' ? payload.error.message : 'anthropic request failed');
    const content = extractText(payload); if (!content) { const error = createProviderError('anthropic', 400, 'anthropic returned no text output'); error.code = 'MODEL_BAD_RESPONSE'; throw error; }
    return normalizeAIResult({ provider: 'anthropic', model: payload?.model || model, capability, content, structuredData: safeJsonParse(content), usage: payload?.usage ? { inputTokens: payload.usage.input_tokens ?? null, outputTokens: payload.usage.output_tokens ?? null } : null, latencyMs: Math.max(0, now() - startedAt) });
  } };
}
