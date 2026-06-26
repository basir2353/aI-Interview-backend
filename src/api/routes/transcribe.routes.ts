import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, spawnSync } from 'child_process';
import { logger } from '../../config/logger';
import { config } from '../../config';
import { OpenAISTTService } from '../../ai/stt/OpenAISTTService';

const router = Router();
let whisperBuildPromise: Promise<void> | null = null;

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      /audio\//i.test(file.mimetype) ||
      file.mimetype === 'application/octet-stream' ||
      file.mimetype === '';
    if (ok) cb(null, true);
    else cb(new Error(`Invalid content-type: ${file.mimetype}`));
  },
});

function ensureFfmpegAvailable(): void {
  const check = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  if (check.status !== 0) {
    throw new Error(
      'ffmpeg not found. Install it (macOS: brew install ffmpeg) and ensure it is on PATH.'
    );
  }
}

function hasFfmpeg(): boolean {
  try {
    const check = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return check.status === 0;
  } catch {
    return false;
  }
}

function hasCmake(): boolean {
  try {
    const check = spawnSync('cmake', ['--version'], { stdio: 'ignore' });
    return check.status === 0;
  } catch {
    return false;
  }
}

function hasCommandOnPath(cmd: string): boolean {
  try {
    const check = spawnSync(cmd, ['--help'], { stdio: 'ignore' });
    return check.status === 0 || check.status === 1; // many CLIs return 1 for --help
  } catch {
    return false;
  }
}

/** Python openai-whisper uses --model, --output_format; whisper.cpp uses -m, -f, -otxt. */
function isWhisperCppBinary(bin: string): boolean {
  try {
    const check = spawnSync(bin, ['-h'], { encoding: 'utf8', timeout: 5000 });
    const out = (check.stderr || '') + (check.stdout || '');
    // Python whisper usage contains long-form flags; whisper.cpp uses short -m, -f.
    if (out.includes('--output_format') || /\[\s*--model\s+MODEL\s*\]/.test(out)) return false;
    return out.includes('-m') && out.includes('-f');
  } catch {
    return false;
  }
}

async function ensureWhisperCppBuilt(): Promise<void> {
  if (whisperBuildPromise) return whisperBuildPromise;

  whisperBuildPromise = (async () => {
    const whisperCppDir = path.join(process.cwd(), 'whisper.cpp');
    if (!fs.existsSync(whisperCppDir)) return;

    if (!hasCmake()) {
      throw new Error(
        'cmake not found. Install it (macOS: brew install cmake) or set WHISPER_CPP_PATH to an existing whisper.cpp binary.'
      );
    }

    const buildDir = path.join(whisperCppDir, 'build');
    logger.info('[transcribe] whisper.cpp binary missing; building via cmake', { buildDir });

    const cfg = await runCommand(
      'cmake',
      ['-S', whisperCppDir, '-B', buildDir, '-DCMAKE_BUILD_TYPE=Release'],
      { timeoutMs: 10 * 60 * 1000 }
    );
    if (cfg.code !== 0) {
      throw new Error(`cmake configure failed: ${cfg.stderr.slice(0, 1000) || cfg.stdout.slice(0, 1000)}`);
    }

    const build = await runCommand('cmake', ['--build', buildDir, '--config', 'Release'], {
      timeoutMs: 10 * 60 * 1000,
    });
    if (build.code !== 0) {
      throw new Error(`cmake build failed: ${build.stderr.slice(0, 1000) || build.stdout.slice(0, 1000)}`);
    }

    logger.info('[transcribe] whisper.cpp build complete');
  })().catch((e) => {
    // Allow future retries if build failed.
    whisperBuildPromise = null;
    throw e;
  });

  return whisperBuildPromise;
}

