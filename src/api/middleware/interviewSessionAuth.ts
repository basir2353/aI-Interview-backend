/**
 * Interview session auth: JWT with type interview_session or matching candidate token.
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { verifyInterviewSessionToken, type InterviewSessionJwtPayload } from '../../utils/interviewSessionToken';
import { buildErrorResponse, ERROR_MESSAGES } from '../../types/errors';
import type { JwtPayload } from './auth';

export function interviewSessionAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config.interview.authRequired) {
    next();
    return;
  }

  const interviewId = req.params.id;
  if (!interviewId) {
    res.status(400).json(buildErrorResponse('INTERNAL_ERROR', { details: 'Missing interview id' }));
    return;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res
      .status(ERROR_MESSAGES.UNAUTHORIZED.status)
      .json(buildErrorResponse('UNAUTHORIZED'));
    return;
  }

  const token = header.slice(7);

  const sessionPayload = verifyInterviewSessionToken(token);
  if (sessionPayload && sessionPayload.interviewId === interviewId) {
    (req as Request & { interviewSession: InterviewSessionJwtPayload }).interviewSession = sessionPayload;
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    if (decoded.type === 'candidate' && decoded.candidateId) {
      (req as Request & { user: JwtPayload }).user = decoded;
      next();
      return;
    }
  } catch {
    // fall through
  }

  res.status(ERROR_MESSAGES.FORBIDDEN.status).json(buildErrorResponse('FORBIDDEN'));
}

/** Verify candidate JWT matches the interview's candidate (called after session load). */
export async function assertCandidateAccess(
  req: Request,
  candidateId: string
): Promise<boolean> {
  const session = (req as Request & { interviewSession?: InterviewSessionJwtPayload }).interviewSession;
  if (session) return session.candidateId === candidateId;

  const user = (req as Request & { user?: JwtPayload }).user;
  if (user?.type === 'candidate' && user.candidateId) {
    return user.candidateId === candidateId;
  }

  return !config.interview.authRequired;
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

/** Validates session token when present; does not reject missing auth (for begin-live / state). */
export function optionalInterviewSessionAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const interviewId = req.params.id;
  if (!interviewId) {
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = header.slice(7);
  const sessionPayload = verifyInterviewSessionToken(token);
  if (sessionPayload && sessionPayload.interviewId === interviewId) {
    (req as Request & { interviewSession: InterviewSessionJwtPayload }).interviewSession = sessionPayload;
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    if (decoded.type === 'candidate' && decoded.candidateId) {
      (req as Request & { user: JwtPayload }).user = decoded;
    }
  } catch {
    // ignore invalid optional token
  }

  next();
}
