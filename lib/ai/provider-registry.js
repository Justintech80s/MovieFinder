import { createModelRouter } from '../search/model-router.js';
import { createOpenAIAdapter } from './openai-adapter.js';
import { createAnthropicAdapter } from './anthropic-adapter.js';
import { createGeminiAdapter } from './gemini-adapter.js';
import { createXAIAdapter } from './xai-adapter.js';

export const DEFAULT_PROVIDER_ORDER = Object.freeze(['openai', 'anthropic', 'gemini', 'xai']);

const PROVIDERS = Object.freeze({
  openai: { key: 'OPENAI_API_KEY', create: createOpenAIAdapter },
  anthropic: { key: 'ANTHROPIC_API_KEY', create: createAnthropicAdapter },
  gemini: { key: 'GEMINI_API_KEY', create: createGeminiAdapter },
  xai: { key: 'XAI_API_KEY', create: createXAIAdapter }
});

export function createProductionModelRouter({
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = 5000,
  models = {},
  orders = {}
} = {}) {
  const defaultOrders = {
    intent_interpretation: DEFAULT_PROVIDER_ORDER,
    cinema_reasoning: DEFAULT_PROVIDER_ORDER,
    answer_synthesis: DEFAULT_PROVIDER_ORDER,
    ...orders
  };
  const router = createModelRouter({ timeoutMs, orders: defaultOrders });

  for (const name of DEFAULT_PROVIDER_ORDER) {
    const config = PROVIDERS[name];
    const apiKey = env?.[config.key];
    const model = models?.[name];
    if (!apiKey || !model) continue;
    router.register(name, config.create({ apiKey, model, fetchImpl }));
  }

  return router;
}


export function configuredProviderNames({env=process.env,models={}}={}){
  return DEFAULT_PROVIDER_ORDER.filter(name=>{
    const config=PROVIDERS[name];
    return Boolean(env?.[config.key]&&models?.[name]);
  });
}
