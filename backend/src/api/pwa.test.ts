import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildThemeArchive, encodePng, validThemeFiles, VALID_COLORS } from "../theme/build.ts";
import { createTestApp, signIn } from "../test-support.ts";
import type { TestContext } from "../test-support.ts";
import { ICON_FILES, isPngOfSize } from "../pwa/app-icons.ts";

let context: TestContext | undefined;
afterEach(async () => {
  await context?.close();
  context = undefined;
});

/** A PNG header for `width` × `height`: all the server reads (signature and IHDR). */
function pngHeader(width: number, height = width): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(13);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    length,
    Buffer.from("IHDR", "latin1"),
    ihdr,
    Buffer.alloc(8),
  ]);
}

/** Imports a theme package as the admin (19.7); the icons of the package are then the event's. */
async function importTheme(ctx: TestContext, files: Record<string, Buffer>) {
  const admin = await signIn(ctx, "boss", ["admin"]);
  const response = await ctx.app.inject({
    method: "POST",
    url: "/api/admin/theme",
    headers: { ...admin, "content-type": "application/gzip" },
    payload: buildThemeArchive(files),
  });
  expect(response.statusCode).toBe(200);
}

/** The folder of the active theme's files. */
function activeThemeFolder(ctx: TestContext): string {
  const [folder] = readdirSync(join(ctx.paths.events, ctx.event.eventId, "theme"));
  return join(ctx.paths.events, ctx.event.eventId, "theme", folder ?? "");
}

interface Manifest {
  name: string;
  short_name: string;
  lang: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
}

describe("the web app manifest (PWA-01)", () => {
  it("[PWA-01] describes the event as a standalone app, without a sign-in", async () => {
    context = await createTestApp();
    const response = await context.app.inject("/manifest.webmanifest");
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/manifest+json");
    const manifest = response.json<Manifest>();
    expect(manifest).toMatchObject({
      name: "Event Muster",
      short_name: "Event Muster",
      lang: "de",
      start_url: "/",
      scope: "/",
      display: "standalone",
    });
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/);
    expect(manifest.icons.map((icon) => [icon.sizes, icon.purpose])).toEqual([
      ["192x192", "any"],
      ["512x512", "any"],
      ["512x512", "maskable"],
    ]);
    for (const icon of manifest.icons) {
      expect(icon.type).toBe("image/png");
      expect(icon.src).toMatch(/^\/app-icons\/icon-[a-z0-9-]+\.png\?v=/);
    }
  });

  it("[PWA-01] follows the event: a long name is shortened, a name change applies at once", async () => {
    context = await createTestApp();
    const ctx = context;
    ctx.event.update({ name: "Hochzeit von Anna und Beat" }, "cli");
    const manifest = (await ctx.app.inject("/manifest.webmanifest")).json<Manifest>();
    expect(manifest.name).toBe("Hochzeit von Anna und Beat");
    expect(manifest.short_name).toBe("Hochzeit von");
    expect((await ctx.app.inject("/manifest.webmanifest")).headers["cache-control"]).toBe(
      "no-cache",
    );
  });

  it("[PWA-01] before the setup the manifest still works, with the platform's name", async () => {
    context = await createTestApp({ setup: false });
    const manifest = (await context.app.inject("/manifest.webmanifest")).json<Manifest>();
    expect(manifest).toMatchObject({ name: "Zappaloo", short_name: "Zappaloo", lang: "de" });
  });

  it("[PWA-01][ACS-10] is reachable while the platform is closed, also for a signed-in guest", async () => {
    context = await createTestApp();
    const ctx = context;
    expect(ctx.event.settings().platformOpen).toBe(false);
    const guest = await signIn(ctx, "gast", ["vip"]);
    for (const headers of [{}, { cookie: guest.cookie }]) {
      const manifest = await ctx.app.inject({ url: "/manifest.webmanifest", headers });
      expect(manifest.statusCode).toBe(200);
      const icon = await ctx.app.inject({ url: "/app-icons/icon-192.png", headers });
      expect(icon.statusCode).toBe(200);
    }
  });
});

