/**
 * In-memory token-bucket rate limiter keyed by IP.
 *
 * Local mode (single process, single user) is the only target — no Redis.
 * For hosted multi-process deployments a Redis-backed limiter would be
 * required; that is out of scope here.
 *
 * Defaults: 10 requests per minute per IP.
 */

/** Options for constructing a {@link RateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum tokens the bucket can hold (burst capacity). */
  capacity: number;
  /** Tokens added to the bucket per 60s window. */
  refillPerMinute: number;
  /**
   * Optional override for `Date.now` — used by tests with fake timers. In
   * production this is left as the global `Date` constructor.
   */
  now?: () => number;
}

interface Bucket {
  /** Current token count, fractional (refill is continuous). */
  tokens: number;
  /** Last refill timestamp (ms epoch). */
  updatedAt: number;
}

const DEFAULT_CAPACITY = 10;
const DEFAULT_REFILL_PER_MINUTE = 10;
const WINDOW_MS = 60_000;

/**
 * Token bucket rate limiter. Each IP gets an independent bucket that
 * refills continuously at `refillPerMinute / 60_000` tokens per ms.
 */
export class RateLimiter {
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly now: () => number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(opts: RateLimiterOptions) {
    this.capacity = opts.capacity;
    this.refillPerMs = opts.refillPerMinute / WINDOW_MS;
    this.now = opts.now ?? (() => Date.now());
  }

  /**
   * Attempt to consume one token for `key`. Returns `true` if allowed,
   * `false` if the bucket is empty.
   */
  tryConsume(key: string): boolean {
    const now = this.now();
    const bucket = this.buckets.get(key);

    if (!bucket) {
      // First sighting: start full (burst capacity).
      this.buckets.set(key, { tokens: this.capacity - 1, updatedAt: now });
      return true;
    }

    const refilled = this.refill(bucket, now);
    if (refilled.tokens >= 1) {
      bucket.tokens = refilled.tokens - 1;
      bucket.updatedAt = now;
      return true;
    }

    bucket.tokens = refilled.tokens;
    bucket.updatedAt = now;
    return false;
  }

  /**
   * Whole seconds the caller should wait before the next token is available.
   * Returns 0 when a token is already available. Used for the `Retry-After`
   * header on 429 responses.
   */
  secondsUntilRefill(key: string): number {
    const now = this.now();
    const bucket = this.buckets.get(key);
    if (!bucket) return 0;
    const refilled = this.refill(bucket, now);
    if (refilled.tokens >= 1) return 0;
    const needed = 1 - refilled.tokens;
    const ms = needed / this.refillPerMs;
    return Math.max(1, Math.ceil(ms / 1000));
  }

  private refill(bucket: Bucket, now: number): Bucket {
    const elapsed = Math.max(0, now - bucket.updatedAt);
    const added = elapsed * this.refillPerMs;
    const tokens = Math.min(this.capacity, bucket.tokens + added);
    return { tokens, updatedAt: now };
  }
}

/** Module-level singleton with the default 10 req/min policy. */
let defaultLimiter: RateLimiter | undefined;

/**
 * Returns (lazily creating) the process-wide default limiter. Exposed so
 * route handlers can call `getDefaultLimiter().tryConsume(ip)` without
 * wiring options through every call site.
 */
export function getDefaultLimiter(): RateLimiter {
  if (!defaultLimiter) {
    defaultLimiter = new RateLimiter({
      capacity: DEFAULT_CAPACITY,
      refillPerMinute: DEFAULT_REFILL_PER_MINUTE,
    });
  }
  return defaultLimiter;
}

/**
 * Extract the client IP from a `Request`, preferring the first entry in the
 * `x-forwarded-for` header and falling back to `"unknown"`. The connection
 * `remoteAddress` is not accessible from the Web `Request` API in the App
 * Router, so it is handled at the call site when available.
 */
export function getClientIp(req: Request, remoteAddress?: string): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  if (remoteAddress) return remoteAddress;
  return 'unknown';
}

/**
 * Build a 429 response carrying a `Retry-After` header (seconds) and a JSON
 * body describing the rate-limit error.
 */
export function rateLimitResponse(retryAfterSeconds: number): Response {
  return new Response(
    JSON.stringify({ error: 'rate limit exceeded', retryAfter: retryAfterSeconds }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'retry-after': String(retryAfterSeconds),
      },
    },
  );
}