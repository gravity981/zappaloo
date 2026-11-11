// The site as an installed app (PWA-03, PWA-04; sw-architecture.md 19.5).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { resetSiteNameCache } from "../guest/site.ts";
import { initI18n } from "../i18n/i18n.ts";
import { fakeBackend, renderAt, SITE } from "../test/backend.tsx";

const frontend = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(frontend, path), "utf8");

beforeAll(async () => {
  await initI18n();
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetSiteNameCache();
});

describe("the page head (PWA-03)", () => {
  const html = read("index.html");
  const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
  const tags = head.replace(/<!--[\s\S]*?-->/g, "");

  it("[PWA-03] links the manifest and the iOS icon the backend serves", () => {
    expect(tags).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(tags).toContain(
      '<link rel="apple-touch-icon" href="/app-icons/apple-touch-icon.png" />',
    );
  });

  it("[PWA-03] has the tags that open the site as an app on iOS and Android", () => {
    for (const tag of [
      '<meta name="apple-mobile-web-app-capable" content="yes" />',
      '<meta name="mobile-web-app-capable" content="yes" />',
      '<meta name="apple-mobile-web-app-title"',
      '<meta name="apple-mobile-web-app-status-bar-style"',
      '<meta name="theme-color"',
    ]) {
      expect(tags, tag).toContain(tag);
    }
  });

  it("[PWA-03] uses the whole screen: viewport-fit=cover", () => {
    expect(tags).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover/);
  });

  it("[PWA-03] names the page and the home screen icon after the event", async () => {
    document.head.innerHTML =
      '<meta name="apple-mobile-web-app-title" content="Zappaloo" /><title>Zappaloo</title>';
    fakeBackend({
      "GET /api/session": () => ({ status: 200, body: { user: null, csrfToken: null } }),
      "GET /api/site": () => ({ status: 200, body: SITE }),
    });
    renderAt("/login");
    await waitFor(() => {
      expect(document.title).toBe("Lea & Jonas");
      expect(
        document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute("content"),
      ).toBe("Lea & Jonas");
    });
  });
});

describe("no zoom (PWA-04)", () => {
  it("[PWA-04] the page cannot be scaled: maximum-scale=1 in the viewport", () => {
    expect(read("index.html")).toMatch(/<meta name="viewport" content="[^"]*maximum-scale=1\.0/);
  });

  it("[PWA-04] fields are 16px on touch screens, so iOS does not zoom in when one gets the focus", () => {
    const ui = read("src/app/ui.css");
    const block = /@media \(pointer: coarse\) \{([\s\S]*?)\n\}/.exec(ui)?.[1] ?? "";
    expect(block).toContain(":is(.admin, .guest) .input");
    expect(block).toContain(":is(.admin, .guest) .handover .input");
    expect(block).toMatch(/font-size:\s*16px/);
  });

  it("[PWA-04] a double tap does not zoom", () => {
    expect(read("src/app/styles.css")).toMatch(/body\s*\{[^}]*touch-action:\s*manipulation/);
  });
});

describe("safe areas (PWA-04)", () => {
  /** The declarations of the first rule whose selector list contains `selector`. */
  function rule(css: string, selector: string): string {
    const pattern = /([^{}]+)\{([^{}]*)\}/g;
    for (const match of css.matchAll(pattern)) {
      const selectors = (match[1] ?? "").split(",").map((part) => part.trim());
      if (selectors.includes(selector)) return match[2] ?? "";
    }
    throw new Error(`no rule for ${selector}`);
  }
  const css = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "");
  const ui = css("src/app/ui.css");
  const waiting = css("src/waiting/waiting.css");

  it.each([
    ["ui", ".admin", "safe-area-inset-left"],
    ["ui", ".guest", "safe-area-inset-right"],
    ["ui", ".admin-head", "safe-area-inset-top"],
    ["ui", ".guest-bare", "safe-area-inset-top"],
    ["ui", ".guest-bare", "safe-area-inset-bottom"],
    ["ui", ".guest-flow-head", "safe-area-inset-top"],
    ["ui", ".guest-flow-foot", "safe-area-inset-bottom"],
    ["ui", ".guest-site-head", "safe-area-inset-top"],
    ["ui", ".guest-site-main", "safe-area-inset-bottom"],
    ["waiting", ".waiting-top", "safe-area-inset-top"],
    ["waiting", ".waiting-card", "safe-area-inset-bottom"],
    ["waiting", ".waiting-card", "safe-area-inset-left"],
  ])("[PWA-04] %s: %s keeps clear of the screen edge (%s)", (sheet, selector, inset) => {
    expect(rule(sheet === "ui" ? ui : waiting, selector)).toContain(`env(${inset}`);
  });

  it("[PWA-04] the full-screen pages follow the visible height of a phone", () => {
    expect(rule(ui, ".guest")).toContain("100dvh");
    expect(rule(ui, ".admin")).toContain("100dvh");
  });
});

describe("a way back without the browser's buttons (PWA-04)", () => {
  const anonymous = { status: 200, body: { user: null, csrfToken: null } };
  const site = () => ({ status: 200, body: SITE });

  it.each(["/login", "/forgot-password", "/invite", "/datenschutz", "/no/such/page"])(
    "[PWA-04] %s offers a link out of the page",
    async (path) => {
      fakeBackend({
        "GET /api/session": () => anonymous,
        "GET /api/site": site,
        "GET /api/privacy": () => ({
          status: 200,
          body: { eventName: "Lea & Jonas", markdown: "# Hi" },
        }),
      });
      renderAt(path);
      const brand = await screen.findByRole("link", { name: "Lea & Jonas" });
      expect(brand).toHaveAttribute("href", "/");
    },
  );
});
