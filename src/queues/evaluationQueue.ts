/**
 * Bull queue for async LLM answer evaluation. Prevents race conditions
 * when generating final reports before scoring completes.
 */
import Queue from 'bull';
import { config } from '../config';
import { logger } from '../config/logger';
import { evaluationEngine } from '../services/interview/EvaluationEngine';
import { interviewSessionService } from '../services/interview/InterviewSessionService';
import { interviewResponseRepository } from '../repositories/InterviewResponseRepository';
import type { InterviewLanguageCode } from '../types';

export const EVALUATION_QUEUE_NAME = 'interview-evaluation';

export interface EvaluationJobData {
  interviewId: string;
  turnId: string;
  responseId: string;
  question: string;
  answer: string;
  competencyIds: string[];
  interviewLanguage?: InterviewLanguageCode;
}

let evaluationQueue: Queue.Queue<EvaluationJobData> | null = null;
let lastQueueErrorLog = 0;

function getRedisUrl(): string | null {
  const url = (config.redis.url || '').trim().toLowerCase();
  if (!url || url === 'memory') return null;
  return config.redis.url;
}

export function getEvaluationQueue(): Queue.Queue<EvaluationJobData> | null {
  if (evaluationQueue) return evaluationQueue;
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    logger.debug('Evaluation queue: Redis not configured, using inline fallback');
    return null;
  }
  try {
    evaluationQueue = new Queue<EvaluationJobData>(EVALUATION_QUEUE_NAME, redisUrl, {
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 200,
      },
    });
    evaluationQueue.on('error', (err: unknown) => {
      const now = Date.now();
      if (now - lastQueueErrorLog < 60_000) return;
      lastQueueErrorLog = now;
      logger.warn('Evaluation queue error', { error: err instanceof Error ? err.message : String(err) });
    });
    return evaluationQueue;
  } catch (err) {
    logger.warn('Evaluation queue creation failed', { error: (err as Error).message });
    return null;
  }
}

export async function enqueueEvaluation(data: EvaluationJobData): Promise<void> {
  const queue = getEvaluationQueue();
  if (queue) {
    await queue.add(data);
    logger.debug('Evaluation job enqueued', { interviewId: data.interviewId, turnId: data.turnId });
    return;
  }
  // Inline fallback when Redis/Bull unavailable
  void processEvaluationJob(data).catch((err) => {
    logger.error('Inline evaluation failed', { error: err instanceof Error ? err.message : String(err) });
  });
}

export async function processEvaluationJob(data: EvaluationJobData): Promise<void> {
  const started = Date.now();
  try {
    const full = await evaluationEngine.evaluate({
      question: data.question,
      answer: data.answer,
      competencyIds: data.competencyIds,
      interviewLanguage: data.interviewLanguage,
    });
    const evaluation = { ...full, status: 'completed' as const };

    await interviewResponseRepository.updateEvaluation(data.responseId, evaluation, 'completed');
    await interviewSessionService.updateTurnEvaluation(data.interviewId, data.turnId, evaluation);

    logger.info('Evaluation completed', {
      interviewId: data.interviewId,
      turnId: data.turnId,
      score: evaluation.score,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    logger.error('Evaluation job failed', {
      interviewId: data.interviewId,
      turnId: data.turnId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export function startEvaluationWorker(): void {
  const queue = getEvaluationQueue();
  if (!queue) return;
  queue.process(async (job) => {
    await processEvaluationJob(job.data);
  });
  logger.info('Evaluation queue worker started');
}

export async function waitForPendingEvaluations(interviewId: string): Promise<boolean> {
  return interviewResponseRepository.waitForEvaluationsComplete(
    interviewId,
    config.interview.evaluationWaitTimeoutMs,
    config.interview.evaluationPollIntervalMs
  );
}
