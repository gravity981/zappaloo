// The event's theme on the website and the guest pages, not in the admin area (sw-architecture.md
// 19.7, THM-06): the colours and font faces of `GET /api/site`, and the countdown's display font.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, waitFor } from "@testing-library/react";
import type { SiteTheme } from "@zappaloo/shared";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/i18n.ts";
import { resetSiteNameCache } from "../guest/site.ts";
import { anna, anonymous, fakeBackend, renderAt, SITE } from "../test/backend.tsx";
import { themeStyle } from "./themeStyle.ts";

beforeAll(async () => {
  await initI18n();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetSiteNameCache();
});

const THEME: SiteTheme = {
  version: "import-1",
  colors: {
    background: "#fbf8f3",
    surface: "#ffffff",
    text: "#222222",
    muted: "#5d5d5d",
    line: "#d9cfc2",
    accent: "#1d4f91",
    onAccent: "#ffffff",
  },
  fonts: {
    body: {
      family: "Lora",
      files: [{ url: "/theme/fonts/lora-400.woff2?v=import-1", weight: 400, style: "normal" }],
    },
    display: {
      family: "Cormorant",
      files: [{ url: "/theme/fonts/cormorant-600.woff2?v=import-1", weight: 600, style: "normal" }],
    },
  },
};

/** The custom properties of an element, as the theme sets them. */
const props = (style: object) => style as Record<string, string | undefined>;

describe("the theme of the event (THM-06)", () => {
  it("[THM-06] the countdown's number uses the display font, and the heading font without one", () => {
    const css = readFileSync(join(import.meta.dirname, "ui.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    expect(css).toMatch(/\.countdown-days\s*\{[^}]*font-family:\s*var\(--a-number-font\)/);
    expect(css).toMatch(/--a-number-font:\s*var\(--a-display\);/);
    expect(props(themeStyle(THEME))["--a-number-font"]).toBe('"Cormorant", system-ui, sans-serif');
    const withoutDisplay: SiteTheme = { ...THEME, fonts: { body: THEME.fonts.body } };
    expect(props(themeStyle(withoutDisplay))).not.toHaveProperty("--a-number-font");
  });
});

describe("the waiting card's colours (19.7)", () => {
  it("[THM-01][THM-06] are set as their own properties, and the waiting card reads them with the platform's as fallback", () => {
    const waiting = { card: "#1e3a5f", text: "#ffffff", button: "#f2c14e", onButton: "#1e1e1e" };
    const style = props(themeStyle({ ...THEME, waiting }));
    expect(style["--w-card"]).toBe("#1e3a5f");
    expect(style["--w-text"]).toBe("#ffffff");
    expect(style["--w-button"]).toBe("#f2c14e");
    expect(style["--w-on-button"]).toBe("#1e1e1e");
    expect(props(themeStyle(THEME))).not.toHaveProperty("--w-card");
    const css = readFileSync(join(import.meta.dirname, "../waiting/waiting.css"), "utf8");
    expect(css).toMatch(/\.waiting-card\s*\{[^}]*background:\s*var\(--w-card, #fffaf0\)/);
    expect(css).toMatch(/\.waiting-button\s*\{[^}]*background:\s*var\(--w-button, #2a2420\)/);
  });
});

describe("the theme on the pages (sw-architecture.md 19.7)", () => {
  /** The wrapper of the website and the guest pages. */
  const themed = () => {
    const element = document.querySelector<HTMLElement>(".themed");
    if (!element) throw new Error("no theme wrapper on the page");
    return element;
  };

  it("[THM-01][THM-06] the guest pages carry the theme's colours and the font faces with their URLs", async () => {
    fakeBackend({
      "GET /api/session": () => anonymous,
      "GET /api/site": () => ({ status: 200, body: { ...SITE, theme: THEME } }),
    });
    renderAt("/login");
    await waitFor(() => {
      expect(themed().style.getPropertyValue("--a-dark")).toBe("#1d4f91");
    });
    expect(themed().style.getPropertyValue("--a-bg")).toBe("#fbf8f3");
    expect(themed().style.getPropertyValue("--a-on-dark")).toBe("#ffffff");
    expect(themed().style.getPropertyValue("--a-body-font")).toContain("Lora");
    // The heading font is left out, so the default of ui.css applies.
    expect(themed().style.getPropertyValue("--a-display")).toBe("");
    const faces = themed().querySelector("style")?.textContent ?? "";
    expect(faces).toContain('@font-face { font-family: "Lora";');
    expect(faces).toContain('src: url("/theme/fonts/lora-400.woff2?v=import-1")');
  });

  it("[THM-01] without a theme the guest pages keep the platform's defaults", async () => {
    fakeBackend({
      "GET /api/session": () => anonymous,
      "GET /api/site": () => ({ status: 200, body: SITE }),
    });
    renderAt("/login");
    expect(await screen.findByRole("heading", { name: "Anmelden" })).toBeVisible();
    expect(themed().style.getPropertyValue("--a-dark")).toBe("");
    expect(themed().querySelector("style")).toBeNull();
  });

  it("[THM-01] the admin area keeps the platform's neutral look", async () => {
    const admin = { ...anna, id: 9, username: "lea", displayName: "Lea", roles: ["admin"] };
    fakeBackend({
      "GET /api/session": () => ({ status: 200, body: { user: admin, csrfToken: "csrf" } }),
      "GET /api/site": () => ({ status: 200, body: { ...SITE, theme: THEME } }),
    });
    renderAt("/admin");
    await waitFor(() => {
      expect(document.querySelector(".admin")).not.toBeNull();
    });
    expect(document.querySelector(".themed")).toBeNull();
    expect(document.querySelector<HTMLElement>(".admin")?.style.getPropertyValue("--a-dark")).toBe(
      "",
    );
  });
});
