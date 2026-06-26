import type { ResumeProfile } from './ResumeProfileService';
import type { CodingInterviewModeId } from '../../constants/codingInterviewModes';
import { CODING_INTERVIEW_MODES } from '../../constants/codingInterviewModes';

export function formatFirstName(name?: string): string {
  const raw = (name || '').trim().split(/\s+/)[0];
  if (!raw) return '';
  if (raw.includes('@')) return '';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/**
 * Three spoken beats — like a real interviewer on a call:
 * 1) Hello + interviewer introduces themselves (NO candidate name yet)
 * 2) Candidate name + role + light resume ack
 * 3) What to expect + handoff to first question
 */
export function buildInterviewWelcomeParts(
  profile: ResumeProfile,
  options?: {
    codingModeId?: CodingInterviewModeId;
    interviewerName?: string;
    roleLabel?: string;
  }
): string[] {
  const firstName = formatFirstName(profile.candidateName);
  const interviewer = options?.interviewerName ?? 'Ethan';
  const roleLabel = options?.roleLabel ?? 'technical';

  const part1 = [
    `Hello! Hi there.`,
    `I'm ${interviewer} — I'll be your interviewer today.`,
    `Thanks for making the time to join me.`,
  ].join(' ');

  const nameLine = firstName
    ? `${firstName}, it's really good to meet you.`
    : `It's really good to meet you.`;
  const roleLine = profile.positionTitle
    ? `I understand you're here for the ${profile.positionTitle} role.`
    : `I understand you're here for your ${roleLabel} interview today.`;
  const part2 = [nameLine, roleLine, `I've had a chance to look over your background before we started.`].join(' ');

  const sessionLine = options?.codingModeId
    ? `We'll keep this relaxed and conversational — some experience questions, problem-solving, and a bit of ${CODING_INTERVIEW_MODES[options.codingModeId].label.toLowerCase()} along the way.`
    : `We'll keep this relaxed and conversational — your experience, how you think through problems, and a few specifics from your work. No trick questions.`;
  const part3 = [sessionLine, `Take your time with answers. When you're ready, we'll dive in.`].join(' ');

  return [part1, part2, part3];
}

/** Full intro as one string (for logs / fallback display). */
export function buildInterviewWelcome(
  profile: ResumeProfile,
  options?: {
    codingModeId?: CodingInterviewModeId;
    interviewerName?: string;
    roleLabel?: string;
  }
): string {
  return buildInterviewWelcomeParts(profile, options).join(' ');
}
