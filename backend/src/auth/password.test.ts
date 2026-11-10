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

  it("[ACC-06] does the hashing work for an unknown user too (no timing difference)", async () => {
    await expect(verifyDummyPassword("whatever-password")).resolves.toBeUndefined();
  });
});
