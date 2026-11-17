import { describe, expect, it } from "vitest";
import { FrameStats } from "./frame-stats.ts";

describe("the frame statistics of the diagnostics overlay (GAME-27)", () => {
  it("[GAME-27] summarises the frame times and the camera's steps over the last second", () => {
    const stats = new FrameStats();
    stats.add(0, 0, 0);
    stats.add(16, 1.5, 0);
    stats.add(50, 3, 0);
    const summary = stats.summary(6);
    expect(summary).toMatchObject({ frames: 2, minMs: 16, maxMs: 34, averageMs: 25 });
    expect(summary.minStepPx).toBeCloseTo(9);
    expect(summary.maxStepPx).toBeCloseTo(9);
  });

  it("[GAME-27] forgets frames older than a second, and is empty at first", () => {
    const stats = new FrameStats();
    expect(stats.summary(1)).toMatchObject({ frames: 0, maxMs: 0, maxStepPx: 0 });
    stats.add(0, 0, 0);
    stats.add(500, 1, 0);
    stats.add(1200, 2, 0);
    expect(stats.summary(1).frames).toBe(1);
  });
});
