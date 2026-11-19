// The speech bubbles of the figures of one map, guests and NPCs together (PRES-10, GAME-37): which figures have an
// open bubble, which are pinned or were closed with their cross, and which of the open ones would overlap. The crowds
// say what they have, as participants, once a frame; the board decides, and draws the bubbles over the canvas.
import { BubbleLayer, type BubbleView } from "./bubble-layer.ts";
import {
  bubbleHeight,
  bubbleWidth,
  chooseBubbles,
  isNear,
  placeBubble,
  type BubbleCandidate,
  type BubbleContent,
} from "./bubble.ts";
import type { Point } from "./geometry.ts";

/** What the board needs to draw the speech bubbles over the canvas (PRES-10). */
export interface BubbleSetup {
  /** The element the bubbles are put in: the parent of the canvas. */
  parent: HTMLElement;
  closeLabel: string;
  /** The greeting of a guest who wrote none. */
  defaultGreeting?: string | undefined;
  /** A point of the map in the game view, in CSS pixels, and the size of the view. */
  project: (world: Point) => Point;
  viewSize: () => { width: number; height: number };
}

/** A figure that can have a bubble this frame. */
export interface BubbleParticipant {
  /** A key that stays the same for the figure: a guest's id, `npc:<name>` for an NPC. */
  id: string;
  /** The distance of the figure from the player, in map pixels. */
  distance: number;
  /** The top of the figure's head in the map's pixel space, which the tail points to. */
  head: Point;
  content: BubbleContent;
  /** The address of the picture of the circle; without one it shows the initials. */
  photo?: string | undefined;
  /** The bubble opens within this many tile widths (default 0.8) and closes beyond `closeTiles` (default 1.1). */
  openTiles?: number;
  closeTiles?: number;
  /**
   * What a tap or click on the bubble does instead of pinning it (an NPC with an action: walk there and run it).
   * Without it a tap pins the bubble until its cross is used.
   */
  onTap?: () => void;
}

interface State {
  pinned: boolean;
  /** The bubble was closed with its cross; it opens again only after the player has been away. */
  dismissed: boolean;
  open: boolean;
}

export class BubbleBoard {
  readonly #layer: BubbleLayer;
  readonly #setup: BubbleSetup;
  readonly #tileWidth: number;
  readonly #states = new Map<string, State>();
  readonly #taps = new Map<string, () => void>();

  constructor(setup: BubbleSetup, tileWidth: number) {
    this.#setup = setup;
    this.#tileWidth = tileWidth;
    this.#layer = new BubbleLayer(setup.parent, {
      onPin: (id) => {
        const tap = this.#taps.get(id);
        if (tap === undefined) this.#state(id).pinned = true;
        else tap();
      },
      onClose: (id) => {
        Object.assign(this.#state(id), { pinned: false, dismissed: true, open: false });
      },
      closeLabel: setup.closeLabel,
    });
  }

  #state(id: string): State {
    let state = this.#states.get(id);
    if (state === undefined) {
      state = { pinned: false, dismissed: false, open: false };
      this.#states.set(id, state);
    }
    return state;
  }

  /** Whether a figure's bubble is open now, and whether it is pinned (test hook). */
  isOpen(id: string): boolean {
    return this.#states.get(id)?.open ?? false;
  }

  isPinned(id: string): boolean {
    return this.#states.get(id)?.pinned ?? false;
  }

  /** The default greeting of a guest who wrote none. */
  get defaultGreeting(): string | undefined {
    return this.#setup.defaultGreeting;
  }

  /** Hides all bubbles, as while a page is open above the game (GAME-11), or shows those of the last update again. */
  setHidden(hidden: boolean): void {
    this.#layer.setHidden(hidden);
  }

  destroy(): void {
    this.#layer.destroy();
  }

  /**
   * One frame: the bubbles of the figures the player is close to, the pinned ones, and no overlapping ones, nearest
   * first. Returns the ids of the open bubbles; a figure with an open bubble stands still and faces the player.
   */
  update(participants: readonly BubbleParticipant[]): Set<string> {
    const setup = this.#setup;
    const view = setup.viewSize();
    const width = bubbleWidth(view.width);
    const known = new Set(participants.map((item) => item.id));
    for (const id of this.#states.keys()) if (!known.has(id)) this.#states.delete(id);
    this.#taps.clear();
    const places = new Map<string, ReturnType<BubbleBoard["place"]>>();
    const candidates: BubbleCandidate[] = [];
    for (const item of participants) {
      const state = this.#state(item.id);
      if (item.onTap !== undefined) this.#taps.set(item.id, item.onTap);
      const near = isNear(
        item.distance,
        this.#tileWidth,
        state.open,
        item.openTiles,
        item.closeTiles,
      );
      // A bubble closed with its cross opens again only after the player has been away.
      if (!near) state.dismissed = false;
      if (!state.pinned && (state.dismissed || !near)) continue;
      const place = this.place(item, width, view);
      places.set(item.id, place);
      candidates.push({
        id: item.id,
        distance: item.distance,
        pinned: state.pinned,
        box: { x: place.x, y: place.y, width, height: place.height },
      });
    }
    const shown = new Set(chooseBubbles(candidates));
    for (const [id, state] of this.#states) state.open = shown.has(id);
    this.#layer.update(
      participants.flatMap((item) => {
        const place = places.get(item.id);
        if (!shown.has(item.id) || place === undefined) return [];
        const view: BubbleView = {
          id: item.id,
          name: item.content.name,
          badge: item.content.badge,
          greeting: item.content.greeting,
          line: item.content.line,
          photo: item.photo,
          pinned: this.#state(item.id).pinned,
          x: place.x,
          y: place.y,
          width,
          tail: place.tail,
        };
        return [view];
      }),
    );
    return shown;
  }

  /** Where a bubble stands in the view, and how tall it is. */
  place(item: BubbleParticipant, width: number, view: { width: number; height: number }) {
    const head = this.#setup.project(item.head);
    const height = bubbleHeight(item.content, width);
    return { ...placeBubble(head, { width, height }, view), height };
  }
}
