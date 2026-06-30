/**
 * Per-interview mutex so concurrent answer/state writes cannot lose turns.
 * Reentrant within the same async call chain on one Node process.
 */
import { v4 as uuidv4 } from 'uuid';
import { getRedis, KEY_PREFIX } from '../../redis/client';
import { logger } from '../../config/logger';

const LOCK_TTL_SECONDS = 20;
const LOCK_RETRY_MS = 40;
const LOCK_MAX_WAIT_MS = 8000;

const heldDepth = new Map<string, number>();

function lockKey(interviewId: string): string {
  return `${KEY_PREFIX}lock:${interviewId}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireRedisLock(interviewId: string, token: string): Promise<boolean> {
  const redis = getRedis();
  const result = await redis.set(lockKey(interviewId), token, 'EX', LOCK_TTL_SECONDS, 'NX');
  return result === 'OK';
}

async function releaseRedisLock(interviewId: string, token: string): Promise<void> {
  const redis = getRedis();
  const key = lockKey(interviewId);
  const current = await redis.get(key);
  if (current === token) {
    await redis.del(key);
  }
}

export async function withInterviewSessionLock<T>(
  interviewId: string,
  fn: () => Promise<T>
): Promise<T> {
  const depth = heldDepth.get(interviewId) ?? 0;
  if (depth > 0) {
    heldDepth.set(interviewId, depth + 1);
    try {
      return await fn();
    } finally {
      heldDepth.set(interviewId, depth);
    }
  }

  const token = uuidv4();
  const deadline = Date.now() + LOCK_MAX_WAIT_MS;
  let acquired = false;

  while (Date.now() < deadline) {
    acquired = await acquireRedisLock(interviewId, token);
    if (acquired) break;
    await sleep(LOCK_RETRY_MS);
  }

  if (!acquired) {
    logger.warn('Interview session lock timeout; proceeding without lock', { interviewId });
    return fn();
  }

  heldDepth.set(interviewId, 1);
  try {
    return await fn();
  } finally {
    heldDepth.delete(interviewId);
    await releaseRedisLock(interviewId, token).catch(() => undefined);
  }
}
