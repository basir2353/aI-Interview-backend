/**
 * Track active interview sessions in PostgreSQL for auth and audit.
 */
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/client';
import type { InterviewPhase } from '../types';

export class InterviewSessionRecordRepository {
  async upsertActiveSession(input: {
    interviewId: string;
    candidateId: string;
    sessionTokenHash?: string;
    phase?: InterviewPhase;
    clientIp?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await query(
      `INSERT INTO interview_sessions (
        id, interview_id, candidate_id, session_token_hash, status, current_phase,
        phase_started_at, last_activity_at, client_ip, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,'active',$5,$6,$6,$7,$6,$6)
      ON CONFLICT (interview_id) DO UPDATE SET
        session_token_hash = COALESCE(EXCLUDED.session_token_hash, interview_sessions.session_token_hash),
        current_phase = EXCLUDED.current_phase,
        last_activity_at = EXCLUDED.last_activity_at,
        client_ip = COALESCE(EXCLUDED.client_ip, interview_sessions.client_ip),
        updated_at = EXCLUDED.updated_at`,
      [
        uuidv4(),
        input.interviewId,
        input.candidateId,
        input.sessionTokenHash ?? null,
        input.phase ?? 'intro',
        now,
        input.clientIp ?? null,
      ]
    );
  }

  async touchActivity(interviewId: string): Promise<void> {
    await query(
      `UPDATE interview_sessions SET last_activity_at = NOW(), updated_at = NOW() WHERE interview_id = $1`,
      [interviewId]
    );
  }

  async updatePhase(interviewId: string, phase: InterviewPhase): Promise<void> {
    await query(
      `UPDATE interview_sessions
       SET current_phase = $2, phase_started_at = NOW(), last_activity_at = NOW(), updated_at = NOW()
       WHERE interview_id = $1`,
      [interviewId, phase]
    );
  }

  async markCompleted(interviewId: string): Promise<void> {
    await query(
      `UPDATE interview_sessions SET status = 'completed', updated_at = NOW() WHERE interview_id = $1`,
      [interviewId]
    );
  }

  async getCandidateId(interviewId: string): Promise<string | null> {
    const { rows } = await query<{ candidate_id: string }>(
      `SELECT candidate_id FROM interview_sessions WHERE interview_id = $1 LIMIT 1`,
      [interviewId]
    );
    return rows[0]?.candidate_id ?? null;
  }

  async logAnswerSubmission(input: {
    interviewId: string;
    responseId?: string;
    clientIp?: string;
    userAgent?: string;
    success: boolean;
    errorCode?: string;
  }): Promise<void> {
    await query(
      `INSERT INTO answer_submission_logs (
        id, interview_id, response_id, client_ip, user_agent, success, error_code, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [
        uuidv4(),
        input.interviewId,
        input.responseId ?? null,
        input.clientIp ?? null,
        input.userAgent ?? null,
        input.success,
        input.errorCode ?? null,
      ]
    );
  }
}

export const interviewSessionRecordRepository = new InterviewSessionRecordRepository();
