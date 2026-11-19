// The cloud shadows (GAME-31): soft, faint, translucent dark shapes that drift over the map from left to right at random
// heights. Each starts outside the map's boundary and disappears after it has crossed the other side. This is the
// movement; the picture of a shadow is drawn in atmosphere.ts.
import type { Rectangle } from "./geometry.ts";

/** How dark a shadow is: faint, so that it reads as a shadow and not as a stain on the screen (decided 2026-11-18). */
export const CLOUD_OPACITY = 0.13;
/** The speed of a shadow, in map pixels per second. */
export const CLOUD_SPEED = { min: 10, max: 18 } as const;
/** The width of a shadow, in map pixels; its height is half of it, the 2 : 1 of the ground plane. */
export const CLOUD_WIDTH = { min: 260, max: 520 } as const;
/** One shadow per this many map pixels of width, and at least this many. */
export const CLOUD_PER_WIDTH = 1400;
export const CLOUD_MIN_COUNT = 2;

export interface Cloud {
  /** The centre, in map pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  /** Which of the shadow pictures it uses. */
  shape: number;
}

/** How many shadows are over a map at a time. */
export function cloudCount(bounds: Rectangle): number {
  return Math.max(CLOUD_MIN_COUNT, Math.ceil(bounds.width / CLOUD_PER_WIDTH));
}

/**
 * The shadows over a map, made and moved. `random` gives numbers from 0 up to, not including, 1, so the tests can
 * lead it. A shadow comes in at the left, outside the boundary, at a random height of the map, and is gone when it
 * has left at the right.
 */
export class CloudField {
  readonly #bounds: Rectangle;
  readonly #random: () => number;
  readonly #shapes: number;
  readonly clouds: Cloud[] = [];

  constructor(bounds: Rectangle, shapes: number, random: () => number = Math.random) {
    this.#bounds = bounds;
    this.#random = random;
    this.#shapes = Math.max(1, shapes);
    // The map is not empty when it is entered: the shadows are spread over it at the start.
    const count = cloudCount(bounds);
    for (let index = 0; index < count; index++) {
      this.clouds.push(this.#make((index + this.#random()) / count));
    }
  }

  /**
   * A new shadow. `along` is where it stands on its way across: 0 just outside the left boundary (as when it comes
   * in), 1 just outside the right one.
   */
  #make(along: number): Cloud {
    const width = CLOUD_WIDTH.min + this.#random() * (CLOUD_WIDTH.max - CLOUD_WIDTH.min);
    const height = width / 2;
    const left = this.#bounds.x - width / 2;
    const right = this.#bounds.x + this.#bounds.width + width / 2;
    return {
      x: left + along * (right - left),
      y: this.#bounds.y + this.#random() * this.#bounds.height,
      width,
      height,
      speed: CLOUD_SPEED.min + this.#random() * (CLOUD_SPEED.max - CLOUD_SPEED.min),
      shape: Math.floor(this.#random() * this.#shapes),
    };
  }

  /** Moves the shadows by `delta` milliseconds; one that has crossed the map is replaced by one that comes in. */
  update(delta: number): void {
    const edge = this.#bounds.x + this.#bounds.width;
    this.clouds.forEach((cloud, index) => {
      cloud.x += (cloud.speed * delta) / 1000;
      if (cloud.x - cloud.width / 2 > edge) this.clouds[index] = this.#make(0);
    });
  }
}
