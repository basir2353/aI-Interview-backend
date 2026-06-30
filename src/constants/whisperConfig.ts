import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../config/logger';

const MODEL_CANDIDATES = [
  '/app/models/ggml-small.bin',
  '/app/models/ggml-base.bin',
  path.join(process.cwd(), 'models', 'ggml-small.bin'),
  path.join(process.cwd(), 'models', 'ggml-base.bin'),
  path.join(process.cwd(), 'whisper.cpp', 'models', 'ggml-small.bin'),
  path.join(process.cwd(), 'whisper.cpp', 'models', 'ggml-base.bin'),
  path.join(process.cwd(), 'models', 'ggml-base.en.bin'),
];

function fileExists(filePath: string): boolean {
  try {
    return Boolean(filePath && fs.existsSync(filePath));
  } catch {
    return false;
  }
}

/** Resolve whisper.cpp model path — honors WHISPER_MODEL_PATH when the file exists, else falls back. */
export function resolveWhisperModelPath(): string | null {
  const envPath = process.env.WHISPER_MODEL_PATH?.trim();
  if (envPath && fileExists(envPath)) {
    return envPath;
  }

  if (envPath) {
    logger.warn('[whisper] WHISPER_MODEL_PATH missing on disk; falling back to bundled model', {
      configured: envPath,
    });
  }

  const preferFast = process.env.WHISPER_FAST === 'true' || process.env.WHISPER_FAST === '1';
  const ordered = preferFast
    ? [
        '/app/models/ggml-base.bin',
        '/app/models/ggml-small.bin',
        ...MODEL_CANDIDATES.filter(
          (p) => p !== '/app/models/ggml-base.bin' && p !== '/app/models/ggml-small.bin'
        ),
      ]
    : MODEL_CANDIDATES;

  for (const candidate of ordered) {
    if (fileExists(candidate)) {
      logger.info('[whisper] using model', { path: candidate, preferFast });
      return candidate;
    }
  }

  return envPath || null;
}
