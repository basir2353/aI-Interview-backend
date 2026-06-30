/**
 * Express app: CORS, JSON body, mount interview and report routes.
 * Auth middleware can be applied per-route for recruiter endpoints.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from '../config';
import { interviewRoutes } from './routes/interview';
import { reportRoutes } from './routes/report';
import { adminRoutes } from './routes/admin';
import { publicJoinRoutes } from './routes/publicJoin';
import { aiRoutes } from './routes/ai';
import { llmRoutes } from './routes/llm.routes';
import { voiceInterviewRoutes } from './routes/voice-interview.routes';
import { voiceLoopRoutes } from './routes/voiceLoop.routes';
import { recruiterRoutes } from './routes/recruiter';
import { transcribeRoutes } from './routes/transcribe.routes';
import { publicJobsRoutes } from './routes/publicJobs';
import { candidateAuthRoutes } from './routes/candidateAuth';
import { communityRoutes } from './routes/community';
import { publicContactRoutes } from './routes/publicContact';
import heygenRoutes from './routes/heygen';
import { avatarRoutes } from './routes/avatar';
import { getSttHealthStatus } from '../services/sttHealth';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    ts: new Date().toISOString(),
    deployMarker: 'railway-test-20260630',
  });
});

app.get('/health/db', async (_req, res) => {
  const { query, testDatabaseConnection, formatDbError } = await import('../db/client');
  try {
    await testDatabaseConnection();

    const tables = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('candidates', 'candidate_accounts', 'positions')
       ORDER BY table_name`
    );
    const names = new Set(tables.rows.map((r) => r.table_name));
    const missing = ['candidates', 'candidate_accounts', 'positions'].filter((t) => !names.has(t));

    let jobs = 0;
    if (!missing.includes('positions')) {
      const { rows } = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM positions WHERE COALESCE(is_active, true) = true`
      );
      jobs = parseInt(rows[0]?.count ?? '0', 10);
    }

    const hasDatabaseUrl = Boolean(process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL);
    res.json({
      status: missing.length === 0 ? 'ok' : 'degraded',
      jobs,
      tables: [...names],
      missingTables: missing.length > 0 ? missing : undefined,
      databaseUrlConfigured: hasDatabaseUrl,
    });
  } catch (e) {
    res.status(503).json({
      status: 'error',
      message: formatDbError(e),
      databaseUrlConfigured: Boolean(process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL),
      hint: 'Link PostgreSQL DATABASE_URL to the backend service in Railway → Variables.',
    });
  }
});

app.get('/health/stt', (_req, res) => {
  const stt = getSttHealthStatus();
  res.status(stt.status === 'error' ? 503 : 200).json(stt);
});

app.get('/health/mail', async (_req, res) => {
  const { verifyMailConnection, getMailStatus } = await import('../services/email.service');
  const status = getMailStatus();
  if (!status.configured) {
    res.status(503).json({
      status: 'not_configured',
      ...status,
      hint: 'Set MAIL_SERVICE, MAIL_USER, MAIL_PASS, MAIL_FROM on Railway Variables.',
    });
    return;
  }
  const verify = await verifyMailConnection();
  res.status(verify.ok ? 200 : 503).json({
    status: verify.ok ? 'ok' : 'error',
    ...status,
    error: verify.error,
  });
});

app.use(`${config.apiPrefix}/interview`, interviewRoutes);
app.use(`${config.apiPrefix}/report`, reportRoutes);
app.use(`${config.apiPrefix}/admin`, adminRoutes);
app.use(`${config.apiPrefix}/recruiter`, recruiterRoutes);
app.use(`${config.apiPrefix}/public/join`, publicJoinRoutes);
app.use(`${config.apiPrefix}/public/jobs`, publicJobsRoutes);
app.use(`${config.apiPrefix}/public`, publicContactRoutes);
app.use(`${config.apiPrefix}/candidate`, candidateAuthRoutes);
app.use(`${config.apiPrefix}/community`, communityRoutes);
app.use(`${config.apiPrefix}/ai`, aiRoutes);
app.use(`${config.apiPrefix}/llm`, llmRoutes);
app.use(`${config.apiPrefix}/voice-interview`, voiceInterviewRoutes);
app.use(`${config.apiPrefix}/voice-loop`, voiceLoopRoutes);
// Voice STT (multipart upload)
app.use(`${config.apiPrefix}/transcribe`, transcribeRoutes);
// Alias to satisfy clients expecting POST /api/transcribe
app.use('/api/transcribe', transcribeRoutes);
// HeyGen streaming avatar token proxy (keeps API key secret)
app.use(`${config.apiPrefix}/heygen`, heygenRoutes);
// SadTalker + Wav2Lip + Coqui TTS talking-head avatar
app.use(`${config.apiPrefix}/avatar`, avatarRoutes);

export default app;
