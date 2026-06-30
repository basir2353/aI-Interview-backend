/**
 * Persist and load candidate interview responses from PostgreSQL.
 */
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/client';
import type { AnswerEvaluation, EvaluationStatus, InterviewResponseRecord } from '../types';

export interface CreateResponseInput {
  interviewId: string;
  candidateId: string;
  turnId: string;
  questionId?: string | null;
  answerText: string;
  codeContent?: string | null;
  explanationText?: string | null;
  codeLanguage?: string | null;
  evaluation?: AnswerEvaluation;
  evaluationStatus?: EvaluationStatus;
}

function rowToRecord(row: {
  id: string;
  interview_id: string;
  candidate_id: string;
  turn_id: string;
  question_id: string | null;
  answer_text: string;
  code_content: string | null;
  explanation_text: string | null;
  code_language: string | null;
  evaluation_data: unknown;
  evaluation_status: string;
  created_at: Date | string;
  updated_at: Date | string;
}): InterviewResponseRecord {
  return {
    id: row.id,
    interviewId: row.interview_id,
    candidateId: row.candidate_id,
    turnId: row.turn_id,
    questionId: row.question_id,
    answerText: row.answer_text,
    codeContent: row.code_content,
    explanationText: row.explanation_text,
    codeLanguage: row.code_language,
    evaluationData: (row.evaluation_data as AnswerEvaluation) ?? {},
    evaluationStatus: row.evaluation_status as EvaluationStatus,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export class InterviewResponseRepository {
  async create(input: CreateResponseInput): Promise<InterviewResponseRecord> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const evaluation = input.evaluation ?? {};
    const status = input.evaluationStatus ?? 'pending';

    const { rows } = await query<{
      id: string;
      interview_id: string;
      candidate_id: string;
      turn_id: string;
      question_id: string | null;
      answer_text: string;
      code_content: string | null;
      explanation_text: string | null;
      code_language: string | null;
      evaluation_data: unknown;
      evaluation_status: string;
      created_at: string;
      updated_at: string;
    }>(
      `INSERT INTO interview_responses (
        id, interview_id, candidate_id, turn_id, question_id, answer_text,
        code_content, explanation_text, code_language, evaluation_data, evaluation_status,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
      RETURNING *`,
      [
        id,
        input.interviewId,
        input.candidateId,
        input.turnId,
        input.questionId ?? null,
        input.answerText,
        input.codeContent ?? null,
        input.explanationText ?? null,
        input.codeLanguage ?? null,
        JSON.stringify({ ...evaluation, status }),
        status,
        now,
      ]
    );
    return rowToRecord(rows[0]);
  }

  async updateEvaluation(
    responseId: string,
    evaluation: AnswerEvaluation,
    status: EvaluationStatus = 'completed'
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await query(
      `UPDATE interview_responses
       SET evaluation_data = $2, evaluation_status = $3, updated_at = $4
       WHERE id = $1`,
      [responseId, JSON.stringify({ ...evaluation, status }), status, now]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findByTurnId(turnId: string): Promise<InterviewResponseRecord | null> {
    const { rows } = await query(
      `SELECT * FROM interview_responses WHERE turn_id = $1 LIMIT 1`,
      [turnId]
    );
    return rows.length ? rowToRecord(rows[0] as Parameters<typeof rowToRecord>[0]) : null;
  }

  async listByInterview(interviewId: string): Promise<InterviewResponseRecord[]> {
    const { rows } = await query(
      `SELECT * FROM interview_responses WHERE interview_id = $1 ORDER BY created_at ASC`,
      [interviewId]
    );
    return rows.map((r) => rowToRecord(r as Parameters<typeof rowToRecord>[0]));
  }

  async countPendingEvaluations(interviewId: string): Promise<number> {
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM interview_responses
       WHERE interview_id = $1 AND evaluation_status = 'pending'`,
      [interviewId]
    );
    return parseInt(rows[0]?.count ?? '0', 10);
  }

  async waitForEvaluationsComplete(
    interviewId: string,
    timeoutMs: number,
    pollIntervalMs: number
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const pending = await this.countPendingEvaluations(interviewId);
      if (pending === 0) return true;
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    return (await this.countPendingEvaluations(interviewId)) === 0;
  }
}

export const interviewResponseRepository = new InterviewResponseRepository();
