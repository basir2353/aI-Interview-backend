import fs from 'fs';
import path from 'path';

const DEBUG_LOG = path.resolve(process.cwd(), '..', 'debug-92a442.log');

/** Append one NDJSON debug line (session 92a442). Never log secrets/PII. */
export function agentDebugLog(payload: {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  runId?: string;
}): void {
  try {
    const line = JSON.stringify({
      sessionId: '92a442',
      timestamp: Date.now(),
      ...payload,
    });
    fs.appendFileSync(DEBUG_LOG, `${line}\n`, 'utf8');
  } catch {
    // ignore
  }
}
