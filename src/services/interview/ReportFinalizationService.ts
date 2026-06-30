/**
 * Finalize interview reports only after all evaluations complete.
 */
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../db/client';
import { config } from '../../config';
import { logger } from '../../config/logger';
import { waitForPendingEvaluations } from '../../queues/evaluationQueue';
import { interviewSessionService } from './InterviewSessionService';
import { scoringReportService } from './ScoringReportService';
import { interviewResponseRepository } from '../../repositories/InterviewResponseRepository';
import type { InterviewReport, ReportStatus } from '../../types';

export class ReportFinalizationService {
  /**
   * Wait for pending evaluations, rebuild state from DB responses, generate report.
   */
  async finalizeReport(interviewId: string): Promise<{
    report: InterviewReport;
    reportStatus: ReportStatus;
  } | null> {
    const allComplete = await waitForPendingEvaluations(interviewId);
    const reportStatus: ReportStatus = allComplete ? 'finalized' : 'draft';

    if (!allComplete) {
      logger.warn('Report finalized as draft — pending evaluations remain', { interviewId });
    }

    let state = await interviewSessionService.getStateWithBranding(interviewId);
    if (!state) {
      state = await interviewSessionService.recoverFromBackup(interviewId);
    }
    if (!state) return null;

    // Sync evaluations from DB into turns
    const responses = await interviewResponseRepository.listByInterview(interviewId);
    for (const resp of responses) {
      const turn = state.turns.find((t) => t.id === resp.turnId);
      if (turn && turn.role === 'candidate') {
        turn.responseId = resp.id;
        if (resp.evaluationStatus === 'completed' && resp.evaluationData) {
          turn.evaluation = resp.evaluationData as typeof turn.evaluation;
        }
      }
    }

    const report = scoringReportService.buildReport({
      ...state,
      endedAt: state.endedAt ?? new Date().toISOString(),
    });
    report.reportStatus = reportStatus;

    await this.persistReport(interviewId, report, reportStatus, allComplete ? 'all_evaluations_complete' : 'timeout_with_pending');

    return { report, reportStatus };
  }

  async persistReport(
    interviewId: string,
    report: InterviewReport,
    reportStatus: ReportStatus,
    changeReason: string
  ): Promise<void> {
    const reportId = uuidv4();
    const now = new Date().toISOString();

    await query(
      `INSERT INTO reports (
        id, interview_id, overall_score, max_score, recommendation, summary,
        red_flags, strengths, improvements, competencies, question_answer_summary,
        report_status, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (interview_id) DO UPDATE SET
        overall_score = EXCLUDED.overall_score,
        max_score = EXCLUDED.max_score,
        recommendation = EXCLUDED.recommendation,
        summary = EXCLUDED.summary,
        red_flags = EXCLUDED.red_flags,
        strengths = EXCLUDED.strengths,
        improvements = EXCLUDED.improvements,
        competencies = EXCLUDED.competencies,
        question_answer_summary = EXCLUDED.question_answer_summary,
        report_status = EXCLUDED.report_status,
        updated_at = EXCLUDED.updated_at`,
      [
        reportId,
        interviewId,
        report.overallScore,
        report.maxScore,
        report.recommendation,
        report.summary,
        JSON.stringify(report.redFlags),
        JSON.stringify(report.strengths),
        JSON.stringify(report.improvements),
        JSON.stringify(report.competencies),
        JSON.stringify(report.questionAnswerSummary),
        reportStatus,
        now,
      ]
    );

    await query(
      `INSERT INTO report_audit_log (id, interview_id, report_status, overall_score, change_reason, created_at)
       VALUES ($1,$2,$3,$4,$5,NOW())`,
      [uuidv4(), interviewId, reportStatus, report.overallScore, changeReason]
    );

    logger.info('Report persisted', {
      interviewId,
      reportStatus,
      overallScore: report.overallScore,
      changeReason,
    });
  }
}

export const reportFinalizationService = new ReportFinalizationService();
