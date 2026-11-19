// The animation of tile objects, e.g. a fountain (GAME-35): every object of a tile plays the frames of the tile's Tiled
// animation, all in step, from the moment the map is entered. Which frame shows at a time is decided here; the scene
// only swaps the texture of the drawn picture.
import type { TileAnimationFrame } from "./map-model.ts";

/** The index of the frame that shows `elapsed` milliseconds after the start; the animation loops. */
export function frameAt(frames: readonly TileAnimationFrame[], elapsed: number): number {
  const total = frames.reduce((sum, frame) => sum + frame.duration, 0);
  if (total <= 0 || frames.length < 2) return 0;
  let rest = ((elapsed % total) + total) % total;
  for (const [index, frame] of frames.entries()) {
    if (rest < frame.duration) return index;
    rest -= frame.duration;
  }
  return frames.length - 1;
}

/** An animated object: where its picture is shown and which frames it plays. */
export interface AnimatedPicture {
  frames: readonly TileAnimationFrame[];
  /** Shows the texture of a frame. */
  show: (key: string) => void;
}

/** Plays the animations of a map's tile objects; it does nothing without animated objects or with reduced motion. */
export class TileAnimations {
  readonly #pictures: AnimatedPicture[];
  readonly #shown: number[];
  #elapsed = 0;

  constructor(pictures: readonly AnimatedPicture[], reducedMotion: boolean) {
    // With reduced motion the objects stand on their first frame, which is the tile's own picture.
    this.#pictures = reducedMotion ? [] : [...pictures];
    this.#shown = this.#pictures.map(() => 0);
  }

  /** The number of objects that are being animated. */
  get count(): number {
    return this.#pictures.length;
  }

  /** The index of the frame each animated object shows now (test hook). */
  get shown(): readonly number[] {
    return this.#shown;
  }

  update(delta: number): void {
    if (this.#pictures.length === 0) return;
    this.#elapsed += delta;
    for (const [position, picture] of this.#pictures.entries()) {
      const index = frameAt(picture.frames, this.#elapsed);
      if (index === this.#shown[position]) continue;
      this.#shown[position] = index;
      const frame = picture.frames[index];
      if (frame !== undefined) picture.show(frame.key);
    }
  }
}
