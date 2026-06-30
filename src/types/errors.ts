/**
 * Standard API error shapes for interview and related endpoints.
 */

export type InterviewErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'ECHO_DETECTED'
  | 'INVALID_TRANSCRIPT'
  | 'NO_PENDING_QUESTION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'EVALUATION_PENDING'
  | 'PHASE_TRANSITION_INVALID'
  | 'CODE_VALIDATION_FAILED'
  | 'TRANSCRIPTION_FAILED'
  | 'INTERNAL_ERROR';

export interface StandardErrorResponse {
  error: string;
  code: InterviewErrorCode;
  details?: string;
  detailsUr?: string;
  retryAfter?: number;
}

export const ERROR_MESSAGES: Record<
  InterviewErrorCode,
  { en: string; ur: string; status: number }
> = {
  SESSION_NOT_FOUND: {
    en: 'Interview session not found or expired. Please refresh or use your original link.',
    ur: 'Interview session nahi mila ya expire ho gaya. Page refresh karein ya apna link dobara use karein.',
    status: 404,
  },
  ECHO_DETECTED: {
    en: 'That sounded like the interviewer, not your answer. Wait for the question to finish, then speak clearly.',
    ur: 'Yeh interviewer ki awaaz lagi, aap ka jawab nahi. Sawal khatam hone ka intezar karein, phir saaf boliye.',
    status: 400,
  },
  INVALID_TRANSCRIPT: {
    en: 'No clear answer detected. Please speak for at least a few seconds, then try again.',
    ur: 'Clear jawab detect nahi hua. Kam az kam kuch seconds boliye, phir dobara koshish karein.',
    status: 400,
  },
  NO_PENDING_QUESTION: {
    en: 'No question is waiting for an answer. Try refreshing the page.',
    ur: 'Koi sawal jawab ke liye pending nahi hai. Page refresh kar ke dekhein.',
    status: 400,
  },
  UNAUTHORIZED: {
    en: 'Authentication required. Please restart the interview from your join link.',
    ur: 'Authentication zaroori hai. Apne join link se interview dobara shuru karein.',
    status: 401,
  },
  FORBIDDEN: {
    en: 'You do not have access to this interview session.',
    ur: 'Aap ko is interview session ki access nahi hai.',
    status: 403,
  },
  RATE_LIMITED: {
    en: 'Too many requests. Please wait before submitting another answer.',
    ur: 'Bahut zyada requests. Agla jawab bhejne se pehle thora intezar karein.',
    status: 429,
  },
  EVALUATION_PENDING: {
    en: 'Evaluations are still in progress. Report will be ready shortly.',
    ur: 'Evaluation abhi chal rahi hai. Report jald tayyar ho jayegi.',
    status: 202,
  },
  PHASE_TRANSITION_INVALID: {
    en: 'Invalid phase transition for this interview.',
    ur: 'Is interview ke liye phase change valid nahi hai.',
    status: 400,
  },
  CODE_VALIDATION_FAILED: {
    en: 'Code answer has syntax errors. Please fix and resubmit.',
    ur: 'Code mein syntax errors hain. Theek kar ke dobara bhejein.',
    status: 400,
  },
  TRANSCRIPTION_FAILED: {
    en: 'Transcription failed. Please try recording again.',
    ur: 'Transcription fail ho gayi. Dobara record karein.',
    status: 422,
  },
  INTERNAL_ERROR: {
    en: 'An unexpected error occurred. Please try again.',
    ur: 'Unexpected error aaya. Dobara koshish karein.',
    status: 500,
  },
};

export function buildErrorResponse(
  code: InterviewErrorCode,
  overrides?: Partial<Pick<StandardErrorResponse, 'details' | 'detailsUr' | 'retryAfter'>>
): StandardErrorResponse {
  const meta = ERROR_MESSAGES[code];
  return {
    error: meta.en,
    code,
    details: overrides?.details ?? meta.en,
    detailsUr: overrides?.detailsUr ?? meta.ur,
    ...(overrides?.retryAfter != null ? { retryAfter: overrides.retryAfter } : {}),
  };
}
