/**
 * EmailJS mail provider (Gmail personal service via EmailJS REST API).
 * Docs: https://www.emailjs.com/docs/rest-api/send/
 *
 * Template must include:
 *   To: {{to_email}}
 *   Subject: {{subject}}
 *   Body (HTML): {{{message_html}}}
 *   Optional Reply-To: {{reply_to}}
 */
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

const EMAILJS_SEND_URL = 'https://api.emailjs.com/api/v1.0/email/send';
const EMAILJS_SEND_TIMEOUT_MS = 20_000;

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

export function isEmailJsConfigured(): boolean {
  return Boolean(
    config.mail.emailjs.serviceId &&
      config.mail.emailjs.templateId &&
      config.mail.emailjs.publicKey
  );
}

export async function verifyEmailJsConnection(): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailJsConfigured()) {
    return {
      ok: false,
      error:
        'EmailJS not configured. Set EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY.',
    };
  }
  return { ok: true };
}

export async function sendViaEmailJs(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<{ sent: boolean; error?: string }> {
  if (!isEmailJsConfigured()) {
    console.error('[Mail/EmailJS] Not configured — missing EMAILJS_SERVICE_ID / TEMPLATE_ID / PUBLIC_KEY');
    return {
      sent: false,
      error:
        'EmailJS not configured. Set EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY.',
    };
  }

  console.info(
    `[Mail/EmailJS] Sending… to=${input.to} subject="${input.subject}" service=${config.mail.emailjs.serviceId} template=${config.mail.emailjs.templateId}`
  );

  const payload: Record<string, unknown> = {
    service_id: config.mail.emailjs.serviceId,
    template_id: config.mail.emailjs.templateId,
    user_id: config.mail.emailjs.publicKey,
    template_params: {
      to_email: input.to,
      subject: input.subject,
      message_html: input.html,
      message: input.text,
      reply_to: input.replyTo || config.mail.replyTo || '',
      from_name: config.mail.emailjs.fromName || 'Intervion',
    },
  };

  if (config.mail.emailjs.privateKey) {
    payload.accessToken = config.mail.emailjs.privateKey;
  }

  try {
    const response = await withTimeout(
      fetch(EMAILJS_SEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      EMAILJS_SEND_TIMEOUT_MS,
      'EmailJS send'
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      const error = `EmailJS ${response.status}: ${errText || response.statusText}`;
      console.error(`[Mail/EmailJS] FAILED to=${input.to} — ${error}`);
      return { sent: false, error };
    }

    console.info(`[Mail/EmailJS] SENT OK → ${input.to} | ${input.subject}`);
    return { sent: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : 'EmailJS send failed';
    console.error(`[Mail/EmailJS] FAILED to=${input.to} — ${err}`);
    return { sent: false, error: err };
  }
}

export async function sendInterviewScheduleViaEmailJs(input: {
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

  const result = await sendViaEmailJs({ to: input.to, subject, html, text });
  if (result.sent) {
    console.info(`[Mail/EmailJS] Interview email sent to ${input.to}`);
  }
  return result;
}

export async function sendPasswordResetViaEmailJs(input: {
  to: string;
  code: string;
  resetLink?: string;
}): Promise<{ sent: boolean; error?: string }> {
  const subject = `Your password reset code — Intervion`;
  const html = passwordResetHtml(input.code, input.resetLink);
  const text = passwordResetText(input.code, input.resetLink);
  const result = await sendViaEmailJs({ to: input.to, subject, html, text });
  if (result.sent) {
    console.info(`[Mail/EmailJS] Password reset email sent to ${input.to}`);
  }
  return result;
}

export async function sendContactAdminNotificationViaEmailJs(input: {
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
}): Promise<{ sent: boolean; error?: string }> {
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

  const result = await sendViaEmailJs({
    to: input.to,
    subject,
    html,
    text,
    replyTo: input.submission.email,
  });
  if (result.sent) {
    console.info(`[Mail/EmailJS] Contact admin notification sent to ${input.to}`);
  }
  return result;
}

export async function sendContactAutoReplyViaEmailJs(input: {
  to: string;
  name: string;
}): Promise<{ sent: boolean; error?: string }> {
  const subject = `We received your message — Intervion`;
  const html = contactAutoReplyHtml(input.name);
  const text = contactAutoReplyText(input.name);
  const result = await sendViaEmailJs({ to: input.to, subject, html, text });
  if (result.sent) {
    console.info(`[Mail/EmailJS] Contact auto-reply sent to ${input.to}`);
  }
  return result;
}

export async function sendApplicationReceivedViaEmailJs(input: {
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
  const result = await sendViaEmailJs({ to: input.to, subject, html, text });
  if (result.sent) {
    console.info(`[Mail/EmailJS] Application received email sent to ${input.to}`);
  }
  return result;
}

export async function sendCandidateWelcomeViaEmailJs(input: {
  to: string;
  candidateName?: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const dashboardUrl = `${config.frontendUrl.replace(/\/$/, '')}/candidate/dashboard`;
  const subject = `Welcome to Intervion`;
  const html = candidateWelcomeHtml({
    candidateName: input.candidateName,
    dashboardUrl,
  });
  const text = candidateWelcomeText({
    candidateName: input.candidateName,
    dashboardUrl,
  });
  const result = await sendViaEmailJs({ to: input.to, subject, html, text });
  if (result.sent) {
    console.info(`[Mail/EmailJS] Welcome email sent to ${input.to}`);
  }
  return result;
}
