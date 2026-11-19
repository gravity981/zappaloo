import { describe, expect, it } from "vitest";
import { atmospherePlan } from "./atmosphere-plan.ts";
import {
  CLOUD_MIN_COUNT,
  CLOUD_OPACITY,
  CLOUD_PER_WIDTH,
  CLOUD_SPEED,
  CloudField,
  cloudCount,
} from "./clouds.ts";
import {
  FLOCK_EVERY_MS,
  FLOCK_SIZE,
  FlockSchedule,
  birdPosition,
  flockGone,
  makeFlock,
  nextFlockIn,
} from "./birds.ts";
import {
  FOG_CELL,
  FOG_FADE_TILES,
  distanceOutsideBorders,
  fogOpacity,
  fogRaster,
  insideBorders,
} from "./fog.ts";

const TILE = 64;
/** A border: a square from (0, 0) to (400, 400). */
const square = [
  { x: 0, y: 0 },
  { x: 400, y: 0 },
  { x: 400, y: 400 },
  { x: 0, y: 400 },
];

/** A random number generator that gives these numbers in turn, and 0.5 afterwards. */
const sequence = (...values: number[]) => {
  let index = 0;
  return () => values[index++] ?? 0.5;
};

describe("the fog (GAME-33)", () => {
  it("[GAME-33] inside the border the view is clear; outside it the fog thickens over about two tile widths and then covers everything", () => {
    expect(FOG_FADE_TILES).toBe(2);
    const fade = FOG_FADE_TILES * TILE;
    expect(fogOpacity(0, TILE)).toBe(0);
    expect(fogOpacity(-5, TILE)).toBe(0);
    expect(fogOpacity(fade / 2, TILE)).toBeCloseTo(0.5, 5);
    expect(fogOpacity(fade, TILE)).toBe(1);
    expect(fogOpacity(fade * 3, TILE)).toBe(1);
    // It thickens steadily: more fog, further out.
    const steps = [0.1, 0.3, 0.5, 0.7, 0.9].map((part) => fogOpacity(part * fade, TILE));
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });

  it("[GAME-33] a point inside a border is at distance 0, one outside has its distance from the border, the nearest of several borders counts", () => {
    expect(insideBorders({ x: 200, y: 200 }, [square])).toBe(true);
    expect(distanceOutsideBorders({ x: 200, y: 200 }, [square])).toBe(0);
    expect(distanceOutsideBorders({ x: 500, y: 200 }, [square])).toBe(100);
    const other = square.map((point) => ({ x: point.x + 1000, y: point.y }));
    expect(distanceOutsideBorders({ x: 900, y: 200 }, [square, other])).toBe(100);
    expect(distanceOutsideBorders({ x: 200, y: 200 }, [])).toBe(Number.POSITIVE_INFINITY);
  });

  it("[GAME-33] the raster is clear inside, fully covering far out, and in between it thickens outwards", () => {
    const bounds = { x: 0, y: 0, width: 400, height: 400 };
    const raster = fogRaster(bounds, [square], TILE);
    // The area is the map's bounds with the fade around it, so the fog is complete wherever the camera can look.
    expect(raster.area.x).toBe(-FOG_FADE_TILES * TILE);
    expect(raster.area.width).toBe(400 + 2 * FOG_FADE_TILES * TILE);
    const at = (x: number, y: number) => {
      const column = Math.floor((x - raster.area.x) / FOG_CELL);
      const row = Math.floor((y - raster.area.y) / FOG_CELL);
      return raster.alpha[row * raster.columns + column] ?? -1;
    };
    expect(at(200, 200)).toBe(0);
    expect(at(10, 200)).toBe(0);
    const near = at(-20, 200);
    const further = at(-70, 200);
    const far = at(-FOG_FADE_TILES * TILE + 4, 200);
    expect(near).toBeGreaterThan(0);
    expect(further).toBeGreaterThan(near);
    expect(far).toBeGreaterThan(further);
    // At the edge of the area the fog is nearly complete.
    expect(far).toBeGreaterThan(240);
  });
});

