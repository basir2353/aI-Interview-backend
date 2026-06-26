import type { ResumeProfile } from './ResumeProfileService';
import type { CodingInterviewModeId } from '../../constants/codingInterviewModes';
import { CODING_INTERVIEW_MODES } from '../../constants/codingInterviewModes';

export function buildInterviewWelcome(profile: ResumeProfile, codingModeId?: CodingInterviewModeId): string {
  const firstName = (profile.candidateName || 'there').split(/\s+/)[0];
  const highlights: string[] = [];

  if (profile.techStack.length) highlights.push(profile.techStack.slice(0, 5).join(', '));
  else if (profile.skills.length) highlights.push(profile.skills.slice(0, 5).join(', '));

  if (profile.experience[0]) {
    const snippet = profile.experience[0].slice(0, 80);
    highlights.push(snippet + (profile.experience[0].length > 80 ? '…' : ''));
  }

  const experienceLine = highlights.length
    ? `I've reviewed your resume. You have experience with ${highlights.join(', ')}.`
    : `I've reviewed your resume and background.`;

  const modeLine = codingModeId
    ? `Today's session is a ${CODING_INTERVIEW_MODES[codingModeId].label} interview.`
    : `Today's interview will focus on your technical skills, project experience, problem-solving, and communication.`;

  return `Welcome, ${firstName}. ${experienceLine} ${modeLine} I'll ask thoughtful follow-up questions based on what you share. Let's begin.`;
}
