export type CodingInterviewModeId =
  | 'dsa'
  | 'frontend'
  | 'backend'
  | 'fullstack'
  | 'system_design'
  | 'database_sql'
  | 'devops_cloud'
  | 'ai_ml'
  | 'debugging'
  | 'code_review';

export interface CodingInterviewMode {
  id: CodingInterviewModeId;
  label: string;
  interviewerFocus: string;
  questionThemes: string[];
}

export const CODING_INTERVIEW_MODES: Record<CodingInterviewModeId, CodingInterviewMode> = {
  dsa: {
    id: 'dsa',
    label: 'DSA / Algorithms',
    interviewerFocus: 'data structures, algorithms, time/space complexity, problem decomposition',
    questionThemes: ['arrays', 'trees', 'graphs', 'dynamic programming', 'sorting', 'hash maps'],
  },
  frontend: {
    id: 'frontend',
    label: 'Frontend Development',
    interviewerFocus: 'React/Next.js, browser APIs, performance, accessibility, CSS architecture, state management',
    questionThemes: ['component design', 'rendering', 'hooks', 'bundling', 'UX trade-offs'],
  },
  backend: {
    id: 'backend',
    label: 'Backend Development',
    interviewerFocus: 'APIs, databases, caching, authentication, scalability, service design',
    questionThemes: ['REST/GraphQL', 'microservices', 'queues', 'idempotency', 'error handling'],
  },
  fullstack: {
    id: 'fullstack',
    label: 'Full Stack Development',
    interviewerFocus: 'end-to-end features, API + UI integration, deployment, full product thinking',
    questionThemes: ['feature design', 'auth flows', 'data modeling', 'frontend-backend contracts'],
  },
  system_design: {
    id: 'system_design',
    label: 'System Design',
    interviewerFocus: 'scalability, reliability, trade-offs, distributed systems, capacity planning',
    questionThemes: ['load balancing', 'caching layers', 'sharding', 'event-driven design'],
  },
  database_sql: {
    id: 'database_sql',
    label: 'Database & SQL',
    interviewerFocus: 'schema design, queries, indexing, transactions, normalization, performance',
    questionThemes: ['joins', 'indexes', 'ACID', 'query optimization', 'migrations'],
  },
  devops_cloud: {
    id: 'devops_cloud',
    label: 'DevOps / Cloud',
    interviewerFocus: 'CI/CD, containers, observability, infrastructure as code, cloud services',
    questionThemes: ['Docker/Kubernetes', 'pipelines', 'monitoring', 'incident response'],
  },
  ai_ml: {
    id: 'ai_ml',
    label: 'AI / Machine Learning',
    interviewerFocus: 'ML pipelines, model evaluation, LLM integration, data quality, production AI',
    questionThemes: ['training vs inference', 'RAG', 'prompting', 'evaluation metrics'],
  },
  debugging: {
    id: 'debugging',
    label: 'Debugging Challenges',
    interviewerFocus: 'root cause analysis, logs, reproduction, systematic debugging under pressure',
    questionThemes: ['production bugs', 'race conditions', 'memory leaks', 'hypothesis-driven debugging'],
  },
  code_review: {
    id: 'code_review',
    label: 'Live Code Review',
    interviewerFocus: 'readability, maintainability, security, performance, constructive feedback',
    questionThemes: ['refactoring', 'code smells', 'testing gaps', 'API design review'],
  },
};

const MODE_PREFIX = 'coding_mode:';

export function parseCodingModeFromFocusAreas(focusAreas?: string | null): CodingInterviewModeId | undefined {
  if (!focusAreas) return undefined;
  const match = focusAreas.match(/coding_mode:([a-z_]+)/i);
  if (!match) return undefined;
  const id = match[1].toLowerCase() as CodingInterviewModeId;
  return id in CODING_INTERVIEW_MODES ? id : undefined;
}

export function formatFocusAreasWithCodingMode(
  modeId: CodingInterviewModeId | undefined,
  userFocus?: string
): string | undefined {
  const parts: string[] = [];
  if (modeId) parts.push(`${MODE_PREFIX}${modeId}`);
  if (userFocus?.trim()) parts.push(userFocus.trim());
  return parts.length ? parts.join(' | ') : undefined;
}

export function getCodingModePromptBlock(modeId?: CodingInterviewModeId): string {
  if (!modeId) return '';
  const mode = CODING_INTERVIEW_MODES[modeId];
  return `\nCoding interview style: ${mode.label}. Focus on ${mode.interviewerFocus}. Prioritize themes: ${mode.questionThemes.join(', ')}.`;
}
