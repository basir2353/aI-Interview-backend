import axios from 'axios';
import { config } from '../../config';
import type { ILLMService, LLMMessage, LLMOptions, LLMResponse } from './types';

/**
 * Ollama /api/chat — multi-turn interviewer with resume + answer context.
 */
export class OllamaLLMService implements ILLMService {
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = config.ai.ollamaBaseUrl.replace(/\/$/, '');
    this.model = config.ai.ollamaModel;
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const timeoutMs = options?.timeoutMs ?? 120000;
    const response = await axios.post<{
      message?: { content?: string };
    }>(
      `${this.baseUrl}/api/chat`,
      {
        model: this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: false,
        options: {
          temperature: options?.temperature ?? config.ai.defaultTemperature,
          num_predict: options?.maxTokens ?? 512,
        },
      },
      { timeout: timeoutMs }
    );

    return {
      content: response.data.message?.content?.trim() ?? '',
    };
  }
}
