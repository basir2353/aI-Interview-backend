import { phaseTransitionService } from '../services/interview/PhaseTransitionService';
import type { InterviewState } from '../types';

function baseState(overrides: Partial<InterviewState> = {}): InterviewState {
  return {
    interviewId: '00000000-0000-4000-8000-000000000001',
    candidateId: '00000000-0000-4000-8000-000000000002',
    role: 'technical',
    phase: 'intro',
    startedAt: new Date().toISOString(),
    turns: [],
    topicCoverage: {},
    currentDifficulty: 'medium',
    approximateTokens: 0,
    phaseQuestionCount: 0,
    ...overrides,
  };
}

describe('PhaseTransitionService', () => {
  it('allows sequential phase transitions', () => {
    expect(phaseTransitionService.canTransition('intro', 'technical')).toBe(true);
    expect(phaseTransitionService.canTransition('intro', 'behavioral')).toBe(false);
  });

  it('resets question count on phase change', () => {
    const state = baseState({ phase: 'intro', phaseQuestionCount: 0 });
    const next = phaseTransitionService.applyPhaseChange(state, 'technical');
    expect(next.phase).toBe('technical');
    expect(next.phaseQuestionCount).toBe(1);
    expect(next.phaseStartedAt).toBeDefined();
  });
});
