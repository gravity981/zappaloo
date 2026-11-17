import { describe, expect, it } from "vitest";
import {
  INDICATOR_INSET,
  INDICATOR_TOUCH_SIZE,
  MAX_INDICATORS,
  indicatorInsets,
  indicatorPlace,
  isOutside,
  overlaps,
  selectIndicators,
  wantsIndicator,
} from "./indicators.ts";

describe("which objects get an indicator (GAME-26)", () => {
  it("[GAME-26] a clickable object with an action and a portal with a target do", () => {
    expect(wantsIndicator({ kind: "object", hidden: false, hasAction: true })).toBe(true);
    expect(wantsIndicator({ kind: "portal", hasTarget: true })).toBe(true);
  });

  it("[GAME-26] an easter egg, an object without an action and a portal without a target do not", () => {
    expect(wantsIndicator({ kind: "object", hidden: true, hasAction: true })).toBe(false);
    expect(wantsIndicator({ kind: "object", hidden: false, hasAction: false })).toBe(false);
    expect(wantsIndicator({ kind: "portal", hasTarget: false })).toBe(false);
  });
});

describe("the indicators of the game preview (GAME-26, MAP-18)", () => {
  it("[GAME-26] the preview, which cannot assign actions, gives every clickable object but an easter egg an indicator", () => {
    expect(wantsIndicator({ kind: "object", hidden: false, hasAction: false }, true)).toBe(true);
    expect(wantsIndicator({ kind: "object", hidden: true, hasAction: false }, true)).toBe(false);
    expect(wantsIndicator({ kind: "portal", hasTarget: false }, true)).toBe(false);
  });
});

describe("whether an object is outside the view (GAME-26)", () => {
  const view = { x: 100, y: 100, width: 200, height: 150 };

  it("[GAME-26] bounds entirely outside the view are outside, on every side", () => {
    expect(isOutside({ x: 0, y: 120, width: 50, height: 50 }, view)).toBe(true);
    expect(isOutside({ x: 320, y: 120, width: 50, height: 50 }, view)).toBe(true);
    expect(isOutside({ x: 150, y: 0, width: 50, height: 50 }, view)).toBe(true);
    expect(isOutside({ x: 150, y: 300, width: 50, height: 50 }, view)).toBe(true);
  });

  it("[GAME-26] bounds that reach into the view, or lie inside it, are not outside", () => {
    expect(isOutside({ x: 60, y: 120, width: 50, height: 50 }, view)).toBe(false);
    expect(isOutside({ x: 150, y: 120, width: 20, height: 20 }, view)).toBe(false);
    expect(isOutside({ x: 90, y: 90, width: 400, height: 400 }, view)).toBe(false);
  });
});

describe("where an indicator sits (GAME-26)", () => {
  const phone = { width: 390, height: 664 };
  const desktop = { width: 1280, height: 800 };
  const centre = INDICATOR_INSET + INDICATOR_TOUCH_SIZE / 2;

  it("[GAME-26] it sits on the line from the avatar to the object, 12 px inside the edge, on a phone-sized view", () => {
    const avatar = { x: 195, y: 332 };
    // An object far to the right and a bit down.
    const place = indicatorPlace(avatar, { x: 1195, y: 532 }, phone);
    expect(place.point.x).toBeCloseTo(phone.width - centre);
    // On the line from the avatar to the object.
    const slope = (532 - 332) / (1195 - 195);
    expect(place.point.y).toBeCloseTo(332 + (place.point.x - 195) * slope);
    expect(place.angle).toBeCloseTo(Math.atan2(200, 1000));
    // Its touch area lies 12 px from the edge.
    expect(phone.width - (place.point.x + INDICATOR_TOUCH_SIZE / 2)).toBeCloseTo(INDICATOR_INSET);
  });

  it("[GAME-26] it sits on the nearest edge the line leaves through: above, below, left and right", () => {
    const avatar = { x: 640, y: 400 };
    expect(indicatorPlace(avatar, { x: 640, y: -2000 }, desktop).point).toEqual({
      x: 640,
      y: centre,
    });
    expect(indicatorPlace(avatar, { x: 640, y: 3000 }, desktop).point).toEqual({
      x: 640,
      y: desktop.height - centre,
    });
    expect(indicatorPlace(avatar, { x: -3000, y: 400 }, desktop).point).toEqual({
      x: centre,
      y: 400,
    });
    expect(indicatorPlace(avatar, { x: 5000, y: 400 }, desktop).point).toEqual({
      x: desktop.width - centre,
      y: 400,
    });
  });

  it("[GAME-26][GAME-14] below a game bar that covers the top of the view, it sits under the bar", () => {
    const bar = 56;
    const place = indicatorPlace(
      { x: 640, y: 400 },
      { x: 640, y: -2000 },
      desktop,
      indicatorInsets(bar),
    );
    expect(place.point.y).toBeCloseTo(bar + centre);
    // Its touch area starts 12 px below the bar.
    expect(place.point.y - INDICATOR_TOUCH_SIZE / 2 - bar).toBeCloseTo(INDICATOR_INSET);
  });

  it("[GAME-26] an avatar standing at the edge has the indicator moved into the area, still towards the object", () => {
    const place = indicatorPlace({ x: 2, y: 332 }, { x: -500, y: 332 }, phone);
    expect(place.point).toEqual({ x: centre, y: 332 });
    expect(place.angle).toBeCloseTo(Math.PI);
  });
});

describe("which indicators are shown (GAME-26)", () => {
  const at = (x: number, y: number, distance: number, id = "") => ({
    point: { x, y },
    distance,
    id,
  });

  it("[GAME-26] at most 6 are shown, the nearest first", () => {
    const candidates = Array.from({ length: 9 }, (_, index) =>
      at(index * 100, 50, 900 - index * 10, String(index)),
    );
    const shown = selectIndicators(candidates);
    expect(shown).toHaveLength(MAX_INDICATORS);
    // The nearest are the ones with the highest index here (the smallest distance).
    expect(shown.map((item) => item.id)).toEqual(["8", "7", "6", "5", "4", "3"]);
  });

  it("[GAME-26] of two that would overlap only the nearer one is shown, whatever the order of the input", () => {
    const near = at(100, 100, 200, "near");
    const far = at(120, 110, 500, "far");
    expect(selectIndicators([far, near]).map((item) => item.id)).toEqual(["near"]);
    expect(selectIndicators([near, far]).map((item) => item.id)).toEqual(["near"]);
  });

  it("[GAME-26] indicators that do not touch are all shown; touching areas overlap from less than 44 px apart", () => {
    expect(overlaps({ x: 0, y: 0 }, { x: 43, y: 43 })).toBe(true);
    expect(overlaps({ x: 0, y: 0 }, { x: 44, y: 0 })).toBe(false);
    expect(overlaps({ x: 0, y: 0 }, { x: 0, y: 44 })).toBe(false);
    const shown = selectIndicators([at(0, 0, 1), at(44, 0, 2), at(0, 44, 3)]);
    expect(shown).toHaveLength(3);
  });

  it("[GAME-26] an indicator hidden behind a nearer one leaves room for the next one", () => {
    const shown = selectIndicators([at(0, 0, 1, "a"), at(10, 10, 2, "hidden"), at(200, 0, 3, "b")]);
    expect(shown.map((item) => item.id)).toEqual(["a", "b"]);
  });
});
