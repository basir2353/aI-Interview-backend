import fs from 'fs/promises';
import path from 'path';
import { URL } from 'url';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { config } from '../../config';

export async function buildResumeContext(input: {
  resumeUrl?: string | null;
  coverLetter?: string | null;
  candidateName?: string | null;
  positionTitle?: string | null;
}): Promise<string | undefined> {
  const parts: string[] = [];
  if (input.candidateName) parts.push(`Candidate name: ${input.candidateName}`);
  if (input.positionTitle) parts.push(`Applied position: ${input.positionTitle}`);
  if (input.coverLetter?.trim()) {
    parts.push(`Candidate cover/profile details:\n${cleanText(input.coverLetter)}`);
  }

  const resumeText = await readResumeText(input.resumeUrl);
  if (resumeText) {
    parts.push(`Resume extracted content (use this for personalized follow-up questions):\n${resumeText}`);
  }

  if (parts.length === 0) return undefined;
  return cleanText(parts.join('\n\n')).slice(0, 5000);
}

async function readResumeText(resumeUrl?: string | null): Promise<string> {
  if (!resumeUrl) return '';
  const buffer = await loadResumeBuffer(resumeUrl);
  if (!buffer) return '';

  const ext = path.extname(resumeUrl.split('?')[0]).toLowerCase();
  try {
    if (ext === '.pdf') {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        return cleanText(result.text).slice(0, 3500);
      } finally {
        await parser.destroy();
      }
    }
    if (ext === '.docx') {
      const parsed = await mammoth.extractRawText({ buffer });
      return cleanText(parsed.value).slice(0, 3500);
    }
    if (ext === '.txt' || ext === '.md') {
      return cleanText(buffer.toString('utf8')).slice(0, 3500);
    }
  } catch (e) {
    console.warn('[ResumeContext] Unable to parse resume:', e instanceof Error ? e.message : e);
  }
  return '';
}

async function loadResumeBuffer(resumeUrl: string): Promise<Buffer | null> {
  const localPath = resolveLocalResumePath(resumeUrl);
  if (localPath) {
    try {
      await fs.access(localPath);
      return fs.readFile(localPath);
    } catch {
      // try HTTP below (Railway / ephemeral disk)
    }
  }

  const fetchUrl = toAbsoluteResumeUrl(resumeUrl);
  if (!fetchUrl) return null;

  try {
    const res = await fetch(fetchUrl);
    if (!res.ok) {
      console.warn('[ResumeContext] HTTP fetch failed:', res.status, fetchUrl);
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.warn('[ResumeContext] Unable to fetch resume:', e instanceof Error ? e.message : e);
    return null;
  }
}

function resolveLocalResumePath(resumeUrl: string): string | null {
  let pathname: string | null = null;
  if (resumeUrl.startsWith('/uploads/resumes/')) {
    pathname = resumeUrl;
  } else {
    try {
      const parsed = new URL(resumeUrl);
      if (parsed.pathname.startsWith('/uploads/resumes/')) pathname = parsed.pathname;
    } catch {
      return null;
    }
  }
  if (!pathname) return null;
  const fileName = path.basename(pathname);
  return path.resolve(process.cwd(), 'uploads', 'resumes', fileName);
}

function toAbsoluteResumeUrl(resumeUrl: string): string | null {
  if (resumeUrl.startsWith('http://') || resumeUrl.startsWith('https://')) return resumeUrl;
  if (resumeUrl.startsWith('/uploads/resumes/')) {
    const base = config.publicUrl?.replace(/\/$/, '');
    if (!base) {
      console.warn('[ResumeContext] BACKEND_URL not set; cannot fetch', resumeUrl);
      return null;
    }
    return `${base}${resumeUrl}`;
  }
  return null;
}

function cleanText(value: string): string {
  return value.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** Returns raw resume text for matching (e.g. against job requirements). */
export async function getResumeTextForMatch(resumeUrl?: string | null): Promise<string> {
  return readResumeText(resumeUrl);
}

/** Computes a 0–100 match score: how many job keywords appear in the resume. */
export function computeResumeJobMatchScore(jobText: string, resumeText: string): number {
  const tokenize = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1);
  const jobWords = new Set(tokenize(jobText));
  const resumeWords = new Set(tokenize(resumeText));
  if (jobWords.size === 0) return 0;
  let hit = 0;
  for (const w of jobWords) {
    if (resumeWords.has(w)) hit++;
  }
  const raw = (hit / jobWords.size) * 100;
  const boosted = Math.min(100, Math.round(raw * 1.2));
  return boosted;
}
