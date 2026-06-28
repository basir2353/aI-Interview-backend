import { config } from '../../config';
import { EdgeTTSService } from './EdgeTTSService';
import { OpenAITTSService } from './OpenAITTSService';
import type { ITTSService } from './types';

let instance: ITTSService | null = null;

export function getTTSService(): ITTSService {
  if (!instance) {
    if (config.tts.provider === 'openai' && config.ai.openaiApiKey) {
      instance = new OpenAITTSService();
    } else {
      instance = new EdgeTTSService();
    }
  }
  return instance;
}

export type { ITTSService, TTSOptions } from './types';
