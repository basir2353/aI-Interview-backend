/**
 * Supported interview locales (BCP-47). Used for schedule, session, TTS, STT, and LLM prompts.
 */
export const INTERVIEW_LANGUAGE_CODES = ['en-US', 'es', 'fr', 'de', 'hi', 'ar', 'ur'] as const;
export type InterviewLanguageCode = (typeof INTERVIEW_LANGUAGE_CODES)[number];

export const DEFAULT_INTERVIEW_LANGUAGE: InterviewLanguageCode = 'en-US';

export function isInterviewLanguageCode(value: string): value is InterviewLanguageCode {
  return (INTERVIEW_LANGUAGE_CODES as readonly string[]).includes(value);
}

export function normalizeInterviewLanguage(value: unknown): InterviewLanguageCode {
  if (typeof value !== 'string') return DEFAULT_INTERVIEW_LANGUAGE;
  const trimmed = value.trim();
  if (isInterviewLanguageCode(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase().replace('_', '-');
  if (lower === 'en' || lower.startsWith('en-') || lower === 'english') return 'en-US';
  if (lower === 'es' || lower.startsWith('es-') || lower === 'spanish' || lower === 'español') return 'es';
  if (lower === 'fr' || lower.startsWith('fr-') || lower === 'french' || lower === 'français') return 'fr';
  if (lower === 'de' || lower.startsWith('de-') || lower === 'german' || lower === 'deutsch') return 'de';
  if (lower === 'hi' || lower.startsWith('hi-') || lower === 'hindi' || lower === 'हिन्दी') return 'hi';
  if (lower === 'ar' || lower.startsWith('ar-') || lower === 'arabic' || lower === 'العربية') return 'ar';
  if (lower === 'ur' || lower.startsWith('ur-') || lower === 'urdu' || lower === 'اردو') return 'ur';
  return DEFAULT_INTERVIEW_LANGUAGE;
}

/** Whisper.cpp / OpenAI STT language code (ISO 639-1). */
export function whisperLanguageCode(code: InterviewLanguageCode): string {
  if (code === 'en-US') return 'en';
  return code;
}

/** Bias Whisper toward interview speech in the target language. */
export function whisperSttPrompt(code: InterviewLanguageCode): string {
  const prompts: Record<InterviewLanguageCode, string> = {
    'en-US': 'This is a job interview. The candidate is answering questions.',
    es: 'Esta es una entrevista de trabajo.',
    fr: 'Ceci est un entretien d embauche.',
    de: 'Dies ist ein Vorstellungsgespräch.',
    hi: 'यह एक नौकरी का साक्षात्कार है।',
    ar: 'هذا مقابلة عمل. المرشح يجيب على الأسئلة.',
    ur: 'یہ نوکری کا انٹرویو ہے۔ امیدوار سوالات کے جواب دے رہا ہے۔',
  };
  return prompts[code];
}

export function interviewLanguageLabel(code: InterviewLanguageCode): string {
  const labels: Record<InterviewLanguageCode, string> = {
    'en-US': 'English',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    hi: 'हिन्दी',
    ar: 'العربية',
    ur: 'اردو',
  };
  return labels[code];
}

export function interviewLanguagePromptName(code: InterviewLanguageCode): string {
  const names: Record<InterviewLanguageCode, string> = {
    'en-US': 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    hi: 'Hindi',
    ar: 'Arabic',
    ur: 'Urdu',
  };
  return names[code];
}

export function buildInterviewLanguagePromptBlock(code: InterviewLanguageCode): string {
  const lang = interviewLanguagePromptName(code);
  if (code === 'en-US') {
    return '\nLANGUAGE: Conduct the entire interview in English. All spoken replies and questions must be in English. The candidate may occasionally use another language — still understand their answer fully.';
  }
  return `\nLANGUAGE: Conduct the entire interview in ${lang}. All spoken replies and questions must be in ${lang}. The candidate may answer in ${lang}, English, or a mix (code-switching) — always understand the full meaning and respond in ${lang}. Keep JSON keys in English; only the "reply" field content is in ${lang}.`;
}

export function buildEvaluationLanguageBlock(code: InterviewLanguageCode): string {
  const lang = interviewLanguagePromptName(code);
  if (code === 'en-US') {
    return '\nThe candidate may answer in English or mix other languages. Evaluate the semantic content of the answer. Write feedbackSnippet and redFlags in English for the recruiter.';
  }
  return `\nThe candidate may answer in ${lang}, English, or a mix of both. Transcribe and evaluate the full meaning regardless of which language each phrase uses. Write feedbackSnippet and redFlags in English for the recruiter.`;
}

export interface WelcomeLocaleContext {
  interviewerName: string;
  companyName?: string | null;
  firstName?: string;
  positionTitle?: string;
  roleLabel: string;
  codingModeLabel?: string;
}

type WelcomeBuilder = (ctx: WelcomeLocaleContext) => string[];
type FirstQuestionBuilder = (ctx: WelcomeLocaleContext) => string;

const welcomeBuilders: Record<InterviewLanguageCode, WelcomeBuilder> = {
  'en-US': (ctx) => {
    const company = ctx.companyName?.trim();
    const part1 = company
      ? `Hi there — thanks for joining today. I'm ${ctx.interviewerName}, and I'll be your interviewer today on behalf of ${company}.`
      : `Hi there — thanks for joining today. I'm ${ctx.interviewerName}, and I'll be your interviewer for this session.`;
    const nameLine = ctx.firstName ? `${ctx.firstName}, great to meet you.` : 'Great to meet you.';
    const roleLine = ctx.positionTitle
      ? `You're here for the ${ctx.positionTitle} role — I've had a quick look at your background ahead of time.`
      : company
        ? `You're here for your ${ctx.roleLabel} interview with ${company} — I've had a quick look at what you shared with us.`
        : `You're here for your ${ctx.roleLabel} interview today — I've had a quick look at what you shared with us.`;
    const sessionLine = ctx.codingModeLabel
      ? `We'll keep this pretty conversational — a bit about your experience, some problem-solving, and maybe a little ${ctx.codingModeLabel} if we get there.`
      : `Think of this as a conversation, not a test — we'll talk about your experience, how you approach problems, and a few things from your work.`;
    const part3 = [sessionLine, 'No need to rush — take your time with each answer.', "Alright, let's get started."].join(' ');
    return [part1, [nameLine, roleLine].join(' '), part3];
  },
  es: (ctx) => {
    const company = ctx.companyName?.trim();
    const part1 = company
      ? `Hola — gracias por unirte hoy. Soy ${ctx.interviewerName} y seré tu entrevistador en nombre de ${company}.`
      : `Hola — gracias por unirte hoy. Soy ${ctx.interviewerName} y seré tu entrevistador en esta sesión.`;
    const nameLine = ctx.firstName ? `${ctx.firstName}, un placer conocerte.` : 'Un placer conocerte.';
    const roleLine = ctx.positionTitle
      ? `Estás aquí para el puesto de ${ctx.positionTitle} — he revisado tu perfil con antelación.`
      : `Estás aquí para tu entrevista ${ctx.roleLabel}${company ? ` con ${company}` : ''} — he revisado lo que compartiste.`;
    const sessionLine = ctx.codingModeLabel
      ? `Será una conversación: hablaremos de tu experiencia, resolveremos algunos problemas y, si llegamos, algo de ${ctx.codingModeLabel}.`
      : `Piensa en esto como una conversación, no un examen — hablaremos de tu experiencia y cómo abordas los problemas.`;
    const part3 = [sessionLine, 'No hay prisa — tómate tu tiempo con cada respuesta.', 'Muy bien, empecemos.'].join(' ');
    return [part1, [nameLine, roleLine].join(' '), part3];
  },
  fr: (ctx) => {
    const company = ctx.companyName?.trim();
    const part1 = company
      ? `Bonjour — merci d'être avec nous aujourd'hui. Je suis ${ctx.interviewerName}, votre intervieweur pour ${company}.`
      : `Bonjour — merci d'être avec nous aujourd'hui. Je suis ${ctx.interviewerName}, votre intervieweur pour cette session.`;
    const nameLine = ctx.firstName ? `${ctx.firstName}, ravi de vous rencontrer.` : 'Ravi de vous rencontrer.';
    const roleLine = ctx.positionTitle
      ? `Vous postulez au poste de ${ctx.positionTitle} — j'ai parcouru votre profil avant l'entretien.`
      : `Vous êtes ici pour un entretien ${ctx.roleLabel}${company ? ` avec ${company}` : ''} — j'ai parcouru votre dossier.`;
    const sessionLine = ctx.codingModeLabel
      ? `Ce sera une conversation : expérience, résolution de problèmes, et peut-être un peu de ${ctx.codingModeLabel}.`
      : `Considérez ceci comme une conversation — nous parlerons de votre expérience et de votre façon de résoudre les problèmes.`;
    const part3 = [sessionLine, 'Prenez votre temps pour chaque réponse.', 'Très bien, commençons.'].join(' ');
    return [part1, [nameLine, roleLine].join(' '), part3];
  },
  de: (ctx) => {
    const company = ctx.companyName?.trim();
    const part1 = company
      ? `Hallo — danke, dass Sie heute dabei sind. Ich bin ${ctx.interviewerName}, Ihr Interviewer im Auftrag von ${company}.`
      : `Hallo — danke, dass Sie heute dabei sind. Ich bin ${ctx.interviewerName}, Ihr Interviewer für diese Sitzung.`;
    const nameLine = ctx.firstName ? `${ctx.firstName}, schön, Sie kennenzulernen.` : 'Schön, Sie kennenzulernen.';
    const roleLine = ctx.positionTitle
      ? `Sie sind hier für die Stelle ${ctx.positionTitle} — ich habe mir Ihren Hintergrund bereits angesehen.`
      : `Sie sind hier für Ihr ${ctx.roleLabel}-Interview${company ? ` bei ${company}` : ''} — ich habe Ihre Unterlagen gelesen.`;
    const sessionLine = ctx.codingModeLabel
      ? `Wir halten es gesprächig — Erfahrung, Problemlösung und vielleicht etwas ${ctx.codingModeLabel}.`
      : `Denken Sie daran: ein Gespräch, kein Test — wir sprechen über Erfahrung und Ihre Herangehensweise.`;
    const part3 = [sessionLine, 'Keine Eile — nehmen Sie sich für jede Antwort Zeit.', 'Gut, legen wir los.'].join(' ');
    return [part1, [nameLine, roleLine].join(' '), part3];
  },
  hi: (ctx) => {
    const company = ctx.companyName?.trim();
    const part1 = company
      ? `नमस्ते — आज जुड़ने के लिए धन्यवाद। मैं ${ctx.interviewerName} हूँ, और ${company} की ओर से आपका इंटरव्यू लूँगा/लूँगी।`
      : `नमस्ते — आज जुड़ने के लिए धन्यवाद। मैं ${ctx.interviewerName} हूँ, और इस सेशन में आपका इंटरव्यू लूँगा/लूँगी।`;
    const nameLine = ctx.firstName ? `${ctx.firstName}, आपसे मिलकर अच्छा लगा।` : 'आपसे मिलकर अच्छा लगा।';
    const roleLine = ctx.positionTitle
      ? `आप ${ctx.positionTitle} भूमिका के लिए यहाँ हैं — मैंने आपकी प्रोफ़ाइल पहले से देख ली है।`
      : `आप अपने ${ctx.roleLabel} इंटरव्यू के लिए यहाँ हैं${company ? ` (${company})` : ''} — मैंने आपके द्वारा साझा की गई जानकारी देखी है।`;
    const sessionLine = ctx.codingModeLabel
      ? `यह एक बातचीत जैसा रहेगा — अनुभव, समस्या-समाधान, और शायद थोड़ा ${ctx.codingModeLabel}।`
      : `इसे परीक्षा नहीं, बातचीत समझें — हम आपके अनुभव और सोचने के तरीके के बारे में बात करेंगे।`;
    const part3 = [sessionLine, 'जल्दबाज़ी न करें — हर जवाब के लिए अपना समय लें।', 'ठीक है, शुरू करते हैं।'].join(' ');
    return [part1, [nameLine, roleLine].join(' '), part3];
  },
  ar: (ctx) => {
    const company = ctx.companyName?.trim();
    const part1 = company
      ? `مرحباً — شكراً لانضمامك اليوم. أنا ${ctx.interviewerName}، وسأكون مُقابِلك نيابةً عن ${company}.`
      : `مرحباً — شكراً لانضمامك اليوم. أنا ${ctx.interviewerName}، وسأكون مُقابِلك في هذه الجلسة.`;
    const nameLine = ctx.firstName ? `${ctx.firstName}، سعيد بلقائك.` : 'سعيد بلقائك.';
    const roleLine = ctx.positionTitle
      ? `أنت هنا لوظيفة ${ctx.positionTitle} — اطلعتُ على خلفيتك مسبقاً.`
      : `أنت هنا لمقابلة ${ctx.roleLabel}${company ? ` مع ${company}` : ''} — اطلعتُ على ما شاركته معنا.`;
    const sessionLine = ctx.codingModeLabel
      ? `ستكون محادثة: خبرتك، حل المشكلات، وربما بعض ${ctx.codingModeLabel}.`
      : `اعتبرها محادثة وليست اختباراً — سنتحدث عن خبرتك وطريقة تفكيرك.`;
    const part3 = [sessionLine, 'لا داعي للاستعجال — خذ وقتك في كل إجابة.', 'حسناً، لنبدأ.'].join(' ');
    return [part1, [nameLine, roleLine].join(' '), part3];
  },
  ur: (ctx) => {
    const company = ctx.companyName?.trim();
    const part1 = company
      ? `السلام علیکم — آج شامل ہونے کا شکریہ۔ میں ${ctx.interviewerName} ہوں، اور ${company} کی جانب سے آپ کا انٹرویو لوں گا/گی۔`
      : `السلام علیکم — آج شامل ہونے کا شکریہ۔ میں ${ctx.interviewerName} ہوں، اور اس سیشن میں آپ کا انٹرویو لوں گا/گی۔`;
    const nameLine = ctx.firstName ? `${ctx.firstName}، آپ سے مل کر خوشی ہوئی۔` : 'آپ سے مل کر خوشی ہوئی۔';
    const roleLine = ctx.positionTitle
      ? `آپ ${ctx.positionTitle} کے عہدے کے لیے یہاں ہیں — میں نے آپ کی پروفائل پہلے سے دیکھ لی ہے۔`
      : `آپ اپنے ${ctx.roleLabel} انٹرویو کے لیے یہاں ہیں${company ? ` (${company})` : ''} — میں نے آپ کی فراہم کردہ معلومات دیکھی ہیں۔`;
    const sessionLine = ctx.codingModeLabel
      ? `یہ ایک گفتگو ہوگی — تجربہ، مسائل حل کرنا، اور شاید تھوڑا ${ctx.codingModeLabel}۔`
      : `اسے امتحان نہیں، بات چیت سمجھیں — ہم آپ کے تجربے اور سوچنے کے انداز پر بات کریں گے۔`;
    const part3 = [sessionLine, 'جلدی نہ کریں — ہر جواب کے لیے اپنا وقت لیں۔', 'ٹھیک ہے، شروع کرتے ہیں۔'].join(' ');
    return [part1, [nameLine, roleLine].join(' '), part3];
  },
};

const firstQuestionBuilders: Record<InterviewLanguageCode, FirstQuestionBuilder> = {
  'en-US': (ctx) => {
    const roleRef = ctx.positionTitle ? `the ${ctx.positionTitle} role` : `this ${ctx.roleLabel} opportunity`;
    if (ctx.codingModeLabel) {
      return ctx.firstName
        ? `So to kick things off, ${ctx.firstName} — in your own words, tell me a bit about yourself and the ${ctx.codingModeLabel} experience you're bringing to ${roleRef}.`
        : `So to kick things off — in your own words, tell me a bit about yourself and the ${ctx.codingModeLabel} experience you're bringing to ${roleRef}.`;
    }
    return ctx.firstName
      ? `So to kick things off, ${ctx.firstName} — walk me through your background in your own words, and what drew you to ${roleRef}.`
      : `So to kick things off — walk me through your background in your own words, and what drew you to ${roleRef}.`;
  },
  es: (ctx) => {
    const roleRef = ctx.positionTitle ? `el puesto de ${ctx.positionTitle}` : `esta oportunidad ${ctx.roleLabel}`;
    return ctx.firstName
      ? `Para empezar, ${ctx.firstName} — cuéntame sobre ti con tus propias palabras y qué te atrajo de ${roleRef}.`
      : `Para empezar — cuéntame sobre ti con tus propias palabras y qué te atrajo de ${roleRef}.`;
  },
  fr: (ctx) => {
    const roleRef = ctx.positionTitle ? `le poste de ${ctx.positionTitle}` : `cette opportunité ${ctx.roleLabel}`;
    return ctx.firstName
      ? `Pour commencer, ${ctx.firstName} — présentez-vous avec vos propres mots et dites-moi ce qui vous a attiré vers ${roleRef}.`
      : `Pour commencer — présentez-vous avec vos propres mots et dites-moi ce qui vous a attiré vers ${roleRef}.`;
  },
  de: (ctx) => {
    const roleRef = ctx.positionTitle ? `die Stelle ${ctx.positionTitle}` : `diese ${ctx.roleLabel}-Gelegenheit`;
    return ctx.firstName
      ? `Zum Einstieg, ${ctx.firstName} — erzählen Sie in eigenen Worten von sich und was Sie zu ${roleRef} gezogen hat.`
      : `Zum Einstieg — erzählen Sie in eigenen Worten von sich und was Sie zu ${roleRef} gezogen hat.`;
  },
  hi: (ctx) => {
    const roleRef = ctx.positionTitle ? `${ctx.positionTitle} भूमिका` : `इस ${ctx.roleLabel} अवसर`;
    return ctx.firstName
      ? `शुरुआत के लिए, ${ctx.firstName} — अपने शब्दों में अपने बारे में बताइए और ${roleRef} में आपको क्या आकर्षित किया।`
      : `शुरुआत के लिए — अपने शब्दों में अपने बारे में बताइए और ${roleRef} में आपको क्या आकर्षित किया।`;
  },
  ar: (ctx) => {
    const roleRef = ctx.positionTitle ? `وظيفة ${ctx.positionTitle}` : `هذه الفرصة ${ctx.roleLabel}`;
    return ctx.firstName
      ? `لنبدأ، ${ctx.firstName} — حدّثني عن نفسك بكلماتك وما الذي جذبك إلى ${roleRef}.`
      : `لنبدأ — حدّثني عن نفسك بكلماتك وما الذي جذبك إلى ${roleRef}.`;
  },
  ur: (ctx) => {
    const roleRef = ctx.positionTitle ? `${ctx.positionTitle} عہدہ` : `یہ ${ctx.roleLabel} موقع`;
    return ctx.firstName
      ? `شروع کرتے ہیں، ${ctx.firstName} — اپنے الفاظ میں اپنے بارے میں بتائیں اور ${roleRef} میں آپ کو کیا متوجہ کیا۔`
      : `شروع کرتے ہیں — اپنے الفاظ میں اپنے بارے میں بتائیں اور ${roleRef} میں آپ کو کیا متوجہ کیا۔`;
  },
};

export function buildLocalizedWelcomeParts(
  code: InterviewLanguageCode,
  ctx: WelcomeLocaleContext
): string[] {
  return welcomeBuilders[code](ctx);
}

export function buildLocalizedFirstQuestion(
  code: InterviewLanguageCode,
  ctx: WelcomeLocaleContext
): string {
  return firstQuestionBuilders[code](ctx);
}
