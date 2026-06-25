/**
 * Single LLM provider export. Set LLM_PROVIDER=ollama|openrouter, or defaults to
 * OpenRouter when OPENROUTER_API_KEY is set, otherwise Ollama.
 */
import type { ILLMService, LLMMessage, LLMOptions, LLMResponse } from './types';
import { config } from '../../config';
import { OpenRouterLLMService } from './OpenRouterLLMService';
import { OllamaLLMService } from './OllamaLLMService';

let instance: ILLMService | null = null;

export function getLLMService(): ILLMService {
  if (!instance) {
    if (config.ai.llmProvider === 'openrouter') {
      instance = new OpenRouterLLMService();
    } else {
      instance = new OllamaLLMService();
    }
  }
  return instance;
}

export type { ILLMService, LLMMessage, LLMOptions, LLMResponse } from './types';
