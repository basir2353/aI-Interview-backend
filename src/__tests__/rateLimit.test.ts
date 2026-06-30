import { interviewAnswerRateLimit, resetRateLimits } from '../api/middleware/rateLimit';
import type { Request, Response, NextFunction } from 'express';

function mockReqRes(id: string) {
  const req = { params: { id } } as unknown as Request;
  const json = jest.fn();
  const setHeader = jest.fn();
  const res = {
    status: jest.fn().mockReturnThis(),
    json,
    setHeader,
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next, json, setHeader };
}

describe('interviewAnswerRateLimit', () => {
  beforeEach(() => resetRateLimits());

  it('allows requests under the limit', () => {
    const { req, res, next } = mockReqRes('test-interview');
    for (let i = 0; i < 5; i++) {
      interviewAnswerRateLimit(req, res, next);
    }
    expect(next).toHaveBeenCalledTimes(5);
  });

  it('blocks when limit exceeded', () => {
    const { req, res, next, json } = mockReqRes('test-interview-2');
    for (let i = 0; i < 6; i++) {
      interviewAnswerRateLimit(req, res, next);
    }
    expect(json).toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(5);
  });
});
