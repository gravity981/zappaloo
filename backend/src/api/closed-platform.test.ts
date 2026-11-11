import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { DEFAULT_WAITING_TEXTS } from "@zappaloo/shared";
import type {
  DoorResponse,
  EventPart,
  Role,
  RsvpState,
  WaitingConfig,
  WaitingPage,
} from "@zappaloo/shared";
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

async function setup() {
  const ctx = await createTestApp();
  context = ctx;
  // A feature route of the later stages: not on the list of what guests reach while closed.
  ctx.app.get("/api/gallery", { schema: { querystring: z.strictObject({}) } }, () => ({
    photos: [],
  }));
  const root = await makeUser(ctx, "root", ["admin"]);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the body's type
  const get = async <T>(who: SignedIn, url: string) => {
    const response = await ctx.app.inject({ url, headers: { cookie: who.cookie } });
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

describe("the closed platform (ACS-10)", () => {
  it("[ACS-10] while closed, a guest reaches the waiting page, the RSVP, the profile and the account routes, but no other route", async () => {
    const { ctx, get } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"]);
    for (const url of [
      "/api/waiting",
      "/api/waiting/door",
      "/api/rsvp",
      "/api/event",
      "/api/session",
      "/api/version",
    ]) {
      expect((await get(anna, url)).status, url).toBe(200);
    }
    const refused = await get<{ error: { code: string } }>(anna, "/api/gallery");
    expect([refused.status, refused.body.error.code]).toEqual([403, "platform_closed"]);
    // The profile and the password change are account routes.
    expect(
      (
        await ctx.app.inject({
          method: "PATCH",
          url: "/api/profile",
          headers: as(anna),
          payload: { displayName: "Anna" },
        })
      ).statusCode,
    ).toBe(200);
  });

  it("[ACS-10] an open platform is open to guests, and closing it again takes effect at once", async () => {
    const { ctx, get } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"]);
    ctx.event.setSetting("platformOpen", true, "cli");
    expect((await get(anna, "/api/gallery")).status).toBe(200);
    ctx.event.setSetting("platformOpen", false, "cli");
    expect((await get(anna, "/api/gallery")).status).toBe(403);
  });

  it("[ACS-10] staff and admins reach everything while the platform is closed", async () => {
    const { ctx, get, root } = await setup();
    const helper = await makeUser(ctx, "helfer", ["staff"]);
    const both = await makeUser(ctx, "beides", ["staff", "vip"]);
    for (const who of [root, helper, both]) {
      expect((await get(who, "/api/gallery")).status).toBe(200);
    }
  });

  it("[ACS-10] a user without any role is a guest to the gate: closed too", async () => {
    const { ctx, get } = await setup();
    const nobody = await makeUser(ctx, "niemand", []);
    expect((await get(nobody, "/api/gallery")).status).toBe(403);
    expect((await ctx.app.inject("/api/gallery")).statusCode).toBe(401);
  });

  it("[ACS-10] unknown paths are still a plain 404, not 'closed'", async () => {
    const { ctx, get } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"]);
    expect((await get(anna, "/api/nowhere")).status).toBe(404);
  });
});

describe("the waiting page (ACS-11)", () => {
  async function withRsvp() {
    const s = await setup();
    const parts: EventPart[] = [];
    for (const [name, hour] of [
      ["Trauung", 14],
      ["Dinner", 18],
    ] as const) {
      parts.push(
        s.ctx.auth.rsvp.createPart(
          { name, startsAt: `2027-06-12T${String(hour)}:00:00.000Z`, hasMeal: false },
          "cli",
        ),
      );
    }
    const guest = async (username: string, displayName: string) => {
      const who = await makeUser(s.ctx, username, ["vip"], displayName);
      s.ctx.auth.rsvp.setInvitedParts(
        who.id,
        parts.map((p) => p.id),
        "cli",
      );
      return who;
    };
    const answer = (who: SignedIn, ...attending: string[]) =>
      s.call<RsvpState>(who, "PUT", "/api/rsvp", {
        attendance: parts.map((p) => ({ partId: p.id, attending: attending.includes(p.name) })),
      });
    return { ...s, parts, guest, answer };
  }

  it("[ACS-11] the text depends on the RSVP status and speaks to the guest by name", async () => {
    const { get, guest, answer } = await withRsvp();
    const erika = await guest("erika", "Erika");
    const peter = await guest("peter", "Peter");
    const lukas = await guest("lukas", "Lukas");
    await answer(peter);
    await answer(lukas, "Trauung");

    const page = async (who: SignedIn) => (await get<WaitingPage>(who, "/api/waiting")).body;
    const none = await page(erika);
    expect(none).toMatchObject({ status: "none", open: false, rsvp: true, countdownTo: null });
    expect(none.text).toBe(DEFAULT_WAITING_TEXTS.none.replace("{name}", "Erika"));
    expect((await page(peter)).text).toBe(
      DEFAULT_WAITING_TEXTS.declined.replace("{name}", "Peter"),
    );
    // The attending text names the others: the guest is not counted.
    await answer(erika, "Dinner");
    const attending = await page(erika);
    expect(attending.status).toBe("attending");
    expect(attending.text).toContain("Erika");
    expect(attending.text).toContain("für dich und 1 weitere Gäste");
  });

  it("[ACS-11] {waitingCount} counts accepted guests and approved companions, but not the guest", async () => {
    const { get, call, guest, answer, root, parts } = await withRsvp();
    const erika = await guest("erika", "Erika");
    const lukas = await guest("lukas", "Lukas");
    await answer(erika, "Trauung");
    await answer(lukas, "Trauung");
    const request = await call<RsvpState>(erika, "POST", "/api/rsvp/companions", {
      name: "Mia",
      attendance: parts.map((p) => ({ partId: p.id, attending: true })),
    });
    const mia = request.body?.companions[0];
    // A pending request is not counted yet.
    expect((await get<WaitingPage>(erika, "/api/waiting")).body.text).toContain("und 1 weitere");
    await call(root, "POST", `/api/admin/rsvp/companions/${String(mia?.id)}/approve`);
    expect((await get<WaitingPage>(erika, "/api/waiting")).body.text).toContain("und 2 weitere");
  });

  it("[ACS-11] a user without the vip role has no RSVP on the waiting page", async () => {
    const { ctx, get } = await setup();
    const helper = await makeUser(ctx, "helfer", ["staff"], "Helfer");
    const page = (await get<WaitingPage>(helper, "/api/waiting")).body;
    expect(page).toMatchObject({ rsvp: false, status: "none" });
    expect(page.text).toContain("Helfer");
  });

  it("[ACS-11] the RSVP button disappears while the rsvp feature is off", async () => {
    const { ctx, get, guest } = await withRsvp();
    const erika = await guest("erika", "Erika");
    ctx.event.setFeature("rsvp", false, "cli");
    expect((await get<WaitingPage>(erika, "/api/waiting")).body.rsvp).toBe(false);
  });

  it("[ACS-11] the page needs a sign-in", async () => {
    const { ctx } = await setup();
    expect((await ctx.app.inject("/api/waiting")).statusCode).toBe(401);
    expect((await ctx.app.inject("/api/waiting/door")).statusCode).toBe(401);
  });
});

describe("waiting page settings (ACS-11, ACS-13)", () => {
  it("[ACS-13] the countdown is off by default and shows only with a date and the switch", async () => {
    const { ctx, get, call, root } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"], "Anna");
    const page = async () => (await get<WaitingPage>(anna, "/api/waiting")).body;

    const config = (await get<WaitingConfig>(root, "/api/admin/waiting")).body;
    expect(config).toMatchObject({
      openingAt: null,
      countdownEnabled: false,
      texts: DEFAULT_WAITING_TEXTS,
      custom: { none: false, attending: false, declined: false },
    });

    // A date alone announces it in the text, without a countdown.
    await call(root, "PATCH", "/api/admin/waiting", { openingAt: "2027-05-15T16:00:00.000Z" });
    expect((await page()).countdownTo).toBeNull();
    // Only the switch, without a date: nothing to count down to.
    await call(root, "PATCH", "/api/admin/waiting", { openingAt: null, countdownEnabled: true });
    expect((await page()).countdownTo).toBeNull();
    // Both.
    await call(root, "PATCH", "/api/admin/waiting", { openingAt: "2027-05-15T16:00:00.000Z" });
    expect((await page()).countdownTo).toBe("2027-05-15T16:00:00.000Z");
    // Switched off again, the date stays for the text.
    await call(root, "PATCH", "/api/admin/waiting", { countdownEnabled: false });
    expect((await page()).countdownTo).toBeNull();
    expect((await get<WaitingConfig>(root, "/api/admin/waiting")).body.openingAt).toBe(
      "2027-05-15T16:00:00.000Z",
    );
  });

  it("[ACS-11] {openingDate} shows the date in the event's time zone, or 'bald' without one", async () => {
    const { ctx, get, call, root } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"], "Anna");
    await call(root, "PATCH", "/api/admin/waiting", {
      texts: { none: "Öffnung: {openingDate}" },
    });
    expect((await get<WaitingPage>(anna, "/api/waiting")).body.text).toBe("Öffnung: bald");
    await call(root, "PATCH", "/api/admin/waiting", { openingAt: "2027-05-15T16:00:00.000Z" });
    // 16:00 UTC is 18:00 in Zurich (summer time).
    expect((await get<WaitingPage>(anna, "/api/waiting")).body.text).toMatch(
      /15\. Mai 2027.*18:00/,
    );
  });

  it("[ACS-11] the admin edits each text and resets it to the default; unknown placeholders stay", async () => {
    const { ctx, get, call, root } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"], "Anna");
    const edited = await call<WaitingConfig>(root, "PATCH", "/api/admin/waiting", {
      texts: { none: "Hallo {name}, {unbekannt} und {waitingCount}!" },
    });
    expect(edited.body?.custom).toEqual({ none: true, attending: false, declined: false });
    expect((await get<WaitingPage>(anna, "/api/waiting")).body.text).toBe(
      "Hallo Anna, {unbekannt} und 0!",
    );
    const reset = await call<WaitingConfig>(root, "PATCH", "/api/admin/waiting", {
      texts: { none: null },
    });
    expect(reset.body?.texts.none).toBe(DEFAULT_WAITING_TEXTS.none);
    expect(reset.body?.custom.none).toBe(false);
    // The audit log names the fields, not the texts.
    const entry = ctx.event.auditEntries().find((e) => e.action === "waiting.set");
    expect(JSON.stringify(entry)).not.toContain("Hallo");
  });

  it("[ACS-11] input is validated and only admins change the settings", async () => {
    const { ctx, get, call, root } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"]);
    for (const body of [
      {},
      { openingAt: "tomorrow" },
      { countdownEnabled: "yes" },
      { texts: { none: "" } },
      { texts: { none: "x".repeat(1001) } },
      { texts: { other: "x" } },
    ]) {
      expect(
        (await call(root, "PATCH", "/api/admin/waiting", body)).status,
        JSON.stringify(body),
      ).toBe(400);
    }
    expect(
      (await call(anna, "PATCH", "/api/admin/waiting", { countdownEnabled: true })).status,
    ).toBe(403);
    expect((await get(anna, "/api/admin/waiting")).status).toBe(403);
  });
});

describe("the door scene (ACS-12)", () => {
  function writeScene(
    ctx: TestContext,
    files: { config?: unknown; sheet?: boolean; glimpse?: boolean },
  ) {
    const dir = join(ctx.paths.events, "event1");
    mkdirSync(dir, { recursive: true });
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHcXJ7wAAAABJRU5ErkJggg==",
      "base64",
    );
    if (files.sheet) writeFileSync(join(dir, "door.png"), png);
    if (files.glimpse) writeFileSync(join(dir, "door-glimpse.png"), png);
    if (files.config !== undefined) {
      writeFileSync(join(dir, "door.json"), JSON.stringify(files.config));
    }
  }
  const sheet = { frameWidth: 320, frameHeight: 180, frames: 4, fps: 6 };

  it("[ACS-12] the built-in scene is used until the event has its own", async () => {
    const { ctx, get } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"]);
    expect((await get<DoorResponse>(anna, "/api/waiting/door")).body).toEqual({ kind: "default" });
    expect((await get(anna, "/api/waiting/door/sheet")).status).toBe(404);
  });

  it("[ACS-12] an event's own sprite sheet replaces the scene; the glimpse image is optional", async () => {
    const { ctx, get } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"]);
    writeScene(ctx, {
      sheet: true,
      config: { ...sheet, gap: { x: 0.4, y: 0.2, width: 0.2, height: 0.6 } },
    });
    const own = (await get<DoorResponse>(anna, "/api/waiting/door")).body;
    expect(own).toMatchObject({
      kind: "sheet",
      sheet: { ...sheet, gap: { x: 0.4, y: 0.2, width: 0.2, height: 0.6 } },
      glimpse: false,
    });
    const png = await get(anna, "/api/waiting/door/sheet");
    expect(png.status).toBe(200);
    expect(png.raw.headers["content-type"]).toBe("image/png");
    expect((await get(anna, "/api/waiting/door/glimpse")).status).toBe(404);

    writeScene(ctx, { glimpse: true });
    const withGlimpse = (await get<DoorResponse>(anna, "/api/waiting/door")).body;
    expect(withGlimpse).toMatchObject({ kind: "sheet", glimpse: true });
    expect((await get(anna, "/api/waiting/door/glimpse")).status).toBe(200);
  });

  it("[ACS-12] a missing or broken scene falls back to the built-in one", async () => {
    const { ctx, get } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"]);
    // No door.json.
    writeScene(ctx, { sheet: true });
    expect((await get<DoorResponse>(anna, "/api/waiting/door")).body.kind).toBe("default");
    // Invalid values, unknown keys, and a file that is not JSON.
    for (const config of [
      { ...sheet, frames: 0 },
      { ...sheet, fps: 100 },
      { ...sheet, extra: true },
      { frameWidth: 320 },
    ]) {
      writeScene(ctx, { config });
      expect((await get<DoorResponse>(anna, "/api/waiting/door")).body.kind).toBe("default");
    }
    const dir = join(ctx.paths.events, "event1");
    writeFileSync(join(dir, "door.json"), "{ not json");
    expect((await get<DoorResponse>(anna, "/api/waiting/door")).body.kind).toBe("default");
    // No door.png: the config alone is not a scene.
    writeFileSync(join(dir, "door.json"), JSON.stringify(sheet));
    rmSync(join(dir, "door.png"));
    expect((await get<DoorResponse>(anna, "/api/waiting/door")).body.kind).toBe("default");
  });

  it("[ACS-12] the version changes when a file is replaced", async () => {
    const { ctx, get } = await setup();
    const anna = await makeUser(ctx, "anna", ["vip"]);
    writeScene(ctx, { sheet: true, config: sheet });
    const first = (await get<DoorResponse>(anna, "/api/waiting/door")).body;
    writeScene(ctx, { sheet: true, glimpse: true, config: { ...sheet, fps: 8 } });
    const second = (await get<DoorResponse>(anna, "/api/waiting/door")).body;
    expect(
      first.kind === "sheet" && second.kind === "sheet" && first.version !== second.version,
    ).toBe(true);
  });
});
