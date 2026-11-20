// The birds (GAME-32): now and then, every 20 to 60 seconds, a small flock flies through the view above everything,
// from one side to the other, to the left or to the right. This is the schedule and the flight; the sprites are drawn
// in atmosphere.ts. The flight is in the view, in CSS pixels, so it looks the same whatever the camera does.
import { gameRandom } from "./random.ts";

export const FLOCK_EVERY_MS = { min: 20_000, max: 60_000 } as const;
/** The speed of a flock, in CSS pixels of the view per second. */
export const FLOCK_SPEED = { min: 90, max: 140 } as const;
/** How many birds a flock has. */
export const FLOCK_SIZE = { min: 3, max: 5 } as const;
/** The flight is at this part of the view's height at the top and the bottom, as most. */
export const FLOCK_HEIGHT = { min: 0.08, max: 0.7 } as const;
/** The birds fly at this many frames per second (14.4). */
export const BIRD_FRAMES_PER_SECOND = 8;

export type FlightDirection = "east" | "west";

export interface Bird {
  /** Where the bird is, from the flock's position: a few pixels to the side and up or down. */
  dx: number;
  dy: number;
  /** The frame it starts on, so the flock does not beat its wings as one. */
  phase: number;
}

export interface Flock {
  direction: FlightDirection;
  /** The part of the view's height where the flock flies, 0 at the top. */
  height: number;
  speed: number;
  /** How far the flock has flown, in CSS pixels from where it came in. */
  travelled: number;
  birds: Bird[];
}

/** The time to the next flock, in milliseconds. */
export function nextFlockIn(random: () => number = gameRandom): number {
  return FLOCK_EVERY_MS.min + random() * (FLOCK_EVERY_MS.max - FLOCK_EVERY_MS.min);
}

/** A flock for the view: it comes from the left or from the right at a random height. */
export function makeFlock(random: () => number = gameRandom): Flock {
  const count = FLOCK_SIZE.min + Math.floor(random() * (FLOCK_SIZE.max - FLOCK_SIZE.min + 1));
  return {
    direction: random() < 0.5 ? "east" : "west",
    height: FLOCK_HEIGHT.min + random() * (FLOCK_HEIGHT.max - FLOCK_HEIGHT.min),
    speed: FLOCK_SPEED.min + random() * (FLOCK_SPEED.max - FLOCK_SPEED.min),
    travelled: 0,
    birds: Array.from({ length: count }, () => ({
      dx: (random() - 0.5) * 70,
      dy: (random() - 0.5) * 36,
      phase: Math.floor(random() * 4),
    })),
  };
}

/** Where a bird of a flock is in a view of this size, in CSS pixels: the centre of the sprite. */
export function birdPosition(
  flock: Flock,
  bird: Bird,
  view: { width: number; height: number },
  margin: number,
): { x: number; y: number } {
  const start = flock.direction === "east" ? -margin : view.width + margin;
  const sign = flock.direction === "east" ? 1 : -1;
  return {
    x: start + sign * flock.travelled + bird.dx,
    y: flock.height * view.height + bird.dy,
  };
}

/** Whether a flock has left the view on the other side. */
export function flockGone(flock: Flock, view: { width: number }, margin: number): boolean {
  return flock.travelled > view.width + 2 * margin + 80;
}

/**
 * The schedule of the flocks: counts the time to the next one, flies the one that is in the view, and starts the
 * next when its time has come. There is never more than one flock.
 */
export class FlockSchedule {
  readonly #random: () => number;
  #wait: number;
  flock: Flock | undefined;

  constructor(random: () => number = gameRandom) {
    this.#random = random;
    this.#wait = nextFlockIn(random);
  }

  /** Advances by `delta` milliseconds in a view of this size, with `margin` pixels outside it where a bird starts. */
  update(delta: number, view: { width: number; height: number }, margin: number): void {
    if (this.flock !== undefined) {
      this.flock.travelled += (this.flock.speed * delta) / 1000;
      if (flockGone(this.flock, view, margin)) {
        this.flock = undefined;
        this.#wait = nextFlockIn(this.#random);
      }
      return;
    }
    this.#wait -= delta;
    if (this.#wait <= 0) this.flock = makeFlock(this.#random);
  }
}