describe("the cloud shadows (GAME-31)", () => {
  const bounds = { x: -300, y: 0, width: 2800, height: 1400 };

  it("[GAME-31] a shadow is faint, and there are a few over a map, more over a wider one", () => {
    expect(CLOUD_OPACITY).toBeGreaterThan(0.05);
    expect(CLOUD_OPACITY).toBeLessThanOrEqual(0.15);
    expect(cloudCount({ ...bounds, width: 300 })).toBe(CLOUD_MIN_COUNT);
    expect(cloudCount(bounds)).toBe(Math.ceil(bounds.width / CLOUD_PER_WIDTH));
    expect(cloudCount({ ...bounds, width: 10 * CLOUD_PER_WIDTH })).toBe(10);
  });

  it("[GAME-31] the shadows are spread over the map when it is entered, at random heights inside it", () => {
    const field = new CloudField(bounds, 3);
    expect(field.clouds).toHaveLength(cloudCount(bounds));
    for (const cloud of field.clouds) {
      expect(cloud.y).toBeGreaterThanOrEqual(bounds.y);
      expect(cloud.y).toBeLessThanOrEqual(bounds.y + bounds.height);
      expect(cloud.height).toBe(cloud.width / 2);
      expect(cloud.shape).toBeLessThan(3);
    }
    expect(new Set(field.clouds.map((cloud) => Math.round(cloud.y))).size).toBeGreaterThan(1);
  });

  it("[GAME-31] a shadow drifts from left to right at its own speed", () => {
    const field = new CloudField(bounds, 3);
    const [first] = field.clouds;
    if (first === undefined) throw new Error("no cloud");
    const before = first.x;
    field.update(1000);
    expect(first.x - before).toBeCloseTo(first.speed, 5);
    expect(first.speed).toBeGreaterThanOrEqual(CLOUD_SPEED.min);
    expect(first.speed).toBeLessThanOrEqual(CLOUD_SPEED.max);
  });

  it("[GAME-31] a shadow that has crossed the map is replaced by one that starts outside the left boundary", () => {
    const field = new CloudField(bounds, 3, sequence(0.9, 0.5, 0.5, 0.5, 0.1, 0.5, 0.5, 0.5));
    const edge = bounds.x + bounds.width;
    // Everything crosses within a long time; no shadow ever stays beyond the right boundary.
    for (let step = 0; step < 4000; step++) {
      field.update(500);
      for (const cloud of field.clouds) expect(cloud.x - cloud.width / 2).toBeLessThanOrEqual(edge);
    }
    // A new one starts completely outside the left boundary.
    const fresh = new CloudField(bounds, 3, () => 0);
    for (const cloud of fresh.clouds) {
      expect(cloud.x - cloud.width / 2).toBeLessThanOrEqual(bounds.x + bounds.width);
    }
    const [one] = fresh.clouds;
    if (one === undefined) throw new Error("no cloud");
    one.x = edge + one.width; // across
    fresh.update(1000);
    const replaced = fresh.clouds[0];
    expect(replaced?.x ?? 0).toBeLessThanOrEqual(bounds.x);
    expect((replaced?.x ?? 0) + (replaced?.width ?? 0) / 2).toBeLessThanOrEqual(bounds.x + 1);
  });
});

