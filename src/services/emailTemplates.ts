/**
 * Intervion HTML email templates — inline styles for email client compatibility.
 * Design: blue-violet gradient header, detail table, preparation checklist.
 */

import { config } from '../config/index.js';

const BRAND = {
  name: 'Intervion',
  product: 'Intervion AI Interviews',
  tagline: 'Smart, bias-aware AI interviews',
  gradientStart: '#2563eb',
  gradientEnd: '#7c3aed',
  accent: '#2563eb',
  accentSoft: '#eef4ff',
  text: '#374151',
  textDark: '#111827',
  textMuted: '#6b7280',
  bg: '#f4f7fb',
  cardBg: '#ffffff',
  border: '#e5e7eb',
  noteBg: '#fff8e7',
  noteText: '#8a6d3b',
  footerBg: '#f9fafb',
  fontFamily: "Arial, Helvetica, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  year: new Date().getFullYear(),
};

function brandLogoUrl(variant: 'light' | 'dark' = 'light'): string {
  const base = config.frontendUrl.replace(/\/$/, '');
  return `${base}/${variant === 'light' ? 'white_logo.png' : 'dark_logo.png'}`;
}

const DEFAULT_DURATION_MINUTES = 30;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    technical: 'Technical Interview',
    behavioral: 'Behavioral Interview',
    sales: 'Sales Interview',
    customer_success: 'Customer Success Interview',
  };
  const key = role.toLowerCase().replace(/\s+/g, '_');
  return labels[key] ?? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function detailRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid ${BRAND.border};color:${BRAND.textMuted};font-weight:bold;font-size:14px;width:42%;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:12px 0;border-bottom:1px solid ${BRAND.border};color:${BRAND.textDark};font-size:14px;vertical-align:top;">${escapeHtml(value)}</td>
    </tr>`;
}

function emailShell(title: string, bodyHtml: string, footerCompany?: string): string {
  const company = footerCompany?.trim() || BRAND.name;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:${BRAND.fontFamily};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${BRAND.cardBg};border-radius:16px;overflow:hidden;box-shadow:0 10px 35px rgba(0,0,0,0.08);">
          ${bodyHtml}
          <tr>
            <td style="padding:28px 32px;text-align:center;background:${BRAND.footerBg};font-size:13px;color:${BRAND.textMuted};line-height:1.6;">
              <img src="${brandLogoUrl('dark')}" alt="${escapeHtml(BRAND.name)}" width="120" style="display:block;margin:0 auto 16px;max-width:120px;height:auto;border:0;" />
              &copy; ${BRAND.year} ${escapeHtml(company)}. All rights reserved.<br /><br />
              Powered by <strong style="color:${BRAND.textDark};">${BRAND.product}</strong><br />
              <span style="font-size:12px;color:${BRAND.textMuted};">${BRAND.tagline}</span>
            </td>
          </tr>
        </table>
        <p style="margin:20px 0 0;font-size:12px;color:${BRAND.textMuted};max-width:600px;">
          You received this email from ${BRAND.name}. If you did not expect this message, you can safely ignore it.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function gradientHeader(title: string, subtitle: string): string {
  return `
  <tr>
    <td style="padding:40px 32px;text-align:center;background:linear-gradient(135deg,${BRAND.gradientStart},${BRAND.gradientEnd});color:#ffffff;">
      <img src="${brandLogoUrl('light')}" alt="${escapeHtml(BRAND.name)}" width="160" style="display:block;margin:0 auto 20px;max-width:160px;height:auto;border:0;" />
      <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">${escapeHtml(title)}</h1>
      <p style="margin:10px 0 0;font-size:15px;color:rgba(255,255,255,0.92);">${escapeHtml(subtitle)}</p>
    </td>
  </tr>`;
}

function primaryButton(href: string, label: string): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0 8px;">
    <tr>
      <td align="center">
        <a href="${href}" style="display:inline-block;background:${BRAND.accent};color:#ffffff !important;text-decoration:none;padding:16px 36px;border-radius:10px;font-size:16px;font-weight:bold;box-shadow:0 4px 14px rgba(37,99,235,0.35);">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

export function interviewScheduleHtml(params: {
  candidateName?: string | null;
  recruiterName?: string | null;
  role: string;
  scheduledAt: string;
  joinUrl: string;
  message?: string;
  companyName?: string | null;
  jobTitle?: string | null;
  durationMinutes?: number | null;
}): string {
  const candidateName = params.candidateName?.trim() || 'Candidate';
  const companyName = params.companyName?.trim() || BRAND.name;
  const jobTitle = params.jobTitle?.trim() || formatRoleLabel(params.role);
  const interviewType = formatRoleLabel(params.role);
  const duration = params.durationMinutes && params.durationMinutes > 0 ? params.durationMinutes : DEFAULT_DURATION_MINUTES;
  const deadline = params.scheduledAt;
  const recruiterLine = params.recruiterName
    ? detailRow('Recruiter contact', params.recruiterName)
    : '';

  const messageBlock = params.message?.trim()
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;background:${BRAND.accentSoft};border-left:4px solid ${BRAND.accent};border-radius:8px;">
        <tr>
          <td style="padding:16px 18px;font-size:14px;color:${BRAND.text};line-height:1.65;">
            <strong style="color:${BRAND.textDark};">Message from your recruiter</strong><br /><br />
            ${escapeHtml(params.message).replace(/\n/g, '<br />')}
          </td>
        </tr>
      </table>`
    : '';

  const body = `
  ${gradientHeader('Interview Invitation', 'Your next opportunity starts here.')}
  <tr>
    <td style="padding:36px 40px;color:${BRAND.text};line-height:1.7;font-size:15px;">
      <h2 style="margin:0 0 16px;font-size:22px;color:${BRAND.textDark};font-weight:700;">Hello ${escapeHtml(candidateName)}, 👋</h2>
      <p style="margin:0 0 18px;">
        You have been invited to complete an AI-powered interview for the position below.
        Our intelligent interview assistant will guide you through the process and evaluate your responses in real time.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;background:${BRAND.accentSoft};border-left:4px solid ${BRAND.accent};border-radius:8px;">
        <tr>
          <td style="padding:18px 20px;font-size:14px;color:${BRAND.text};">
            <strong style="color:${BRAND.textDark};font-size:15px;">You're invited!</strong><br /><br />
            Complete your interview before the scheduled time to move forward in the hiring process.
          </td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 0;">
        ${detailRow('Position', jobTitle)}
        ${detailRow('Company', companyName)}
        ${detailRow('Interview type', interviewType)}
        ${detailRow('Estimated duration', `${duration} minutes`)}
        ${detailRow('Scheduled for', deadline)}
        ${recruiterLine}
      </table>

      ${messageBlock}

      ${primaryButton(params.joinUrl, 'Start Interview')}

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;background:${BRAND.noteBg};border-radius:8px;">
        <tr>
          <td style="padding:16px 18px;color:${BRAND.noteText};font-size:14px;line-height:1.65;">
            <strong style="color:${BRAND.noteText};">Before you begin:</strong>
            <ul style="margin:10px 0 0;padding-left:20px;">
              <li style="margin-bottom:6px;">Use a stable internet connection.</li>
              <li style="margin-bottom:6px;">Allow camera and microphone access when prompted.</li>
              <li style="margin-bottom:6px;">Complete the interview in one sitting.</li>
              <li style="margin-bottom:6px;">Choose a quiet, well-lit environment.</li>
              <li style="margin-bottom:0;">Keep your browser window open until you finish.</li>
            </ul>
          </td>
        </tr>
      </table>

      <p style="margin:24px 0 8px;font-size:14px;color:${BRAND.textMuted};">
        If the button above doesn't work, copy and paste this link into your browser:
      </p>
      <p style="margin:0 0 24px;font-size:13px;word-break:break-all;">
        <a href="${params.joinUrl}" style="color:${BRAND.accent};text-decoration:none;">${params.joinUrl}</a>
      </p>

      <p style="margin:0 0 8px;font-size:15px;color:${BRAND.text};">
        Good luck! We look forward to learning more about you.
      </p>
      <p style="margin:0;font-size:15px;color:${BRAND.textDark};">
        Best regards,<br />
        <strong>${escapeHtml(companyName)}</strong>
      </p>
    </td>
  </tr>`;

  return emailShell('Interview Invitation', body, companyName);
}

