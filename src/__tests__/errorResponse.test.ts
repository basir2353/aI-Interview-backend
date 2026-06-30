import { buildErrorResponse, ERROR_MESSAGES } from '../types/errors';

describe('StandardErrorResponse', () => {
  it('builds SESSION_NOT_FOUND with Urdu details', () => {
    const err = buildErrorResponse('SESSION_NOT_FOUND');
    expect(err.code).toBe('SESSION_NOT_FOUND');
    expect(err.detailsUr).toContain('session');
    expect(ERROR_MESSAGES.SESSION_NOT_FOUND.status).toBe(404);
  });

  it('includes retryAfter for rate limits', () => {
    const err = buildErrorResponse('RATE_LIMITED', { retryAfter: 30 });
    expect(err.retryAfter).toBe(30);
  });
});
