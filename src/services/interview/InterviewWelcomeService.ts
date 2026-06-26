import type { ResumeProfile } from './ResumeProfileService';
import type { CodingInterviewModeId } from '../../constants/codingInterviewModes';
import { CODING_INTERVIEW_MODES } from '../../constants/codingInterviewModes';

function formatFirstName(name?: string): string {
  const raw = (name || 'there').trim().split(/\s+/)[0] || 'there';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

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

  const highlights: string[] = [];
  if (profile.techStack.length) highlights.push(profile.techStack.slice(0, 6).join(', '));
  else if (profile.skills.length) highlights.push(profile.skills.slice(0, 6).join(', '));

  const experienceLine = highlights.length
    ? `I've reviewed your resume. You have experience with ${highlights.join(', ')}.`
    : `I've reviewed your resume and background.`;

  const positionLine = profile.positionTitle
    ? `Thank you for interviewing for the ${profile.positionTitle} position.`
    : '';

  const modeLine = options?.codingModeId
    ? `Today's session is a ${CODING_INTERVIEW_MODES[options.codingModeId].label} interview.`
    : `Today's ${roleLabel} interview will focus on your skills, project experience, problem-solving, and communication.`;

  return [
    `Hi, I'm ${interviewer} from Intervion AI.`,
    `Welcome, ${firstName}.`,
    positionLine,
    experienceLine,
    modeLine,
    `I've reviewed your background carefully — I'll ask thoughtful follow-up questions based on what you share.`,
  ]
    .filter(Boolean)
    .join(' ');
}
