// The wandering guest figures of one map as the scene draws them (PRES-01, PRES-02, PRES-08): a sprite with the
// walk animation, the shadow of the player's figure (GAME-28) and a name tag above the head. The figures are
// simulated on this device only. A guest near the player stands still, turns to them and opens a speech bubble
// (PRES-10); a click or tap pins the bubble until its cross closes it.
import Phaser from "phaser";
import type { GuestFigure } from "@zappaloo/shared";
import { playerCollisionEllipse, walkable } from "./collision.ts";
import { figureDepth } from "./draw-order.ts";
import { SHADOW_DEPTH_BELOW, figureShadow } from "./figure-shadow.ts";
import { walkFrameIndex } from "./figures.ts";
import { cellCentre } from "./collision.ts";
import type { Point } from "./geometry.ts";
import type { ParsedMap } from "./map-model.ts";
import { SPEED_TILES_PER_SECOND } from "./movement.ts";

/** The guest figures stroll: a quarter of the player's speed (decided 2026-11-18). */
export const GUEST_SPEED_FACTOR = 0.25;
import { startCells, walkRoute } from "./navigation.ts";
import { cellKey, findPath, reachableCells, type Cell, type Grid } from "./pathfinding.ts";
import { BubbleLayer, type BubbleView } from "./bubble-layer.ts";
import {
  bubbleHeight,
  bubbleWidth,
  chooseBubbles,
  isNear,
  placeBubble,
  type BubbleCandidate,
} from "./bubble.ts";
import { directionOf } from "./movement.ts";
import { drawNameTag } from "./name-tag.ts";
import { snapToPixelGrid } from "./pixel-grid.ts";
import { playerSpritePosition } from "./player-anchor.ts";
import type { LoadedWorld } from "./world-data.ts";
import { Wanderer, guestsOnMap, tagText, waitDuration, wanderCells } from "./wander.ts";

/** The longest step of one frame, so that a stalled tab does not make the figures jump across the map. */
const MAX_DELTA_MS = 100;

/** What the crowd needs to draw the speech bubbles over the canvas (PRES-10). */
export interface BubbleSetup {
  /** The element the bubbles are put in: the parent of the canvas. */
  parent: HTMLElement;
  closeLabel: string;
  /** The greeting of a guest who wrote none. */
  defaultGreeting?: string | undefined;
  /** A point of the map in the game view, in CSS pixels, and the size of the view. */
  project: (world: Point) => Point;
  viewSize: () => { width: number; height: number };
  /** The address of a guest's photo. */
  photoOf?: ((guest: GuestFigure) => string | undefined) | undefined;
}

/** What the test hook shows of a guest figure. */
export interface GuestState {
  id: string;
  name: string;
  x: number;
  y: number;
  moving: boolean;
  /** Whether its speech bubble is open, and pinned (test hook). */
  bubble: boolean;
  pinned: boolean;
}

interface Member {
  guest: GuestFigure;
  figure: LoadedWorld["figures"][number];
  wanderer: Wanderer;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  tag: Phaser.GameObjects.Image | undefined;
  /** Device pixels per CSS pixel of the tag's texture. */
  tagRatio: number;
  region: { keys: ReadonlySet<string>; cells: Cell[] };
  clock: number;
  /** The bubble is open, pinned by the player, or closed by them while they are still close (until they leave). */
  open: boolean;
  pinned: boolean;
  dismissed: boolean;
}

export class GuestCrowd {
  readonly #map: ParsedMap;
  readonly #grid: Grid;
  readonly #zoom: number;
  readonly #ratio: () => number;
  readonly #members: Member[] = [];
  readonly #bubbles: BubbleLayer | undefined;
  readonly #setup: BubbleSetup | undefined;

