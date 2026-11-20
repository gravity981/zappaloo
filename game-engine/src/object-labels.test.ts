// The labels that stick to objects in sight (GAME-41): where a label stands, and which of several are shown.
import { describe, expect, it } from "vitest";
import {
  OBJECT_LABEL_GAP,
  OBJECT_LABEL_HEIGHT,
  OBJECT_LABEL_MARGIN,
  chooseObjectLabels,
  objectLabelBox,
  objectLabelHeight,
  objectLabelWidth,
} from "./object-labels.ts";
import { LABEL_MAX_WIDTH } from "./indicators.ts";

const view = { width: 400, height: 300 };

describe("the place of a label (GAME-41)", () => {
  it("[GAME-41] is centred above the top of the object, the pill's bottom a few pixels over it", () => {
    const box = objectLabelBox({ x: 200, y: 150 }, 80, view);
    expect(box).toEqual({
      x: 160,
      y: 150 - OBJECT_LABEL_GAP - OBJECT_LABEL_HEIGHT,
      width: 80,
      height: OBJECT_LABEL_HEIGHT,
    });
  });

  it("[GAME-41] stays inside the view: moved sideways at the edges and not above its top", () => {
    expect(objectLabelBox({ x: 5, y: 150 }, 80, view).x).toBe(OBJECT_LABEL_MARGIN);
    expect(objectLabelBox({ x: 395, y: 150 }, 80, view).x).toBe(400 - OBJECT_LABEL_MARGIN - 80);
    expect(objectLabelBox({ x: 200, y: 10 }, 80, view).y).toBe(OBJECT_LABEL_MARGIN);
  });

  it("[GAME-41] has the width of its text, as the label of an indicator: at most 260 pixels, longer text wraps", () => {
    expect(objectLabelWidth("Programm")).toBeLessThan(
      objectLabelWidth("Wo sitze ich bei der Feier?"),
    );
    expect(objectLabelWidth("x".repeat(100))).toBe(LABEL_MAX_WIDTH);
    // On a narrow view it is no wider than the view leaves.
    expect(objectLabelWidth("x".repeat(100), 200)).toBe(200 - 2 * OBJECT_LABEL_MARGIN);
  });

  it("[GAME-41] a long name takes more lines instead of being cut off, and the box is as high as its lines", () => {
    const name = "Anreise, Parkplätze und Haltestellen rund um die Kirche und den Schlossgarten";
    const width = objectLabelWidth(name);
    expect(objectLabelHeight("Programm", objectLabelWidth("Programm"))).toBe(OBJECT_LABEL_HEIGHT);
    expect(objectLabelHeight(name, width)).toBeGreaterThan(OBJECT_LABEL_HEIGHT);
    // The box stands above the object with its bottom at the same gap, however many lines it has.
    const one = objectLabelBox({ x: 200, y: 150 }, width, view);
    const two = objectLabelBox({ x: 200, y: 150 }, width, view, objectLabelHeight(name, width));
    expect(two.y + two.height).toBe(one.y + one.height);
    expect(two.height).toBeGreaterThan(one.height);
  });
});

describe("which labels show (GAME-41)", () => {
  const candidate = (id: string, distance: number, x: number) => ({
    id,
    distance,
    box: objectLabelBox({ x, y: 150 }, 80, view),
  });

  it("[GAME-41] shows all labels that do not overlap", () => {
    expect(chooseObjectLabels([candidate("a", 50, 80), candidate("b", 90, 250)]).sort()).toEqual([
      "a",
      "b",
    ]);
  });

  it("[GAME-41] of labels that would overlap only the nearest object's shows, whatever the order", () => {
    const near = candidate("near", 40, 200);
    const far = candidate("far", 90, 230);
    expect(chooseObjectLabels([far, near])).toEqual(["near"]);
    expect(chooseObjectLabels([near, far])).toEqual(["near"]);
    // A third label that overlaps only the hidden one is shown.
    const third = candidate("third", 120, 330);
    expect(chooseObjectLabels([near, far, third]).sort()).toEqual(["near", "third"]);
  });
});
