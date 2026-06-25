/**
 * Single LLM provider export. Set LLM_PROVIDER=ollama|openrouter, or defaults to
 * OpenRouter when OPENROUTER_API_KEY is set, otherwise Ollama.
 */
import type { ILLMService, LLMMessage, LLMOptions, LLMResponse } from './types';
import { config } from '../../config';
import { llmService } from '../../services/llm.service';
import { OpenRouterLLMService } from './OpenRouterLLMService';

// Wrapper to match the existing interface when using Ollama
class OllamaLLMServiceWrapper implements ILLMService {
  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const response = await llmService.generate(prompt);
    return { content: response };
  }
}

let instance: ILLMService | null = null;

export function getLLMService(): ILLMService {
  if (!instance) {
    if (config.ai.llmProvider === 'openrouter') {
      instance = new OpenRouterLLMService();
    } else {
      instance = new OllamaLLMServiceWrapper();
    }
  }
  return instance;
}

export type { ILLMService, LLMMessage, LLMOptions, LLMResponse } from './types';
