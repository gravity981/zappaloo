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
/** Password-reset requests (ACC-03) and verification mails; the mails per account are limited separately. */
export const FORGOT_PER_ADDRESS: Limit = { max: 10, windowMs: 15 * 60_000 };
export const VERIFY_MAIL_PER_USER: Limit = { max: 3, windowMs: 60 * 60_000 };
export const RESET_MAILS_PER_ACCOUNT = 3;
export const RESET_MAILS_WINDOW_MS = 60 * 60_000;
/** Looking up and redeeming invitation codes (INV-12, SEC-02). */
export const REDEEM_PER_ADDRESS: Limit = { max: 20, windowMs: 15 * 60_000 };
/**
 * Failed redemption attempts (codes that do not exist or cannot be redeemed) across all
 * addresses: the short code is safe against a guesser with many addresses only with this cap.
 */
export const REDEEM_FAILURES_GLOBAL: Limit = { max: 100, windowMs: 60 * 60_000 };
export const REDEEM_GLOBAL_KEY = "redeem:failures";
