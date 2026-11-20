// @vitest-environment jsdom
// The speech bubbles of guests, NPCs and objects together (PRES-10, GAME-37): who has an open bubble, what a tap on it
// does, that only one bubble is open at a time, and what a greeting bubble shows.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BubbleBoard, type BubbleParticipant } from "./bubble-board.ts";
import { GREETING_BUBBLE_CLOSE_TILES, GREETING_BUBBLE_OPEN_TILES } from "./bubble.ts";

const TILE = 64;
let parent: HTMLElement;
let board: BubbleBoard;

beforeEach(() => {
  parent = document.createElement("div");
  document.body.append(parent);
  board = new BubbleBoard(
    {
      parent,
      closeLabel: "Schliessen",
      project: (point) => point,
      viewSize: () => ({ width: 800, height: 600 }),
    },
    TILE,
  );
});
afterEach(() => {
  board.destroy();
  parent.remove();
});

const guest = (id: string, distance: number, changes: Partial<BubbleParticipant> = {}) => ({
  id,
  distance,
  head: { x: 300, y: 300 },
  content: { name: `Gast ${id}` },
  ...changes,
});
const npc = (distance: number, changes: Partial<BubbleParticipant> = {}) => ({
  id: "npc:kuester",
  distance,
  head: { x: 300, y: 300 },
  content: { name: "Küster", greeting: "Psst!", compact: true },
  openTiles: GREETING_BUBBLE_OPEN_TILES,
  closeTiles: GREETING_BUBBLE_CLOSE_TILES,
  ...changes,
});
const altar = (distance: number, changes: Partial<BubbleParticipant> = {}) => ({
  id: "object:altar",
  distance,
  head: { x: 300, y: 300 },
  content: { name: "Programm", greeting: "Hier geht's zum Programm.", compact: true },
  openTiles: GREETING_BUBBLE_OPEN_TILES,
  closeTiles: GREETING_BUBBLE_CLOSE_TILES,
  ...changes,
});
const bubbles = () => [...parent.querySelectorAll("[data-testid=guest-bubble]")];

describe("who has an open bubble", () => {
  it("[PRES-10] a guest's bubble opens within 0.8 tile widths and closes beyond 1.1", () => {
    expect(board.update([guest("a", 0.9 * TILE)])).toEqual(new Set());
    expect(board.update([guest("a", 0.8 * TILE)])).toEqual(new Set(["a"]));
    expect(board.update([guest("a", 1.05 * TILE)])).toEqual(new Set(["a"]));
    expect(board.update([guest("a", 1.2 * TILE)])).toEqual(new Set());
    expect(bubbles()).toHaveLength(0);
  });

  it("[GAME-37] the bubble of an NPC or an object with a greeting opens within 2 tile widths and closes beyond 2.25", () => {
    expect(board.update([npc(2.1 * TILE)])).toEqual(new Set());
    expect(board.update([npc(2 * TILE)])).toEqual(new Set(["npc:kuester"]));
    expect(board.isOpen("npc:kuester")).toBe(true);
    expect(board.update([npc(2.2 * TILE)])).toEqual(new Set(["npc:kuester"]));
    expect(board.update([npc(2.4 * TILE)])).toEqual(new Set());
    expect(board.isOpen("npc:kuester")).toBe(false);
    expect(bubbles()).toHaveLength(0);
    expect(board.update([altar(2 * TILE)])).toEqual(new Set(["object:altar"]));
  });

  it("[GAME-37] a greeting bubble holds the greeting only: no portrait, no initials, no name, as small as the text allows", () => {
    board.update([npc(0.5 * TILE)]);
    const [bubble] = bubbles() as HTMLElement[];
    expect(bubble?.textContent).toBe("Psst!");
    expect(bubble?.querySelector("img")).toBeNull();
    expect(bubble?.children.length).toBe(1);
    // A screen reader still hears who speaks; the box hugs its text up to the width of a bubble.
    expect(bubble?.getAttribute("aria-label")).toBe("Küster");
    expect(bubble?.dataset.compact).toBe("true");
    expect(bubble?.style.width).toBe("max-content");
    expect(Number.parseInt(bubble?.style.maxWidth ?? "0")).toBeLessThanOrEqual(240);
    expect(bubble?.style.display).toBe("block");
  });

  it("[PRES-10] the bubble of a guest keeps its picture, name, badge and lines", () => {
    board.update([
      guest("a", 0.5 * TILE, {
        content: { name: "Erika", badge: "Freunde Braut", greeting: "Hallo!", line: "WG Bern" },
      }),
    ]);
    const [bubble] = bubbles() as HTMLElement[];
    expect(bubble?.dataset.compact).toBe("false");
    expect(bubble?.textContent).toContain("Erika");
    expect(bubble?.textContent).toContain("Freunde Braut");
    expect(bubble?.textContent).toContain("WG Bern");
    expect(bubble?.style.display).toBe("flex");
  });

  it("[GAME-37] a greeting bubble stands on its figure's head, the label being hidden while it is open", () => {
    // The head at 300: the tail ends 8 px above it, where the bubble's gap is, whatever the figure's label is.
    const bubble = board.place(altar(0), 400, { width: 800, height: 600 });
    expect(bubble.y + bubble.height).toBe(300 - 8);
  });

  it("[GAME-37][PRES-10] only one bubble is open at a time: of a guest, an NPC and an object whose range the player is in, the nearest", () => {
    const all = (npcDistance: number, guestDistance: number, objectDistance: number) =>
      board.update([
        npc(npcDistance),
        guest("a", guestDistance, { head: { x: 600, y: 400 } }),
        altar(objectDistance, { head: { x: 100, y: 200 } }),
      ]);
    expect(all(0.9 * TILE, 0.5 * TILE, 0.95 * TILE)).toEqual(new Set(["a"]));
    expect(bubbles()).toHaveLength(1);
    // The guest is out of its small range: the nearer greeting shows, the other gives way.
    expect(all(0.6 * TILE, 0.9 * TILE, 1 * TILE)).toEqual(new Set(["npc:kuester"]));
    expect(all(0.9 * TILE, 0.95 * TILE, 0.5 * TILE)).toEqual(new Set(["object:altar"]));
    expect(bubbles()).toHaveLength(1);
    expect(board.isOpen("npc:kuester")).toBe(false);
  });
});