export function passwordResetHtml(code: string, resetLink?: string): string {
  const body = `
  ${gradientHeader('Password Reset', 'Secure access to your Intervion account')}
  <tr>
    <td style="padding:36px 40px;color:${BRAND.text};line-height:1.7;font-size:15px;">
      <h2 style="margin:0 0 16px;font-size:22px;color:${BRAND.textDark};font-weight:700;">Reset your password</h2>
      <p style="margin:0 0 20px;">
        We received a request to reset your password. Enter the verification code below on the reset page.
        This code expires in <strong>15 minutes</strong>.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:${BRAND.accentSoft};border:1px solid ${BRAND.border};border-radius:12px;">
        <tr>
          <td align="center" style="padding:24px;">
            <span style="font-size:32px;font-weight:700;letter-spacing:10px;color:${BRAND.gradientEnd};font-family:ui-monospace,Consolas,monospace;">${escapeHtml(code)}</span>
          </td>
        </tr>
      </table>

      ${resetLink ? primaryButton(resetLink, 'Reset Password') : ''}

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;background:${BRAND.noteBg};border-radius:8px;">
        <tr>
          <td style="padding:16px 18px;color:${BRAND.noteText};font-size:14px;">
            <strong>Didn't request this?</strong> You can safely ignore this email — your password will not be changed.
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

  return emailShell('Password Reset', body);
}

export function passwordResetText(code: string, resetLink?: string): string {
  return [
    `${BRAND.name} — Password reset`,
    '',
    `Your verification code: ${code}`,
    'This code expires in 15 minutes.',
    resetLink ? `Reset link: ${resetLink}` : '',
    '',
    "If you didn't request this, ignore this email.",
  ]
    .filter(Boolean)
    .join('\n');
}

export function interviewScheduleText(params: {
  candidateName?: string | null;
  recruiterName?: string | null;
  role: string;
  scheduledAt: string;
  joinUrl: string;
  message?: string;
  companyName?: string | null;
  jobTitle?: string | null;
  durationMinutes?: number | null;
}): string {
  const candidateName = params.candidateName?.trim() || 'Candidate';
  const companyName = params.companyName?.trim() || BRAND.name;
  const jobTitle = params.jobTitle?.trim() || formatRoleLabel(params.role);
  const duration = params.durationMinutes && params.durationMinutes > 0 ? params.durationMinutes : DEFAULT_DURATION_MINUTES;

  return [
    `${BRAND.name} — Interview Invitation`,
    '',
    `Hello ${candidateName},`,
    '',
    `You have been invited to an AI-powered interview.`,
    '',
    `Position: ${jobTitle}`,
    `Company: ${companyName}`,
    `Interview type: ${formatRoleLabel(params.role)}`,
    `Duration: ${duration} minutes`,
    `Scheduled for: ${params.scheduledAt}`,
    params.recruiterName ? `Recruiter: ${params.recruiterName}` : '',
    params.message ? `\nMessage from recruiter:\n${params.message}` : '',
    '',
    `Start interview: ${params.joinUrl}`,
    '',
    'Before you begin: stable internet, camera/mic access, quiet environment.',
    '',
    `Best regards,\n${companyName}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function contactAdminNotificationHtml(params: {
  name: string;
  email: string;
  company?: string | null;
  subject?: string | null;
  message: string;
  source: string;
  adminUrl: string;
}): string {
  const body = `
  ${gradientHeader('New contact message', params.source === 'resend_inbound' ? 'Inbound email via Resend' : 'Website contact form')}
  <tr>
    <td style="padding:36px 40px;color:${BRAND.text};line-height:1.7;font-size:15px;">
      <h2 style="margin:0 0 16px;font-size:22px;color:${BRAND.textDark};font-weight:700;">Someone reached out</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 0;">
        ${detailRow('Name', params.name || '—')}
        ${detailRow('Email', params.email)}
        ${params.company ? detailRow('Company', params.company) : ''}
        ${detailRow('Subject', params.subject || '—')}
        ${detailRow('Source', params.source === 'resend_inbound' ? 'Resend inbound' : 'Contact form')}
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;background:${BRAND.accentSoft};border-left:4px solid ${BRAND.accent};border-radius:8px;">
        <tr>
          <td style="padding:18px 20px;font-size:14px;color:${BRAND.text};line-height:1.65;white-space:pre-wrap;">${escapeHtml(params.message)}</td>
        </tr>
      </table>
      ${primaryButton(params.adminUrl, 'View in admin panel')}
    </td>
  </tr>`;
  return emailShell('New contact message', body);
}

export function contactAdminNotificationText(params: {
  name: string;
  email: string;
  company?: string | null;
  subject?: string | null;
  message: string;
  source: string;
  adminUrl: string;
}): string {
  return [
    `${BRAND.name} — New contact message`,
    '',
    `Name: ${params.name || '—'}`,
    `Email: ${params.email}`,
    params.company ? `Company: ${params.company}` : '',
    `Subject: ${params.subject || '—'}`,
    `Source: ${params.source}`,
    '',
    params.message,
    '',
    `Admin panel: ${params.adminUrl}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function contactAutoReplyHtml(name: string): string {
  const greeting = name.trim() ? `Hi ${escapeHtml(name.trim())},` : 'Hello,';
  const body = `
  ${gradientHeader('Thanks for contacting us', 'We received your message')}
  <tr>
    <td style="padding:36px 40px;color:${BRAND.text};line-height:1.7;font-size:15px;">
      <h2 style="margin:0 0 16px;font-size:22px;color:${BRAND.textDark};font-weight:700;">${greeting}</h2>
      <p style="margin:0 0 18px;">
        Thank you for reaching out to ${BRAND.name}. Our team has received your message and will get back to you shortly.
      </p>
      <p style="margin:0;font-size:15px;color:${BRAND.textDark};">
        Best regards,<br />
        <strong>The ${BRAND.name} team</strong>
      </p>
    </td>
  </tr>`;
  return emailShell('Message received', body);
}

export function contactAutoReplyText(name: string): string {
  const greeting = name.trim() ? `Hi ${name.trim()},` : 'Hello,';
  return [
    `${BRAND.name} — Message received`,
    '',
    greeting,
    '',
    `Thank you for contacting ${BRAND.name}. We received your message and will reply soon.`,
    '',
    `— The ${BRAND.name} team`,
  ].join('\n');
}

export function applicationReceivedHtml(params: {
  candidateName?: string | null;
  jobTitle: string;
  companyName?: string | null;
  dashboardUrl: string;
}): string {
  const name = params.candidateName?.trim() || 'there';
  const company = params.companyName?.trim() || BRAND.name;
  const body = `
  ${gradientHeader('Application received', 'We got your application')}
  <tr>
    <td style="padding:36px 40px;color:${BRAND.text};line-height:1.7;font-size:15px;">
      <h2 style="margin:0 0 16px;font-size:22px;color:${BRAND.textDark};font-weight:700;">Hi ${escapeHtml(name)}, 👋</h2>
      <p style="margin:0 0 18px;">
        Thank you for applying. We have received your application and the hiring team will review it soon.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 0;">
        ${detailRow('Role', params.jobTitle)}
        ${detailRow('Company', company)}
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0;background:${BRAND.accentSoft};border-left:4px solid ${BRAND.accent};border-radius:8px;">
        <tr>
          <td style="padding:18px 20px;font-size:14px;color:${BRAND.text};">
            <strong style="color:${BRAND.textDark};">What happens next?</strong><br /><br />
            Track your application status and interview details anytime in your candidate dashboard.
            If an interview is scheduled, you will receive another email with the date, time, and join link.
          </td>
        </tr>
      </table>
      ${primaryButton(params.dashboardUrl, 'View my applications')}
    </td>
  </tr>`;
  return emailShell('Application received', body, company);
}

export function applicationReceivedText(params: {
  candidateName?: string | null;
  jobTitle: string;
  companyName?: string | null;
  dashboardUrl: string;
}): string {
  const name = params.candidateName?.trim() || 'there';
  const company = params.companyName?.trim() || BRAND.name;
  return [
    `${BRAND.name} — Application received`,
    '',
    `Hi ${name},`,
    '',
    `Your application for ${params.jobTitle} at ${company} was received.`,
    '',
    `Track status: ${params.dashboardUrl}`,
  ].join('\n');
}

export function candidateWelcomeHtml(params: {
  candidateName?: string | null;
  dashboardUrl: string;
}): string {
  const name = params.candidateName?.trim() || 'there';
  const body = `
  ${gradientHeader('Welcome to Intervion', 'Your candidate account is ready')}
  <tr>
    <td style="padding:36px 40px;color:${BRAND.text};line-height:1.7;font-size:15px;">
      <h2 style="margin:0 0 16px;font-size:22px;color:${BRAND.textDark};font-weight:700;">Hi ${escapeHtml(name)}, 👋</h2>
      <p style="margin:0 0 18px;">
        Your account is set up. You can apply for jobs, track applications, and join AI interviews from your dashboard.
      </p>
      ${primaryButton(params.dashboardUrl, 'Go to my dashboard')}
      <p style="margin:24px 0 0;font-size:14px;color:${BRAND.textMuted};">
        When you apply or get scheduled for an interview, we will email you updates with dates and join links.
      </p>
    </td>
  </tr>`;
  return emailShell('Welcome', body);
}

export function candidateWelcomeText(params: {
  candidateName?: string | null;
  dashboardUrl: string;
}): string {
  const name = params.candidateName?.trim() || 'there';
  return [
    `${BRAND.name} — Welcome`,
    '',
    `Hi ${name},`,
    '',
    'Your candidate account is ready.',
    '',
    `Dashboard: ${params.dashboardUrl}`,
  ].join('\n');
}
