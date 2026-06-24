#!/usr/bin/env node
/**
 * Full schema bootstrap + seed for Railway Postgres (plain Node, no build step).
 * Usage: DATABASE_URL="postgresql://..." node scripts/bootstrap-railway.cjs
 */
const { Pool } = require('pg');
const path = require('path');

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
  console.log('Connected.');

  console.log('Extension + core tables…');
  await q('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await q(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'recruiter';`);
  await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;`);

  await q(`
    CREATE TABLE IF NOT EXISTS candidates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255),
      name VARCHAR(255),
      external_id VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  for (const col of [
    `ALTER TABLE candidates ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`,
    `ALTER TABLE candidates ADD COLUMN IF NOT EXISTS location VARCHAR(255)`,
    `ALTER TABLE candidates ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(255)`,
    `ALTER TABLE candidates ADD COLUMN IF NOT EXISTS portfolio_url VARCHAR(255)`,
  ]) {
    await q(col);
  }

  await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS managed_by_admin_id UUID REFERENCES users(id) ON DELETE SET NULL;`);

  await q(`
    CREATE TABLE IF NOT EXISTS candidate_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      candidate_id UUID NOT NULL UNIQUE REFERENCES candidates(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_candidate_accounts_candidate_id ON candidate_accounts(candidate_id);`);

  await q(`
    CREATE TABLE IF NOT EXISTS candidate_password_resets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL,
      code VARCHAR(10) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

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
    );
  `);
  for (const sql of [
    `ALTER TABLE positions ADD COLUMN IF NOT EXISTS company_name VARCHAR(255)`,
    `ALTER TABLE positions ADD COLUMN IF NOT EXISTS description TEXT`,
    `ALTER TABLE positions ADD COLUMN IF NOT EXISTS requirements TEXT`,
    `ALTER TABLE positions ADD COLUMN IF NOT EXISTS location VARCHAR(255)`,
    `ALTER TABLE positions ADD COLUMN IF NOT EXISTS salary_range VARCHAR(100)`,
    `ALTER TABLE positions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`,
    `ALTER TABLE positions ADD COLUMN IF NOT EXISTS auto_schedule_enabled BOOLEAN DEFAULT false`,
    `UPDATE positions SET is_active = true WHERE is_active IS NULL`,
  ]) {
    await q(sql);
  }

  await q(`
    CREATE TABLE IF NOT EXISTS competencies (
      id VARCHAR(100) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS interviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      candidate_id UUID NOT NULL REFERENCES candidates(id),
      position_id UUID REFERENCES positions(id),
      role VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
      started_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS applications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      candidate_id UUID NOT NULL REFERENCES candidates(id),
      position_id UUID NOT NULL REFERENCES positions(id),
      resume_url VARCHAR(255),
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log('Seed data…');
  await q(`
    INSERT INTO candidates (id, email, name) VALUES
      ('00000000-0000-0000-0000-000000000001', 'candidate@example.com', 'Test Candidate')
    ON CONFLICT (id) DO NOTHING;
  `);

  const competencies = [
    ['communication', 'Communication', 'Clarity and effectiveness of expression'],
    ['problem_solving', 'Problem Solving', 'Analytical and solution-oriented thinking'],
    ['technical_depth', 'Technical Depth', 'Depth of technical knowledge and practice'],
    ['judgment', 'Judgment', 'Quality of decisions and trade-offs'],
    ['collaboration', 'Collaboration', 'Working with others and stakeholders'],
    ['engagement', 'Engagement', 'Interest and questions about the role'],
  ];
  for (const [id, name, description] of competencies) {
    await q(
      `INSERT INTO competencies (id, name, description) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [id, name, description]
    );
  }

  const count = await q('SELECT COUNT(*)::int AS n FROM positions');
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
  const tables = await q(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('candidates', 'candidate_accounts', 'positions', 'competencies')
     ORDER BY table_name`
  );

  console.log('Tables:', tables.rows.map((r) => r.table_name).join(', '));
  console.log('Active jobs:', jobs.rows.length);
  jobs.rows.forEach((j) => console.log(' -', j.title, `(${j.role})`));
  console.log('Bootstrap complete.');
}

main()
  .catch((e) => {
    console.error('FAILED:', e.message);
    process.exit(1);
  })
  .finally(() => pool.end());
