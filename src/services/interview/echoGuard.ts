/** Reject answers that are almost certainly TTS echo of the last question. */
export function isLikelyEchoAnswer(answer: string, question: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const a = norm(answer);
  const q = norm(question);
  if (!a || !q) return false;
  if (a === q) return true;
  if (a.length >= 8 && (q.includes(a) || a.includes(q))) return true;

  const qWords = q.split(' ').filter((w) => w.length > 3);
  if (qWords.length === 0) return false;
  const aWords = new Set(a.split(' ').filter((w) => w.length > 3));
  const overlap = qWords.filter((w) => aWords.has(w)).length;
  return overlap / qWords.length >= 0.45;
}
