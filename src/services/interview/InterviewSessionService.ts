/**
 * Interview Session Engine: create, start, end sessions and maintain state in Redis.
 * State is the source of truth during the interview; PostgreSQL stores persistence
 * (interview row, responses, report, session backups) for reporting and audit.
 */

import { v4 as uuidv4 } from 'uuid';
import { getRedis, sessionKey, SESSION_TTL_SECONDS } from '../../redis/client';
import { query } from '../../db/client';
import type {
  InterviewState,
  InterviewPhase,
  InterviewReport,
  Turn,
  DifficultyLevel,
  ScheduledCustomQuestion,
  InterviewLanguageCode,
  AnswerEvaluation,
  ReportStatus,
} from '../../types';
import type { ResumeProfile } from './ResumeProfileService';
import type { CodingInterviewModeId } from '../../constants/codingInterviewModes';
import { resolveBrandingForInterview } from './ScheduleBrandingService';
import { normalizeInterviewLanguage, DEFAULT_INTERVIEW_LANGUAGE } from '../../constants/interviewLanguage';
import { interviewResponseRepository } from '../../repositories/InterviewResponseRepository';
import { interviewSessionRecordRepository } from '../../repositories/InterviewSessionRecordRepository';
import { sessionPersistenceService } from './SessionPersistenceService';
import { phaseTransitionService } from './PhaseTransitionService';
import { reportFinalizationService } from './ReportFinalizationService';
import { issueInterviewSessionToken, hashSessionToken } from '../../utils/interviewSessionToken';
import { logger } from '../../config/logger';

export interface StartInterviewInput {
  candidateId: string;
  role: 'technical' | 'behavioral' | 'sales' | 'customer_success';
  positionId?: string;
  resumeContext?: string;
  resumeProfile?: ResumeProfile;
  codingInterviewMode?: CodingInterviewModeId;
  positionTitle?: string;
  candidateDisplayName?: string;
  preferredDifficulty?: DifficultyLevel;
  customQuestions?: ScheduledCustomQuestion[];
  focusAreas?: string;
  durationMinutes?: number;
  interviewerPersona?: 'ethan' | 'zara';
  companyName?: string;
  interviewLanguage?: InterviewLanguageCode;
  clientIp?: string;
}

const DEFAULT_PHASE_ORDER: InterviewPhase[] = ['intro', 'technical', 'behavioral', 'wrap_up', 'coding'];

export interface StartInterviewResult {
  interviewId: string;
  state: InterviewState;
  sessionToken: string;
}

export interface PersistCandidateResponseInput {
  interviewId: string;
  candidateId: string;
  turn: Turn;
  questionId?: string | null;
  codeContent?: string | null;
  explanationText?: string | null;
  codeLanguage?: string | null;
  evaluation: AnswerEvaluation;
}

