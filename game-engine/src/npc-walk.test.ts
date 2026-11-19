// The behaviour of an NPC (GAME-36): its walk along a path with the waits at the ends, standing without a path, and
// the wave now and then.
import { describe, expect, it } from "vitest";
import {
  NpcWalker,
  WAVE_DELAY_MAX_MS,
  WAVE_DELAY_MIN_MS,
  waveDelay,
  waveFrameIndex,
  waveLength,
} from "./npc-walk.ts";

const middle = () => 0.5;
const path = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
];

/** Runs the walker for `ms` milliseconds in steps of 10, at 10 pixels per second (0.1 px per step). */
function run(walker: NpcWalker, ms: number, pixelsPerStep = 0.1): void {
  for (let elapsed = 0; elapsed < ms; elapsed += 10) walker.update(10, pixelsPerStep);
}

describe("the walk of an NPC along a path", () => {
  it("[GAME-36] starts at the first point of the path, whatever its own point is, and walks to the next, facing that way", () => {
    const walker = new NpcWalker({ x: 500, y: 500 }, { path, random: middle });
    expect(walker.position).toEqual({ x: 0, y: 0 });
    walker.update(10, 1);
    expect(walker.moving).toBe(true);
    expect(walker.direction).toBe("east");
    expect(walker.position.x).toBeGreaterThan(0);
    expect(walker.position.y).toBe(0);
  });

  it("[GAME-36] goes round the corners point by point, waits 3 to 8 seconds at the end and walks back", () => {
    const walker = new NpcWalker({ x: 0, y: 0 }, { path, random: middle });
    // 150 px of path at 10 px per second: 15 s.
    run(walker, 15_100);
    expect(walker.position).toEqual({ x: 100, y: 50 });
    expect(walker.moving).toBe(false);
    // The wait at the end is 5.5 s with a middle random number: it stands still for that long.
    const at = { ...walker.position };
    run(walker, 5_000);
    expect(walker.position).toEqual(at);
    // Then it walks back, the way it came.
    run(walker, 1_000);
    expect(walker.moving).toBe(true);
    expect(walker.position.y).toBeLessThan(50);
    run(walker, 5_000);
    expect(walker.position.x).toBeLessThanOrEqual(100);
  });

  it("[GAME-36] walks back to the first point, waits there, and walks the path again, again and again", () => {
    const walker = new NpcWalker({ x: 0, y: 0 }, { path, random: middle });
    const visited = new Set<string>();
    for (let elapsed = 0; elapsed < 90_000; elapsed += 10) {
      walker.update(10, 0.1);
      if (!walker.moving)
        visited.add(
          `${String(Math.round(walker.position.x))},${String(Math.round(walker.position.y))}`,
        );
    }
    expect(visited).toContain("100,50");
    expect(visited).toContain("0,0");
  });

  it("[GAME-36] faces the way it walks", () => {
    const walker = new NpcWalker({ x: 0, y: 0 }, { path, random: middle });
    run(walker, 1_000);
    expect(walker.direction).toBe("east");
    run(walker, 10_500);
    expect(walker.direction).toBe("south");
  });

  it("[GAME-36] an initial wait keeps it at the start for that long", () => {
    const walker = new NpcWalker({ x: 0, y: 0 }, { path, initialWait: 2_000, random: middle });
    run(walker, 1_900);
    expect(walker.position).toEqual({ x: 0, y: 0 });
    run(walker, 300);
    expect(walker.moving).toBe(true);
  });

  it("[GAME-36] a held NPC stands still and goes on afterwards", () => {
    const walker = new NpcWalker({ x: 0, y: 0 }, { path, random: middle });
    run(walker, 500);
    const held = { ...walker.position };
    walker.held = true;
    run(walker, 2_000);
    expect(walker.position).toEqual(held);
    expect(walker.moving).toBe(false);
    walker.held = false;
    run(walker, 200);
    expect(walker.moving).toBe(true);
  });
});

describe("an NPC without a path", () => {
  it("[GAME-36] stands where it is, facing south", () => {
    const walker = new NpcWalker({ x: 30, y: 40 }, { random: middle });
    run(walker, 30_000);
    expect(walker.position).toEqual({ x: 30, y: 40 });
    expect(walker.direction).toBe("south");
    expect(walker.moving).toBe(false);
  });

  it("[GAME-36] a path of one point is no path", () => {
    const walker = new NpcWalker({ x: 30, y: 40 }, { path: [{ x: 0, y: 0 }], random: middle });
    expect(walker.hasPath).toBe(false);
  });
});

describe("the wave of an NPC", () => {
  it("[GAME-36] the delay between two waves is 8 to 20 seconds", () => {
    expect(waveDelay(() => 0)).toBe(WAVE_DELAY_MIN_MS);
    expect(waveDelay(() => 0.999999)).toBeCloseTo(WAVE_DELAY_MAX_MS, -1);
    expect(waveDelay(middle)).toBe(14_000);
  });

  it("[GAME-36] a standing NPC waves once its time has come, for the length of its wave, and then again later", () => {
    const walker = new NpcWalker({ x: 0, y: 0 }, { waveDuration: 375, random: middle });
    run(walker, 13_900);
    expect(walker.waveElapsed).toBeUndefined();
    run(walker, 200);
    expect(walker.waveElapsed).toBeDefined();
    run(walker, 400);
    expect(walker.waveElapsed).toBeUndefined();
    // The next wave is another 14 seconds later.
    run(walker, 13_000);
    expect(walker.waveElapsed).toBeUndefined();
    run(walker, 1_000);
    expect(walker.waveElapsed).toBeDefined();
  });

  it("[GAME-36] an NPC whose figure has no wave never waves", () => {
    const walker = new NpcWalker({ x: 0, y: 0 }, { random: middle });
    run(walker, 60_000);
    expect(walker.waveElapsed).toBeUndefined();
  });

  it("[GAME-36] the wave and the walk do not overlap: a walk waits for the wave to end", () => {
    const walker = new NpcWalker(
      { x: 0, y: 0 },
      { path, initialWait: 14_000, waveDuration: 1_000, random: middle },
    );
    run(walker, 14_050);
    expect(walker.waveElapsed).toBeDefined();
    expect(walker.moving).toBe(false);
    const at = { ...walker.position };
    run(walker, 800);
    expect(walker.position).toEqual(at);
    run(walker, 400);
    expect(walker.waveElapsed).toBeUndefined();
    run(walker, 100);
    expect(walker.moving).toBe(true);
  });
});

const frames = (count: number) =>
  Array.from({ length: count }, (_, index) => `wave-${String(index)}`);
const figure = (wave?: number) => ({
  wave: wave === undefined ? undefined : { south: frames(wave) },
});

describe("the wave of an NPC's figure", () => {
  it("[GAME-36] lasts as long as its frames at 8 frames per second; a figure without a wave has none", () => {
    expect(waveLength(figure(8))).toBe(1000);
    expect(waveLength(figure(3))).toBe(375);
    expect(waveLength(figure())).toBeUndefined();
    expect(waveLength(figure(0))).toBeUndefined();
  });

  it("[GAME-36] plays its frames in order, one every eighth of a second, and holds the last until the wave ends", () => {
    expect(waveFrameIndex(0, 3)).toBe(0);
    expect(waveFrameIndex(124, 3)).toBe(0);
    expect(waveFrameIndex(125, 3)).toBe(1);
    expect(waveFrameIndex(250, 3)).toBe(2);
    expect(waveFrameIndex(374, 3)).toBe(2);
    expect(waveFrameIndex(9_999, 3)).toBe(2);
  });
});
