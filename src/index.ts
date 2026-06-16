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

async function start() {
  try {
    await bootstrapDatabase();
  } catch (e) {
    logger.warn('Database bootstrap had errors (some tables may already exist):', (e as Error).message);
  }

  try {
    const { ensurePositionsSchema, seedSampleJobsIfEmpty } = await import('./db/ensure-positions');
    await ensurePositionsSchema();
    await seedSampleJobsIfEmpty();
    logger.info('Positions table ready (public jobs)');
  } catch (e) {
    logger.warn('Positions setup failed:', (e as Error).message);
  }

  // Create HTTP server
  const httpServer = createServer(app);

  // Initialize Socket.io
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: getSocketCorsOrigins(),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    maxHttpBufferSize: 1e8, // 100 MB for audio chunks
  });

  // Mail: log which sender is used so you can confirm MAIL_FROM from .env
  if (config.mail.user && config.mail.from) {
    logger.info(`[Mail] Sender configured: ${config.mail.from} (restart backend after changing .env)`);
  } else {
    logger.warn('[Mail] Not configured. Set MAIL_USER, MAIL_PASS, MAIL_FROM in .env to send emails.');
  }

  // Initialize services
  logger.info('Initializing services...');

  // Check Ollama only when OpenRouter is not configured.
  if (!config.ai.openRouterApiKey) {
    const ollamaHealthy = await llmService.healthCheck();
    if (!ollamaHealthy) {
      logger.warn('Ollama is not accessible. Please ensure Ollama is running: ollama serve');
    }
  } else {
    logger.info('OpenRouter configured; skipping Ollama health check');
  }

  // Initialize STT service
  const sttInitialized = await sttService.initialize();
  if (!sttInitialized) {
    logger.warn('STT service initialization failed. Voice transcription may not work properly.');
  }

  // Initialize WebRTC signaling service
  const signalingService = new SignalingService(io);
  signalingService.startCleanupInterval();

  // Optional: start avatar queue worker (runs when Redis is configured)
  try {
    const { startAvatarWorker } = await import('./queues/avatarQueue');
    startAvatarWorker();
  } catch (_) {
    // Queue optional
  }

  logger.info('All services initialized');

  // Start server (0.0.0.0 so Railway/Docker can route traffic)
  const server = httpServer.listen(config.port, config.host, () => {
    logger.info(`Server listening on ${config.host}:${config.port} (env: ${config.env})`);
    logger.info(`WebRTC signaling ready`);
    logger.info(`Frontend URL: ${config.frontendUrl}`);
  });

  return server;
}

const serverPromise = start().catch((e) => {
  logger.error('Startup failed:', e);
  process.exit(1);
});

export default serverPromise;
