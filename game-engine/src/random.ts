// The engine's random choices (where guests and NPCs start, how long they wait, when it sparkles, where the birds fly).
// Every one goes through `gameRandom`, so that a test build can seed it and get the same choices on every run
// (spec/test-strategy.md 8.8). Without a seed it is `Math.random`.
let source: () => number = Math.random;

/** A random number in [0, 1), from the seed when one is set. */
export function gameRandom(): number {
  return source();
}

/** The generator `mulberry32`: small, quick, and the same sequence for the same seed. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Makes every random choice of the engine the same number, e.g. 0.01 for the shortest waits (test builds). */
export function fixGameRandom(value: number): void {
  source = () => value;
}

/** Makes the engine's random choices follow the seed (test builds); `undefined` returns to `Math.random`. */
export function seedGameRandom(seed: number | undefined): void {
  source = seed === undefined ? Math.random : seededRandom(seed);
}
