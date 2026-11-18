// The animation of tile objects (GAME-35): which frame shows when, in step for all objects, and nothing moving with
// reduced motion.
import { describe, expect, it } from "vitest";
import { frameAt, TileAnimations } from "./tile-animation.ts";

const frames = [
  { key: "a", duration: 100 },
  { key: "b", duration: 200 },
  { key: "c", duration: 100 },
];

describe("the frame of a tile animation", () => {
  it("[GAME-35] shows each frame for its duration and then loops", () => {
    expect(frameAt(frames, 0)).toBe(0);
    expect(frameAt(frames, 99)).toBe(0);
    expect(frameAt(frames, 100)).toBe(1);
    expect(frameAt(frames, 299)).toBe(1);
    expect(frameAt(frames, 300)).toBe(2);
    expect(frameAt(frames, 400)).toBe(0);
    expect(frameAt(frames, 4_050)).toBe(0);
    expect(frameAt(frames, 4_150)).toBe(1);
  });

  it("[GAME-35] stands on the first frame when there is nothing to play", () => {
    expect(frameAt([], 500)).toBe(0);
    expect(frameAt([{ key: "a", duration: 100 }], 500)).toBe(0);
  });
});

describe("the animated objects of a map", () => {
  const picture = (shown: string[]) => ({ frames, show: (key: string) => void shown.push(key) });

  it("[GAME-35] swap the texture only when the frame changes, all in step", () => {
    const first: string[] = [];
    const second: string[] = [];
    const animations = new TileAnimations([picture(first), picture(second)], false);
    expect(animations.count).toBe(2);
    animations.update(50);
    expect(first).toEqual([]);
    animations.update(60);
    animations.update(10);
    expect(first).toEqual(["b"]);
    animations.update(190);
    expect(first).toEqual(["b", "c"]);
    expect(second).toEqual(first);
    expect(animations.shown).toEqual([2, 2]);
  });

  it("[GAME-35] with reduced motion the objects stand on their first frame", () => {
    const shown: string[] = [];
    const animations = new TileAnimations([picture(shown)], true);
    animations.update(1_000);
    expect(animations.count).toBe(0);
    expect(shown).toEqual([]);
  });
});
