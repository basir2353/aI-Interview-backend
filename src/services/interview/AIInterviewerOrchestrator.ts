/**
 * AI Interviewer Orchestrator: ties together session, conversation, question
 * strategy, LLM, and evaluation. One entry point for "get next AI reply" and
 * "submit candidate answer". Ensures turn-based flow, evaluates answers, and
 * selects next question (or follow-up). Designed so the API and Socket.io
 * handlers only need to call this instead of each service separately.
 */

import { getLLMService } from '../../ai/llm';
import { extractInterviewerReply } from '../../ai/llm/extractReply';
import { SYSTEM_PROMPT_INTERVIEWER, buildInterviewerContext } from '../../ai/prompts';
import {
  getCodingModePromptBlock,
  type CodingInterviewModeId,
} from '../../constants/codingInterviewModes';
import { buildFirstWarmUpQuestion } from './InterviewWelcomeService';
import { interviewerFirstName } from '../../constants/interviewerPersona';
import { buildInterviewLanguagePromptBlock } from '../../constants/interviewLanguage';
import { interviewSessionService } from './InterviewSessionService';
import { conversationManager } from './ConversationManager';
import { questionStrategyEngine } from './QuestionStrategyEngine';
import { evaluationEngine } from './EvaluationEngine';
import { scoringReportService } from './ScoringReportService';
import { avatarService } from '../avatar/avatar.service';
import {
  INTERVIEW_TIME_UP_MESSAGE,
  isInterviewTimeExpired,
  resolveInterviewDurationMinutes,
} from '../../constants/interviewDuration';
import type { InterviewState, InterviewReport, AnswerEvaluation } from '../../types';

const LLM_INTERVIEW_TIMEOUT_MS = 20000;

export interface SubmitAnswerInput {
  interviewId: string;
  answerText: string;
}

export type SubmitAnswerFailureReason = 'session_not_found' | 'no_pending_question';

export interface SubmitAnswerResult {
  success: boolean;
  state: InterviewState | null;
  nextReply?: string;
  /** Talking-head video URL for nextReply when avatar pipeline is enabled and succeeds. */
  avatarVideo?: string;
  evaluation?: { score: number; maxScore: number };
  report?: InterviewReport;
  /** Set when success is false: why the submission was rejected */
  failureReason?: SubmitAnswerFailureReason;
}

export interface GetNextReplyInput {
  interviewId: string;
  /** Optional: force move to next phase (e.g. after wrap_up question) */
  forceNextPhase?: boolean;
}

export interface GetNextReplyResult {
  success: boolean;
  state: InterviewState | null;
  reply: string;
  /** Talking-head video URL for this reply when avatar pipeline is enabled and succeeds. */
  avatarVideo?: string;
  questionId?: string;
  phase?: string;
}

export interface EnsureWelcomeDeliveredResult extends GetNextReplyResult {
  alreadyDelivered?: boolean;
  /** Set when the interview auto-ended because the time limit was reached. */
  report?: InterviewReport;
}

export class AIInterviewerOrchestrator {
  private roleLabel(role: string): string {
    switch (role) {
      case 'customer_success':
        return 'customer success';
      default:
        return role.replace(/_/g, ' ');
    }
  }

  /** Intervion AI interviewer name from schedule/recruiter settings, with role-based fallback. */
  private interviewerName(state: InterviewState): string {
    if (state.interviewerPersona) {
      return interviewerFirstName(state.interviewerPersona);
    }
    return state.role === 'technical' ? 'Ethan' : 'ZaraAlex';
  }

  private interviewerPromptExtras(state: InterviewState): string {
    const codingBlock = getCodingModePromptBlock(
      state.codingInterviewMode as CodingInterviewModeId | undefined
    );
    const focusAreasBlock = state.focusAreas
      ? `\nInterview focus areas: ${state.focusAreas.replace(/coding_mode:[a-z_]+\s*\|\s*/i, '')}.`
      : '';
    return codingBlock + focusAreasBlock;
  }

