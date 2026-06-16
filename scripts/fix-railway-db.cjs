#!/usr/bin/env node
/**
 * One-time fix for Railway Postgres: ensure positions table + seed demo jobs.
 * Usage: DATABASE_URL="postgresql://..." node scripts/fix-railway-db.cjs
 */
const { Pool } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL');
  process.exit(1);
}

const needsSsl =
  process.env.PGSSLMODE === 'require' ||
  /railway\.app|rlwy\.net/i.test(url) ||
  !url.includes('localhost');

const pool = new Pool({
  connectionString: url,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

async function q(text, params) {
  return pool.query(text, params);
}

async function main() {
  console.log('Connecting…');
  await q('SELECT 1');

  const tables = await q(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name ILIKE '%position%'`
  );
  console.log('Position-related tables:', tables.rows.map((r) => r.table_name).join(', ') || '(none)');

  // Prisma may have created "Position" (quoted) — copy rows into positions if needed
  const prismaTable = tables.rows.find((r) => r.table_name === 'Position');
  if (prismaTable) {
    console.log('Migrating rows from "Position" → positions…');
    await q(`
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
      )
    `);
    await q(`
      INSERT INTO positions (id, title, role, created_at, is_active)
      SELECT id, title, role, created_at, true FROM "Position"
      ON CONFLICT (id) DO NOTHING
    `);
  }

  await q(`
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
    )
  `);

  const alters = [
    `ALTER TABLE positions ADD COLUMN IF NOT EXISTS company_name VARCHAR(255)`,
    `ALTER TABLE positions ADD COLUMN IF NOT EXISTS description TEXT`,
    `ALTER TABLE positions ADD COLUMN IF NOT EXISTS requirements TEXT`,
    `ALTER TABLE positions ADD COLUMN IF NOT EXISTS location VARCHAR(255)`,
    `ALTER TABLE positions ADD COLUMN IF NOT EXISTS salary_range VARCHAR(100)`,
    `ALTER TABLE positions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`,
    `ALTER TABLE positions ADD COLUMN IF NOT EXISTS auto_schedule_enabled BOOLEAN DEFAULT false`,
    `ALTER TABLE positions ADD COLUMN IF NOT EXISTS created_by UUID`,
    `UPDATE positions SET is_active = true WHERE is_active IS NULL`,
  ];
  for (const sql of alters) await q(sql);

  const count = await q('SELECT COUNT(*)::int AS n FROM positions');
  console.log('positions row count:', count.rows[0].n);

  if (count.rows[0].n === 0) {
    console.log('Seeding sample jobs…');
    await q(
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

  const jobs = await q(
    `SELECT id, title, role FROM positions WHERE COALESCE(is_active, true) = true ORDER BY created_at DESC LIMIT 5`
  );
  console.log('Active jobs:', jobs.rows);
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error('FAILED:', e.message);
    process.exit(1);
  })
  .finally(() => pool.end());
