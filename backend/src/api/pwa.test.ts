import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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

function putIcon(ctx: TestContext, file: string, bytes: Buffer): void {
  const dir = join(ctx.paths.events, ctx.event.eventId, "icons");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), bytes);
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

  it("[PWA-02] serves the event's own icon from the data directory and tells the manifest", async () => {
    context = await createTestApp();
    const ctx = context;
    const before = (await ctx.app.inject("/manifest.webmanifest")).json<Manifest>();
    const own = pngHeader(512);
    own.write("OWN!", own.length - 4, "latin1");
    putIcon(ctx, "icon-512.png", own);
    const response = await ctx.app.inject("/app-icons/icon-512.png");
    expect(response.rawPayload.equals(own)).toBe(true);
    const after = (await ctx.app.inject("/manifest.webmanifest")).json<Manifest>();
    expect(after.icons[1]?.src).not.toBe(before.icons[1]?.src);
    expect(after.icons[0]?.src).toBe(before.icons[0]?.src);
  });

  it("[PWA-02] replaces a file of the wrong size, a file that is no PNG and a huge file by the default", async () => {
    context = await createTestApp();
    const ctx = context;
    putIcon(ctx, "icon-192.png", pngHeader(191));
    putIcon(ctx, "icon-512.png", Buffer.from("<svg></svg>".repeat(10)));
    putIcon(
      ctx,
      "apple-touch-icon.png",
      Buffer.concat([pngHeader(180), Buffer.alloc(1024 * 1024)]),
    );
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
