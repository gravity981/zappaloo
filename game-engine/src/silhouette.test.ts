import { describe, expect, it } from "vitest";
import {
  CoverIndex,
  coveredShare,
  ellipsePoints,
  MAX_SAMPLES,
  opaquePoints,
  silhouetteShows,
  thinOut,
} from "./silhouette.ts";

describe("what covers a figure (GAME-42)", () => {
  const wall = {
    bounds: { x: 100, y: 100, width: 50, height: 50 },
    depth: 500,
    opaqueAt: (x: number) => x < 125,
  };
  const index = new CoverIndex([wall]);

  it("[GAME-42] only an opaque pixel of a picture in front of the figure covers it", () => {
    expect(index.covers({ x: 110, y: 120 }, 400)).toBe(true);
    // Transparent there, outside the picture, or behind the figure.
    expect(index.covers({ x: 140, y: 120 }, 400)).toBe(false);
    expect(index.covers({ x: 90, y: 120 }, 400)).toBe(false);
    expect(index.covers({ x: 110, y: 120 }, 600)).toBe(false);
  });

  it("[GAME-42] finds a picture that spans several buckets from any of them", () => {
    const wide = new CoverIndex([
      { bounds: { x: 0, y: 0, width: 600, height: 20 }, depth: 1, opaqueAt: () => true },
    ]);
    expect(wide.covers({ x: 590, y: 10 }, 0)).toBe(true);
    expect(wide.covers({ x: 300, y: 10 }, 0)).toBe(true);
  });
});

describe("when a silhouette shows (GAME-42)", () => {
  it("[GAME-42] a figure shows it when more than two thirds are covered, not at exactly two thirds", () => {
    expect(silhouetteShows(0.5, "mostly")).toBe(false);
    expect(silhouetteShows(2 / 3, "mostly")).toBe(false);
    expect(silhouetteShows(0.7, "mostly")).toBe(true);
  });

  it("[GAME-42] the fallback shows it only when the whole figure is covered", () => {
    expect(silhouetteShows(0.9, "whole")).toBe(false);
    expect(silhouetteShows(1, "whole")).toBe(true);
  });

  it("[GAME-42] the target marker shows it as soon as any part is covered", () => {
    expect(silhouetteShows(0, "any")).toBe(false);
    expect(silhouetteShows(1 / 12, "any")).toBe(true);
  });

  it("[GAME-42] measures the covered share of the points; no points are not covered", () => {
    const points = [0, 1, 2, 3].map((x) => ({ x, y: 0 }));
    expect(coveredShare(points, (point) => point.x < 3)).toBe(0.75);
    expect(coveredShare([], () => true)).toBe(0);
  });
});

describe("the points laid on a figure (GAME-42)", () => {
  it("[GAME-42] only the opaque pixels of the picture count, and never more than the limit", () => {
    const points = opaquePoints(64, 64, (x) => (x < 32 ? 255 : 0), 1);
    expect(points.length).toBeLessThanOrEqual(MAX_SAMPLES);
    expect(points.every((point) => point.x < 32)).toBe(true);
    expect(opaquePoints(8, 8, () => 0)).toEqual([]);
  });

  it("[GAME-42] thinning keeps the spread of the points", () => {
    const many = Array.from({ length: 100 }, (_, index) => index);
    const thin = thinOut(many, 10);
    expect(thin).toHaveLength(10);
    expect(thin[0]).toBeLessThan(10);
    expect(thin.at(-1)).toBeGreaterThan(89);
    expect(thinOut([1, 2], 10)).toEqual([1, 2]);
  });

  it("[GAME-42] the marker's outline has points all around the ellipse", () => {
    const points = ellipsePoints({ x: 10, y: 10 }, 8, 4, 4);
    expect(points[0]).toEqual({ x: 18, y: 10 });
    expect(points[2]?.x).toBeCloseTo(2, 10);
  });
});
