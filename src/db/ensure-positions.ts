/**
 * Ensure positions table exists with columns required by public jobs API.
 * Idempotent — safe to call on every request until schema is stable.
 */
import { query } from './client';

export async function ensurePositionsSchema(): Promise<void> {
  // Prisma may have created quoted table "Position" — migrate into positions
  const { rows: tables } = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('Position', 'positions')`
  );
  const hasPrismaPosition = tables.some((t) => t.table_name === 'Position');
  const hasPositions = tables.some((t) => t.table_name === 'positions');

  await query(`
    CREATE TABLE IF NOT EXISTS positions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      company_name VARCHAR(255),
      description TEXT,
      requirements TEXT,
      location VARCHAR(255),
      salary_range VARCHAR(100),
      role VARCHAR(50) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  if (hasPrismaPosition && hasPositions) {
    await query(`
      INSERT INTO positions (id, title, role, created_at, is_active)
      SELECT id, title, role, created_at, true FROM "Position"
      ON CONFLICT (id) DO NOTHING
    `);
  }

  await query(`ALTER TABLE positions ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);`);
  await query(`ALTER TABLE positions ADD COLUMN IF NOT EXISTS description TEXT;`);
  await query(`ALTER TABLE positions ADD COLUMN IF NOT EXISTS requirements TEXT;`);
  await query(`ALTER TABLE positions ADD COLUMN IF NOT EXISTS location VARCHAR(255);`);
  await query(`ALTER TABLE positions ADD COLUMN IF NOT EXISTS salary_range VARCHAR(100);`);
  await query(`ALTER TABLE positions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;`);
  await query(`UPDATE positions SET is_active = true WHERE is_active IS NULL;`);
  await query(`ALTER TABLE positions ADD COLUMN IF NOT EXISTS auto_schedule_enabled BOOLEAN NOT NULL DEFAULT false;`);
  await query(`ALTER TABLE positions ADD COLUMN IF NOT EXISTS created_by UUID;`);
  await query(`CREATE INDEX IF NOT EXISTS idx_positions_is_active ON positions(is_active);`);
}

export async function seedSampleJobsIfEmpty(): Promise<void> {
  const { rows } = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM positions`);
  if (parseInt(rows[0]?.count ?? '0', 10) > 0) return;

  await query(
    `INSERT INTO positions (id, title, company_name, description, requirements, location, salary_range, role, is_active)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, true),
       ($9, $10, $11, $12, $13, $14, $15, $16, true),
       ($17, $18, $19, $20, $21, $22, $23, $24, true)
     ON CONFLICT (id) DO NOTHING`,
    [
      '11111111-1111-1111-1111-111111111111',
      'Senior Software Engineer',
      'Intervion',
      'Build scalable interview and hiring tools with Node.js and React.',
      '5+ years TypeScript, PostgreSQL, system design',
      'Remote',
      '$120k - $160k',
      'technical',
      '22222222-2222-2222-2222-222222222222',
      'Account Executive',
      'Intervion',
      'Drive B2B SaaS sales to recruiting teams.',
      '2+ years SaaS sales, strong communication',
      'New York, NY',
      '$80k - $120k OTE',
      'sales',
      '33333333-3333-3333-3333-333333333333',
      'Customer Success Manager',
      'Intervion',
      'Onboard customers and ensure successful AI interview rollouts.',
      'CS experience, empathy, technical aptitude',
      'Remote',
      '$70k - $95k',
      'customer_success',
    ]
  );
}
