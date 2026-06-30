/**
 * Interview lifecycle API: start, submit answer, get state, end, and report.
 * POST /interview/start, POST /interview/:id/answer, GET /interview/:id/state,
 * POST /interview/:id/end, GET /report/:interviewId
 */

import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import { interviewSessionService } from '../../services/interview/InterviewSessionService';
import { aiInterviewerOrchestrator } from '../../services/interview/AIInterviewerOrchestrator';
import { reportFinalizationService } from '../../services/interview/ReportFinalizationService';
import { query } from '../../db/client';
import { validate } from '../middleware/validate';
import {
  interviewSessionAuthMiddleware,
  optionalInterviewSessionAuthMiddleware,
  assertCandidateAccess,
  getClientIp,
} from '../middleware/interviewSessionAuth';
import { interviewAnswerRateLimit } from '../middleware/rateLimit';
import { buildErrorResponse, ERROR_MESSAGES } from '../../types/errors';
import { logger } from '../../config/logger';
import { config } from '../../config';

const router = Router();

function mapFailureReason(reason: string | undefined): ReturnType<typeof buildErrorResponse> {
  switch (reason) {
    case 'session_not_found':
      return buildErrorResponse('SESSION_NOT_FOUND');
    case 'echo_detected':
      return buildErrorResponse('ECHO_DETECTED');
    case 'invalid_transcript':
      return buildErrorResponse('INVALID_TRANSCRIPT');
    case 'no_pending_question':
      return buildErrorResponse('NO_PENDING_QUESTION');
    case 'code_validation_failed':
      return buildErrorResponse('CODE_VALIDATION_FAILED');
    case 'forbidden':
      return buildErrorResponse('FORBIDDEN');
    default:
      return buildErrorResponse('INTERNAL_ERROR');
  }
}

/** POST /interview/start - Create and start a new interview session */
router.post(
  '/start',
  validate([
    body('candidateId').isUUID().withMessage('candidateId must be a UUID'),
    body('role').isIn(['technical', 'behavioral', 'sales', 'customer_success']).withMessage('Invalid role'),
    body('positionId').optional().isUUID(),
  ]),
  async (req: Request, res: Response) => {
    try {
      const { candidateId, role, positionId } = req.body;
      let ensuredCandidateId = candidateId as string;
      const existing = await query<{ id: string }>(
        `SELECT id FROM candidates WHERE id = $1 LIMIT 1`,
        [candidateId]
      );
      if (existing.rows.length === 0) {
        const inserted = await query<{ id: string }>(
          `INSERT INTO candidates (id, email, name, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())
           RETURNING id`,
          [
            candidateId,
            `candidate+${String(candidateId).replace(/-/g, '')}@example.local`,
            'Interview Candidate',
          ]
        );
        ensuredCandidateId = inserted.rows[0].id;
      }

      const result = await interviewSessionService.start({
        candidateId: ensuredCandidateId,
        role,
        positionId,
        clientIp: getClientIp(req),
      });
      res.status(201).json({
        interviewId: result.interviewId,
        state: result.state,
        sessionToken: result.sessionToken,
      });
    } catch (e) {
      logger.error('Interview start error', { error: e instanceof Error ? e.message : String(e) });
      res.status(500).json(buildErrorResponse('INTERNAL_ERROR'));
    }
  }
);

/** POST /interview/:id/begin-live - Deliver welcome intro + first question when candidate enters live room */
router.post(
  '/:id/begin-live',
  optionalInterviewSessionAuthMiddleware,
  validate([param('id').isUUID()]),
  async (req: Request, res: Response) => {
  try {
    const interviewId = req.params.id;
    const stateBefore = await interviewSessionService.getState(interviewId);
    if (!stateBefore) {
      return res.status(404).json(buildErrorResponse('SESSION_NOT_FOUND'));
    }
    if (config.interview.authRequired) {
      const allowed = await assertCandidateAccess(req, stateBefore.candidateId);
      if (!allowed) {
        return res.status(403).json(buildErrorResponse('FORBIDDEN'));
      }
    }

    const result = await aiInterviewerOrchestrator.ensureWelcomeDelivered(interviewId);
    if (!result.success || !result.state) {
      return res.status(404).json(buildErrorResponse('SESSION_NOT_FOUND'));
    }
    res.json({
      state: result.state,
      firstIntro: result.reply,
      alreadyDelivered: result.alreadyDelivered ?? false,
      avatarVideo: result.avatarVideo,
    });
  } catch (e) {
    logger.error('Begin live error', { error: e instanceof Error ? e.message : String(e) });
    res.status(500).json(buildErrorResponse('INTERNAL_ERROR'));
  }
});