describe("the birds (GAME-32)", () => {
  const view = { width: 800, height: 600 };
  const margin = 20;

  it("[GAME-32] a flock comes every 20 to 60 seconds", () => {
    expect(nextFlockIn(() => 0)).toBe(FLOCK_EVERY_MS.min);
    expect(nextFlockIn(() => 0.999999)).toBeLessThan(FLOCK_EVERY_MS.max);
    expect(nextFlockIn(() => 0.5)).toBe(40_000);
  });

  it("[GAME-32] a flock has 3 to 5 birds and flies to the right or to the left, at a height inside the view", () => {
    const small = makeFlock(() => 0);
    const large = makeFlock(() => 0.999999);
    expect(small.birds).toHaveLength(FLOCK_SIZE.min);
    expect(large.birds).toHaveLength(FLOCK_SIZE.max);
    expect(small.direction).toBe("east");
    expect(large.direction).toBe("west");
    for (const flock of [small, large]) {
      expect(flock.height).toBeGreaterThan(0);
      expect(flock.height).toBeLessThan(1);
    }
  });

  it("[GAME-32] a flock enters the view from one side and leaves it on the other", () => {
    const east = { ...makeFlock(() => 0), travelled: 0 };
    const bird = east.birds[0];
    if (bird === undefined) throw new Error("no bird");
    expect(birdPosition(east, { ...bird, dx: 0 }, view, margin).x).toBe(-margin);
    east.travelled = view.width + margin;
    expect(birdPosition(east, { ...bird, dx: 0 }, view, margin).x).toBe(view.width);
    expect(flockGone(east, view, margin)).toBe(false);
    east.travelled = view.width + 2 * margin + 81;
    expect(flockGone(east, view, margin)).toBe(true);
    const west = { ...makeFlock(() => 0.99), travelled: 0 };
    expect(west.direction).toBe("west");
    expect(birdPosition(west, { ...bird, dx: 0 }, view, margin).x).toBe(view.width + margin);
    west.travelled = view.width + margin;
    expect(birdPosition(west, { ...bird, dx: 0 }, view, margin).x).toBe(0);
  });

  it("[GAME-32] the schedule waits, then sends one flock at a time across the view, then waits again", () => {
    const schedule = new FlockSchedule(() => 0);
    expect(schedule.flock).toBeUndefined();
    schedule.update(FLOCK_EVERY_MS.min - 1, view, margin);
    expect(schedule.flock).toBeUndefined();
    schedule.update(2, view, margin);
    expect(schedule.flock).toBeDefined();
    // It flies until it is gone; there is never a second one while it is in the view.
    let steps = 0;
    while (schedule.flock !== undefined && steps < 10_000) {
      schedule.update(100, view, margin);
      steps += 1;
    }
    expect(schedule.flock).toBeUndefined();
    expect(steps).toBeGreaterThan(10);
    schedule.update(FLOCK_EVERY_MS.min - 1, view, margin);
    expect(schedule.flock).toBeUndefined();
    schedule.update(2, view, margin);
    expect(schedule.flock).toBeDefined();
  });
});

describe("which effects a map gets (GAME-31 – GAME-34)", () => {
  const map = (
    atmosphere: Partial<{ clouds: boolean; birds: boolean; fog: boolean }> = {},
    borders = [square],
  ) => ({
    atmosphere: { clouds: true, birds: true, fog: true, ...atmosphere },
    obstacles: { borders },
  });
  const bird = { size: { width: 8, height: 8 }, flying: { east: [], west: [] } };

  it("[GAME-34] every effect is on by default", () => {
    expect(atmospherePlan(map(), { bird }, false)).toEqual({
      fog: true,
      clouds: true,
      birds: true,
    });
  });

  it("[GAME-34] a map property switches one effect off, and the others stay", () => {
    expect(atmospherePlan(map({ clouds: false }), { bird }, false)).toEqual({
      fog: true,
      clouds: false,
      birds: true,
    });
    expect(atmospherePlan(map({ birds: false }), { bird }, false)).toEqual({
      fog: true,
      clouds: true,
      birds: false,
    });
    expect(atmospherePlan(map({ fog: false }), { bird }, false)).toEqual({
      fog: false,
      clouds: true,
      birds: true,
    });
    expect(
      atmospherePlan(map({ clouds: false, birds: false, fog: false }), { bird }, false),
    ).toEqual({
      fog: false,
      clouds: false,
      birds: false,
    });
  });

  it("[GAME-33] a map without a border has no fog", () => {
    expect(atmospherePlan(map({}, []), { bird }, false).fog).toBe(false);
  });

  it("[GAME-32] without a bird in the world there are no birds", () => {
    expect(atmospherePlan(map(), {}, false)).toEqual({ fog: true, clouds: true, birds: false });
  });

  it("[GAME-34] with reduced motion there are no clouds and no birds, and the fog stays", () => {
    expect(atmospherePlan(map(), { bird }, true)).toEqual({
      fog: true,
      clouds: false,
      birds: false,
    });
  });
});