  constructor(
    scene: Phaser.Scene,
    map: ParsedMap,
    world: LoadedWorld,
    grid: Grid,
    guests: readonly GuestFigure[],
    zoom: number,
    ratio: () => number,
    bubbles?: BubbleSetup,
  ) {
    this.#setup = bubbles;
    this.#bubbles =
      bubbles === undefined
        ? undefined
        : new BubbleLayer(bubbles.parent, {
            onPin: (id) => {
              this.#set(id, { pinned: true });
            },
            onClose: (id) => {
              this.#set(id, { pinned: false, dismissed: true, open: false });
            },
            closeLabel: bubbles.closeLabel,
          });
    this.#map = map;
    this.#grid = grid;
    this.#zoom = zoom;
    this.#ratio = ratio;
    const cells = wanderCells(map, grid);
    if (cells.length === 0) return;
    const regions: Member["region"][] = [];
    for (const guest of guestsOnMap(world, map, guests)) {
      const figure = world.figures.find((item) => item.id === guest.figure);
      const startCell = cells[Math.floor(Math.random() * cells.length)];
      if (figure === undefined || startCell === undefined) continue;
      let region = regions.find((item) => item.keys.has(cellKey(startCell)));
      if (region === undefined) {
        const keys = reachableCells(grid, startCell);
        region = { keys, cells: cells.filter((cell) => keys.has(cellKey(cell))) };
        regions.push(region);
      }
      const position = cellCentre(startCell.column, startCell.row, map.size);
      const wanderer = new Wanderer(position, Math.random() * waitDuration(Math.random));
      const sprite = scene.add.sprite(0, 0, figure.standing.south).setOrigin(0.5, 1);
      const shadow = scene.add.ellipse(0, 0, 1, 1, 0x000000, 1);
      // The tag is the pill of the edge-indicator labels, a texture of the name at this device's pixel ratio.
      const tagRatio = ratio();
      const image = drawNameTag(tagText(guest.name), tagRatio);
      const key = `name-tag:${tagText(guest.name)}:${String(tagRatio)}`;
      if (image !== undefined && !scene.textures.exists(key)) {
        scene.textures.addCanvas(key, image.canvas);
      }
      const tag = image === undefined ? undefined : scene.add.image(0, 0, key).setOrigin(0.5, 1);
      const member: Member = {
        guest,
        figure,
        wanderer,
        sprite,
        shadow,
        tag,
        tagRatio,
        region,
        clock: 0,
        open: false,
        pinned: false,
        dismissed: false,
      };
      this.#members.push(member);
      this.#place(member);
    }
  }

