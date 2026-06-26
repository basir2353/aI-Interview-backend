export interface ResumeProfile {
  candidateName?: string;
  positionTitle?: string;
  skills: string[];
  experience: string[];
  projects: string[];
  education: string[];
  certifications: string[];
  techStack: string[];
  achievements: string[];
  workHistory: string[];
  summary: string;
}

const SKILL_HINTS =
  /\b(javascript|typescript|python|java|react|next\.?js|node\.?js|aws|docker|kubernetes|sql|postgres|mongodb|redis|graphql|rest|api|git|ci\/cd|machine learning|llm|tensorflow|pytorch|figma|tailwind|css|html|vue|angular|go|rust|c\+\+|c#|\.net|ruby|php|swift|kotlin)\b/gi;

const SECTION_PATTERNS: Array<{ key: keyof ResumeProfile; labels: RegExp }> = [
  { key: 'skills', labels: /^(skills|technical skills|core competencies|technologies)\b/i },
  { key: 'experience', labels: /^(experience|work experience|professional experience|employment)\b/i },
  { key: 'projects', labels: /^(projects|personal projects|key projects|portfolio)\b/i },
  { key: 'education', labels: /^(education|academic)\b/i },
  { key: 'certifications', labels: /^(certifications?|licenses?)\b/i },
  { key: 'achievements', labels: /^(achievements?|awards?|honors?)\b/i },
];

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function splitBullets(block: string): string[] {
  return block
    .split(/\n+/)
    .map((l) => l.replace(/^[\s•\-*]+/, '').trim())
    .filter((l) => l.length > 4)
    .slice(0, 12);
}

export function buildResumeProfile(input: {
  rawText: string;
  candidateName?: string | null;
  positionTitle?: string | null;
  coverLetter?: string | null;
}): ResumeProfile {
  const text = [input.coverLetter, input.rawText].filter(Boolean).join('\n\n');
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);

  const profile: ResumeProfile = {
    candidateName: input.candidateName ?? undefined,
    positionTitle: input.positionTitle ?? undefined,
    skills: [],
    experience: [],
    projects: [],
    education: [],
    certifications: [],
    techStack: [],
    achievements: [],
    workHistory: [],
    summary: '',
  };

  let current: keyof ResumeProfile | null = null;
  const buckets: Partial<Record<keyof ResumeProfile, string[]>> = {};

  for (const line of lines) {
    const section = SECTION_PATTERNS.find((s) => s.labels.test(line));
    if (section) {
      current = section.key;
      if (!buckets[current]) buckets[current] = [];
      continue;
    }
    if (current && buckets[current]) buckets[current]!.push(line);
    else if (!current && line.length > 20 && !profile.summary) {
      profile.summary = line.slice(0, 400);
    }
  }

  for (const [key, linesInSection] of Object.entries(buckets)) {
    const k = key as keyof ResumeProfile;
    if (Array.isArray(profile[k])) {
      (profile[k] as string[]) = splitBullets(linesInSection!.join('\n'));
    }
  }

  const skillMatches = text.match(SKILL_HINTS) ?? [];
  profile.techStack = unique(skillMatches.map((s) => s.replace(/\./g, '').trim()));
  if (profile.skills.length === 0) profile.skills = profile.techStack.slice(0, 20);

  profile.workHistory = profile.experience.length ? profile.experience : splitBullets(text).slice(0, 8);
  profile.summary =
    profile.summary ||
    `Candidate with background in ${profile.techStack.slice(0, 6).join(', ') || 'software development'}.`;

  return profile;
}

export function serializeResumeProfileForPrompt(profile: ResumeProfile): string {
  const lines = [
    profile.candidateName ? `Name: ${profile.candidateName}` : '',
    profile.positionTitle ? `Target role: ${profile.positionTitle}` : '',
    profile.summary ? `Summary: ${profile.summary}` : '',
    profile.techStack.length ? `Tech stack: ${profile.techStack.join(', ')}` : '',
    profile.skills.length ? `Skills: ${profile.skills.join('; ')}` : '',
    profile.experience.length ? `Experience:\n- ${profile.experience.join('\n- ')}` : '',
    profile.projects.length ? `Projects:\n- ${profile.projects.join('\n- ')}` : '',
    profile.education.length ? `Education:\n- ${profile.education.join('\n- ')}` : '',
    profile.certifications.length ? `Certifications: ${profile.certifications.join('; ')}` : '',
    profile.achievements.length ? `Achievements: ${profile.achievements.join('; ')}` : '',
  ].filter(Boolean);
  return lines.join('\n\n').slice(0, 4800);
}