export class InterviewSessionService {
  async start(input: StartInterviewInput): Promise<StartInterviewResult> {
    const interviewId = uuidv4();
    const now = new Date().toISOString();

    const state: InterviewState = {
      interviewId,
      candidateId: input.candidateId,
      resumeContext: input.resumeContext,
      resumeProfile: input.resumeProfile
        ? {
            candidateName: input.candidateDisplayName ?? input.resumeProfile.candidateName,
            skills: input.resumeProfile.skills,
            techStack: input.resumeProfile.techStack,
            experience: input.resumeProfile.experience,
            projects: input.resumeProfile.projects,
            summary: input.resumeProfile.summary,
            positionTitle: input.resumeProfile.positionTitle ?? input.positionTitle,
          }
        : undefined,
      positionTitle: input.positionTitle ?? input.resumeProfile?.positionTitle,
      candidateDisplayName: input.candidateDisplayName,
      codingInterviewMode: input.codingInterviewMode,
      welcomeDelivered: false,
      role: input.role,
      phase: 'intro',
      phaseStartedAt: now,
      phaseQuestionCount: 0,
      startedAt: now,
      turns: [],
      topicCoverage: {},
      currentDifficulty: input.preferredDifficulty ?? 'medium',
      preferredDifficulty: input.preferredDifficulty,
      customQuestions: input.customQuestions ?? [],
      focusAreas: input.focusAreas,
      durationMinutes: input.durationMinutes,
      interviewerPersona: input.interviewerPersona,
      companyName: input.companyName,
      interviewLanguage: normalizeInterviewLanguage(input.interviewLanguage ?? DEFAULT_INTERVIEW_LANGUAGE),
      approximateTokens: 0,
    };

    await this.setState(interviewId, state);

    await query(
      `INSERT INTO interviews (id, candidate_id, position_id, role, status, started_at, updated_at)
       VALUES ($1, $2, $3, $4, 'in_progress', $5, $5)`,
      [interviewId, input.candidateId, input.positionId ?? null, input.role, now]
    );

    const sessionToken = issueInterviewSessionToken(interviewId, input.candidateId);
    await interviewSessionRecordRepository.upsertActiveSession({
      interviewId,
      candidateId: input.candidateId,
      sessionTokenHash: hashSessionToken(sessionToken),
      phase: 'intro',
      clientIp: input.clientIp,
    });

    logger.info('Interview session started', { interviewId, candidateId: input.candidateId, role: input.role });

    return { interviewId, state, sessionToken };
  }

  async getState(interviewId: string): Promise<InterviewState | null> {
    const redis = getRedis();
    const raw = await redis.get(sessionKey(interviewId));
    if (raw) {
      try {
        const state = JSON.parse(raw) as InterviewState;
        await redis.expire(sessionKey(interviewId), SESSION_TTL_SECONDS);
        return state;
      } catch {
        // fall through to backup recovery
      }
    }
    return this.recoverFromBackup(interviewId);
  }

  async recoverFromBackup(interviewId: string): Promise<InterviewState | null> {
    const recovered = await sessionPersistenceService.recoverState(interviewId);
    if (recovered) {
      await this.setState(interviewId, recovered, { skipBackupSchedule: true });
    }
    return recovered;
  }

  async getStateWithBranding(interviewId: string): Promise<InterviewState | null> {
    const state = await this.getState(interviewId);
    if (!state) return null;
    if (state.interviewerPersona && state.companyName !== undefined && state.interviewLanguage) {
      return state;
    }
    const branding = await resolveBrandingForInterview(interviewId);
    if (!branding) return state;
    const enriched: InterviewState = {
      ...state,
      interviewerPersona: state.interviewerPersona ?? branding.interviewerPersona,
      companyName: state.companyName ?? branding.companyName,
      interviewLanguage: state.interviewLanguage ?? branding.interviewLanguage,
    };
    if (
      enriched.interviewerPersona !== state.interviewerPersona ||
      enriched.companyName !== state.companyName ||
      enriched.interviewLanguage !== state.interviewLanguage
    ) {
      await this.setState(interviewId, enriched);
    }
    return enriched;
  }

  async setState(
    interviewId: string,
    state: InterviewState,
    opts?: { skipBackupSchedule?: boolean }
  ): Promise<void> {
    const redis = getRedis();
    await redis.setex(sessionKey(interviewId), SESSION_TTL_SECONDS, JSON.stringify(state));
    if (!opts?.skipBackupSchedule) {
      sessionPersistenceService.scheduleBackup(interviewId, state);
    }
  }

