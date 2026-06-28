import type { ResumeProfile } from './ResumeProfileService';
import type { CodingInterviewModeId } from '../../constants/codingInterviewModes';
import { CODING_INTERVIEW_MODES } from '../../constants/codingInterviewModes';
import {
  type InterviewLanguageCode,
  DEFAULT_INTERVIEW_LANGUAGE,
  normalizeInterviewLanguage,
  buildLocalizedWelcomeParts,
  buildLocalizedFirstQuestion,
  type WelcomeLocaleContext,
} from '../../constants/interviewLanguage';

export function formatFirstName(name?: string): string {
  const raw = (name || '').trim().split(/\s+/)[0];
  if (!raw) return '';
  if (raw.includes('@')) return '';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function toWelcomeContext(
  profile: ResumeProfile,
  options?: {
    codingModeId?: CodingInterviewModeId;
    interviewerName?: string;
    roleLabel?: string;
    companyName?: string | null;
    interviewLanguage?: InterviewLanguageCode;
  }
): WelcomeLocaleContext {
  return {
    interviewerName: options?.interviewerName ?? 'Ethan',
    companyName: options?.companyName,
    firstName: formatFirstName(profile.candidateName),
    positionTitle: profile.positionTitle,
    roleLabel: options?.roleLabel ?? 'technical',
    codingModeLabel: options?.codingModeId
      ? CODING_INTERVIEW_MODES[options.codingModeId].label.toLowerCase()
      : undefined,
  };
}

/**
 * Three spoken beats — localized by interviewLanguage when set.
 */
export function buildInterviewWelcomeParts(
  profile: ResumeProfile,
  options?: {
    codingModeId?: CodingInterviewModeId;
    interviewerName?: string;
    roleLabel?: string;
    companyName?: string | null;
    interviewLanguage?: InterviewLanguageCode | string;
  }
): string[] {
  const lang = normalizeInterviewLanguage(options?.interviewLanguage ?? DEFAULT_INTERVIEW_LANGUAGE);
  const ctx = toWelcomeContext(profile, { ...options, interviewLanguage: lang });
  return buildLocalizedWelcomeParts(lang, ctx);
}

/** Full intro as one string (for logs / fallback display). */
export function buildInterviewWelcome(
  profile: ResumeProfile,
  options?: {
    codingModeId?: CodingInterviewModeId;
    interviewerName?: string;
    roleLabel?: string;
    companyName?: string | null;
    interviewLanguage?: InterviewLanguageCode | string;
  }
): string {
  return buildInterviewWelcomeParts(profile, options).join(' ');
}

/** First question AFTER the spoken intro — warm and human, localized. */
export function buildFirstWarmUpQuestion(input: {
  candidateName?: string;
  positionTitle?: string;
  roleLabel?: string;
  codingModeId?: CodingInterviewModeId;
  interviewLanguage?: InterviewLanguageCode | string;
}): string {
  const lang = normalizeInterviewLanguage(input.interviewLanguage ?? DEFAULT_INTERVIEW_LANGUAGE);
  const ctx: WelcomeLocaleContext = {
    interviewerName: 'Ethan',
    firstName: formatFirstName(input.candidateName),
    positionTitle: input.positionTitle,
    roleLabel: input.roleLabel ?? 'technical',
    codingModeLabel: input.codingModeId
      ? CODING_INTERVIEW_MODES[input.codingModeId].label.toLowerCase()
      : undefined,
  };
  return buildLocalizedFirstQuestion(lang, ctx);
}
