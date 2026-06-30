import { codeAnswerService } from '../services/interview/CodeAnswerService';

describe('CodeAnswerService', () => {
  it('parses fenced code blocks', () => {
    const raw = 'Here is my solution:\n```javascript\nfunction add(a,b){return a+b;}\n```';
    const parsed = codeAnswerService.parseAnswer(raw, 'javascript');
    expect(parsed.codeContent).toContain('function add');
    expect(parsed.codeLanguage).toBe('javascript');
    expect(parsed.syntaxValid).toBe(true);
  });

  it('parses CODE:/NOTES: format', () => {
    const raw = 'CODE:\nconst x = 1;\n\nNOTES:\nSimple counter';
    const parsed = codeAnswerService.parseAnswer(raw, 'javascript');
    expect(parsed.codeContent).toBe('const x = 1;');
    expect(parsed.explanationText).toBe('Simple counter');
  });

  it('rejects unbalanced brackets', () => {
    const parsed = codeAnswerService.parseAnswer('```js\nfunction f(){ if (true { return 1;\n```', 'js');
    expect(parsed.syntaxValid).toBe(false);
  });
});
