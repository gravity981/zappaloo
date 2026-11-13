import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ThemeStatus } from "@zappaloo/shared";
import { buildThemeArchive, validThemeFiles } from "../theme/build.ts";
import { createTestApp, signIn } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

type Headers = Record<string, string>;
// The JSON body of a response, typed by the caller.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the body type
const bodyOf = <T>(response: { json: () => unknown }): T => response.json() as T;

function upload(ctx: TestContext, headers: Headers, archive: Buffer) {
  return ctx.app.inject({
    method: "POST",
    url: "/api/admin/theme",
    headers: { ...headers, "content-type": "application/gzip" },
    payload: archive,
  });
}

/** The folders of the imported packages of the event. */
function themeFolders(ctx: TestContext): string[] {
  const dir = join(ctx.paths.events, "event1", "theme");
  return existsSync(dir) ? readdirSync(dir) : [];
}

describe("the theme of the event (THM-01, THM-03, THM-04, THM-05)", () => {
  it(" an admin imports a package, and the admin area shows it as the active theme", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const imported = await upload(ctx, admin, buildThemeArchive(validThemeFiles({}, "Sommerfest")));
    expect(imported.statusCode).toBe(200);
    expect(bodyOf<ThemeStatus>(imported).active?.name).toBe("Sommerfest");
    const status = await ctx.app.inject({ url: "/api/admin/theme", headers: admin });
    expect(bodyOf<ThemeStatus>(status).active?.formatVersion).toBe(1);
    // The package lies in its own folder, as a whole.
    const [folder] = themeFolders(ctx);
    expect(
      readdirSync(join(ctx.paths.events, "event1", "theme", folder ?? ""), { recursive: true })
        .length,
    ).toBeGreaterThan(0);
  });

  it(" a refused package is answered with every finding, and the active theme stays as it was", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    await upload(ctx, admin, buildThemeArchive(validThemeFiles({}, "Sommerfest")));
    const broken = Object.fromEntries(
      Object.entries(
        validThemeFiles({ "icons/icon-192.png": Buffer.from("kein Bild") }, "Winterfest"),
      ).filter(([path]) => path !== "icons/icon-512.png"),
    );
    const refused = await upload(ctx, admin, buildThemeArchive(broken));
    expect(refused.statusCode).toBe(422);
    const body = bodyOf<{ error: { code: string }; findings: { code: string }[] }>(refused);
    expect(body.error.code).toBe("theme_refused");
    expect(body.findings.map((finding) => finding.code).sort()).toEqual([
      "file_missing",
      "icon_not_png",
    ]);
    const status = await ctx.app.inject({ url: "/api/admin/theme", headers: admin });
    expect(bodyOf<ThemeStatus>(status).active?.name).toBe("Sommerfest");
    // Nothing of the refused package is left behind.
    expect(themeFolders(ctx)).toHaveLength(1);
  });

  it(" a package of a format version the platform does not read is refused", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const newer = validThemeFiles({
      "manifest.json": Buffer.from(
        JSON.stringify({ kind: "zappaloo-theme", formatVersion: 2, name: "Neu" }),
      ),
    });
    const refused = await upload(ctx, admin, buildThemeArchive(newer));
    expect(refused.statusCode).toBe(422);
    expect(bodyOf<{ findings: { code: string }[] }>(refused).findings.map((f) => f.code)).toEqual([
      "format_version",
    ]);
  });

  it(" an archive that is not gzip is refused before anything is written", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const refused = await upload(ctx, admin, Buffer.from("kein gzip"));
    expect(refused.statusCode).toBe(422);
    expect(bodyOf<{ findings: { code: string }[] }>(refused).findings[0]?.code).toBe("not_gzip");
    expect(themeFolders(ctx)).toEqual([]);
  });

  it(" importing again replaces the previous package and removes its folder", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    await upload(ctx, admin, buildThemeArchive(validThemeFiles({}, "Sommerfest")));
    const second = await upload(ctx, admin, buildThemeArchive(validThemeFiles({}, "Herbstfest")));
    expect(bodyOf<ThemeStatus>(second).active?.name).toBe("Herbstfest");
    expect(themeFolders(ctx)).toHaveLength(1);
  });

  it(" the return to the default theme removes the package, and both steps are audited", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    await upload(ctx, admin, buildThemeArchive(validThemeFiles({}, "Sommerfest")));
    const reset = await ctx.app.inject({
      method: "DELETE",
      url: "/api/admin/theme",
      headers: admin,
    });
    expect(reset.statusCode).toBe(204);
    const status = await ctx.app.inject({ url: "/api/admin/theme", headers: admin });
    expect(bodyOf<ThemeStatus>(status).active).toBeNull();
    expect(themeFolders(ctx)).toEqual([]);
    const actions = ctx.event.auditEntries().map((entry) => entry.action);
    expect(actions).toContain("theme.import");
    expect(actions).toContain("theme.reset");
  });

  it(" only admins import, read or return the theme", async () => {
    context = await createTestApp();
    const ctx = context;
    const guest = await signIn(ctx, "anna", ["vip"]);
    const denied = await upload(ctx, guest, buildThemeArchive(validThemeFiles()));
    expect(denied.statusCode).toBe(403);
    expect((await ctx.app.inject({ url: "/api/admin/theme", headers: guest })).statusCode).toBe(
      403,
    );
    expect(
      (await ctx.app.inject({ method: "DELETE", url: "/api/admin/theme", headers: guest }))
        .statusCode,
    ).toBe(403);
  });

  it(" a package above 10 MB is refused by its size", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "boss", ["admin"]);
    const tooLarge = await upload(ctx, admin, Buffer.alloc(10 * 1024 * 1024 + 1));
    expect(tooLarge.statusCode).toBe(413);
  });
});
