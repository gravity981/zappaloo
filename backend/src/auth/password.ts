// Password hashing with argon2id (ACC-06, sw-architecture.md 7.1.1).
import { hash, verify } from "@node-rs/argon2";

// 2 = Argon2id. m = 19 MiB, t = 2, p = 1: the minimum OWASP recommends; the hash
// string carries its parameters, so they can be raised later without a migration.
const OPTIONS = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // A malformed stored hash never matches.
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Does the work of a password check without a user, so that an unknown username
 * takes as long as a wrong password and does not reveal that it does not exist.
 */
export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHash ??= hashPassword("not-a-real-password");
  await verifyPassword(await dummyHash, password);
}
