import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter, getClientIp, rateLimitResponse } from './rate-limit';

describe('RateLimiter (token bucket)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows up to N requests within the window', () => {
    const limiter = new RateLimiter({ capacity: 10, refillPerMinute: 10 });
    for (let i = 0; i < 10; i++) {
      expect(limiter.tryConsume('1.2.3.4')).toBe(true);
    }
  });

  it('rejects the (N+1)th request', () => {
    const limiter = new RateLimiter({ capacity: 10, refillPerMinute: 10 });
    for (let i = 0; i < 10; i++) {
      expect(limiter.tryConsume('1.2.3.4')).toBe(true);
    }
    expect(limiter.tryConsume('1.2.3.4')).toBe(false);
  });

  it('allows again after the refill window elapses', () => {
    const limiter = new RateLimiter({ capacity: 10, refillPerMinute: 10 });
    for (let i = 0; i < 10; i++) {
      limiter.tryConsume('1.2.3.4');
    }
    expect(limiter.tryConsume('1.2.3.4')).toBe(false);

    // Advance 60s — a full token should be available again.
    vi.advanceTimersByTime(60_000);
    expect(limiter.tryConsume('1.2.3.4')).toBe(true);
  });

  it('tracks buckets independently per IP', () => {
    const limiter = new RateLimiter({ capacity: 2, refillPerMinute: 2 });
    expect(limiter.tryConsume('a')).toBe(true);
    expect(limiter.tryConsume('a')).toBe(true);
    expect(limiter.tryConsume('a')).toBe(false);
    // Different IP has its own bucket.
    expect(limiter.tryConsume('b')).toBe(true);
  });

  it('refills continuously (partial refill after <60s)', () => {
    const limiter = new RateLimiter({ capacity: 10, refillPerMinute: 10 });
    for (let i = 0; i < 10; i++) limiter.tryConsume('ip');
    // 30s elapsed => ~5 tokens refilled.
    vi.advanceTimersByTime(30_000);
    let allowed = 0;
    for (let i = 0; i < 10; i++) {
      if (limiter.tryConsume('ip')) allowed++;
    }
    expect(allowed).toBe(5);
  });

  it('secondsUntilRefill reports wait time when empty', () => {
    const limiter = new RateLimiter({ capacity: 10, refillPerMinute: 10 });
    for (let i = 0; i < 10; i++) limiter.tryConsume('ip');
    expect(limiter.tryConsume('ip')).toBe(false);
    const wait = limiter.secondsUntilRefill('ip');
    // At 10 tokens/min => 6s per token; should be a positive integer <= 6.
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(6);
  });
});

describe('getClientIp', () => {
  it('reads the first IP from x-forwarded-for', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.5, 70.41.3.18' },
    });
    expect(getClientIp(req)).toBe('203.0.113.5');
  });

  it('falls back to x-forwarded-for single value', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.5' },
    });
    expect(getClientIp(req)).toBe('203.0.113.5');
  });

  it('returns "unknown" when no x-forwarded-for header is present', () => {
    const req = new Request('https://example.com');
    expect(getClientIp(req)).toBe('unknown');
  });
});

describe('rateLimitResponse', () => {
  it('returns a 429 with Retry-After header and JSON body', async () => {
    const res = rateLimitResponse(7);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('7');
    expect(res.headers.get('content-type')).toBe('application/json');
    const body = await res.json();
    expect(body.error).toBe('rate limit exceeded');
    expect(body.retryAfter).toBe(7);
  });
});