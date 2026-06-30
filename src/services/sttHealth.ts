import * as fs from 'fs';
import { spawnSync } from 'child_process';
import { config } from '../config';
import { resolveWhisperModelPath } from '../constants/whisperConfig';

export interface SttHealthStatus {
  status: 'ok' | 'degraded' | 'error';
  provider: string;
  modelPath: string | null;
  modelExists: boolean;
  whisperCli: string | null;
  whisperCliReady: boolean;
  ffmpegReady: boolean;
  remoteConfigured: boolean;
  hint?: string;
}

function hasFfmpeg(): boolean {
  try {
    return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}

function whisperCliReady(bin: string | null): boolean {
  if (!bin) return false;
  try {
    const check = spawnSync(bin, ['-h'], { encoding: 'utf8', timeout: 5000 });
    return check.status === 0 || check.status === 1;
  } catch {
    return false;
  }
}

/** Lightweight STT readiness probe for /health/stt and ops checks. */
export function getSttHealthStatus(): SttHealthStatus {
  const modelPath = resolveWhisperModelPath();
  const modelExists = Boolean(modelPath && fs.existsSync(modelPath));
  const whisperCli = process.env.WHISPER_CPP_PATH?.trim() || null;
  const cliReady = whisperCliReady(whisperCli);
  const ffmpegReady = hasFfmpeg();
  const remoteConfigured =
    config.stt.provider === 'openai'
      ? Boolean(config.ai.openaiApiKey)
      : config.stt.provider === 'speaches'
        ? Boolean(config.stt.remote.baseUrl && config.stt.remote.apiKey)
        : Boolean(
            config.stt.remote.apiKey ||
              config.stt.remote.baseUrl ||
              config.ai.openaiApiKey
          );

  let status: SttHealthStatus['status'] = 'ok';
  let hint: string | undefined;

  if (config.stt.provider === 'local') {
    if (!modelExists) {
      status = 'degraded';
      hint = 'Whisper model missing. Set WHISPER_MODEL_PATH or deploy ggml-small.bin under /app/models.';
    } else if (!cliReady) {
      status = 'degraded';
      hint = 'whisper-cli not found. Set WHISPER_CPP_PATH=/usr/local/bin/whisper-cli on Railway.';
    } else if (!ffmpegReady) {
      status = 'degraded';
      hint = 'ffmpeg missing — non-WAV uploads may fail normalization.';
    }
  } else if (!remoteConfigured) {
    status = 'degraded';
    hint =
      config.stt.provider === 'speaches'
        ? 'Set SPEACHES_BASE_URL and SPEACHES_API_KEY.'
        : 'Set OPENAI_API_KEY for remote STT.';
  }

  if (!modelExists && !cliReady && !remoteConfigured) {
    status = 'error';
    hint = hint ?? 'No local whisper.cpp and no remote STT configured.';
  }

  return {
    status,
    provider: config.stt.provider,
    modelPath: modelExists ? modelPath : null,
    modelExists,
    whisperCli,
    whisperCliReady: cliReady,
    ffmpegReady,
    remoteConfigured,
    hint,
  };
}
