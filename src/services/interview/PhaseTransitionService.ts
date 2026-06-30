/**
 * Validates and tracks interview phase progression with min/max question rules.
 */
import type { InterviewPhase, InterviewState } from '../../types';
import { logger } from '../../config/logger';

export interface PhaseRules {
  minQuestions: number;
  maxQuestions: number;
}

const DEFAULT_PHASE_RULES: Record<InterviewPhase, PhaseRules> = {
  intro: { minQuestions: 0, maxQuestions: 0 },
  technical: { minQuestions: 1, maxQuestions: 8 },
  behavioral: { minQuestions: 1, maxQuestions: 4 },
  wrap_up: { minQuestions: 0, maxQuestions: 2 },
  coding: { minQuestions: 1, maxQuestions: 3 },
};

const PHASE_ORDER: InterviewPhase[] = ['intro', 'technical', 'behavioral', 'wrap_up', 'coding'];

export class PhaseTransitionService {
  getPhaseOrder(): InterviewPhase[] {
    return [...PHASE_ORDER];
  }

  getRules(phase: InterviewPhase): PhaseRules {
    return DEFAULT_PHASE_RULES[phase];
  }

  countQuestionsInPhase(state: InterviewState, phase: InterviewPhase): number {
    let inPhase = false;
    let count = 0;
    for (const t of state.turns) {
      if (t.role === 'ai' && !t.isIntro && t.questionId) {
        // Approximate phase by order — state.phase tracks current
        if (phase === state.phase) inPhase = true;
      }
      if (inPhase && t.role === 'candidate') count++;
    }
    if (phase === state.phase) {
      return state.phaseQuestionCount ?? count;
    }
    return count;
  }

  canTransition(from: InterviewPhase, to: InterviewPhase): boolean {
    const fromIdx = PHASE_ORDER.indexOf(from);
    const toIdx = PHASE_ORDER.indexOf(to);
    if (fromIdx < 0 || toIdx < 0) return false;
    return toIdx === fromIdx + 1;
  }

  validateTransition(state: InterviewState, nextPhase: InterviewPhase): boolean {
    if (nextPhase === state.phase) return true;
    if (!this.canTransition(state.phase, nextPhase)) {
      logger.warn('Invalid phase transition rejected', {
        interviewId: state.interviewId,
        from: state.phase,
        to: nextPhase,
      });
      return false;
    }
    const rules = this.getRules(state.phase);
    const asked = state.phaseQuestionCount ?? 0;
    if (asked < rules.minQuestions) {
      logger.warn('Phase min questions not met', {
        interviewId: state.interviewId,
        phase: state.phase,
        asked,
        min: rules.minQuestions,
      });
      return false;
    }
    return true;
  }

  applyPhaseChange(state: InterviewState, nextPhase: InterviewPhase): InterviewState {
    if (nextPhase === state.phase) {
      return {
        ...state,
        phaseQuestionCount: (state.phaseQuestionCount ?? 0) + 1,
      };
    }
    if (!this.validateTransition(state, nextPhase)) {
      return state;
    }
    return {
      ...state,
      phase: nextPhase,
      phaseStartedAt: new Date().toISOString(),
      phaseQuestionCount: 1,
    };
  }

  nextPhase(current: InterviewPhase): InterviewPhase | null {
    const i = PHASE_ORDER.indexOf(current);
    return i >= 0 && i < PHASE_ORDER.length - 1 ? PHASE_ORDER[i + 1] : null;
  }

  shouldAdvancePhase(state: InterviewState): boolean {
    const rules = this.getRules(state.phase);
    const asked = state.phaseQuestionCount ?? 0;
    return asked >= rules.maxQuestions;
  }
}

export const phaseTransitionService = new PhaseTransitionService();
