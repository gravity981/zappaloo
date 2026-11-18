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
import { fontFaceRules, themeFill, themeStyle } from "./themeStyle.ts";
import { contrastRatio, toOklch } from "@zappaloo/shared";

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

describe("soft buttons, chips and the bars take a tint of the accent (THM-17)", () => {
  const colors = THEME.colors;

  it("[THM-17] the theme sets the fill of soft buttons and chips, the bars and the active tab", () => {
    const style = props(themeStyle(THEME));
    const fill = themeFill(colors);
    expect(style["--a-fill"]).toBe(fill);
    expect(style["--a-bar"]).toBe(fill);
    // the active tab is the surface, so that it stands out from the tinted bar
    expect(style["--a-bar-pill"]).toBe(colors.surface);
    expect(fill).toMatch(/^#[0-9a-f]{6}$/);
    expect(fill).not.toBe(colors.surface);
    expect(fill).not.toBe(colors.accent);
  });

  it("[THM-17] the fill is a visible tint of the accent's hue, a little darker than the surface for dark text, not a grey", () => {
    for (const accent of ["#1d4f91", "#7a3b2e", "#2f6b4f", "#6b2d8a"]) {
      const fill = themeFill({ ...colors, accent });
      const [f, a, s] = [toOklch(fill), toOklch(accent), toOklch(colors.surface)];
      const hueDistance = Math.abs(((f.h - a.h + 540) % 360) - 180);
      expect(hueDistance, `hue of ${fill} for ${accent}`).toBeLessThan(12);
      expect(f.c, `chroma of ${fill}`).toBeGreaterThan(0.012);
      expect(f.l).toBeLessThan(s.l);
      expect(s.l - f.l).toBeLessThanOrEqual(0.09); // the step is 0.08, plus the rounding to #rrggbb
    }
    // a grey accent gives a grey fill; a theme with light text on a dark surface gets a lighter fill
    expect(toOklch(themeFill({ ...colors, accent: "#808080" })).c).toBeLessThan(0.005);
    const dark = { ...colors, surface: "#1d1b18", text: "#f4efe6", accent: "#7a9ed6" };
    expect(toOklch(themeFill(dark)).l).toBeGreaterThan(toOklch("#1d1b18").l);
  });

  it("[THM-17] without a theme nothing is set, so the platform's grey fill and white bars stay", () => {
    expect(props(themeStyle(null))).toEqual({});
    const css = readFileSync(join(import.meta.dirname, "ui.css"), "utf8");
    expect(css).toContain("--a-fill: #e8e8e2;");
  });

  it("[THM-17] the text keeps the contrast of the validator on the fill, for every palette", () => {
    const grid = ["#ffffff", "#f6f1e7", "#eaf7f0", "#fff0ec", "#e8e8e2", "#ffd27a", "#333333"];
    const accents = [
      "#000000",
      "#7a3b2e",
      "#2f6b4f",
      "#1d4f91",
      "#ffd27a",
      "#ff0000",
      "#ffffff",
      "#808080",
    ];
    const texts = ["#000000", "#1f1f1d", "#2b2a26", "#595959", "#767676"];
    let checked = 0;
    for (const surface of grid) {
      for (const accent of accents) {
        for (const text of texts) {
          // only themes that the validator accepts: the text reaches 4.5 : 1 on the surface
          if (contrastRatio(text, surface) < 4.5) continue;
          const fill = themeFill({ ...colors, surface, accent, text });
          expect(
            contrastRatio(text, fill),
            `${text} on ${fill} (${accent} over ${surface})`,
          ).toBeGreaterThanOrEqual(4.5);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("[THM-17] a text that only just reaches the contrast on the surface leaves no room for a tint", () => {
    const base = { ...colors, surface: "#ffffff", text: "#767676", accent: "#000000" };
    const fill = themeFill(base);
    // #767676 on white is 4.54 : 1: any darker fill would drop below 4.5, so the fill is the surface
    expect(contrastRatio("#767676", fill)).toBeGreaterThanOrEqual(4.5);
    expect(fill).toBe("#ffffff");
  });

  it("[THM-17] the bars of the website, the game and the phone take the bar colour; the platform's white without a theme", () => {
    const css = readFileSync(join(import.meta.dirname, "ui.css"), "utf8");
    const head = /\.guest-site-head \{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(head).toContain("background: var(--a-bar, var(--a-card));");
    const phone = /@media \(max-width: 719px\) \{\s*\.site-nav \{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(phone).toContain("background: var(--a-bar, var(--a-card, #ffffff));");
    expect(css).toMatch(
      /\.guest-site-head nav a\.active \{\s*background: var\(--a-bar-pill, var\(--a-fill\)\);/,
    );
    // the game's bar is the website's bar: it does not set a background of its own
    const game = readFileSync(join(import.meta.dirname, "styles.css"), "utf8");
    for (const rule of game.match(/\.guest-site-head\.game-bar[^{]*\{[^}]*\}/g) ?? []) {
      expect(rule).not.toMatch(/background/);
    }
    expect(readFileSync(join(import.meta.dirname, "../game/GameBar.tsx"), "utf8")).toContain(
      'className="guest-site-head game-bar"',
    );
  });

  it("[THM-17] soft buttons use the fill, which is the tint with a theme", () => {
    const css = readFileSync(join(import.meta.dirname, "ui.css"), "utf8");
    const soft = /\.btn\.soft \{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(soft).toContain("background: var(--a-fill);");
    expect(soft).toContain("border-color: var(--a-fill);");
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
    expect(themed().style.getPropertyValue("--a-bar")).toBe(themeFill(THEME.colors));
    expect(themed().style.getPropertyValue("--a-on-dark")).toBe("#ffffff");
    expect(themed().style.getPropertyValue("--a-body-font")).toContain("Lora");
    // The heading font is left out, so the default of ui.css applies.
    expect(themed().style.getPropertyValue("--a-display")).toBe("");
    const faces = themed().querySelector("style")?.textContent ?? "";
    expect(faces).toContain('@font-face { font-family: "Lora";');
    expect(faces).toContain('src: url("/theme/fonts/lora-400.woff2?v=import-1")');
  });

  it("[THM-16] a font with a size adjust gets size-adjust in its @font-face rules, and 100 or none adds nothing", () => {
    const face = (sizeAdjust: number | undefined) => ({
      family: "Lora",
      ...(sizeAdjust === undefined ? {} : { sizeAdjust }),
      files: [
        { url: "/a.woff2", weight: 400, style: "normal" as const },
        { url: "/b.woff2", weight: 700, style: "italic" as const },
      ],
    });
    const rules = (sizeAdjust: number | undefined) =>
      fontFaceRules({ ...THEME, fonts: { body: face(sizeAdjust) } });
    const scaled = rules(108);
    expect(scaled.match(/size-adjust: 108%;/g)).toHaveLength(2);
    expect(scaled).toContain(
      '@font-face { font-family: "Lora"; src: url("/a.woff2") format("woff2"); font-weight: 400; font-style: normal; size-adjust: 108%; font-display: swap; }',
    );
    expect(rules(87)).toContain("size-adjust: 87%;");
    expect(rules(100)).not.toContain("size-adjust");
    expect(rules(undefined)).not.toContain("size-adjust");
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
