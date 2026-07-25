/**
 * Prep / waiting-room practice questions shown before scheduledAt.
 * Safe for candidates — no coding starter solutions.
 */
import type { InterviewRole, ScheduledCustomQuestion } from '../types';
import { DEMO_QUESTIONS } from './interview/QuestionStrategyEngine';

export type PrepQuestion = {
  text: string;
  difficulty?: string;
  topic?: string;
};

const ROLE_PREP_BOOK: Record<InterviewRole, PrepQuestion[]> = {
  technical: [
    { topic: 'Background', difficulty: 'easy', text: 'Walk through your recent work and the stack you know best.' },
    { topic: 'Problem solving', difficulty: 'medium', text: 'Describe a hard bug or outage you fixed. What was your process?' },
    { topic: 'System design', difficulty: 'medium', text: 'How would you design a simple URL shortener or notification service?' },
    { topic: 'Code quality', difficulty: 'medium', text: 'How do you decide when to refactor vs ship quickly?' },
    { topic: 'Collaboration', difficulty: 'medium', text: 'Tell me about a disagreement with a teammate and how you resolved it.' },
    { topic: 'Learning', difficulty: 'easy', text: 'What have you learned recently that changed how you build software?' },
  ],
  behavioral: [
    { topic: 'Ownership', difficulty: 'easy', text: 'Tell me about a project you owned end-to-end. What was the outcome?' },
    { topic: 'Conflict', difficulty: 'medium', text: 'Describe a time you handled conflict with a colleague or stakeholder.' },
    { topic: 'Pressure', difficulty: 'medium', text: 'Share a moment you worked under a tight deadline. How did you prioritize?' },
    { topic: 'Feedback', difficulty: 'easy', text: 'Tell me about feedback you received that changed how you work.' },
    { topic: 'Leadership', difficulty: 'medium', text: 'Describe a time you influenced others without formal authority.' },
    { topic: 'Growth', difficulty: 'easy', text: 'What are you actively improving about yourself this year?' },
  ],
  sales: [
    { topic: 'Pitch', difficulty: 'easy', text: 'Walk me through how you open a discovery call with a new prospect.' },
    { topic: 'Objection', difficulty: 'medium', text: 'Tell me about a deal you almost lost and how you turned it around.' },
    { topic: 'Pipeline', difficulty: 'medium', text: 'How do you prioritize leads when everything feels urgent?' },
    { topic: 'Listening', difficulty: 'easy', text: 'Give an example of uncovering a real customer need, not just a feature ask.' },
    { topic: 'Closing', difficulty: 'medium', text: 'Describe your approach to negotiating price or timeline.' },
    { topic: 'Learning', difficulty: 'easy', text: 'What sales skill are you sharpening right now, and why?' },
  ],
  customer_success: [
    { topic: 'Onboarding', difficulty: 'easy', text: 'How do you help a new customer get value in their first 30 days?' },
    { topic: 'Retention', difficulty: 'medium', text: 'Tell me about saving an account that was at risk of churning.' },
    { topic: 'Escalation', difficulty: 'medium', text: 'Describe handling an angry customer while keeping trust.' },
    { topic: 'Insight', difficulty: 'easy', text: 'How do you turn customer feedback into product or process improvements?' },
    { topic: 'Priorities', difficulty: 'medium', text: 'How do you balance many accounts when several need attention at once?' },
    { topic: 'Partnership', difficulty: 'easy', text: 'What does a great long-term customer relationship look like to you?' },
  ],
};

const EARLY_START_GRACE_MS = 5 * 60 * 1000; // allow 5 minutes early

export function getInterviewOpenAt(scheduledAt: string | Date): Date {
  const start = new Date(scheduledAt);
  return new Date(start.getTime() - EARLY_START_GRACE_MS);
}

export function canStartInterviewNow(scheduledAt: string | Date, now: Date = new Date()): boolean {
  return now.getTime() >= getInterviewOpenAt(scheduledAt).getTime();
}

export function secondsUntilInterviewOpen(scheduledAt: string | Date, now: Date = new Date()): number {
  const openAt = getInterviewOpenAt(scheduledAt);
  return Math.max(0, Math.ceil((openAt.getTime() - now.getTime()) / 1000));
}

function parseCustomQuestions(raw: unknown): ScheduledCustomQuestion[] {
  if (Array.isArray(raw)) return raw as ScheduledCustomQuestion[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as ScheduledCustomQuestion[];
    } catch {
      /* ignore */
    }
  }
  return [];
}

/** Build a prep “book” of practice questions for the waiting screen. */
export function buildPrepQuestions(input: {
  role: string;
  customQuestions?: unknown;
  focusAreas?: string | null;
}): PrepQuestion[] {
  const role = (input.role || 'technical') as InterviewRole;
  const customs = parseCustomQuestions(input.customQuestions)
    .filter((q) => q?.text?.trim())
    .map((q) => ({
      text: q.text.trim(),
      difficulty: q.difficulty,
      topic: q.isCodingQuestion ? 'Coding practice' : 'Your interview topics',
    }));

  const demo = DEMO_QUESTIONS.filter((q) => q.role === role && q.phase !== 'wrap_up').map((q) => ({
    text: q.text.replace(/^Hello! Thank you for joining today\.\s*/i, ''),
    difficulty: q.difficulty,
    topic: q.phase.replace(/_/g, ' '),
  }));

  const book = ROLE_PREP_BOOK[role] ?? ROLE_PREP_BOOK.technical;
  const focus = input.focusAreas?.trim();
  const focusCard: PrepQuestion[] = focus
    ? [{ topic: 'Focus areas', difficulty: 'info', text: `Recruiter focus for this session: ${focus.replace(/coding_mode:[a-z_]+\s*\|\s*/i, '').trim()}` }]
    : [];

  const merged = [...focusCard, ...customs, ...demo, ...book];
  const seen = new Set<string>();
  const unique: PrepQuestion[] = [];
  for (const q of merged) {
    const key = q.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(q);
    if (unique.length >= 12) break;
  }
  return unique;
}
