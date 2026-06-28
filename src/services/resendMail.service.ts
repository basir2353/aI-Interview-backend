import { Resend } from 'resend';
import { config } from '../config';
import {
  interviewScheduleHtml,
  interviewScheduleText,
  passwordResetHtml,
  passwordResetText,
  contactAdminNotificationHtml,
  contactAdminNotificationText,
  contactAutoReplyHtml,
  contactAutoReplyText,
  applicationReceivedHtml,
  applicationReceivedText,
  candidateWelcomeHtml,
  candidateWelcomeText,
} from './emailTemplates';

const RESEND_SEND_TIMEOUT_MS = 15_000;

export function getResendClient(): Resend | null {
  if (!config.mail.resendApiKey) return null;
  return new Resend(config.mail.resendApiKey);
}

export function verifyResendWebhook(
  payload: unknown,
  headers: Record<string, string | string[] | undefined>
): Record<string, unknown> {
  const resend = getResendClient();
  if (!resend) throw new Error('Resend not configured');
  const webhookSecret = config.contact.resendWebhookSecret;
  if (!webhookSecret) return payload as Record<string, unknown>;
  return resend.webhooks.verify({
    payload: JSON.stringify(payload),
    headers: {
      id: String(headers['svix-id'] || ''),
      timestamp: String(headers['svix-timestamp'] || ''),
      signature: String(headers['svix-signature'] || ''),
    },
    webhookSecret,
  }) as unknown as Record<string, unknown>;
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
  replyTo?: string;
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
        replyTo: input.replyTo || config.mail.replyTo || undefined,
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

export async function fetchResendReceivedEmail(emailId: string): Promise<Record<string, unknown> | null> {
  const resend = getResendClient();
  if (!resend) return null;

  try {
    const result = await withTimeout(
      resend.emails.receiving.get(emailId),
      RESEND_SEND_TIMEOUT_MS,
      'Resend receiving.get'
    );
    if (result.error) {
      console.error('[Mail/Resend] receiving.get error:', result.error.message);
      return null;
    }
    return (result.data ?? null) as unknown as Record<string, unknown> | null;
  } catch (e) {
    console.error('[Mail/Resend] receiving.get failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function listResendReceivedEmails(): Promise<Array<{ id?: string; email_id?: string }>> {
  const resend = getResendClient();
  if (!resend) return [];

  try {
    const result = await withTimeout(
      resend.emails.receiving.list(),
      RESEND_SEND_TIMEOUT_MS,
      'Resend receiving.list'
    );
    if (result.error) {
      console.error('[Mail/Resend] receiving.list error:', result.error.message);
      return [];
    }
    const data = result.data as { data?: Array<{ id?: string; email_id?: string }> } | Array<{ id?: string; email_id?: string }> | null;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.data)) return data.data;
    return [];
  } catch (e) {
    console.error('[Mail/Resend] receiving.list failed:', e instanceof Error ? e.message : e);
    return [];
  }
}

export async function sendContactAdminNotificationViaResend(input: {
  to: string;
  submission: {
    name: string | null;
    email: string;
    company: string | null;
    subject: string | null;
    message: string;
    source: string;
    id: string;
  };
}): Promise<{ sent: boolean; error?: string; id?: string }> {
  const adminUrl = `${config.frontendUrl.replace(/\/$/, '')}/admin/contact`;
  const subject = `New contact: ${input.submission.subject || input.submission.name || input.submission.email}`;
  const html = contactAdminNotificationHtml({
    name: input.submission.name || '—',
    email: input.submission.email,
    company: input.submission.company,
    subject: input.submission.subject,
    message: input.submission.message,
    source: input.submission.source,
    adminUrl,
  });
  const text = contactAdminNotificationText({
    name: input.submission.name || '—',
    email: input.submission.email,
    company: input.submission.company,
    subject: input.submission.subject,
    message: input.submission.message,
    source: input.submission.source,
    adminUrl,
  });

  const result = await sendViaResend({
    to: input.to,
    subject,
    html,
    text,
    replyTo: input.submission.email,
  });
  if (result.sent) {
    console.info(`[Mail/Resend] Contact admin notification sent to ${input.to}`);
  }
  return result;
}

export async function sendContactAutoReplyViaResend(input: {
  to: string;
  name: string;
}): Promise<{ sent: boolean; error?: string }> {
  const subject = `We received your message — Intervion`;
  const html = contactAutoReplyHtml(input.name);
  const text = contactAutoReplyText(input.name);
  const result = await sendViaResend({ to: input.to, subject, html, text });
  if (result.sent) {
    console.info(`[Mail/Resend] Contact auto-reply sent to ${input.to}`);
  }
  return result;
}

export async function sendApplicationReceivedViaResend(input: {
  to: string;
  candidateName?: string | null;
  jobTitle: string;
  companyName?: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const dashboardUrl = `${config.frontendUrl.replace(/\/$/, '')}/candidate/applications`;
  const subject = `Application received — ${input.jobTitle}`;
  const html = applicationReceivedHtml({
    candidateName: input.candidateName,
    jobTitle: input.jobTitle,
    companyName: input.companyName,
    dashboardUrl,
  });
  const text = applicationReceivedText({
    candidateName: input.candidateName,
    jobTitle: input.jobTitle,
    companyName: input.companyName,
    dashboardUrl,
  });
  const result = await sendViaResend({ to: input.to, subject, html, text });
  if (result.sent) {
    console.info(`[Mail/Resend] Application received email sent to ${input.to}`);
  }
  return result;
}

export async function sendCandidateWelcomeViaResend(input: {
  to: string;
  candidateName?: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const dashboardUrl = `${config.frontendUrl.replace(/\/$/, '')}/candidate/dashboard`;
  const subject = `Welcome to Intervion`;
  const html = candidateWelcomeHtml({ candidateName: input.candidateName, dashboardUrl });
  const text = candidateWelcomeText({ candidateName: input.candidateName, dashboardUrl });
  const result = await sendViaResend({ to: input.to, subject, html, text });
  if (result.sent) {
    console.info(`[Mail/Resend] Welcome email sent to ${input.to}`);
  }
  return result;
}
