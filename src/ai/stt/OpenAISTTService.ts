import OpenAI, { toFile } from 'openai';
import { config } from '../../config';
import type { ISTTService } from './types';

/**
 * OpenAI Whisper API or any OpenAI-compatible STT (e.g. Speaches on Railway).
 * Set SPEACHES_BASE_URL + SPEACHES_API_KEY, or OPENAI_API_KEY for OpenAI.
 */
export class OpenAISTTService implements ISTTService {
  private client: OpenAI | null = null;
  private model: string;

  constructor() {
    const { baseUrl, apiKey, model } = config.stt.remote;
    const key = apiKey || config.ai.openaiApiKey;
    const base = normalizeSttBaseUrl(baseUrl);

    if (key || base) {
      this.client = new OpenAI({
        apiKey: key || 'not-used',
        ...(base ? { baseURL: base } : {}),
        defaultHeaders: key ? { Authorization: `Bearer ${key}` } : undefined,
      });
    }
    this.model = model;
  }

  async transcribe(audioBuffer: Buffer, options?: { language?: string }): Promise<string> {
    if (!this.client) {
      throw new Error(
        'Remote STT not configured. Set SPEACHES_BASE_URL + SPEACHES_API_KEY, or OPENAI_API_KEY.'
      );
    }

    try {
      const lang = options?.language?.trim();
      const transcription = await this.client.audio.transcriptions.create({
        file: await toFile(audioBuffer, 'audio.wav'),
        model: this.model,
        ...(lang && lang !== 'auto' ? { language: lang } : {}),
      });
      return transcription.text;
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status;
      const message = error instanceof Error ? error.message : String(error);
      console.error('Remote STT error:', { status, message, baseUrl: config.stt.remote.baseUrl });
      throw new Error(
        status === 401 || status === 403
          ? 'STT authentication failed — check SPEACHES_API_KEY'
          : 'Failed to transcribe audio'
      );
    }
  }
}

function normalizeSttBaseUrl(url: string): string | undefined {
  const trimmed = (url || '').trim().replace(/\/$/, '');
  if (!trimmed) return undefined;
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}
