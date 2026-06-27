import nodemailer from 'nodemailer';
import { config } from '../config';
import {
  interviewScheduleHtml,
  interviewScheduleText,
  passwordResetHtml,
  passwordResetText,
} from './emailTemplates';
import {
  isResendConfigured,
  sendInterviewScheduleViaResend,
  sendPasswordResetViaResend,
  verifyResendConnection,
} from './resendMail.service';

function normalizeMailSecret(value: string): string {
  return value.trim().replace(/\s+/g, '');
}

const SMTP_CONNECT_TIMEOUT_MS = 12_000;
const SMTP_VERIFY_TIMEOUT_MS = 10_000;
const SMTP_SEND_TIMEOUT_MS = 25_000;

function smtpTransportOptions(auth: { user: string; pass: string }) {
  return {
    auth,
    connectionTimeout: SMTP_CONNECT_TIMEOUT_MS,
    greetingTimeout: SMTP_CONNECT_TIMEOUT_MS,
    socketTimeout: SMTP_SEND_TIMEOUT_MS,
  };
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

function isSmtpConfigured(): boolean {
  const user = config.mail.user;
  const pass = config.mail.pass;
  const hasAuth = Boolean(user && pass);
  const explicitService = config.mail.service;
  const host = config.mail.host;
  const inferredGmailService =
    !explicitService && !host && hasAuth && user.toLowerCase().endsWith('@gmail.com');
  return hasAuth && Boolean(explicitService || host || inferredGmailService);
}

/** Whether any mail provider is configured. */
export function isMailConfigured(): boolean {
  if (config.mail.provider === 'resend') return isResendConfigured();
  return isSmtpConfigured() || isResendConfigured();
}

function getTransporter(): nodemailer.Transporter | null {
  const user = config.mail.user.trim();
  const pass = normalizeMailSecret(config.mail.pass);
  const hasAuth = Boolean(user && pass);
  const explicitService = config.mail.service;
  const host = config.mail.host;
  const inferredGmailService =
    !explicitService && !host && hasAuth && user.toLowerCase().endsWith('@gmail.com');
  const effectiveService = explicitService || (inferredGmailService ? 'gmail' : '');

  if (!hasAuth || (!effectiveService && !host)) {
    return null;
  }

  return nodemailer.createTransport(
    effectiveService
      ? {
          service: effectiveService,
          ...smtpTransportOptions({ user, pass }),
        }
      : {
          host,
          port: config.mail.port,
          secure: config.mail.secure,
          ...smtpTransportOptions({ user, pass }),
          ...(config.mail.secure
            ? {}
            : {
                requireTLS: true,
                tls: { minVersion: 'TLSv1.2' as const },
              }),
        }
  );
}

export async function verifyMailConnection(): Promise<{ ok: boolean; error?: string }> {
  if (config.mail.provider === 'resend' || isResendConfigured()) {
    return verifyResendConnection();
  }

  if (!isSmtpConfigured()) {
    return {
      ok: false,
      error:
        'Mail not configured. Set RESEND_API_KEY (recommended) or SMTP vars (MAIL_SERVICE, MAIL_USER, MAIL_PASS).',
    };
  }

  const tx = getTransporter();
  if (!tx) {
    return { ok: false, error: 'Mail transporter could not be created.' };
  }

  try {
    await withTimeout(tx.verify(), SMTP_VERIFY_TIMEOUT_MS, 'SMTP verify');
    return { ok: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : 'SMTP verify failed';
    return { ok: false, error: err };
  }
}

export function getMailStatus() {
  const useResend = config.mail.provider === 'resend' || isResendConfigured();
  return {
    configured: isMailConfigured(),
    provider: useResend ? 'resend' : isSmtpConfigured() ? 'smtp' : 'none',
    from: useResend ? config.mail.resendFrom : config.mail.from,
    service: useResend ? 'resend' : config.mail.service || (config.mail.host ? 'custom-smtp' : ''),
    host: config.mail.host || undefined,
    port: config.mail.port,
    user: config.mail.user ? `${config.mail.user.slice(0, 3)}***` : '',
  };
}

async function sendViaSmtp(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ sent: boolean; error?: string }> {
  const tx = getTransporter();
  if (!tx) {
    const err =
      'SMTP not configured. Set MAIL_SERVICE + MAIL_USER + MAIL_PASS, or use RESEND_API_KEY.';
    console.warn(`[Mail] ${err}`);
    return { sent: false, error: err };
  }

  await withTimeout(
    tx.sendMail({
      from: config.mail.from,
      to: input.to,
      replyTo: config.mail.replyTo || undefined,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
    SMTP_SEND_TIMEOUT_MS,
    'SMTP send'
  );

  return { sent: true };
}

export async function sendInterviewScheduleEmail(input: {
  to: string;
  candidateName?: string | null;
  recruiterName?: string | null;
  role: string;
  scheduledAt: string;
  joinUrl: string;
  message?: string;
}): Promise<{ sent: boolean; error?: string }> {
  try {
    if (config.mail.provider === 'resend' || isResendConfigured()) {
      return sendInterviewScheduleViaResend(input);
    }

    const scheduledAtText = new Date(input.scheduledAt).toLocaleString();
    const subject = `Your interview is scheduled — ${input.role}`;
    const html = interviewScheduleHtml({
      candidateName: input.candidateName,
      recruiterName: input.recruiterName,
      role: input.role,
      scheduledAt: scheduledAtText,
      joinUrl: input.joinUrl,
      message: input.message,
    });
    const text = interviewScheduleText({
      candidateName: input.candidateName,
      recruiterName: input.recruiterName,
      role: input.role,
      scheduledAt: scheduledAtText,
      joinUrl: input.joinUrl,
      message: input.message,
    });

    const result = await sendViaSmtp({ to: input.to, subject, html, text });
    if (result.sent) {
      console.info(`[Mail/SMTP] Interview email sent to ${input.to} from ${config.mail.from}`);
    }
    return result;
  } catch (e) {
    const err = e instanceof Error ? e.message : 'Unknown mail error';
    console.error('[Mail] Failed to send interview email:', err);
    return { sent: false, error: err };
  }
}

export async function sendPasswordResetEmail(input: {
  to: string;
  code: string;
  resetLink?: string;
}): Promise<{ sent: boolean; error?: string }> {
  try {
    if (config.mail.provider === 'resend' || isResendConfigured()) {
      return sendPasswordResetViaResend(input);
    }

    const subject = 'Your password reset code — Intervion';
    const html = passwordResetHtml(input.code, input.resetLink);
    const text = passwordResetText(input.code, input.resetLink);

    const result = await sendViaSmtp({ to: input.to, subject, html, text });
    if (result.sent) {
      console.info(`[Mail/SMTP] Password reset email sent to ${input.to} from ${config.mail.from}`);
    }
    return result;
  } catch (e) {
    const err = e instanceof Error ? e.message : 'Unknown mail error';
    console.error('[Mail] Failed to send password reset email:', err);
    return { sent: false, error: err };
  }
}