/** POST /interview/:id/answer - Submit candidate answer and get next AI reply */
router.post(
  '/:id/answer',
  interviewSessionAuthMiddleware,
  interviewAnswerRateLimit,
  validate([
    param('id').isUUID(),
    body('answerText').isString().notEmpty().trim(),
    body('codeContent').optional().isString(),
    body('explanationText').optional().isString(),
    body('codeLanguage').optional().isString(),
  ]),
  async (req: Request, res: Response) => {
    const interviewId = req.params.id;
    try {
      const state = await interviewSessionService.getStateWithBranding(interviewId);
      if (!state) {
        return res.status(404).json(buildErrorResponse('SESSION_NOT_FOUND'));
      }

      const allowed = await assertCandidateAccess(req, state.candidateId);
      if (!allowed) {
        return res.status(403).json(buildErrorResponse('FORBIDDEN'));
      }

      const { answerText, codeContent, explanationText, codeLanguage } = req.body;
      const result = await aiInterviewerOrchestrator.submitAnswer({
        interviewId,
        answerText: String(answerText).trim(),
        codeContent: codeContent != null ? String(codeContent) : undefined,
        explanationText: explanationText != null ? String(explanationText) : undefined,
        codeLanguage: codeLanguage != null ? String(codeLanguage) : undefined,
        clientIp: getClientIp(req),
        userAgent: req.headers['user-agent'],
      });

      if (!result.success) {
        const errBody = mapFailureReason(result.failureReason);
        const status = ERROR_MESSAGES[errBody.code].status;
        return res.status(status).json(errBody);
      }

      res.json({
        state: result.state,
        nextReply: result.nextReply,
        avatarVideo: result.avatarVideo,
        evaluation: result.evaluation,
        report: result.report,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error('Submit answer error', { interviewId, error: message });
      res.status(500).json({
        ...buildErrorResponse('INTERNAL_ERROR'),
        ...(process.env.NODE_ENV !== 'production' ? { details: message } : {}),
      });
    }
  }
);

/** GET /interview/:id/state - Get current interview state (Redis) */
router.get(
  '/:id/state',
  optionalInterviewSessionAuthMiddleware,
  validate([param('id').isUUID()]),
  async (req: Request, res: Response) => {
  try {
    const state = await interviewSessionService.getStateWithBranding(req.params.id);
    if (!state) {
      return res.status(404).json(buildErrorResponse('SESSION_NOT_FOUND'));
    }
    if (config.interview.authRequired) {
      const allowed = await assertCandidateAccess(req, state.candidateId);
      if (!allowed) {
        return res.status(403).json(buildErrorResponse('FORBIDDEN'));
      }
    }
    res.json(state);
  } catch (e) {
    logger.error('Get state error', { error: e instanceof Error ? e.message : String(e) });
    res.status(500).json(buildErrorResponse('INTERNAL_ERROR'));
  }
});

/** POST /interview/:id/end - End interview and generate finalized report */
router.post(
  '/:id/end',
  interviewSessionAuthMiddleware,
  validate([param('id').isUUID()]),
  async (req: Request, res: Response) => {
    try {
      const interviewId = req.params.id;
      const state = await interviewSessionService.getState(interviewId);

      if (state) {
        const allowed = await assertCandidateAccess(req, state.candidateId);
        if (!allowed) {
          return res.status(403).json(buildErrorResponse('FORBIDDEN'));
        }
      }

      const finalized = await reportFinalizationService.finalizeReport(interviewId);
      const report = finalized?.report ?? null;

      if (state) {
        await interviewSessionService.end(interviewId, report ?? undefined, finalized?.reportStatus ?? 'draft');
      }

      await query(
        `UPDATE scheduled_interviews SET status = 'completed', updated_at = NOW() WHERE interview_id = $1`,
        [interviewId]
      );

      if (!report && !state) {
        return res.status(404).json(buildErrorResponse('SESSION_NOT_FOUND'));
      }

      res.json({ ended: true, report, reportStatus: finalized?.reportStatus ?? 'draft' });
    } catch (e) {
      logger.error('End interview error', { error: e instanceof Error ? e.message : String(e) });
      res.status(500).json(buildErrorResponse('INTERNAL_ERROR'));
    }
  }
);

export const interviewRoutes = router;
