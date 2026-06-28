export const INTERVIEWER_PERSONAS = ['ethan', 'zara'] as const;
export type InterviewerPersona = (typeof INTERVIEWER_PERSONAS)[number];

export function normalizeInterviewerPersona(value: unknown): InterviewerPersona {
  return value === 'zara' ? 'zara' : 'ethan';
}

export function interviewerFirstName(persona?: string | null): string {
  return normalizeInterviewerPersona(persona) === 'zara' ? 'ZaraAlex' : 'Ethan';
}
