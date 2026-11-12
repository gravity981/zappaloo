import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { DEFAULT_PRIVACY_NOTICE } from "@zappaloo/shared";
import type {
  ActivityEntry,
  PlatformStatus,
  PrivacyConfig,
  PrivacyResponse,
  Role,
} from "@zappaloo/shared";
import { PlatformService } from "../event/platform.ts";
import { createTestApp } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";
import { SESSION_COOKIE } from "./auth.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

const PASSWORD = "correct-horse-battery";

interface SignedIn {
  cookie: string;
  csrf: string;
  id: number;
}
const as = (who: SignedIn) => ({ cookie: who.cookie, "x-csrf-token": who.csrf });

async function makeUser(
  ctx: TestContext,
  username: string,
  roles: Role[],
  displayName = username,
): Promise<SignedIn> {
  const user = ctx.auth.accounts.createUser({ username, roles, displayName }, "cli");
  const link = ctx.auth.accounts.createLink(user.id, "setup", "cli");
  await ctx.auth.accounts.useLink(link.token, PASSWORD);
  const response = await ctx.app.inject({
    method: "POST",
    url: "/api/session",
    payload: { username, password: PASSWORD },
  });
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!cookie) throw new Error("no session cookie");
  return {
    id: user.id,
    cookie: `${SESSION_COOKIE}=${cookie.value}`,
    csrf: response.json<{ csrfToken: string }>().csrfToken,
  };
}

/** Gives the user an email address; `verified` unless said otherwise. */
function setEmail(ctx: TestContext, userId: number, email: string, status = "verified") {
  ctx.database.sqlite
    .prepare("UPDATE users SET email = ?, email_status = ? WHERE id = ?")
    .run(email, status, userId);
}

async function setup() {
  const ctx = await createTestApp();
  context = ctx;
  ctx.app.get("/api/gallery", { schema: { querystring: z.strictObject({}) } }, () => ({
    photos: [],
  }));
  const root = await makeUser(ctx, "root", ["admin"]);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the body's type
  const get = async <T>(who: SignedIn | undefined, url: string) => {
    const response = await ctx.app.inject({
      url,
      ...(who ? { headers: { cookie: who.cookie } } : {}),
    });
    return {
      status: response.statusCode,
      body: (response.headers["content-type"]?.toString().includes("json")
        ? response.json<T>()
        : undefined) as T,
      raw: response,
    };
  };
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the body's type
  const call = async <T>(
    who: SignedIn,
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    payload?: object,
  ) => {
    const response = await ctx.app.inject({
      method,
      url,
      headers: as(who),
      ...(payload === undefined ? {} : { payload }),
    });
    return {
      status: response.statusCode,
      body: response.body ? response.json<T>() : undefined,
    };
  };
  return { ctx, root, get, call };
}

