import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limit.ts";

describe("rate limiter", () => {
  const limit = { max: 3, windowMs: 60_000 };

  it("[SEC-02] allows the limit, refuses the next attempt with the seconds to wait, and starts over after the window", () => {
    let now = 1_000_000;
    const limiter = new RateLimiter(() => now);
    expect([1, 2, 3].map(() => limiter.hit("k", limit))).toEqual([undefined, undefined, undefined]);
    expect(limiter.hit("k", limit)).toBe(60);
    now += 30_000;
    expect(limiter.hit("k", limit)).toBe(30);
    now += 30_000;
    expect(limiter.hit("k", limit)).toBeUndefined();
  });

  it("[SEC-02] keys are independent, and reset clears a key", () => {
    const limiter = new RateLimiter(() => 0);
    for (let i = 0; i < 3; i++) limiter.hit("a", limit);
    expect(limiter.blocked("a", limit)).toBe(60);
    expect(limiter.blocked("b", limit)).toBeUndefined();
    limiter.reset("a");
    expect(limiter.blocked("a", limit)).toBeUndefined();
  });
});