  async appendTurn(
    interviewId: string,
    turn: Turn,
    updates: Partial<
      Pick<InterviewState, 'phase' | 'topicCoverage' | 'currentDifficulty' | 'approximateTokens'>
    > = {}
  ): Promise<InterviewState | null> {
    const state = await this.getState(interviewId);
    if (!state) return null;

    state.turns.push(turn);

    if (updates.phase !== undefined && updates.phase !== state.phase) {
      const next = phaseTransitionService.applyPhaseChange(state, updates.phase);
      state.phase = next.phase;
      state.phaseStartedAt = next.phaseStartedAt;
      state.phaseQuestionCount = next.phaseQuestionCount;
      void interviewSessionRecordRepository.updatePhase(interviewId, updates.phase);
    } else if (turn.role === 'ai' && !turn.isIntro) {
      state.phaseQuestionCount = (state.phaseQuestionCount ?? 0) + 1;
    }

    if (updates.topicCoverage !== undefined) {
      state.topicCoverage = { ...(state.topicCoverage ?? {}), ...updates.topicCoverage };
    }
    if (updates.currentDifficulty !== undefined) state.currentDifficulty = updates.currentDifficulty;
    if (updates.approximateTokens !== undefined) state.approximateTokens = updates.approximateTokens;

    await this.setState(interviewId, state);
    void interviewSessionRecordRepository.touchActivity(interviewId);
    return state;
  }

  /** Persist candidate response to DB and link turn.responseId */
  async persistCandidateResponse(input: PersistCandidateResponseInput): Promise<string> {
    const record = await interviewResponseRepository.create({
      interviewId: input.interviewId,
      candidateId: input.candidateId,
      turnId: input.turn.id,
      questionId: input.questionId,
      answerText: input.turn.content,
      codeContent: input.codeContent,
      explanationText: input.explanationText,
      codeLanguage: input.codeLanguage,
      evaluation: input.evaluation,
      evaluationStatus: input.evaluation.status ?? 'pending',
    });

    const state = await this.getState(input.interviewId);
    if (state) {
      const turn = state.turns.find((t) => t.id === input.turn.id);
      if (turn) turn.responseId = record.id;
      await this.setState(input.interviewId, state);
    }

    return record.id;
  }

  async updateTurnAvatarVideo(interviewId: string, turnId: string, videoUrl: string): Promise<boolean> {
    const state = await this.getState(interviewId);
    if (!state) return false;
    const turn = state.turns.find((t) => t.id === turnId);
    if (!turn || turn.role !== 'ai') return false;
    turn.avatarVideo = videoUrl;
    await this.setState(interviewId, state);
    return true;
  }

  async updateTurnEvaluation(
    interviewId: string,
    turnId: string,
    evaluation: Turn['evaluation']
  ): Promise<boolean> {
    const state = await this.getState(interviewId);
    if (!state || !evaluation) return false;
    const turn = state.turns.find((t) => t.id === turnId);
    if (!turn || turn.role !== 'candidate') return false;
    turn.evaluation = evaluation;
    await this.setState(interviewId, state);

    if (turn.responseId) {
      await interviewResponseRepository.updateEvaluation(
        turn.responseId,
        evaluation,
        evaluation.status ?? 'completed'
      );
    }
    return true;
  }

  async end(
    interviewId: string,
    report?: InterviewReport,
    reportStatus: ReportStatus = 'finalized'
  ): Promise<boolean> {
    const now = new Date().toISOString();

    await query(
      `UPDATE interviews SET status = 'completed', ended_at = $2, updated_at = $2 WHERE id = $1`,
      [interviewId, now]
    );

    if (report) {
      await reportFinalizationService.persistReport(
        interviewId,
        report,
        report.reportStatus ?? reportStatus,
        'interview_end'
      );
    }

    await interviewSessionRecordRepository.markCompleted(interviewId);
    logger.info('Interview session ended', { interviewId, hasReport: Boolean(report) });
    return true;
  }

  getPhaseOrder(): InterviewPhase[] {
    return [...DEFAULT_PHASE_ORDER];
  }

  /** Re-issue session token for resumed interviews */
  async reissueSessionToken(interviewId: string, candidateId: string): Promise<string> {
    const token = issueInterviewSessionToken(interviewId, candidateId);
    await interviewSessionRecordRepository.upsertActiveSession({
      interviewId,
      candidateId,
      sessionTokenHash: hashSessionToken(token),
    });
    return token;
  }
}

export const interviewSessionService = new InterviewSessionService();
