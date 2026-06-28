import type { InterviewLanguageCode } from './interviewLanguage';
import { normalizeInterviewLanguage } from './interviewLanguage';

/** Microsoft Edge neural voices — work server-side for all browsers (no OS install). */
export const EDGE_TTS_VOICE_BY_LANGUAGE: Record<InterviewLanguageCode, string> = {
  'en-US': 'en-US-JennyNeural',
  es: 'es-ES-ElviraNeural',
  fr: 'fr-FR-DeniseNeural',
  de: 'de-DE-KatjaNeural',
  hi: 'hi-IN-SwaraNeural',
  ar: 'ar-SA-ZariyahNeural',
  ur: 'ur-PK-UzmaNeural',
};

export const EDGE_TTS_VOICE_LABEL: Record<InterviewLanguageCode, string> = {
  'en-US': 'Jenny (English)',
  es: 'Elvira (Español)',
  fr: 'Denise (Français)',
  de: 'Katja (Deutsch)',
  hi: 'Swara (हिन्दी)',
  ar: 'Zariyah (العربية)',
  ur: 'Uzma (اردو)',
};

export function edgeTtsVoiceForLanguage(value: unknown): string {
  const code = normalizeInterviewLanguage(value);
  return EDGE_TTS_VOICE_BY_LANGUAGE[code];
}

export function edgeTtsVoiceLabelForLanguage(value: unknown): string {
  const code = normalizeInterviewLanguage(value);
  return EDGE_TTS_VOICE_LABEL[code];
}