describe("opening the platform (ACS-10, ACS-14)", () => {
  it("[ACS-14] opening makes the game world reachable for guests at once; closing shuts it again, without an email", async () => {
    const { ctx, root, get, call } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"]);
    setEmail(ctx, anna.id, "anna@example.ch");
    expect((await get<PlatformStatus>(root, "/api/admin/platform")).body).toEqual({
      open: false,
      recipientCount: 1,
    });
    expect((await get(anna, "/api/gallery")).status).toBe(403);

    expect(
      (await call(root, "POST", "/api/admin/platform/open", { sendEmail: false })).body,
    ).toEqual({
      sent: 0,
      failed: 0,
    });
    expect((await get<PlatformStatus>(root, "/api/admin/platform")).body.open).toBe(true);
    expect((await get(anna, "/api/gallery")).status).toBe(200);
    expect(ctx.mailer.sent).toHaveLength(0);

    // "Wieder schliessen": closed again at once, and no email goes out.
    expect((await call(root, "POST", "/api/admin/platform/close")).status).toBe(204);
    expect((await get(anna, "/api/gallery")).status).toBe(403);
    expect(ctx.mailer.sent).toHaveLength(0);
  });

  it("[ACS-14] the email 'Die Tür ist offen' goes to guests with a verified address only, with a link to sign in", async () => {
    const { ctx, root, call } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"], "Anna");
    const ben = await makeUser(ctx, "ben", ["vip"], "Ben");
    await makeUser(ctx, "cleo", ["vip"]); // no address at all
    const helper = await makeUser(ctx, "helfer", ["staff"]);
    setEmail(ctx, anna.id, "anna@example.ch");
    setEmail(ctx, ben.id, "ben@example.ch", "unverified");
    setEmail(ctx, helper.id, "helfer@example.ch"); // verified, but not a guest

    const opened = await call<{ sent: number; failed: number }>(
      root,
      "POST",
      "/api/admin/platform/open",
      { sendEmail: true },
    );
    expect(opened.body).toEqual({ sent: 1, failed: 0 });
    expect(ctx.mailer.sent.map((m) => m.to)).toEqual(["anna@example.ch"]);
    const mail = ctx.mailer.sent[0];
    expect(mail?.subject).toBe("Event Muster: Die Tür ist offen");
    expect(mail?.text).toContain("Hallo Anna");
    expect(mail?.text).toContain("http://localhost:5173/login");
  });

  it("[ACS-14] a failing mail does not undo the opening: the answer counts what was sent and what failed", async () => {
    const { ctx, root, get, call } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"]);
    setEmail(ctx, anna.id, "anna@example.ch");
    ctx.mailer.failWith = new Error("smtp down");
    const opened = await call(root, "POST", "/api/admin/platform/open", { sendEmail: true });
    expect(opened.body).toEqual({ sent: 0, failed: 1 });
    expect((await get<PlatformStatus>(root, "/api/admin/platform")).body.open).toBe(true);
  });

  it("[ACS-14] opening twice or closing a closed platform is refused, and nobody is mailed twice", async () => {
    const { ctx, root, call } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"]);
    setEmail(ctx, anna.id, "anna@example.ch");
    const code = (r: { body: unknown }) => (r.body as { error: { code: string } }).error.code;
    const closed = await call(root, "POST", "/api/admin/platform/close");
    expect([closed.status, code(closed)]).toEqual([409, "already_closed"]);
    await call(root, "POST", "/api/admin/platform/open", { sendEmail: true });
    const again = await call(root, "POST", "/api/admin/platform/open", { sendEmail: true });
    expect([again.status, code(again)]).toEqual([409, "already_open"]);
    expect(ctx.mailer.sent).toHaveLength(1);
  });

  it("[ACS-14] only admins open and close; the email request is validated and limited", async () => {
    const { ctx, root, call } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"]);
    const helper = await makeUser(ctx, "helfer", ["staff"]);
    for (const who of [anna, helper]) {
      expect(
        (await call(who, "POST", "/api/admin/platform/open", { sendEmail: false })).status,
      ).toBe(403);
      expect((await call(who, "POST", "/api/admin/platform/close")).status).toBe(403);
    }
    expect((await call(root, "POST", "/api/admin/platform/open", {})).status).toBe(400);
    expect(
      (await call(root, "POST", "/api/admin/platform/open", { sendEmail: "yes" })).status,
    ).toBe(400);
    // Three openings with email per hour at most.
    for (let i = 0; i < 3; i += 1) {
      await call(root, "POST", "/api/admin/platform/open", { sendEmail: true });
      await call(root, "POST", "/api/admin/platform/close");
    }
    expect((await call(root, "POST", "/api/admin/platform/open", { sendEmail: true })).status).toBe(
      429,
    );
  });

  it("[ACS-14] without a mail server the admin can still open without the email, but not with it", async () => {
    const { ctx } = await setup();
    const withoutMail = new PlatformService(
      ctx.database,
      ctx.event,
      undefined,
      "http://localhost:5173",
    );
    await expect(withoutMail.open(true, "cli", () => undefined)).rejects.toMatchObject({
      code: "mail_unavailable",
    });
    // Nothing happened: still closed.
    expect(withoutMail.status().open).toBe(false);
    expect(await withoutMail.open(false, "cli", () => undefined)).toEqual({ sent: 0, failed: 0 });
    expect(withoutMail.status().open).toBe(true);
  });

  it("[ACS-14][DATA-05] opening and closing are audited, and the card Zuletzt lists them", async () => {
    const { ctx, root, get, call } = await setup();
    await call(root, "POST", "/api/admin/platform/open", { sendEmail: false });
    await call(root, "POST", "/api/admin/platform/close");
    const entries = (await get<{ entries: ActivityEntry[] }>(root, "/api/admin/activity")).body
      .entries;
    expect(entries.slice(0, 2).map((e) => e.action)).toEqual(["platform.close", "platform.open"]);
    expect(ctx.event.auditEntries().filter((e) => e.action === "platform.open")).toHaveLength(1);
  });
});

