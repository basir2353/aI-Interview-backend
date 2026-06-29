import { whisperSttPrompt, type InterviewLanguageCode } from '../../constants/interviewLanguage';

/** Whisper often returns the initial prompt verbatim on silence — reject these. */
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
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isSttHallucination(transcript: string, interviewLanguage?: InterviewLanguageCode): boolean {
  const t = normalize(transcript);
  if (!t) return true;

  for (const phrase of HALLUCINATION_SUBSTRINGS) {
    if (t.includes(normalize(phrase))) return true;
  }

  if (interviewLanguage) {
    const prompt = whisperSttPrompt(interviewLanguage);
    if (prompt?.trim()) {
      const p = normalize(prompt);
      if (p.length >= 8 && (t === p || t.includes(p) || p.includes(t))) return true;
    }
  }

  return false;
}

/** Real answers need substance — blocks 1–2 word noise transcripts. */
export function isAnswerTooShort(transcript: string): boolean {
  const trimmed = transcript.trim();
  if (!trimmed) return true;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 3) return false;
  // Allow short but meaningful technical tokens (e.g. "React", "Docker API")
  if (trimmed.length >= 18) return false;
  return words.length < 2 || trimmed.length < 10;
}

export function isInvalidCandidateTranscript(
  transcript: string,
  interviewLanguage?: InterviewLanguageCode
): boolean {
  return isSttHallucination(transcript, interviewLanguage) || isAnswerTooShort(transcript);
}
