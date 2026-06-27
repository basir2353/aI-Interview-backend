/**
 * Backend entry point: start HTTP server with Socket.io for real-time voice interviews.
 */
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './api/app';
import { config } from './config';
import { bootstrapDatabase } from './db/bootstrap-db';
import { SignalingService } from './services/signaling.service';
import { llmService } from './services/llm.service';
import { sttService } from './services/stt.service';
import { logger } from './config/logger';

function getSocketCorsOrigins(): string[] {
  const origins = new Set<string>();
  origins.add(config.frontendUrl.replace(/\/$/, ''));
  origins.add('http://localhost:3000');
  if (process.env.CORS_ORIGINS) {
    for (const o of process.env.CORS_ORIGINS.split(',')) {
      const trimmed = o.trim();
      if (trimmed) origins.add(trimmed.replace(/\/$/, ''));
    }
  }
  return [...origins];
}

async function initializeServices(io: SocketIOServer): Promise<void> {
  const { verifyMailConnection, isMailConfigured } = await import('./services/email.service');

  if (isMailConfigured()) {
    const { getMailStatus } = await import('./services/email.service');
    const mailStatus = getMailStatus();
    logger.info(`[Mail] Provider: ${mailStatus.provider}, from: ${mailStatus.from}`);
    const verify = await verifyMailConnection();
    if (verify.ok) {
      logger.info('[Mail] Ready — interview invites and password resets will send.');
    } else {
      logger.error(
        `[Mail] Verify failed: ${verify.error}. ` +
          'Set RESEND_API_KEY (recommended) or SMTP vars in Railway Variables and redeploy.'
      );
    }
  } else {
    logger.warn(
      '[Mail] Not configured. Set RESEND_API_KEY (recommended) or SMTP vars to send emails.'
    );
  }

  logger.info('Initializing services...');

  try {
    const { testDatabaseConnection } = await import('./db/client');
    await testDatabaseConnection();
    logger.info('Database connection ok');
  } catch (e) {
    const { formatDbError } = await import('./db/client');
    logger.error(
      `Database connection failed: ${formatDbError(e)}. ` +
        'On Railway: add PostgreSQL and set DATABASE_URL on the backend service (Variables → Add reference).'
    );
    return;
  }

  try {
    await bootstrapDatabase();
  } catch (e) {
    logger.warn('Database bootstrap had errors (some tables may already exist):', (e as Error).message);
  }

  try {
    const { ensureHiringFlowTables } = await import('./db/ensure-hiring-flow');
    await ensureHiringFlowTables();
    logger.info('Hiring flow tables ready (candidates, accounts, applications)');
  } catch (e) {
    logger.warn('Hiring flow tables setup failed:', (e as Error).message);
  }

  try {
    const { ensurePositionsSchema, seedSampleJobsIfEmpty } = await import('./db/ensure-positions');
    await ensurePositionsSchema();
    await seedSampleJobsIfEmpty();
    logger.info('Positions table ready (public jobs)');
  } catch (e) {
    logger.warn('Positions setup failed:', (e as Error).message);
  }

  if (config.ai.llmProvider === 'ollama') {
    const ollamaHealthy = await llmService.healthCheck();
    if (!ollamaHealthy) {
      logger.warn(
        `Ollama is not accessible at ${config.ai.ollamaBaseUrl}. Pull a model on the Ollama service (e.g. ollama pull ${config.ai.ollamaModel}).`
      );
    }
  } else {
    logger.info('OpenRouter configured; skipping Ollama health check');
  }

  const sttInitialized = await sttService.initialize();
  if (!sttInitialized) {
    logger.warn('STT service initialization failed. Voice transcription may not work properly.');
  }

  const signalingService = new SignalingService(io);
  signalingService.startCleanupInterval();

  try {
    const { startAvatarWorker } = await import('./queues/avatarQueue');
    startAvatarWorker();
  } catch (_) {
    // Queue optional
  }

  logger.info('All services initialized');
}

async function start() {
  const httpServer = createServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: getSocketCorsOrigins(),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    maxHttpBufferSize: 1e8,
  });

  // Listen immediately so Railway/Vercel health checks pass while DB bootstrap runs.
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(config.port, config.host, () => {
      logger.info(`Server listening on ${config.host}:${config.port} (env: ${config.env})`);
      logger.info(`Frontend URL: ${config.frontendUrl}`);
      resolve();
    });
  });

  void initializeServices(io).catch((e) => {
    logger.error('Background service initialization failed:', e);
  });

  return httpServer;
}

const serverPromise = start().catch((e) => {
  logger.error('Startup failed:', e);
  process.exit(1);
});

export default serverPromise;
