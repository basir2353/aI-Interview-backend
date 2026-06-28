import { config } from '../config';
import { query } from '../db/client';
import {
  sendContactAdminNotificationViaResend,
  sendContactAutoReplyViaResend,
  fetchResendReceivedEmail,
  listResendReceivedEmails,
} from './resendMail.service';

export type ContactSource = 'form' | 'resend_inbound';
export type ContactStatus = 'new' | 'read' | 'replied' | 'archived';

export interface ContactSubmissionRow {
  id: string;
  source: ContactSource;
  status: ContactStatus;
  name: string | null;
  email: string;
  company: string | null;
  subject: string | null;
  message: string;
  resend_email_id: string | null;
  resend_outbound_id: string | null;
  attachments: unknown;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}

function parseEmailAddress(raw: string): { email: string; name: string | null } {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1]?.trim() || null, email: match[2]?.trim().toLowerCase() || trimmed };
  }
  return { name: null, email: trimmed.toLowerCase() };
}

export async function createContactSubmission(input: {
  source: ContactSource;
  name?: string | null;
  email: string;
  company?: string | null;
  subject?: string | null;
  message: string;
  resendEmailId?: string | null;
  resendOutboundId?: string | null;
  attachments?: unknown;
  metadata?: Record<string, unknown>;
}): Promise<ContactSubmissionRow> {
  if (input.resendEmailId) {
    const existing = await query<ContactSubmissionRow>(
      `SELECT * FROM contact_submissions WHERE resend_email_id = $1 LIMIT 1`,
      [input.resendEmailId]
    );
    if (existing.rows[0]) return existing.rows[0];
  }

  const { rows } = await query<ContactSubmissionRow>(
    `INSERT INTO contact_submissions
      (source, name, email, company, subject, message, resend_email_id, resend_outbound_id, attachments, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
     RETURNING *`,
    [
      input.source,
      input.name?.trim() || null,
      input.email.trim().toLowerCase(),
      input.company?.trim() || null,
      input.subject?.trim() || null,
      input.message.trim(),
      input.resendEmailId || null,
      input.resendOutboundId || null,
      JSON.stringify(input.attachments ?? []),
      JSON.stringify(input.metadata ?? {}),
    ]
  );
  return rows[0]!;
}

export async function submitContactForm(input: {
  name: string;
  email: string;
  company?: string;
  subject?: string;
  message: string;
}): Promise<{ submission: ContactSubmissionRow; emailSent: boolean; autoReplySent: boolean }> {
  const submission = await createContactSubmission({
    source: 'form',
    name: input.name,
    email: input.email,
    company: input.company,
    subject: input.subject || 'Contact form inquiry',
    message: input.message,
  });

  const notifyEmail = config.contact.notifyEmail;
  let emailSent = false;
  let autoReplySent = false;

  if (notifyEmail) {
    const adminResult = await sendContactAdminNotificationViaResend({
      to: notifyEmail,
      submission,
    });
    emailSent = adminResult.sent;
    if (adminResult.id) {
      await query(`UPDATE contact_submissions SET resend_outbound_id = $2, updated_at = NOW() WHERE id = $1`, [
        submission.id,
        adminResult.id,
      ]);
    }
  }

  const autoReply = await sendContactAutoReplyViaResend({
    to: input.email,
    name: input.name,
  });
  autoReplySent = autoReply.sent;

  return { submission, emailSent, autoReplySent };
}

export async function importResendInboundEmail(emailId: string): Promise<ContactSubmissionRow | null> {
  const email = await fetchResendReceivedEmail(emailId);
  if (!email) return null;

  const from = parseEmailAddress(String(email.from || ''));
  const message = String(email.text || email.html || '').trim() || '(No message body)';
  const toList = Array.isArray(email.to) ? email.to : email.to ? [email.to] : [];

  return createContactSubmission({
    source: 'resend_inbound',
    name: from.name,
    email: from.email,
    subject: String(email.subject || 'Inbound email'),
    message,
    resendEmailId: emailId,
    attachments: email.attachments ?? [],
    metadata: {
      to: toList,
      messageId: email.message_id ?? null,
      headers: email.headers ?? null,
    },
  });
}

export async function syncResendInbox(): Promise<{ imported: number; skipped: number }> {
  const emails = await listResendReceivedEmails();
  let imported = 0;
  let skipped = 0;

  for (const item of emails) {
    const emailId = item.id || item.email_id;
    if (!emailId) {
      skipped += 1;
      continue;
    }
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM contact_submissions WHERE resend_email_id = $1 LIMIT 1`,
      [emailId]
    );
    if (rows[0]) {
      skipped += 1;
      continue;
    }
    await importResendInboundEmail(emailId);
    imported += 1;
  }

  return { imported, skipped };
}

export async function listContactSubmissions(filters?: {
  status?: ContactStatus;
  source?: ContactSource;
  limit?: number;
}): Promise<ContactSubmissionRow[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters?.status) {
    params.push(filters.status);
    clauses.push(`status = $${params.length}`);
  }
  if (filters?.source) {
    params.push(filters.source);
    clauses.push(`source = $${params.length}`);
  }
  const limit = Math.min(Math.max(filters?.limit ?? 100, 1), 500);
  params.push(limit);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await query<ContactSubmissionRow>(
    `SELECT * FROM contact_submissions ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

export async function getContactSubmission(id: string): Promise<ContactSubmissionRow | null> {
  const { rows } = await query<ContactSubmissionRow>(
    `SELECT * FROM contact_submissions WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function updateContactSubmissionStatus(
  id: string,
  status: ContactStatus
): Promise<ContactSubmissionRow | null> {
  const { rows } = await query<ContactSubmissionRow>(
    `UPDATE contact_submissions SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, status]
  );
  return rows[0] ?? null;
}

export async function deleteContactSubmission(id: string): Promise<boolean> {
  const { rowCount } = await query(`DELETE FROM contact_submissions WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function countNewContactSubmissions(): Promise<number> {
  const { rows } = await query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM contact_submissions WHERE status = 'new'`
  );
  return Number(rows[0]?.total ?? 0);
}

export function getContactNotifyEmail(): string {
  return config.contact.notifyEmail;
}
