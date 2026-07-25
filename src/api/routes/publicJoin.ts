/**
 * Public join by token: candidate opens link, sees schedule info, starts interview.
 * No auth required. Start creates/finds candidate and starts session.
 * Candidates may only start at/near scheduledAt; before that they get a prep waiting payload.
 */

import { Router, Request, Response } from 'express';
import { param } from 'express-validator';
import { query } from '../../db/client';
import { interviewSessionService } from '../../services/interview/InterviewSessionService';
import { aiInterviewerOrchestrator } from '../../services/interview/AIInterviewerOrchestrator';
import { validate } from '../middleware/validate';
import { buildResumeContext } from '../../services/interview/ResumeContextService';
import { parseCodingModeFromFocusAreas } from '../../constants/codingInterviewModes';
import { resolveScheduleBranding } from '../../services/interview/ScheduleBrandingService';
import {
  buildPrepQuestions,
  canStartInterviewNow,
  getInterviewOpenAt,
  secondsUntilInterviewOpen,
} from '../../services/interviewPrep.service';
import type { DifficultyLevel, ScheduledCustomQuestion } from '../../types';

const router = Router();

type ScheduleJoinRow = {
  id: string;
  candidate_email: string;
  candidate_name: string | null;
  role: string;
  scheduled_at: string;
  status: string;
  interview_id: string | null;
  preferred_difficulty?: DifficultyLevel | null;
  custom_questions?: unknown;
  focus_areas?: string | null;
  duration_minutes?: number | null;
  position_id?: string | null;
  application_id?: string | null;
  resume_url?: string | null;
  created_by?: string | null;
  interviewer_persona?: string | null;
  company_name?: string | null;
  interview_language?: string | null;
};

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

/** GET /public/join/:token - Get schedule info + prep book (no auth) */
router.get(
  '/:token',
  validate([param('token').isString().notEmpty().isLength({ min: 10 })]),
  async (req: Request, res: Response) => {
    const token = req.params.token;
    const { rows } = await query(
      `SELECT s.id, s.candidate_email, s.candidate_name, s.role, s.scheduled_at, s.status, s.interview_id,
              s.custom_questions, s.focus_areas, s.duration_minutes, s.position_id, s.created_by,
              s.interviewer_persona, s.company_name, s.interview_language,
              p.title AS position_title
       FROM scheduled_interviews s
       LEFT JOIN positions p ON p.id = s.position_id
       WHERE s.join_token = $1`,
      [token]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired link' });
    }
    const row = rows[0] as ScheduleJoinRow & { position_title?: string | null };
    if (row.status === 'cancelled') {
      return res.status(410).json({ error: 'This interview was cancelled' });
    }
    if (row.interview_id && row.status === 'completed') {
      return res.json({
        id: row.id,
        candidateEmail: row.candidate_email,
        candidateName: row.candidate_name,
        role: row.role,
        scheduledAt: row.scheduled_at,
        status: row.status,
        alreadyCompleted: true,
        interviewId: row.interview_id,
        canStart: false,
      });
    }

    const branding = await resolveScheduleBranding({
      scheduleInterviewerPersona: row.interviewer_persona,
      scheduleCompanyName: row.company_name,
      scheduleInterviewLanguage: row.interview_language,
      createdBy: row.created_by,
      positionId: row.position_id,
    });

    const alreadyInProgress = Boolean(row.interview_id && row.status === 'in_progress');
    const canStart = alreadyInProgress || canStartInterviewNow(row.scheduled_at);
    const openAt = getInterviewOpenAt(row.scheduled_at).toISOString();
    const secondsUntilStart = alreadyInProgress ? 0 : secondsUntilInterviewOpen(row.scheduled_at);
    const prepQuestions = buildPrepQuestions({
      role: row.role,
      customQuestions: row.custom_questions,
      focusAreas: row.focus_areas,
    });

    res.json({
      id: row.id,
      candidateEmail: row.candidate_email,
      candidateName: row.candidate_name,
      role: row.role,
      scheduledAt: row.scheduled_at,
      status: row.status,
      alreadyCompleted: false,
      interviewId: row.interview_id,
      canStart,
      openAt,
      secondsUntilStart,
      serverNow: new Date().toISOString(),
      durationMinutes: row.duration_minutes ?? null,
      focusAreas: row.focus_areas ?? null,
      positionTitle: row.position_title ?? null,
      companyName: branding.companyName,
      interviewerPersona: branding.interviewerPersona,
      prepQuestions,
    });
  }
);

