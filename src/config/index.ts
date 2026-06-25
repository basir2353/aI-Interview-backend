/**
 * Central configuration. All env vars are read here so the rest of the app
 * stays env-agnostic and testable. For scale, consider validation (e.g. zod).
 */
import path from 'path';
import dotenv from 'dotenv';

const PRODUCTION_FRONTEND = 'https://a-i-interview-frontend.vercel.app';

// Load .env from backend folder so MAIL_FROM etc. are always from backend/.env (not cwd)
const backendRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(backendRoot, '.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
const onRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID
);
const portFromEnv = process.env.PORT;
if (onRailway && portFromEnv === '4000') {
  console.error(
    '[Config] PORT=4000 on Railway causes 502. Delete the PORT variable in Railway → backend → Variables. Railway uses port 8080.'
  );
}
const defaultPort = onRailway ? '8080' : '4000';

const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.DATABASE_PRIVATE_URL ||
  (nodeEnv === 'production' ? '' : 'postgresql://localhost:5432/ai_interviewer');

if (nodeEnv === 'production' && !databaseUrl) {
  console.error(
    '[Config] DATABASE_URL is not set. In Railway: add PostgreSQL, then link DATABASE_URL to the backend service variables.'
  );
}

export const config = {
  env: nodeEnv,
  port: parseInt(portFromEnv || defaultPort, 10),
  /** Bind address for HTTP server (0.0.0.0 required for Railway/Docker). */
  host: process.env.HOST || '0.0.0.0',
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  database: {
    url:
      databaseUrl ||
      (nodeEnv !== 'production' ? 'postgresql://localhost:5432/ai_interviewer' : ''),
  },

  redis: {
    // Default to in-memory so the app runs without Redis. Set REDIS_URL (e.g. redis://localhost:6379) to use Redis.
    url: process.env.REDIS_URL || 'memory',
  },

  ai: {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    /** `ollama` | `openrouter` — explicit pick; otherwise openrouter when OPENROUTER_API_KEY is set. */
    llmProvider: (() => {
      const explicit = (process.env.LLM_PROVIDER || '').toLowerCase();
      if (explicit === 'ollama' || explicit === 'openrouter') return explicit;
      return process.env.OPENROUTER_API_KEY ? 'openrouter' : 'ollama';
    })() as 'ollama' | 'openrouter',
    openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
    aiccApiKey: process.env.AICC_API_KEY || '',
    openRouterModel: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2',
    defaultTemperature: 0.4,
    maxContextTokens: 12000,
  },

  /** Speech-to-text: local (whisper.cpp) or openai (Whisper API – lighter for cloud). */
  stt: {
    provider: (process.env.STT_PROVIDER || 'local').toLowerCase() as 'local' | 'openai',
  },

  storage: {
    endpoint: process.env.STORAGE_ENDPOINT,
    bucket: process.env.STORAGE_BUCKET || 'interview-recordings',
    accessKey: process.env.STORAGE_ACCESS_KEY,
    secretKey: process.env.STORAGE_SECRET_KEY,
  },

  vectorDb: {
    url: process.env.VECTOR_DB_URL,
  },

  admin: {
    email: (process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase(),
    password: (
      process.env.ADMIN_PASSWORD ||
      (nodeEnv === 'production' ? '' : 'admin123')
    ).trim(),
  },

  /** HeyGen streaming avatar API key (https://app.heygen.com/settings?nav=API). */
  heygenApiKey: process.env.HEYGEN_API_KEY || '',

  /** Base URL of the frontend (for join links). No trailing slash. */
  frontendUrl:
    process.env.FRONTEND_URL ||
    (process.env.NODE_ENV === 'production' ? PRODUCTION_FRONTEND : 'http://localhost:3000'),

  /** Avatar pipeline (SadTalker + Wav2Lip + Coqui TTS). When enabled, AI interviewer replies can include a talking-head video. */
  avatar: {
    enabled: String(process.env.AVATAR_ENABLED || 'false').toLowerCase() === 'true',
    defaultImage: process.env.AVATAR_DEFAULT_IMAGE || '/avatars/interviewer.png',
    outputPath: process.env.AVATAR_OUTPUT_PATH || 'uploads/avatars',
    /** Max time in ms to wait for avatar generation before returning reply without video (non-blocking). */
    generationTimeoutMs: parseInt(process.env.AVATAR_GENERATION_TIMEOUT_MS || '2500', 10),
    /** Python script path (relative to backend cwd or absolute). Default: ../ai-avatar/generate_avatar.py when backend runs from its folder. */
    pythonScriptPath: process.env.AVATAR_PYTHON_SCRIPT || path.join('..', 'ai-avatar', 'generate_avatar.py'),
  },

  /** Mail used when the app sends email (e.g. password reset, interview schedule). From = MAIL_FROM; recipient = user who requested reset or candidate. */
  mail: {
    service: process.env.MAIL_SERVICE || process.env.SMTP_SERVICE || '',
    host: process.env.MAIL_HOST || process.env.SMTP_HOST || process.env.EMAIL_HOST || '',
    port: parseInt(process.env.MAIL_PORT || process.env.SMTP_PORT || '587', 10),
    secure: String(process.env.MAIL_SECURE || process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    user: process.env.MAIL_USER || process.env.SMTP_USER || process.env.EMAIL_USER || '',
    pass: process.env.MAIL_PASS || process.env.SMTP_PASS || process.env.EMAIL_PASS || '',
    from:
      process.env.MAIL_FROM ||
      process.env.SMTP_FROM ||
      process.env.EMAIL_FROM ||
      process.env.MAIL_USER ||
      process.env.SMTP_USER ||
      'no-reply@aiinterviewer.local',
    replyTo: process.env.MAIL_REPLY_TO || '',
  },
} as const;
