import axios from 'axios';
import { config } from '../config';
import { logger } from '../config/logger';
import { getLLMService } from '../ai/llm';

interface OllamaGenerateRequest {
    model: string;
    prompt: string;
    stream?: boolean;
    options?: {
        temperature?: number;
        max_tokens?: number;
        top_p?: number;
    };
}

interface OllamaGenerateResponse {
    model: string;
    created_at: string;
    response: string;
    done: boolean;
    context?: number[];
}

/**
 * Legacy LLM facade used by Socket/voice-interview and /llm routes.
 * Respects LLM_PROVIDER: OpenRouter when set to openrouter, otherwise Ollama.
 */
/** Fallback JSON reply when no model is available (so the interview can still run). */
function fallbackReplyFromPrompt(prompt: string): string {
    const match = prompt.match(/Next question to ask:\s*(.+)$/s);
    const question = match ? match[1].trim() : 'Can you tell me a bit more about your experience?';
    return JSON.stringify({
        reply: question,
        intent: 'next_question',
        suggestedNextPhase: null,
    });
}

export class LLMService {
    private baseUrl: string;
    private model: string;
    private temperature: number;
    private maxTokens: number;
    /** False when Ollama has no models; we use fallback replies so the app still works. */
    private modelAvailable: boolean = true;

    constructor() {
        this.baseUrl = config.ai.ollamaBaseUrl.replace(/\/$/, '');
        this.model = config.ai.ollamaModel;
        this.temperature = parseFloat(process.env.OLLAMA_TEMPERATURE || '0.7');
        this.maxTokens = parseInt(process.env.OLLAMA_MAX_TOKENS || '500');
    }

    private get isOpenRouter(): boolean {
        return config.ai.llmProvider === 'openrouter';
    }

    /**
     * Health check for the active LLM provider.
     */
    async healthCheck(): Promise<boolean> {
        if (this.isOpenRouter) {
            if (!config.ai.openRouterApiKey) {
                logger.warn('OpenRouter selected but OPENROUTER_API_KEY is empty');
                return false;
            }
            try {
                await axios.get('https://openrouter.ai/api/v1/models', {
                    headers: { Authorization: `Bearer ${config.ai.openRouterApiKey}` },
                    timeout: 8000,
                });
                logger.info('OpenRouter health check passed', { model: config.ai.openRouterModel });
                return true;
            } catch (error) {
                // Key may still work for chat even if the models probe fails (rate limit, etc.).
                const status = axios.isAxiosError(error) ? error.response?.status : undefined;
                if (status === 401 || status === 403) {
                    logger.warn('OpenRouter health check failed: invalid API key', { status });
                    return false;
                }
                logger.warn('OpenRouter models probe failed; API key is set — chat may still work', {
                    status,
                    message: error instanceof Error ? error.message : String(error),
                });
                return true;
            }
        }

        try {
            const response = await axios.get<{ models: { name: string }[] }>(`${this.baseUrl}/api/tags`, {
                timeout: 3000,
            });
            const models = response.data?.models ?? [];
            const configured = this.model;
            const match = models.find(
                (m) =>
                    m.name === configured ||
                    m.name.startsWith(configured + ':') ||
                    m.name.startsWith(configured + '.')
            );
            if (match) {
                this.modelAvailable = true;
                logger.info('Ollama health check passed', { model: match.name });
                return true;
            }
            if (models.length > 0) {
                this.model = models[0].name;
                this.modelAvailable = true;
                logger.warn('Ollama: configured model not found, using first available', {
                    configured,
                    using: this.model,
                    hint: `Set OLLAMA_MODEL=${this.model} or run: ollama pull ${configured}`,
                });
                return true;
            }
            this.modelAvailable = false;
            logger.warn('Ollama is running but no models installed; using fallback replies', {
                hint: `Run: ollama pull ${configured} for full AI responses`,
            });
            return true;
        } catch (error) {
            this.modelAvailable = false;
            if (axios.isAxiosError(error)) {
                const code = error.code ?? 'UNKNOWN';
                const status = error.response?.status;
                const target = `${this.baseUrl}/api/tags`;
                logger.warn('Ollama health check failed', {
                    code,
                    status,
                    target,
                    hint: 'Start Ollama with `ollama serve` or set LLM_PROVIDER=openrouter with OPENROUTER_API_KEY.',
                });
                return false;
            }
            logger.warn('Ollama health check failed', {
                message: error instanceof Error ? error.message : String(error),
            });
            return false;
        }
    }

    /**
     * Generate a complete response (non-streaming).
     */
    async generate(prompt: string, context?: number[]): Promise<string> {
        if (this.isOpenRouter) {
            try {
                const llm = getLLMService();
                const result = await llm.chat(
                    [{ role: 'user', content: prompt }],
                    { temperature: this.temperature, maxTokens: this.maxTokens }
                );
                return result.content || fallbackReplyFromPrompt(prompt);
            } catch (error) {
                logger.error('OpenRouter generation failed', { error });
                return fallbackReplyFromPrompt(prompt);
            }
        }

        if (!this.modelAvailable) {
            logger.debug('Using fallback reply (no Ollama model available)');
            return fallbackReplyFromPrompt(prompt);
        }
        try {
            const payload: OllamaGenerateRequest = {
                model: this.model,
                prompt,
                stream: false,
                options: {
                    temperature: this.temperature,
                    max_tokens: this.maxTokens,
                },
            };

            if (context) {
                (payload as any).context = context;
            }

            const response = await axios.post<OllamaGenerateResponse>(
                `${this.baseUrl}/api/generate`,
                payload
            );

            return response.data.response;
        } catch (error: any) {
            const status = error?.response?.status;
            const model = this.model;
            if (status === 404) {
                this.modelAvailable = false;
                logger.warn('Ollama model not found; using fallback. Run: ollama pull ' + model.split(/[:.]/)[0]);
                return fallbackReplyFromPrompt(prompt);
            }
            logger.error('LLM generation failed', { error, prompt });
            throw new Error('Failed to generate LLM response');
        }
    }