  /** End the interview when the live-room time limit is reached. */
  private async endDueToTimeLimit(
    interviewId: string,
    state: InterviewState
  ): Promise<{
    state: InterviewState | null;
    nextReply: string;
    report: InterviewReport;
  }> {
    const goodbye = INTERVIEW_TIME_UP_MESSAGE;
    const aiTurn = conversationManager.createTurn('ai', goodbye, { isIntro: false });
    await interviewSessionService.appendTurn(interviewId, aiTurn, { phase: 'wrap_up' });
    const endedAt = new Date().toISOString();
    const report = scoringReportService.buildReport({ ...state, endedAt });
    await interviewSessionService.end(interviewId, report);
    const finalState = await interviewSessionService.getStateWithBranding(interviewId);
    return { state: finalState, nextReply: goodbye, report };
  }

  /**
   * Submit candidate answer: evaluate it, append turns, decide follow-up vs next
   * question, and return next AI reply. If interview is at end, generate report.
   */
  async submitAnswer(input: SubmitAnswerInput): Promise<SubmitAnswerResult> {
    const state = await interviewSessionService.getStateWithBranding(input.interviewId);
    if (!state) {
      return { success: false, state: null, failureReason: 'session_not_found' };
    }

    if (state.liveStartedAt && isInterviewTimeExpired(state)) {
      const ended = await this.endDueToTimeLimit(input.interviewId, state);
      return {
        success: true,
        state: ended.state,
        nextReply: ended.nextReply,
        report: ended.report,
      };
    }

    const lastTurn = state.turns.length > 0 ? state.turns[state.turns.length - 1] : null;
    if (!lastTurn || lastTurn.role !== 'ai' || lastTurn.isIntro) {
      return { success: false, state: null, failureReason: 'no_pending_question' };
    }

    const lastAiTurn = [...state.turns].reverse().find((t) => t.role === 'ai' && !t.isIntro);
    const lastQuestionText = lastAiTurn?.content ?? '';
    const lastQuestionId = lastAiTurn?.questionId;
    const competencyIds = lastQuestionId
      ? questionStrategyEngine.getCompetencyIdsForQuestionId(lastQuestionId)
      : ['communication'];

    const evaluateInput = {
      question: lastQuestionText,
      answer: input.answerText,
      competencyIds: competencyIds.length ? competencyIds : ['communication'],
      interviewLanguage: state.interviewLanguage,
    };

    const candidateTurn = conversationManager.createTurn('candidate', input.answerText);
    await interviewSessionService.appendTurn(input.interviewId, candidateTurn, {
      topicCoverage: lastQuestionId ? { [lastQuestionId]: true } : undefined,
    });

    const updatedState = await interviewSessionService.getStateWithBranding(input.interviewId);
    if (!updatedState) return { success: true, state: null };

    // Fast path: pick next question immediately; score answers in the background.
    const shortAnswer = input.answerText.trim().length < 50;
    const requestFollowUp = shortAnswer;

    const evalPromise = evaluationEngine.evaluate(evaluateInput).then(async (evaluation) => {
      try {
        await interviewSessionService.updateTurnEvaluation(
          input.interviewId,
          candidateTurn.id,
          evaluation
        );
      } catch (err) {
        console.error('Background evaluation persist failed:', err);
      }
      return evaluation;
    });

    const next = await questionStrategyEngine.getNextQuestion({
      state: updatedState,
      requestFollowUp,
    });

    if (!next) {
      const evaluation = await evalPromise.catch(() => evaluationEngine.evaluate(evaluateInput));
      const report = scoringReportService.buildReport({ ...updatedState, endedAt: new Date().toISOString() });
      await interviewSessionService.end(input.interviewId, report);
      return {
        success: true,
        state: updatedState,
        nextReply: 'Thank you for your time today. That concludes our interview. You will receive feedback shortly.',
        evaluation: { score: evaluation.score, maxScore: evaluation.maxScore },
        report,
      };
    }

    let aiReply = '';
    try {
      aiReply = await this.getNextReplyInternal(
        updatedState,
        next.questionText,
        next.questionId,
        next.phase,
        lastQuestionText,
        input.answerText
      );
    } catch (err) {
      console.error('getNextReplyInternal failed (using fallback):', err);
      aiReply = next.questionText || 'Thank you for that. Can you tell me a bit more?';
    }

    const aiTurn = conversationManager.createTurn('ai', aiReply, {
      questionId: next.questionId,
      codingStarterCode: next.starterCode ?? undefined,
      codingLanguage: next.language ?? undefined,
      isCodingQuestion: next.isCodingQuestion ?? false,
    });
    await interviewSessionService.appendTurn(input.interviewId, aiTurn, {
      phase: next.phase,
      currentDifficulty: next.difficulty,
    });

    if (avatarService.isEnabled()) {
      void avatarService.generateAvatarWithTimeout({ text: aiReply }).then(async (avatarResult) => {
        if (!avatarResult.videoUrl) return;
        try {
          const live = await interviewSessionService.getStateWithBranding(input.interviewId);
          if (!live) return;
          const turn = live.turns.find((t) => t.id === aiTurn.id);
          if (turn) {
            turn.avatarVideo = avatarResult.videoUrl;
            await interviewSessionService.setState(input.interviewId, live);
          }
        } catch (err) {
          console.error('Avatar attach failed (non-blocking):', err);
        }
      });
    }

    const finalState = await interviewSessionService.getStateWithBranding(input.interviewId);
    const evaluation = await Promise.race([
      evalPromise,
      new Promise<AnswerEvaluation>((resolve) =>
        setTimeout(
          () =>
            resolve({
              score: 6,
              maxScore: 10,
              relevance: 6,
              structure: 6,
              depth: 5,
              competencyIds: competencyIds.length ? competencyIds : ['communication'],
              redFlags: [],
              feedbackSnippet: 'Answer recorded.',
              normalizedScore: 0.6,
            }),
          2500
        )
      ),
    ]);

    return {
      success: true,
      state: finalState ?? updatedState,
      nextReply: aiReply,
      evaluation: { score: evaluation.score, maxScore: evaluation.maxScore },
    };
  }

