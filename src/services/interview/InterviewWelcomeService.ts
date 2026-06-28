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
 * 1) Interviewer intro + thanks for joining (no candidate name yet)
 * 2) Welcome by name + role context + light resume ack
 * 3) Set expectations before the first question
 */
export function buildInterviewWelcomeParts(
  profile: ResumeProfile,
  options?: {
    codingModeId?: CodingInterviewModeId;
    interviewerName?: string;
    roleLabel?: string;
    companyName?: string | null;
  }
): string[] {
  const firstName = formatFirstName(profile.candidateName);
  const interviewer = options?.interviewerName ?? 'Ethan';
  const roleLabel = options?.roleLabel ?? 'technical';
  const company = options?.companyName?.trim();

  const part1 = company
    ? `Hi there — thanks for joining today. I'm ${interviewer}, and I'll be your interviewer today on behalf of ${company}.`
    : [
        `Hi there — thanks for joining today.`,
        `I'm ${interviewer}, and I'll be your interviewer for this session.`,
      ].join(' ');

  const nameLine = firstName
    ? `${firstName}, great to meet you.`
    : `Great to meet you.`;
  const roleLine = profile.positionTitle
    ? `You're here for the ${profile.positionTitle} role — I've had a quick look at your background ahead of time.`
    : company
      ? `You're here for your ${roleLabel} interview with ${company} — I've had a quick look at what you shared with us.`
      : `You're here for your ${roleLabel} interview today — I've had a quick look at what you shared with us.`;
  const part2 = [nameLine, roleLine].join(' ');

  const sessionLine = options?.codingModeId
    ? `We'll keep this pretty conversational — a bit about your experience, some problem-solving, and maybe a little ${CODING_INTERVIEW_MODES[options.codingModeId].label.toLowerCase()} if we get there.`
    : `Think of this as a conversation, not a test — we'll talk about your experience, how you approach problems, and a few things from your work.`;
  const part3 = [
    sessionLine,
    `No need to rush — take your time with each answer.`,
    `Alright, let's get started.`,
  ].join(' ');

  return [part1, part2, part3];
}

/** Full intro as one string (for logs / fallback display). */
export function buildInterviewWelcome(
  profile: ResumeProfile,
  options?: {
    codingModeId?: CodingInterviewModeId;
    interviewerName?: string;
    roleLabel?: string;
    companyName?: string | null;
  }
): string {
  return buildInterviewWelcomeParts(profile, options).join(' ');
}

/**
 * First question AFTER the spoken intro — warm and human.
 * Does NOT jump straight into a deep resume probe (that comes on follow-ups).
 */
export function buildFirstWarmUpQuestion(input: {
  candidateName?: string;
  positionTitle?: string;
  roleLabel?: string;
  codingModeId?: CodingInterviewModeId;
}): string {
  const firstName = formatFirstName(input.candidateName);
  const roleRef = input.positionTitle
    ? `the ${input.positionTitle} role`
    : `this ${input.roleLabel ?? 'technical'} opportunity`;

  if (input.codingModeId) {
    const modeLabel = CODING_INTERVIEW_MODES[input.codingModeId].label.toLowerCase();
    return firstName
      ? `So to kick things off, ${firstName} — in your own words, tell me a bit about yourself and the ${modeLabel} experience you're bringing to ${roleRef}.`
      : `So to kick things off — in your own words, tell me a bit about yourself and the ${modeLabel} experience you're bringing to ${roleRef}.`;
  }

  return firstName
    ? `So to kick things off, ${firstName} — walk me through your background in your own words, and what drew you to ${roleRef}.`
    : `So to kick things off — walk me through your background in your own words, and what drew you to ${roleRef}.`;
}
