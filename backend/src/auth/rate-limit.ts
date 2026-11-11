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

/**
 * Limits of the auth endpoints. The limits per client address count only failed attempts:
 * many guests share one address (the venue's Wi-Fi, a mobile network), and only failures
 * help a guesser (sw-architecture.md 7.1.1).
 */
export const LOGIN_FAILURES_PER_ADDRESS: Limit = { max: 20, windowMs: 15 * 60_000 };
export const LOGIN_FAILURES_PER_USER: Limit = { max: 5, windowMs: 15 * 60_000 };
/** Unknown, used or expired links when setting a password. */
export const PASSWORD_SET_FAILURES_PER_ADDRESS: Limit = { max: 10, windowMs: 15 * 60_000 };
/** Unknown, used or expired links when confirming an email address. */
export const EMAIL_VERIFY_FAILURES_PER_ADDRESS: Limit = { max: 10, windowMs: 15 * 60_000 };
/** Password-reset requests (ACC-03), counted whether they succeed or not: each may send a mail. */
export const FORGOT_PER_ADDRESS: Limit = { max: 10, windowMs: 15 * 60_000 };
export const VERIFY_MAIL_PER_USER: Limit = { max: 3, windowMs: 60 * 60_000 };
/** Reset mails per account; links an admin or the CLI hands out do not count. */
export const RESET_MAILS_PER_ACCOUNT: Limit = { max: 3, windowMs: 60 * 60_000 };
/** Failed lookups and redemptions of invitation codes per address (INV-12, SEC-02). */
export const REDEEM_FAILURES_PER_ADDRESS: Limit = { max: 20, windowMs: 15 * 60_000 };
/**
 * Failed redemption attempts (codes that do not exist or cannot be redeemed) across all
 * addresses: the short code is safe against a guesser with many addresses only with this cap.
 */
export const REDEEM_FAILURES_GLOBAL: Limit = { max: 100, windowMs: 60 * 60_000 };
export const REDEEM_GLOBAL_KEY = "redeem:failures";

/** Reminder emails to guests without an RSVP, per admin (RSVP-07): a double click sends nothing twice. */
export const RSVP_REMIND_PER_ADMIN: Limit = { max: 5, windowMs: 60 * 60_000 };