function getWhisperCppCandidates(): string[] {
  const base = [
    path.join(process.cwd(), 'whisper.cpp', 'build', 'bin', 'whisper-cli'),
    path.join(process.cwd(), 'whisper.cpp', 'build', 'bin', 'Release', 'whisper-cli'),
    path.join(process.cwd(), 'whisper.cpp', 'build', 'bin', 'whisper'),
    path.join(process.cwd(), 'whisper.cpp', 'build', 'bin', 'Release', 'whisper'),
    path.join(process.cwd(), 'whisper.cpp', 'main'),
    path.join(process.cwd(), 'whisper'),
  ];
  // Windows builds produce .exe
  if (process.platform === 'win32') {
    return [
      ...base.map((p) => p + '.exe'),
      ...base,
    ];
  }
  return base;
}

async function resolveWhisperBin(): Promise<string | null> {
  if (process.env.WHISPER_CPP_PATH) return process.env.WHISPER_CPP_PATH;

  // Prefer whisper-cli on PATH (package managers usually ship whisper.cpp under this name).
  if (hasCommandOnPath('whisper-cli')) return 'whisper-cli';

  // Prefer local whisper.cpp build over generic "whisper" on PATH (which may be Python openai-whisper).
  const candidates = getWhisperCppCandidates();
  const existing = pickFirstExisting(candidates);
  if (existing) return existing;

  // Only use PATH "whisper" if it is actually whisper.cpp (not Python openai-whisper).
  if (hasCommandOnPath('whisper') && isWhisperCppBinary('whisper')) return 'whisper';

  // Try building whisper.cpp if source exists.
  try {
    await ensureWhisperCppBuilt();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[transcribe] whisper.cpp build failed', { error: msg });
    return null;
  }

  const afterBuild = pickFirstExisting(candidates);
  if (afterBuild) return afterBuild;

  logger.warn('[transcribe] whisper.cpp not found. If you have Python openai-whisper installed, the "whisper" command is the wrong CLI. Build whisper.cpp or set WHISPER_CPP_PATH.');
  return null;
}

function isWhisperReadyWav16kMonoPcmS16le(filePath: string): boolean {
  try {
    // Read enough bytes to cover RIFF header + common chunk layouts.
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(4096);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const header = buf.subarray(0, bytesRead);

    if (header.length < 44) return false;
    if (header.toString('ascii', 0, 4) !== 'RIFF') return false;
    if (header.toString('ascii', 8, 12) !== 'WAVE') return false;

    let offset = 12;
    while (offset + 8 <= header.length) {
      const chunkId = header.toString('ascii', offset, offset + 4);
      const chunkSize = header.readUInt32LE(offset + 4);
      offset += 8;

      if (chunkId === 'fmt ') {
        if (offset + 16 > header.length) return false;
        const audioFormat = header.readUInt16LE(offset);
        const numChannels = header.readUInt16LE(offset + 2);
        const sampleRate = header.readUInt32LE(offset + 4);
        const bitsPerSample = header.readUInt16LE(offset + 14);
        return (
          audioFormat === 1 && // PCM
          numChannels === 1 &&
          sampleRate === 16000 &&
          bitsPerSample === 16
        );
      }

      // Skip chunk payload (plus padding to word boundary).
      const skip = chunkSize + (chunkSize % 2);
      offset += skip;
    }
    return false;
  } catch {
    return false;
  }
}

