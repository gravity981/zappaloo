import { describe, expect, it } from "vitest";
import { createDefaultScene } from "./defaultScene.ts";

interface Rect {
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A canvas whose drawing calls are recorded; at height 180 one scene pixel is one canvas pixel. */
function recordingCanvas() {
  const rects: Rect[] = [];
  const gradient = { addColorStop: () => undefined };
  const context = {
    fillStyle: "",
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ color: this.fillStyle, x, y, w, h });
    },
    createLinearGradient: () => gradient,
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    rect: () => undefined,
    clip: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    closePath: () => undefined,
    fill: () => undefined,
  };
  const canvas = {
    width: 320,
    height: 180,
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 180 }),
  } as unknown as HTMLCanvasElement;
  return { canvas, rects };
}

const LEGS = "#2a2228";
/** The clothes colours of the three figures (the bodies the legs hang from). */
const CLOTHES = ["#3a6ea5", "#a5433a", "#4a8a5a"];

function frameAt(time: number) {
  const { canvas, rects } = recordingCanvas();
  const scene = createDefaultScene(canvas, false);
  if (!scene) throw new Error("no scene");
  // The first call only sets the clock; the second draws the frame at `time`.
  scene.draw(time - 1);
  rects.length = 0;
  scene.draw(time);
  return {
    legs: rects.filter((rect) => rect.color === LEGS),
    bodies: rects.filter((rect) => CLOTHES.includes(rect.color) && rect.w === 8 && rect.h === 9),
  };
}

describe("the figures behind the door (ACS-12)", () => {
  it("[ACS-12] every leg hangs from the lower edge of its body in every step of the walk", () => {
    for (const time of [0, 220, 440, 660, 880, 1100]) {
      const { legs, bodies } = frameAt(time);
      expect(bodies, `bodies at ${String(time)}`).toHaveLength(3);
      expect(legs, `legs at ${String(time)}`).toHaveLength(6);
      for (const leg of legs) {
        const body = bodies.find(
          (candidate) => leg.x >= candidate.x && leg.x + leg.w <= candidate.x + candidate.w,
        );
        expect(body, `a body above the leg at ${String(leg.x)} (t=${String(time)})`).toBeDefined();
        // The leg starts exactly where the body ends: no gap, no overlap.
        expect(leg.y, `leg of the body at ${String(body?.x)} (t=${String(time)})`).toBe(
          (body?.y ?? 0) + (body?.h ?? 0),
        );
      }
    }
  });

  it("[ACS-12] a step lifts one foot: one leg is shorter, and the other one is the next time", () => {
    const heights = (time: number) => frameAt(time).legs.map((leg) => leg.h);
    const first = heights(0);
    const second = heights(220);
    for (let figure = 0; figure < 3; figure += 1) {
      const pair = [first[figure * 2], first[figure * 2 + 1]];
      expect([...pair].sort()).toEqual([3, 5]);
      // The legs trade places in the next step.
      expect([second[figure * 2], second[figure * 2 + 1]]).toEqual([pair[1], pair[0]]);
    }
  });
});

describe("the gap in the door (ACS-12)", () => {
  /** The rectangles of a frame 400 ms after `time`, with an optional tap at `tapAt` then. */
  function frame(time: number, tapAt?: [number, number]) {
    const { canvas, rects } = recordingCanvas();
    const scene = createDefaultScene(canvas, false);
    if (!scene) throw new Error("no scene");
    scene.draw(time - 1);
    const hit = tapAt ? scene.tap(tapAt[0], tapAt[1], time - 1) : false;
    // The gap eases open over a few frames.
    for (let t = time; t < time + 400; t += 16) scene.draw(t);
    rects.length = 0;
    scene.draw(time + 400);
    return { hit, rects: JSON.stringify(rects) };
  }

  it("[ACS-12] a tap on the door opens the gap wider for a moment; a tap beside it does nothing", () => {
    // The door stands in the middle of the 320 × 180 scene.
    const onDoor = frame(1000, [160, 90]);
    const beside = frame(1000, [5, 5]);
    const untouched = frame(1000);
    expect(onDoor.hit).toBe(true);
    expect(beside.hit).toBe(false);
    expect(onDoor.rects).not.toBe(untouched.rects);
    expect(beside.rects).toBe(untouched.rects);
  });
});
