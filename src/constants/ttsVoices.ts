import type { InterviewLanguageCode } from './interviewLanguage';
import { normalizeInterviewLanguage } from './interviewLanguage';

export type InterviewerPersonaVoice = 'ethan' | 'zara';

/** Female neural voices (ZaraAlex). */
export const EDGE_TTS_FEMALE_VOICE: Record<InterviewLanguageCode, string> = {
  'en-US': 'en-US-JennyNeural',
  es: 'es-ES-ElviraNeural',
  fr: 'fr-FR-DeniseNeural',
  de: 'de-DE-KatjaNeural',
  hi: 'hi-IN-SwaraNeural',
  ar: 'ar-SA-ZariyahNeural',
  ur: 'ur-PK-UzmaNeural',
};

/** Male neural voices (Ethan). */
export const EDGE_TTS_MALE_VOICE: Record<InterviewLanguageCode, string> = {
  'en-US': 'en-US-GuyNeural',
  es: 'es-ES-AlvaroNeural',
  fr: 'fr-FR-HenriNeural',
  de: 'de-DE-ConradNeural',
  hi: 'hi-IN-MadhurNeural',
  ar: 'ar-SA-HamedNeural',
  ur: 'ur-PK-AsadNeural',
};

export const EDGE_TTS_FEMALE_LABEL: Record<InterviewLanguageCode, string> = {
  'en-US': 'Jenny (English, female)',
  es: 'Elvira (Español, female)',
  fr: 'Denise (Français, female)',
  de: 'Katja (Deutsch, female)',
  hi: 'Swara (हिन्दी, female)',
  ar: 'Zariyah (العربية, female)',
  ur: 'Uzma (اردو, female)',
};

export const EDGE_TTS_MALE_LABEL: Record<InterviewLanguageCode, string> = {
  'en-US': 'Guy (English, male)',
  es: 'Alvaro (Español, male)',
  fr: 'Henri (Français, male)',
  de: 'Conrad (Deutsch, male)',
  hi: 'Madhur (हिन्दी, male)',
  ar: 'Hamed (العربية, male)',
  ur: 'Asad (اردو, male)',
};

/** @deprecated use edgeTtsVoiceForLanguage(lang, persona) */
export const EDGE_TTS_VOICE_BY_LANGUAGE = EDGE_TTS_FEMALE_VOICE;

/** @deprecated use edgeTtsVoiceLabelForLanguage(lang, persona) */
export const EDGE_TTS_VOICE_LABEL = EDGE_TTS_FEMALE_LABEL;

export function normalizeInterviewerPersona(value: unknown): InterviewerPersonaVoice {
  if (value === 'zara' || value === 'female') return 'zara';
  return 'ethan';
}

export function edgeTtsVoiceForLanguage(
  value: unknown,
  persona?: unknown
): string {
  const code = normalizeInterviewLanguage(value);
  const p = normalizeInterviewerPersona(persona);
  return p === 'zara' ? EDGE_TTS_FEMALE_VOICE[code] : EDGE_TTS_MALE_VOICE[code];
}

export function edgeTtsVoiceLabelForLanguage(value: unknown, persona?: unknown): string {
  const code = normalizeInterviewLanguage(value);
  const p = normalizeInterviewerPersona(persona);
  return p === 'zara' ? EDGE_TTS_FEMALE_LABEL[code] : EDGE_TTS_MALE_LABEL[code];
}
