import { describe, expect, it } from "vitest";
import { sceneIsStale, staleMessage } from "./stale-scene.ts";

describe("the out-of-date scene of the preview (MAP-18)", () => {
  it("[MAP-18] the scene on show is out of date while the changed package is validated or loaded", () => {
    expect(sceneIsStale({ hasScene: true, loading: false, validating: true })).toBe(true);
    expect(sceneIsStale({ hasScene: true, loading: true, validating: false })).toBe(true);
    expect(sceneIsStale({ hasScene: true, loading: true, validating: true })).toBe(true);
  });

  it("[MAP-18] it is current again once nothing loads, and a first load has no scene to grey out", () => {
    expect(sceneIsStale({ hasScene: true, loading: false, validating: false })).toBe(false);
    expect(sceneIsStale({ hasScene: false, loading: true, validating: true })).toBe(false);
  });

  it("[MAP-18] the overlay names the phase: validating first, then loading", () => {
    expect(staleMessage({ loading: false })).toMatch(/validating/);
    expect(staleMessage({ loading: true })).toMatch(/Loading/);
  });
});