describe("the privacy notice (SEC-09)", () => {
  it("[SEC-09] is public: readable without sign-in, with the event's name, also while the platform is closed", async () => {
    const { ctx, get, root } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"]);
    for (const who of [undefined, anna, root]) {
      const notice = await get<PrivacyResponse>(who, "/api/privacy");
      expect(notice.status).toBe(200);
      expect(notice.body.eventName).toBe("Event Muster");
      expect(notice.body.markdown).toContain("Fest «Event Muster»");
      expect(notice.body.markdown).not.toContain("{eventName}");
    }
  });

  it("[SEC-09][SEC-11] the default text names allergies as health data that only admins see, and the deletion", async () => {
    const { get } = await setup();
    const text = (await get<PrivacyResponse>(undefined, "/api/privacy")).body.markdown;
    expect(text).toMatch(/Allergien und Unverträglichkeiten.*Gesundheitsdaten/s);
    expect(text).toContain("Nur die Administratoren sehen sie");
    expect(text).toContain("Nach dem Fest löschen wir alle persönlichen Daten");
    // Deleting the account keeps the guest-list entry with the hosts (7.1.2, ACC-17).
    expect(text).toContain(
      "Deine Rückmeldung (mit Begleitpersonen und Allergien) bleibt für die Organisation",
    );
    expect(DEFAULT_PRIVACY_NOTICE).toContain("{eventName}");
  });

  it("[SEC-09] the admin edits the notice as Markdown, and goes back to the default", async () => {
    const { get, call, root } = await setup();
    expect((await get<PrivacyConfig>(root, "/api/admin/privacy")).body).toEqual({
      markdown: DEFAULT_PRIVACY_NOTICE,
      custom: false,
    });
    const saved = await call<PrivacyConfig>(root, "PUT", "/api/admin/privacy", {
      markdown: "# Mein Datenschutz\n\nFür {eventName}.",
    });
    expect(saved.body).toEqual({
      markdown: "# Mein Datenschutz\n\nFür {eventName}.",
      custom: true,
    });
    expect((await get<PrivacyResponse>(undefined, "/api/privacy")).body.markdown).toBe(
      "# Mein Datenschutz\n\nFür Event Muster.",
    );
    const reset = await call<PrivacyConfig>(root, "PUT", "/api/admin/privacy", { markdown: null });
    expect(reset.body).toEqual({ markdown: DEFAULT_PRIVACY_NOTICE, custom: false });
    expect((await get<PrivacyResponse>(undefined, "/api/privacy")).body.markdown).toContain(
      "Allergien",
    );
  });

  it("[SEC-09] input is validated, only admins edit, and the audit log keeps the text out", async () => {
    const { ctx, call, get, root } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"]);
    const helper = await makeUser(ctx, "helfer", ["staff"]);
    for (const body of [
      {},
      { markdown: "" },
      { markdown: "  " },
      { markdown: "x".repeat(20001) },
      { markdown: 5 },
    ]) {
      expect(
        (await call(root, "PUT", "/api/admin/privacy", body)).status,
        JSON.stringify(body),
      ).toBe(400);
    }
    for (const who of [anna, helper]) {
      expect((await call(who, "PUT", "/api/admin/privacy", { markdown: "x" })).status).toBe(403);
      expect((await get(who, "/api/admin/privacy")).status).toBe(403);
    }
    await call(root, "PUT", "/api/admin/privacy", { markdown: "GEHEIMER-TEXT" });
    expect(JSON.stringify(ctx.event.auditEntries())).not.toContain("GEHEIMER-TEXT");
    const entries = (await get<{ entries: ActivityEntry[] }>(root, "/api/admin/activity")).body
      .entries;
    expect(entries[0]?.action).toBe("privacy.set");
  });

  it("[SEC-09][SEC-10] the notice page keeps the noindex header like every page", async () => {
    const { get } = await setup();
    const response = (await get(undefined, "/api/privacy")).raw;
    expect(response.headers["x-robots-tag"]).toContain("noindex");
  });

  it("[SEC-09] before the event is set up the notice still works", async () => {
    context = await createTestApp({ setup: false });
    const response = await context.app.inject("/api/privacy");
    expect(response.statusCode).toBe(200);
    expect(response.json<PrivacyResponse>().markdown).toContain("dieses Fest");
  });
});
