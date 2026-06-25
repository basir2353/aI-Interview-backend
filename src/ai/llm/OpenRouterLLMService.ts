import OpenAI from 'openai';
import type { ILLMService, LLMMessage, LLMOptions, LLMResponse } from './types';
import { config } from '../../config';
import { extractInterviewerReply } from './extractReply';

const DEFAULT_TIMEOUT_MS = 45000;

/**
 * LLM service using Open Router (https://openrouter.ai).
 * OpenAI-compatible API; used for role-based interviewer questions when OPENROUTER_API_KEY is set.
 */
export class OpenRouterLLMService implements ILLMService {
  private client: OpenAI;
  private authErrorLogged = false;
  private requestErrorLogged = false;
  private timeoutErrorLogged = false;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.ai.openRouterApiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      timeout: DEFAULT_TIMEOUT_MS,
      maxRetries: 1,
      defaultHeaders: {
        'HTTP-Referer': config.frontendUrl,
        'X-Title': 'AI Interview',
      },
    });
  }

  private fallbackResponse(messages: LLMMessage[]): LLMResponse {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const answerMatch = lastUser.match(/The candidate (?:answered|just said):\s*"([^"]+)"/s);
    const answerSnippet = answerMatch?.[1]?.trim();

    let question = 'Could you tell me more about your experience?';
    const nextQ = lastUser.match(/Next question to ask(?:\s*\([^)]*\))?:\s*(.+)$/s);
    if (nextQ) {
      question = nextQ[1].trim();
    } else if (/first interview question/i.test(lastUser)) {
      question = 'Tell me about a project from your resume that best shows your strengths for this role.';
    } else if (answerSnippet) {
      question = `Thanks for sharing about "${answerSnippet.slice(0, 80)}${answerSnippet.length > 80 ? '…' : ''}". Can you walk me through your specific contribution and the outcome?`;
    }

    const reply = extractInterviewerReply(
      JSON.stringify({ reply: question, intent: 'next_question', suggestedNextPhase: null }),
      question
    );

    return {
      content: JSON.stringify({
        reply,
        intent: 'next_question',
        suggestedNextPhase: null,
      }),
      usage: { promptTokens: 0, completionTokens: 0 },
    };
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const temperature = options?.temperature ?? config.ai.defaultTemperature;
    const model = config.ai.openRouterModel;

    try {
      const completionPromise = this.client.chat.completions.create({
        model,
        messages: messages.map((m) => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        })),
        temperature,
        max_tokens: options?.maxTokens ?? 1024,
      });

      const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const completion = await Promise.race([
        completionPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('OpenRouter timeout exceeded')), timeoutMs)
        ),
      ]);

      const content = completion.choices[0]?.message?.content ?? '';
      return {
        content,
        usage: {
          promptTokens: completion.usage?.prompt_tokens ?? 0,
          completionTokens: completion.usage?.completion_tokens ?? 0,
        },
      };
    } catch (error: any) {
      const status = error?.status ?? error?.code;
      const message = String(error?.message ?? '');
      if (status === 401 || status === 403) {
        if (!this.authErrorLogged) {
          this.authErrorLogged = true;
          console.warn(
            'OpenRouter auth failed (401/403). Falling back to deterministic interviewer questions. Check OPENROUTER_API_KEY.'
          );
        }
        return this.fallbackResponse(messages);
      }
      if (/timeout/i.test(message)) {
        if (!this.timeoutErrorLogged) {
          this.timeoutErrorLogged = true;
          console.warn('OpenRouter timed out. Falling back to deterministic interviewer questions.');
        }
        return this.fallbackResponse(messages);
      }
      if (!this.requestErrorLogged) {
        this.requestErrorLogged = true;
        console.warn('OpenRouter request failed. Falling back to deterministic interviewer questions.', {
          status,
          message,
          detail: error?.error ?? error?.response?.data,
        });
      }
      return this.fallbackResponse(messages);
    }
  }
}
