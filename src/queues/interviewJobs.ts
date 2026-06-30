/**
 * Bull queue for background interview jobs: report generation when evaluations complete.
 */
import type { InterviewReport } from '../types';
import { reportFinalizationService } from '../services/interview/ReportFinalizationService';
import { logger } from '../config/logger';

export interface GenerateReportJobData {
  interviewId: string;
}

export async function enqueueReportGeneration(data: GenerateReportJobData): Promise<void> {
  logger.info('Enqueue report generation', data);
  void reportFinalizationService.finalizeReport(data.interviewId).catch((err) => {
    logger.error('Report generation job failed', {
      interviewId: data.interviewId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

export async function processReportJob(data: GenerateReportJobData): Promise<InterviewReport | null> {
  const result = await reportFinalizationService.finalizeReport(data.interviewId);
  return result?.report ?? null;
}
