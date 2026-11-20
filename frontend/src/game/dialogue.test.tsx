// The dialogue box of the game (CNT-02, CNT-08): the NPC talks line by line over the paused game.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/i18n.ts";
import { fakeBackend } from "../test/backend.tsx";
import DialogueBox from "./DialogueBox.tsx";

beforeAll(async () => {
  await initI18n();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const dialogue = (changes: Record<string, unknown> = {}) => ({
  id: "pfarrer",
  npcName: "Pfarrer Keller",
  lines: [
    "Grüss Gott! Schön, dass du da bist.",
    "Die Trauung beginnt um **14:00**.",
    "Bis gleich!",
  ],
  portrait: null,
  ...changes,
});

function backend(body: unknown, status = 200) {
  return fakeBackend({ "GET /api/dialogues/pfarrer": () => ({ status, body }) });
}

/**
 * The box ignores a tap or a key that comes right after it opened (they belong to what opened it) and says when it takes
 * them (`data-settled`): the tests wait for that, not for the clock.
 */
const settled = () =>
  waitFor(() => {
    expect(screen.getByTestId("dialogue-box")).toHaveAttribute("data-settled", "true");
  });

/** The guest asks the system for less motion: the text is there at once (CNT-10). */
function reduceMotion() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

/** The page in view has typed its last character. */
const typed = () =>
  waitFor(() => {
    expect(screen.getByTestId("dialogue-layer")).toHaveAttribute("data-typing", "false");
  });

describe("the dialogue box", () => {
  it("[CNT-02] shows the NPC's name, the first line as Markdown and how far the dialogue is", async () => {
    reduceMotion();
    backend(dialogue());
    render(<DialogueBox id="pfarrer" onClose={vi.fn()} />);
    const box = await screen.findByRole("dialog", { name: "Pfarrer Keller" });
    expect(box).toHaveTextContent("Pfarrer Keller");
    expect(box).toHaveTextContent("Grüss Gott! Schön, dass du da bist.");
    expect(box).toHaveTextContent("1 / 3 · Tippen für weiter");
    // No portrait: no picture.
    expect(box.querySelector("img")).toBeNull();
  });

  it("[CNT-02] a tap goes on line by line, Markdown is shown formatted, and the last tap closes", async () => {
    reduceMotion();
    backend(dialogue());
    const onClose = vi.fn();
    render(<DialogueBox id="pfarrer" onClose={onClose} />);
    const layer = await screen.findByTestId("dialogue-layer");
    await settled();
    fireEvent.click(layer);
    const box = screen.getByTestId("dialogue-box");
    expect(box).toHaveTextContent("2 / 3");
    expect(box.querySelector("strong")).toHaveTextContent("14:00");
    fireEvent.click(layer);
    expect(box).toHaveTextContent("3 / 3 · Tippen zum Schliessen");
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(layer);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("[CNT-02] Enter and Space go on, Escape closes at once, and the box has no cross", async () => {
    reduceMotion();
    backend(dialogue());
    const onClose = vi.fn();
    const { unmount } = render(<DialogueBox id="pfarrer" onClose={onClose} />);
    await screen.findByTestId("dialogue-box");
    await settled();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByTestId("dialogue-box")).toHaveTextContent("2 / 3");
    // A held key does not turn the pages one after the other.
    fireEvent.keyDown(window, { key: " ", repeat: true });
    expect(screen.getByTestId("dialogue-box")).toHaveTextContent("2 / 3");
    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByTestId("dialogue-box")).toHaveTextContent("3 / 3");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    // Nothing to tap to leave early: the guest taps through or presses Escape.
    expect(screen.queryByRole("button", { name: "Dialog schliessen" })).toBeNull();
    unmount();
  });

  it("[CNT-02] the key or tap that opened the dialogue does not also turn its first page; the box says when it takes taps", async () => {
    reduceMotion();
    backend(dialogue());
    render(<DialogueBox id="pfarrer" onClose={vi.fn()} />);
    const layer = await screen.findByTestId("dialogue-layer");
    // Just opened: it does not take taps yet, and says so.
    expect(screen.getByTestId("dialogue-box")).toHaveAttribute("data-settled", "false");
    fireEvent.click(layer);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByTestId("dialogue-box")).toHaveTextContent("1 / 3");
    // Then it does: the next tap turns the page.
    await settled();
    fireEvent.click(layer);
    expect(screen.getByTestId("dialogue-box")).toHaveTextContent("2 / 3");
  });

  it("[CNT-10] the line types itself out, with its Markdown, and the arrow shows once the whole page is there", async () => {
    backend(dialogue());
    render(<DialogueBox id="pfarrer" onClose={vi.fn()} />);
    const layer = await screen.findByTestId("dialogue-layer");
    const arrow = () => layer.querySelector(".dialogue-next");
    // Typing: the text is not all there yet, and the arrow is not shown.
    expect(layer).toHaveAttribute("data-typing", "true");
    expect((layer.querySelector(".markdown")?.textContent ?? "").length).toBeLessThan(
      "Grüss Gott! Schön, dass du da bist.".length,
    );
    expect(arrow()).toHaveAttribute("data-visible", "false");
    await typed();
    expect(layer.querySelector(".markdown")).toHaveTextContent(
      "Grüss Gott! Schön, dass du da bist.",
    );
    expect(arrow()).toHaveAttribute("data-visible", "true");
  });

  it("[CNT-10] the text is not lost when React runs the effects twice (StrictMode, as in the app)", async () => {
    backend(dialogue());
    render(
      <StrictMode>
        <DialogueBox id="pfarrer" onClose={vi.fn()} />
      </StrictMode>,
    );
    const layer = await screen.findByTestId("dialogue-layer");
    await typed();
    expect(layer.querySelector(".markdown")).toHaveTextContent(
      "Grüss Gott! Schön, dass du da bist.",
    );
  });

  it("[CNT-10] the Markdown of a line keeps its formatting while it types", async () => {
    backend(dialogue({ lines: ["Die Trauung beginnt um **14:00** Uhr."] }));
    render(<DialogueBox id="pfarrer" onClose={vi.fn()} />);
    const layer = await screen.findByTestId("dialogue-layer");
    expect(layer.querySelector(".markdown strong")).not.toBeNull();
    await typed();
    expect(layer.querySelector(".markdown strong")).toHaveTextContent("14:00");
    expect(layer.querySelector(".markdown")).toHaveTextContent("Die Trauung beginnt um 14:00 Uhr.");
  });

  it("[CNT-10] a tap while the page types shows all of it; the next tap goes on", async () => {
    backend(dialogue());
    render(<DialogueBox id="pfarrer" onClose={vi.fn()} />);
    const layer = await screen.findByTestId("dialogue-layer");
    await settled();
    expect(layer).toHaveAttribute("data-typing", "true");
    fireEvent.click(layer);
    expect(layer).toHaveAttribute("data-typing", "false");
    expect(screen.getByTestId("dialogue-box")).toHaveTextContent("1 / 3");
    expect(layer.querySelector(".markdown")).toHaveTextContent(
      "Grüss Gott! Schön, dass du da bist.",
    );
    expect(layer.querySelector(".dialogue-next")).toHaveAttribute("data-visible", "true");
    fireEvent.click(layer);
    expect(screen.getByTestId("dialogue-box")).toHaveTextContent("2 / 3");
    // The new page types again, without the arrow.
    expect(layer).toHaveAttribute("data-typing", "true");
    expect(layer.querySelector(".dialogue-next")).toHaveAttribute("data-visible", "false");
  });

  it("[CNT-10] a guest who prefers reduced motion gets the whole page at once, with the arrow", async () => {
    reduceMotion();
    backend(dialogue());
    render(<DialogueBox id="pfarrer" onClose={vi.fn()} />);
    const layer = await screen.findByTestId("dialogue-layer");
    expect(layer).toHaveAttribute("data-typing", "false");
    expect(layer.querySelector(".markdown")).toHaveTextContent(
      "Grüss Gott! Schön, dass du da bist.",
    );
    expect(layer.querySelector(".dialogue-next")).toHaveAttribute("data-visible", "true");
  });

  it("[CNT-08] the portrait is shown on the left from the portrait route, with its version; small pictures are not smoothed", async () => {
    backend(dialogue({ portrait: 1234 }));
    render(<DialogueBox id="pfarrer" onClose={vi.fn()} />);
    const box = await screen.findByTestId("dialogue-box");
    const picture = box.querySelector("img");
    if (picture === null) throw new Error("no portrait");
    expect(picture).toHaveAttribute("src", "/api/dialogues/pfarrer/portrait?v=1234");
    expect(box.firstElementChild).toBe(picture);
    // A picture of 64 pixels is pixel art.
    Object.defineProperty(picture, "naturalWidth", { value: 64, configurable: true });
    Object.defineProperty(picture, "naturalHeight", { value: 64, configurable: true });
    fireEvent.load(picture);
    expect(picture).toHaveClass("pixelated");
    Object.defineProperty(picture, "naturalWidth", { value: 400, configurable: true });
    fireEvent.load(picture);
    expect(picture).not.toHaveClass("pixelated");
  });

  it("[CNT-02] a dialogue that cannot be loaded says so and can be closed", async () => {
    backend({ error: { code: "dialogue_not_found", message: "x" } }, 404);
    const onClose = vi.fn();
    render(<DialogueBox id="pfarrer" onClose={onClose} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("konnte nicht geladen werden");
    fireEvent.click(screen.getByRole("button", { name: "Dialog schliessen" }));
    expect(onClose).toHaveBeenCalled();
  });
});
