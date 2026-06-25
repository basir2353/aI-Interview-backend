/** Parse interviewer LLM output (JSON or plain text) into the spoken reply. */
export function extractInterviewerReply(raw: string, fallback: string): string {
  const cleaned = (raw || '')
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();

  if (!cleaned) return fallback;

  try {
    const parsed = JSON.parse(cleaned) as { reply?: string };
    if (typeof parsed.reply === 'string' && parsed.reply.trim()) {
      return parsed.reply.trim();
    }
  } catch {
    // plain text or malformed JSON
  }

  if (cleaned.length > 10 && !cleaned.startsWith('{')) {
    return cleaned;
  }

  return fallback;
}
