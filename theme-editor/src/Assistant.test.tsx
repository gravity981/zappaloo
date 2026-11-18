import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App.tsx";
import { memoryStore } from "./draftStore.ts";
import { suggestPalettes } from "./palette.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const hex = (label: string) => screen.getByLabelText<HTMLInputElement>(`${label} (#rrggbb)`);
const card = (name: string) => screen.getByRole("button", { name: `${name} palette` });
const palette = (id: string, master = "#2a2a28") => {
  const found = suggestPalettes(master).find((p) => p.id === id);
  if (found === undefined) throw new Error(id);
  return found;
};

describe("theme package editor: colour assistant (THM-15)", () => {
  it("[THM-15] starts with the master colour, which is the accent, and seven palette cards that all pass", () => {
    render(<App store={memoryStore()} />);
    expect(hex("master colour").value).toBe("#2a2a28");
    expect(hex("accent").value).toBe("#2a2a28");
    const cards = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-label")?.endsWith(" palette"));
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual([
      "Tint palette",
      "Neutral palette",
      "Warm paper palette",
      "Cool palette",
      "Soft complement palette",
      "Analogous palette",
      "High contrast palette",
    ]);
    for (const c of cards) expect(within(c).getByText("✓ all pairs")).toBeTruthy();
  });

  it("[THM-15] the master colour and the accent are one colour: editing one changes the other and the cards", () => {
    render(<App store={memoryStore()} />);
    const before = card("Tint").querySelector("i")?.getAttribute("style");
    fireEvent.change(hex("master colour"), { target: { value: "#7a3b2e" } });
    expect(hex("accent").value).toBe("#7a3b2e");
    expect(card("Tint").querySelector("i")?.getAttribute("style")).not.toBe(before);
    fireEvent.change(hex("accent"), { target: { value: "#2f6b4f" } });
    expect(hex("master colour").value).toBe("#2f6b4f");
  });

  it("[THM-15] picking a card fills the seven colours, keeps the accent and passes the contrast check", () => {
    render(<App store={memoryStore()} />);
    fireEvent.change(hex("master colour"), { target: { value: "#7a3b2e" } });
    fireEvent.click(card("Warm paper"));
    const expected = palette("warm", "#7a3b2e").colors;
    for (const key of [
      "background",
      "surface",
      "text",
      "muted",
      "line",
      "accent",
      "onAccent",
    ] as const) {
      expect(hex(key).value, key).toBe(expected[key]);
    }
    expect(hex("accent").value).toBe("#7a3b2e");
    const check = screen.getByRole("region", { name: "Contrast check" });
    expect(within(check).queryAllByText(/✗/)).toHaveLength(0);
    expect(within(check).getAllByText(/✓/)).toHaveLength(3);
    expect(card("Warm paper").getAttribute("aria-pressed")).toBe("true");
    expect(card("Tint").getAttribute("aria-pressed")).toBe("false");
  });

  it("[THM-15] colours edited after picking a card stay, and the card is no longer marked", () => {
    render(<App store={memoryStore()} />);
    fireEvent.click(card("Cool"));
    fireEvent.change(hex("line"), { target: { value: "#ff00ff" } });
    expect(hex("line").value).toBe("#ff00ff");
    expect(hex("background").value).toBe(palette("cool").colors.background);
    expect(card("Cool").getAttribute("aria-pressed")).toBe("false");
  });

  it("[THM-15] the waiting card colours are filled only when they are switched on", () => {
    render(<App store={memoryStore()} />);
    fireEvent.click(card("Tint"));
    fireEvent.click(screen.getByRole("switch", { name: "Own waiting card colours" }));
    // switched on after picking: the platform's waiting colours, not the palette's
    expect(hex("waiting card").value).toBe("#fffaf0");
    fireEvent.click(card("Neutral"));
    expect(hex("waiting card").value).toBe(palette("neutral").waiting.card);
    expect(hex("waiting button").value).toBe(palette("neutral").waiting.button);
    const check = screen.getByRole("region", { name: "Contrast check" });
    expect(within(check).queryAllByText(/✗/)).toHaveLength(0);
    expect(within(check).getAllByText(/✓/)).toHaveLength(5);
  });

  it("[THM-15] «Surprise me» sets a random master colour with readable text on it", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.3);
    render(<App store={memoryStore()} />);
    fireEvent.click(screen.getByRole("button", { name: "Surprise me" }));
    const accent = hex("accent").value;
    expect(accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(accent).not.toBe("#2a2a28");
    expect(hex("master colour").value).toBe(accent);
    expect(["#000000", "#ffffff"]).toContain(hex("onAccent").value);
    const check = screen.getByRole("region", { name: "Contrast check" });
    expect(
      within(check).getByText("onAccent on accent").closest(".setrow")?.getAttribute("data-ok"),
    ).toBe("true");
  });

  it("[THM-15] without a full #rrggbb master colour there are no cards, only a hint", () => {
    render(<App store={memoryStore()} />);
    fireEvent.change(hex("master colour"), { target: { value: "#7a3" } });
    expect(screen.queryByRole("button", { name: "Tint palette" })).toBeNull();
    expect(screen.getByText(/Enter a full #rrggbb colour as the master colour/)).toBeTruthy();
    fireEvent.change(hex("master colour"), { target: { value: "#7a3b2e" } });
    expect(card("Tint")).toBeTruthy();
  });
});
