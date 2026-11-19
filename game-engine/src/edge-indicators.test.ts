// @vitest-environment jsdom
// The edge indicators over the canvas (GAME-26, GAME-11): they are really gone, not only marked hidden, while a page
// is open above the game.
import { describe, expect, it } from "vitest";
import { EdgeIndicatorLayer, type IndicatorView } from "./edge-indicators.ts";

const view = (id: string): IndicatorView => ({
  id,
  kind: "object",
  label: id,
  side: "right",
  labelWidth: 40,
  x: 50,
  y: 50,
  angle: 0,
});

describe("hiding the indicators while a page is open (GAME-11)", () => {
  it("[GAME-11] a hidden indicator is not displayed, and a new one made while hidden is hidden too, until they are shown again", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const layer = new EdgeIndicatorLayer(parent, () => undefined);
    layer.update([view("a")]);
    const buttons = () => [...parent.querySelectorAll("button")];
    expect(buttons().map((button) => button.style.display)).toEqual(["flex"]);
    layer.setHidden(true);
    layer.update([view("a"), view("b")]);
    expect(buttons().map((button) => button.style.display)).toEqual(["none", "none"]);
    layer.setHidden(false);
    expect(buttons().map((button) => button.style.display)).toEqual(["flex", "flex"]);
    layer.destroy();
    parent.remove();
  });
});
