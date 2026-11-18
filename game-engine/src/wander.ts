// The wandering guest figures (PRES-01, PRES-02, PRES-08; sw-architecture.md 3.6): which map a guest walks on, where
// a figure may go, and the figure's own walk: to a random point in a wander area, a wait of 3 to 8 seconds, and on.
// Each device simulates only the figures of the current map, so nothing here has to match across devices.
import { cellCentre } from "./collision.ts";
import { pointInPolygon, type Point } from "./geometry.ts";
import { directionOf, stepPosition, type Direction } from "./movement.ts";
import { cellKey, reachableCells, type Cell, type Grid } from "./pathfinding.ts";
import type { NavigableMap } from "./navigation.ts";
import type { GuestFigure } from "@zappaloo/shared";
import type { LoadedWorld } from "./world-data.ts";

/** A figure waits this long at the end of a walk, in milliseconds (decision 7 of epic 6: the same for NPCs). */
export const WAIT_MIN_MS = 3000;
export const WAIT_MAX_MS = 8000;

/** A waypoint counts as reached within this many pixels. */
const REACHED = 1.5;

/** The 32-bit FNV-1a hash of a text: the same on every device, so a guest keeps their map (PRES-02). */
export function hashOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * The map a guest walks on: picked from the maps that have wander areas (sorted by id) by the hash of the guest's
 * id, so it is random but stays the same for the guest, on every device (decided 2026-11-18). Undefined when no
 * map has a wander area.
 */
export function guestMapOf(guestId: string, wanderMapIds: readonly string[]): string | undefined {
  if (wanderMapIds.length === 0) return undefined;
  const sorted = [...wanderMapIds].sort();
  return sorted[hashOf(guestId) % sorted.length];
}

/** The part of a parsed map that the wandering needs. */
export interface WanderMap extends NavigableMap {
  wanders: readonly (readonly Point[])[];
}

/** The cells a figure may walk to: the walkable cells whose centre lies in a wander area. */
export function wanderCells(map: WanderMap, grid: Grid): Cell[] {
  const cells: Cell[] = [];
  for (let row = 0; row < map.rows; row++) {
    for (let column = 0; column < map.columns; column++) {
      const cell = { column, row };
      const centre = cellCentre(column, row, map.size);
      if (map.wanders.some((area) => pointInPolygon(centre, area)) && grid.walkable(cell)) {
        cells.push(cell);
      }
    }
  }
  return cells;
}

/** The wander cells that can be reached from `start`, the cells of one connected stretch of the map. */
export function reachableWanderCells(
  grid: Grid,
  cells: readonly Cell[],
  start: Cell,
): { reachable: Cell[]; keys: ReadonlySet<string> } {
  const keys = reachableCells(grid, start);
  return { reachable: cells.filter((cell) => keys.has(cellKey(cell))), keys };
}

/** A pause of 3 to 8 seconds; `random` gives a number from 0 up to, not including, 1. */
export function waitDuration(random: () => number): number {
  return WAIT_MIN_MS + random() * (WAIT_MAX_MS - WAIT_MIN_MS);
}

/** What a wandering figure needs from the scene. */
export interface WanderEnvironment {
  random: () => number;
  /** Whether the figure fits at a point. */
  isWalkable: (point: Point) => boolean;
  /** The waypoints of a walk from a point to a random wander point, or undefined when there is none. */
  route: (from: Point) => Point[] | undefined;
}

/** One wandering figure: its position, the way it faces, and whether it is walking. */
export class Wanderer {
  position: Point;
  direction: Direction = "south";
  moving = false;
  #path: Point[] = [];
  #wait: number;

  constructor(position: Point, initialWait: number) {
    this.position = position;
    this.#wait = initialWait;
  }

  /** The waypoints still to walk (for the tests). */
  get path(): readonly Point[] {
    return this.#path;
  }

  /** Advances by `delta` milliseconds; `step` is how far the figure walks in that time, in pixels. */
  update(delta: number, step: number, env: WanderEnvironment): void {
    this.moving = false;
    if (this.#path.length === 0) {
      this.#wait -= delta;
      if (this.#wait > 0) return;
      this.#path = env.route(this.position) ?? [];
      if (this.#path.length === 0) {
        this.#wait = waitDuration(env.random);
        return;
      }
    }
    const next = this.#path[0];
    if (next === undefined) return;
    const dx = next.x - this.position.x;
    const dy = next.y - this.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= REACHED) {
      this.#path.shift();
      if (this.#path.length === 0) this.#wait = waitDuration(env.random);
      return;
    }
    const length = Math.min(step, distance);
    const move = { x: dx / distance, y: dy / distance };
    const after = stepPosition(
      this.position,
      { x: move.x * length, y: move.y * length },
      env.isWalkable,
    );
    if (after.x === this.position.x && after.y === this.position.y) {
      // Blocked: give the walk up and wait, like the end of a walk.
      this.#path = [];
      this.#wait = waitDuration(env.random);
      return;
    }
    this.position = after;
    this.direction = directionOf(move);
    this.moving = true;
  }
}

/** A longer name is cut and ends with an ellipsis. */
export const TAG_MAX_CHARACTERS = 24;

/** The ids of the maps that have a wander area. */
export function wanderMapIds(world: LoadedWorld): string[] {
  return [...world.maps.values()].filter((map) => map.wanders.length > 0).map((map) => map.id);
}

/** The guests that walk on `map`: those whose id picks it (PRES-02) and whose figure the world has. */
export function guestsOnMap(
  world: LoadedWorld,
  map: { id: string },
  guests: readonly GuestFigure[],
): GuestFigure[] {
  const ids = wanderMapIds(world);
  return guests.filter(
    (guest) =>
      guestMapOf(guest.id, ids) === map.id &&
      world.figures.some((figure) => figure.id === guest.figure),
  );
}

/** The name as the tag shows it. */
export function tagText(name: string): string {
  const chars = Array.from(name.trim());
  return chars.length <= TAG_MAX_CHARACTERS
    ? chars.join("")
    : `${chars.slice(0, TAG_MAX_CHARACTERS - 1).join("")}…`;
}

/**
 * Sample guests for the game preview, which has no guests: at least two for every map with a wander area, with the
 * figures of the world in turn and made-up names, so that the wander areas and their collisions can be checked.
 */
export function sampleGuests(world: LoadedWorld, perMap = 2): GuestFigure[] {
  const ids = wanderMapIds(world);
  if (ids.length === 0 || world.figures.length === 0) return [];
  const count = new Map(ids.map((id) => [id, 0]));
  const guests: GuestFigure[] = [];
  // The map follows from the id by a hash, so ids are tried until every map has its share.
  for (let n = 1; n <= 200 && [...count.values()].some((value) => value < perMap); n++) {
    const id = `sample-${String(n)}`;
    const map = guestMapOf(id, ids);
    if (map === undefined || (count.get(map) ?? 0) >= perMap) continue;
    count.set(map, (count.get(map) ?? 0) + 1);
    const figure = world.figures[guests.length % world.figures.length];
    if (figure === undefined) continue;
    guests.push({ id, name: `Guest ${String(guests.length + 1)}`, figure: figure.id });
  }
  return guests;
}
