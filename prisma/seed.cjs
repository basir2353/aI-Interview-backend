/**
 * Production-safe Prisma seed (plain Node — no ts-node required).
 * Used in Railway/Docker containers where devDependencies are omitted.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const TEST_CANDIDATE_ID = '00000000-0000-0000-0000-000000000001';

const competencies = [
  { id: 'communication', name: 'Communication', description: 'Clarity and effectiveness of expression' },
  { id: 'problem_solving', name: 'Problem Solving', description: 'Analytical and solution-oriented thinking' },
  { id: 'technical_depth', name: 'Technical Depth', description: 'Depth of technical knowledge and practice' },
  { id: 'judgment', name: 'Judgment', description: 'Quality of decisions and trade-offs' },
  { id: 'collaboration', name: 'Collaboration', description: 'Working with others and stakeholders' },
  { id: 'engagement', name: 'Engagement', description: 'Interest and questions about the role' },
];

async function main() {
  await prisma.candidate.upsert({
    where: { id: TEST_CANDIDATE_ID },
    create: {
      id: TEST_CANDIDATE_ID,
      email: 'candidate@example.com',
      name: 'Test Candidate',
    },
    update: {},
  });
  console.log('Seeded candidate:', TEST_CANDIDATE_ID);

  for (const c of competencies) {
    await prisma.competency.upsert({
      where: { id: c.id },
      create: c,
      update: { name: c.name, description: c.description },
    });
  }
  console.log('Seeded', competencies.length, 'competencies');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
