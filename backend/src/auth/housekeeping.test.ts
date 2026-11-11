import { afterEach, describe, expect, it } from "vitest";
import { oneTimeLinks, sessions } from "../database/schema.ts";
import { createTestApp } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";
import { AccountService, LINK_VALIDITY_MS } from "./accounts.ts";
import { SESSION_LIFETIME_MS, SessionService } from "./sessions.ts";
import { startHousekeeping } from "./setup.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

describe("housekeeping", () => {
  it("[ACC-05][ACC-14] deletes expired sessions and used or expired links, keeps the others", async () => {
    context = await createTestApp();
    const { database, event } = context;
    const { accounts } = context.auth;
    const user = accounts.createUser({ username: "anna", roles: ["vip"] }, "cli");
    const used = accounts.createLink(user.id, "setup", "cli");
    await accounts.useLink(used.token, "correct-horse-battery");
    const open = accounts.createLink(user.id, "reset", "cli");
    const sessionsNow = new SessionService(database);
    sessionsNow.create(user.id);

    // A day later the open link has expired; a year later the session too.
    const later = (ms: number) => () => new Date(Date.now() + ms + 1000);
    const nextDay = new AccountService(database, event, later(LINK_VALIDITY_MS));
    expect(nextDay.purgeLinks()).toBe(2);
    expect(database.db.select().from(oneTimeLinks).all()).toEqual([]);
    expect(open.token).toBeTruthy();

    expect(new SessionService(database).purgeExpired()).toBe(0);
    const nextYear = new SessionService(database, later(SESSION_LIFETIME_MS));
    expect(nextYear.purgeExpired()).toBe(1);
    expect(database.db.select().from(sessions).all()).toEqual([]);
  });

  it("[ACC-05] runs at the start and reports what it deleted", async () => {
    context = await createTestApp();
    const reports: { sessions: number; links: number }[] = [];
    const stop = startHousekeeping(context.auth, (deleted) => reports.push(deleted));
    stop();
    expect(reports).toEqual([{ sessions: 0, links: 0 }]);
  });
});
