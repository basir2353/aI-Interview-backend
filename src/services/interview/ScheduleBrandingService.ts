import { query } from '../../db/client';
import {
  normalizeInterviewerPersona,
  type InterviewerPersona,
} from '../../constants/interviewerPersona';

export type ScheduleBranding = {
  interviewerPersona: InterviewerPersona;
  companyName?: string;
};

export async function resolveScheduleBranding(input: {
  scheduleInterviewerPersona?: string | null;
  scheduleCompanyName?: string | null;
  createdBy?: string | null;
  positionId?: string | null;
}): Promise<ScheduleBranding> {
  let interviewerPersona = normalizeInterviewerPersona(input.scheduleInterviewerPersona);
  let companyName = input.scheduleCompanyName?.trim() || undefined;

  if (input.createdBy) {
    const { rows } = await query<{ company_name: string | null; interviewer_persona: string | null }>(
      `SELECT company_name, interviewer_persona FROM users WHERE id = $1 LIMIT 1`,
      [input.createdBy]
    );
    const recruiter = rows[0];
    if (recruiter) {
      if (!input.scheduleInterviewerPersona) {
        interviewerPersona = normalizeInterviewerPersona(recruiter.interviewer_persona);
      }
      if (!companyName && recruiter.company_name?.trim()) {
        companyName = recruiter.company_name.trim();
      }
    }
  }

  if (!companyName && input.positionId) {
    const { rows } = await query<{ company_name: string | null }>(
      `SELECT company_name FROM positions WHERE id = $1 LIMIT 1`,
      [input.positionId]
    );
    if (rows[0]?.company_name?.trim()) {
      companyName = rows[0].company_name.trim();
    }
  }

  return { interviewerPersona, companyName };
}

export async function resolveBrandingForInterview(interviewId: string): Promise<ScheduleBranding | null> {
  const { rows } = await query<{
    interviewer_persona: string | null;
    company_name: string | null;
    created_by: string | null;
    position_id: string | null;
  }>(
    `SELECT interviewer_persona, company_name, created_by, position_id
     FROM scheduled_interviews WHERE interview_id = $1 LIMIT 1`,
    [interviewId]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return resolveScheduleBranding({
    scheduleInterviewerPersona: row.interviewer_persona,
    scheduleCompanyName: row.company_name,
    createdBy: row.created_by,
    positionId: row.position_id,
  });
}
