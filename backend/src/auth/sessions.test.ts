import { afterEach, describe, expect, it } from "vitest";
import { createTestApp } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";
import { sessions as sessionsTable } from "../database/schema.ts";
import { hashToken } from "./tokens.ts";
import { SESSION_LIFETIME_MS, SessionService } from "./sessions.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

const DAY = 24 * 60 * 60 * 1000;

describe("sessions", () => {
  it("[ACC-05] stores only a hash of the token, and a session for an unknown token does not exist", async () => {
    context = await createTestApp();
    const sessions = new SessionService(context.database);
    const user = context.auth.accounts.createUser({ username: "anna", roles: [] }, "cli");
    const { token } = sessions.create(user.id);

    const rows = context.database.db.select().from(sessionsTable).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(sessions.resolve(token)?.userId).toBe(user.id);
    expect(sessions.resolve("another-token")).toBeUndefined();
  });

  it("[ACC-13] stay valid for a year and are renewed by use, at most once a day", async () => {
    context = await createTestApp();
    let now = new Date("2026-11-10T10:00:00Z");
    const sessions = new SessionService(context.database, () => now);
    const user = context.auth.accounts.createUser({ username: "anna", roles: [] }, "cli");
    const { token, expiresAt } = sessions.create(user.id);
    expect(expiresAt.getTime() - now.getTime()).toBe(SESSION_LIFETIME_MS);

    // Used within the day: not renewed.
    now = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    expect(sessions.resolve(token)?.renewed).toBe(false);

    // Used again after a day: the year starts over.
    now = new Date(now.getTime() + DAY);
    const renewed = sessions.resolve(token);
    expect(renewed?.renewed).toBe(true);
    expect(renewed?.expiresAt.getTime()).toBe(now.getTime() + SESSION_LIFETIME_MS);

    // Kept alive by use, far beyond the first year.
    for (let i = 0; i < 4; i++) {
      now = new Date(now.getTime() + 200 * DAY);
      expect(sessions.resolve(token)).toBeDefined();
    }
  });

  it("[ACC-13] a session not used for a year is gone", async () => {
    context = await createTestApp();
    let now = new Date("2026-11-10T10:00:00Z");
    const sessions = new SessionService(context.database, () => now);
    const user = context.auth.accounts.createUser({ username: "anna", roles: [] }, "cli");
    const { token } = sessions.create(user.id);
    now = new Date(now.getTime() + SESSION_LIFETIME_MS + 1);
    expect(sessions.resolve(token)).toBeUndefined();
    expect(context.database.db.select().from(sessionsTable).all()).toEqual([]);
  });

  it("[ACC-05] logout ends a session; a password change can keep one and end the others", async () => {
    context = await createTestApp();
    const sessions = new SessionService(context.database);
    const user = context.auth.accounts.createUser({ username: "anna", roles: [] }, "cli");
    const first = sessions.create(user.id);
    const second = sessions.create(user.id);
    const third = sessions.create(user.id);
    sessions.destroy(first.token);
    expect(sessions.resolve(first.token)).toBeUndefined();
    sessions.destroyForUser(user.id, second.token);
    expect(sessions.resolve(second.token)).toBeDefined();
    expect(sessions.resolve(third.token)).toBeUndefined();
  });
});
