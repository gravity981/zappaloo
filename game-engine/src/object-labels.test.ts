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
import { PORTAL_ARROW_BOB, PORTAL_ARROW_HOVER, PORTAL_ARROW_RISE } from "./portal-arrow.ts";

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

  it("[GAME-41] a portal's label clears the highest point of its bobbing arrow, 4 px above it (decision 7)", () => {
    const pictureTop = 150;
    // The label is placed from the top of the picture lifted by the arrow's rise, as the scene does.
    const box = objectLabelBox({ x: 200, y: pictureTop - PORTAL_ARROW_RISE }, 80, view);
    const highestArrow = pictureTop - PORTAL_ARROW_HOVER - PORTAL_ARROW_BOB;
    expect(box.y + box.height).toBe(highestArrow - OBJECT_LABEL_GAP);
  });

  it("[GAME-41] stays inside the view: moved sideways at the edges and not above its top", () => {
    expect(objectLabelBox({ x: 5, y: 150 }, 80, view).x).toBe(OBJECT_LABEL_MARGIN);
    expect(objectLabelBox({ x: 395, y: 150 }, 80, view).x).toBe(400 - OBJECT_LABEL_MARGIN - 80);
    expect(objectLabelBox({ x: 200, y: 10 }, 80, view).y).toBe(OBJECT_LABEL_MARGIN);
  });

  it("[GAME-41][GAME-14] stays below a bar over the top of the view, whatever the object's height", () => {
    const bar = 56;
    expect(objectLabelBox({ x: 200, y: 10 }, 80, view, OBJECT_LABEL_HEIGHT, bar).y).toBe(
      bar + OBJECT_LABEL_MARGIN,
    );
    // An object low enough that its label clears the bar keeps its place.
    expect(objectLabelBox({ x: 200, y: 200 }, 80, view, OBJECT_LABEL_HEIGHT, bar).y).toBe(
      objectLabelBox({ x: 200, y: 200 }, 80, view).y,
    );
  });

  it("[GAME-41] is as wide as its text in the label's font, plus the padding, so that a word fits on one line", () => {
    // A browser measures "Programm" at 70 px: the label is that and the padding, not an estimate that is too narrow.
    const measure = (text: string) => text.length * 8.75;
    const width = objectLabelWidth("Programm", 400, measure);
    expect(width).toBe(70 + 16);
    expect(objectLabelHeight("Programm", width, measure)).toBe(OBJECT_LABEL_HEIGHT);
  });

  it("[GAME-41] has no limit but the view: a long name fits on one line whenever the view allows", () => {
    const longName = "x".repeat(100);
    const width = objectLabelWidth(longName, 1200);
    expect(width).toBe(Math.ceil(100 * 6.8) + 16);
    expect(objectLabelHeight(longName, width)).toBe(OBJECT_LABEL_HEIGHT);
  });

  it("[GAME-41] a text wider than the view takes the view's width and wraps instead of being cut off", () => {
    expect(objectLabelWidth("x".repeat(100), 200)).toBe(200 - 2 * OBJECT_LABEL_MARGIN);
    const name = "Anreise, Parkplätze und Haltestellen rund um die Kirche und den Schlossgarten";
    const width = objectLabelWidth(name, 300);
    expect(objectLabelHeight(name, width)).toBeGreaterThan(OBJECT_LABEL_HEIGHT);
    // The box stands above the object with its bottom at the same gap, however many lines it has.
    const one = objectLabelBox({ x: 200, y: 150 }, 80, view);
    const two = objectLabelBox({ x: 200, y: 150 }, width, view, objectLabelHeight(name, width));
    expect(two.y + two.height).toBe(150 - OBJECT_LABEL_GAP);
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
