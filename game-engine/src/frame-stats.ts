// The numbers of the development diagnostics overlay (GAME-27): the raw frame times over the last second and the
// camera's step per frame. Pure, so that the overlay only has to show them.

export interface FrameSummary {
  frames: number;
  minMs: number;
  maxMs: number;
  averageMs: number;
  /** The largest step of the camera between two frames in the last second, in device pixels. */
  maxStepPx: number;
  minStepPx: number;
}

/** Collects frames (the browser's timestamp and the camera's position) and summarises the last second. */
export class FrameStats {
  readonly #window: { time: number; x: number; y: number }[] = [];

  add(time: number, cameraX: number, cameraY: number): void {
    this.#window.push({ time, x: cameraX, y: cameraY });
    while (this.#window.length > 1 && time - (this.#window[0]?.time ?? time) > 1000) {
      this.#window.shift();
    }
  }

  /** The summary; the camera's steps are in world pixels times `devicePixelsPerWorldPixel`. */
  summary(devicePixelsPerWorldPixel: number): FrameSummary {
    const times: number[] = [];
    const steps: number[] = [];
    for (let index = 1; index < this.#window.length; index++) {
      const previous = this.#window[index - 1];
      const current = this.#window[index];
      if (previous === undefined || current === undefined) continue;
      times.push(current.time - previous.time);
      steps.push(
        Math.hypot(current.x - previous.x, current.y - previous.y) * devicePixelsPerWorldPixel,
      );
    }
    const sum = times.reduce((total, value) => total + value, 0);
    const moving = steps.filter((step) => step > 0);
    return {
      frames: times.length,
      minMs: times.length === 0 ? 0 : Math.min(...times),
      maxMs: times.length === 0 ? 0 : Math.max(...times),
      averageMs: times.length === 0 ? 0 : sum / times.length,
      maxStepPx: moving.length === 0 ? 0 : Math.max(...moving),
      minStepPx: moving.length === 0 ? 0 : Math.min(...moving),
    };
  }
}
