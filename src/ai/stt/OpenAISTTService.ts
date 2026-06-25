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
      });
    }
    this.model = model;
  }

  async transcribe(audioBuffer: Buffer): Promise<string> {
    if (!this.client) {
      throw new Error(
        'Remote STT not configured. Set SPEACHES_BASE_URL + SPEACHES_API_KEY, or OPENAI_API_KEY.'
      );
    }

    try {
      const transcription = await this.client.audio.transcriptions.create({
        file: await toFile(audioBuffer, 'audio.wav'),
        model: this.model,
      });
      return transcription.text;
    } catch (error) {
      console.error('Remote STT error:', error);
      throw new Error('Failed to transcribe audio');
    }
  }
}

function normalizeSttBaseUrl(url: string): string | undefined {
  const trimmed = (url || '').trim().replace(/\/$/, '');
  if (!trimmed) return undefined;
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}
