import { describe, expect, it } from "vitest";
import { walkFrameIndex, WALK_FRAMES_PER_SECOND } from "./figures.ts";

describe("the walk of a figure (14.4, the game side)", () => {
  it("[AVA-04] the walk frames play in order at 8 frames per second, and repeat", () => {
    expect(WALK_FRAMES_PER_SECOND).toBe(8);
    expect(walkFrameIndex(0, 3)).toBe(0);
    expect(walkFrameIndex(125, 3)).toBe(1);
    expect(walkFrameIndex(375, 3)).toBe(0);
    expect(walkFrameIndex(500, 0)).toBe(0);
  });
});
