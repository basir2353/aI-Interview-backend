import { normalizeInterviewLanguage, type InterviewLanguageCode } from '../../constants/interviewLanguage';

const ENGAGEMENT_ECHO_MARKERS = [
  'mm-hmm',
  'got it',
  'give me just a moment',
  'one moment',
  'still with you',
  'thank you for your time',
  'that concludes our interview',
  'جی سمجھ گیا',
  'سمجھ گیا',
  'بس ایک لمحہ',
  'یہ اچھا point',
  'میں یہیں ہوں',
  'سوچ رہا',
  'اگلا سوال',
  'entendido',
  'un momento',
];

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isEngagementPhraseEcho(answer: string): boolean {
  const a = norm(answer);
  if (!a) return false;
  return ENGAGEMENT_ECHO_MARKERS.some((m) => a.includes(norm(m)));
}

function echoOverlap(answer: string, reference: string, lang: InterviewLanguageCode): boolean {
  const a = norm(answer);
  const q = norm(reference);
  if (!a || !q) return false;
  if (a === q) return true;

  const overlapThreshold = lang === 'en-US' ? 0.42 : 0.55;

  if (q.length >= 10 && (q.includes(a) || a.includes(q))) {
    if (a.length < q.length * 0.5) return false;
    return true;
  }

  const qWords = q.split(' ').filter((w) => w.length > 2);
  if (qWords.length === 0) return false;
  const aWords = new Set(a.split(' ').filter((w) => w.length > 2));
  const overlap = qWords.filter((w) => aWords.has(w)).length;
  return overlap / qWords.length >= overlapThreshold;
}

/** Reject answers that echo any recent interviewer line or spoken filler. */
export function isLikelyEchoAnswer(
  answer: string,
  questionOrTexts: string | string[],
  interviewLanguage?: InterviewLanguageCode
): boolean {
  if (isEngagementPhraseEcho(answer)) return true;

  const lang = interviewLanguage ? normalizeInterviewLanguage(interviewLanguage) : 'en-US';
  const texts = Array.isArray(questionOrTexts) ? questionOrTexts : [questionOrTexts];
  for (const text of texts) {
    if (text?.trim() && echoOverlap(answer, text, lang)) return true;
  }
  return false;
}
