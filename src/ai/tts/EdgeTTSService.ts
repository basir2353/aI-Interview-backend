import { EdgeTTS } from 'edge-tts-universal';
import { edgeTtsVoiceForLanguage } from '../../constants/ttsVoices';
import type { ITTSService, TTSOptions } from './types';

const MAX_CHARS = 4000;

export class EdgeTTSService implements ITTSService {
  async synthesize(text: string, options?: TTSOptions): Promise<Buffer> {
    const trimmed = text.trim().slice(0, MAX_CHARS);
    if (!trimmed) {
      throw new Error('Text is required for TTS');
    }

    const voice = options?.voice || edgeTtsVoiceForLanguage(options?.language ?? 'en-US');
    const tts = new EdgeTTS(trimmed, voice, { rate: options?.rate ?? '+0%' });
    const result = await tts.synthesize();
    return Buffer.from(await result.audio.arrayBuffer());
  }
}
