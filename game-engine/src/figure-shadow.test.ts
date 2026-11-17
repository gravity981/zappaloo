import { describe, expect, it } from "vitest";
import { SHADOW_OPACITY, figureShadow } from "./figure-shadow.ts";

describe("the shadow of the player's figure (GAME-28)", () => {
  it("[GAME-28] is a 2 : 1 ellipse of 0.32 tile widths, centred on the feet", () => {
    const shadow = figureShadow({ x: 100, y: 200 }, 64, 2, 1);
    expect(shadow.width).toBeCloseTo(20.48);
    expect(shadow.height).toBeCloseTo(10.24);
    expect(shadow.x).toBe(100);
    expect(shadow.y).toBe(200);
    expect(shadow.opacity).toBe(SHADOW_OPACITY);
  });

  it("[GAME-28] lies on the device-pixel grid of the camera, as the sprite does", () => {
    // Zoom 2 at ratio 3: one device pixel is 1/6 of a world pixel.
    const shadow = figureShadow({ x: 100.1, y: 200.04 }, 64, 2, 3);
    expect(shadow.x).toBeCloseTo(100 + 1 / 6, 10);
    expect(shadow.y).toBeCloseTo(200, 10);
  });
});
