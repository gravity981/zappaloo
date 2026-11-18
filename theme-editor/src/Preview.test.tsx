import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.tsx";
import { newDraft } from "./model.ts";
import type { ThemeDraft } from "./model.ts";
import { Preview } from "./Preview.tsx";
import { draftToSiteTheme } from "./previewTheme.ts";
import { fakePng } from "./test-support.ts";

let created: string[] = [];
let revoked: string[] = [];

beforeEach(() => {
  created = [];
  revoked = [];
  URL.createObjectURL = () => {
    const url = `blob:font-${String(created.length + 1)}`;
    created.push(url);
    return url;
  };
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };
});
afterEach(cleanup);

const file = (id: string, weight = 400, style: "normal" | "italic" = "normal") => ({
  id,
  fileName: `${id}.woff2`,
  weight,
  style,
  size: 1000,
  converted: false,
  woff2: new Uint8Array([1, 2, 3]),
});

function withFonts(): ThemeDraft {
  return {
    ...newDraft(),
    fonts: {
      body: { family: "Lora", sizeAdjust: 108, files: [file("b1"), file("b2", 700)] },
      heading: { family: "Playfair Display", sizeAdjust: 100, files: [file("h1", 700)] },
      display: { family: "Cormorant", sizeAdjust: 87, files: [file("d1", 600, "italic")] },
    },
  };
}

const themed = () => {
  const element = document.querySelector<HTMLElement>(".themed.preview");
  if (element === null) throw new Error("no preview");
  return element;
};

