// The wandering guest figures of one map as the scene draws them (PRES-01, PRES-02, PRES-08): a sprite with the
// walk animation, the shadow of the player's figure (GAME-28) and a name tag above the head. The figures are
// simulated on this device only and are not interactive yet (speech bubbles come with PRES-10).
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
import { playerSpritePosition } from "./player-anchor.ts";
import type { LoadedWorld } from "./world-data.ts";
import { Wanderer, guestsOnMap, tagText, waitDuration, wanderCells } from "./wander.ts";

/** The name tags lie above every figure and object, below the editor guides. */
const TAG_DEPTH = 1_900_000;
/** The longest step of one frame, so that a stalled tab does not make the figures jump across the map. */
const MAX_DELTA_MS = 100;

/** What the test hook shows of a guest figure. */
export interface GuestState {
  id: string;
  name: string;
  x: number;
  y: number;
  moving: boolean;
}

interface Member {
  guest: GuestFigure;
  figure: LoadedWorld["figures"][number];
  wanderer: Wanderer;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  tag: Phaser.GameObjects.Text;
  region: { keys: ReadonlySet<string>; cells: Cell[] };
  clock: number;
}

export class GuestCrowd {
  readonly #map: ParsedMap;
  readonly #grid: Grid;
  readonly #zoom: number;
  readonly #ratio: () => number;
  readonly #members: Member[] = [];

  constructor(
    scene: Phaser.Scene,
    map: ParsedMap,
    world: LoadedWorld,
    grid: Grid,
    guests: readonly GuestFigure[],
    zoom: number,
    ratio: () => number,
  ) {
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
      const tag = scene.add
        .text(0, 0, tagText(guest.name), {
          fontFamily: "system-ui, sans-serif",
          fontStyle: "600",
          // World pixels: the camera's zoom makes it 12 CSS pixels, as the labels of the edge indicators.
          fontSize: "6px",
          color: "#000000",
          backgroundColor: "#ffffff",
          padding: { x: 2, y: 1 },
        })
        .setOrigin(0.5, 1)
        .setDepth(TAG_DEPTH);
      tag.setResolution(zoom * ratio());
      const member = { guest, figure, wanderer, sprite, shadow, tag, region, clock: 0 };
      this.#members.push(member);
      this.#place(member);
    }
  }

  /** The guests on this map, for the test hook. */
  get states(): GuestState[] {
    return this.#members.map(({ guest, wanderer }) => ({
      id: guest.id,
      name: guest.name,
      x: Math.round(wanderer.position.x),
      y: Math.round(wanderer.position.y),
      moving: wanderer.moving,
    }));
  }

  update(delta: number): void {
    const map = this.#map;
    const dt = Math.min(delta, MAX_DELTA_MS);
    const step = (map.size.width * SPEED_TILES_PER_SECOND * GUEST_SPEED_FACTOR * dt) / 1000;
    for (const member of this.#members) {
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
    tag.setPosition(at.x, at.y - figure.size.height - 1);
  }
}
