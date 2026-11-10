// Rate limiting (SEC-02, sw-architecture.md 7.1.1): counters in memory (one
// process) in fixed windows per key.
export interface Limit {
  /** Attempts allowed in the window. */
  max: number;
  windowMs: number;
}

export class RateLimiter {
  readonly #counters = new Map<string, { count: number; resetAt: number }>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  /** Counts an attempt; returns the seconds to wait if the limit is exceeded, else undefined. */
  hit(key: string, limit: Limit): number | undefined {
    const now = this.#now();
    this.#purge(now);
    const entry = this.#counters.get(key);
    if (!entry || entry.resetAt <= now) {
      this.#counters.set(key, { count: 1, resetAt: now + limit.windowMs });
      return undefined;
    }
    entry.count += 1;
    return entry.count > limit.max ? Math.ceil((entry.resetAt - now) / 1000) : undefined;
  }

  /** Seconds to wait if the key is at its limit, without counting an attempt. */
  blocked(key: string, limit: Limit): number | undefined {
    const now = this.#now();
    const entry = this.#counters.get(key);
    if (!entry || entry.resetAt <= now || entry.count < limit.max) return undefined;
    return Math.ceil((entry.resetAt - now) / 1000);
  }

  reset(key: string): void {
    this.#counters.delete(key);
  }

  #purge(now: number): void {
    // Bounded work: only when the table has grown.
    if (this.#counters.size < 1000) return;
    for (const [key, entry] of this.#counters) {
      if (entry.resetAt <= now) this.#counters.delete(key);
    }
  }
}

/** Limits of the auth endpoints (15 minutes). */
export const LOGIN_PER_ADDRESS: Limit = { max: 20, windowMs: 15 * 60_000 };
export const LOGIN_FAILURES_PER_USER: Limit = { max: 5, windowMs: 15 * 60_000 };
export const PASSWORD_SET_PER_ADDRESS: Limit = { max: 10, windowMs: 15 * 60_000 };
