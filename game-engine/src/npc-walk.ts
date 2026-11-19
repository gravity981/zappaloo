// The way an NPC behaves (GAME-36, sw-architecture.md 14.2): on a path it walks from point to point to the end, waits
// 3 to 8 seconds there, and walks back, again and again; without a path it stands. While it stands it plays its wave
// now and then, every 8 to 20 seconds, if its figure has one. The walk and the wave never overlap. Pure: the scene
// draws what this says.
import { WALK_FRAMES_PER_SECOND } from "./figures.ts";
import type { Point } from "./geometry.ts";
import { directionOf, type Direction } from "./movement.ts";
import { waitDuration } from "./wander.ts";

/** A standing NPC waves again after this long, in milliseconds. */
export const WAVE_DELAY_MIN_MS = 8000;
export const WAVE_DELAY_MAX_MS = 20000;

/** A waypoint counts as reached within this many pixels. */
const REACHED = 1.5;

/** The random time in milliseconds until the next wave; `random` gives a number from 0 up to, not including, 1. */
export function waveDelay(random: () => number): number {
  return WAVE_DELAY_MIN_MS + random() * (WAVE_DELAY_MAX_MS - WAVE_DELAY_MIN_MS);
}

/** The wave of a figure: its frames in the four directions, as the figure's data has them. */
export interface WaveFigure {
  wave?: { south: readonly string[] } | undefined;
}

/** The length of a figure's wave in milliseconds: its frames at the walk's frame rate; undefined without a wave. */
export function waveLength(figure: WaveFigure): number | undefined {
  const frames = figure.wave?.south.length;
  return frames === undefined || frames === 0
    ? undefined
    : (frames / WALK_FRAMES_PER_SECOND) * 1000;
}

/** The index of the wave frame `elapsed` milliseconds into the wave; the last frame holds until the wave ends. */
export function waveFrameIndex(elapsed: number, count: number): number {
  return Math.min(count - 1, Math.floor((elapsed / 1000) * WALK_FRAMES_PER_SECOND));
}

export interface NpcWalkerOptions {
  /** The points of the path, or none: the NPC then stands where it is. */
  path?: readonly Point[] | undefined;
  /** How long the NPC stands before it first sets off, in milliseconds. */
  initialWait?: number;
  /** How long its wave lasts in milliseconds; without one the NPC does not wave. */
  waveDuration?: number | undefined;
  random: () => number;
}

/** One NPC: where it is, which way it faces, whether it walks, and how far into its wave it is. */
export class NpcWalker {
  position: Point;
  direction: Direction = "south";
  moving = false;
  /** Milliseconds into the wave while it plays; undefined otherwise. */
  waveElapsed: number | undefined;
  /** A held NPC stands still, as while the player walks to it; its wave in progress ends first. */
  held = false;
  readonly #path: readonly Point[];
  readonly #waveDuration: number | undefined;
  readonly #random: () => number;
  /** The index of the path point it walks to, and whether that is towards the end. */
  #target = 1;
  #forward = true;
  #wait: number;
  #waveIn: number;

  constructor(start: Point, options: NpcWalkerOptions) {
    this.#path = options.path ?? [];
    this.position = this.#path[0] ?? start;
    this.#waveDuration = options.waveDuration;
    this.#random = options.random;
    this.#wait = options.initialWait ?? 0;
    this.#waveIn = waveDelay(options.random);
  }

  /** Whether the NPC walks a path. */
  get hasPath(): boolean {
    return this.#path.length >= 2;
  }

  /** Advances by `delta` milliseconds; `step` is how far the NPC walks in that time, in pixels. */
  update(delta: number, step: number): void {
    this.moving = false;
    if (this.waveElapsed !== undefined) {
      this.waveElapsed += delta;
      if (this.waveElapsed >= (this.#waveDuration ?? 0)) {
        this.waveElapsed = undefined;
        this.#waveIn = waveDelay(this.#random);
      }
      return;
    }
    if (this.held) return;
    if (!this.hasPath || this.#wait > 0) {
      // Standing: the wave comes round now and then, and a wait at the end of the path runs out.
      this.#waveIn -= delta;
      if (this.#waveDuration !== undefined && this.#waveIn <= 0) {
        this.waveElapsed = 0;
        return;
      }
      if (!this.hasPath) return;
      this.#wait -= delta;
      if (this.#wait > 0) return;
    }
    this.#walk(step);
  }

  #walk(step: number): void {
    const next = this.#path[this.#target];
    if (next === undefined) return;
    const dx = next.x - this.position.x;
    const dy = next.y - this.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= REACHED) {
      this.position = next;
      this.#arrive();
      return;
    }
    const length = Math.min(step, distance);
    const move = { x: dx / distance, y: dy / distance };
    this.position = { x: this.position.x + move.x * length, y: this.position.y + move.y * length };
    this.direction = directionOf(move);
    this.moving = true;
  }

  /** At a path point: on to the next, or, at an end, a wait and then back. */
  #arrive(): void {
    const last = this.#path.length - 1;
    if (this.#forward ? this.#target >= last : this.#target <= 0) {
      this.#forward = !this.#forward;
      this.#target = this.#forward ? 1 : last - 1;
      this.#wait = waitDuration(this.#random);
      return;
    }
    this.#target += this.#forward ? 1 : -1;
  }
}
