/**
 * Parse and validate coding answers submitted during interviews.
 */
import type { ParsedCodeAnswer } from '../../types';

const CODE_BLOCK_RE = /```(\w*)\n?([\s\S]*?)```/;

function detectLanguageFromMarkers(text: string, fallback?: string | null): string | null {
  const m = text.match(CODE_BLOCK_RE);
  if (m?.[1]) return m[1].toLowerCase();
  return fallback ?? null;
}

function basicSyntaxCheck(code: string, language: string | null): { valid: boolean; error?: string } {
  if (!code.trim()) return { valid: true };
  const lang = (language ?? 'javascript').toLowerCase();

  if (lang === 'javascript' || lang === 'typescript' || lang === 'js' || lang === 'ts') {
    const open = (code.match(/[{[(]/g) ?? []).length;
    const close = (code.match(/[}\])]/g) ?? []).length;
    if (Math.abs(open - close) > 2) {
      return { valid: false, error: 'Unbalanced brackets in code' };
    }
    if (/function\s*\([^)]*$/.test(code) && !code.includes('}')) {
      return { valid: false, error: 'Incomplete function definition' };
    }
  }

  return { valid: true };
}

function tryRunJavascript(code: string): string | undefined {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`${code}\n;return typeof reverseString !== 'undefined' ? 'fn_defined' : 'ok';`);
    const result = fn();
    return String(result);
  } catch (e) {
    return `runtime_error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export class CodeAnswerService {
  parseAnswer(rawText: string, expectedLanguage?: string | null): ParsedCodeAnswer {
    const trimmed = rawText.trim();
    const match = trimmed.match(CODE_BLOCK_RE);

    if (match) {
      const codeLanguage = detectLanguageFromMarkers(trimmed, expectedLanguage ?? match[1]);
      const codeContent = match[2].trim();
      const explanationText = trimmed.replace(CODE_BLOCK_RE, '').trim();
      const syntax = basicSyntaxCheck(codeContent, codeLanguage);
      let executionOutput: string | undefined;
      if (syntax.valid && codeLanguage && /javascript|js|typescript|ts/.test(codeLanguage)) {
        executionOutput = tryRunJavascript(codeContent);
      }
      return {
        codeContent,
        explanationText,
        codeLanguage,
        combinedText: explanationText ? `${explanationText}\n\n${codeContent}` : codeContent,
        syntaxValid: syntax.valid,
        syntaxError: syntax.error,
        executionOutput,
      };
    }

    // Frontend may send "CODE:\n...\n\nNOTES:\n..." format
    const codeSection = trimmed.match(/^CODE:\s*\n([\s\S]*?)(?:\n\nNOTES:\s*\n([\s\S]*))?$/i);
    if (codeSection) {
      const codeContent = codeSection[1].trim();
      const explanationText = (codeSection[2] ?? '').trim();
      const codeLanguage = expectedLanguage ?? 'javascript';
      const syntax = basicSyntaxCheck(codeContent, codeLanguage);
      return {
        codeContent,
        explanationText,
        codeLanguage,
        combinedText: trimmed,
        syntaxValid: syntax.valid,
        syntaxError: syntax.error,
      };
    }

    return {
      codeContent: null,
      explanationText: trimmed,
      codeLanguage: expectedLanguage ?? null,
      combinedText: trimmed,
      syntaxValid: true,
    };
  }

  formatForSubmission(parsed: ParsedCodeAnswer): string {
    if (!parsed.codeContent) return parsed.explanationText;
    const lang = parsed.codeLanguage ?? '';
    const block = `\`\`\`${lang}\n${parsed.codeContent}\n\`\`\``;
    return parsed.explanationText ? `${parsed.explanationText}\n\n${block}` : block;
  }
}

export const codeAnswerService = new CodeAnswerService();
