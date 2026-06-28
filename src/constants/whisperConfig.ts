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

  for (const candidate of MODEL_CANDIDATES) {
    if (fileExists(candidate)) {
      logger.info('[whisper] using model', { path: candidate });
      return candidate;
    }
  }

  return envPath || null;
}
