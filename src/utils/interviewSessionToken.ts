/**
 * Short-lived JWT for interview session access (answer submission, etc.).
 */
import jwt, { type SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';

export interface InterviewSessionJwtPayload {
  sub: string;
  type: 'interview_session';
  interviewId: string;
  candidateId: string;
}

export function issueInterviewSessionToken(interviewId: string, candidateId: string): string {
  return jwt.sign(
    {
      sub: interviewId,
      type: 'interview_session',
      interviewId,
      candidateId,
    } satisfies InterviewSessionJwtPayload,
    config.jwt.secret,
    { expiresIn: config.interview.sessionTokenExpiresIn as SignOptions['expiresIn'] }
  );
}

export function verifyInterviewSessionToken(token: string): InterviewSessionJwtPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as InterviewSessionJwtPayload;
    if (decoded.type !== 'interview_session' || !decoded.interviewId || !decoded.candidateId) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

/** Store a hash of the token in DB for session tracking (not the raw token). */
export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
