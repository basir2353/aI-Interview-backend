import axios from 'axios';
import { config } from '../../config';
import { extractInterviewerReply } from './extractReply';
import type { ILLMService, LLMMessage, LLMOptions, LLMResponse } from './types';

const DEFAULT_TIMEOUT_MS = 120000;

/**
 * Ollama /api/chat — multi-turn interviewer with resume + answer context.
 * Falls back to deterministic JSON when the model is missing or unreachable.
 */
export class OllamaLLMService implements ILLMService {
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = config.ai.ollamaBaseUrl.replace(/\/$/, '');
    this.model = config.ai.ollamaModel;
  }

  private fallbackFromMessages(messages: LLMMessage[]): LLMResponse {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const isEvaluation = /evaluate this answer|score|relevance|structure|depth/i.test(lastUser);

    if (isEvaluation) {
      return {
        content: JSON.stringify({
          score: 6,
          relevance: 6,
          structure: 6,
          depth: 5,
          competencyIds: ['communication'],
          redFlags: [],
          feedbackSnippet: 'Answer recorded; detailed scoring unavailable while the AI model is offline.',
        }),
      };
    }

    const answerMatch = lastUser.match(/The candidate (?:answered|just said):\s*"([^"]+)"/s);
    const answerSnippet = answerMatch?.[1]?.trim();
    let question = 'Could you tell me more about your experience?';
    const nextQ = lastUser.match(/Next question to ask(?:\s*\([^)]*\))?:\s*(.+)$/s);
    if (nextQ) {
      question = nextQ[1].trim();
    } else if (/first interview question/i.test(lastUser)) {
      question = 'Tell me about a project from your resume that best shows your strengths for this role.';
    } else if (answerSnippet) {
      question = `Thanks for sharing. Can you walk me through your specific contribution on "${answerSnippet.slice(0, 80)}${answerSnippet.length > 80 ? '…' : ''}" and the outcome?`;
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
    };
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
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

      const content = response.data.message?.content?.trim() ?? '';
      if (content) return { content };
      return this.fallbackFromMessages(messages);
    } catch (error: unknown) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const message = error instanceof Error ? error.message : String(error);
      console.warn('Ollama chat failed; using fallback reply.', { status, message, model: this.model });
      return this.fallbackFromMessages(messages);
    }
  }
}
