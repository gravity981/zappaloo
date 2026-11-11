import { describe, expect, it } from "vitest";
import { hashPassword, verifyDummyPassword, verifyPassword } from "./password.ts";

describe("password hashing", () => {
  it("[ACC-06] stores an argon2id hash with its parameters, never the password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(hash).not.toContain("correct horse");
  });

  it("[ACC-06] verifies the right password only, and each hash has its own salt", async () => {
    const [a, b] = await Promise.all([
      hashPassword("secret-password-1"),
      hashPassword("secret-password-1"),
    ]);
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, "secret-password-1")).toBe(true);
    expect(await verifyPassword(a, "secret-password-2")).toBe(false);
    expect(await verifyPassword("not a hash", "secret-password-1")).toBe(false);
  });

  it("[ACC-06] the dummy check does the work of a real one (no timing difference)", async () => {
    const real = await hashPassword("secret-password-1");
    await verifyDummyPassword("warm-up-password"); // the dummy hash is made once
    const time = async (check: () => Promise<unknown>) => {
      const start = performance.now();
      await check();
      return performance.now() - start;
    };
    const realTime = await time(() => verifyPassword(real, "wrong-password"));
    const dummyTime = await time(() => verifyDummyPassword("wrong-password"));
    // Without hashing it would take far under a millisecond; argon2id takes tens.
    expect(dummyTime).toBeGreaterThan(realTime / 3);
  });
});
