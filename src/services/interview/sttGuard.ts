import type { InterviewLanguageCode } from '../../constants/interviewLanguage';
import { normalizeInterviewLanguage } from '../../constants/interviewLanguage';

/** Legacy + vocabulary tokens — Whisper echoes these on silence even without a prompt. */
const HALLUCINATION_SUBSTRINGS = [
  'this is a job interview',
  'the candidate is answering questions',
  'esta es una entrevista',
  'ceci est un entretien',
  'dies ist ein vorstellungsgespr',
  'یہ نوکری کا انٹرویو',
  'امیدوار سوالات کے جواب',
  'هذا مقابلة عمل',
  'المرشح يجيب',
  'यह एक नौकरी का साक्षात्कार',
  'thank you for watching',
  'thanks for watching',
  'subscribe',
  'subtitles by',
  'please subscribe',
  'silence',
  'music',
  'can you hear me',
  'let me think',
];

/** Tokens from old Whisper prompts — partial echoes must be rejected. */
const STT_VOCAB_TOKENS: Record<InterviewLanguageCode, string[]> = {
  'en-US': ['kubernetes', 'docker', 'agile', 'scrum', 'api', 'database', 'team', 'project', 'software'],
  es: ['entrevista', 'experiencia', 'proyecto', 'equipo', 'software'],
  fr: ['entretien', 'expérience', 'projet', 'équipe', 'logiciel'],
  de: ['interview', 'erfahrung', 'projekt', 'team', 'software'],
  hi: ['अनुभव', 'प्रोजेक्ट', 'टीम', 'सॉफ्टवेयर'],
  ar: ['مقابلة', 'خبرة', 'مشروع', 'فريق', 'برمجيات'],
  ur: ['docker', 'agile', 'scrum', 'ٹیم', 'پروجیکٹ', 'سافٹ', 'سافٹ ویئر', 'software', 'project'],
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordsOf(text: string): string[] {
  return normalize(text).split(' ').filter((w) => w.length > 1);
}

function matchesVocabToken(word: string, token: string): boolean {
  const w = normalize(word);
  const t = normalize(token);
  if (!w || !t) return false;
  return w === t || w.includes(t) || t.includes(w);
}

/** True when most words are STT vocabulary echoes, not a real answer. */
export function isPromptVocabularyEcho(
  transcript: string,
  interviewLanguage?: InterviewLanguageCode
): boolean {
  const lang = interviewLanguage ? normalizeInterviewLanguage(interviewLanguage) : 'en-US';
  const tokens = STT_VOCAB_TOKENS[lang] ?? STT_VOCAB_TOKENS['en-US'];
  const words = wordsOf(transcript);
  if (words.length === 0) return true;
  if (words.length >= 10) return false;

  const hits = words.filter((w) => tokens.some((t) => matchesVocabToken(w, t))).length;
  const ratio = hits / words.length;
  if (words.length <= 4 && ratio >= 0.5) return true;
  if (words.length <= 6 && ratio >= 0.65) return true;
  return false;
}

export function isSttHallucination(transcript: string, interviewLanguage?: InterviewLanguageCode): boolean {
  const t = normalize(transcript);
  if (!t) return true;

  for (const phrase of HALLUCINATION_SUBSTRINGS) {
    if (t.includes(normalize(phrase))) return true;
  }

  return isPromptVocabularyEcho(transcript, interviewLanguage);
}

/** Voice answers need real substance — blocks 2–3 word noise/hallucination clips. */
export function isAnswerTooShort(transcript: string): boolean {
  const trimmed = transcript.trim();
  if (!trimmed) return true;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 5) return false;
  if (trimmed.length >= 35) return false;
  return true;
}

export function isInvalidCandidateTranscript(
  transcript: string,
  interviewLanguage?: InterviewLanguageCode
): boolean {
  const lang = interviewLanguage ? normalizeInterviewLanguage(interviewLanguage) : undefined;
  return isSttHallucination(transcript, lang) || isAnswerTooShort(transcript);
}
