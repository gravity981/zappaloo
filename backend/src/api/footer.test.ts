import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, signIn } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";
import { DEFAULT_SOURCE_URL, loadConfig } from "../config.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

const year = String(new Date().getFullYear());

interface Site {
  name: string | null;
  copyright: string | null;
  sourceUrl: string;
}

async function put(ctx: TestContext, headers: Record<string, string>, body: object) {
  return ctx.app.inject({ method: "PUT", url: "/api/admin/footer", headers, payload: body });
}

describe("the copyright line (LIC-01, LIC-02)", () => {
  it("[LIC-01][LIC-02] defaults to © <year> <event name>, public, also while the platform is closed", async () => {
    context = await createTestApp();
    const ctx = context;
    expect(ctx.event.settings().platformOpen).toBe(false);
    const site = (await ctx.app.inject("/api/site")).json<Site>();
    expect(site.copyright).toBe(`© ${year} Event Muster`);
    const guest = await signIn(ctx, "gast", ["vip"]);
    const asGuest = await ctx.app.inject({ url: "/api/site", headers: { cookie: guest.cookie } });
    expect(asGuest.json<Site>().copyright).toBe(`© ${year} Event Muster`);
  });

  it("[LIC-02] the admin edits the line; everyone sees it at once", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const saved = await put(ctx, admin, {
      copyright: "© 2027 Lea & Jonas. Alle Rechte vorbehalten.",
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json<object>()).toEqual({
      copyright: "© 2027 Lea & Jonas. Alle Rechte vorbehalten.",
      custom: true,
      defaultCopyright: `© ${year} Event Muster`,
    });
    expect((await ctx.app.inject("/api/site")).json<Site>().copyright).toBe(
      "© 2027 Lea & Jonas. Alle Rechte vorbehalten.",
    );
  });

  it("[LIC-02] an empty line hides it; null goes back to the default", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    expect((await put(ctx, admin, { copyright: "   " })).json<object>()).toMatchObject({
      copyright: "",
      custom: true,
    });
    expect((await ctx.app.inject("/api/site")).json<Site>().copyright).toBeNull();
    expect((await put(ctx, admin, { copyright: null })).json<object>()).toMatchObject({
      copyright: `© ${year} Event Muster`,
      custom: false,
    });
    expect((await ctx.app.inject("/api/site")).json<Site>().copyright).toBe(
      `© ${year} Event Muster`,
    );
  });

  it("[LIC-02] is plain text of one line, at most 120 characters", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    for (const copyright of ["a\nb", "x".repeat(121), "tab\there", 5, undefined]) {
      expect((await put(ctx, admin, { copyright })).statusCode, String(copyright)).toBe(400);
    }
    expect((await put(ctx, admin, { copyright: "x".repeat(120) })).statusCode).toBe(200);
    expect((await put(ctx, admin, { copyright: "©", extra: 1 })).statusCode).toBe(400);
  });

  it("[LIC-02][ROLE-07] only an admin reads or changes it", async () => {
    context = await createTestApp();
    const ctx = context;
    for (const roles of [["vip"], ["staff"]] as const) {
      const other = await signIn(ctx, `u-${roles.join("")}`, [...roles]);
      expect(
        (await ctx.app.inject({ url: "/api/admin/footer", headers: { cookie: other.cookie } }))
          .statusCode,
      ).toBe(403);
      expect((await put(ctx, other, { copyright: "x" })).statusCode).toBe(403);
    }
    expect((await ctx.app.inject("/api/admin/footer")).statusCode).toBe(401);
    expect((await put(ctx, {}, { copyright: "x" })).statusCode).toBe(401);
  });

  it("[LIC-02][SEC-04] each change is audited without the text", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    await put(ctx, admin, { copyright: "© Geheim" });
    await put(ctx, admin, { copyright: null });
    const rows = ctx.database.sqlite
      .prepare("SELECT action, details FROM audit_log WHERE action = 'footer.set' ORDER BY id")
      .all() as { action: string; details: string }[];
    expect(rows.map((row) => JSON.parse(row.details) as unknown)).toEqual([
      { reset: false },
      { reset: true },
    ]);
    expect(JSON.stringify(rows)).not.toContain("Geheim");
  });

  it("[LIC-01] before the setup there is no default line", async () => {
    context = await createTestApp({ setup: false });
    expect((await context.app.inject("/api/site")).json<Site>().copyright).toBeNull();
  });
});

describe("the license page and the source link (LIC-03)", () => {
  it("[LIC-03] GET /api/license gives the AGPL-3.0 text without a sign-in", async () => {
    context = await createTestApp();
    const response = await context.app.inject("/api/license");
    expect(response.statusCode).toBe(200);
    const { text } = response.json<{ text: string }>();
    expect(text).toBe(readFileSync(new URL("../../../LICENSE", import.meta.url), "utf8"));
    expect(text).toContain("GNU AFFERO GENERAL PUBLIC LICENSE");
  });

  it("[LIC-03][ACS-10] a signed-in guest reaches it while the platform is closed", async () => {
    context = await createTestApp();
    const ctx = context;
    const guest = await signIn(ctx, "gast", ["vip"]);
    const response = await ctx.app.inject({
      url: "/api/license",
      headers: { cookie: guest.cookie },
    });
    expect(response.statusCode).toBe(200);
  });

  it("[LIC-03] the source link is the project's repository unless the operator sets SOURCE_URL", async () => {
    context = await createTestApp();
    expect((await context.app.inject("/api/site")).json<Site>().sourceUrl).toBe(DEFAULT_SOURCE_URL);
    const base = { DATA_DIR: "/tmp/x", APP_ENV: "dev" };
    expect(loadConfig(base).SOURCE_URL).toBe(DEFAULT_SOURCE_URL);
    expect(loadConfig({ ...base, SOURCE_URL: "" }).SOURCE_URL).toBe(DEFAULT_SOURCE_URL);
    expect(
      loadConfig({ ...base, SOURCE_URL: "https://git.example.org/me/zappaloo" }).SOURCE_URL,
    ).toBe("https://git.example.org/me/zappaloo");
  });

  it("[LIC-03][SEC-03] SOURCE_URL must be an http(s) address, never a script", () => {
    const base = { DATA_DIR: "/tmp/x", APP_ENV: "dev" };
    for (const bad of ["javascript:alert(1)", "ftp://example.org/x", "not a url"]) {
      expect(() => loadConfig({ ...base, SOURCE_URL: bad }), bad).toThrow(/SOURCE_URL/);
    }
  });
});