describe("the app icons (PWA-02)", () => {
  it("[PWA-02] serves the built-in icons in the exact sizes when the event has none", async () => {
    context = await createTestApp();
    for (const [file, size] of Object.entries(ICON_FILES)) {
      const response = await context.app.inject(`/app-icons/${file}`);
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("image/png");
      expect(isPngOfSize(response.rawPayload, size)).toBe(true);
    }
  });

  it("[PWA-02] serves the icons of the active theme, and the manifest asks for them with a new version", async () => {
    context = await createTestApp();
    const ctx = context;
    const before = (await ctx.app.inject("/manifest.webmanifest")).json<Manifest>();
    const own = encodePng(512, 512, [200, 30, 30]);
    await importTheme(ctx, validThemeFiles({ "icons/icon-512.png": own }));
    const response = await ctx.app.inject("/app-icons/icon-512.png");
    expect(response.rawPayload.equals(own)).toBe(true);
    const after = (await ctx.app.inject("/manifest.webmanifest")).json<Manifest>();
    expect(after.icons[1]?.src).not.toBe(before.icons[1]?.src);
    // The icon the theme does not carry is still the built-in one, as the optional maskable icon.
    const maskable = await ctx.app.inject("/app-icons/icon-maskable-512.png");
    expect(isPngOfSize(maskable.rawPayload, 512)).toBe(true);
    expect(maskable.rawPayload.equals(own)).toBe(false);
  });

  it("[PWA-02] the manifest colours come from the theme, and return to the platform's when the theme is removed", async () => {
    context = await createTestApp();
    const ctx = context;
    const admin = await signIn(ctx, "chef", ["admin"]);
    const colors = { ...VALID_COLORS, background: "#fbf8f3", accent: "#1d4f91" };
    await importTheme(
      ctx,
      validThemeFiles({ "theme.json": Buffer.from(JSON.stringify({ colors })) }),
    );
    const themed = (await ctx.app.inject("/manifest.webmanifest")).json<Manifest>();
    expect(themed.theme_color).toBe("#1d4f91");
    expect(themed.background_color).toBe("#fbf8f3");
    await ctx.app.inject({ method: "DELETE", url: "/api/admin/theme", headers: admin });
    const back = (await ctx.app.inject("/manifest.webmanifest")).json<Manifest>();
    expect(back.theme_color).toBe("#2a2a28");
    expect(back.background_color).toBe("#f4f4f1");
    expect((await ctx.app.inject("/app-icons/icon-192.png")).rawPayload.length).toBeLessThan(
      10_000,
    );
  });

  it("[PWA-02] replaces an icon of the wrong size or a file that is no PNG in the theme by the default", async () => {
    context = await createTestApp();
    const ctx = context;
    await importTheme(ctx, validThemeFiles());
    const folder = activeThemeFolder(ctx);
    writeFileSync(join(folder, "icons", "icon-192.png"), pngHeader(191));
    writeFileSync(join(folder, "icons", "icon-512.png"), Buffer.from("<svg></svg>".repeat(10)));
    writeFileSync(join(folder, "icons", "apple-touch-icon.png"), pngHeader(179));
    for (const [file, size] of [
      ["icon-192.png", 192],
      ["icon-512.png", 512],
      ["apple-touch-icon.png", 180],
    ] as const) {
      const response = await ctx.app.inject(`/app-icons/${file}`);
      expect(response.statusCode).toBe(200);
      expect(isPngOfSize(response.rawPayload, size)).toBe(true);
      expect(response.rawPayload.length).toBeLessThan(10_000);
    }
    expect(existsSync(folder)).toBe(true);
  });

  it("[PWA-02] serves only the four known names, nothing from elsewhere", async () => {
    context = await createTestApp();
    for (const path of [
      "/app-icons/other.png",
      "/app-icons/..%2Fdoor.png",
      "/app-icons/%2e%2e%2fzappaloo.db",
      "/app-icons/",
    ]) {
      const response = await context.app.inject(path);
      expect(response.statusCode, path).toBeGreaterThanOrEqual(400);
      expect(response.statusCode, path).toBeLessThan(500);
    }
  });
});

describe("isPngOfSize (PWA-02)", () => {
  it("[PWA-02] reads the size from the header and rejects everything else", () => {
    expect(isPngOfSize(pngHeader(180), 180)).toBe(true);
    expect(isPngOfSize(pngHeader(180, 181), 180)).toBe(false);
    expect(isPngOfSize(pngHeader(180), 192)).toBe(false);
    expect(isPngOfSize(Buffer.alloc(0), 180)).toBe(false);
    expect(isPngOfSize(Buffer.alloc(40), 180)).toBe(false);
  });
});
