/**
 * Text-to-Speech abstraction for AI interviewer voice.
 */

export interface TTSOptions {
  /** Interview language code (en-US, ur, ar, …) or BCP-47 tag. */
  language?: string;
  /** Override Edge/OpenAI voice id. */
  voice?: string;
  /** Prosody rate, e.g. "+0%" or "-10%". */
  rate?: string;
}

export interface ITTSService {
  synthesize(text: string, options?: TTSOptions): Promise<Buffer>;
}