describe("a tap on a bubble", () => {
  it("[PRES-10] pins the bubble of a guest, which then stays open from afar until its cross is used", () => {
    board.update([guest("a", 0.5 * TILE)]);
    (bubbles()[0] as HTMLElement).click();
    board.update([guest("a", 0.5 * TILE)]);
    expect(board.isPinned("a")).toBe(true);
    expect(board.update([guest("a", 5 * TILE)])).toEqual(new Set(["a"]));
    parent.querySelector<HTMLElement>("button[aria-label=Schliessen]")?.click();
    expect(board.isPinned("a")).toBe(false);
    expect(board.update([guest("a", 0.5 * TILE)])).toEqual(new Set());
    // It opens again after the player has been away.
    board.update([guest("a", 5 * TILE)]);
    expect(board.update([guest("a", 0.5 * TILE)])).toEqual(new Set(["a"]));
  });

  it("[PRES-10][GAME-37] while a guest's bubble is pinned no other bubble opens, however near the figure is", () => {
    board.update([guest("a", 0.5 * TILE)]);
    (bubbles()[0] as HTMLElement).click();
    expect(board.update([guest("a", 5 * TILE), npc(0.5 * TILE), altar(0.2 * TILE)])).toEqual(
      new Set(["a"]),
    );
    expect(bubbles()).toHaveLength(1);
    // After its cross the nearest opens.
    parent.querySelector<HTMLElement>("button[aria-label=Schliessen]")?.click();
    expect(board.update([guest("a", 5 * TILE), npc(0.5 * TILE), altar(0.2 * TILE)])).toEqual(
      new Set(["object:altar"]),
    );
  });

  it("[GAME-37] on the bubble of an NPC with an action does what a tap on the NPC does, and does not pin it", () => {
    const onTap = vi.fn();
    board.update([npc(0.5 * TILE, { onTap })]);
    (bubbles()[0] as HTMLElement).click();
    expect(onTap).toHaveBeenCalledOnce();
    board.update([npc(0.5 * TILE, { onTap })]);
    expect(board.isPinned("npc:kuester")).toBe(false);
  });

  it("[GAME-37] on the bubble of an NPC without an action pins it, like a guest's", () => {
    board.update([npc(0.5 * TILE)]);
    (bubbles()[0] as HTMLElement).click();
    board.update([npc(0.5 * TILE)]);
    expect(board.isPinned("npc:kuester")).toBe(true);
  });
});

describe("hiding the bubbles while a page is open (GAME-11)", () => {
  it("[GAME-11] the bubble is not displayed while hidden, and is again when shown", () => {
    board.update([npc(0.5 * TILE)]);
    expect((bubbles()[0] as HTMLElement).style.display).toBe("block");
    board.setHidden(true);
    expect((bubbles()[0] as HTMLElement).style.display).toBe("none");
    // A bubble made while hidden is hidden too, whatever its kind.
    board.update([guest("a", 0.5 * TILE)]);
    expect(bubbles().map((bubble) => (bubble as HTMLElement).style.display)).toEqual(["none"]);
    board.setHidden(false);
    expect(bubbles().map((bubble) => (bubble as HTMLElement).style.display)).toEqual(["flex"]);
    board.update([altar(2 * TILE)]);
    expect(bubbles().map((bubble) => (bubble as HTMLElement).style.display)).toEqual(["block"]);
  });
});
