// The wandering guest figures of one map as the scene draws them (PRES-01, PRES-02, PRES-08): a sprite with the
// walk animation, the shadow of the player's figure (GAME-28) and a name tag above the head. The figures are
// simulated on this device only. A guest near the player stands still, turns to them and opens a speech bubble
// (PRES-10); a click or tap pins the bubble until its cross closes it. Which bubbles are open is decided by the
// bubble board (bubble-board.ts), together with the NPCs' bubbles.
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
import type { BubbleBoard, BubbleParticipant } from "./bubble-board.ts";
import { directionOf } from "./movement.ts";
import { drawNameTag } from "./name-tag.ts";
import { snapToPixelGrid } from "./pixel-grid.ts";
import { playerSpritePosition } from "./player-anchor.ts";
import type { LoadedWorld } from "./world-data.ts";
import { Wanderer, guestsOnMap, tagText, waitDuration, wanderCells } from "./wander.ts";

/** The longest step of one frame, so that a stalled tab does not make the figures jump across the map. */
const MAX_DELTA_MS = 100;

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
}

export class GuestCrowd {
  readonly #map: ParsedMap;
  readonly #grid: Grid;
  readonly #zoom: number;
  readonly #ratio: () => number;
  readonly #members: Member[] = [];
  readonly #board: BubbleBoard | undefined;
  readonly #photoOf: ((guest: GuestFigure) => string | undefined) | undefined;

  constructor(
    scene: Phaser.Scene,
    map: ParsedMap,
    world: LoadedWorld,
    grid: Grid,
    guests: readonly GuestFigure[],
    zoom: number,
    ratio: () => number,
    board?: BubbleBoard,
    photoOf?: (guest: GuestFigure) => string | undefined,
  ) {
    this.#board = board;
    this.#photoOf = photoOf;
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
      };
      this.#members.push(member);
      this.#place(member);
    }
  }

  /** The drawn figures, for their silhouettes behind objects (GAME-42). */
  get sprites(): Phaser.GameObjects.Sprite[] {
    return this.#members.map((member) => member.sprite);
  }

  /** The guests on this map, for the test hook. */
  get states(): GuestState[] {
    return this.#members.map(({ guest, wanderer }) => ({
      id: guest.id,
      name: guest.name,
      x: Math.round(wanderer.position.x),
      y: Math.round(wanderer.position.y),
      moving: wanderer.moving,
      bubble: this.#board?.isOpen(guest.id) ?? false,
      pinned: this.#board?.isPinned(guest.id) ?? false,
    }));
  }

  /** The guests as bubble participants: each can have a bubble, which opens when the player is close (PRES-10). */
  participants(player: Point): BubbleParticipant[] {
    const board = this.#board;
    if (board === undefined) return [];
    return this.#members.map(({ guest, figure, sprite, wanderer }) => ({
      id: guest.id,
      distance: Math.hypot(wanderer.position.x - player.x, wanderer.position.y - player.y),
      head: { x: sprite.x, y: sprite.y - figure.size.height },
      content: {
        name: guest.name,
        badge: guest.badge ?? undefined,
        greeting: guest.greeting ?? board.defaultGreeting,
        line: guest.line ?? undefined,
      },
      photo: guest.photo === null ? undefined : this.#photoOf?.(guest),
    }));
  }

  /**
   * One frame: the figures walk or stand. A guest with an open bubble (`shown`, decided by the bubble board) stands
   * still and faces the player (PRES-10).
   */
  update(delta: number, player: Point, shown: ReadonlySet<string>): void {
    const map = this.#map;
    const dt = Math.min(delta, MAX_DELTA_MS);
    const step = (map.size.width * SPEED_TILES_PER_SECOND * GUEST_SPEED_FACTOR * dt) / 1000;
    for (const member of this.#members) {
      const open = shown.has(member.guest.id);
      member.wanderer.held = open;
      if (open) {
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
    tag?.setVisible(!(this.#board?.isOpen(member.guest.id) ?? false));
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
