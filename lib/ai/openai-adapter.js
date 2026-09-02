import { createOpenAICompatibleAdapter } from './openai-compatible-adapter.js';

export function createOpenAIAdapter(options = {}) {
  return createOpenAICompatibleAdapter({
    ...options,
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1'
  });
}
