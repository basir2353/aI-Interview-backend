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
import { buildInterviewWelcomeParts, formatFirstName } from './InterviewWelcomeService';
import { interviewerFirstName } from '../../constants/interviewerPersona';
import { buildInterviewLanguagePromptBlock, normalizeInterviewLanguage, llmReplyLanguageReminder, localizedInterviewClosing } from '../../constants/interviewLanguage';
import { interviewSessionService } from './InterviewSessionService';
import { conversationManager } from './ConversationManager';
import { questionStrategyEngine } from './QuestionStrategyEngine';
import { evaluationEngine } from './EvaluationEngine';
import { scoringReportService } from './ScoringReportService';
import { avatarService } from '../avatar/avatar.service';
import { isLikelyEchoAnswer } from './echoGuard';
import { isInvalidCandidateTranscript } from './sttGuard';
import { agentDebugLog } from '../../config/debugLog';
import type { InterviewState, InterviewReport } from '../../types';

const LLM_INTERVIEW_TIMEOUT_MS = 35000;

export interface SubmitAnswerInput {
  interviewId: string;
  answerText: string;
}

export type SubmitAnswerFailureReason = 'session_not_found' | 'no_pending_question' | 'echo_detected' | 'invalid_transcript';

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

  private buildWelcomeParts(state: InterviewState): string[] {
    const codingMode = state.codingInterviewMode as CodingInterviewModeId | undefined;
    const interviewerName = this.interviewerName(state);
    const companyName = state.companyName;
    const positionTitle = state.positionTitle ?? state.resumeProfile?.positionTitle;
    const profile = {
      candidateName: state.candidateDisplayName ?? state.resumeProfile?.candidateName,
      positionTitle,
      skills: state.resumeProfile?.skills ?? [],
      experience: state.resumeProfile?.experience ?? [],
      projects: state.resumeProfile?.projects ?? [],
      education: [] as string[],
      certifications: [] as string[],
      techStack: state.resumeProfile?.techStack ?? [],
      achievements: [] as string[],
      workHistory: state.resumeProfile?.experience ?? [],
      summary: state.resumeProfile?.summary ?? '',
    };
    if (state.resumeProfile || state.resumeContext?.trim()) {
      return buildInterviewWelcomeParts(profile, {
        codingModeId: codingMode,
        interviewerName,
        roleLabel: this.roleLabel(state.role),
        companyName,
        interviewLanguage: state.interviewLanguage,
      });
    }
    const firstName = formatFirstName(profile.candidateName);
    return buildInterviewWelcomeParts(
      {
        candidateName: profile.candidateName,
        positionTitle,
        skills: [],
        experience: [],
        projects: [],
        education: [],
        certifications: [],
        techStack: [],
        achievements: [],
        workHistory: [],
        summary: '',
      },
      {
        codingModeId: codingMode,
        interviewerName,
        roleLabel: this.roleLabel(state.role),
        companyName,
        interviewLanguage: state.interviewLanguage,
      }
    );
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

  /**
   * Submit candidate answer: evaluate it, append turns, decide follow-up vs next
   * question, and return next AI reply. If interview is at end, generate report.
   */
  async submitAnswer(input: SubmitAnswerInput): Promise<SubmitAnswerResult> {
    const state = await interviewSessionService.getStateWithBranding(input.interviewId);
    if (!state) {
      return { success: false, state: null, failureReason: 'session_not_found' };
    }

    const lastTurn = state.turns.length > 0 ? state.turns[state.turns.length - 1] : null;
    if (!lastTurn || lastTurn.role !== 'ai' || lastTurn.isIntro) {
      return { success: false, state: null, failureReason: 'no_pending_question' };
    }

    const lastAiTurn = [...state.turns].reverse().find((t) => t.role === 'ai' && !t.isIntro);
    const lastQuestionText = lastAiTurn?.content ?? '';
    const lastQuestionId = lastAiTurn?.questionId;

    const interviewerTexts = state.turns
      .filter((t) => t.role === 'ai')
      .map((t) => t.content ?? '')
      .filter(Boolean);

    if (isLikelyEchoAnswer(input.answerText, interviewerTexts, state.interviewLanguage)) {
      agentDebugLog({
        hypothesisId: 'D',
        location: 'AIInterviewerOrchestrator.ts:submit',
        message: 'answer rejected',
        data: { reason: 'echo_detected', answerLen: input.answerText.length },
      });
      return { success: false, state, failureReason: 'echo_detected' };
    }

    if (isInvalidCandidateTranscript(input.answerText, normalizeInterviewLanguage(state.interviewLanguage))) {
      agentDebugLog({
        hypothesisId: 'D',
        location: 'AIInterviewerOrchestrator.ts:submit',
        message: 'answer rejected',
        data: { reason: 'invalid_transcript', answerLen: input.answerText.length },
      });
      return { success: false, state, failureReason: 'invalid_transcript' };
    }

    const competencyIds = lastQuestionId
      ? questionStrategyEngine.getCompetencyIdsForQuestionId(lastQuestionId)
      : ['communication'];

    // Live path: do not block the next question on a second LLM scoring call.
    const evaluation = evaluationEngine.placeholderEvaluation(
      competencyIds.length ? competencyIds : ['communication']
    );

    const candidateTurn = conversationManager.createTurn('candidate', input.answerText, {
      evaluation,
    });
    await interviewSessionService.appendTurn(input.interviewId, candidateTurn, {
      topicCoverage: lastQuestionId ? { [lastQuestionId]: true } : undefined,
    });

    void evaluationEngine
      .evaluate({
        question: lastQuestionText,
        answer: input.answerText,
        competencyIds: competencyIds.length ? competencyIds : ['communication'],
        interviewLanguage: state.interviewLanguage,
      })
      .then((full) => interviewSessionService.updateTurnEvaluation(input.interviewId, candidateTurn.id, full))
      .catch((err) => console.error('Background answer evaluation failed:', err));

    const updatedState = await interviewSessionService.getStateWithBranding(input.interviewId);
    if (!updatedState) return { success: true, state: null, evaluation: { score: evaluation.score, maxScore: evaluation.maxScore } };

    const trimmedAnswer = input.answerText.trim();
    const requestFollowUp = trimmedAnswer.length < 50;
    const next = await questionStrategyEngine.getNextQuestion({
      state: updatedState,
      requestFollowUp,
    });

    if (!next) {
      const report = scoringReportService.buildReport({ ...updatedState, endedAt: new Date().toISOString() });
      await interviewSessionService.end(input.interviewId, report);
      return {
        success: true,
        state: updatedState,
        nextReply: localizedInterviewClosing(normalizeInterviewLanguage(state.interviewLanguage)),
        evaluation: { score: evaluation.score, maxScore: evaluation.maxScore },
        report,
      };
    }

    let aiReply: string;
    try {
      aiReply = await this.getNextReplyInternal(
        updatedState,
        next.questionText,
        next.questionId,
        next.phase,
        lastQuestionText,
        input.answerText,
        false
      );
    } catch (err) {
      console.error('getNextReplyInternal failed (using fallback):', err);
      aiReply = next.questionText || 'Thank you for that. Can you tell me a bit more?';
    }
    let avatarVideo: string | undefined;
    const aiTurn = conversationManager.createTurn('ai', aiReply, {
      questionId: next.questionId,
      codingStarterCode: next.starterCode ?? undefined,
      codingLanguage: next.language ?? undefined,
      isCodingQuestion: next.isCodingQuestion ?? false,
      avatarVideo,
    });
    await interviewSessionService.appendTurn(input.interviewId, aiTurn, {
      phase: next.phase,
      currentDifficulty: next.difficulty,
    });

    if (avatarService.isEnabled()) {
      void avatarService
        .generateAvatarWithTimeout({ text: aiReply })
        .then((result) => {
          if (result.videoUrl) {
            return interviewSessionService.updateTurnAvatarVideo(input.interviewId, aiTurn.id, result.videoUrl);
          }
        })
        .catch((err) => console.error('Avatar generation failed (non-blocking):', err));
    }

    const finalState = await interviewSessionService.getStateWithBranding(input.interviewId);
    return {
      success: true,
      state: finalState ?? updatedState,
      nextReply: aiReply,
      avatarVideo,
      evaluation: { score: evaluation.score, maxScore: evaluation.maxScore },
    };
  }

  /**
   * Deliver welcome intro beats + first question when the candidate enters the live room.
   * Idempotent: safe to call once per session; repairs legacy sessions that only have a question turn.
   */
  async ensureWelcomeDelivered(interviewId: string): Promise<EnsureWelcomeDeliveredResult> {
    const state = await interviewSessionService.getStateWithBranding(interviewId);
    if (!state) {
      return { success: false, state: null, reply: '' };
    }

    const aiTurns = state.turns.filter((t) => t.role === 'ai');
    const introTurns = aiTurns.filter((t) => t.isIntro);
    const questionTurn = aiTurns.find((t) => !t.isIntro);

    if (introTurns.length >= 1 && questionTurn) {
      if (!state.welcomeDelivered) {
        state.welcomeDelivered = true;
        await interviewSessionService.setState(interviewId, state);
      }
      console.log('[Interview] Welcome already delivered', {
        interviewId,
        introBeats: introTurns.length,
      });
      return {
        success: true,
        state,
        reply: introTurns[0]?.content ?? '',
        alreadyDelivered: true,
        questionId: questionTurn.questionId,
        phase: state.phase,
      };
    }

    if (aiTurns.length === 0) {
      console.log('[Interview] Delivering welcome on live entry', { interviewId });
      return this.getNextReply({ interviewId });
    }

    if (questionTurn && introTurns.length === 0) {
      const welcomeParts = this.buildWelcomeParts(state);
      const introText = welcomeParts.join(' ').trim();
      const introOnlyTurns = introText
        ? [conversationManager.createTurn('ai', introText, { isIntro: true })]
        : [];
      state.turns = [...introOnlyTurns, ...state.turns];
      state.welcomeDelivered = true;
      await interviewSessionService.setState(interviewId, state);
      console.log('[Interview] Prepended missing welcome intro beats', {
        interviewId,
        introBeats: welcomeParts.length,
      });
      return {
        success: true,
        state,
        reply: welcomeParts[0] ?? '',
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
    const state = await interviewSessionService.getStateWithBranding(input.interviewId);
    if (!state) {
      return { success: false, state: null, reply: '' };
    }

    const existingQuestion = state.turns.find((t) => t.role === 'ai' && !t.isIntro);
    if (existingQuestion) {
      const introTurns = state.turns.filter((t) => t.role === 'ai' && t.isIntro);
      return {
        success: true,
        state,
        reply: introTurns[0]?.content ?? existingQuestion.content,
        questionId: existingQuestion.questionId,
        phase: state.phase,
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
    try {
      rawReply = await this.getNextReplyInternal(
        state,
        next.questionText,
        next.questionId,
        next.phase,
        undefined,
        undefined,
        isFirstQuestion
      );
    } catch (err) {
      console.error('getNextReplyInternal failed (using fallback):', err);
      rawReply = isFirstQuestion
        ? this.buildResumeOpeningFallback(state)
        : next.questionText || 'Could you tell me more about that?';
    }

    if (isFirstQuestion) {
      const welcomeParts = this.buildWelcomeParts(state);
      const introText = welcomeParts.join(' ').trim();
      if (introText) {
        const introTurn = conversationManager.createTurn('ai', introText, { isIntro: true });
        await interviewSessionService.appendTurn(input.interviewId, introTurn);
      }

      const questionText = rawReply.trim();
      let questionAvatarVideo: string | undefined;
      try {
        if (avatarService.isEnabled()) {
          const avatarResult = await avatarService.generateAvatarWithTimeout({ text: questionText });
          questionAvatarVideo = avatarResult.videoUrl;
        }
      } catch (err) {
        console.error('Avatar generation failed (non-blocking):', err);
      }
      const questionTurn = conversationManager.createTurn('ai', questionText, {
        questionId: next.questionId,
        codingStarterCode: next.starterCode ?? undefined,
        codingLanguage: next.language ?? undefined,
        isCodingQuestion: next.isCodingQuestion ?? false,
        avatarVideo: questionAvatarVideo,
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
      console.log('[Interview] Welcome delivered', {
        interviewId: input.interviewId,
        introBeats: welcomeParts.length,
        introPreview: welcomeParts[0]?.slice(0, 80),
        questionPreview: questionText.slice(0, 80),
      });
      return {
        success: true,
        state: updatedState ?? state,
        reply: welcomeParts[0] ?? '',
        avatarVideo: questionAvatarVideo,
        questionId: next.questionId,
        phase: next.phase,
      };
    }

    const reply = rawReply.trim();
    let avatarVideo: string | undefined;
    try {
      if (avatarService.isEnabled()) {
        const avatarResult = await avatarService.generateAvatarWithTimeout({ text: reply });
        avatarVideo = avatarResult.videoUrl;
      }
    } catch (err) {
      console.error('Avatar generation failed (non-blocking):', err);
    }
    const aiTurn = conversationManager.createTurn('ai', reply, {
      questionId: next.questionId,
      codingStarterCode: next.starterCode ?? undefined,
      codingLanguage: next.language ?? undefined,
      isCodingQuestion: next.isCodingQuestion ?? false,
      avatarVideo,
    });
    await interviewSessionService.appendTurn(input.interviewId, aiTurn, {
      phase: next.phase,
      currentDifficulty: next.difficulty,
    });

    const updatedState = await interviewSessionService.getStateWithBranding(input.interviewId);
    return {
      success: true,
      state: updatedState ?? state,
      reply,
      avatarVideo,
      questionId: next.questionId,
      phase: next.phase,
    };
  }

  private buildResumeOpeningFallback(state: InterviewState): string {
    const skill = state.resumeProfile?.skills?.[0];
    const project = state.resumeProfile?.projects?.[0];
    const company = state.resumeProfile?.experience?.[0];
    if (project) {
      return `I'd like to start with your work on ${project} — what was your role and what impact did you have?`;
    }
    if (skill) {
      return `Let's begin with your ${skill} experience — can you describe a recent project where you applied it?`;
    }
    if (company) {
      return `I see experience at ${company} — what was a key challenge you handled there?`;
    }
    return 'What is the most relevant recent project you have worked on, and what was your contribution?';
  }

  private async getNextReplyInternal(
    state: InterviewState,
    questionText: string,
    questionId: string | undefined,
    phase: string | undefined,
    lastQuestionAsked?: string,
    lastCandidateAnswer?: string,
    isOpeningQuestion = false
  ): Promise<string> {
    const interviewCode = normalizeInterviewLanguage(state.interviewLanguage);
    const langReminder = llmReplyLanguageReminder(interviewCode);
    const context = conversationManager.buildContext(state);
    const resumeContextBlock = state.resumeContext
      ? `\nCandidate resume/profile context (use thoroughly when deciding each question):\n${state.resumeContext}\n\nUse this context to personalize every question: reference their background, probe deeper into resume claims, and keep questions relevant to the candidate.`
      : '';
    const focusAreasBlock = state.focusAreas
      ? `\nInterview focus areas / subject (set by recruiter): ${state.focusAreas.replace(/coding_mode:[a-z_]+\s*\|\s*/i, '')}. Prioritize questions related to these areas when relevant.`
      : '';
    const durationBlock = state.durationMinutes
      ? `\nInterview duration: ${state.durationMinutes} minutes. Keep questions focused and allow time for wrap-up.`
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

Analyze their answer. You have read their resume — reference specific skills, projects, companies, or claims naturally when asking the next question or follow-up. If their answer was vague, probe deeper. If strong, raise difficulty slightly. Your reply must: (1) Briefly reflect something specific they said. (2) Ask the next question; you may rephrase to connect to their answer. Next question topic/intent: ${questionText}

Respond only with valid JSON: {"reply": "<your spoken reply: brief acknowledgment + one question>", "intent": "follow_up" | "next_question", "suggestedNextPhase": null | "technical" | "behavioral" | "wrap_up"}${langReminder}`;
    } else if (answerSnippet) {
      userInstruction = `The candidate just said: "${answerSnippet}". Analyze their answer. Reference something specific they said, then ask the next question. Next question to ask: ${questionText}

Respond only with valid JSON: {"reply": "<brief acknowledgment + one question>", "intent": "next_question", "suggestedNextPhase": null | "technical" | "behavioral" | "wrap_up"}${langReminder}`;
    } else if (isOpeningQuestion) {
      const firstName = formatFirstName(state.candidateDisplayName ?? state.resumeProfile?.candidateName);
      const resumeHint = state.resumeProfile?.skills?.length
        ? `Candidate skills include: ${state.resumeProfile.skills.slice(0, 8).join(', ')}.`
        : state.resumeContext?.trim()
          ? 'Use the resume context above.'
          : 'Resume is sparse — ask about their most recent relevant role or project.';
      userInstruction = `This is the FIRST scored question immediately after your spoken welcome intro${firstName ? ` with ${firstName}` : ''}.

${resumeHint}

Ask ONE personalized opening question:
- MUST reference something specific from their resume (project name, company, technology, or achievement).
- FORBIDDEN phrases: "walk me through your background", "tell me about yourself", "what drew you to this role", "kick things off", "in your own words".
- Output only the question (no second welcome). One or two short sentences max.
- Topic hint from question bank (rephrase heavily): ${questionText}

Respond only with valid JSON: {"reply": "<personalized opening question>", "intent": "next_question", "suggestedNextPhase": null | "technical" | "behavioral" | "wrap_up"}${langReminder}`;
    } else {
      userInstruction = `Next question to ask: ${questionText}

Respond only with valid JSON: {"reply": "<one question>", "intent": "next_question", "suggestedNextPhase": null | "technical" | "behavioral" | "wrap_up"}${langReminder}`;
    }

    const messages = [
      { role: 'system' as const, content: systemContent },
      ...context.messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: userInstruction },
    ];

    const llm = getLLMService();
    const response = await llm.chat(messages, {
      temperature: 0.4,
      maxTokens: 384,
      timeoutMs: LLM_INTERVIEW_TIMEOUT_MS,
    });
    const llmFallback = isOpeningQuestion ? '' : questionText;
    let reply = extractInterviewerReply(response.content || '', llmFallback);
    if (isOpeningQuestion && !reply.trim()) {
      reply = this.buildResumeOpeningFallback(state);
    }
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