  /**
   * Deliver welcome intro beats + first question when the candidate enters the live room.
   * Idempotent: safe to call once per session; repairs legacy sessions that only have a question turn.
   */
  async ensureWelcomeDelivered(interviewId: string): Promise<EnsureWelcomeDeliveredResult> {
    await interviewSessionService.markLiveStarted(interviewId);
    const state = await interviewSessionService.getStateWithBranding(interviewId);
    if (!state) {
      return { success: false, state: null, reply: '' };
    }

    if (isInterviewTimeExpired(state)) {
      const ended = await this.endDueToTimeLimit(interviewId, state);
      return {
        success: true,
        state: ended.state,
        reply: ended.nextReply,
        alreadyDelivered: true,
        report: ended.report,
      };
    }

    const aiTurns = state.turns.filter((t) => t.role === 'ai');
    const questionTurn = aiTurns.find((t) => !t.isIntro) ?? aiTurns[0];

    if (state.welcomeDelivered && questionTurn) {
      console.log('[Interview] Welcome already delivered', {
        interviewId,
        turns: aiTurns.length,
      });
      return {
        success: true,
        state,
        reply: questionTurn.content ?? '',
        alreadyDelivered: true,
        questionId: questionTurn.questionId,
        phase: state.phase,
      };
    }

    if (aiTurns.length === 0) {
      console.log('[Interview] Delivering humanized opener on live entry', { interviewId });
      return this.getNextReply({ interviewId });
    }

    // Legacy sessions: mark delivered without injecting extra intro beats.
    if (questionTurn && !state.welcomeDelivered) {
      state.welcomeDelivered = true;
      await interviewSessionService.setState(interviewId, state);
      return {
        success: true,
        state,
        reply: questionTurn.content ?? '',
        questionId: questionTurn.questionId,
        phase: state.phase,
      };
    }

    return {
      success: true,
      state,
      reply: aiTurns[0]?.content ?? '',
    };
  }

