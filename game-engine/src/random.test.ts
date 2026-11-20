import { afterEach, describe, expect, it } from "vitest";
import { fixGameRandom, gameRandom, seedGameRandom, seededRandom } from "./random.ts";

describe("the engine's random choices (test builds)", () => {
  afterEach(() => {
    seedGameRandom(undefined);
  });

  it("a seed gives the same sequence every time, and another seed another one", () => {
    const first = Array.from({ length: 5 }, seededRandom(42));
    const again = Array.from({ length: 5 }, seededRandom(42));
    expect(again).toEqual(first);
    expect(Array.from({ length: 5 }, seededRandom(43))).not.toEqual(first);
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it("a fixed number is every choice the engine makes", () => {
    fixGameRandom(0.01);
    expect([gameRandom(), gameRandom()]).toEqual([0.01, 0.01]);
  });

  it("the engine follows the seed, and Math.random again without one", () => {
    seedGameRandom(7);
    const seeded = [gameRandom(), gameRandom()];
    seedGameRandom(7);
    expect([gameRandom(), gameRandom()]).toEqual(seeded);
    seedGameRandom(undefined);
    expect(gameRandom()).not.toBe(seeded[0]);
  });
});