describe("theme package editor: preview (THM-11)", () => {
  it("[THM-11] turns the draft into the theme the app reads, and keeps the platform's colour for one that is still being typed", () => {
    const draft = newDraft();
    draft.colors.accent = "#7a3b2e";
    draft.colors.text = "#9a94";
    const theme = draftToSiteTheme(draft, new Map());
    expect(theme.colors.accent).toBe("#7a3b2e");
    expect(theme.colors.text).toBe("#1f1f1d");
    expect(theme.waiting).toBeUndefined();
    expect(theme.fonts).toEqual({});
    draft.waitingEnabled = true;
    expect(draftToSiteTheme(draft, new Map()).waiting?.card).toBe("#fffaf0");
  });

  it("[THM-11] leaves out a font that has no valid family or no loaded file yet", () => {
    const draft = withFonts();
    draft.fonts.heading = { family: "Bad/Family", sizeAdjust: 100, files: [file("h1")] };
    const urls = new Map([
      ["b1", "blob:1"],
      ["d1", "blob:2"],
    ]);
    const theme = draftToSiteTheme(draft, urls);
    expect(theme.fonts.body?.files).toEqual([{ url: "blob:1", weight: 400, style: "normal" }]);
    expect(theme.fonts.heading).toBeUndefined();
    expect(theme.fonts.display?.files[0]?.style).toBe("italic");
  });

  it("[THM-11] shows the start page, a content page with Markdown, a form, the waiting card and the icons", () => {
    render(<Preview draft={newDraft()} />);
    expect(screen.getByLabelText("Start page")).toBeTruthy();
    expect(within(screen.getByLabelText("Start page")).getByText("214 Tage")).toBeTruthy();
    const page = screen.getByLabelText("Content page");
    expect(within(page).getByRole("heading", { name: "Anreise", level: 1 })).toBeTruthy();
    expect(within(page).getByRole("heading", { name: "Parkplätze", level: 2 })).toBeTruthy();
    expect(within(page).getAllByRole("listitem")).toHaveLength(2);
    expect(within(page).getByRole("link", { name: "Karte öffnen" }).getAttribute("rel")).toBe(
      "noopener noreferrer",
    );
    const form = screen.getByLabelText("Form");
    expect(within(form).getByRole("button", { name: "Speichern" })).toBeTruthy();
    expect(within(form).getByRole("button", { name: "Abbrechen" })).toBeTruthy();
    expect(screen.getByLabelText("Waiting card")).toBeTruthy();
    expect(within(screen.getByLabelText("Home screen")).getAllByText("none")).toHaveLength(3);
  });

  it("[THM-11] applies the colours with the app's own custom properties", () => {
    const draft = newDraft();
    draft.colors.accent = "#7a3b2e";
    draft.colors.background = "#f6f1e7";
    render(<Preview draft={draft} />);
    const style = themed().style;
    expect(style.getPropertyValue("--a-dark")).toBe("#7a3b2e");
    expect(style.getPropertyValue("--a-bg")).toBe("#f6f1e7");
    expect(style.getPropertyValue("--a-on-dark")).toBe("#ffffff");
  });

  it("[THM-11] the waiting card takes its own colours only when they are switched on", () => {
    const draft = newDraft();
    const { rerender } = render(<Preview draft={draft} />);
    expect(themed().style.getPropertyValue("--w-card")).toBe("");
    rerender(
      <Preview
        draft={{ ...draft, waitingEnabled: true, waiting: { ...draft.waiting, card: "#3b2f4a" } }}
      />,
    );
    expect(themed().style.getPropertyValue("--w-card")).toBe("#3b2f4a");
    expect(themed().style.getPropertyValue("--w-button")).toBe("#2a2420");
  });

  it("[THM-11] loads uploaded fonts from object URLs and uses them for body, heading and countdown", async () => {
    render(<Preview draft={withFonts()} />);
    await vi.waitFor(() => {
      expect(themed().style.getPropertyValue("--a-body-font")).toContain('"Lora"');
    });
    expect(themed().style.getPropertyValue("--a-display")).toContain('"Playfair Display"');
    expect(themed().style.getPropertyValue("--a-number-font")).toContain('"Cormorant"');
    const css = themed().querySelector("style")?.textContent ?? "";
    expect(css).toContain('@font-face { font-family: "Lora"; src: url("blob:font-1")');
    expect(css).toContain("font-weight: 700");
    expect(css).toContain("font-style: italic");
    expect(created).toHaveLength(4);
  });

  it("[THM-11] releases the object URLs of fonts that are replaced or removed", async () => {
    const draft = withFonts();
    const { rerender, unmount } = render(<Preview draft={draft} />);
    await vi.waitFor(() => {
      expect(created).toHaveLength(4);
    });
    rerender(<Preview draft={{ ...draft, fonts: { body: null, heading: null, display: null } }} />);
    expect(revoked.sort()).toEqual([...created].sort());
    unmount();
  });

  it("[THM-16] the preview scales a font with its size adjust, and adds nothing for 100 or for a value the package would refuse", async () => {
    const draft = withFonts();
    draft.fonts.heading = { family: "Playfair Display", sizeAdjust: 49, files: [file("h1", 700)] };
    render(<Preview draft={draft} />);
    await vi.waitFor(() => {
      expect(themed().querySelector("style")?.textContent).toContain("size-adjust: 108%;");
    });
    const rules = (themed().querySelector("style")?.textContent ?? "").split("\n");
    const of = (family: string) => rules.filter((rule) => rule.includes(`"${family}"`));
    expect(of("Lora")).toHaveLength(2);
    expect(of("Lora").every((rule) => rule.includes("size-adjust: 108%;"))).toBe(true);
    expect(of("Cormorant")[0]).toContain("size-adjust: 87%;");
    expect(of("Playfair Display")[0]).not.toContain("size-adjust");
  });

  it("[THM-16] a size adjust of 100 adds no size-adjust rule", async () => {
    const draft = withFonts();
    draft.fonts.body = { family: "Lora", sizeAdjust: 100, files: [file("b1")] };
    draft.fonts.display = null;
    render(<Preview draft={draft} />);
    await vi.waitFor(() => {
      expect(themed().style.getPropertyValue("--a-body-font")).toContain("Lora");
    });
    expect(themed().querySelector("style")?.textContent).not.toContain("size-adjust");
  });

  it("[THM-17] the preview shows the website bar and a soft button with the accent's tint", () => {
    const draft = newDraft();
    draft.colors.accent = "#7a3b2e";
    draft.colors.surface = "#fffdf8";
    render(<Preview draft={draft} />);
    const fill = themed().style.getPropertyValue("--a-fill");
    // 12 % of the accent over the surface: between the two, closer to the surface
    expect(fill).toMatch(/^#[0-9a-f]{6}$/);
    expect(fill).not.toBe("#fffdf8");
    expect(fill).not.toBe("#7a3b2e");
    expect(themed().style.getPropertyValue("--a-bar")).toBe(fill);
    expect(themed().style.getPropertyValue("--a-bar-pill")).toBe("#fffdf8");
    const bar = screen.getByLabelText("Website bar");
    expect(bar.classList.contains("guest-site-head")).toBe(true);
    expect(within(bar).getByText("Start").classList.contains("active")).toBe(true);
    const soft = within(screen.getByLabelText("Form")).getByRole("button", {
      name: "Mehr erfahren",
    });
    expect(soft.classList.contains("soft")).toBe(true);
  });

  it("[THM-11] shows the app icon and the maskable icon in a circle and a rounded square", () => {
    const draft = newDraft();
    draft.icons.files = {
      "apple-touch-icon": { png: fakePng(180, 180), own: false },
      "icon-maskable-512": { png: fakePng(512, 512), own: false },
    };
    render(<Preview draft={{ ...draft, name: "Sommerfest" }} />);
    const home = screen.getByLabelText("Home screen");
    expect(within(home).getByAltText("Sommerfest")).toBeTruthy();
    expect(within(home).getByAltText("maskable, circle")).toBeTruthy();
    expect(within(home).getByAltText("maskable, rounded")).toBeTruthy();
    expect(home.querySelector(".home-icon.circle")).not.toBeNull();
    expect(home.querySelector(".home-icon.squircle")).not.toBeNull();
  });
});

describe("theme package editor: layout (THM-11)", () => {
  it("[THM-11] follows every change at once", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("accent (#rrggbb)"), { target: { value: "#7a3b2e" } });
    expect(themed().style.getPropertyValue("--a-dark")).toBe("#7a3b2e");
    fireEvent.change(screen.getByLabelText("Name of the theme package"), {
      target: { value: "Winterfest" },
    });
    // the name is on the website bar and under the app icon
    expect(screen.getAllByText("Winterfest").length).toBeGreaterThanOrEqual(2);
  });

  it("[THM-11] rearranges for a narrow screen into the tabs Edit and Preview", () => {
    render(<App />);
    const main = document.querySelector(".editor-main");
    expect(main?.getAttribute("data-pane")).toBe("edit");
    const edit = screen.getByRole("button", { name: "Edit" });
    const preview = screen.getByRole("button", { name: "Preview" });
    expect(edit.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(preview);
    expect(main?.getAttribute("data-pane")).toBe("preview");
    expect(preview.getAttribute("aria-pressed")).toBe("true");
    expect(edit.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(edit);
    expect(main?.getAttribute("data-pane")).toBe("edit");
  });
});