/** POST /public/join/:token/start - Start interview (blocked until scheduled window) */
router.post(
  '/:token/start',
  validate([param('token').isString().notEmpty().isLength({ min: 10 })]),
  async (req: Request, res: Response) => {
    const token = req.params.token;
    const { rows } = await query(
      `SELECT id, candidate_email, candidate_name, role, preferred_difficulty, custom_questions, focus_areas, duration_minutes, position_id, application_id, resume_url, status, interview_id, created_by, interviewer_persona, company_name, interview_language, scheduled_at
       FROM scheduled_interviews WHERE join_token = $1`,
      [token]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired link' });
    }
    const row = rows[0] as ScheduleJoinRow;
    let customQuestions = parseCustomQuestions(row.custom_questions);

    if (row.status === 'cancelled') {
      return res.status(410).json({ error: 'This interview was cancelled' });
    }
    if (row.interview_id && row.status === 'in_progress') {
      const state = await interviewSessionService.getStateWithBranding(row.interview_id);
      if (state) {
        return res.json({
          interviewId: row.interview_id,
          alreadyStarted: true,
          state,
        });
      }
    }

    if (!canStartInterviewNow(row.scheduled_at)) {
      const secondsUntilStart = secondsUntilInterviewOpen(row.scheduled_at);
      const openAt = getInterviewOpenAt(row.scheduled_at).toISOString();
      console.info(
        `[Join] Too early to start schedule=${row.id} opensAt=${openAt} waitSec=${secondsUntilStart}`
      );
      return res.status(403).json({
        error: 'Your interview has not opened yet. Please wait until the scheduled time.',
        code: 'TOO_EARLY',
        scheduledAt: row.scheduled_at,
        openAt,
        secondsUntilStart,
        serverNow: new Date().toISOString(),
      });
    }

    let candidateId: string;
    const { rows: candRows } = await query<{ id: string }>(
      `SELECT id FROM candidates WHERE email = $1 LIMIT 1`,
      [row.candidate_email]
    );
    if (candRows.length > 0) {
      candidateId = candRows[0].id;
    } else {
      const { rows: insertRows } = await query<{ id: string }>(
        `INSERT INTO candidates (id, email, name, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, NOW(), NOW()) RETURNING id`,
        [row.candidate_email, row.candidate_name ?? row.candidate_email]
      );
      candidateId = insertRows[0].id;
    }
    let resumeContext: string | undefined;
    let resumeProfile: Awaited<ReturnType<typeof buildResumeContext>>['resumeProfile'];
    if (row.application_id) {
      const { rows: appRows } = await query<{
        resume_url: string | null;
        cover_letter: string | null;
        position_title: string | null;
      }>(
        `SELECT a.resume_url, a.cover_letter, p.title AS position_title
         FROM applications a
         LEFT JOIN positions p ON p.id = a.position_id
         WHERE a.id = $1
         LIMIT 1`,
        [row.application_id]
      );
      const app = appRows[0];
      if (app) {
        const built = await buildResumeContext({
          resumeUrl: app.resume_url,
          coverLetter: app.cover_letter,
          candidateName: row.candidate_name ?? row.candidate_email,
          positionTitle: app.position_title,
        });
        resumeContext = built.resumeContext;
        resumeProfile = built.resumeProfile;
      }
    } else if (row.resume_url) {
      const built = await buildResumeContext({
        resumeUrl: row.resume_url,
        candidateName: row.candidate_name ?? row.candidate_email,
      });
      resumeContext = built.resumeContext;
      resumeProfile = built.resumeProfile;
    }

    const codingInterviewMode = parseCodingModeFromFocusAreas(row.focus_areas);

    let positionTitle: string | null | undefined = resumeProfile?.positionTitle;
    if (!positionTitle && row.position_id) {
      const { rows: posRows } = await query<{ title: string }>(
        `SELECT title FROM positions WHERE id = $1 LIMIT 1`,
        [row.position_id]
      );
      positionTitle = posRows[0]?.title ?? null;
      if (resumeProfile && positionTitle) {
        resumeProfile = { ...resumeProfile, positionTitle };
      }
    }

    const hasCodingQuestions = customQuestions.some((q) => q.isCodingQuestion);
    if (row.role === 'technical' && !hasCodingQuestions) {
      const defaultCoding: ScheduledCustomQuestion[] = [
        { text: 'Implement a function that reverses a string. Handle empty and single-character strings.', difficulty: 'easy', isCodingQuestion: true, language: 'javascript', starterCode: 'function reverseString(str) {\n  // your code here\n  return str;\n}' },
        { text: 'Write a function that checks if a string is a palindrome. Ignore case and non-alphanumeric characters.', difficulty: 'medium', isCodingQuestion: true, language: 'javascript', starterCode: 'function isPalindrome(str) {\n  // your code here\n  return false;\n}' },
        { text: 'Given an array of numbers, return the two indices whose values sum to a target. Assume exactly one solution exists.', difficulty: 'medium', isCodingQuestion: true, language: 'javascript', starterCode: 'function twoSum(nums, target) {\n  // your code here\n  return [];\n}' },
      ];
      customQuestions = [...customQuestions, ...defaultCoding].slice(0, 30);
    }

    const branding = await resolveScheduleBranding({
      scheduleInterviewerPersona: row.interviewer_persona,
      scheduleCompanyName: row.company_name,
      scheduleInterviewLanguage: row.interview_language,
      createdBy: row.created_by,
      positionId: row.position_id,
    });

    const { interviewId, state } = await interviewSessionService.start({
      candidateId,
      role: row.role as 'technical' | 'behavioral' | 'sales' | 'customer_success',
      positionId: row.position_id ?? undefined,
      resumeContext,
      resumeProfile,
      positionTitle: positionTitle ?? undefined,
      candidateDisplayName: row.candidate_name?.trim() || undefined,
      codingInterviewMode,
      preferredDifficulty: row.preferred_difficulty ?? undefined,
      customQuestions,
      focusAreas: row.focus_areas?.trim() || undefined,
      durationMinutes: row.duration_minutes ?? undefined,
      interviewerPersona: branding.interviewerPersona,
      companyName: branding.companyName,
      interviewLanguage: branding.interviewLanguage,
    });
    await query(
      `UPDATE scheduled_interviews SET interview_id = $2, status = 'in_progress', updated_at = NOW() WHERE id = $1`,
      [row.id, interviewId]
    );

    // Prepare first opener immediately so live room can speak without waiting on begin-live.
    let liveState = state;
    let firstReply = '';
    try {
      const welcome = await aiInterviewerOrchestrator.ensureWelcomeDelivered(interviewId);
      if (welcome.state) liveState = welcome.state;
      firstReply = welcome.reply || '';
    } catch (err) {
      console.warn('[Join] Prefetch welcome failed (non-blocking):', err instanceof Error ? err.message : err);
    }

    console.info(`[Join] Interview started schedule=${row.id} interviewId=${interviewId} openerReady=${Boolean(firstReply)}`);
    res.status(201).json({
      interviewId,
      state: liveState,
      firstReply: firstReply || undefined,
    });
  }
);

export const publicJoinRoutes = router;
