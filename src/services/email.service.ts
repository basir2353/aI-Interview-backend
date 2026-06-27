import nodemailer from 'nodemailer';
import { config } from '../config';
import { passwordResetHtml, interviewScheduleHtml } from './emailTemplates';

function normalizeMailSecret(value: string): string {
  return value.trim().replace(/\s+/g, '');
}

/** Whether SMTP auth + service/host are present in env. */
export function isMailConfigured(): boolean {
  const user = config.mail.user;
  const pass = config.mail.pass;
  const hasAuth = Boolean(user && pass);
  const explicitService = config.mail.service;
  const host = config.mail.host;
  const inferredGmailService =
    !explicitService && !host && hasAuth && user.toLowerCase().endsWith('@gmail.com');
  return hasAuth && Boolean(explicitService || host || inferredGmailService);
}

/** Build transporter from current config (no stale cache — restart after env changes). */
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
          auth: { user, pass },
        }
      : {
          host,
          port: config.mail.port,
          secure: config.mail.secure,
          auth: { user, pass },
          ...(config.mail.secure
            ? {}
            : {
                requireTLS: true,
                tls: { minVersion: 'TLSv1.2' as const },
              }),
        }
  );
}

/** Verify SMTP credentials at startup (Railway / production). */
export async function verifyMailConnection(): Promise<{ ok: boolean; error?: string }> {
  if (!isMailConfigured()) {
    return {
      ok: false,
      error:
        'Mail not configured. Set MAIL_SERVICE (or MAIL_HOST), MAIL_USER, MAIL_PASS, and MAIL_FROM.',
    };
  }

  const tx = getTransporter();
  if (!tx) {
    return { ok: false, error: 'Mail transporter could not be created.' };
  }

  try {
    await tx.verify();
    return { ok: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : 'SMTP verify failed';
    return { ok: false, error: err };
  }
}

export function getMailStatus() {
  return {
    configured: isMailConfigured(),
    from: config.mail.from,
    service: config.mail.service || (config.mail.host ? 'custom-smtp' : ''),
    host: config.mail.host || undefined,
    port: config.mail.port,
    user: config.mail.user ? `${config.mail.user.slice(0, 3)}***` : '',
  };
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
    const tx = getTransporter();
    if (!tx) {
      const err =
        'Mail is not configured. Set either (MAIL_SERVICE + MAIL_USER + MAIL_PASS) or (MAIL_HOST + MAIL_PORT + MAIL_USER + MAIL_PASS).';
      console.warn(`[Mail] ${err}`);
      return { sent: false, error: err };
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

    await tx.sendMail({
      from: config.mail.from,
      to: input.to,
      replyTo: config.mail.replyTo || undefined,
      subject,
      text: `Your interview is scheduled.\n\nRole: ${input.role}\nScheduled at: ${scheduledAtText}\n${input.recruiterName ? `Recruiter: ${input.recruiterName}\n` : ''}${input.message ? `\nMessage from recruiter:\n${input.message}\n` : ''}\nJoin interview: ${input.joinUrl}\n`,
      html,
    });
    console.info(`[Mail] Interview email sent to ${input.to} from ${config.mail.from}`);

    return { sent: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : 'Unknown mail error';
    console.error('[Mail] Failed to send interview email:', err);
    return { sent: false, error: err };
  }
}

/**
 * Send password reset code to the user (candidate or recruiter).
 */
export async function sendPasswordResetEmail(input: {
  to: string;
  code: string;
  resetLink?: string;
}): Promise<{ sent: boolean; error?: string }> {
  try {
    const tx = getTransporter();
    if (!tx) {
      const err =
        'Mail is not configured. Set either (MAIL_SERVICE + MAIL_USER + MAIL_PASS) or (MAIL_HOST + MAIL_PORT + MAIL_USER + MAIL_PASS).';
      console.warn(`[Mail] ${err}`);
      return { sent: false, error: err };
    }

    const subject = 'Your password reset code — AI Interviewer';
    const html = passwordResetHtml(input.code, input.resetLink);

    await tx.sendMail({
      from: config.mail.from,
      to: input.to,
      replyTo: config.mail.replyTo || undefined,
      subject,
      text: `Your password reset code: ${input.code}\n\nEnter it on the reset password page. The code expires in 15 minutes.\n${input.resetLink ? `Reset link: ${input.resetLink}\n` : ''}\nIf you did not request this, ignore this email.`,
      html,
    });
    console.info(`[Mail] Password reset email sent to ${input.to} from ${config.mail.from}`);
    return { sent: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : 'Unknown mail error';
    console.error('[Mail] Failed to send password reset email:', err);
    return { sent: false, error: err };
  }
}
