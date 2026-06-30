/**
 * In-memory sliding-window rate limiter per interview session.
 */
import { Request, Response, NextFunction } from 'express';
import { config } from '../../config';
import { buildErrorResponse } from '../../types/errors';

interface WindowEntry {
  timestamps: number[];
}

const windows = new Map<string, WindowEntry>();

export function interviewAnswerRateLimit(req: Request, res: Response, next: NextFunction): void {
  const interviewId = req.params.id;
  if (!interviewId) {
    next();
    return;
  }

  const limit = config.interview.answerRateLimitPerMinute;
  const windowMs = 60_000;
  const now = Date.now();
  const key = `answer:${interviewId}`;

  let entry = windows.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    windows.set(key, entry);
  }

  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= limit) {
    const retryAfter = Math.ceil((entry.timestamps[0] + windowMs - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json(buildErrorResponse('RATE_LIMITED', { retryAfter }));
    return;
  }

  entry.timestamps.push(now);
  next();
}

/** @internal test helper */
export function resetRateLimits(): void {
  windows.clear();
}
