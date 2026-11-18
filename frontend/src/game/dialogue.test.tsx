// The dialogue box of the game (CNT-02, CNT-08): the NPC talks line by line over the paused game.
import { fireEvent, render, screen } from "@testing-library/react";
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

/** The box ignores a tap or a key that comes right after it opened (they belong to what opened it). */
const settled = () => new Promise((resolve) => setTimeout(resolve, 350));

describe("the dialogue box", () => {
  it("[CNT-02] shows the NPC's name, the first line as Markdown and how far the dialogue is", async () => {
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

  it("[CNT-02] Enter and Space go on, Escape and the cross close at once", async () => {
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
    unmount();
    backend(dialogue());
    const second = vi.fn();
    render(<DialogueBox id="pfarrer" onClose={second} />);
    fireEvent.click(await screen.findByRole("button", { name: "Dialog schliessen" }));
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("[CNT-02] the key or tap that opened the dialogue does not also turn its first page", async () => {
    backend(dialogue());
    render(<DialogueBox id="pfarrer" onClose={vi.fn()} />);
    const layer = await screen.findByTestId("dialogue-layer");
    fireEvent.click(layer);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByTestId("dialogue-box")).toHaveTextContent("1 / 3");
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
