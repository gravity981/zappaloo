// Movement of the player (GAME-02, GAME-09, GAME-10): a step in screen directions, sliding along the obstacles
// when a diagonal step would touch one. Positions are in the map's pixel space.
import type { Point } from "./geometry.ts";

/** The directions of the figures, as the metadata names them (PixelLab). */
export type Direction = "south" | "west" | "east" | "north";

/**
 * The step of one frame: `delta` is the wanted move in screen pixels. A move that would touch an obstacle is
 * tried along each axis, so the figure slides along a wall instead of stopping dead.
 */
export function stepPosition(
  position: Point,
  delta: Point,
  isWalkable: (point: Point) => boolean,
): Point {
  const full = { x: position.x + delta.x, y: position.y + delta.y };
  if (isWalkable(full)) return full;
  const alongX = { x: position.x + delta.x, y: position.y };
  if (delta.x !== 0 && isWalkable(alongX)) return alongX;
  const alongY = { x: position.x, y: position.y + delta.y };
  if (delta.y !== 0 && isWalkable(alongY)) return alongY;
  return position;
}

/**
 * The move of the arrow keys (GAME-09): `left`, `right`, `up`, `down` are pressed keys; the directions are the
 * screen's. Two keys move diagonally, at the same speed as one key.
 */
export function keyDirection(keys: {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}): Point {
  const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  if (x === 0 && y === 0) return { x: 0, y: 0 };
  const length = Math.hypot(x, y);
  return { x: x / length, y: y / length };
}

/** The direction of a figure: the nearest of its four directions on screen to the move (14.4, the game side). */
export function directionOf(move: Point): Direction {
  const candidates: [Direction, Point][] = [
    ["south", { x: 0, y: 1 }],
    ["east", { x: 1, y: 0 }],
    ["north", { x: 0, y: -1 }],
    ["west", { x: -1, y: 0 }],
  ];
  let best: Direction = "south";
  let bestDot = Number.NEGATIVE_INFINITY;
  for (const [name, vector] of candidates) {
    const dot = move.x * vector.x + move.y * vector.y;
    if (dot > bestDot) {
      bestDot = dot;
      best = name;
    }
  }
  return best;
}
