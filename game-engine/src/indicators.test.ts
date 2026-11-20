import { describe, expect, it } from "vitest";
import {
  INDICATOR_INSET,
  LABEL_GAP,
  LABEL_MAX_LINES,
  LABEL_PADDING,
  labelLines,
  boxesOverlap,
  indicatorBox,
  labelSide,
  labelWidth,
  INDICATOR_TOUCH_SIZE,
  MAX_INDICATORS,
  indicatorInsets,
  indicatorPlace,
  isOutside,
  overlaps,
  selectIndicators,
  indicatorShown,
  portalWantsIndicator,
} from "./indicators.ts";

describe("which objects get an indicator (GAME-26, GAME-41)", () => {
  it("[GAME-26][GAME-41] an object or NPC does unless its setting showIndicator says false, whatever else it is", () => {
    const settings = new Map([
      ["kirche/glocke", false],
      ["kirche/altar", true],
    ]);
    expect(indicatorShown(settings, "kirche/altar")).toBe(true);
    expect(indicatorShown(settings, "kirche/glocke")).toBe(false);
    // Without a setting it is on: also for an easter egg, an object without an action and one that shows a dialogue.
    expect(indicatorShown(settings, "kirche/osterei")).toBe(true);
    expect(indicatorShown(new Map(), "kirche/pastor")).toBe(true);
    // The setting is by map and name.
    expect(indicatorShown(settings, "garten/glocke")).toBe(true);
  });

  it("[GAME-26] a portal with a target does, one without a target does not", () => {
    expect(portalWantsIndicator(true)).toBe(true);
    expect(portalWantsIndicator(false)).toBe(false);
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

describe("the labels of the indicators (GAME-26)", () => {
  const phone = { width: 390, height: 664 };

  it("[GAME-26] the label is on the side of the indicator that has more room in the view", () => {
    expect(labelSide({ x: 40, y: 300 }, phone.width)).toBe("right");
    expect(labelSide({ x: 350, y: 300 }, phone.width)).toBe("left");
    expect(labelSide({ x: 195, y: 34 }, phone.width)).toBe("right");
    expect(labelSide({ x: 196, y: 34 }, phone.width)).toBe("left");
  });

  it("[GAME-26] a label is as wide as its text in the label's font, and only the room beside the indicator bounds it", () => {
    const point = { x: 40, y: 300 };
    // A browser measures "Programm" at 70 px: the label is that plus the padding, so the word stays on one line.
    const measure = (text: string) => text.length * 8.75;
    expect(labelWidth("Programm", point, phone.width, "right", measure)).toBe(70 + LABEL_PADDING);
    // A long name is no longer capped at 260 px: the view's room is the only limit.
    const long = "Programm für den ganzen Tag, mit allen Beiträgen";
    const room = phone.width - point.x - 22 - LABEL_GAP - 12;
    expect(labelWidth(long, point, phone.width, "right", measure)).toBe(room);
    // Near the middle of the narrow view, the room beside the circle is what is left after the gap and the inset.
    const middle = { x: 150, y: 300 };
    const middleRoom = phone.width - middle.x - 22 - LABEL_GAP - 12;
    expect(labelWidth("x".repeat(60), middle, phone.width, "right")).toBe(middleRoom);
    // No room, no label.
    expect(labelWidth("Portal", { x: 360, y: 300 }, phone.width, "right")).toBe(0);
  });

  it("[GAME-26] a long name wraps onto up to three lines and is not cut off before that", () => {
    // A name of a page that is far longer than the old limit of one line of 160 pixels.
    const name = "Anreise, Parkplätze und Haltestellen rund um die Kirche";
    const wide = 400;
    const measure = (text: string) => text.length * 8.75;
    expect(labelLines("Programm", wide, measure)).toBe(1);
    expect(labelLines(name, 260, measure)).toBe(2);
    // Narrower, it takes more lines; beyond three lines only is it cut off.
    expect(labelLines(name, 140, measure)).toBe(3);
    expect(labelLines("x".repeat(500), wide, measure)).toBe(LABEL_MAX_LINES);
    expect(labelLines("", wide, measure)).toBe(1);
  });

  it("[GAME-26] the space of an indicator is its touch area with the label beside it, on the label's side", () => {
    const point = { x: 100, y: 200 };
    expect(indicatorBox(point, "right", 60)).toEqual({
      x: 78,
      y: 178,
      width: 44 + LABEL_GAP + 60,
      height: 44,
    });
    expect(indicatorBox(point, "left", 60)).toEqual({
      x: 78 - LABEL_GAP - 60,
      y: 178,
      width: 44 + LABEL_GAP + 60,
      height: 44,
    });
    // Without a label it is the touch area alone.
    expect(indicatorBox(point, "right", 0)).toEqual({ x: 78, y: 178, width: 44, height: 44 });
  });

  it("[GAME-26] two indicators whose labels would overlap show only the nearer one, though their circles are apart", () => {
    const first = {
      point: { x: 40, y: 100 },
      distance: 100,
      id: "near",
      box: indicatorBox({ x: 40, y: 100 }, "right", 100),
    };
    // 60 px further along the edge: the circles do not touch, but the first label reaches into this one.
    const second = {
      point: { x: 100, y: 110 },
      distance: 300,
      id: "far",
      box: indicatorBox({ x: 100, y: 110 }, "right", 60),
    };
    expect(selectIndicators([second, first]).map((item) => item.id)).toEqual(["near"]);
    // Further apart, both stay.
    const third = {
      ...second,
      point: { x: 100, y: 200 },
      box: indicatorBox({ x: 100, y: 200 }, "right", 60),
    };
    expect(selectIndicators([third, first]).map((item) => item.id)).toEqual(["near", "far"]);
    expect(boxesOverlap(first.box, second.box)).toBe(true);
    expect(boxesOverlap(first.box, third.box)).toBe(false);
  });
});
