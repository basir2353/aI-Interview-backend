import { Resend } from 'resend';
import { config } from '../config';
import {
  interviewScheduleHtml,
  interviewScheduleText,
  passwordResetHtml,
  passwordResetText,
} from './emailTemplates';

const RESEND_SEND_TIMEOUT_MS = 15_000;

function getResendClient(): Resend | null {
  if (!config.mail.resendApiKey) return null;
  return new Resend(config.mail.resendApiKey);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function isResendConfigured(): boolean {
  return Boolean(config.mail.resendApiKey);
}

export async function verifyResendConnection(): Promise<{ ok: boolean; error?: string }> {
  if (!isResendConfigured()) {
    return { ok: false, error: 'RESEND_API_KEY is not set.' };
  }
  // Resend has no SMTP-style verify — key presence is enough; send path validates on first email.
  return { ok: true };
}

export async function sendViaResend(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ sent: boolean; error?: string; id?: string }> {
  const resend = getResendClient();
  if (!resend) {
    return { sent: false, error: 'RESEND_API_KEY is not set.' };
  }

  try {
    const result = await withTimeout(
      resend.emails.send({
        from: config.mail.resendFrom,
        to: input.to,
        replyTo: config.mail.replyTo || undefined,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      RESEND_SEND_TIMEOUT_MS,
      'Resend send'
    );

    if (result.error) {
      return { sent: false, error: result.error.message };
    }

    return { sent: true, id: result.data?.id };
  } catch (e) {
    const err = e instanceof Error ? e.message : 'Resend send failed';
    return { sent: false, error: err };
  }
}

export async function sendInterviewScheduleViaResend(input: {
  to: string;
  candidateName?: string | null;
  recruiterName?: string | null;
  role: string;
  scheduledAt: string;
  joinUrl: string;
  message?: string;
  companyName?: string | null;
  jobTitle?: string | null;
  durationMinutes?: number | null;
}): Promise<{ sent: boolean; error?: string }> {
  const scheduledAtText = new Date(input.scheduledAt).toLocaleString();
  const subject = `Interview invitation — ${input.jobTitle?.trim() || input.role}`;
  const html = interviewScheduleHtml({
    candidateName: input.candidateName,
    recruiterName: input.recruiterName,
    role: input.role,
    scheduledAt: scheduledAtText,
    joinUrl: input.joinUrl,
    message: input.message,
    companyName: input.companyName,
    jobTitle: input.jobTitle,
    durationMinutes: input.durationMinutes,
  });
  const text = interviewScheduleText({
    candidateName: input.candidateName,
    recruiterName: input.recruiterName,
    role: input.role,
    scheduledAt: scheduledAtText,
    joinUrl: input.joinUrl,
    message: input.message,
    companyName: input.companyName,
    jobTitle: input.jobTitle,
    durationMinutes: input.durationMinutes,
  });

  const result = await sendViaResend({ to: input.to, subject, html, text });
  if (result.sent) {
    console.info(`[Mail/Resend] Interview email sent to ${input.to} (id: ${result.id ?? 'n/a'})`);
  }
  return result;
}

export async function sendPasswordResetViaResend(input: {
  to: string;
  code: string;
  resetLink?: string;
}): Promise<{ sent: boolean; error?: string }> {
  const subject = `Your password reset code — Intervion`;
  const html = passwordResetHtml(input.code, input.resetLink);
  const text = passwordResetText(input.code, input.resetLink);

  const result = await sendViaResend({ to: input.to, subject, html, text });
  if (result.sent) {
    console.info(`[Mail/Resend] Password reset email sent to ${input.to} (id: ${result.id ?? 'n/a'})`);
  }
  return result;
}
