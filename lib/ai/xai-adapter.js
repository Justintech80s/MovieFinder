import { createOpenAICompatibleAdapter } from './openai-compatible-adapter.js';

export function createXAIAdapter(options = {}) {
  return createOpenAICompatibleAdapter({
    ...options,
    provider: 'xai',
    baseUrl: 'https://api.x.ai/v1'
  });
}