  /**
   * Get the next AI reply (e.g. first greeting or after phase change). Does not
   * append a candidate turn; use this for "start interview" or when advancing phase.
   */
  async getNextReply(input: GetNextReplyInput): Promise<GetNextReplyResult> {
    await interviewSessionService.markLiveStarted(input.interviewId);
    const state = await interviewSessionService.getStateWithBranding(input.interviewId);
    if (!state) {
      return { success: false, state: null, reply: '' };
    }

    if (isInterviewTimeExpired(state)) {
      const ended = await this.endDueToTimeLimit(input.interviewId, state);
      return {
        success: true,
        state: ended.state,
        reply: ended.nextReply,
      };
    }

    const next =
      state.turns.length === 0
        ? await questionStrategyEngine.getFirstQuestion(state.role)
        : await questionStrategyEngine.getNextQuestion({
            state,
            forceNextPhase: input.forceNextPhase,
          });

    if (!next) {
      return { success: false, state, reply: '' };
    }

    const isFirstQuestion = state.turns.length === 0;
    let rawReply: string;
    if (isFirstQuestion) {
      rawReply = buildFirstWarmUpQuestion({
        candidateName: state.candidateDisplayName ?? state.resumeProfile?.candidateName,
        positionTitle: state.positionTitle ?? state.resumeProfile?.positionTitle,
        roleLabel: this.roleLabel(state.role),
        codingModeId: state.codingInterviewMode as CodingInterviewModeId | undefined,
        interviewLanguage: state.interviewLanguage,
        companyName: state.companyName,
        interviewerName: this.interviewerName(state),
      });
    } else {
      rawReply = await this.getNextReplyInternal(state, next.questionText, next.questionId, next.phase);
    }

    if (isFirstQuestion) {
      // One humanized opener only (greeting + first question) — never two spoken asks.
      const questionText = rawReply.trim();
      const questionTurn = conversationManager.createTurn('ai', questionText, {
        questionId: next.questionId,
        codingStarterCode: next.starterCode ?? undefined,
        codingLanguage: next.language ?? undefined,
        isCodingQuestion: next.isCodingQuestion ?? false,
      });
      await interviewSessionService.appendTurn(input.interviewId, questionTurn, {
        phase: next.phase,
        currentDifficulty: next.difficulty,
      });

      const s = await interviewSessionService.getStateWithBranding(input.interviewId);
      if (s) {
        s.welcomeDelivered = true;
        await interviewSessionService.setState(input.interviewId, s);
      }

      const updatedState = await interviewSessionService.getStateWithBranding(input.interviewId);
      console.log('[Interview] Humanized opener delivered', {
        interviewId: input.interviewId,
        questionPreview: questionText.slice(0, 100),
      });
      return {
        success: true,
        state: updatedState ?? state,
        reply: questionText,
        questionId: next.questionId,
        phase: next.phase,
      };
    }

    const reply = rawReply.trim();
    const aiTurn = conversationManager.createTurn('ai', reply, {
      questionId: next.questionId,
      codingStarterCode: next.starterCode ?? undefined,
      codingLanguage: next.language ?? undefined,
      isCodingQuestion: next.isCodingQuestion ?? false,
    });
    await interviewSessionService.appendTurn(input.interviewId, aiTurn, {
      phase: next.phase,
      currentDifficulty: next.difficulty,
    });

    if (avatarService.isEnabled()) {
      void avatarService.generateAvatarWithTimeout({ text: reply }).then(async (avatarResult) => {
        if (!avatarResult.videoUrl) return;
        try {
          const live = await interviewSessionService.getStateWithBranding(input.interviewId);
          if (!live) return;
          const turn = live.turns.find((t) => t.id === aiTurn.id);
          if (turn) {
            turn.avatarVideo = avatarResult.videoUrl;
            await interviewSessionService.setState(input.interviewId, live);
          }
        } catch (err) {
          console.error('Avatar attach failed (non-blocking):', err);
        }
      });
    }

    const updatedState = await interviewSessionService.getStateWithBranding(input.interviewId);
    return {
      success: true,
      state: updatedState ?? state,
      reply,
      questionId: next.questionId,
      phase: next.phase,
    };
  }

