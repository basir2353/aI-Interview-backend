/**
 * Debounced PostgreSQL backup of Redis interview session state.
 */
import { query } from '../../db/client';
import { config } from '../../config';
import { logger } from '../../config/logger';
import type { InterviewState } from '../../types';
import { v4 as uuidv4 } from 'uuid';

const pendingBackups = new Map<string, ReturnType<typeof setTimeout>>();

export class SessionPersistenceService {
  scheduleBackup(interviewId: string, state: InterviewState): void {
    const existing = pendingBackups.get(interviewId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      pendingBackups.delete(interviewId);
      void this.persistBackup(interviewId, state).catch((err) => {
        logger.error('Session backup failed', {
          interviewId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, config.interview.sessionBackupIntervalMs);

    pendingBackups.set(interviewId, timer);
  }

  async persistBackup(interviewId: string, state: InterviewState): Promise<void> {
    await query(
      `INSERT INTO session_backups (id, interview_id, state_json, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [uuidv4(), interviewId, JSON.stringify(state)]
    );
    logger.debug('Session backed up to DB', { interviewId, turns: state.turns.length });
  }

  async recoverState(interviewId: string): Promise<InterviewState | null> {
    const { rows } = await query<{ state_json: InterviewState }>(
      `SELECT state_json FROM session_backups
       WHERE interview_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [interviewId]
    );
    if (!rows.length) return null;
    logger.info('Recovered session from DB backup', { interviewId });
    return rows[0].state_json;
  }

  flushAll(): void {
    for (const timer of pendingBackups.values()) clearTimeout(timer);
    pendingBackups.clear();
  }
}

export const sessionPersistenceService = new SessionPersistenceService();
