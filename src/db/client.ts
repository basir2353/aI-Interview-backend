/**
 * PostgreSQL client singleton. For scale, use a connection pool (e.g. pg.Pool)
 * and consider read replicas for report reads.
 */
import { Pool } from 'pg';
import { config } from '../config';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = config.database.url;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not configured. Link PostgreSQL to the backend service in Railway → Variables.'
      );
    }
    const needsSsl =
      process.env.PGSSLMODE === 'require' ||
      /railway\.app|rlwy\.net/i.test(connectionString) ||
      (process.env.NODE_ENV === 'production' && !connectionString.includes('localhost'));
    pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    });
    pool.on('error', (err: Error) => {
      console.error('Unexpected DB pool error', err);
    });
  }
  return pool;
}

export async function query<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  const client = getPool();
  const result = await client.query(text, params);
  return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export function formatDbError(e: unknown): string {
  if (e instanceof Error) {
    const cause = (e as Error & { cause?: unknown }).cause;
    const code = 'code' in e ? String((e as NodeJS.ErrnoException).code) : '';
    const parts = [e.message, cause instanceof Error ? cause.message : ''].filter(Boolean);
    const msg = parts.join(': ') || 'Database error';
    return code ? `${msg} (${code})` : msg;
  }
  return String(e);
}

/** Quick connectivity check — used at startup and /health/db. */
export async function testDatabaseConnection(): Promise<void> {
  await query('SELECT 1');
}
