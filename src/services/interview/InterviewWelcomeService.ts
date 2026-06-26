import type { ResumeProfile } from './ResumeProfileService';
import type { CodingInterviewModeId } from '../../constants/codingInterviewModes';
import { CODING_INTERVIEW_MODES } from '../../constants/codingInterviewModes';

export function formatFirstName(name?: string): string {
  const raw = (name || '').trim().split(/\s+/)[0];
  if (!raw) return '';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function humanizeSkillHighlights(profile: ResumeProfile): string {
  const stack = profile.techStack.slice(0, 4);
  const skills = profile.skills.slice(0, 4);
  const items = stack.length ? stack : skills;
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Spoken welcome: interviewer greets and introduces themselves FIRST,
 * then addresses the candidate by name, role, and what to expect — like a real senior interviewer.
 */
export function buildInterviewWelcome(
  profile: ResumeProfile,
  options?: {
    codingModeId?: CodingInterviewModeId;
    interviewerName?: string;
    roleLabel?: string;
  }
): string {
  const firstName = formatFirstName(profile.candidateName);
  const interviewer = options?.interviewerName ?? 'Ethan';
  const roleLabel = options?.roleLabel ?? 'technical';
  const highlights = humanizeSkillHighlights(profile);

  // —— Step 1: Greeting + interviewer introduces themselves (before candidate name) ——
  const opener = `Hello! Hi there — I'm ${interviewer}, and I'll be conducting your interview today. Thanks for making the time to speak with me.`;

  // —— Step 2: Candidate name + role/position (after interviewer intro) ——
  const nameBit = firstName ? `${firstName}, it's great to meet you.` : `It's great to meet you.`;

  const positionBit = profile.positionTitle
    ? `We're here to talk about the ${profile.positionTitle} role.`
    : `We're here for your ${roleLabel} interview today.`;

  // —— Step 3: Light resume acknowledgment — conversational, not a list ——
  let resumeBit = `I've had a chance to go through your background ahead of time.`;
  if (highlights) {
    resumeBit = `I've had a chance to go through your background — I see solid experience with ${highlights}, among other things.`;
  } else if (profile.experience[0]) {
    const snippet = profile.experience[0].slice(0, 70).replace(/\s+/g, ' ').trim();
    resumeBit = `I've had a chance to go through your background — your work at ${snippet}${profile.experience[0].length > 70 ? '…' : ''} caught my eye.`;
  }

  // —— Step 4: What to expect — human, not scripted ——
  const focusBit = options?.codingModeId
    ? `We'll keep this conversational — I'll ask about your experience, how you think through problems, and some ${CODING_INTERVIEW_MODES[options.codingModeId].label.toLowerCase()} topics along the way.`
    : `We'll keep this conversational — I'll ask about your experience, how you approach problems, and dig into a few specifics from your work. No trick questions; just a honest back-and-forth.`;

  const closeBit = `Take your time with your answers. Whenever you're ready, we can get started.`;

  return [opener, nameBit, positionBit, resumeBit, focusBit, closeBit].join(' ');
}
