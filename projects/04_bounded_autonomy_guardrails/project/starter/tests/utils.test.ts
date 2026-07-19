import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ErrorCodes,
  ReviewError,
  withRetry,
  withTimeout
} from '../src/utils/error-handler.js';
import { RateLimiter } from '../src/utils/rate-limiter.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('withRetry', () => {
  it('returns immediately when the operation succeeds', async () => {
    await expect(withRetry(async () => 'ok', 3, 10)).resolves.toBe('ok');
  });

  it('retries failures with backoff and eventually succeeds', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValue('recovered');

    const result = withRetry(operation, 3, 100);
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('throws RETRY_EXHAUSTED after the final attempt', async () => {
    const error = await withRetry(
      async () => { throw new Error('still failing'); },
      2,
      0
    ).catch(value => value);

    expect(error).toBeInstanceOf(ReviewError);
    expect(error.code).toBe(ErrorCodes.RETRY_EXHAUSTED);
    expect(error.metadata).toMatchObject({ attempts: 2, lastError: 'still failing' });
  });
});

describe('withTimeout', () => {
  it('returns an operation that finishes before the deadline', async () => {
    await expect(withTimeout(async () => 42, 100)).resolves.toBe(42);
  });

  it('rejects a hanging operation with AGENT_TIMEOUT', async () => {
    vi.useFakeTimers();
    const result = withTimeout(
      () => new Promise<never>(() => undefined),
      500,
      'review timed out'
    );
    const assertion = expect(result).rejects.toMatchObject({
      code: ErrorCodes.AGENT_TIMEOUT,
      message: 'review timed out',
      metadata: { timeoutMs: 500 }
    });

    await vi.advanceTimersByTimeAsync(500);
    await assertion;
  });
});

describe('RateLimiter', () => {
  it('tracks concurrency, requests, and tokens', async () => {
    const limiter = new RateLimiter({
      maxConcurrent: 1,
      maxRequestsPerMinute: 2,
      maxTokensPerMinute: 100
    });

    expect(limiter.canProceed(60)).toBe(true);
    await limiter.acquire(60);
    expect(limiter.canProceed(1)).toBe(false);
    expect(limiter.getStatus()).toMatchObject({
      activeRequests: 1,
      requestsInWindow: 1,
      tokensInWindow: 60,
      availableRequests: 1,
      availableTokens: 40
    });

    limiter.release();
    expect(limiter.canProceed(40)).toBe(true);
    expect(limiter.canProceed(41)).toBe(false);
  });

  it('prunes requests after the 60-second sliding window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const limiter = new RateLimiter();

    await limiter.acquire(250);
    limiter.release();
    vi.setSystemTime(new Date('2026-01-01T00:01:00.001Z'));

    expect(limiter.getStatus()).toMatchObject({
      requestsInWindow: 0,
      tokensInWindow: 0
    });
  });

  it('queues requests until a concurrent slot is released', async () => {
    const limiter = new RateLimiter({ maxConcurrent: 1 });
    await limiter.acquire(100);

    const secondAcquire = limiter.acquire(100);
    expect(limiter.getStatus().activeRequests).toBe(1);
    limiter.release();
    await secondAcquire;

    expect(limiter.getStatus().activeRequests).toBe(1);
    limiter.release();
  });
});
