import { normalizeInterviewLanguage, type InterviewLanguageCode } from '../../constants/interviewLanguage';

/** Reject answers that are almost certainly TTS echo of the last question. */
export function isLikelyEchoAnswer(
  answer: string,
  question: string,
  interviewLanguage?: InterviewLanguageCode
): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const a = norm(answer);
  const q = norm(question);
  if (!a || !q) return false;
  if (a === q) return true;

  const lang = interviewLanguage ? normalizeInterviewLanguage(interviewLanguage) : 'en-US';
  const overlapThreshold = lang === 'en-US' ? 0.45 : 0.58;

  if (a.length >= 8 && (q.includes(a) || a.includes(q))) {
    if (a.length < q.length * 0.55) return false;
    return true;
  }

  const qWords = q.split(' ').filter((w) => w.length > 3);
  if (qWords.length === 0) return false;
  const aWords = new Set(a.split(' ').filter((w) => w.length > 3));
  const overlap = qWords.filter((w) => aWords.has(w)).length;
  return overlap / qWords.length >= overlapThreshold;
}
