import { describe, expect, it } from "vitest";
import {
  ICONS,
  iconDrawing,
  ownIconProblem,
  pngDataUrl,
  pngSize,
  renderIcon,
  sourceProblem,
} from "./icons.ts";
import type { IconCanvas } from "./icons.ts";
import { fakePng } from "./test-support.ts";

interface Drawn {
  size: number;
  filled: string | null;
  draw: [number, number, number, number] | null;
}

/** A canvas that records what is drawn and "encodes" a PNG of its own size. */
function recordingCanvas(log: Drawn[]) {
  return (): IconCanvas => {
    const entry: Drawn = { size: 0, filled: null, draw: null };
    log.push(entry);
    let fillStyle = "";
    const context = {
      set fillStyle(value: string) {
        fillStyle = value;
      },
      get fillStyle() {
        return fillStyle;
      },
      fillRect() {
        entry.filled = fillStyle;
      },
      drawImage(_image: unknown, x: number, y: number, w: number, h: number) {
        entry.draw = [x, y, w, h];
      },
    } as unknown as CanvasRenderingContext2D;
    const canvas: IconCanvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob(callback) {
        entry.size = canvas.width;
        callback(new Blob([fakePng(canvas.width, canvas.height)], { type: "image/png" }));
      },
    };
    return canvas;
  };
}

describe("app icons of the theme package editor (THM-10)", () => {
  it("[THM-10] the four icons and their sizes come from the package definition", () => {
    expect(ICONS.map((icon) => [icon.name, icon.size, icon.required])).toEqual([
      ["icon-192", 192, true],
      ["icon-512", 512, true],
      ["apple-touch-icon", 180, true],
      ["icon-maskable-512", 512, false],
    ]);
    expect(ICONS.filter((icon) => icon.maskable).map((icon) => icon.name)).toEqual([
      "icon-maskable-512",
    ]);
  });

  it("[THM-10] an icon shows the whole image; the maskable icon keeps it inside the central 80 %", () => {
    expect(iconDrawing(192, false)).toMatchObject({ x: 0, y: 0, width: 192, height: 192 });
    expect(iconDrawing(512, true)).toEqual({
      fillBackground: true,
      x: 51,
      y: 51,
      width: 410,
      height: 410,
    });
  });

  it("[THM-10] draws each icon at its size, and fills a background only for the maskable one", async () => {
    const log: Drawn[] = [];
    const canvas = recordingCanvas(log);
    const image = {} as CanvasImageSource;
    for (const spec of ICONS) {
      const png = await renderIcon(image, spec, "#7a3b2e", canvas);
      expect(pngSize(png)).toEqual({ width: spec.size, height: spec.size });
    }
    expect(log.map((entry) => entry.size)).toEqual([192, 512, 180, 512]);
    expect(log.map((entry) => entry.filled)).toEqual([null, null, null, "#7a3b2e"]);
    expect(log[3]?.draw).toEqual([51, 51, 410, 410]);
    expect(log[0]?.draw).toEqual([0, 0, 192, 192]);
  });

  it("[THM-10] reads the size of a PNG and refuses what is no PNG", () => {
    expect(pngSize(fakePng(192, 192))).toEqual({ width: 192, height: 192 });
    expect(pngSize(new Uint8Array(40))).toBeUndefined();
    expect(pngSize(new TextEncoder().encode("GIF89a"))).toBeUndefined();
  });

  it("[THM-10] an icon of its own must be a PNG of exactly the icon's size, worded as the validator does", () => {
    const [icon192] = ICONS;
    if (icon192 === undefined) throw new Error("no icons");
    expect(ownIconProblem(icon192, fakePng(192, 192))).toBeUndefined();
    expect(ownIconProblem(icon192, fakePng(200, 200))).toBe(
      "icon-192: wrong size (200 × 200 instead of 192 × 192)",
    );
    expect(ownIconProblem(icon192, new Uint8Array(30))).toBe("icon-192: not a PNG image");
  });

  it("[THM-10] the source image is square and at least 512 px", () => {
    expect(sourceProblem(1024, 1024)).toBeUndefined();
    expect(sourceProblem(512, 512)).toBeUndefined();
    expect(sourceProblem(1024, 768)).toMatch(/must be square \(it is 1024 × 768\)/);
    expect(sourceProblem(400, 400)).toMatch(/at least 512 px/);
  });

  it("[THM-10] a thumbnail is a data URL of the PNG", () => {
    expect(pngDataUrl(fakePng(1, 1))).toMatch(/^data:image\/png;base64,iVBORw0KGgo/);
  });
});
