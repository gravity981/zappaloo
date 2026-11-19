// @vitest-environment jsdom
// The bubbles of guests and NPCs together (PRES-10, GAME-37): who has an open bubble, what a tap on it does, and which
// of two overlapping bubbles shows.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BubbleBoard, type BubbleParticipant } from "./bubble-board.ts";
import { NPC_BUBBLE_CLOSE_TILES, NPC_BUBBLE_OPEN_TILES } from "./bubble.ts";

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
  content: { name: "Küster", greeting: "Psst!" },
  openTiles: NPC_BUBBLE_OPEN_TILES,
  closeTiles: NPC_BUBBLE_CLOSE_TILES,
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

  it("[GAME-37] an NPC's bubble opens from 3 tile widths and closes beyond 3.5", () => {
    expect(board.update([npc(3.1 * TILE)])).toEqual(new Set());
    expect(board.update([npc(3 * TILE)])).toEqual(new Set(["npc:kuester"]));
    expect(board.isOpen("npc:kuester")).toBe(true);
    expect(board.update([npc(3.4 * TILE)])).toEqual(new Set(["npc:kuester"]));
    expect(board.update([npc(3.6 * TILE)])).toEqual(new Set());
    expect(board.isOpen("npc:kuester")).toBe(false);
    expect(bubbles()).toHaveLength(0);
  });

  it("[GAME-37] an open bubble shows the name and the short dialog of the NPC", () => {
    board.update([npc(2 * TILE)]);
    const [bubble] = bubbles();
    expect(bubble?.textContent).toContain("Küster");
    expect(bubble?.textContent).toContain("Psst!");
  });

  it("[GAME-37][PRES-10] bubbles of an NPC and of a guest can be open at once, and of two that would overlap only the nearer shows", () => {
    // Heads far apart: both show.
    const apart = board.update([
      npc(2 * TILE),
      guest("a", 0.5 * TILE, { head: { x: 600, y: 400 } }),
    ]);
    expect(apart).toEqual(new Set(["npc:kuester", "a"]));
    expect(bubbles()).toHaveLength(2);
    // The same spot: the guest is nearer, the NPC's bubble gives way.
    const together = board.update([npc(2 * TILE), guest("a", 0.5 * TILE)]);
    expect(together).toEqual(new Set(["a"]));
    // And the other way round.
    const nearer = board.update([npc(0.4 * TILE), guest("a", 0.7 * TILE)]);
    expect(nearer).toEqual(new Set(["npc:kuester"]));
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

  it("[GAME-37] on the bubble of an NPC with an action does what a tap on the NPC does, and does not pin it", () => {
    const onTap = vi.fn();
    board.update([npc(2 * TILE, { onTap })]);
    (bubbles()[0] as HTMLElement).click();
    expect(onTap).toHaveBeenCalledOnce();
    board.update([npc(2 * TILE, { onTap })]);
    expect(board.isPinned("npc:kuester")).toBe(false);
  });

  it("[GAME-37] on the bubble of an NPC without an action pins it, like a guest's", () => {
    board.update([npc(2 * TILE)]);
    (bubbles()[0] as HTMLElement).click();
    board.update([npc(2 * TILE)]);
    expect(board.isPinned("npc:kuester")).toBe(true);
  });
});

describe("hiding the bubbles while a page is open (GAME-11)", () => {
  it("[GAME-11] the bubbles are not displayed while hidden, and are again when shown", () => {
    board.update([npc(2 * TILE)]);
    expect((bubbles()[0] as HTMLElement).style.display).toBe("flex");
    board.setHidden(true);
    expect((bubbles()[0] as HTMLElement).style.display).toBe("none");
    // A bubble made while hidden is hidden too.
    board.update([npc(2 * TILE), guest("a", 0.5 * TILE, { head: { x: 600, y: 400 } })]);
    expect(bubbles().map((bubble) => (bubble as HTMLElement).style.display)).toEqual([
      "none",
      "none",
    ]);
    board.setHidden(false);
    expect(bubbles().map((bubble) => (bubble as HTMLElement).style.display)).toEqual([
      "flex",
      "flex",
    ]);
  });
});
