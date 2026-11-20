// @vitest-environment jsdom
// The labels over the canvas (GAME-41, GAME-11): white pills that taps go through, really gone while a page is open.
import { describe, expect, it } from "vitest";
import { ObjectLabelLayer } from "./object-label-layer.ts";

const view = (id: string, text = id) => ({ id, text, x: 10.4, y: 20.6, width: 70 });

describe("the labels of the objects in sight (GAME-41)", () => {
  it("[GAME-41] shows each label as a pill at its place, never takes a tap, and removes those that are no longer in sight", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const layer = new ObjectLabelLayer(parent);
    layer.update([view("a", "Programm"), view("b")]);
    const labels = () => [...parent.querySelectorAll<HTMLElement>("[data-testid=object-label]")];
    expect(labels().map((label) => label.textContent)).toEqual(["Programm", "b"]);
    const [first] = labels();
    expect(first?.style.pointerEvents).toBe("none");
    expect(first?.style.transform).toBe("translate(10px, 21px)");
    expect(first?.style.background).toBe("rgb(255, 255, 255)");
    layer.update([view("b")]);
    expect(labels().map((label) => label.dataset.label)).toEqual(["b"]);
    layer.destroy();
    expect(labels()).toHaveLength(0);
    parent.remove();
  });

  it("[GAME-11][GAME-41] hidden labels are not displayed, new ones made while hidden are hidden too, until shown again", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const layer = new ObjectLabelLayer(parent);
    layer.update([view("a")]);
    layer.setHidden(true);
    layer.update([view("a"), view("b")]);
    const displays = () =>
      [...parent.querySelectorAll<HTMLElement>("[data-testid=object-label]")].map(
        (label) => label.style.display,
      );
    expect(displays()).toEqual(["none", "none"]);
    layer.setHidden(false);
    expect(displays()).toEqual(["-webkit-box", "-webkit-box"]);
    layer.destroy();
    parent.remove();
  });
});
