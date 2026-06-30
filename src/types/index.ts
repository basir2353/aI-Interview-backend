/**
 * Shared domain types for the AI Interviewer platform.
 * Keeps API, services, and queues aligned on the same shapes.
 */

export type InterviewPhase = 'intro' | 'technical' | 'behavioral' | 'wrap_up' | 'coding';

export type InterviewRole = 'technical' | 'behavioral' | 'sales' | 'customer_success';

export type InterviewLanguageCode = 'en-US' | 'es' | 'fr' | 'de' | 'hi' | 'ar' | 'ur';

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface ScheduledCustomQuestion {
  text: string;
  difficulty: DifficultyLevel;
  isCodingQuestion?: boolean;
  language?: string | null;
  starterCode?: string | null;
}

export interface CandidateInfo {
  candidateId: string;
  role: InterviewRole;
  /** Optional job/position id for role-specific questions */
  positionId?: string;
}

export type EvaluationStatus = 'pending' | 'completed';

export interface Turn {
  id: string;
  role: 'ai' | 'candidate';
  content: string;
  timestamp: string;
  /** For AI turns: question id if applicable */
  questionId?: string;
  /** For candidate turns: persisted row in interview_responses */
  responseId?: string;
  /** For candidate turns: evaluation result when available */
  evaluation?: AnswerEvaluation;
  /** For AI turns: when question is a coding question, show code editor with this */
  codingStarterCode?: string | null;
  codingLanguage?: string | null;
  isCodingQuestion?: boolean;
  /** For AI turns: optional talking-head video URL (SadTalker + Wav2Lip + Coqui TTS). */
  avatarVideo?: string;
  /** Welcome / intro only — not a scorable interview question */
  isIntro?: boolean;
}

export interface AnswerEvaluation {
  score: number;
  maxScore: number;
  relevance: number;
  structure: number;
  depth: number;
  competencyIds: string[];
  redFlags: string[];
  feedbackSnippet: string;
  /** Normalized 0-1 for aggregation */
  normalizedScore: number;
  status?: EvaluationStatus;
  codeExecutionOutput?: string;
  codeSyntaxValid?: boolean;
}

export interface InterviewState {
  interviewId: string;
  candidateId: string;
  /** Parsed candidate resume/profile summary to personalize interview questions */
  resumeContext?: string;
  role: InterviewRole;
  phase: InterviewPhase;
  startedAt: string;
  endedAt?: string;
  turns: Turn[];
  /** Tracks which topics have been covered for adaptive questioning */
  topicCoverage: Record<string, boolean>;
  /** Current question index / difficulty for strategy */
  currentDifficulty: DifficultyLevel;
  /** Recruiter-selected target difficulty for this scheduled interview */
  preferredDifficulty?: DifficultyLevel;
  /** Recruiter-supplied questions to prioritize during interview */
  customQuestions?: ScheduledCustomQuestion[];
  /** Recruiter-specified focus areas / subject (e.g. backend, APIs) used in interview */
  focusAreas?: string;
  /** Parsed structured resume profile for welcome + personalization */
  resumeProfile?: {
    candidateName?: string;
    skills: string[];
    techStack: string[];
    experience: string[];
    projects: string[];
    summary: string;
    positionTitle?: string;
  };
  /** Coding interview style when technical (dsa, frontend, etc.) */
  codingInterviewMode?: string;
  /** Whether welcome overview was already delivered in first AI turn */
  welcomeDelivered?: boolean;
  /** Job / position title for personalized welcome */
  positionTitle?: string;
  /** Display name from schedule (preferred over resume parsing) */
  candidateDisplayName?: string;
  /** Recruiter-chosen AI presenter for this session */
  interviewerPersona?: 'ethan' | 'zara';
  /** Company name shown in intro and UI (recruiter or job company) */
  companyName?: string;
  /** Recruiter-set interview locale (BCP-47) for questions, TTS, and STT */
  interviewLanguage?: InterviewLanguageCode;
  /** Recruiter-specified duration in minutes */
  durationMinutes?: number;
  /** Token budget used (approximate) for context window management */
  approximateTokens: number;
  /** When the current phase started (for duration tracking) */
  phaseStartedAt?: string;
  /** Questions asked in the current phase */
  phaseQuestionCount?: number;
}

export interface ReportCompetency {
  competencyId: string;
  name: string;
  score: number;
  maxScore: number;
  evidence: string[];
}

export type ReportStatus = 'draft' | 'finalized';

export interface InterviewReport {
  interviewId: string;
  candidateId: string;
  role: InterviewRole;
  startedAt: string;
  endedAt: string;
  overallScore: number;
  maxScore: number;
  recommendation: 'strong_hire' | 'hire' | 'no_hire' | 'borderline';
  summary: string;
  competencies: ReportCompetency[];
  redFlags: string[];
  strengths: string[];
  improvements: string[];
  /** Full Q&A for recruiter review */
  questionAnswerSummary: { question: string; answer: string; score: number }[];
  reportStatus?: ReportStatus;
}

export interface InterviewResponseRecord {
  id: string;
  interviewId: string;
  candidateId: string;
  turnId: string;
  questionId?: string | null;
  answerText: string;
  codeContent?: string | null;
  explanationText?: string | null;
  codeLanguage?: string | null;
  evaluationData: AnswerEvaluation | Record<string, unknown>;
  evaluationStatus: EvaluationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ParsedCodeAnswer {
  codeContent: string | null;
  explanationText: string;
  codeLanguage: string | null;
  combinedText: string;
  syntaxValid: boolean;
  syntaxError?: string;
  executionOutput?: string;
}

export interface QuestionTemplate {
  id: string;
  role: InterviewRole;
  phase: InterviewPhase;
  difficulty: DifficultyLevel;
  text: string;
  competencyIds: string[];
  followUpPrompt?: string;
}
