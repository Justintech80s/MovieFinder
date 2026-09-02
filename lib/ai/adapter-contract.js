export const AI_CAPABILITIES = Object.freeze([
  'intent_interpretation',
  'cinema_reasoning',
  'answer_synthesis'
]);

function badResponse(message) {
  return Object.assign(new Error(message), { code: 'MODEL_BAD_RESPONSE' });
}

export function normalizeAIResult(value) {
  if (!value || typeof value !== 'object') throw badResponse('model provider returned an invalid result');
  if (!AI_CAPABILITIES.includes(value.capability)) throw badResponse('unsupported AI capability');
  if (!value.provider || !value.model) throw badResponse('model provider result requires provider and model');

  return {
    provider: String(value.provider),
    model: String(value.model),
    capability: value.capability,
    content: typeof value.content === 'string' ? value.content : '',
    structuredData: value.structuredData ?? null,
    usage: value.usage ?? null,
    latencyMs: Number.isFinite(value.latencyMs) ? value.latencyMs : null
  };
}

export function createProviderError(provider, status, message, cause) {
  const numericStatus = status === null || status === undefined || status === '' ? null : Number(status);
  const code = numericStatus === 401 || numericStatus === 403
    ? 'MODEL_AUTH_ERROR'
    : numericStatus === 429
      ? 'MODEL_RATE_LIMITED'
      : numericStatus === 408
        ? 'MODEL_TIMEOUT'
        : numericStatus !== null && numericStatus >= 400 && numericStatus < 500
          ? 'MODEL_BAD_RESPONSE'
          : 'MODEL_PROVIDER_ERROR';

  const error = Object.assign(
    new Error(message || `${provider} request failed`),
    { code, provider, status: Number.isFinite(numericStatus) ? numericStatus : null }
  );
  if (cause !== undefined) error.cause = cause;
  return error;
}
