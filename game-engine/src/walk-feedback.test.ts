import { describe, expect, it } from "vitest";
import {
  IDLE_GLOW_STRENGTH,
  NO_FEEDBACK,
  PULSE_GLOW_STRENGTH,
  nextFeedback,
  objectGlowStrength,
  type WalkFeedback,
} from "./walk-feedback.ts";

const target = { x: 120, y: 80 };

describe("the marker and the glow of a walk (GAME-24, GAME-25)", () => {
  it("[GAME-24] a walk shows the marker at its target while waypoints are left", () => {
    const walking = nextFeedback(NO_FEEDBACK, { type: "walk", target });
    expect(walking).toEqual({ marker: target, glow: undefined });
    expect(nextFeedback(walking, { type: "frame", waypoints: 2, keysHeld: false })).toEqual(
      walking,
    );
  });

  it("[GAME-24] the marker is gone when the avatar arrives, when the walk is stopped and when the arrow keys take over", () => {
    const walking = nextFeedback(NO_FEEDBACK, { type: "walk", target });
    expect(nextFeedback(walking, { type: "frame", waypoints: 0, keysHeld: false })).toEqual(
      NO_FEEDBACK,
    );
    expect(nextFeedback(walking, { type: "stopped" })).toEqual(NO_FEEDBACK);
    expect(nextFeedback(walking, { type: "frame", waypoints: 3, keysHeld: true })).toEqual(
      NO_FEEDBACK,
    );
  });

  it("[GAME-24] a new walk moves the marker to its target", () => {
    const first = nextFeedback(NO_FEEDBACK, { type: "walk", target });
    const next = nextFeedback(first, { type: "walk", target: { x: 5, y: 6 } });
    expect(next.marker).toEqual({ x: 5, y: 6 });
  });

  it("[GAME-25] a walk to an object or a portal makes it glow until the walk ends", () => {
    const walking = nextFeedback(NO_FEEDBACK, { type: "walk", target, glow: 7 });
    expect(walking.glow).toBe(7);
    expect(nextFeedback(walking, { type: "frame", waypoints: 1, keysHeld: false }).glow).toBe(7);
    expect(
      nextFeedback(walking, { type: "frame", waypoints: 0, keysHeld: false }).glow,
    ).toBeUndefined();
    expect(nextFeedback(walking, { type: "stopped" }).glow).toBeUndefined();
  });

  it("[GAME-25] a tap that starts no walk ends the glow of the walk to an object, which the walk no longer serves", () => {
    const walking: WalkFeedback = nextFeedback(NO_FEEDBACK, { type: "walk", target, glow: 7 });
    expect(nextFeedback(walking, { type: "tap" })).toEqual({ marker: target, glow: undefined });
    const plain = nextFeedback(NO_FEEDBACK, { type: "walk", target });
    expect(nextFeedback(plain, { type: "tap" })).toBe(plain);
  });

  it("[GAME-29][GAME-25] an object glows steadily, and swells and fades once per second while the avatar walks to it", () => {
    expect(objectGlowStrength(false, 0)).toBe(IDLE_GLOW_STRENGTH);
    expect(objectGlowStrength(false, 777)).toBe(IDLE_GLOW_STRENGTH);
    expect(objectGlowStrength(true, 0)).toBeCloseTo(IDLE_GLOW_STRENGTH);
    expect(objectGlowStrength(true, 500)).toBeCloseTo(PULSE_GLOW_STRENGTH);
    expect(objectGlowStrength(true, 1000)).toBeCloseTo(IDLE_GLOW_STRENGTH);
    expect(objectGlowStrength(true, 1500)).toBeCloseTo(PULSE_GLOW_STRENGTH);
  });
});