function pickFirstExisting(candidates: string[]): string | null {
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

async function runCommand(
  cmd: string,
  args: string[],
  opts: { timeoutMs: number }
): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    const timeoutId = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      reject(new Error(`Command timed out after ${opts.timeoutMs}ms: ${cmd}`));
    }, opts.timeoutMs);

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    child.on('error', (e) => {
      clearTimeout(timeoutId);
      reject(e);
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function extractTranscriptFromWhisperStdout(stdout: string): string {
  const lines = (stdout || '').split('\n');
  return lines
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('['))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function assertReadableAudioFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Audio file missing before transcription: ${filePath}`);
  }
  const stat = fs.statSync(filePath);
  if (stat.size < 44) {
    throw new Error(`Audio file too small (${stat.size} bytes): ${filePath}`);
  }
}

async function normalizeUploadedAudio(inputPath: string): Promise<string> {
  if (isWhisperReadyWav16kMonoPcmS16le(inputPath)) {
    logger.info('[transcribe] using uploaded 16kHz mono WAV directly', { inputPath });
    return inputPath;
  }

  if (!hasFfmpeg()) {
    throw new Error(
      'ffmpeg not found and uploaded audio is not a 16kHz mono 16-bit PCM WAV. Install ffmpeg or upload a 16kHz mono WAV.'
    );
  }

  const normalizedPath = path.join(os.tmpdir(), `uploaded_${Date.now()}_16k_mono.wav`);
  const ffmpegArgs = [
    '-y',
    '-i',
    inputPath,
    '-ar',
    '16000',
    '-ac',
    '1',
    '-c:a',
    'pcm_s16le',
    normalizedPath,
  ];

  logger.info('[transcribe] running ffmpeg', { args: ffmpegArgs.join(' ') });
  const ff = await runCommand('ffmpeg', ffmpegArgs, { timeoutMs: 60000 });
  if (ff.code !== 0) {
    throw new Error(`ffmpeg conversion failed: ${ff.stderr.slice(0, 2000) || ff.stdout.slice(0, 2000)}`);
  }

  assertReadableAudioFile(normalizedPath);
  return normalizedPath;
}

async function transcribeWithRemoteStt(filePath: string): Promise<string> {
  const service = new OpenAISTTService();
  const buffer = fs.readFileSync(filePath);
  return service.transcribe(buffer);
}

function remoteSttConfigured(): boolean {
  const { baseUrl, apiKey } = config.stt.remote;
  if (config.stt.provider === 'speaches') {
    return Boolean(baseUrl && apiKey);
  }
  if (config.stt.provider === 'openai') {
    return Boolean(config.ai.openaiApiKey);
  }
  return Boolean(apiKey || config.ai.openaiApiKey || baseUrl);
}

async function tryRemoteStt(normalizedPath: string): Promise<string | null> {
  if (!remoteSttConfigured()) return null;
  try {
    logger.info(`[transcribe] using ${remoteSttLabel()}`, {
      baseUrl: config.stt.remote.baseUrl || '(OpenAI default)',
      model: config.stt.remote.model,
    });
    const transcript = (await transcribeWithRemoteStt(normalizedPath)).trim();
    return transcript || null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[transcribe] remote STT failed; will try local whisper if available', { error: message });
    return null;
  }
}

function remoteSttLabel(): string {
  return config.stt.provider === 'speaches' || config.stt.remote.baseUrl ? 'Speaches' : 'OpenAI Whisper API';
}

async function transcribeNormalizedAudio(normalizedPath: string, res: Response): Promise<Response> {
  assertReadableAudioFile(normalizedPath);

  if (config.stt.provider === 'openai' || config.stt.provider === 'speaches') {
    if (!remoteSttConfigured()) {
      logger.warn('[transcribe] Remote STT not fully configured; falling back to local whisper.cpp', {
        provider: config.stt.provider,
        hasBaseUrl: Boolean(config.stt.remote.baseUrl),
        hasApiKey: Boolean(config.stt.remote.apiKey),
      });
    } else {
      const remoteTranscript = await tryRemoteStt(normalizedPath);
      if (remoteTranscript) {
        return res.json({ transcript: remoteTranscript });
      }
      logger.warn('[transcribe] Remote STT unavailable; falling back to local whisper.cpp');
    }
  }

  const whisperBin = await resolveWhisperBin();
  if (!whisperBin) {
    const remoteTranscript = await tryRemoteStt(normalizedPath);
    if (remoteTranscript) {
      return res.json({ transcript: remoteTranscript });
    }
    if (config.stt.provider === 'speaches' || config.stt.provider === 'openai') {
      return res.status(500).json({
        error: 'Remote STT not configured',
        details:
          config.stt.provider === 'speaches'
            ? 'Set SPEACHES_BASE_URL and SPEACHES_API_KEY on Railway, or remove STT_PROVIDER=speaches to use built-in whisper.cpp.'
            : 'Set OPENAI_API_KEY or configure Speaches (SPEACHES_BASE_URL + SPEACHES_API_KEY).',
      });
    }
    return res.status(500).json({
      error: 'Whisper executable not found',
      details:
        'Install whisper.cpp CLI, deploy Speaches on Railway (STT_PROVIDER=speaches), or set STT_PROVIDER=openai with OPENAI_API_KEY.',
    });
  }

  const modelPath =
    process.env.WHISPER_MODEL_PATH ||
    pickFirstExisting([
      path.join(process.cwd(), 'models', 'ggml-base.en.bin'),
      path.join(process.cwd(), 'whisper.cpp', 'models', 'ggml-base.en.bin'),
    ]);

  if (!modelPath) {
    return res.status(500).json({
      error: 'Whisper model not found',
      details:
        'Expected models/ggml-base.en.bin (or set WHISPER_MODEL_PATH). From the backend folder run: ./whisper.cpp/models/download-ggml-model.sh base.en ./models',
    });
  }

  const outputTxtPath = `${normalizedPath}.txt`;
  const whisperArgs = [
    '-m',
    modelPath,
    '-f',
    normalizedPath,
    '-l',
    process.env.WHISPER_LANGUAGE || 'en',
    '--no-timestamps',
    '-otxt',
  ];

  logger.info('[transcribe] running whisper.cpp', { bin: whisperBin, args: whisperArgs.join(' ') });
  const ws = await runCommand(whisperBin, whisperArgs, { timeoutMs: 240000 });

  if (ws.code !== 0) {
    const errOut = ws.stderr.slice(0, 2000) || ws.stdout.slice(0, 2000);
    logger.error('[transcribe] whisper failed', {
      code: ws.code,
      stderr: errOut.slice(0, 2000),
      stdout: ws.stdout.slice(0, 500),
    });
    if (remoteSttConfigured()) {
      logger.warn('[transcribe] whisper.cpp broken at runtime; falling back to remote STT');
      const remoteTranscript = await tryRemoteStt(normalizedPath);
      if (remoteTranscript) return res.json({ transcript: remoteTranscript });
    }
    return res.status(500).json({
      error: 'whisper.cpp failed',
      details: errOut,
    });
  }

  let transcript = extractTranscriptFromWhisperStdout(ws.stdout);
  if (!transcript && outputTxtPath && fs.existsSync(outputTxtPath)) {
    try {
      transcript = fs.readFileSync(outputTxtPath, 'utf8').replace(/\s+/g, ' ').trim();
    } catch {
      // ignore
    }
  }

  logger.info('[transcribe] whisper output', {
    transcriptPreview: transcript ? transcript.slice(0, 120) : '',
    stdoutBytes: ws.stdout.length,
    stderrBytes: ws.stderr.length,
  });

  if (!transcript) {
    return res.status(422).json({
      error: 'Empty transcript',
      details:
        'Whisper returned no text. Check that audio contains speech and that ffmpeg normalization succeeded.',
    });
  }

  return res.json({ transcript });
}

router.post('/', upload.single('audio'), async (req: Request, res: Response) => {
  const file = (req as any).file as
    | { path: string; originalname?: string; mimetype?: string; size?: number }
    | undefined;

  let inputPath: string | null = file?.path || null;
  let normalizedPath: string | null = null;
  let outputTxtPath: string | null = null;

  try {
    if (!file || !inputPath) {
      return res.status(400).json({ error: 'Audio file is required (field: audio)' });
    }

    logger.info('[transcribe] file received', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: inputPath,
    });

    if (!file.size || file.size <= 0) {
      return res.status(400).json({ error: 'No audio detected (empty upload)' });
    }

    // Normalize to 16kHz mono PCM_s16le for whisper.cpp (skip ffmpeg when frontend already sends WAV).
    normalizedPath = await normalizeUploadedAudio(inputPath);

    outputTxtPath = `${normalizedPath}.txt`;
    return await transcribeNormalizedAudio(normalizedPath, res);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('[transcribe] route failed', { error: message });
    return res.status(500).json({
      error: 'Transcription failed',
      details: message,
    });
  } finally {
    const toDelete = new Set<string>();
    if (inputPath) toDelete.add(inputPath);
    if (normalizedPath) toDelete.add(normalizedPath);
    if (outputTxtPath) toDelete.add(outputTxtPath);
    for (const p of toDelete) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        // ignore
      }
    }
  }
});

export const transcribeRoutes = router;