  private async getNextReplyInternal(
    state: InterviewState,
    questionText: string,
    questionId: string | undefined,
    phase: string | undefined,
    lastQuestionAsked?: string,
    lastCandidateAnswer?: string
  ): Promise<string> {
    const context = conversationManager.buildContext(state);
    const resumeContextBlock = state.resumeContext
      ? `\nCandidate resume/profile context (use thoroughly when deciding each question):\n${state.resumeContext}\n\nUse this context to personalize every question: reference their background, probe deeper into resume claims, and keep questions relevant to the candidate.`
      : '';
    const focusAreasBlock = state.focusAreas
      ? `\nInterview focus areas / subject (set by recruiter): ${state.focusAreas.replace(/coding_mode:[a-z_]+\s*\|\s*/i, '')}. Prioritize questions related to these areas when relevant.`
      : '';
    const durationBlock = state.durationMinutes
      ? `\nInterview duration: ${resolveInterviewDurationMinutes(state.durationMinutes)} minutes. Keep questions focused and allow time for wrap-up. End gracefully before time runs out.`
      : '';
    const systemContent =
      SYSTEM_PROMPT_INTERVIEWER.replace('{{phase}}', state.phase)
        .replace('{{role}}', state.role) +
      buildInterviewLanguagePromptBlock(state.interviewLanguage ?? 'en-US') +
      resumeContextBlock +
      focusAreasBlock +
      this.interviewerPromptExtras(state) +
      durationBlock +
      (context.priorSummary ? '\n' + buildInterviewerContext(context.priorSummary) : '');

    const answerSnippet = lastCandidateAnswer ? lastCandidateAnswer.slice(0, 800).trim() : '';
    const questionSnippet = lastQuestionAsked ? lastQuestionAsked.slice(0, 300).trim() : '';
    let userInstruction: string;
    if (answerSnippet && questionSnippet) {
      userInstruction = `The interviewer asked: "${questionSnippet}"

The candidate answered: "${answerSnippet}"

Analyze their answer. You have read their resume — reference specific skills, projects, companies, or claims naturally when asking the next question or follow-up. If their answer was vague, probe deeper. If strong, raise difficulty slightly. Your reply must: (1) Briefly reflect something specific they said in natural spoken words. (2) Ask the next question, rephrased so it flows from their answer — no stock transitions like "kick things off" or "moving on". Write for speech: short sentences, no markdown. Next question topic/intent: ${questionText}

Respond only with valid JSON: {"reply": "<your spoken reply: max 45 words, natural acknowledgment + one fluent question>", "intent": "follow_up" | "next_question", "suggestedNextPhase": null | "technical" | "behavioral" | "wrap_up"}`;
    } else if (answerSnippet) {
      userInstruction = `The candidate just said: "${answerSnippet}". Analyze their answer. Reference something specific they said, then ask the next question. Next question to ask: ${questionText}`;
    } else {
      userInstruction = `Next question to ask: ${questionText}`;
    }

    const messages = [
      { role: 'system' as const, content: systemContent },
      ...context.messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: userInstruction },
    ];

    const llm = getLLMService();
    const response = await llm.chat(messages, {
      temperature: 0.4,
      maxTokens: 280,
      timeoutMs: LLM_INTERVIEW_TIMEOUT_MS,
    });
    const reply = extractInterviewerReply(response.content || '', questionText);
    return reply || questionText;
  }

  /**
   * Generate report for a completed interview (e.g. from GET /report/:id).
   */
  async getReport(interviewId: string): Promise<InterviewReport | null> {
    const state = await interviewSessionService.getStateWithBranding(interviewId);
    if (!state) return null;
    return scoringReportService.buildReport({
      ...state,
      endedAt: state.endedAt ?? new Date().toISOString(),
    });
  }
}

export const aiInterviewerOrchestrator = new AIInterviewerOrchestrator();