  /** The guests on this map, for the test hook. */
  get states(): GuestState[] {
    return this.#members.map(({ guest, wanderer, open, pinned }) => ({
      id: guest.id,
      name: guest.name,
      x: Math.round(wanderer.position.x),
      y: Math.round(wanderer.position.y),
      moving: wanderer.moving,
      bubble: open,
      pinned,
    }));
  }

  /** Changes the state of one guest's bubble (a click or tap on it, or its cross). */
  #set(id: string, change: Partial<Pick<Member, "pinned" | "dismissed" | "open">>): void {
    const member = this.#members.find((item) => item.guest.id === id);
    if (member !== undefined) Object.assign(member, change);
  }

  /** Hides the bubbles while a page is open above the game (GAME-11), or shows them again. */
  setBubblesHidden(hidden: boolean): void {
    this.#bubbles?.setHidden(hidden);
  }

  destroy(): void {
    this.#bubbles?.destroy();
  }

  /**
   * One frame: the figures walk or stand, and the bubbles open for the guests the player is close to. A guest with an
   * open bubble stands still and faces the player; the bubble closes when the player walks away, unless it is pinned,
   * and a bubble closed with its cross stays closed until the player has been away (PRES-10).
   */
  update(delta: number, player: Point): void {
    const map = this.#map;
    const dt = Math.min(delta, MAX_DELTA_MS);
    const step = (map.size.width * SPEED_TILES_PER_SECOND * GUEST_SPEED_FACTOR * dt) / 1000;
    const shown = this.#chooseOpen(player);
    for (const member of this.#members) {
      member.open = shown.has(member.guest.id);
      member.wanderer.held = member.open;
      if (member.open) {
        member.wanderer.direction = directionOf({
          x: player.x - member.wanderer.position.x,
          y: player.y - member.wanderer.position.y,
        });
      }
      member.wanderer.update(dt, step, {
        random: Math.random,
        isWalkable: (point) =>
          walkable(map.obstacles, playerCollisionEllipse(point, map.size.width)),
        route: (from) => this.#route(member, from),
      });
      member.clock = member.wanderer.moving ? member.clock + dt : 0;
      this.#place(member);
    }
    this.#bubbles?.update(this.#views(shown));
  }

  /** The distance of a guest from the player, in map pixels. */
  #distance(member: Member, player: Point): number {
    return Math.hypot(member.wanderer.position.x - player.x, member.wanderer.position.y - player.y);
  }

  /** The guests whose bubble is open: the ones the player is close to, pinned ones, and no overlapping ones. */
  #chooseOpen(player: Point): Set<string> {
    const setup = this.#setup;
    if (setup === undefined) return new Set();
    const view = setup.viewSize();
    const width = bubbleWidth(view.width);
    const candidates: BubbleCandidate[] = [];
    for (const member of this.#members) {
      const distance = this.#distance(member, player);
      const near = isNear(distance, this.#map.size.width, member.open);
      // A bubble closed with its cross opens again only after the player has been away.
      if (!near) member.dismissed = false;
      if (!member.pinned && (member.dismissed || !near)) continue;
      const place = this.#placeOf(member, width, view);
      candidates.push({
        id: member.guest.id,
        distance,
        pinned: member.pinned,
        box: { x: place.x, y: place.y, width, height: place.height },
      });
    }
    return new Set(chooseBubbles(candidates));
  }

  /** Where a guest's bubble stands in the view, and how tall it is. */
  #placeOf(member: Member, width: number, view: { width: number; height: number }) {
    const setup = this.#setup;
    const { guest, figure, sprite } = member;
    const head = setup?.project({ x: sprite.x, y: sprite.y - figure.size.height }) ?? {
      x: 0,
      y: 0,
    };
    const height = bubbleHeight(
      {
        name: guest.name,
        badge: guest.badge ?? undefined,
        greeting: guest.greeting ?? setup?.defaultGreeting,
        line: guest.line ?? undefined,
      },
      width,
    );
    return { ...placeBubble(head, { width, height }, view), height };
  }

  #views(shown: ReadonlySet<string>): BubbleView[] {
    const setup = this.#setup;
    if (setup === undefined) return [];
    const view = setup.viewSize();
    const width = bubbleWidth(view.width);
    return this.#members
      .filter((member) => shown.has(member.guest.id))
      .map((member) => {
        const place = this.#placeOf(member, width, view);
        const { guest } = member;
        return {
          id: guest.id,
          name: guest.name,
          badge: guest.badge ?? undefined,
          greeting: guest.greeting ?? setup.defaultGreeting,
          line: guest.line ?? undefined,
          photo: guest.photo === null ? undefined : setup.photoOf?.(guest),
          pinned: member.pinned,
          x: place.x,
          y: place.y,
          width,
          tail: place.tail,
        };
      });
  }

  /** A walk to a random cell of the figure's region. */
  #route(member: Member, from: Point): Point[] | undefined {
    const { cells } = member.region;
    const goal = cells[Math.floor(Math.random() * cells.length)];
    if (goal === undefined) return undefined;
    const path = findPath(this.#grid, startCells(this.#map, this.#grid, from), goal);
    if (path === undefined) return undefined;
    return walkRoute(this.#map, from, path, cellCentre(goal.column, goal.row, this.#map.size));
  }

  /** Puts the sprite, shadow and tag where the figure stands, on the device-pixel grid like the player. */
  #place(member: Member): void {
    const map = this.#map;
    const { wanderer, figure, sprite, shadow, tag } = member;
    const frames = figure.walk[wanderer.direction];
    const texture =
      wanderer.moving && frames.length > 0
        ? frames[walkFrameIndex(member.clock, frames.length)]
        : figure.standing[wanderer.direction];
    if (texture !== undefined && sprite.texture.key !== texture) sprite.setTexture(texture);
    const ratio = this.#ratio();
    const at = playerSpritePosition(wanderer.position, this.#zoom, ratio);
    sprite.setPosition(at.x, at.y);
    const depth = figureDepth(wanderer.position, map.occluders, map.size.width);
    sprite.setDepth(depth);
    const ground = figureShadow(wanderer.position, map.size.width, this.#zoom, ratio);
    shadow
      .setPosition(ground.x, ground.y)
      .setSize(ground.width, ground.height)
      .setFillStyle(0x000000, ground.opacity)
      .setDepth(depth - SHADOW_DEPTH_BELOW);
    tag?.setVisible(!member.open);
    if (tag !== undefined) {
      // One CSS pixel of the tag is one CSS pixel on screen: the camera's zoom and the texture's ratio cancel out.
      tag
        .setScale(1 / (this.#zoom * member.tagRatio))
        .setPosition(at.x, snapToPixelGrid(at.y - figure.size.height - 1, this.#zoom, ratio))
        // The tag has the depth of its figure, a hair above, so what covers the figure covers the tag.
        .setDepth(depth + SHADOW_DEPTH_BELOW);
    }
  }
}