    /**
     * Generate a streaming response (token-by-token).
     * OpenRouter path yields the full completion in one chunk (no native stream here).
     */
    async *generateStream(
        prompt: string,
        context?: number[]
    ): AsyncGenerator<string, void, unknown> {
        if (this.isOpenRouter) {
            const text = await this.generate(prompt, context);
            yield text;
            return;
        }

        if (!this.modelAvailable) {
            const fallback = fallbackReplyFromPrompt(prompt);
            yield fallback;
            return;
        }
        try {
            const payload: OllamaGenerateRequest = {
                model: this.model,
                prompt,
                stream: true,
                options: {
                    temperature: this.temperature,
                    max_tokens: this.maxTokens,
                },
            };

            if (context) {
                (payload as any).context = context;
            }

            const response = await axios.post(
                `${this.baseUrl}/api/generate`,
                payload,
                {
                    responseType: 'stream',
                }
            );

            for await (const chunk of response.data) {
                const lines = chunk.toString().split('\n').filter(Boolean);

                for (const line of lines) {
                    try {
                        const data: OllamaGenerateResponse = JSON.parse(line);
                        if (data.response) {
                            yield data.response;
                        }
                        if (data.done) {
                            return;
                        }
                    } catch {
                        logger.warn('Failed to parse streaming chunk', { line });
                    }
                }
            }
        } catch (error: any) {
            const status = error?.response?.status;
            if (status === 404) {
                this.modelAvailable = false;
                const fallback = fallbackReplyFromPrompt(prompt);
                yield fallback;
                return;
            }
            logger.error('LLM streaming failed', { error, prompt });
            throw new Error('Failed to stream LLM response');
        }
    }

    async generateInterviewQuestion(
        category: string,
        difficulty: 'easy' | 'medium' | 'hard',
        previousAnswers: string[],
        context?: number[]
    ): Promise<string> {
        const prompt = this.buildInterviewQuestionPrompt(
            category,
            difficulty,
            previousAnswers
        );
        return this.generate(prompt, context);
    }

    async generateFollowUpQuestion(
        originalQuestion: string,
        candidateAnswer: string,
        context?: number[]
    ): Promise<string> {
        const prompt = `You are an AI interviewer. The candidate was asked: "${originalQuestion}"

Their answer was: "${candidateAnswer}"

Generate a relevant follow-up question to dig deeper into their answer. Keep it concise and professional.

Follow-up question:`;

        return this.generate(prompt, context);
    }

    async evaluateAnswer(
        question: string,
        answer: string,
        context?: number[]
    ): Promise<{
        score: number;
        feedback: string;
        strengths: string[];
        improvements: string[];
    }> {
        const prompt = `You are an AI interviewer evaluating a candidate's answer.

Question: "${question}"
Answer: "${answer}"

Evaluate this answer on a scale of 0-100 and provide:
1. Overall score (0-100)
2. Brief feedback (2-3 sentences)
3. Key strengths (2-3 points)
4. Areas for improvement (2-3 points)

Respond in JSON format:
{
  "score": <number>,
  "feedback": "<string>",
  "strengths": ["<string>", "<string>"],
  "improvements": ["<string>", "<string>"]
}`;

        const response = await this.generate(prompt, context);

        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch {
            logger.error('Failed to parse evaluation response', { response });
        }

        return {
            score: 50,
            feedback: 'Unable to evaluate answer properly.',
            strengths: ['Provided a response'],
            improvements: ['Could provide more detail'],
        };
    }

    private buildInterviewQuestionPrompt(
        category: string,
        difficulty: 'easy' | 'medium' | 'hard',
        previousAnswers: string[]
    ): string {
        const difficultyDescriptions = {
            easy: 'basic, introductory level',
            medium: 'intermediate level',
            hard: 'advanced, challenging level',
        };

        let prompt = `You are an AI interviewer conducting a ${category} interview.

Generate a ${difficultyDescriptions[difficulty]} interview question for this category.
The question should be clear, professional, and appropriate for a job interview.
Keep it concise (1-2 sentences).

`;

        if (previousAnswers.length > 0) {
            prompt += `Previous questions have been asked. Make sure this question is different and builds on the interview progression.\n\n`;
        }

        prompt += `Question:`;

        return prompt;
    }

    async generateInterviewSummary(
        transcript: Array<{ speaker: string; text: string }>,
        scores: any
    ): Promise<string> {
        const conversationText = transcript
            .map((t) => `${t.speaker}: ${t.text}`)
            .join('\n');

        const prompt = `You are an AI interviewer. Generate a comprehensive interview summary based on the following conversation and scores.

CONVERSATION:
${conversationText}

SCORES:
- Communication: ${scores.communicationScore}/100
- Technical Depth: ${scores.technicalScore}/100
- Relevance: ${scores.relevanceScore}/100
- Confidence: ${scores.confidenceScore}/100
- Structured Thinking: ${scores.structuredThinkingScore}/100
- Overall: ${scores.overallScore}/100

Provide a professional summary (3-4 paragraphs) covering:
1. Overall performance
2. Key strengths demonstrated
3. Areas for improvement
4. Final recommendation

Summary:`;

        return this.generate(prompt);
    }
}

export const llmService = new LLMService();
